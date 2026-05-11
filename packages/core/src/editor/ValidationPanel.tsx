/**
 * ValidationPanel — M6 validation results panel.
 *
 * Shows validation issues with severity badges, grouped by category.
 * "Jump" button navigates to the offending entity in the Properties panel.
 * Save is never blocked — this panel is informational/advisory.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { collectImportedEntities } from '../io/importResolver.js';
import type { ValidationIssue, IssueSeverity } from '../validation/index.js';
import { X } from '../ui/icons/index.js';

// ── Severity config ───────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  error: 'var(--color-state-error)',
  warning: 'var(--color-state-warning)',
  info: 'var(--color-state-info)',
};

const SEVERITY_BG: Record<IssueSeverity, string> = {
  error: 'var(--color-state-error-bg)',
  warning: 'var(--color-state-warning-bg)',
  info: 'var(--color-state-info-bg)',
};

const SEVERITY_BORDER: Record<IssueSeverity, string> = {
  error: 'var(--color-state-error-border)',
  warning: 'var(--color-state-warning-border)',
  info: 'var(--color-state-info-bg)',
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: 'ERR',
  warning: 'WRN',
  info: 'INF',
};

// ── Issue row ─────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  onJump,
}: {
  issue: ValidationIssue;
  onJump: (issue: ValidationIssue) => void;
}) {
  return (
    <div
      style={{
        ...styles.issueRow,
        background: SEVERITY_BG[issue.severity],
        borderLeft: `3px solid ${SEVERITY_COLOR[issue.severity]}`,
        borderBottom: `1px solid ${SEVERITY_BORDER[issue.severity]}`,
      }}
    >
      <div style={styles.issueMain}>
        <span
          style={{
            ...styles.severityBadge,
            background: SEVERITY_COLOR[issue.severity],
            color: issue.severity === 'warning' ? 'var(--color-state-warning-on)' : '#fff',
          }}
        >
          {SEVERITY_LABEL[issue.severity]}
        </span>
        <span style={styles.issueMessage}>{issue.message}</span>
      </div>
      <div style={styles.issueMeta}>
        <span style={styles.issuePath}>{issue.path}</span>
        {issue.jump && (
          <button style={styles.jumpBtn} onClick={() => onJump(issue)} title="Jump to source">
            ↗ jump
          </button>
        )}
      </div>
    </div>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({
  issues,
  onRun,
  lastValidatedAt,
}: {
  issues: ValidationIssue[];
  onRun: () => void;
  lastValidatedAt: number | null;
}) {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  const [timeAgo, setTimeAgo] = useState<number | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() =>
      setTimeAgo(lastValidatedAt !== null ? Math.round((Date.now() - lastValidatedAt) / 1000) : null)
    );
  }, [lastValidatedAt]);

  return (
    <div style={styles.summaryBar}>
      <div style={styles.summaryCounts}>
        {errorCount > 0 && (
          <span style={{ ...styles.countBadge, background: SEVERITY_COLOR.error, color: '#fff' }}>
            {errorCount} error{errorCount !== 1 ? 's' : ''}
          </span>
        )}
        {warnCount > 0 && (
          <span style={{ ...styles.countBadge, background: SEVERITY_COLOR.warning, color: 'var(--color-state-warning-on)' }}>
            {warnCount} warning{warnCount !== 1 ? 's' : ''}
          </span>
        )}
        {infoCount > 0 && (
          <span style={{ ...styles.countBadge, background: SEVERITY_COLOR.info, color: '#fff' }}>
            {infoCount} info
          </span>
        )}
        {issues.length === 0 && lastValidatedAt !== null && (
          <span style={styles.allClear}>✓ No issues</span>
        )}
        {lastValidatedAt === null && (
          <span style={styles.notRun}>Not validated yet</span>
        )}
      </div>
      <div style={styles.summaryRight}>
        {timeAgo !== null && (
          <span style={styles.timeAgo}>{timeAgo}s ago</span>
        )}
        <button style={styles.runBtn} onClick={onRun} title="Run validation">
          ▶ Validate
        </button>
      </div>
    </div>
  );
}

// ── Filter controls ───────────────────────────────────────────────────────────

type SeverityFilter = 'all' | IssueSeverity;

function FilterBar({
  active,
  onChange,
  counts,
}: {
  active: SeverityFilter;
  onChange: (f: SeverityFilter) => void;
  counts: Record<IssueSeverity, number>;
}) {
  const opts: { key: SeverityFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'error', label: `Errors (${counts.error})` },
    { key: 'warning', label: `Warnings (${counts.warning})` },
    { key: 'info', label: `Info (${counts.info})` },
  ];

  return (
    <div style={styles.filterBar}>
      {opts.map((o) => (
        <button
          key={o.key}
          style={{
            ...styles.filterBtn,
            ...(active === o.key ? styles.filterBtnActive : {}),
          }}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ValidationPanel() {
  const validationPanelOpen = useAppStore((s) => s.validationPanelOpen);
  const setValidationPanelOpen = useAppStore((s) => s.setValidationPanelOpen);
  const validationIssues = useAppStore((s) => s.validationIssues);
  const lastValidatedAt = useAppStore((s) => s.lastValidatedAt);
  const runValidation = useAppStore((s) => s.runValidation);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);
  const activeSchema = useAppStore((s) => s.getActiveSchema());
  const activeProject = useAppStore((s) => s.activeProject);

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const handleRun = useCallback(() => {
    if (!activeSchema) return;
    const imported = activeProject
      ? collectImportedEntities(activeSchema, activeProject.schemas)
      : [];
    const externalNames = {
      classes: new Set(imported.filter((e) => e.type === 'class').map((e) => e.name)),
      enums: new Set(imported.filter((e) => e.type === 'enum').map((e) => e.name)),
    };
    runValidation(activeSchema.schema, externalNames);
  }, [activeSchema, activeProject, runValidation]);

  const handleJump = useCallback(
    (issue: ValidationIssue) => {
      if (!issue.jump) return;
      if (issue.jump.type === 'class') {
        setActiveEntity({ type: 'class', className: issue.jump.className });
      } else if (issue.jump.type === 'enum') {
        setActiveEntity({ type: 'enum', enumName: issue.jump.enumName });
      } else {
        setActiveEntity(null);
      }
    },
    [setActiveEntity]
  );

  const counts = useMemo(
    () => ({
      error: validationIssues.filter((i) => i.severity === 'error').length,
      warning: validationIssues.filter((i) => i.severity === 'warning').length,
      info: validationIssues.filter((i) => i.severity === 'info').length,
    }),
    [validationIssues]
  );

  const filtered = useMemo(
    () =>
      severityFilter === 'all'
        ? validationIssues
        : validationIssues.filter((i) => i.severity === severityFilter),
    [validationIssues, severityFilter]
  );

  if (!validationPanelOpen) {
    return (
      <button
        id="lme-validation-panel"
        style={styles.collapsedBar}
        onClick={() => setValidationPanelOpen(true)}
        aria-label="Open validation panel"
      >
        <span style={styles.collapsedLabel}>Validation</span>
        {counts.error > 0 && (
          <span style={{ ...styles.collapsedBadge, background: SEVERITY_COLOR.error }}>
            {counts.error}
          </span>
        )}
        {counts.error === 0 && counts.warning > 0 && (
          <span style={{ ...styles.collapsedBadge, background: SEVERITY_COLOR.warning, color: 'var(--color-state-warning-on)' }}>
            {counts.warning}
          </span>
        )}
      </button>
    );
  }

  return (
    <div id="lme-validation-panel" style={styles.panel}>
      {/* Header */}
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Validation</span>
        <button
          style={styles.closeBtn}
          onClick={() => setValidationPanelOpen(false)}
          title="Close"
        >
          <X size={12} />
        </button>
      </div>

      {/* Non-blocking notice */}
      <div style={styles.notice}>
        Errors and warnings are informational — save is never blocked.
      </div>

      {/* Summary + run button */}
      <SummaryBar
        issues={validationIssues}
        onRun={handleRun}
        lastValidatedAt={lastValidatedAt}
      />

      {/* Filters */}
      {validationIssues.length > 0 && (
        <FilterBar active={severityFilter} onChange={setSeverityFilter} counts={counts} />
      )}

      {/* Issues list */}
      <div style={styles.issuesList}>
        {filtered.length === 0 && lastValidatedAt !== null ? (
          <div style={styles.emptyList}>
            {severityFilter === 'all'
              ? 'No issues found.'
              : `No ${severityFilter} issues.`}
          </div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyList}>
            Click &quot;Validate&quot; to run the validation engine.
          </div>
        ) : (
          filtered.map((issue) => (
            <IssueRow key={issue.id} issue={issue} onJump={handleJump} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-surface-sunken)',
    borderTop: '1px solid var(--color-border-subtle)',
    height: 260,
    flexShrink: 0,
    overflow: 'hidden',
  },
  collapsedBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    background: 'var(--color-bg-deep)',
    border: 'none',
    borderTop: '1px solid var(--color-border-subtle)',
    cursor: 'pointer',
    flexShrink: 0,
    userSelect: 'none',
    width: '100%',
    textAlign: 'left',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  collapsedLabel: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  collapsedBadge: {
    borderRadius: 10,
    padding: '0 5px',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--color-fg-on-accent)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    background: 'var(--color-bg-deep)',
  },
  panelTitle: {
    fontWeight: 700,
    fontSize: 10,
    color: 'var(--color-fg-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-strong)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 2px',
    lineHeight: 1,
  },
  notice: {
    padding: '4px 12px',
    fontSize: 10,
    color: 'var(--color-border-default)',
    fontStyle: 'italic',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    background: 'var(--color-bg-surface-sunken)',
  },
  summaryCounts: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  countBadge: {
    borderRadius: 10,
    padding: '1px 7px',
    fontSize: 10,
    fontWeight: 700,
  },
  allClear: {
    fontSize: 11,
    color: 'var(--color-state-success)',
    fontWeight: 600,
  },
  notRun: {
    fontSize: 11,
    color: 'var(--color-border-strong)',
    fontStyle: 'italic',
  },
  summaryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  timeAgo: {
    fontSize: 10,
    color: 'var(--color-border-default)',
  },
  runBtn: {
    background: 'var(--color-class-concrete)',
    border: '1px solid var(--color-accent-active)',
    color: 'var(--color-fg-on-accent)',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: 600,
  },
  filterBar: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  filterBtn: {
    background: 'transparent',
    border: 'none',
    borderRight: '1px solid var(--color-border-subtle)',
    color: 'var(--color-fg-muted)',
    padding: '4px 10px',
    fontSize: 10,
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: 'var(--color-bg-surface)',
    color: 'var(--color-state-info-fg)',
    fontWeight: 700,
  },
  issuesList: {
    flex: 1,
    overflowY: 'auto',
  },
  issueRow: {
    padding: '5px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  issueMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  severityBadge: {
    fontSize: 9,
    fontWeight: 700,
    borderRadius: 3,
    padding: '1px 4px',
    flexShrink: 0,
  },
  issueMessage: {
    fontSize: 11,
    color: 'var(--color-fg-primary)',
    flex: 1,
  },
  issueMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 24,
  },
  issuePath: {
    fontSize: 10,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-border-strong)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  jumpBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-accent-hover)',
    borderRadius: 3,
    padding: '1px 6px',
    fontSize: 10,
    cursor: 'pointer',
    flexShrink: 0,
  },
  emptyList: {
    padding: '16px 12px',
    fontSize: 12,
    color: 'var(--color-border-strong)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
};
