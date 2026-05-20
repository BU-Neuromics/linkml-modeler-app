/**
 * OpenSchemaFromUrlDialog — opens a LinkML schema directly from a URL as a
 * transient project. The user can Save to a local folder afterward.
 */
import React from 'react';
import { usePlatform } from '../platform/PlatformContext.js';
import { useAppStore } from '../store/index.js';
import { openSchemaFromUrl } from '../project/projectLoader.js';
import { Button } from '../ui/Button.js';
import { Dialog } from '../ui/Dialog.js';

interface OpenSchemaFromUrlDialogProps {
  onClose: () => void;
}

export function OpenSchemaFromUrlDialog({ onClose }: OpenSchemaFromUrlDialogProps) {
  const platform = usePlatform();
  const setProject = useAppStore((s) => s.setProject);
  const pushToast = useAppStore((s) => s.pushToast);

  const [url, setUrl] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const isValidUrl = /^https?:\/\/.+/.test(url.trim());
  const handleClose = () => { if (!loading) onClose(); };

  const handleOpen = async () => {
    if (!isValidUrl) return;
    setLoading(true);
    setError('');
    try {
      const project = await openSchemaFromUrl(url.trim(), platform);
      setProject(project);
      pushToast({
        message: `Opened "${project.name}" — use Save to write to a local folder`,
        severity: 'success',
        durationMs: 4000,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open schema from URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Open Schema from URL"
      size="sm"
      bodyStyle={{ padding: '20px 24px' }}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleOpen}
            disabled={!isValidUrl || loading}
            loading={loading}
          >
            {loading ? 'Opening…' : 'Open'}
          </Button>
        </>
      }
    >
      <label style={ds.label}>Schema URL</label>
      <input
        style={ds.input}
        type="url"
        placeholder="https://example.org/my-schema.yaml"
        value={url}
        onChange={(e) => { setUrl(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && isValidUrl && !loading) handleOpen(); }}
        disabled={loading}
        autoFocus
      />

      <p style={ds.hint}>
        The schema will be fetched and opened as a read/edit project. Relative imports are
        resolved from the URL. Use <strong>Save</strong> to write to a local folder.
      </p>

      {error && (
        <div style={ds.errorBox}>{error}</div>
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
  hint: {
    marginTop: 12,
    marginBottom: 0,
    fontSize: 12,
    color: 'var(--color-fg-secondary)',
    lineHeight: 1.5,
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
