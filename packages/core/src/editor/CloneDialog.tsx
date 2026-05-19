/**
 * CloneDialog — lets users clone a git repository by URL.
 *
 * Fields: Repository URL (HTTPS), optional branch, optional credentials.
 * Shows progress during clone, then opens the cloned project.
 */
import React from 'react';
import { usePlatform } from '../platform/PlatformContext.js';
import { useAppStore } from '../store/index.js';
import { openProjectFromDirectory } from '../project/projectLoader.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';

interface CloneDialogProps {
  onClose: () => void;
}

type CloneState = 'idle' | 'cloning' | 'opening' | 'done' | 'error';

export function CloneDialog({ onClose }: CloneDialogProps) {
  const platform = usePlatform();
  const setProject = useAppStore((s) => s.setProject);
  const setGitAvailable = useAppStore((s) => s.setGitAvailable);
  const pushToast = useAppStore((s) => s.pushToast);
  const setHiddenSchemaIds = useAppStore((s) => s.setHiddenSchemaIds);
  const setViews = useAppStore((s) => s.setViews);
  const setActiveViewId = useAppStore((s) => s.setActiveViewId);

  const [url, setUrl] = React.useState('');
  const [branch, setBranch] = React.useState('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showCredentials, setShowCredentials] = React.useState(false);
  const [state, setState] = React.useState<CloneState>('idle');
  const [progress, setProgress] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState('');

  const isValidUrl = /^https?:\/\/.+/.test(url.trim());
  const isBusy = state === 'cloning' || state === 'opening';

  const handleClose = () => { if (!isBusy) onClose(); };

  const handleClone = async () => {
    if (!isValidUrl) return;

    setState('cloning');
    setProgress('Initializing clone...');
    setErrorMsg('');

    const repoName = url.trim().split('/').pop()?.replace(/\.git$/, '') || 'cloned-repo';
    const projectsDir = await platform.getProjectsPath();
    const destPath = `${projectsDir}/${repoName}-${Date.now()}`;

    const credentials = showCredentials && username
      ? { username, password }
      : undefined;

    const result = await platform.gitClone(url.trim(), destPath, {
      branch: branch.trim() || undefined,
      credentials,
      onProgress: (phase, loaded, total) => {
        if (total > 0) {
          setProgress(`${phase}: ${loaded}/${total}`);
        } else {
          setProgress(`${phase}: ${loaded}`);
        }
      },
    });

    if (!result.ok) {
      setState('error');
      setErrorMsg(result.error ?? 'Clone failed');
      return;
    }

    setState('opening');
    setProgress('Scanning for LinkML schemas...');

    try {
      const { project, hiddenSchemaIds, views, activeViewId } = await openProjectFromDirectory(result.destPath, platform);
      if (project.schemas.length === 0) {
        pushToast({ message: 'Repository cloned but no LinkML schemas found', severity: 'warning' });
      }
      project.rootPath = result.destPath;
      setProject(project);
      setHiddenSchemaIds(hiddenSchemaIds);
      setViews(views);
      setActiveViewId(activeViewId);
      setGitAvailable(true);
      pushToast({ message: `Cloned ${repoName} successfully`, severity: 'success', durationMs: 3000 });
      onClose();
    } catch (err) {
      setState('error');
      setErrorMsg(`Clone succeeded but failed to open project: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Clone Repository"
      size="sm"
      bodyStyle={{ padding: '20px 24px' }}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isBusy}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleClone}
            disabled={!isValidUrl || isBusy}
            loading={isBusy}
          >
            {isBusy ? 'Cloning…' : 'Clone'}
          </Button>
        </>
      }
    >
      <label style={ds.label}>Repository URL (HTTPS)</label>
      <input
        style={ds.input}
        type="url"
        placeholder="https://github.com/user/repo.git"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isBusy}
        autoFocus
      />

      <label style={ds.label}>Branch (optional)</label>
      <input
        style={ds.input}
        type="text"
        placeholder="main"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        disabled={isBusy}
      />

      <button
        style={ds.credToggle}
        onClick={() => setShowCredentials(!showCredentials)}
        disabled={isBusy}
        type="button"
      >
        {showCredentials ? '- Hide credentials' : '+ Add credentials (private repos)'}
      </button>

      {showCredentials && (
        <>
          <label style={ds.label}>Username</label>
          <input
            style={ds.input}
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isBusy}
          />
          <label style={ds.label}>Token / Password</label>
          <input
            style={ds.input}
            type="password"
            placeholder="ghp_... or password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBusy}
          />
        </>
      )}

      {isBusy && (
        <div style={ds.progressBar}>
          <div style={ds.spinner} />
          <span style={ds.progressText}>{progress}</span>
        </div>
      )}

      {state === 'error' && (
        <div style={ds.errorBox}>{errorMsg}</div>
      )}
    </Dialog>
  );
}

const ds: Record<string, React.CSSProperties> = {
  label: {
    display: 'block',
    fontSize: 11,
    color: 'var(--color-fg-secondary)',
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--color-bg-canvas)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 5,
    color: 'var(--color-fg-primary)',
    fontSize: 13,
    fontFamily: 'var(--font-family-mono)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  credToggle: {
    display: 'inline-block',
    marginTop: 12,
    background: 'transparent',
    border: 'none',
    color: 'var(--color-accent-hover)',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
  },
  progressBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: '8px 10px',
    background: 'var(--color-bg-canvas)',
    borderRadius: 5,
    border: '1px solid var(--color-border-default)',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid var(--color-border-default)',
    borderTop: '2px solid var(--color-accent-hover)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  },
  progressText: {
    fontSize: 11,
    color: 'var(--color-fg-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  errorBox: {
    marginTop: 12,
    padding: '8px 10px',
    background: 'var(--color-state-error-bg)',
    border: '1px solid var(--color-state-error-border)',
    borderRadius: 5,
    color: 'var(--color-state-error-fg)',
    fontSize: 12,
    wordBreak: 'break-word',
  },
};
