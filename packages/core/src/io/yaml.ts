// YAML Round-Trip Engine for LinkML schemas
// Parses LinkML YAML into internal TypeScript model and serializes back with fidelity.

import * as jsyaml from 'js-yaml';
import type {
  LinkMLSchema,
  ClassDefinition,
  SlotDefinition,
  EnumDefinition,
  PermissibleValue,
  ReachableFrom,
  SubsetDefinition,
  TypeDefinition,
  ClassRule,
  AnonymousClassExpression,
  SlotCondition,
} from '../model/index.js';

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateSchema(schema: LinkMLSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!schema.id) errors.push({ path: 'id', message: 'Schema must have an id (URI)', severity: 'error' });
  if (!schema.name) errors.push({ path: 'name', message: 'Schema must have a name', severity: 'error' });
  if (!schema.defaultPrefix) errors.push({ path: 'default_prefix', message: 'Schema should have a default_prefix', severity: 'warning' });

  for (const [className, cls] of Object.entries(schema.classes)) {
    if (!cls.name) errors.push({ path: `classes.${className}.name`, message: 'Class must have a name', severity: 'error' });
    if (cls.isA && !(cls.isA in schema.classes)) {
      errors.push({ path: `classes.${className}.is_a`, message: `Parent class '${cls.isA}' not found in schema`, severity: 'warning' });
    }
    for (const slotRef of cls.slots) {
      if (!(slotRef in schema.slots)) {
        errors.push({
          path: `classes.${className}.slots`,
          message: `Slot reference '${slotRef}' not found in schema slots`,
          severity: 'warning',
        });
      }
    }
  }

  for (const [enumName, enm] of Object.entries(schema.enums)) {
    if (!enm.name) errors.push({ path: `enums.${enumName}.name`, message: 'Enum must have a name', severity: 'error' });
  }

  return errors;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

const KNOWN_SCHEMA_KEYS = new Set([
  'id', 'name', 'title', 'description', 'version', 'license',
  'prefixes', 'default_prefix', 'default_range', 'default_curi_maps',
  'imports', 'subsets', 'types', 'slots', 'enums', 'classes',
  'see_also', 'source_file', 'generation_date',
  // legacy / common
  'status', 'keywords', 'contributors', 'creators', 'notes',
  'comments', 'from_schema', 'in_subset', 'deprecated',
]);

const KNOWN_CLASS_KEYS = new Set([
  'name', 'description', 'is_a', 'mixins', 'abstract', 'mixin',
  'tree_root', 'subset_of', 'slots', 'attributes', 'slot_usage',
  'union_of', 'class_uri', 'from_schema', 'see_also',
  'status', 'notes', 'comments', 'deprecated', 'aliases',
  'alt_descriptions', 'local_names', 'mappings',
  'exact_mappings', 'close_mappings', 'broad_mappings', 'narrow_mappings',
  'related_mappings', 'rules',
]);

const KNOWN_SLOT_KEYS = new Set([
  'name', 'description', 'range', 'required', 'recommended',
  'multivalued', 'identifier', 'key', 'inlined', 'inlined_as_list',
  'domain', 'domain_of', 'subset_of', 'ifabsent', 'alias',
  'slot_uri', 'mappings', 'exact_mappings', 'close_mappings',
  'broad_mappings', 'narrow_mappings', 'related_mappings',
  'see_also', 'notes', 'comments', 'status', 'deprecated',
  'aliases', 'symmetric', 'inverse', 'is_a', 'mixins',
  'maximum_value', 'minimum_value', 'pattern', 'string_serialization',
  'equals_string', 'equals_number', 'has_member', 'all_members',
  'owner', 'local_names', 'alt_descriptions', 'unit',
]);

const KNOWN_ENUM_KEYS = new Set([
  'name', 'description', 'permissible_values', 'code_set',
  'reachable_from', 'subset_of', 'see_also', 'notes', 'comments',
  'status', 'deprecated', 'aliases', 'mappings', 'exact_mappings',
  'close_mappings', 'broad_mappings', 'narrow_mappings',
]);

