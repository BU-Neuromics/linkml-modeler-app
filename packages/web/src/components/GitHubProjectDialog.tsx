/**
 * GitHubProjectDialog — 3-tab dialog for GitHub project management.
 *
 * Tab 1: New project — create a new private GitHub repo
 * Tab 2: Clone existing — clone a repo by URL
 * Tab 3: Convert local — convert the open local project to GitHub-backed
 *
 * Per §6.3 of the feature spec.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { usePlatform, useAppStore, Button, Dialog } from '@linkml-editor/core';
import { useAuth } from '../auth/AuthContext.js';
import type { CloudPlatform } from '../platform/CloudPlatform.js';

type Tab = 'new' | 'clone' | 'convert';

const REPO_NAME_RE = /^[a-zA-Z0-9._-]+$/;

function validateRepoName(name: string): string | null {
  if (!name.trim()) return 'Repository name is required.';
  if (!REPO_NAME_RE.test(name)) return 'Only letters, numbers, hyphens, underscores, and dots allowed.';
  if (name.length > 100) return 'Name must be 100 characters or fewer.';
  return null;
}

function validateRepoUrl(url: string): string | null {
  if (!url.trim()) return 'Repository URL is required.';
  try {
    const u = new URL(url);
    if (!u.hostname.includes('github.com')) return 'Only GitHub URLs are supported.';
    const parts = u.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) return 'URL must point to a specific repository.';
    return null;
  } catch {
    return 'Enter a valid HTTPS URL.';
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

interface ProgressState { phase: string; loaded: number; total: number }

function ProgressBar({ progress }: { progress: ProgressState | null }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : null;
  return (
    <div style={progressStyles.container}>
      <div style={progressStyles.bar}>
        <div
          style={{
            ...progressStyles.fill,
            width: pct !== null ? `${pct}%` : '40%',
            animation: pct === null ? 'pulse 1.5s ease-in-out infinite' : undefined,
          }}
        />
      </div>
      <div style={progressStyles.label}>
        {progress.phase}{pct !== null ? ` ${pct}%` : '…'}
      </div>
    </div>
  );
}

interface GitHubProjectDialogProps {
  onClose(): void;
  onProjectOpened?(repoPath: string, schemaPath: string): void;
}

export function GitHubProjectDialog({ onClose, onProjectOpened }: GitHubProjectDialogProps) {
  const platform = usePlatform();
  const { session } = useAuth();
  const activeProject = useAppStore((s) => s.activeProject);
  const pushToast = useAppStore((s) => s.pushToast);

  const cloud = platform as unknown as CloudPlatform;
  const login = session?.login ?? '';

  const hasLocalProject = activeProject !== null;
  const [tab, setTab] = useState<Tab>('new');

  const [newName, setNewName] = useState('');
  const [newSchemaPath, setNewSchemaPath] = useState('');
  const [newPersistLayout, setNewPersistLayout] = useState(false);
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newProgress, setNewProgress] = useState<ProgressState | null>(null);
  const [newError, setNewError] = useState<string | null>(null);

  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneSchemaPath, setCloneSchemaPath] = useState('');
  const [clonePersistLayout, setClonePersistLayout] = useState(false);
  const [cloneUrlError, setCloneUrlError] = useState<string | null>(null);
  const [cloneSubmitting, setCloneSubmitting] = useState(false);
  const [cloneProgress, setCloneProgress] = useState<ProgressState | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneConfigLocked, setCloneConfigLocked] = useState(false);

  const [convertName, setConvertName] = useState(() => slugify(activeProject?.name ?? ''));
  const [convertSchemaPath, setConvertSchemaPath] = useState('');
  const [convertPersistLayout, setConvertPersistLayout] = useState(false);
  const [convertNameError, setConvertNameError] = useState<string | null>(null);
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<ProgressState | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  useEffect(() => {
    if (activeProject?.name) {
      void Promise.resolve(slugify(activeProject.name)).then(setConvertName);
    }
  }, [activeProject?.name]);

  const handleNewSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const nameErr = validateRepoName(newName);
    setNewNameError(nameErr);
    if (nameErr) return;

    setNewSubmitting(true);
    setNewProgress(null);
    setNewError(null);

    try {
      const result = await cloud.createProject(
        newName,
        newSchemaPath.trim() || 'schema',
        newPersistLayout,
      );
      pushToast({ message: `Repository "${newName}" created and opened`, severity: 'success' });
      onProjectOpened?.(result.repoPath, result.schemaPath);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = msg.includes('already exists')
        ? 'A repository with this name already exists in your account.'
        : msg;
      setNewError(friendly);
    } finally {
      setNewSubmitting(false);
      setNewProgress(null);
    }
  }, [cloud, newName, newSchemaPath, newPersistLayout, pushToast, onProjectOpened, onClose]);

  const handleCloneUrlBlur = useCallback(() => {
    setCloneUrlError(validateRepoUrl(cloneUrl));
  }, [cloneUrl]);

  const handleCloneSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const urlErr = validateRepoUrl(cloneUrl);
    setCloneUrlError(urlErr);
    if (urlErr) return;

    setCloneSubmitting(true);
    setCloneProgress(null);
    setCloneError(null);

    try {
      const result = await cloud.cloneProject(
        cloneUrl.trim(),
        cloneSchemaPath.trim() || '.',
        clonePersistLayout,
        (phase, loaded, total) => setCloneProgress({ phase, loaded, total }),
      );
      pushToast({ message: `Repository cloned and opened`, severity: 'success' });
      onProjectOpened?.(result.repoPath, result.schemaPath);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCloneError(msg);
    } finally {
      setCloneSubmitting(false);
      setCloneProgress(null);
    }
  }, [cloud, cloneUrl, cloneSchemaPath, clonePersistLayout, pushToast, onProjectOpened, onClose]);

  useEffect(() => {
    const existing =
      cloneUrl && !validateRepoUrl(cloneUrl)
        ? cloud.listProjects?.().find((p) => p.repoUrl === cloneUrl.trim())
        : undefined;
    void Promise.resolve().then(() => {
      if (!cloneUrl || validateRepoUrl(cloneUrl)) {
        setCloneConfigLocked(false);
      } else if (existing) {
        setCloneSchemaPath(existing.schemaPath);
        setClonePersistLayout(existing.persistLayout);
        setCloneConfigLocked(true);
      } else {
        setCloneConfigLocked(false);
      }
    });
  }, [cloneUrl, cloud]);

  const handleConvertSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const nameErr = validateRepoName(convertName);
    setConvertNameError(nameErr);
    if (nameErr || !activeProject) return;

    setConvertSubmitting(true);
    setConvertProgress(null);
    setConvertError(null);

    try {
      const result = await cloud.convertProject(
        activeProject.rootPath,
        convertName,
        convertSchemaPath.trim() || 'schema',
        convertPersistLayout,
        (phase, loaded, total) => setConvertProgress({ phase, loaded, total }),
      );
      pushToast({ message: `Project converted to GitHub repository "${convertName}"`, severity: 'success' });
      onProjectOpened?.(result.repoPath, result.schemaPath);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const friendly = msg.includes('already exists')
        ? 'A repository with this name already exists in your account.'
        : msg;
      setConvertError(friendly);
    } finally {
      setConvertSubmitting(false);
      setConvertProgress(null);
    }
  }, [cloud, convertName, convertSchemaPath, convertPersistLayout, activeProject, pushToast, onProjectOpened, onClose]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="GitHub Projects"
      size="md"
    >
      {/* Tab bar */}
      <div style={styles.tabBar}>
        {(['new', 'clone'] as Tab[]).concat(hasLocalProject ? ['convert'] : []).map((t) => (
          <button
            key={t}
            style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
            onClick={() => setTab(t)}
            type="button"
          >
            {t === 'new' ? 'New project' : t === 'clone' ? 'Clone existing' : 'Convert local'}
          </button>
        ))}
      </div>

      {tab === 'new' && (
        <form onSubmit={handleNewSubmit} style={styles.form}>
          <Field label="Repository name" required error={newNameError}>
            <input
              style={styles.input}
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setNewNameError(null); }}
              placeholder="my-schema"
              autoFocus
              disabled={newSubmitting}
            />
            {newName && !newNameError && (
              <div style={styles.urlPreview}>
                github.com/{login}/{newName}
              </div>
            )}
          </Field>

          <Field label="Schema directory" hint="Where .yaml files will live. Defaults to schema/.">
            <input
              style={styles.input}
              value={newSchemaPath}
              onChange={(e) => setNewSchemaPath(e.target.value)}
              placeholder="schema/"
              disabled={newSubmitting}
            />
          </Field>

          <PersistLayoutField checked={newPersistLayout} onChange={setNewPersistLayout} disabled={newSubmitting} />

          {newError && <ErrorBox message={newError} />}
          <ProgressBar progress={newProgress} />

          <Button type="submit" variant="primary" size="sm" loading={newSubmitting} disabled={newSubmitting}>
            {newSubmitting ? 'Creating…' : 'Create repository'}
          </Button>
        </form>
      )}

      {tab === 'clone' && (
        <form onSubmit={handleCloneSubmit} style={styles.form}>
          <Field label="Repository URL" required error={cloneUrlError}>
            <input
              style={styles.input}
              value={cloneUrl}
              onChange={(e) => { setCloneUrl(e.target.value); setCloneUrlError(null); }}
              onBlur={handleCloneUrlBlur}
              placeholder="https://github.com/owner/repo"
              autoFocus
              disabled={cloneSubmitting}
            />
          </Field>

          <Field
            label="Schema directory"
            hint={
              cloneConfigLocked
                ? 'Schema path loaded from project metadata.'
                : 'Path to schema files within the repo. Defaults to repo root.'
            }
          >
            <input
              style={{ ...styles.input, ...(cloneConfigLocked ? styles.inputLocked : {}) }}
              value={cloneSchemaPath}
              onChange={(e) => !cloneConfigLocked && setCloneSchemaPath(e.target.value)}
              placeholder="schema/"
              disabled={cloneSubmitting || cloneConfigLocked}
              readOnly={cloneConfigLocked}
            />
          </Field>

          <PersistLayoutField
            checked={clonePersistLayout}
            onChange={setClonePersistLayout}
            disabled={cloneSubmitting || cloneConfigLocked}
            locked={cloneConfigLocked}
          />

          {cloneError && <ErrorBox message={cloneError} />}
          <ProgressBar progress={cloneProgress} />

          <Button type="submit" variant="primary" size="sm" loading={cloneSubmitting} disabled={cloneSubmitting}>
            {cloneSubmitting ? 'Cloning…' : 'Clone repository'}
          </Button>
        </form>
      )}

      {tab === 'convert' && activeProject && (
        <form onSubmit={handleConvertSubmit} style={styles.form}>
          <div style={styles.convertInfo}>
            Converting <strong style={{ color: 'var(--color-fg-primary)' }}>{activeProject.name}</strong> to a
            GitHub repository. The original local copy will remain unchanged.
          </div>

          <Field label="Repository name" required error={convertNameError}>
            <input
              style={styles.input}
              value={convertName}
              onChange={(e) => { setConvertName(e.target.value); setConvertNameError(null); }}
              placeholder="my-schema"
              autoFocus
              disabled={convertSubmitting}
            />
            {convertName && !convertNameError && (
              <div style={styles.urlPreview}>
                github.com/{login}/{convertName}
              </div>
            )}
          </Field>

          <Field label="Schema directory" hint="Where .yaml files will be placed in the new repo.">
            <input
              style={styles.input}
              value={convertSchemaPath}
              onChange={(e) => setConvertSchemaPath(e.target.value)}
              placeholder="schema/"
              disabled={convertSubmitting}
            />
          </Field>

          <PersistLayoutField checked={convertPersistLayout} onChange={setConvertPersistLayout} disabled={convertSubmitting} />

          {convertError && <ErrorBox message={convertError} />}
          <ProgressBar progress={convertProgress} />

          <Button type="submit" variant="primary" size="sm" loading={convertSubmitting} disabled={convertSubmitting}>
            {convertSubmitting ? 'Converting…' : 'Convert to GitHub'}
          </Button>
        </form>
      )}
    </Dialog>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={fieldStyles.container}>
      <label style={fieldStyles.label}>
        {label}
        {required && <span style={fieldStyles.required}> *</span>}
      </label>
      {children}
      {error && <div style={fieldStyles.error}>{error}</div>}
      {hint && !error && <div style={fieldStyles.hint}>{hint}</div>}
    </div>
  );
}

