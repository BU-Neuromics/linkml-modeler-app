// isomorphic-git requires Buffer to be available as a global in the browser.
import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import '@linkml-editor/core/ui/tokens.css';
import '@linkml-editor/core/ui/globals.css';

import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, Hexagon, X } from 'lucide-react';

// ── Error Boundary ────────────────────────────────────────────────────────────
interface ErrorBoundaryState { error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[LinkML Editor] Uncaught error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--color-bg-canvas)', color: 'var(--color-state-error-fg)', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24 }}><AlertTriangle size={24} /> Unexpected Error</div>
          <div style={{ fontSize: 13, color: 'var(--color-fg-secondary)', maxWidth: 600, textAlign: 'center' }}>{this.state.error.message}</div>
          <button onClick={() => this.setState({ error: null })} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-fg-primary)', borderRadius: 5, padding: '6px 14px', cursor: 'pointer' }}>
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  PlatformContext,
  usePlatform,
  useAppStore,
  serializeYaml,
  parseYaml,
  PropertiesPanel,
  SchemaSettingsDialog,
  ProjectPanel,
  DisplayPanel,
  ValidationPanel,
  FocusModeToolbar,
  MenuBar,
  SplashPage,
  SchemaCanvas,
  OutlineView,
  CloneDialog,
  OpenSchemaFromUrlDialog,
  ImportSchemaDialog,
  NewSchemaDialog,
  CommandPalette,
  createNewProject,
  loadDemoSchemaFromUrl,
  openProjectFromDirectory,
  emptyCanvasLayout,
  type SchemaFile,
  type Project,
  type ActiveEntity,
} from '@linkml-editor/core';
import { WebPlatform } from './platform/WebPlatform.js';
import { GitPanel } from './editor/GitPanel.js';
import { AuthProvider } from './auth/AuthContext.js';
import { SignInPrompt } from './components/SignInPrompt.js';
import { UserMenu } from './components/UserMenu.js';
import { SyncStatusIndicator } from './components/SyncStatusIndicator.js';
import { ProjectSwitcherDialog } from './components/ProjectSwitcherDialog.js';
import { WebProjectRegistry } from './platform/ProjectRegistry.js';
import { DemoBanner, IS_GITHUB_PAGES } from './components/DemoBanner.js';

const DEMO_URL = 'https://adamlabadorf.github.io/linkml-modeler-app/app/';

// ── Detect Electron ───────────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== 'undefined' && 'electronAPI' in window;

// ── Platform creation ─────────────────────────────────────────────────────────

async function createBasePlatform(): Promise<{ basePlatform: import('@linkml-editor/core').PlatformAPI; initialToken: string | null }> {
  if (IS_ELECTRON) {
    const { ElectronPlatform } = await import('./platform/ElectronPlatform.js');
    const base = new ElectronPlatform();
    // Electron persists the token via keytar — restore on startup
    const token = await base.getCredential('github-token');
    return { basePlatform: base, initialToken: token };
  }
  // Web: credentials are in-memory only — always start signed out after a page load
  return { basePlatform: new WebPlatform(), initialToken: null };
}

async function buildCloudPlatform(
  base: import('@linkml-editor/core').PlatformAPI,
  token: string,
): Promise<import('./platform/CloudPlatform.js').CloudPlatform> {
  const { CloudPlatform } = await import('./platform/CloudPlatform.js');
  let cloneRoot: string | undefined;
  if (IS_ELECTRON) {
    const configuredDir = await base.getSetting('github-clone-dir');
    if (configuredDir) {
      cloneRoot = configuredDir;
    } else {
      const electronAPI = (window as unknown as { electronAPI?: { getDocumentsPath?(): Promise<string> } }).electronAPI;
      const documents = await electronAPI?.getDocumentsPath?.() ?? '';
      cloneRoot = documents ? `${documents}/LinkMLProjects` : undefined;
    }
  }
  return new CloudPlatform(base, token, { cloneRoot });
}

// ── RootApp — manages active platform and wires up AuthProvider callbacks ──────

