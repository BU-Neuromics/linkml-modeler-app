import React from 'react';
import { useAppStore, useTemporalStore } from '../store/index.js';
import { startTour, HELP_TOUR_DEFS, type TourId } from '../tours/index.js';
import { version } from '../../package.json';
import { useTheme } from '../ui/useTheme.js';

// ── Types ────────────────────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  checked?: boolean;
  separator?: false;
  disabled?: boolean;
}

interface MenuSeparator {
  separator: true;
}

type MenuEntry = MenuItem | MenuSeparator;

interface MenuBarProps {
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onOpenFromUrl?: () => void;
  onSwitchProject?: () => void;
  onNewSchema?: () => void;
  onImportSchema?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onCloseProject?: () => void;
  onCommit?: () => void;
  onPush?: () => void;
  onPull?: () => void;
}

// ── DropdownMenu ─────────────────────────────────────────────────────────────
function DropdownMenu({
  label,
  items,
  isOpen,
  onToggle,
  onClose,
  onHover,
}: {
  label: string;
  items: MenuEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onHover: () => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = React.useState(-1);

  React.useEffect(() => {
    if (!isOpen) {
      void Promise.resolve().then(() => setHoveredIndex(-1));
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      const actionItems = items.reduce<number[]>((acc, item, i) => {
        if (!('separator' in item && item.separator)) acc.push(i);
        return acc;
      }, []);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHoveredIndex((prev) => {
          const currentActionIdx = actionItems.indexOf(prev);
          const nextIdx = currentActionIdx < actionItems.length - 1 ? currentActionIdx + 1 : 0;
          return actionItems[nextIdx];
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHoveredIndex((prev) => {
          const currentActionIdx = actionItems.indexOf(prev);
          const nextIdx = currentActionIdx > 0 ? currentActionIdx - 1 : actionItems.length - 1;
          return actionItems[nextIdx];
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[hoveredIndex];
        if (item && !('separator' in item && item.separator) && !item.disabled && item.action) {
          item.action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, items, hoveredIndex, onClose]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        style={{
          ...menuStyles.trigger,
          ...(isOpen ? menuStyles.triggerActive : {}),
        }}
        onClick={onToggle}
        onMouseEnter={onHover}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
      </button>
      {isOpen && (
        <div style={menuStyles.dropdown} role="menu">
          {items.map((item, i) => {
            if ('separator' in item && item.separator) {
              return <div key={i} style={menuStyles.separator} role="separator" />;
            }
            const mi = item as MenuItem;
            return (
              <button
                key={i}
                role="menuitem"
                style={{
                  ...menuStyles.item,
                  ...(hoveredIndex === i ? menuStyles.itemHover : {}),
                  ...(mi.disabled ? menuStyles.itemDisabled : {}),
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(-1)}
                onClick={() => {
                  if (!mi.disabled && mi.action) {
                    mi.action();
                    onClose();
                  }
                }}
                disabled={mi.disabled}
              >
                <span style={menuStyles.itemLabel}>
                  {mi.checked !== undefined && (
                    <span style={menuStyles.check}>{mi.checked ? '\u2713' : '\u00A0'}</span>
                  )}
                  {mi.label}
                </span>
                {mi.shortcut && <span style={menuStyles.shortcut}>{mi.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MenuBar ──────────────────────────────────────────────────────────────────
export function MenuBar({
  onNewProject,
  onOpenProject,
  onOpenFromUrl,
  onSwitchProject,
  onNewSchema,
  onImportSchema,
  onSave,
  onSaveAs,
  onCloseProject,
  onCommit,
  onPush,
  onPull,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const anyOpen = openMenu !== null;

  const isDirty = useAppStore((s) => s.getIsDirty());
  const activeProject = useAppStore((s) => s.activeProject);
  const projectPanelOpen = useAppStore((s) => s.projectPanelOpen);
  const propertiesPanelOpen = useAppStore((s) => s.propertiesPanelOpen);
  const validationPanelOpen = useAppStore((s) => s.validationPanelOpen);
  const gitPanelOpen = useAppStore((s) => s.gitPanelOpen);
  const yamlPreviewOpen = useAppStore((s) => s.yamlPreviewOpen);
  const setProjectPanelOpen = useAppStore((s) => s.setProjectPanelOpen);
  const setPropertiesPanelOpen = useAppStore((s) => s.setPropertiesPanelOpen);
  const setValidationPanelOpen = useAppStore((s) => s.setValidationPanelOpen);
  const setGitPanelOpen = useAppStore((s) => s.setGitPanelOpen);
  const setYamlPreviewOpen = useAppStore((s) => s.setYamlPreviewOpen);
  const setSchemaSettingsOpen = useAppStore((s) => s.setSchemaSettingsOpen);

  const { theme, setTheme } = useTheme();

  const [aboutOpen, setAboutOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);

  const launchTour = React.useCallback((id: TourId) => {
    const store = useAppStore.getState();
    startTour(id, {
      openValidationPanel: () => store.setValidationPanelOpen(true),
      openGitPanel: () => store.setGitPanelOpen(true),
      openPropertiesPanel: () => store.setPropertiesPanelOpen(true),
      openYamlPreview: () => store.setYamlPreviewOpen(true),
      openProjectPanel: () => store.setProjectPanelOpen(true),
    });
  }, []);

  const toggle = (menu: string) => setOpenMenu((prev) => (prev === menu ? null : menu));
  const close = () => setOpenMenu(null);
  const hover = (menu: string) => {
    if (anyOpen) setOpenMenu(menu);
  };

  const fileItems: MenuEntry[] = [
    { label: 'New Project', action: onNewProject, disabled: !onNewProject },
    { label: 'Open Project\u2026', shortcut: 'Ctrl+O', action: onOpenProject, disabled: !onOpenProject },
    { label: 'Open from URL\u2026', action: onOpenFromUrl, disabled: !onOpenFromUrl },
    { label: 'Switch Project\u2026', action: onSwitchProject, disabled: !onSwitchProject },
    { separator: true },
    { label: 'New Schema\u2026', action: onNewSchema, disabled: !activeProject || !onNewSchema },
    { label: 'Import Schema\u2026', action: onImportSchema, disabled: !activeProject || !onImportSchema },
    { separator: true },
    { label: 'Save', shortcut: 'Ctrl+S', action: onSave, disabled: !isDirty || !onSave },
    { label: 'Save As\u2026', action: onSaveAs, disabled: !activeProject || !onSaveAs },
    { separator: true },
    { label: 'Schema Settings\u2026', action: () => setSchemaSettingsOpen(true) },
    { separator: true },
    { label: 'Close Project', action: onCloseProject, disabled: !activeProject || !onCloseProject },
  ];

  const temporal = useTemporalStore();
  const editItems: MenuEntry[] = [
    { label: 'Undo', shortcut: 'Ctrl+Z', action: () => temporal.undo(), disabled: temporal.pastStates.length === 0 },
    { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => temporal.redo(), disabled: temporal.futureStates.length === 0 },
  ];

  const viewItems: MenuEntry[] = [
    { label: 'Project Panel', checked: projectPanelOpen, action: () => setProjectPanelOpen(!projectPanelOpen) },
    { label: 'Properties Panel', checked: propertiesPanelOpen, action: () => setPropertiesPanelOpen(!propertiesPanelOpen) },
    { label: 'Validation Panel', checked: validationPanelOpen, action: () => setValidationPanelOpen(!validationPanelOpen) },
    { label: 'Git Panel', checked: gitPanelOpen, action: () => setGitPanelOpen(!gitPanelOpen) },
    { label: 'YAML Preview', checked: yamlPreviewOpen, action: () => setYamlPreviewOpen(!yamlPreviewOpen) },
    { separator: true },
    { label: 'Theme: Dark', checked: theme === 'dark', action: () => setTheme('dark') },
    { label: 'Theme: Light', checked: theme === 'light', action: () => setTheme('light') },
    { label: 'Theme: System', checked: theme === 'system', action: () => setTheme('system') },
  ];

  const gitItems: MenuEntry[] = [
    { label: 'Commit\u2026', action: onCommit, disabled: !onCommit },
    { label: 'Push', action: onPush, disabled: !onPush },
    { label: 'Pull', action: onPull, disabled: !onPull },
    { separator: true },
    { label: 'Toggle Git Panel', checked: gitPanelOpen, action: () => setGitPanelOpen(!gitPanelOpen) },
  ];

  // Build Help-menu tour items from the exported HELP_TOUR_DEFS constant.
  // The first def (requiresProject: false) gets its own group before the separator;
  // all project-required defs are listed after the separator.
  const alwaysTourItems: MenuEntry[] = HELP_TOUR_DEFS
    .filter((def) => !def.requiresProject)
    .map((def) => ({ label: def.label, action: () => launchTour(def.id) }));
  const projectTourItems: MenuEntry[] = HELP_TOUR_DEFS
    .filter((def) => def.requiresProject)
    .map((def) => ({ label: def.label, action: () => launchTour(def.id), disabled: !activeProject }));

  const helpItems: MenuEntry[] = [
    ...alwaysTourItems,
    { separator: true },
    ...projectTourItems,
    { separator: true },
    { label: 'Keyboard Shortcuts', action: () => setShortcutsOpen(true) },
    { label: 'Documentation', action: () => window.open('https://linkml.io/linkml/', '_blank') },
    { separator: true },
    { label: 'About', action: () => setAboutOpen(true) },
  ];

  return (
    <>
      <nav id="lme-menubar" style={menuStyles.bar} role="menubar">
        <DropdownMenu label="File" items={fileItems} isOpen={openMenu === 'file'} onToggle={() => toggle('file')} onClose={close} onHover={() => hover('file')} />
        <DropdownMenu label="Edit" items={editItems} isOpen={openMenu === 'edit'} onToggle={() => toggle('edit')} onClose={close} onHover={() => hover('edit')} />
        <DropdownMenu label="View" items={viewItems} isOpen={openMenu === 'view'} onToggle={() => toggle('view')} onClose={close} onHover={() => hover('view')} />
        <DropdownMenu label="Git" items={gitItems} isOpen={openMenu === 'git'} onToggle={() => toggle('git')} onClose={close} onHover={() => hover('git')} />
        <span id="lme-help-menu"><DropdownMenu label="Help" items={helpItems} isOpen={openMenu === 'help'} onToggle={() => toggle('help')} onClose={close} onHover={() => hover('help')} /></span>
      </nav>

      {/* About dialog */}
      {aboutOpen && (
        <div style={dialogStyles.overlay} onClick={() => setAboutOpen(false)}>
          <div style={dialogStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <h2 style={dialogStyles.title}>LinkML Visual Schema Editor</h2>
            <p style={dialogStyles.text}>Version {version}</p>
            <p style={dialogStyles.text}>
              A cross-platform graphical tool for authoring LinkML schemas on an ERD-style canvas.
            </p>
            <p style={dialogStyles.text}>
              Built with React, ReactFlow, and Zustand.
            </p>
            <button style={dialogStyles.closeBtn} onClick={() => setAboutOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts dialog */}
      {shortcutsOpen && (
        <div style={dialogStyles.overlay} onClick={() => setShortcutsOpen(false)}>
          <div style={{ ...dialogStyles.dialog, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={dialogStyles.title}>Keyboard Shortcuts</h2>
            <table style={dialogStyles.table}>
              <tbody>
                {[
                  ['Ctrl+S', 'Save project'],
                  ['Ctrl+Z', 'Undo'],
                  ['Ctrl+Shift+Z', 'Redo'],
                  ['Delete', 'Delete selected'],
                  ['F', 'Fit view'],
                  ['Shift+Click', 'Multi-select'],
                  ['Right-click canvas', 'Add class/enum'],
                ].map(([key, desc]) => (
                  <tr key={key}>
                    <td style={dialogStyles.keyCell}><kbd style={dialogStyles.kbd}>{key}</kbd></td>
                    <td style={dialogStyles.descCell}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={dialogStyles.closeBtn} onClick={() => setShortcutsOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Menu styles ──────────────────────────────────────────────────────────────
const menuStyles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  trigger: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-fg-secondary)',
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: 3,
  },
  triggerActive: {
    background: 'var(--color-bg-surface)',
    color: 'var(--color-fg-primary)',
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 2000,
    minWidth: 220,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 6,
    padding: '4px 0',
    boxShadow: 'var(--shadow-popover)',
    marginTop: 2,
  },
  separator: {
    height: 1,
    background: 'var(--color-border-default)',
    margin: '4px 0',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-fg-primary)',
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
  },
  itemHover: {
    background: 'var(--color-border-default)',
  },
  itemDisabled: {
    color: 'var(--color-border-strong)',
    cursor: 'default',
  },
  itemLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  check: {
    fontSize: 11,
    width: 14,
    display: 'inline-block',
    color: 'var(--color-accent-hover)',
  },
  shortcut: {
    fontSize: 10,
    color: 'var(--color-fg-muted)',
    marginLeft: 16,
  },
};

// ── Dialog styles ────────────────────────────────────────────────────────────
const dialogStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3000,
  },
  dialog: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 8,
    padding: '24px',
    maxWidth: 360,
    width: '90%',
    color: 'var(--color-fg-primary)',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginTop: 0,
    marginBottom: 12,
    color: 'var(--color-accent-hover)',
  },
  text: {
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--color-fg-secondary)',
    margin: '0 0 8px',
  },
  closeBtn: {
    marginTop: 16,
    background: 'var(--color-border-default)',
    border: '1px solid var(--color-border-strong)',
    color: 'var(--color-fg-primary)',
    borderRadius: 5,
    padding: '6px 16px',
    fontSize: 12,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 4,
  },
  keyCell: {
    padding: '4px 8px 4px 0',
    verticalAlign: 'middle',
    width: 160,
  },
  descCell: {
    padding: '4px 0',
    fontSize: 12,
    color: 'var(--color-fg-secondary)',
  },
  kbd: {
    display: 'inline-block',
    background: 'var(--color-bg-canvas)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 3,
    padding: '2px 6px',
    fontSize: 11,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-primary)',
  },
};