const KNOWN_SUBSET_KEYS = new Set(['name', 'description', 'see_also', 'notes', 'comments']);
const KNOWN_TYPE_KEYS = new Set(['name', 'uri', 'description', 'typeof', 'see_also', 'notes', 'comments', 'base', 'repr']);

function collectExtras(raw: Record<string, unknown>, knownKeys: Set<string>): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) extras[key] = raw[key];
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

function parsePermissibleValue(raw: unknown, text: string): PermissibleValue {
  if (raw === null || raw === undefined) return { text };
  if (typeof raw === 'string') return { text, description: raw };
  const r = raw as Record<string, unknown>;
  return {
    text: (r['text'] as string) ?? text,
    description: r['description'] as string | undefined,
    meaning: r['meaning'] as string | undefined,
  };
}

function parseSlot(raw: Record<string, unknown>, name: string): SlotDefinition {
  const slot: SlotDefinition = { name };
  if (raw['description']) slot.description = raw['description'] as string;
  if (raw['is_a']) slot.isA = raw['is_a'] as string;
  if (raw['mixins']) slot.mixins = raw['mixins'] as string[];
  if (raw['range']) slot.range = raw['range'] as string;
  if (raw['required'] !== undefined) slot.required = Boolean(raw['required']);
  if (raw['recommended'] !== undefined) slot.recommended = Boolean(raw['recommended']);
  if (raw['multivalued'] !== undefined) slot.multivalued = Boolean(raw['multivalued']);
  if (raw['identifier'] !== undefined) slot.identifier = Boolean(raw['identifier']);
  if (raw['key'] !== undefined) slot.keyField = Boolean(raw['key']);
  if (raw['inlined'] !== undefined) slot.inlined = Boolean(raw['inlined']);
  if (raw['inlined_as_list'] !== undefined) slot.inlinedAsList = Boolean(raw['inlined_as_list']);
  if (raw['domain']) slot.domain = raw['domain'] as string;
  if (raw['domain_of']) slot.domainOf = raw['domain_of'] as string[];
  if (raw['subset_of']) slot.subsetOf = raw['subset_of'] as string[];
  if (raw['ifabsent']) slot.ifAbsent = raw['ifabsent'] as string;
  if (raw['alias']) slot.alias = raw['alias'] as string;
  if (raw['slot_uri']) slot.slotUri = raw['slot_uri'] as string;
  if (raw['mappings']) slot.mappings = raw['mappings'] as string[];
  if (raw['exact_mappings']) slot.exactMappings = raw['exact_mappings'] as string[];
  if (raw['close_mappings']) slot.closeMappings = raw['close_mappings'] as string[];
  if (raw['broad_mappings']) slot.broadMappings = raw['broad_mappings'] as string[];
  if (raw['narrow_mappings']) slot.narrowMappings = raw['narrow_mappings'] as string[];
  if (raw['related_mappings']) slot.relatedMappings = raw['related_mappings'] as string[];
  if (raw['symmetric'] !== undefined) slot.symmetric = Boolean(raw['symmetric']);
  const extras = collectExtras(raw, KNOWN_SLOT_KEYS);
  if (extras) slot.extras = extras;
  return slot;
}