function RootApp({
  basePlatform,
  initialToken,
  onPlatformChange,
}: {
  basePlatform: import('@linkml-editor/core').PlatformAPI;
  initialToken: string | null;
  onPlatformChange?: (p: import('@linkml-editor/core').PlatformAPI) => void;
}) {
  const [activePlatform, setActivePlatform] = React.useState<import('@linkml-editor/core').PlatformAPI>(basePlatform);

  const attachCloudListeners = React.useCallback((cloud: import('./platform/CloudPlatform.js').CloudPlatform) => {
    cloud.onSyncStatus((status) => {
      const { setSyncStatus, pushToast } = useAppStore.getState();
      setSyncStatus(status);
      if (status === 'error') {
        pushToast({ message: 'Sync failed — another session may have modified this project. Please refresh.', severity: 'error' });
      }
    });
    window.addEventListener('beforeunload', () => void cloud.flushSync());
  }, []);

  const switchToCloud = React.useCallback(async (token: string) => {
    const cloud = await buildCloudPlatform(basePlatform, token);
    attachCloudListeners(cloud);
    setActivePlatform(cloud);
    onPlatformChange?.(cloud);
  }, [basePlatform, attachCloudListeners, onPlatformChange]);

  const switchToBase = React.useCallback(() => {
    setActivePlatform(basePlatform);
    onPlatformChange?.(basePlatform);
    // Reset sync status so the UI doesn't show stale CloudPlatform state
    useAppStore.getState().setSyncStatus(null);
  }, [basePlatform, onPlatformChange]);

  // Electron resume: activate CloudPlatform if keytar had a stored token
  React.useEffect(() => {
    if (initialToken) void Promise.resolve(initialToken).then(switchToCloud);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PlatformContext.Provider value={activePlatform}>
      <AuthProvider onSignedIn={switchToCloud} onSignedOut={switchToBase}>
        <App />
      </AuthProvider>
    </PlatformContext.Provider>
  );
}

// ── YAML Preview panel ────────────────────────────────────────────────────────
function YamlPreview() {
  const schema = useAppStore((s) => s.getActiveSchema());

  const yaml = React.useMemo(() => {
    if (!schema?.schema) return '';
    try {
      return serializeYaml(schema.schema);
    } catch {
      return '# serialization error';
    }
  }, [schema]);

  return (
    <div id="lme-yaml-preview" style={yamlStyles.panel}>
      <div style={yamlStyles.header}>
        <span style={yamlStyles.title}>YAML Preview</span>
        {schema?.isDirty && <span style={yamlStyles.dirty}>● unsaved</span>}
      </div>
      <pre style={yamlStyles.code}>{yaml}</pre>
    </div>
  );
}

const yamlStyles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    width: 300,
    borderLeft: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-deep)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--color-fg-muted)',
  },
  dirty: {
    fontSize: 11,
    color: 'var(--color-state-warning)',
  },
  code: {
    flex: 1,
    overflowY: 'auto',
    margin: 0,
    padding: '8px 12px',
    fontSize: 10,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-secondary)',
    whiteSpace: 'pre',
    lineHeight: 1.5,
  },
};

