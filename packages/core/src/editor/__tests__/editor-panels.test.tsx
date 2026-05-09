import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationPanel } from '../ValidationPanel.js';
import { SplashPage } from '../SplashPage.js';
import { useAppStore } from '../../store/index.js';
import { PlatformContext, type PlatformAPI } from '../../platform/PlatformContext.js';

// ── Mock platform ─────────────────────────────────────────────────────────────

const mockPlatform: PlatformAPI = {
  openFile: vi.fn().mockResolvedValue(null),
  saveFile: vi.fn().mockResolvedValue(null),
  openDirectory: vi.fn().mockResolvedValue(null),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  initGit: vi.fn().mockResolvedValue(false),
  gitCreateRepo: vi.fn().mockResolvedValue(false),
  gitSetRemote: vi.fn().mockResolvedValue(undefined),
  gitReadConfig: vi.fn().mockResolvedValue({}),
  gitStatus: vi.fn().mockResolvedValue(null),
  gitStage: vi.fn().mockResolvedValue(undefined),
  gitUnstage: vi.fn().mockResolvedValue(undefined),
  gitCommit: vi.fn().mockResolvedValue(null),
  gitPush: vi.fn().mockResolvedValue(null),
  gitPull: vi.fn().mockResolvedValue(null),
  gitLog: vi.fn().mockResolvedValue([]),
  gitClone: vi.fn().mockResolvedValue({ ok: false, destPath: '' }),
  gitCheckout: vi.fn().mockResolvedValue(undefined),
  storeCredential: vi.fn().mockResolvedValue(undefined),
  getCredential: vi.fn().mockResolvedValue(null),
  deleteCredential: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  platform: 'web',
  gitAvailable: false,
  getProjectsPath: vi.fn().mockResolvedValue('/tmp'),
};

const INITIAL_STATE = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
});

// ── ValidationPanel ───────────────────────────────────────────────────────────

describe('ValidationPanel', () => {
  it('renders collapsed bar when validationPanelOpen is false', () => {
    useAppStore.getState().setValidationPanelOpen(false);
    render(<ValidationPanel />);
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.queryByText('▶ Validate')).not.toBeInTheDocument();
  });

  it('expands when collapsed bar is clicked', () => {
    useAppStore.getState().setValidationPanelOpen(false);
    render(<ValidationPanel />);
    const bar = screen.getByText('Validation').closest('#lme-validation-panel')!;
    fireEvent.click(bar);
    expect(useAppStore.getState().validationPanelOpen).toBe(true);
  });

  it('renders full panel with Validate button when open', () => {
    useAppStore.getState().setValidationPanelOpen(true);
    render(<ValidationPanel />);
    expect(screen.getByTitle('Run validation')).toBeInTheDocument();
    expect(screen.getByText('Not validated yet')).toBeInTheDocument();
  });

  it('shows error and warning counts when issues are present', () => {
    useAppStore.getState().setValidationPanelOpen(true);
    useAppStore.setState({
      validationIssues: [
        { id: '1', severity: 'error', path: 'classes.Foo', message: 'Missing name', category: 'structure' },
        { id: '2', severity: 'warning', path: 'classes.Bar', message: 'No description', category: 'style' },
      ],
      lastValidatedAt: Date.now() - 5000,
    } as Partial<typeof INITIAL_STATE> as never);
    render(<ValidationPanel />);
    expect(screen.getByText(/1 error/)).toBeInTheDocument();
    expect(screen.getByText(/1 warning/)).toBeInTheDocument();
  });

  it('shows no-issues message when validation ran with zero issues', () => {
    useAppStore.getState().setValidationPanelOpen(true);
    useAppStore.setState({
      validationIssues: [],
      lastValidatedAt: Date.now() - 1000,
    } as Partial<typeof INITIAL_STATE> as never);
    render(<ValidationPanel />);
    expect(screen.getByText('✓ No issues')).toBeInTheDocument();
  });

  it('collapsed bar shows error badge count', () => {
    useAppStore.getState().setValidationPanelOpen(false);
    useAppStore.setState({
      validationIssues: [
        { id: '1', severity: 'error', path: 'x', message: 'err', category: 'structure' },
        { id: '2', severity: 'error', path: 'y', message: 'err2', category: 'structure' },
      ],
    } as Partial<typeof INITIAL_STATE> as never);
    render(<ValidationPanel />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

// ── SplashPage ────────────────────────────────────────────────────────────────

describe('SplashPage', () => {
  function renderSplash() {
    return render(
      <PlatformContext.Provider value={mockPlatform}>
        <SplashPage />
      </PlatformContext.Provider>
    );
  }

  it('renders branding and action buttons', () => {
    renderSplash();
    expect(screen.getByText('LinkML Visual Schema Editor')).toBeInTheDocument();
    expect(screen.getByText('New Empty Project')).toBeInTheDocument();
    expect(screen.getByText('Open Local Folder')).toBeInTheDocument();
    expect(screen.getByText('Open Schema from URL…')).toBeInTheDocument();
    expect(screen.getByText('Clone Git Repository…')).toBeInTheDocument();
  });

  it('clicking New Empty Project sets an active project', () => {
    renderSplash();
    fireEvent.click(screen.getByText('New Empty Project'));
    expect(useAppStore.getState().activeProject).not.toBeNull();
  });

  it('clicking Open Schema from URL opens URL dialog', () => {
    renderSplash();
    fireEvent.click(screen.getByText('Open Schema from URL…'));
    expect(useAppStore.getState().openFromUrlDialogOpen).toBe(true);
  });

  it('clicking Clone Git Repository opens clone dialog', () => {
    renderSplash();
    fireEvent.click(screen.getByText('Clone Git Repository…'));
    expect(useAppStore.getState().cloneDialogOpen).toBe(true);
  });
});