function parseSlotCondition(raw: Record<string, unknown>): SlotCondition {
  const sc: SlotCondition = {};
  if (raw['equals_string'] !== undefined) sc.equalsString = String(raw['equals_string']);
  if (Array.isArray(raw['equals_string_in'])) sc.equalsStringIn = raw['equals_string_in'] as string[];
  if (raw['equals_number'] !== undefined) sc.equalsNumber = Number(raw['equals_number']);
  if (raw['pattern']) sc.pattern = String(raw['pattern']);
  if (raw['minimum_value'] !== undefined) sc.minimumValue = Number(raw['minimum_value']);
  if (raw['maximum_value'] !== undefined) sc.maximumValue = Number(raw['maximum_value']);
  if (raw['required'] !== undefined) sc.required = Boolean(raw['required']);
  if (raw['recommended'] !== undefined) sc.recommended = Boolean(raw['recommended']);
  if (raw['multivalued'] !== undefined) sc.multivalued = Boolean(raw['multivalued']);
  if (raw['minimum_cardinality'] !== undefined) sc.minimumCardinality = Number(raw['minimum_cardinality']);
  if (raw['maximum_cardinality'] !== undefined) sc.maximumCardinality = Number(raw['maximum_cardinality']);
  if (raw['range']) sc.range = String(raw['range']);
  if (raw['value_presence']) sc.valuePresence = raw['value_presence'] as 'PRESENT' | 'ABSENT';
  if (Array.isArray(raw['any_of'])) sc.anyOf = (raw['any_of'] as Record<string, unknown>[]).map(parseSlotCondition);
  if (Array.isArray(raw['all_of'])) sc.allOf = (raw['all_of'] as Record<string, unknown>[]).map(parseSlotCondition);
  if (Array.isArray(raw['exactly_one_of'])) sc.exactlyOneOf = (raw['exactly_one_of'] as Record<string, unknown>[]).map(parseSlotCondition);
  if (Array.isArray(raw['none_of'])) sc.noneOf = (raw['none_of'] as Record<string, unknown>[]).map(parseSlotCondition);
  if (raw['has_member'] && typeof raw['has_member'] === 'object') sc.hasMember = parseSlotCondition(raw['has_member'] as Record<string, unknown>);
  if (raw['all_members'] && typeof raw['all_members'] === 'object') sc.allMembers = parseSlotCondition(raw['all_members'] as Record<string, unknown>);
  return sc;
}

function parseAnonymousClassExpression(raw: Record<string, unknown>): AnonymousClassExpression {
  const ace: AnonymousClassExpression = {};
  if (raw['description']) ace.description = String(raw['description']);
  if (raw['is_a']) ace.isA = String(raw['is_a']);
  if (raw['slot_conditions'] && typeof raw['slot_conditions'] === 'object' && !Array.isArray(raw['slot_conditions'])) {
    ace.slotConditions = {};
    for (const [slotName, scRaw] of Object.entries(raw['slot_conditions'] as Record<string, unknown>)) {
      ace.slotConditions[slotName] = parseSlotCondition((scRaw as Record<string, unknown>) ?? {});
    }
  }
  if (Array.isArray(raw['any_of'])) ace.anyOf = (raw['any_of'] as Record<string, unknown>[]).map(parseAnonymousClassExpression);
  if (Array.isArray(raw['all_of'])) ace.allOf = (raw['all_of'] as Record<string, unknown>[]).map(parseAnonymousClassExpression);
  if (Array.isArray(raw['exactly_one_of'])) ace.exactlyOneOf = (raw['exactly_one_of'] as Record<string, unknown>[]).map(parseAnonymousClassExpression);
  if (Array.isArray(raw['none_of'])) ace.noneOf = (raw['none_of'] as Record<string, unknown>[]).map(parseAnonymousClassExpression);
  return ace;
}

function parseClassRule(raw: Record<string, unknown>): ClassRule {
  const rule: ClassRule = {};
  if (raw['title']) rule.title = String(raw['title']);
  if (raw['description']) rule.description = String(raw['description']);
  if (raw['bidirectional'] !== undefined) rule.bidirectional = Boolean(raw['bidirectional']);
  if (raw['open_world'] !== undefined) rule.openWorld = Boolean(raw['open_world']);
  if (raw['deactivated'] !== undefined) rule.deactivated = Boolean(raw['deactivated']);
  if (raw['rank'] !== undefined) rule.rank = Number(raw['rank']);
  if (raw['preconditions'] && typeof raw['preconditions'] === 'object') rule.preconditions = parseAnonymousClassExpression(raw['preconditions'] as Record<string, unknown>);
  if (raw['postconditions'] && typeof raw['postconditions'] === 'object') rule.postconditions = parseAnonymousClassExpression(raw['postconditions'] as Record<string, unknown>);
  if (raw['elseconditions'] && typeof raw['elseconditions'] === 'object') rule.elseconditions = parseAnonymousClassExpression(raw['elseconditions'] as Record<string, unknown>);
  return rule;
}

