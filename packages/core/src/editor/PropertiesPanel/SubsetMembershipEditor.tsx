/**
 * SubsetMembershipEditor — "In Subsets" section shown in the properties panel.
 *
 * Displays checkboxes for every subset defined in the active schema.
 * Checking/unchecking calls addEntityToSubset / removeEntityFromSubset.
 * Works for classes, enums, and schema-level slots (kind prop).
 */
import { useMemo } from 'react';
import { useAppStore } from '../../store/index.js';
import { SectionHeader } from './internal.js';
import { styles } from './styles.js';

interface Props {
  schemaId: string;
  entityName: string;
  kind: 'class' | 'enum' | 'slot';
}

export function SubsetMembershipEditor({ schemaId, entityName, kind }: Props) {
  const activeSchemaFile = useAppStore((s) =>
    s.activeProject?.schemas.find((sf) => sf.id === schemaId)
  );
  const addEntityToSubset = useAppStore((s) => s.addEntityToSubset);
  const removeEntityFromSubset = useAppStore((s) => s.removeEntityFromSubset);

  const schema = activeSchemaFile?.schema;
  const isReadOnly = activeSchemaFile?.isReadOnly ?? false;

  const subsetNames = useMemo(
    () => (schema ? Object.keys(schema.subsets) : []),
    [schema]
  );

  const membership = useMemo((): string[] => {
    if (!schema) return [];
    if (kind === 'class') return schema.classes[entityName]?.subsetOf ?? [];
    if (kind === 'enum') return schema.enums[entityName]?.subsetOf ?? [];
    return schema.slots[entityName]?.subsetOf ?? [];
  }, [schema, entityName, kind]);

  if (subsetNames.length === 0) return null;

  return (
    <>
      <SectionHeader title="In Subsets" />
      <div style={subsetStyles.list}>
        {subsetNames.map((sn) => {
          const checked = membership.includes(sn);
          return (
            <label key={sn} style={subsetStyles.row}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isReadOnly}
                onChange={() => {
                  if (checked) {
                    removeEntityFromSubset(schemaId, entityName, sn, kind);
                  } else {
                    addEntityToSubset(schemaId, entityName, sn, kind);
                  }
                }}
                style={subsetStyles.checkbox}
              />
              <span style={{ ...styles.viewName, flex: 'unset' }}>{sn}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}

const subsetStyles: Record<string, React.CSSProperties> = {
  list: {
    padding: '4px 10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 11,
    color: 'var(--color-fg-primary)',
  },
  checkbox: {
    accentColor: 'var(--color-state-success)',
    cursor: 'pointer',
    flexShrink: 0,
  },
};
