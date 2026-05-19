# Handoff: Improving UX for Large LinkML Schemas

**Status:** Draft proposal, ready for issue creation
**Audience:** Issue-authoring agent stack + downstream implementers
**Date:** 2026-05-19

## Background

The ERD canvas works for small/medium schemas but becomes cluttered for large ones. Recent UI tweaks on the `dev` branch did not resolve this. Diagnosis: the dominant source of clutter is **edge count**, not node count — every slot with a class range becomes an edge, and edge count grows much faster than class count. Auto-layout (ELK) cannot recover from this and requires extensive manual tweaking.

The strategy below combines three orthogonal directions plus one UI consolidation:

- **A. Subset what is shown** (project-scoped views, focus mode, LinkML subsets) — fewer nodes → fewer edges.
- **B. Reduce edge/visual density and consolidate display controls** (Display panel, inline ranges, edge filters, dimming, ghost-node dissolution) — same nodes, less noise; single home for visual controls.
- **C. Provide non-ERD navigation paradigms** (read-only tree/outline, command palette, tabular bulk-edit) — bypass the canvas for tasks that don't benefit from it.
- **D. Group structurally related entities** (auto-clustering by import source) — provide visual grouping when scoping isn't enough.

Each feature below is intended to become its own GitHub issue. Group A and B0 (Display panel) form the foundation; the remaining items in B, C, D depend on them but are otherwise independent.

## Existing scaffolding to extend (don't rebuild)

The downstream implementers should know these already exist:

- `FocusMode` type in `packages/core/src/store/slices/canvasSlice.ts` with `subset` and `selection` variants — Views and improved subset support extend this. Suggested split during A1: `FocusMode` becomes ephemeral selection-driven focus, `Views` become persistent named entities.
- `FocusModeToolbar.tsx` in `packages/core/src/editor/` — the UI surface for current focus mode. Likely migrates into the new Display panel (B0).
- `EditorManifestData` / `SchemaManifestEntry` in `packages/core/src/io/editorManifest.ts` — persisted to `.linkml-editor.yaml` at project root. **Views metadata is added at the top level of `EditorManifestData` (project-scoped), not inside `SchemaManifestEntry`.** The actual filename is `.linkml-editor.yaml` (the user sometimes refers to it as `.linkml.yaml`/`.linkml.yml`).
- `ImportGroupNode.tsx` + `collapsedGroups` in `canvasSlice` — partial start for import-source clustering. Will be removed or substantially rewritten by B4 (ghost-node dissolution); D1 may reintroduce a different grouping mechanism.
- Ghost-node infrastructure in `deriveGraph.ts` (line ~355+), `autoLayout.ts` (line ~76+), and `ClassNode.tsx` (lines 20, 78-110, 211) — slated for removal/refactor in B4.
- `EntitySearchPanel.tsx` — partial start for command-palette-style navigation.
- LinkML `subsets:` are already parsed/serialized in `packages/core/src/io/yaml.ts` and present on `SchemaDefinition.subsets`.

---

# Group A — Views, Focus, and Subsets

## A1. Persistable Named Views

**Problem.** Users repeatedly re-select the same subset of classes to focus on (a workflow, a module, a debug session). Today's `FocusMode` is ephemeral and lost when the project closes.

**Proposal.** Promote `FocusMode` into a first-class persisted entity called a **View**. A view stores: a set of entity references to include, an optional rendering mode (`canvas` vs `outline` — see A2), per-view layout overrides (positions, viewport), and edge-filter settings (see B2). **Views are project-scoped, not schema-scoped** — a single view can include entities drawn from multiple schemas in the project. Views are listed in a new section of the left panel (alongside the project panel) where users can create, rename, delete, duplicate, and switch between them. Persist at the top level of `.linkml-editor.yaml`.