function parseClass(raw: Record<string, unknown>, name: string): ClassDefinition {
  const cls: ClassDefinition = {
    name,
    mixins: [],
    slots: [],
    attributes: {},
    slotUsage: {},
  };
  if (raw['description']) cls.description = raw['description'] as string;
  if (raw['is_a']) cls.isA = raw['is_a'] as string;
  if (raw['mixins']) cls.mixins = raw['mixins'] as string[];
  if (raw['abstract'] !== undefined) cls.abstract = Boolean(raw['abstract']);
  if (raw['mixin'] !== undefined) cls.mixin = Boolean(raw['mixin']);
  if (raw['tree_root'] !== undefined) cls.treeRoot = Boolean(raw['tree_root']);
  if (raw['subset_of']) cls.subsetOf = raw['subset_of'] as string[];
  if (raw['slots']) cls.slots = raw['slots'] as string[];
  if (raw['union_of']) cls.unionOf = raw['union_of'] as string[];
  if (raw['class_uri']) cls.uriAnnotation = raw['class_uri'] as string;
  if (raw['from_schema']) cls.fromSchema = raw['from_schema'] as string;

  if (raw['attributes'] && typeof raw['attributes'] === 'object') {
    for (const [attrName, attrRaw] of Object.entries(raw['attributes'] as Record<string, unknown>)) {
      cls.attributes[attrName] = parseSlot(
        (attrRaw as Record<string, unknown>) ?? {},
        attrName,
      );
    }
  }

  if (raw['slot_usage'] && typeof raw['slot_usage'] === 'object') {
    for (const [slotName, usageRaw] of Object.entries(raw['slot_usage'] as Record<string, unknown>)) {
      cls.slotUsage[slotName] = parseSlot(
        (usageRaw as Record<string, unknown>) ?? {},
        slotName,
      );
    }
  }

  if (raw['rules'] && Array.isArray(raw['rules'])) {
    cls.rules = (raw['rules'] as Record<string, unknown>[]).map(parseClassRule);
  }

  const extras = collectExtras(raw, KNOWN_CLASS_KEYS);
  if (extras) cls.extras = extras;
  return cls;
}

function parseEnum(raw: Record<string, unknown>, name: string): EnumDefinition {
  const enm: EnumDefinition = { name, permissibleValues: {} };
  if (raw['description']) enm.description = raw['description'] as string;
  if (raw['code_set']) enm.codeSet = raw['code_set'] as string;
  if (raw['subset_of']) enm.subsetOf = raw['subset_of'] as string[];
  if (raw['reachable_from'] && typeof raw['reachable_from'] === 'object') {
    const rf = raw['reachable_from'] as Record<string, unknown>;
    enm.reachableFrom = {
      sourceOntology: rf['source_ontology'] as string,
      sourceNodes: rf['source_nodes'] as string[] | undefined,
      relationship: rf['relationship'] as string | undefined,
    } as ReachableFrom;
  }
  if (raw['permissible_values'] && typeof raw['permissible_values'] === 'object') {
    for (const [pvText, pvRaw] of Object.entries(raw['permissible_values'] as Record<string, unknown>)) {
      enm.permissibleValues[pvText] = parsePermissibleValue(pvRaw, pvText);
    }
  }
  const extras = collectExtras(raw, KNOWN_ENUM_KEYS);
  if (extras) enm.extras = extras;
  return enm;
}

function parseSubset(raw: Record<string, unknown> | null | undefined, name: string): SubsetDefinition {
  const subset: SubsetDefinition = { name };
  if (raw) {
    if (raw['description']) subset.description = raw['description'] as string;
    if (raw['comments']) subset.comments = raw['comments'] as string[];
    const extras = collectExtras(raw, KNOWN_SUBSET_KEYS);
    if (extras) subset.extras = extras;
  }
  return subset;
}

function parseType(raw: Record<string, unknown> | null | undefined, name: string): TypeDefinition {
  const type: TypeDefinition = { name };
  if (raw) {
    if (raw['uri']) type.uri = raw['uri'] as string;
    if (raw['description']) type.description = raw['description'] as string;
    if (raw['typeof']) type.typeof = raw['typeof'] as string;
    if (raw['base']) type.base = raw['base'] as string;
    if (raw['repr']) type.repr = raw['repr'] as string;
    const extras = collectExtras(raw, KNOWN_TYPE_KEYS);
    if (extras) type.extras = extras;
  }
  return type;
}