function PersistLayoutField({
  checked,
  onChange,
  disabled,
  locked,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <div style={fieldStyles.checkboxRow}>
      <input
        type="checkbox"
        id="persist-layout"
        checked={checked}
        onChange={(e) => !locked && onChange(e.target.checked)}
        disabled={disabled || locked}
        style={{ cursor: locked ? 'default' : 'pointer', accentColor: 'var(--color-accent-hover)' }}
      />
      <div>
        <label htmlFor="persist-layout" style={{ ...fieldStyles.checkboxLabel, cursor: locked ? 'default' : 'pointer' }}>
          Save canvas layout in repository
        </label>
        {locked && (
          <div style={fieldStyles.hint}>Layout persistence setting loaded from project metadata.</div>
        )}
        {!locked && (
          <div style={fieldStyles.hint}>
            When enabled, node positions are committed to the repo. When disabled, layout is stored
            locally only.
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div style={fieldStyles.errorBox}>{message}</div>;
}

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--color-border-subtle)',
    marginBottom: 16,
    gap: 0,
  },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: 'var(--color-fg-muted)',
    padding: '8px 12px',
    fontSize: 12,
    cursor: 'pointer',
    marginBottom: -1,
  },
  tabBtnActive: {
    color: 'var(--color-accent-hover)',
    borderBottomColor: 'var(--color-accent-hover)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    maxHeight: 420,
    overflowY: 'auto',
  },
  input: {
    width: '100%',
    background: 'var(--color-bg-deep)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    color: 'var(--color-fg-primary)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 12,
    padding: '6px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputLocked: {
    opacity: 0.7,
    cursor: 'default',
  },
  urlPreview: {
    fontSize: 10,
    color: 'var(--color-state-success)',
    marginTop: 4,
    fontFamily: 'var(--font-family-mono)',
  },
  convertInfo: {
    fontSize: 12,
    color: 'var(--color-fg-secondary)',
    background: 'var(--color-bg-surface-sunken)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 4,
    padding: '8px 12px',
    lineHeight: 1.5,
  },
};

const fieldStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 11,
    color: 'var(--color-fg-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  required: {
    color: 'var(--color-state-error)',
  },
  error: {
    fontSize: 11,
    color: 'var(--color-state-error)',
  },
  hint: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    lineHeight: 1.4,
  },
  errorBox: {
    background: 'var(--color-state-error-bg)',
    border: '1px solid var(--color-state-error-border)',
    borderRadius: 4,
    color: 'var(--color-state-error-fg)',
    fontSize: 12,
    padding: '8px 12px',
  },
  checkboxRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-start',
  },
  checkboxLabel: {
    fontSize: 12,
    color: 'var(--color-fg-primary)',
    display: 'block',
    marginBottom: 2,
  },
};

const progressStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  bar: {
    height: 4,
    background: 'var(--color-bg-surface)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    background: 'var(--color-accent-hover)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  label: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
  },
};
