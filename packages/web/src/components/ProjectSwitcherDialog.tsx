// ProjectSwitcherDialog — lists all registered projects and allows switching.

import React from 'react';
import { useAppStore, openProjectFromDirectory, Button, Dialog } from '@linkml-editor/core';
import { usePlatform } from '@linkml-editor/core';
import { WebProjectRegistry, type ProjectRegistryEntry } from '../platform/ProjectRegistry.js';

const registry = new WebProjectRegistry();

interface ProjectSwitcherDialogProps {
  onClose: () => void;
}

export function ProjectSwitcherDialog({ onClose }: ProjectSwitcherDialogProps) {
  const platform = usePlatform();
  const activeProject = useAppStore((s) => s.activeProject);
  const closeProject = useAppStore((s) => s.closeProject);
  const setProject = useAppStore((s) => s.setProject);
  const pushToast = useAppStore((s) => s.pushToast);
  const setHiddenSchemaIds = useAppStore((s) => s.setHiddenSchemaIds);

  const [projects, setProjects] = React.useState<ProjectRegistryEntry[]>(() =>
    registry.getAll().sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  );
  const [loading, setLoading] = React.useState(false);
  const [removingUrl, setRemovingUrl] = React.useState<string | null>(null);

  const handleSelect = async (entry: ProjectRegistryEntry) => {
    if (activeProject?.rootPath === entry.localPath) {
      onClose();
      return;
    }

    const wasDirty = closeProject();
    if (wasDirty) {
      pushToast({ message: 'Unsaved changes were discarded when switching projects', severity: 'warning' });
    }

    setLoading(true);
    try {
      const { project, hiddenSchemaIds } = await openProjectFromDirectory(entry.localPath, platform);
      if (project.schemas.length === 0) {
        pushToast({ message: `No LinkML schemas found in "${entry.repoName}"`, severity: 'warning' });
        setLoading(false);
        return;
      }
      project.name = entry.repoName;
      if (entry.repoUrl) {
        project.gitConfig = {
          enabled: true,
          remoteUrl: entry.repoUrl,
          defaultBranch: 'main',
        };
      }
      setProject(project);
      setHiddenSchemaIds(hiddenSchemaIds);
      onClose();
    } catch (err) {
      pushToast({
        message: `Failed to open "${entry.repoName}": ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
      setLoading(false);
    }
  };

  const handleRemoveRequest = (e: React.MouseEvent, repoUrl: string) => {
    e.stopPropagation();
    setRemovingUrl(repoUrl);
  };

  const handleRemoveConfirm = () => {
    if (!removingUrl) return;
    registry.remove(removingUrl);
    setProjects(registry.getAll().sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)));
    setRemovingUrl(null);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      const diffDays = Math.floor(diffHrs / 24);
      if (diffDays < 7) return `${diffDays}d ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const confirmFooter = removingUrl ? (
    <>
      <span style={s.confirmText}>Remove this project from the registry?</span>
      <Button variant="danger" size="sm" onClick={handleRemoveConfirm}>Remove</Button>
      <Button variant="secondary" size="sm" onClick={() => setRemovingUrl(null)}>Cancel</Button>
    </>
  ) : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Switch Project"
      size="md"
      bodyStyle={{ padding: 0 }}
      footer={confirmFooter}
    >
      {loading ? (
        <div style={s.loading}>Opening project…</div>
      ) : projects.length === 0 ? (
        <div style={s.empty}>No registered projects found.</div>
      ) : (
        <div style={s.list}>
          {projects.map((entry) => {
            const isCurrent = activeProject?.rootPath === entry.localPath;
            return (
              <div
                key={entry.repoUrl || entry.localPath}
                style={{
                  ...s.item,
                  ...(isCurrent ? s.itemCurrent : {}),
                }}
                onClick={() => !isCurrent && handleSelect(entry)}
                onMouseEnter={(e) => {
                  if (!isCurrent) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-surface)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-default)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCurrent) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--color-bg-surface-sunken)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-subtle)';
                  }
                }}
              >
                <div style={s.itemInfo}>
                  <div style={s.itemName}>
                    {entry.repoName}
                    {isCurrent && <span style={s.currentBadge}>current</span>}
                  </div>
                  {entry.repoUrl && (
                    <div style={s.itemUrl}>{entry.repoUrl}</div>
                  )}
                  <div style={s.itemPath}>{entry.localPath}</div>
                </div>
                <div style={s.itemMeta}>
                  <span style={s.itemDate}>{formatDate(entry.lastOpenedAt)}</span>
                  {!isCurrent && (
                    <button
                      style={s.removeBtn}
                      onClick={(e) => handleRemoveRequest(e, entry.repoUrl || entry.localPath)}
                      title="Remove from registry"
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

const s: Record<string, React.CSSProperties> = {
  loading: {
    padding: 32,
    textAlign: 'center',
    color: 'var(--color-fg-secondary)',
    fontSize: 13,
  },
  empty: {
    padding: 32,
    textAlign: 'center',
    color: 'var(--color-fg-muted)',
    fontSize: 13,
  },
  list: {
    overflowY: 'auto',
    flex: 1,
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: '60vh',
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: 'var(--color-bg-surface-sunken)',
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    gap: 12,
  },
  itemCurrent: {
    background: 'var(--color-bg-surface-sunken)',
    border: '1px solid var(--color-border-strong)',
    cursor: 'default',
  },
  itemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    minWidth: 0,
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-fg-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  currentBadge: {
    fontSize: 10,
    color: 'var(--color-accent-hover)',
    background: 'var(--color-state-info-bg)',
    border: '1px solid #1e4080',
    borderRadius: 3,
    padding: '1px 5px',
    fontWeight: 500,
  },
  itemUrl: {
    fontSize: 10,
    color: 'var(--color-accent-hover)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-mono)',
  },
  itemPath: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-mono)',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  itemDate: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-strong)',
    cursor: 'pointer',
    padding: '2px 4px',
    fontSize: 16,
    lineHeight: 1,
    borderRadius: 3,
  },
  confirmText: {
    fontSize: 12,
    color: 'var(--color-state-warning-fg)',
    flex: 1,
  },
};