function normalizePrefixes(raw: unknown): Record<string, string> {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    // list of {prefix_prefix, prefix_reference}
    const result: Record<string, string> = {};
    for (const item of raw as Record<string, unknown>[]) {
      const key = item['prefix_prefix'] as string;
      const val = item['prefix_reference'] as string;
      if (key && val) result[key] = val;
    }
    return result;
  }
  return raw as Record<string, string>;
}

export function parseYaml(rawYaml: string): LinkMLSchema {
  // js-yaml v5 throws on empty/whitespace-only input instead of returning
  // undefined; short-circuit so callers get our clear error message.
  if (!rawYaml.trim()) {
    throw new Error('Invalid YAML: expected a mapping object');
  }
  const raw = jsyaml.load(rawYaml) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid YAML: expected a mapping object');
  }

  const schema: LinkMLSchema = {
    id: (raw['id'] as string) ?? '',
    name: (raw['name'] as string) ?? '',
    prefixes: normalizePrefixes(raw['prefixes']),
    defaultPrefix: (raw['default_prefix'] as string) ?? '',
    imports: (raw['imports'] as string[]) ?? [],
    subsets: {},
    types: {},
    slots: {},
    enums: {},
    classes: {},
  };

  if (raw['title']) schema.title = raw['title'] as string;
  if (raw['description']) schema.description = raw['description'] as string;
  if (raw['version']) schema.version = raw['version'] as string;
  if (raw['license']) schema.license = raw['license'] as string;
  if (raw['default_range']) schema.defaultRange = raw['default_range'] as string;
  if (raw['default_curi_maps']) schema.defaultCuriMaps = raw['default_curi_maps'] as string[];
  if (raw['see_also']) schema.seeAlso = raw['see_also'] as string[];

  if (raw['subsets'] && typeof raw['subsets'] === 'object') {
    for (const [subsetName, subsetRaw] of Object.entries(raw['subsets'] as Record<string, unknown>)) {
      schema.subsets[subsetName] = parseSubset(subsetRaw as Record<string, unknown> | null, subsetName);
    }
  }

  if (raw['types'] && typeof raw['types'] === 'object') {
    for (const [typeName, typeRaw] of Object.entries(raw['types'] as Record<string, unknown>)) {
      schema.types[typeName] = parseType(typeRaw as Record<string, unknown> | null, typeName);
    }
  }

  if (raw['slots'] && typeof raw['slots'] === 'object') {
    for (const [slotName, slotRaw] of Object.entries(raw['slots'] as Record<string, unknown>)) {
      schema.slots[slotName] = parseSlot((slotRaw as Record<string, unknown>) ?? {}, slotName);
    }
  }

  if (raw['enums'] && typeof raw['enums'] === 'object') {
    for (const [enumName, enumRaw] of Object.entries(raw['enums'] as Record<string, unknown>)) {
      schema.enums[enumName] = parseEnum((enumRaw as Record<string, unknown>) ?? {}, enumName);
    }
  }

  if (raw['classes'] && typeof raw['classes'] === 'object') {
    for (const [className, classRaw] of Object.entries(raw['classes'] as Record<string, unknown>)) {
      schema.classes[className] = parseClass((classRaw as Record<string, unknown>) ?? {}, className);
    }
  }

  const extras = collectExtras(raw, KNOWN_SCHEMA_KEYS);
  if (extras) schema.extras = extras;

  return schema;
}

// ─── Serializer ───────────────────────────────────────────────────────────────