**Scope.**
- Extend `EditorManifestData` (top level) with `views?: ViewDefinition[]` and `activeViewId?: string`. Do **not** nest under `SchemaManifestEntry`.
- New `ViewDefinition` type: `{ id, name, description?, members: ViewMember[], renderMode: 'canvas' | 'outline', layout?: { nodes, viewport }, edgeFilters?: EdgeFilterSet }`.
- `ViewMember` is a qualified reference, e.g. `{ schemaId: string; name: string; kind: 'class' | 'enum' }`. Schema-qualification is required because the same class name can appear in multiple imported schemas; resolving by bare name is ambiguous.
- Add a new store slice (or extend `canvasSlice`) with view CRUD actions; reconcile with existing `FocusMode` (suggested split: `FocusMode` becomes ephemeral selection-based focus, `Views` become persistent named entities — both can coexist).
- New left-panel UI section "Views" with list, create-from-selection button, and switch-on-click.
- When a view is active, the canvas (or outline) shows only its members and only edges where both endpoints are members. This naturally cuts out-of-view edge clutter.
- "Save current selection as view" command.
- When the active view spans multiple schemas, the canvas displays entities from each — verify with [[B4. Dissolve Ghost Nodes]] that cross-schema rendering is uniform.

**Pointers.** `packages/core/src/store/slices/canvasSlice.ts`, `packages/core/src/io/editorManifest.ts`, `packages/core/src/editor/ProjectPanel.tsx` (left panel host), `packages/core/src/editor/FocusModeToolbar.tsx`.

**Dependencies.** None — foundation for A2, A3, A4, B0, B2, B4.

**Complexity.** Medium.

---

## A2. Outline / Tree View Rendering Mode

**Problem.** For many editing tasks (find a slot, rename a class, edit a description) the ERD canvas is overkill. Spatial layout adds no value and the user is just looking for a name.

