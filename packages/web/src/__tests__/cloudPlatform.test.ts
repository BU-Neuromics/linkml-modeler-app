/**
 * Unit tests for CloudPlatform and WebProjectRegistry.
 * Mocks isomorphic-git + GitHub API fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlatformAPI } from '@linkml-editor/core';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@isomorphic-git/lightning-fs', () => ({
  default: vi.fn(function () {
    return { promises: {} };
  }),
}));
vi.mock('isomorphic-git', () => ({ default: {} }));
vi.mock('isomorphic-git/http/web', () => ({ default: {} }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLocal() {
  const files = new Map<string, string>();
  const credentials = new Map<string, string>();
  const settings = new Map<string, string>();

  return {
    platform: 'web' as const,
    gitAvailable: true,
    files,
    openFile: vi.fn(),
    saveFile: vi.fn(),
    openDirectory: vi.fn(),
    readFile: vi.fn(async (path: string) => {
      const val = files.get(path);
      if (!val) throw new Error(`ENOENT: ${path}`);
      return val;
    }),
    writeFile: vi.fn(async (path: string, content: string) => { files.set(path, content); }),
    listDirectory: vi.fn(async () => []),
    initGit: vi.fn(async () => true),
    gitCreateRepo: vi.fn(async () => true),
    gitSetRemote: vi.fn(async () => {}),
    gitReadConfig: vi.fn(async () => ({})),
    getProjectsPath: vi.fn(async () => '/projects'),
    gitStatus: vi.fn(async () => ({
      branch: 'main', aheadCount: 0, behindCount: 0,
      stagedFiles: [], unstagedFiles: [], untrackedFiles: ['file.yaml'],
    })),
    gitStage: vi.fn(async () => {}),
    gitUnstage: vi.fn(async () => {}),
    gitCommit: vi.fn(async () => 'abc1234'),
    gitPush: vi.fn(async () => ({ ok: true })),
    gitPull: vi.fn(async () => ({ ok: true })),
    gitLog: vi.fn(async () => []),
    gitCheckout: vi.fn(async () => {}),
    gitClone: vi.fn(async (_url: string, destPath: string) => ({ ok: true, destPath })),
    storeCredential: vi.fn(async (k: string, v: string) => { credentials.set(k, v); }),
    getCredential: vi.fn(async (k: string) => credentials.get(k) ?? null),
    deleteCredential: vi.fn(async (k: string) => { credentials.delete(k); }),
    getSetting: vi.fn(async (k: string) => settings.get(k) ?? null),
    setSetting: vi.fn(async (k: string, v: string) => { settings.set(k, v); }),
  };
}

function mockGitHubFetch(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation(async (url: string) => {
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => body,
        };
      }
    }
    return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({ message: 'Not Found' }) };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WebProjectRegistry', () => {
  let WebProjectRegistry: typeof import('../platform/ProjectRegistry.js').WebProjectRegistry;

  beforeEach(async () => {
    // Clear localStorage mock between tests
    localStorage.clear();
    ({ WebProjectRegistry } = await import('../platform/ProjectRegistry.js'));
  });

  it('starts empty', () => {
    const reg = new WebProjectRegistry();
    expect(reg.getAll()).toEqual([]);
  });

  it('addOrUpdate and getAll', () => {
    const reg = new WebProjectRegistry();
    const entry = {
      repoUrl: 'https://github.com/user/repo',
      repoName: 'repo',
      schemaPath: 'schema',
      persistLayout: false,
      localPath: '/github-projects/user/repo',
      lastOpenedAt: new Date().toISOString(),
    };
    reg.addOrUpdate(entry);
    expect(reg.getAll()).toHaveLength(1);
    expect(reg.getAll()[0].repoName).toBe('repo');
  });

  it('updates existing entry on addOrUpdate', () => {
    const reg = new WebProjectRegistry();
    const base = {
      repoUrl: 'https://github.com/user/repo',
      repoName: 'repo',
      schemaPath: 'schema',
      persistLayout: false,
      localPath: '/github-projects/user/repo',
      lastOpenedAt: '2024-01-01T00:00:00Z',
    };
    reg.addOrUpdate(base);
    reg.addOrUpdate({ ...base, schemaPath: 'src/schema' });
    const entries = reg.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].schemaPath).toBe('src/schema');
  });

  it('remove deletes entry by repoUrl', () => {
    const reg = new WebProjectRegistry();
    reg.addOrUpdate({ repoUrl: 'https://github.com/a/b', repoName: 'b', schemaPath: '.', persistLayout: false, localPath: '/p', lastOpenedAt: '' });
    reg.remove('https://github.com/a/b');
    expect(reg.getAll()).toHaveLength(0);
  });

  it('opfsPathForRepo produces stable paths', () => {
    const path = WebProjectRegistry.opfsPathForRepo('https://github.com/owner/my-repo');
    expect(path).toBe('/github-projects/owner/my-repo');
  });

  it('parseOwnerRepo extracts owner and repo', () => {
    const result = WebProjectRegistry.parseOwnerRepo('https://github.com/owner/my-repo.git');
    expect(result).toEqual({ owner: 'owner', repo: 'my-repo' });
  });

  it('parseOwnerRepo returns null for non-github URLs', () => {
    expect(WebProjectRegistry.parseOwnerRepo('https://gitlab.com/owner/repo')).toBeNull();
  });
});

describe('CloudPlatform', () => {
  let CloudPlatform: typeof import('../platform/CloudPlatform.js').CloudPlatform;

  beforeEach(async () => {
    localStorage.clear();
    ({ CloudPlatform } = await import('../platform/CloudPlatform.js'));
  });

  it('delegates credential methods to local', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    await cloud.storeCredential('key', 'val');
    expect(await cloud.getCredential('key')).toBe('val');

    await cloud.deleteCredential('key');
    expect(await cloud.getCredential('key')).toBeNull();
  });

  it('delegates settings methods to local', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    await cloud.setSetting('foo', 'bar');
    expect(await cloud.getSetting('foo')).toBe('bar');
  });

  it('writeFile triggers debounced sync status change', async () => {
    vi.useFakeTimers();
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');
    cloud.setActiveRepoPath('/test/repo');

    const statuses: string[] = [];
    cloud.onSyncStatus((s) => statuses.push(s));

    await cloud.writeFile('/test/file.yaml', 'content');
    expect(statuses).toContain('unsaved');

    // Advance timer to trigger auto-sync
    await vi.runAllTimersAsync();

    // Should have attempted commit+push
    expect(local.gitCommit).toHaveBeenCalled();
    expect(local.gitPush).toHaveBeenCalled();
    expect(statuses).toContain('saved');

    vi.useRealTimers();
  });

  it('writeFile skips sync when no active repo path', async () => {
    vi.useFakeTimers();
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');
    // No setActiveRepoPath called

    await cloud.writeFile('/test/file.yaml', 'content');
    await vi.runAllTimersAsync();

    expect(local.gitCommit).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('flushSync commits and pushes pending changes', async () => {
    vi.useFakeTimers();
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');
    cloud.setActiveRepoPath('/test/repo');

    await cloud.writeFile('/test/file.yaml', 'content');
    // Status is 'unsaved', timer not yet fired

    await cloud.flushSync();

    expect(local.gitCommit).toHaveBeenCalled();
    expect(local.gitPush).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('flushSync is a no-op when already saved', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');
    cloud.setActiveRepoPath('/test/repo');

    // No writes — status remains 'saved'
    await cloud.flushSync();

    expect(local.gitCommit).not.toHaveBeenCalled();
  });

  it('createProject calls GitHub API and clones', async () => {
    vi.stubGlobal('fetch', mockGitHubFetch({
      'api.github.com/user/repos': { clone_url: 'https://github.com/user/newrepo.git', html_url: 'https://github.com/user/newrepo', name: 'newrepo' },
    }));

    const local = makeMockLocal();
    // gitStatus returns nothing-to-commit after clone
    local.gitStatus.mockResolvedValue({ branch: 'main', aheadCount: 0, behindCount: 0, stagedFiles: [], unstagedFiles: [], untrackedFiles: [] });

    const cloud = new CloudPlatform(local, 'tok123');
    const result = await cloud.createProject('newrepo', 'schema', false);

    expect(result.repoPath).toContain('newrepo');
    expect(result.schemaPath).toBe('schema');
    expect(local.gitClone).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('createProject throws when GitHub API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ message: 'Repository creation failed. name already exists on this account' }),
    }));

    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    await expect(cloud.createProject('existing-repo')).rejects.toThrow('already exists');

    vi.unstubAllGlobals();
  });

  it('cloneProject clones repo and updates registry', async () => {
    const local = makeMockLocal();
    // No existing project.json
    local.readFile.mockRejectedValue(new Error('ENOENT'));
    local.gitStatus.mockResolvedValue({ branch: 'main', aheadCount: 0, behindCount: 0, stagedFiles: [], unstagedFiles: [], untrackedFiles: ['.linkml-editor/project.json'] });

    const cloud = new CloudPlatform(local, 'tok123');
    const result = await cloud.cloneProject('https://github.com/user/my-schema', 'schema', false);

    expect(result.repoPath).toContain('my-schema');
    expect(local.gitClone).toHaveBeenCalledWith(
      'https://github.com/user/my-schema',
      expect.any(String),
      expect.objectContaining({ credentials: { username: 'x-token', password: 'tok123' } }),
    );
    expect(local.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('project.json'),
      expect.any(String),
    );

    // Registry should have the entry
    const { WebProjectRegistry } = await import('../platform/ProjectRegistry.js');
    const reg = new WebProjectRegistry();
    expect(reg.getByRepoUrl('https://github.com/user/my-schema')).not.toBeNull();
  });

  it('openProject reads from registry and updates lastOpenedAt', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    // Pre-populate registry
    const { WebProjectRegistry } = await import('../platform/ProjectRegistry.js');
    const reg = new WebProjectRegistry();
    reg.addOrUpdate({
      repoUrl: 'https://github.com/user/proj',
      repoName: 'proj',
      schemaPath: 'schema',
      persistLayout: false,
      localPath: '/github-projects/user/proj',
      lastOpenedAt: '2024-01-01T00:00:00Z',
    });

    local.readFile.mockResolvedValue(JSON.stringify({ repoUrl: 'https://github.com/user/proj', schemaPath: 'schema', persistLayout: false }));

    const result = await cloud.openProject('https://github.com/user/proj');
    expect(result.schemaPath).toBe('schema');
    expect(result.entry.lastOpenedAt).not.toBe('2024-01-01T00:00:00Z');
  });

  it('openProject throws when project not in registry', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    await expect(cloud.openProject('https://github.com/user/unknown')).rejects.toThrow('not found in registry');
  });

  it('uses cloneRoot for Electron-style paths', () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123', { cloneRoot: '/home/user/Documents/LinkMLProjects' });
    // Access via cloneProject call path validation — we just check the constructor accepted the option
    expect(cloud.platform).toBe('web');
  });

  it('sync error status is emitted on push failure', async () => {
    vi.useFakeTimers();
    const local = makeMockLocal();
    local.gitPush.mockResolvedValue({ ok: false, error: 'non-fast-forward' });

    const cloud = new CloudPlatform(local, 'tok123');
    cloud.setActiveRepoPath('/test/repo');

    const statuses: string[] = [];
    cloud.onSyncStatus((s) => statuses.push(s));

    await cloud.writeFile('/test/file.yaml', 'content');
    await vi.runAllTimersAsync();

    expect(statuses).toContain('error');

    vi.useRealTimers();
  });

  it('gitPush always injects token credentials', async () => {
    const local = makeMockLocal();
    const cloud = new CloudPlatform(local, 'tok123');

    await cloud.gitPush('/repo');

    // local.gitPush should have been called with an onAuth that returns token creds
    expect(local.gitPush).toHaveBeenCalledWith(
      '/repo',
      expect.any(Function),
    );
    const onAuth = local.gitPush.mock.calls[0][1] as Parameters<PlatformAPI['gitPush']>[1];
    if (onAuth) {
      const creds = await onAuth('https://github.com/owner/repo');
      expect(creds).toEqual({ username: 'x-token', password: 'tok123' });
    }
  });
});

describe('WebPlatform credential/settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('storeCredential stores in-memory (not in localStorage)', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.storeCredential('mykey', 'myval');
    expect(await p.getCredential('mykey')).toBe('myval');
    // Must NOT appear in localStorage — security requirement (T2 #9)
    expect(localStorage.getItem('linkml-editor:mykey')).toBeNull();
  });

  it('getCredential reads from in-memory store (ignores localStorage)', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    // Even if localStorage has the old format, getCredential must not return it
    localStorage.setItem('linkml-editor:foo', 'bar');
    expect(await p.getCredential('foo')).toBeNull();
  });

  it('getCredential returns null when not set', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    expect(await p.getCredential('nonexistent')).toBeNull();
  });

  it('deleteCredential removes from in-memory store', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.storeCredential('delme', 'val');
    await p.deleteCredential('delme');
    expect(await p.getCredential('delme')).toBeNull();
  });

  it('getSetting and setSetting round-trip', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    await p.setSetting('github-clone-dir', '/custom/path');
    expect(await p.getSetting('github-clone-dir')).toBe('/custom/path');
  });

  it('getSetting returns null for unknown key', async () => {
    const { WebPlatform } = await import('../platform/WebPlatform.js');
    const p = new WebPlatform();
    expect(await p.getSetting('unknown-setting')).toBeNull();
  });
});