function isDefined(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

function serializeSlot(slot: SlotDefinition): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (isDefined(slot.description)) out['description'] = slot.description;
  if (isDefined(slot.isA)) out['is_a'] = slot.isA;
  if (isDefined(slot.mixins)) out['mixins'] = slot.mixins;
  if (isDefined(slot.range)) out['range'] = slot.range;
  if (isDefined(slot.required)) out['required'] = slot.required;
  if (isDefined(slot.recommended)) out['recommended'] = slot.recommended;
  if (isDefined(slot.multivalued)) out['multivalued'] = slot.multivalued;
  if (isDefined(slot.identifier)) out['identifier'] = slot.identifier;
  if (isDefined(slot.keyField)) out['key'] = slot.keyField;
  if (isDefined(slot.inlined)) out['inlined'] = slot.inlined;
  if (isDefined(slot.inlinedAsList)) out['inlined_as_list'] = slot.inlinedAsList;
  if (isDefined(slot.domain)) out['domain'] = slot.domain;
  if (isDefined(slot.domainOf)) out['domain_of'] = slot.domainOf;
  if (isDefined(slot.subsetOf)) out['subset_of'] = slot.subsetOf;
  if (isDefined(slot.ifAbsent)) out['ifabsent'] = slot.ifAbsent;
  if (isDefined(slot.alias)) out['alias'] = slot.alias;
  if (isDefined(slot.slotUri)) out['slot_uri'] = slot.slotUri;
  if (isDefined(slot.mappings)) out['mappings'] = slot.mappings;
  if (isDefined(slot.exactMappings)) out['exact_mappings'] = slot.exactMappings;
  if (isDefined(slot.closeMappings)) out['close_mappings'] = slot.closeMappings;
  if (isDefined(slot.broadMappings)) out['broad_mappings'] = slot.broadMappings;
  if (isDefined(slot.narrowMappings)) out['narrow_mappings'] = slot.narrowMappings;
  if (isDefined(slot.relatedMappings)) out['related_mappings'] = slot.relatedMappings;
  if (isDefined(slot.symmetric)) out['symmetric'] = slot.symmetric;
  // Restore extras
  if (slot.extras) Object.assign(out, slot.extras);
  return Object.keys(out).length > 0 ? out : null;
}

function serializeSlotCondition(sc: SlotCondition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (sc.equalsString !== undefined) out['equals_string'] = sc.equalsString;
  if (isDefined(sc.equalsStringIn)) out['equals_string_in'] = sc.equalsStringIn;
  if (sc.equalsNumber !== undefined) out['equals_number'] = sc.equalsNumber;
  if (isDefined(sc.pattern)) out['pattern'] = sc.pattern;
  if (sc.minimumValue !== undefined) out['minimum_value'] = sc.minimumValue;
  if (sc.maximumValue !== undefined) out['maximum_value'] = sc.maximumValue;
  if (sc.required !== undefined) out['required'] = sc.required;
  if (sc.recommended !== undefined) out['recommended'] = sc.recommended;
  if (sc.multivalued !== undefined) out['multivalued'] = sc.multivalued;
  if (sc.minimumCardinality !== undefined) out['minimum_cardinality'] = sc.minimumCardinality;
  if (sc.maximumCardinality !== undefined) out['maximum_cardinality'] = sc.maximumCardinality;
  if (isDefined(sc.range)) out['range'] = sc.range;
  if (isDefined(sc.valuePresence)) out['value_presence'] = sc.valuePresence;
  if (isDefined(sc.anyOf)) out['any_of'] = sc.anyOf!.map(serializeSlotCondition);
  if (isDefined(sc.allOf)) out['all_of'] = sc.allOf!.map(serializeSlotCondition);
  if (isDefined(sc.exactlyOneOf)) out['exactly_one_of'] = sc.exactlyOneOf!.map(serializeSlotCondition);
  if (isDefined(sc.noneOf)) out['none_of'] = sc.noneOf!.map(serializeSlotCondition);
  if (sc.hasMember) out['has_member'] = serializeSlotCondition(sc.hasMember);
  if (sc.allMembers) out['all_members'] = serializeSlotCondition(sc.allMembers);
  return out;
}