**Proposal.** Add a second rendering mode that displays the schema (or active view) as a collapsible tree. Tree organization should be hierarchical by `is_a` with mixins shown as sub-branches; clicking a class expands its slots. **The outline is read-only navigation** — selecting a node in the tree drives the same selection state as the canvas, so all editing happens through the existing properties panel (which already handles every field that would otherwise need an inline editor). Make the rendering mode toggleable globally and per-view (a view records its preferred mode in A1's `renderMode` field). Mode-switcher UI lives in the Display panel ([[B0. Display Panel]]).

**Scope.**
- New `OutlineView.tsx` component in `packages/core/src/canvas/` (or new `outline/` subdir).
- Tree derivation logic in a new module — reuse signal data from `deriveGraph.ts` where possible (membership, is_a relations, slot ownership) but emit a tree, not a ReactFlow graph.
- Keyboard navigation (arrow keys, enter to focus, no inline editing).
- Selection sync with the existing Zustand selection state — clicking a tree row sets `selectedNodeIds` exactly as a canvas click would, so the properties panel reflects the selection unchanged.
- Outline mode honors active view membership (only renders included classes).
- Mode-switcher control in the Display panel (B0).

**Pointers.** `packages/core/src/canvas/deriveGraph.ts` (don't duplicate inheritance/membership computation), `packages/core/src/canvas/SchemaCanvas.tsx` (sibling component), `packages/core/src/editor/PropertiesPanel/` (selection-driven, should "just work" — no changes needed).

**Dependencies.** Soft on A1 (the per-view `renderMode` toggle). Can ship standalone as a global toggle first, then gain per-view granularity when A1 lands. B0 hosts the mode switcher.

**Complexity.** Medium. Without an editing surface in the outline itself, this is mostly a derivation + render + selection-sync exercise.

---

## A3. Selection Neighborhood Operations

**Problem.** Building a useful view by clicking each class is tedious. Users need to expand selection along graph topology: "everything that references this class," "the full inheritance chain," "everything two hops away."

**Proposal.** Provide selection-expansion operations available from the Display panel ([[B0. Display Panel]]) and keyboard shortcuts:

- Direct neighbors (in / out / both)
- Ancestors (via `is_a` and mixins)
- Descendants
- Full connected component
- Range targets (slot ranges only — follow type relationships forward)
- Range sources (classes whose slots have any current selection as a range)
- N-hop expansion (with a numeric input, default 1)
- Invert / clear / save-as-view (ties into A1)

**Scope.**
- New module `packages/core/src/canvas/selectionOps.ts` operating on `SchemaDefinition` + current selection, returning a new selection set. Pure functions, fully unit-testable without ReactFlow.
- UI controls in the Display panel (B0). Operations apply identically in canvas and outline modes since both use the same selection state.
- Keyboard bindings (e.g. `n` direct neighbors, `a` ancestors, `d` descendants, `Shift+n` add to selection vs replace).
- Tests covering inheritance, mixins, slot ranges, and cyclic graphs.

**Pointers.** `packages/core/src/canvas/deriveGraph.ts` (graph edges already computed here — extract a reusable adjacency representation), `packages/core/src/store/slices/canvasSlice.ts` (`setSelection`).

**Dependencies.** None for the operations themselves. "Save as view" hook depends on A1. UI placement assumes B0.

**Complexity.** Low-medium. Core logic is small; care needed on edge semantics (is_a vs mixin vs range) and undo behavior.

---

## A4. First-Class Support for LinkML `subsets:`

**Problem.** LinkML schemas can declare `subsets:` and tag classes/slots/enums with `in_subset: [...]`. The editor parses and serializes these but treats them as nearly inert — there is partial support via `FocusMode.subset` but no editing UI, no membership management, and limited visibility of which entities belong to which subset.

**Proposal.** Treat subsets as a built-in flavor of view (read-only mirror): a subset implicitly defines a view whose members are entities tagged `in_subset: [<name>]`. Listed in the same Views panel section but visually distinct (e.g. a "Subsets" subgroup). Editing operations:

- Create / rename / delete subsets (edits `schema.subsets`).
- Add/remove entities from a subset via context menu and properties-panel multi-select (edits `in_subset` on each class/slot/enum).
- "Promote view to subset" — converts an editor-only view into a schema-level subset (writes `in_subset` tags).
- "Demote subset to view" — copies subset membership into a new editor view, leaves the LinkML subset intact.

**Scope.**
- Subset editing actions in `projectSlice` (or a new `subsetSlice`).
- UI in the new Views panel (A1) for the Subsets subgroup.
- Properties panel: show "in subsets" on each entity, with add/remove.
- YAML round-trip already works — verify no regressions.
- Documentation update in `docs/user-guide.md` clarifying view-vs-subset semantics.

**Pointers.** `packages/core/src/io/yaml.ts` (look for `in_subset` and `subsets:` handling, already present), `packages/core/src/model/index.ts` (`SubsetDefinition`), `packages/core/src/store/slices/canvasSlice.ts` (existing `FocusMode.subset` variant).

**Dependencies.** A1 (Views panel UI is the natural home for this).

**Complexity.** Medium.

---

# Group B — Display Surface, Edge & Visual Density

## B0. Display Panel

**Problem.** Visual display controls (edge filters, density toggles, rendering-mode switches) are scattered as buttons across the top of the canvas. With multiple rendering modes coming (canvas, outline, eventually table) and a growing set of toggles, these controls don't belong to the canvas — they belong to a higher-level question of "what should the central pane display, and how." The canvas surface itself should be reserved for content.

**Proposal.** Add a dedicated **Display panel** — a sidebar section sitting alongside the Project and Views panels — that consolidates all visual display controls in one discoverable place. Contents:

- Rendering-mode switcher (canvas / outline / future table) — sets the active view's `renderMode` if a view is active, otherwise sets the global default.
- Inline-range toggle ([[B1. Inline-Attribute Toggle for Range Edges]]).
- Edge-type filters ([[B2. Edge-Type Filters]]).
- Hop-distance dimming controls ([[B3. Hop-Distance Dimming for Selection]]).
- Selection neighborhood operations ([[A3. Selection Neighborhood Operations]]).
- Auto-clustering toggles ([[D1. Auto-Clustering by Import Source]]).
- Any future rendering / density / filter controls.

Existing canvas-overlay toggle buttons are migrated here and removed from the canvas chrome.

**Scope.**
- New `DisplayPanel.tsx` in `packages/core/src/editor/`.
- Wire into the left-panel host alongside Project / Views.
- Migrate the existing canvas-overlay toggles (audit `SchemaCanvas.tsx` for current controls and move them).
- Persistence: per-view settings live in `ViewDefinition.edgeFilters` / `ViewDefinition.renderMode` (A1); global defaults live in `EditorManifestData` at the top level.
- Empty-state behavior: the panel shows even with no view active, controlling global defaults.

**Pointers.** `packages/core/src/canvas/SchemaCanvas.tsx` (current toolbar location), `packages/core/src/editor/ProjectPanel.tsx` (left panel host pattern), `packages/core/src/editor/FocusModeToolbar.tsx` (some controls may migrate here).

**Dependencies.** Soft on A1 (per-view persistence is cleaner with views in place, but the panel can ship with global-only settings first). Foundation for B1, B2, B3, A3, D1 UI placement — those features should target the Display panel rather than building one-off canvas toolbars.

**Complexity.** Low for the panel shell. Complexity grows as each migrated/new control lands; recommend shipping an empty shell early so other features have a known UI home.

---

## B1. Inline-Attribute Toggle for Range Edges

**Problem.** Every slot whose `range` is a class produces an ERD edge. A schema with 50 classes can easily have 200+ such edges, swamping the layout. This is the single largest contributor to canvas clutter.

**Proposal.** Add a toggle (global, per-view, and ideally per-class) to render a slot's class range as a labeled attribute inside the class box instead of as an edge. The label shows the range class name as a chip/link; clicking it jumps to that class. Default behavior is a thoughtful choice — possibly inline by default, edges on demand for selected classes, or threshold-based ("auto-inline if > N range edges in view"). The behavior is well-trodden in ERD tools (foreign-key columns vs explicit FK lines).

**Scope.**
- Extend `deriveGraph.ts` to honor a new option `rangeEdges: 'show' | 'inline' | 'auto'`.
- `ClassNode.tsx`: render inline range attributes as a distinct visual treatment (chip with arrow icon), clickable to focus the target class.
- Toggle exposed in the Display panel ([[B0. Display Panel]]); per-view override stored in `ViewDefinition.edgeFilters` (A1).
- Performance: with inlining default, large schemas should render with dramatically fewer edges — verify on a 100+ class schema.

**Pointers.** `packages/core/src/canvas/deriveGraph.ts` (range-edge construction), `packages/core/src/canvas/ClassNode.tsx`, `packages/core/src/canvas/nodeGeometry.ts` (height changes when slots show inline ranges).

**Dependencies.** B0 for UI placement. Per-view persistence depends on A1.

**Complexity.** Medium. Visual design and the auto-threshold heuristic are the tricky parts; mechanical work is straightforward.

---

## B2. Edge-Type Filters

**Problem.** Users sometimes want to see only structural relationships (inheritance) or only data relationships (ranges), but the canvas always shows everything.

**Proposal.** A canvas toolbar control with toggles for each edge category: `is_a`, `mixin`, `range`, `slot_usage`/refinement. Hidden edges are removed from the graph (not just visually faded) so they don't affect ELK layout. Settings persist per-view via `ViewDefinition.edgeFilters` (A1).

**Scope.**
- `EdgeFilterSet` type with boolean per category.
- Filter in `deriveGraph.ts` before edges are emitted.
- Controls in the Display panel ([[B0. Display Panel]]) with iconography for each edge type.

**Pointers.** `packages/core/src/canvas/deriveGraph.ts`, `packages/core/src/canvas/edges.tsx`.

**Dependencies.** B0 for UI placement. Per-view persistence depends on A1; otherwise standalone.

**Complexity.** Low.

---

## B3. Hop-Distance Dimming for Selection

**Problem.** Hiding nodes can be disorienting ("where did everything go?"). Sometimes the user wants context preserved but de-emphasized.

**Proposal.** When something is selected, dim (reduce opacity, desaturate) nodes and edges more than N hops away. N is adjustable (1–3 typical). Distinct from views/focus mode: dimming is non-destructive, the layout is unchanged.

**Scope.**
- Compute hop distance from current selection on selection change (BFS over the graph used by A3).
- Apply opacity/grayscale via CSS classes on nodes/edges.
- Toggle + N-hop selector in the Display panel ([[B0. Display Panel]]).
- Off by default.

**Pointers.** `packages/core/src/canvas/SchemaCanvas.tsx`, `packages/core/src/canvas/ClassNode.tsx`, `packages/core/src/canvas/edges.tsx`.

**Dependencies.** B0 for UI placement. Shares adjacency computation with A3; ship A3 first if possible.

**Complexity.** Low.

---

## B4. Dissolve Ghost Nodes

**Problem.** Classes imported from other schemas are currently rendered as compact "ghost" cards inside `ImportGroupNode` compound containers, with their own ID namespace (`ghost__<name>`) and special-case handling throughout the graph layer. This split treatment adds layout complexity (ELK compound nodes), makes edge construction awkward (every endpoint must check both regular and ghost IDs — see `autoLayout.ts:122-154`), and produces a visually distinct rendering style for what are conceptually still classes. The original motivation (compactness) is weaker now that Views (A1) provide a user-controlled mechanism for managing imported-entity clutter.

**Proposal.** Remove the ghost-node grouping container and the `ghost__` ID prefix. Render imported classes as ordinary `ClassNode`s, distinguished by a different header color (reuse or rename `--color-class-ghost`), a small "imported" badge, and the existing read-only behavior. With [[B1. Inline-Attribute Toggle for Range Edges]] in play, most references to imported classes appear as inline attributes anyway, dramatically reducing the case for visual compaction. Views (A1) provide the scoping mechanism users need when many imports are present.

**Scope.**
- `deriveGraph.ts`: delete the ghost-group branch (line ~355+); emit imported classes as regular `ClassNode` entries with an `imported: true` flag in `CanvasNodeData`.
- `ClassNode.tsx`: keep the imported color treatment, drop the `ghostWrapper` / dashed-border style (or merge into a softer "imported" treatment that does not compete visually with selection state).
- `autoLayout.ts`: remove ghost-group compound-node logic (`ghostGroups` map, lines ~76-154); imported nodes are leaves like any other class. Update target-ID resolution to drop `ghost__`-prefix checks.
- `ImportGroupNode.tsx`: delete, or repurpose for [[D1. Auto-Clustering by Import Source]] if that feature lands first/concurrently.
- Layout migration: existing `.linkml-editor.yaml` files store imported-class positions under `ghost__<name>` keys. Add migration in `editorManifest.ts` to rewrite those keys to `<name>` on read (one-time, idempotent), or accept layout loss for imported classes on first open after the change.
- Update tests in `packages/core/src/__tests__/` and `packages/core/src/canvas/__tests__/` that reference ghost IDs.

**Pointers.** `packages/core/src/canvas/deriveGraph.ts` (lines 163, 355-460), `packages/core/src/canvas/autoLayout.ts` (lines 45-160), `packages/core/src/canvas/ClassNode.tsx` (lines 20, 78-110, 211-212), `packages/core/src/canvas/ImportGroupNode.tsx`, `packages/core/src/io/editorManifest.ts`.

**Dependencies.** A1 (Views provide the scoping mechanism that makes this manageable for large imported schemas). B1 strongly complements (inline ranges eliminate most edges to imported classes). Recommend shipping in this order: A1 → B1 → B4.

**Complexity.** Medium. Mostly subtractive in `deriveGraph.ts` and `autoLayout.ts`, but the layout-key migration and verifying no test depends on the `ghost__` prefix takes care.

---

# Group C — Alternative Navigation Paradigms

## C1. Command Palette (Cmd-K)

**Problem.** Even with views, finding a specific entity in a large schema benefits from keyboard-driven search. `EntitySearchPanel` exists but is a sidebar widget rather than a fast modal.

**Proposal.** Add a Cmd-K (Ctrl-K on Linux/Windows) modal that searches across classes, enums, slots, subsets, and views. Selecting a result focuses it on the canvas, opens the properties panel, and adds to selection. Fuzzy-match across name + description. Also surfaces actions ("New class…", "Save view…", "Switch to view: X").

**Scope.**
- New `CommandPalette.tsx` modal component.
- Search index built from current `SchemaDefinition` + manifest (views, subsets).
- Action registry — extensible so future features can register entries.
- Keyboard shortcut globally bound.
- Reuse or refactor logic from `EntitySearchPanel.tsx`; consider deprecating the sidebar once the palette covers its use cases.

**Pointers.** `packages/core/src/editor/EntitySearchPanel.tsx`, `packages/core/src/ui/` (for modal primitives — uses Radix).

**Dependencies.** None. Synergizes with A1 (views as palette targets) and A4 (subsets too).

**Complexity.** Low-medium.

---

## C2. Tabular Bulk-Edit View

**Problem.** Editing many slots/classes one-by-one in the properties panel is slow. Schema curators often want to make sweeping edits ("change all `string` ranges to `xsd:string`," "mark these 20 slots as required").

**Proposal.** A spreadsheet-style table view selectable as a third rendering mode (alongside canvas and outline). Rows are entities (slots or classes — user-switchable), columns are common fields (name, range, required, description, in_subset, etc.). In-cell editing with undo support. Column visibility configurable.

**Scope.**
- New `TableView.tsx` with virtualized rows (TanStack Table is a common pick; check existing deps — may need to add).
- Row type switcher (slots vs classes vs enums).
- Inline editors per cell type (text, select for ranges, checkbox for booleans, multi-select for `in_subset`).
- Undo/redo via the existing zundo middleware — verify edits flow through the same store actions used by `PropertiesPanel`.
- Filter by current view (when one is active).

**Pointers.** `packages/core/src/editor/PropertiesPanel/` (reuse field editors where feasible), `packages/core/src/store/slices/projectSlice.ts` (edit actions).

**Dependencies.** None. Synergizes with A1 (table can be the third `renderMode`).

**Complexity.** High. This is the biggest item in the list — consider gating behind a feature flag during development.

---

# Group D — Grouping

## D1. Auto-Clustering by Import Source

**Problem.** Classes imported from different LinkML schemas often form natural groups (e.g. all classes from `linkml:types` belong together visually). `ImportGroupNode` exists for some grouping, but is not driven by import source by default.

**Proposal.** Detect each class's import provenance via the existing `importResolver`, optionally render an `ImportGroupNode` per source, and offer one-click "create view from import group". Off by default; toggleable from the canvas toolbar.

**Scope.**
- Use `importResolver.ts` to map each class to its source schema.
- If [[B4. Dissolve Ghost Nodes]] has landed, `ImportGroupNode` may have been removed — in that case, reintroduce a lightweight group/cluster rendering specifically for this opt-in feature (separate from the previous always-on ghost grouping). If B4 has not landed, extend the existing `ImportGroupNode.tsx`.
- Toggle "Group by import source" in the Display panel ([[B0. Display Panel]]).
- Action: "Save group as view" — creates a view from the group's members.

**Pointers.** `packages/core/src/canvas/ImportGroupNode.tsx` (if still present), `packages/core/src/io/importResolver.ts`, `packages/core/src/canvas/deriveGraph.ts`.

**Dependencies.** B0 for UI placement. Soft dependency on A1 (for "save as view"). Coordinate with B4 — these two features touch overlapping rendering code.

**Complexity.** Low-medium.

---

# Suggested Priority Order

1. **A1** — Persistable named views (project-scoped; foundation for A2/A4/B2/B4; high user value).
2. **B0** — Display panel (foundational UI host for later display controls; ship as empty shell first if needed).
3. **A3** — Selection neighborhood ops (cheap, unlocks fast view authoring; lands in B0).
4. **B1** — Inline-attribute toggle for range edges (single biggest clutter win; prerequisite for B4).
5. **B4** — Dissolve ghost nodes (architectural simplification; depends on A1 + B1).
6. **A2** — Outline / tree view (qualitatively different navigation; read-only).
7. **C1** — Command palette (orthogonal, fast win).
8. **A4** — Subset first-class support (builds on A1, addresses existing LinkML feature gap).
9. **B2** — Edge-type filters (cheap, persists into A1 views).
10. **B3** — Hop-distance dimming (cheap, polish).
11. **D1** — Import-source grouping (modest win; coordinate with B4).
12. **C2** — Tabular bulk-edit (large effort; schedule when team has bandwidth).

# Cross-Cutting Concerns to Flag in Each Issue

- **Persistence.** Anything affecting view/canvas state needs explicit handling in `.linkml-editor.yaml` (`editorManifest.ts`) and a forward-compatible schema (`version: 1` is currently the only version — bump if you add required fields, or keep additions optional).
- **Undo/redo.** zundo tracks schema state only. UI state (views, focus, filters) is intentionally outside undo scope; confirm new features follow this convention or justify deviating.
- **Testing.** Pure logic (selection ops, derivations) should be unit-tested in `packages/core/src/__tests__/` patterns. Avoid testing ReactFlow internals; test the data layer.
- **Web + Electron parity.** All features live in `packages/core`. Verify nothing reaches for `window.electron`, `fs`, or Node-only APIs from core.
- **Documentation.** Each feature should add a short section to `docs/user-guide.md`.

# Decisions

1. **View scope.** Views are **project-scoped**, stored at the top level of `EditorManifestData`. A single view may include entities from multiple schemas in the project, so view members carry a schema-qualified reference.
2. **Inline range edges (B1) default.** On by default for new projects; preserve current behavior for existing projects (when reading a `.linkml-editor.yaml` that has no explicit setting, treat as opt-in for backward compatibility — promote to default on first explicit user interaction).
3. **Shared / read-only views.** Not supported in v1. Views live in the editor manifest (which is checked into git), so they're already shareable through normal version control; no separate access-control layer is needed.
4. **Outline view editing.** Read-only navigation in v1. All edits happen through the existing properties panel, which already handles every relevant field. No inline editing surface in the outline.