// ── Toast display ─────────────────────────────────────────────────────────────
function ToastList() {
  const toastQueue = useAppStore((s) => s.toastQueue);
  const dismissToast = useAppStore((s) => s.dismissToast);

  return (
    <div style={toastStyles.container}>
      {toastQueue.map((t) => (
        <div key={t.id} style={{ ...toastStyles.toast, ...toastStyles[t.severity] }}>
          <span>{t.message}</span>
          <button style={toastStyles.dismiss} onClick={() => dismissToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const toastStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: 32,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 3000,
    pointerEvents: 'none',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    pointerEvents: 'auto',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-fg-primary)',
  },
  info: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-fg-primary)' },
  success: { background: 'var(--color-state-success-bg)', border: '1px solid var(--color-state-success-border)', color: 'var(--color-state-success-fg)' },
  warning: { background: 'var(--color-state-warning-bg)', border: '1px solid var(--color-state-warning-border)', color: 'var(--color-state-warning-fg)' },
  error: { background: 'var(--color-state-error-bg)', border: '1px solid var(--color-state-error-border)', color: 'var(--color-state-error-fg)' },
  dismiss: {
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: 0,
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 1,
  },
};

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const platform = usePlatform();
  const activeProject = useAppStore((s) => s.activeProject);
  const setProject = useAppStore((s) => s.setProject);
  const closeProject = useAppStore((s) => s.closeProject);
  const schemaSettingsOpen = useAppStore((s) => s.schemaSettingsOpen);
  const setSchemaSettingsOpen = useAppStore((s) => s.setSchemaSettingsOpen);
  const schema = useAppStore((s) => s.getActiveSchema());
  const isDirty = useAppStore((s) => s.getIsDirty());
  const commitLog = useAppStore((s) => s.commitLog);
  const gitAvailable = useAppStore((s) => s.gitAvailable);
  const pushToast = useAppStore((s) => s.pushToast);
  const markSchemaDirty = useAppStore((s) => s.markSchemaDirty);
  const yamlPreviewOpen = useAppStore((s) => s.yamlPreviewOpen);
  const validationIssues = useAppStore((s) => s.validationIssues);
  const cloneDialogOpen = useAppStore((s) => s.cloneDialogOpen);
  const setCloneDialogOpen = useAppStore((s) => s.setCloneDialogOpen);
  const importDialogOpen = useAppStore((s) => s.importDialogOpen);
  const setImportDialogOpen = useAppStore((s) => s.setImportDialogOpen);
  const newSchemaDialogOpen = useAppStore((s) => s.newSchemaDialogOpen);
  const setNewSchemaDialogOpen = useAppStore((s) => s.setNewSchemaDialogOpen);
  const switchProjectDialogOpen = useAppStore((s) => s.switchProjectDialogOpen);
  const setSwitchProjectDialogOpen = useAppStore((s) => s.setSwitchProjectDialogOpen);
  const openFromUrlDialogOpen = useAppStore((s) => s.openFromUrlDialogOpen);
  const setOpenFromUrlDialogOpen = useAppStore((s) => s.setOpenFromUrlDialogOpen);
  const syncStatus = useAppStore((s) => s.syncStatus);
  const globalRenderMode = useAppStore((s) => s.globalRenderMode);
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);

  // Compute effective render mode: active view overrides global default
  const activeRenderMode = React.useMemo(() => {
    const activeView = views.find((v) => v.id === activeViewId);
    return activeView ? activeView.renderMode : globalRenderMode;
  }, [views, activeViewId, globalRenderMode]);

  // Enable "Switch Project" when 2+ projects are registered
  const [registeredProjectCount, setRegisteredProjectCount] = React.useState(() =>
    new WebProjectRegistry().getAll().length
  );
  // Refresh count when the dialog opens or closes so the menu item stays in sync
  React.useEffect(() => {
    void Promise.resolve().then(() =>
      setRegisteredProjectCount(new WebProjectRegistry().getAll().length)
    );
  }, [switchProjectDialogOpen]);
  const [isSaving, setIsSaving] = React.useState(false);

  // ── Save project to disk ───────────────────────────────────────────────────
  const saveProject = React.useCallback(async (): Promise<boolean> => {
    const project = useAppStore.getState().activeProject;
    if (!project) return false;

    const dirtySchemas = project.schemas.filter((s) => s.isDirty && !s.isReadOnly);
    if (dirtySchemas.length === 0) {
      pushToast({ message: 'Nothing to save', severity: 'info' });
      return true;
    }

    let rootPath = project.rootPath;

    // If no rootPath (new unsaved project), prompt user to pick a location
    if (!rootPath || rootPath === '/') {
      const picked = await platform.openDirectory();
      if (!picked) return false; // user cancelled
      rootPath = picked;
      // Update project rootPath in store
      useAppStore.setState((state) => ({
        activeProject: state.activeProject
          ? { ...state.activeProject, rootPath: picked }
          : null,
      }));
    }

    setIsSaving(true);
    let savedCount = 0;
    const errors: string[] = [];

    for (const sf of dirtySchemas) {
      try {
        const yaml = serializeYaml(sf.schema);
        const fullPath = rootPath.endsWith('/')
          ? `${rootPath}${sf.filePath}`
          : `${rootPath}/${sf.filePath}`;
        await platform.writeFile(fullPath, yaml);
        markSchemaDirty(sf.id, false);
        savedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${sf.filePath}: ${msg}`);
      }
    }

    setIsSaving(false);

    if (errors.length > 0) {
      pushToast({
        message: `Save failed for ${errors.length} file(s): ${errors[0]}`,
        severity: 'error',
      });
      return false;
    } else {
      pushToast({
        message: `Saved ${savedCount} file${savedCount > 1 ? 's' : ''}`,
        severity: 'success',
        durationMs: 2000,
      });
      return true;
    }
  }, [platform, pushToast, markSchemaDirty]);

  // ── Git helpers (for MenuBar) ─────────────────────────────────────────────
  const handleMenuCommit = React.useCallback(() => {
    // Open git panel to the changes tab for committing
    useAppStore.getState().setGitPanelOpen(true);
  }, []);

  const handleMenuPush = React.useCallback(() => {
    // Open the git panel — the Push button there has proper credential UI.
    useAppStore.getState().setGitPanelOpen(true);
  }, []);

  const handleMenuPull = React.useCallback(() => {
    // Open the git panel — the Pull button there has proper credential UI.
    useAppStore.getState().setGitPanelOpen(true);
  }, []);

  // ── New Project / Open Project (for MenuBar) ─────────────────────────────
  const handleNewProject = React.useCallback(() => {
    const project = createNewProject('Untitled Schema');
    setProject(project);
  }, [setProject]);

  const handleOpenProject = React.useCallback(() => {
    // Return to the splash page so the user can pick New / Open Folder / Clone / Recent.
    if (isDirty) {
      if (!window.confirm('You have unsaved changes. Close project without saving?')) return;
    }
    closeProject();
    useAppStore.getState().setViews([]);
    useAppStore.getState().setActiveViewId(null);
    useAppStore.getState().setGitAvailable(false);
  }, [isDirty, closeProject]);

  const handleLoadDemo = React.useCallback(async () => {
    const demoUrl = `${import.meta.env.BASE_URL}monty-python.yaml`;
    const project = await loadDemoSchemaFromUrl(demoUrl, 'Monty Python');
    setProject(project);
  }, [setProject]);

  // ── Ctrl+S / Cmd+S keyboard shortcut ───────────────────────────────────────
  React.useEffect(() => {
    function handleSaveShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
    }
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [saveProject]);

  // ── Cmd+K / Ctrl+K — command palette ──────────────────────────────────────
  React.useEffect(() => {
    function handlePaletteShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const s = useAppStore.getState();
        s.setCommandPaletteOpen(!s.commandPaletteOpen);
      }
    }
    window.addEventListener('keydown', handlePaletteShortcut);
    return () => window.removeEventListener('keydown', handlePaletteShortcut);
  }, []);

  // Show splash page when no project is loaded
  if (!activeProject) {
    return (
      <div style={styles.app}>
        <DemoBanner />
        <SplashPage
          demoUrl={IS_GITHUB_PAGES ? undefined : DEMO_URL}
          onLoadDemo={IS_GITHUB_PAGES ? handleLoadDemo : undefined}
        />
        <SignInPrompt />
        {cloneDialogOpen && (
          <CloneDialog onClose={() => setCloneDialogOpen(false)} />
        )}
        {openFromUrlDialogOpen && (
          <OpenSchemaFromUrlDialog onClose={() => setOpenFromUrlDialogOpen(false)} />
        )}
        <ToastList />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {/* Skip link for keyboard users (AC-B17) */}
      <a href="#lme-canvas-area" className="lme-skip-link">Skip to main content</a>

      {/* Demo banner (GitHub Pages only) */}
      <DemoBanner />

      {/* Header */}
      <header id="lme-header" style={styles.header}>
        <div style={styles.headerLeft}>
          <span id="lme-logo" style={{ ...styles.logo, display: 'flex', alignItems: 'center', gap: 6 }}><Hexagon size={16} />LinkML Visual Schema Editor</span>
          <MenuBar
            onNewProject={handleNewProject}
            onOpenProject={handleOpenProject}
            onSave={saveProject}
            onSaveAs={saveProject}
            onOpenFromUrl={() => setOpenFromUrlDialogOpen(true)}
            onSwitchProject={registeredProjectCount >= 2 ? () => setSwitchProjectDialogOpen(true) : undefined}
            onNewSchema={() => setNewSchemaDialogOpen(true)}
            onImportSchema={() => setImportDialogOpen(true)}
            onCommit={handleMenuCommit}
            onPush={handleMenuPush}
            onPull={activeProject?.gitConfig?.remoteUrl ? handleMenuPull : undefined}
          />
        </div>
        <div style={styles.headerRight}>
          <SyncStatusIndicator />
          {isDirty && syncStatus === null && <span style={styles.dirtyBadge}>● unsaved changes</span>}
          {isSaving && <span style={styles.savingBadge}>saving…</span>}
          <UserMenu />
        </div>
      </header>

      {/* Sign-in banner (unauthenticated) */}
      <SignInPrompt />

      {/* Main layout */}
      <div style={styles.main}>
        {/* Project panel (left) */}
        <ProjectPanel />

        {/* Display controls panel */}
        <DisplayPanel />

        {/* Canvas + focus toolbar (center) */}
        <div style={styles.canvasColumn}>
          <FocusModeToolbar />
          <div id="lme-canvas-area" style={styles.canvasArea}>
            {activeRenderMode === 'outline' ? <OutlineView /> : <SchemaCanvas />}
          </div>
        </div>

        {/* Properties panel (right) */}
        <PropertiesPanel />

        {/* YAML preview (far right) */}
        {yamlPreviewOpen && <YamlPreview />}
      </div>

      {/* Bottom panels */}
      <ValidationPanel />
      <GitPanel onSaveBeforeCommit={saveProject} />

      {/* Status bar */}
      <footer id="lme-footer" style={styles.footer}>
        <span>
          {schema
            ? `${schema.filePath} · ${Object.keys(schema.schema.classes).length} class(es) · ${Object.keys(schema.schema.enums).length} enum(s)`
            : 'No schema loaded'}
          {validationIssues.length > 0 && (
            <>
              {' · '}
              <span style={{ color: validationIssues.some(i => i.severity === 'error') ? 'var(--color-state-error-fg)' : 'var(--color-state-warning-fg)' }}>
                {validationIssues.filter(i => i.severity === 'error').length > 0
                  ? `${validationIssues.filter(i => i.severity === 'error').length} err`
                  : ''}
                {validationIssues.filter(i => i.severity === 'error').length > 0 && validationIssues.filter(i => i.severity === 'warning').length > 0 ? ', ' : ''}
                {validationIssues.filter(i => i.severity === 'warning').length > 0
                  ? `${validationIssues.filter(i => i.severity === 'warning').length} warn`
                  : ''}
              </span>
            </>
          )}
          {gitAvailable && commitLog.length > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--color-border-strong)' }}>
                {commitLog[0].oid.slice(0, 7)} {commitLog[0].message.split('\n')[0].slice(0, 50)}
              </span>
            </>
          )}
        </span>
        <span>
          Click node to edit · Right-click canvas to add · Drag handle-to-handle for is_a · Del to delete · Ctrl+S save · Ctrl+Z/Y undo/redo · F fit view
        </span>
      </footer>

      {/* Schema settings dialog */}
      {schemaSettingsOpen && (
        <SchemaSettingsDialog onClose={() => setSchemaSettingsOpen(false)} />
      )}

      {/* Clone git repository dialog */}
      {cloneDialogOpen && (
        <CloneDialog onClose={() => setCloneDialogOpen(false)} />
      )}

      {/* Open schema from URL dialog */}
      {openFromUrlDialogOpen && (
        <OpenSchemaFromUrlDialog onClose={() => setOpenFromUrlDialogOpen(false)} />
      )}

      {/* Import schema dialog */}
      {importDialogOpen && (
        <ImportSchemaDialog onClose={() => setImportDialogOpen(false)} />
      )}

      {/* New schema dialog */}
      {newSchemaDialogOpen && (
        <NewSchemaDialog onClose={() => setNewSchemaDialogOpen(false)} />
      )}

      {/* Project switcher dialog */}
      {switchProjectDialogOpen && (
        <ProjectSwitcherDialog onClose={() => setSwitchProjectDialogOpen(false)} />
      )}

      {/* Command palette (Cmd-K / Ctrl-K) — portal, renders even when closed */}
      <CommandPalette />

      {/* Toast notifications */}
      <ToastList />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--color-bg-canvas)',
    color: 'var(--color-fg-primary)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-canvas)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    fontWeight: 700,
    fontSize: 15,
    color: 'var(--color-accent-hover)',
  },
  dirtyBadge: {
    fontSize: 11,
    color: 'var(--color-state-warning)',
  },
  savingBadge: {
    fontSize: 11,
    color: 'var(--color-accent-hover)',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    minHeight: 0,
  },
  canvasColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minWidth: 320,
  },
  canvasArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 0,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 16px',
    borderTop: '1px solid var(--color-border-subtle)',
    fontSize: 10,
    color: 'var(--color-border-default)',
    background: 'var(--color-bg-canvas)',
    flexShrink: 0,
  },
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  const { basePlatform, initialToken } = await createBasePlatform();

  const container = document.getElementById('root')!;
  const root = createRoot(container);

  // ── E2E test helper (DEV only) ──────────────────────────────────────────────
  // Uses a mutable ref so helpers always call through the current active platform
  // (e.g. CloudPlatform after sign-in).
  if (import.meta.env.DEV) {
    const platformRef: { current: import('@linkml-editor/core').PlatformAPI } = { current: basePlatform };
    const onPlatformChange = (p: import('@linkml-editor/core').PlatformAPI) => { platformRef.current = p; };

    (window as unknown as Record<string, unknown>).__lme_e2e__ = {
      /** Parse YAML and inject a project directly into the store. */
      loadSchema(yaml: string, opts?: { filePath?: string; rootPath?: string; dirty?: boolean }) {
        const { filePath = 'schema.yaml', rootPath = '/e2e-test', dirty = false } = opts ?? {};
        const schema = parseYaml(yaml);
        const schemaFile: SchemaFile = {
          id: crypto.randomUUID(),
          filePath,
          schema,
          isDirty: dirty,
          canvasLayout: emptyCanvasLayout(),
        };
        const project: Project = {
          id: crypto.randomUUID(),
          name: schema.name || 'E2E Test',
          rootPath,
          schemas: [schemaFile],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        useAppStore.getState().setProject(project);
      },
      /** Write content to the OPFS-backed LightningFS at the given path. */
      async writeFile(path: string, content: string) {
        await platformRef.current.writeFile(path, content);
      },
      /** Read file content from LightningFS. */
      async readFile(path: string): Promise<string> {
        return platformRef.current.readFile(path);
      },
      /** Scan an OPFS directory for LinkML schemas and open as project. */
      async openProjectFromPath(dirPath: string) {
        const { project, hiddenSchemaIds, views, activeViewId } = await openProjectFromDirectory(dirPath, platformRef.current);
        if (project.schemas.length > 0) {
          useAppStore.getState().setProject(project);
          useAppStore.getState().setHiddenSchemaIds(hiddenSchemaIds);
          useAppStore.getState().setViews(views);
          useAppStore.getState().setActiveViewId(activeViewId);
        }
      },
      /** Set the active project's rootPath so Ctrl+S writes to OPFS directly. */
      setRootPath(path: string) {
        useAppStore.setState((state) => ({
          activeProject: state.activeProject
            ? { ...state.activeProject, rootPath: path }
            : null,
        }));
      },
      /** Serialize the currently active schema to YAML. */
      getActiveYaml(): string {
        const sf = useAppStore.getState().getActiveSchema();
        if (!sf) return '';
        return serializeYaml(sf.schema);
      },
      /** Run validation on the currently active schema. */
      runValidation() {
        const { getActiveSchema, runValidation: doRun } = useAppStore.getState();
        const sf = getActiveSchema();
        if (sf) doRun(sf.schema);
      },
      /** Return current validation issues. */
      getValidationIssues() {
        return useAppStore.getState().validationIssues;
      },
      /** Select an entity in the properties panel. */
      setActiveEntity(entity: ActiveEntity) {
        useAppStore.getState().setActiveEntity(entity);
      },
      /** Select canvas nodes by ID (class/enum name). */
      setSelection(nodeIds: string[]) {
        useAppStore.getState().setSelection(nodeIds, []);
      },
      /** Close the active project (returns to splash). */
      closeProject() {
        useAppStore.getState().closeProject();
        useAppStore.getState().setViews([]);
        useAppStore.getState().setActiveViewId(null);
      },
    };

    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <RootApp basePlatform={basePlatform} initialToken={initialToken} onPlatformChange={onPlatformChange} />
        </ErrorBoundary>
      </React.StrictMode>
    );
    return;
  }

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <RootApp basePlatform={basePlatform} initialToken={initialToken} />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

bootstrap();