function serializeAnonymousClassExpression(ace: AnonymousClassExpression): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDefined(ace.description)) out['description'] = ace.description;
  if (isDefined(ace.isA)) out['is_a'] = ace.isA;
  if (ace.slotConditions && Object.keys(ace.slotConditions).length > 0) {
    const sc: Record<string, unknown> = {};
    for (const [slotName, cond] of Object.entries(ace.slotConditions)) {
      sc[slotName] = serializeSlotCondition(cond);
    }
    out['slot_conditions'] = sc;
  }
  if (isDefined(ace.anyOf)) out['any_of'] = ace.anyOf!.map(serializeAnonymousClassExpression);
  if (isDefined(ace.allOf)) out['all_of'] = ace.allOf!.map(serializeAnonymousClassExpression);
  if (isDefined(ace.exactlyOneOf)) out['exactly_one_of'] = ace.exactlyOneOf!.map(serializeAnonymousClassExpression);
  if (isDefined(ace.noneOf)) out['none_of'] = ace.noneOf!.map(serializeAnonymousClassExpression);
  return out;
}

function serializeClassRule(rule: ClassRule): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDefined(rule.title)) out['title'] = rule.title;
  if (isDefined(rule.description)) out['description'] = rule.description;
  if (rule.preconditions) {
    const s = serializeAnonymousClassExpression(rule.preconditions);
    if (Object.keys(s).length > 0) out['preconditions'] = s;
  }
  if (rule.postconditions) {
    const s = serializeAnonymousClassExpression(rule.postconditions);
    if (Object.keys(s).length > 0) out['postconditions'] = s;
  }
  if (rule.elseconditions) {
    const s = serializeAnonymousClassExpression(rule.elseconditions);
    if (Object.keys(s).length > 0) out['elseconditions'] = s;
  }
  if (rule.bidirectional !== undefined) out['bidirectional'] = rule.bidirectional;
  if (rule.openWorld !== undefined) out['open_world'] = rule.openWorld;
  if (rule.deactivated !== undefined) out['deactivated'] = rule.deactivated;
  if (rule.rank !== undefined) out['rank'] = rule.rank;
  return out;
}

function serializeClass(cls: ClassDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDefined(cls.description)) out['description'] = cls.description;
  if (isDefined(cls.isA)) out['is_a'] = cls.isA;
  if (isDefined(cls.mixins)) out['mixins'] = cls.mixins;
  if (isDefined(cls.abstract)) out['abstract'] = cls.abstract;
  if (isDefined(cls.mixin)) out['mixin'] = cls.mixin;
  if (isDefined(cls.treeRoot)) out['tree_root'] = cls.treeRoot;
  if (isDefined(cls.subsetOf)) out['subset_of'] = cls.subsetOf;
  if (isDefined(cls.uriAnnotation)) out['class_uri'] = cls.uriAnnotation;
  if (isDefined(cls.fromSchema)) out['from_schema'] = cls.fromSchema;
  if (isDefined(cls.unionOf)) out['union_of'] = cls.unionOf;
  if (isDefined(cls.slots)) out['slots'] = cls.slots;
  if (isDefined(cls.attributes)) {
    const attrs: Record<string, unknown> = {};
    for (const [attrName, attr] of Object.entries(cls.attributes)) {
      const serialized = serializeSlot(attr);
      attrs[attrName] = serialized ?? {};
    }
    out['attributes'] = attrs;
  }
  if (isDefined(cls.slotUsage)) {
    const usage: Record<string, unknown> = {};
    for (const [slotName, su] of Object.entries(cls.slotUsage)) {
      const serialized = serializeSlot(su as SlotDefinition);
      usage[slotName] = serialized ?? {};
    }
    out['slot_usage'] = usage;
  }
  if (isDefined(cls.rules)) out['rules'] = cls.rules!.map(serializeClassRule);
  if (cls.extras) Object.assign(out, cls.extras);
  return out;
}

