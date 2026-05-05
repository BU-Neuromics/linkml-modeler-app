/**
 * Web platform smoke tests.
 *
 * Tests run in jsdom so FSAA is unavailable; we validate the fallback paths
 * and basic platform contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── LightningFS mock ──────────────────────────────────────────────────────────
// isomorphic-git and LightningFS use IndexedDB / OPFS internally.
// In jsdom neither is available so we mock the module.
// mockPfs is hoisted so FSAA import tests can inspect writeFile calls.
const mockPfs = vi.hoisted(() => ({
  readFile: vi.fn().mockResolvedValue('content'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
}));

vi.mock('@isomorphic-git/lightning-fs', () => ({
  default: vi.fn(function () {
    return { promises: mockPfs };
  }),
}));

vi.mock('isomorphic-git', () => ({
  default: {
    resolveRef: vi.fn().mockRejectedValue(new Error('not a git repo')),
    currentBranch: vi.fn().mockResolvedValue('main'),
    statusMatrix: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue('abc1234'),
    push: vi.fn().mockResolvedValue({}),
    pull: vi.fn().mockResolvedValue({}),
    log: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('isomorphic-git/http/web', () => ({ default: {} }));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebPlatform', () => {
  let platform: Awaited<ReturnType<typeof import('../platform/WebPlatform.js').WebPlatform.prototype.init>> extends void ? InstanceType<typeof import('../platform/WebPlatform.js').WebPlatform> : never;

  beforeEach(async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    platform = new WebPlatform() as typeof platform;
  });

  it('has platform = "web"', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    expect(p.platform).toBe('web');
  });

  it('gitAvailable is false by default', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    expect(p.gitAvailable).toBe(false);
  });

  it('init() sets gitAvailable based on git.resolveRef', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    // resolveRef is mocked to throw → gitAvailable stays false
    await p.init('/some/repo');
    expect(p.gitAvailable).toBe(false);
  });

  it('listDirectory returns empty array when dir is empty', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.listDirectory('/');
    expect(Array.isArray(result)).toBe(true);
  });

  it('gitLog returns empty array when git unavailable', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const log = await p.gitLog('/repo', 10);
    expect(log).toEqual([]);
  });

  it('gitStatus returns null when git unavailable', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const status = await p.gitStatus('/repo');
    expect(status).toBeNull();
  });

  it('gitPull returns null when git unavailable', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.gitPull('/repo');
    expect(result).toBeNull();
  });

  it('storeCredential and getCredential round-trip in-memory (not in localStorage)', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.storeCredential('github-token', 'tok_abc123');
    const val = await p.getCredential('github-token');
    expect(val).toBe('tok_abc123');
    // Must NOT be written to localStorage — security requirement (T2 #9)
    expect(localStorage.getItem('linkml-editor:github-token')).toBeNull();
  });

  it('deleteCredential removes key from in-memory store', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.storeCredential('github-token', 'tok_abc123');
    await p.deleteCredential('github-token');
    const val = await p.getCredential('github-token');
    expect(val).toBeNull();
  });

  it('getCredential returns null for missing key', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const val = await p.getCredential('nonexistent');
    expect(val).toBeNull();
  });

  it('credentials are isolated per WebPlatform instance', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p1 = new WebPlatform();
    const p2 = new WebPlatform();
    await p1.storeCredential('github-token', 'tok_p1');
    expect(await p2.getCredential('github-token')).toBeNull();
  });

  it('setSetting and getSetting round-trip via localStorage with settings namespace', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.setSetting('cloneDir', '/home/user/repos');
    const val = await p.getSetting('cloneDir');
    expect(val).toBe('/home/user/repos');
    expect(localStorage.getItem('linkml-editor-settings:cloneDir')).toBe('/home/user/repos');
  });

  it('credentials (in-memory) and settings (localStorage) do not interfere', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.storeCredential('key', 'cred-value');
    await p.setSetting('key', 'setting-value');
    expect(await p.getCredential('key')).toBe('cred-value');
    expect(await p.getSetting('key')).toBe('setting-value');
  });

  it('gitClone returns error when CORS proxy is not configured', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    // VITE_GIT_CORS_PROXY is undefined in test env
    const result = await p.gitClone('https://github.com/org/repo', '/dest');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CORS proxy/i);
  });
});

describe('ElectronPlatform', () => {
  const mockElectronAPI = {
    openFile: vi.fn(),
    saveFile: vi.fn(),
    openDirectory: vi.fn(),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn(),
    listDirectory: vi.fn().mockResolvedValue([]),
    gitAvailable: vi.fn().mockResolvedValue(false),
    gitStatus: vi.fn().mockResolvedValue(null),
    gitStage: vi.fn(),
    gitCommit: vi.fn().mockResolvedValue(null),
    gitPush: vi.fn().mockResolvedValue({ ok: true }),
    gitPull: vi.fn().mockResolvedValue({ ok: true }),
    gitLog: vi.fn().mockResolvedValue([]),
    gitClone: vi.fn().mockResolvedValue({ ok: true, destPath: '/dest' }),
    storeCredential: vi.fn().mockResolvedValue(undefined),
    getCredential: vi.fn().mockResolvedValue('tok_test'),
    deleteCredential: vi.fn().mockResolvedValue(undefined),
    getSetting: vi.fn().mockResolvedValue('/home/user/repos'),
    setSetting: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    (globalThis as unknown as Record<string, unknown>).window = { electronAPI: mockElectronAPI };
  });

  it('has platform = "electron"', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    expect(p.platform).toBe('electron');
  });

  it('getCredential delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    const val = await p.getCredential('github-token');
    expect(mockElectronAPI.getCredential).toHaveBeenCalledWith('github-token');
    expect(val).toBe('tok_test');
  });

  it('storeCredential delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    await p.storeCredential('github-token', 'tok_abc');
    expect(mockElectronAPI.storeCredential).toHaveBeenCalledWith('github-token', 'tok_abc');
  });

  it('deleteCredential delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    await p.deleteCredential('github-token');
    expect(mockElectronAPI.deleteCredential).toHaveBeenCalledWith('github-token');
  });

  it('getSetting delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    const val = await p.getSetting('cloneDir');
    expect(mockElectronAPI.getSetting).toHaveBeenCalledWith('cloneDir');
    expect(val).toBe('/home/user/repos');
  });

  it('setSetting delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    await p.setSetting('cloneDir', '/tmp/repos');
    expect(mockElectronAPI.setSetting).toHaveBeenCalledWith('cloneDir', '/tmp/repos');
  });

  it('gitPull delegates to bridge', async () => {
    const { ElectronPlatform } = await import('../platform/ElectronPlatform.js');
    const p = new ElectronPlatform();
    const result = await p.gitPull('/some/repo');
    expect(mockElectronAPI.gitPull).toHaveBeenCalledWith('/some/repo');
    expect(result).toEqual({ ok: true });
  });
});

// ── WebPlatform.openDirectory FSAA import tests ───────────────────────────────
// These tests verify the fix for PTS-135: openDirectory() must import yaml files
// from the native FileSystemDirectoryHandle into LightningFS so that subsequent
// listDirectory/readFile calls (and re-opens from Recent Projects) can find them.

describe('WebPlatform.openDirectory (FSAA import)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockPfs.writeFile.mockClear();
    mockPfs.mkdir.mockClear();
  });

  afterEach(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w['showDirectoryPicker'];
    delete w['showOpenFilePicker'];
    delete w['showSaveFilePicker'];
  });

  it('imports yaml files into LightningFS and returns the OPFS path', async () => {
    const yamlContent = 'id: https://example.org/test\nclasses:';
    const mockFileHandle = {
      kind: 'file' as const,
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue(yamlContent) }),
    };
    const mockDirHandle = {
      name: 'my-schemas',
      entries: async function* () {
        yield ['schema.yaml', mockFileHandle] as [string, typeof mockFileHandle];
        yield ['readme.txt', { kind: 'file' as const, getFile: vi.fn() }] as [string, unknown];
      },
    };

    Object.assign(window, {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker: vi.fn().mockResolvedValue(mockDirHandle),
    });

    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.openDirectory();

    expect(result).toBe('/my-schemas');
    expect(mockFileHandle.getFile).toHaveBeenCalled();
    expect(mockPfs.writeFile).toHaveBeenCalledWith(
      '/my-schemas/schema.yaml',
      yamlContent,
      'utf8',
    );
  });

  it('skips non-yaml files and does not call writeFile for them', async () => {
    const mockTxtHandle = { kind: 'file' as const, getFile: vi.fn() };
    const mockDirHandle = {
      name: 'docs',
      entries: async function* () {
        yield ['readme.txt', mockTxtHandle] as [string, typeof mockTxtHandle];
        yield ['notes.md', { kind: 'file' as const, getFile: vi.fn() }] as [string, unknown];
      },
    };

    Object.assign(window, {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker: vi.fn().mockResolvedValue(mockDirHandle),
    });

    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.openDirectory();

    expect(result).toBe('/docs');
    expect(mockTxtHandle.getFile).not.toHaveBeenCalled();
    expect(mockPfs.writeFile).not.toHaveBeenCalled();
  });

  it('skips directory entries (only imports files)', async () => {
    const mockSubDirHandle = { kind: 'directory' as const };
    const mockYamlHandle = {
      kind: 'file' as const,
      getFile: vi.fn().mockResolvedValue({ text: vi.fn().mockResolvedValue('id: x\nclasses:') }),
    };
    const mockDirHandle = {
      name: 'project',
      entries: async function* () {
        yield ['subdir', mockSubDirHandle] as [string, typeof mockSubDirHandle];
        yield ['schema.yml', mockYamlHandle] as [string, typeof mockYamlHandle];
      },
    };

    Object.assign(window, {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker: vi.fn().mockResolvedValue(mockDirHandle),
    });

    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.openDirectory();

    expect(result).toBe('/project');
    expect(mockPfs.writeFile).toHaveBeenCalledTimes(1);
    expect(mockPfs.writeFile).toHaveBeenCalledWith('/project/schema.yml', 'id: x\nclasses:', 'utf8');
  });

  it('returns null when user cancels the picker (AbortError)', async () => {
    Object.assign(window, {
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
      showDirectoryPicker: vi.fn().mockRejectedValue(Object.assign(new Error('user cancelled'), { name: 'AbortError' })),
    });

    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    const result = await p.openDirectory();

    expect(result).toBeNull();
    expect(mockPfs.writeFile).not.toHaveBeenCalled();
  });
});