function serializeEnum(enm: EnumDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDefined(enm.description)) out['description'] = enm.description;
  if (isDefined(enm.codeSet)) out['code_set'] = enm.codeSet;
  if (isDefined(enm.subsetOf)) out['subset_of'] = enm.subsetOf;
  if (isDefined(enm.reachableFrom)) {
    const rf = enm.reachableFrom!;
    const rfOut: Record<string, unknown> = { source_ontology: rf.sourceOntology };
    if (isDefined(rf.sourceNodes)) rfOut['source_nodes'] = rf.sourceNodes;
    if (isDefined(rf.relationship)) rfOut['relationship'] = rf.relationship;
    out['reachable_from'] = rfOut;
  }
  if (isDefined(enm.permissibleValues)) {
    const pvOut: Record<string, unknown> = {};
    for (const [text, pv] of Object.entries(enm.permissibleValues)) {
      const pvObj: Record<string, unknown> = {};
      if (isDefined(pv.description)) pvObj['description'] = pv.description;
      if (isDefined(pv.meaning)) pvObj['meaning'] = pv.meaning;
      pvOut[text] = Object.keys(pvObj).length > 0 ? pvObj : null;
    }
    out['permissible_values'] = pvOut;
  }
  if (enm.extras) Object.assign(out, enm.extras);
  return out;
}

function serializeSubset(subset: SubsetDefinition): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (isDefined(subset.description)) out['description'] = subset.description;
  if (isDefined(subset.comments)) out['comments'] = subset.comments;
  if (subset.extras) Object.assign(out, subset.extras);
  return Object.keys(out).length > 0 ? out : null;
}

function serializeType(type: TypeDefinition): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (isDefined(type.uri)) out['uri'] = type.uri;
  if (isDefined(type.description)) out['description'] = type.description;
  if (isDefined(type.typeof)) out['typeof'] = type.typeof;
  if (isDefined(type.base)) out['base'] = type.base;
  if (isDefined(type.repr)) out['repr'] = type.repr;
  if (type.extras) Object.assign(out, type.extras);
  return out;
}

export function serializeYaml(schema: LinkMLSchema): string {
  // Build the plain object in LinkML convention key order
  const out: Record<string, unknown> = {};

  out['id'] = schema.id;
  out['name'] = schema.name;
  if (isDefined(schema.title)) out['title'] = schema.title;
  if (isDefined(schema.description)) out['description'] = schema.description;
  if (isDefined(schema.version)) out['version'] = schema.version;
  if (isDefined(schema.license)) out['license'] = schema.license;
  if (isDefined(schema.prefixes)) out['prefixes'] = schema.prefixes;
  out['default_prefix'] = schema.defaultPrefix;
  if (isDefined(schema.defaultRange)) out['default_range'] = schema.defaultRange;
  if (isDefined(schema.defaultCuriMaps)) out['default_curi_maps'] = schema.defaultCuriMaps;
  if (isDefined(schema.seeAlso)) out['see_also'] = schema.seeAlso;
  if (isDefined(schema.imports)) out['imports'] = schema.imports;

  if (isDefined(schema.subsets)) {
    const subsetsOut: Record<string, unknown> = {};
    for (const [name, subset] of Object.entries(schema.subsets)) {
      subsetsOut[name] = serializeSubset(subset);
    }
    out['subsets'] = subsetsOut;
  }

  if (isDefined(schema.types)) {
    const typesOut: Record<string, unknown> = {};
    for (const [name, type] of Object.entries(schema.types)) {
      typesOut[name] = serializeType(type);
    }
    out['types'] = typesOut;
  }

  if (isDefined(schema.slots)) {
    const slotsOut: Record<string, unknown> = {};
    for (const [name, slot] of Object.entries(schema.slots)) {
      slotsOut[name] = serializeSlot(slot) ?? {};
    }
    out['slots'] = slotsOut;
  }

  if (isDefined(schema.enums)) {
    const enumsOut: Record<string, unknown> = {};
    for (const [name, enm] of Object.entries(schema.enums)) {
      enumsOut[name] = serializeEnum(enm);
    }
    out['enums'] = enumsOut;
  }

  if (isDefined(schema.classes)) {
    const classesOut: Record<string, unknown> = {};
    for (const [name, cls] of Object.entries(schema.classes)) {
      classesOut[name] = serializeClass(cls);
    }
    out['classes'] = classesOut;
  }

  // Restore top-level extras
  if (schema.extras) Object.assign(out, schema.extras);

  return jsyaml.dump(out, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}