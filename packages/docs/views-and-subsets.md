# Named Views and Subsets

**Named Views** and **Subsets** are two complementary ways to work with a subset of your schema's entities. Views are editor-side bookmarks; Subsets are schema-level LinkML constructs. Both are managed from the **Project Panel**.

---

## Named Views

A **Named View** records a set of classes and enums, an optional render mode, and a canvas layout snapshot. Activating a view filters the canvas, Outline, and Table so only those entities are visible.

Views are stored in the editor manifest file (`.linkml-editor.yaml`) alongside your project. They are not part of the LinkML schema YAML.

### Creating a view

**From a selection:**

1. Select one or more nodes on the canvas (or use the [Selection Operations](./display-panel#selection-operations) in the Display Panel to build the desired set).
2. Click **save as view** in the Display Panel, or click the **+** button in the **Views** section of the Project Panel.
3. The view is created with an auto-generated name (e.g. `View 1`). Rename it immediately — see below.

> The **+** button in the Project Panel is disabled when nothing is selected.

### Activating a view

Click the view's row in the **Views** section of the Project Panel to activate it. Click again to deactivate. Only one view can be active at a time.

When a view is active:
- The canvas, Outline, and Table show only the view's member entities.
- The view's render mode (if set) overrides the global default.
- The view's range-edge mode (if set) overrides the global setting.
- The canvas restores the view's saved layout and viewport.

### Renaming a view

Double-click the view name, or click the **✎** (edit) button on the view row. Press `Enter` to commit or `Esc` to cancel.

### Duplicating a view

Click **⧉** on the view row. A copy is created with the name `<original name> (copy)`. The copy has a new ID and no saved layout.

### Deleting a view

Click **×** (shown in red) on the view row. The view is removed from the manifest. This does not affect the schema or any Subsets.

### Promoting a view to a Subset

Click **⬆** on the view row to convert the view into a LinkML [Subset](#subsets).

> **Constraint:** All view members must belong to the same writable schema. If members span multiple schemas, the promote button is disabled and an alert explains the restriction.

The promotion:
1. Creates a new LinkML subset in the active schema with the view's name.
2. Tags each member class/enum with that subset (adds it to their `subset_of` list).
3. Does not delete the view — both the view and the subset continue to exist independently.

---

## Subsets

A **Subset** is a LinkML schema construct (`subsets:` dict entry) that groups classes and enums by tagging them with `subset_of: [<name>]`. Subsets are part of the schema YAML and travel with it.

### Creating a subset

1. Open the **Project Panel** and expand the **Subsets** section.
2. Click **+**. A text input appears.
3. Type the subset name and press `Enter` (or click away). The subset is created in the active writable schema.

> The **+** button is only shown when a writable (non-imported) schema is active.

### Assigning entities to a subset

**From the Properties Panel:**

1. Select a class or enum on the canvas.
2. In the Properties Panel, scroll to the **In Subsets** section.
3. Check or uncheck subsets to add or remove the entity.

**From the canvas context menu:**

Right-click a class or enum node and use:
- **⊂ Add to subset ▸** — lists subsets the entity is not already in.
- **⊄ Remove from subset ▸** — lists subsets the entity currently belongs to.

### Activating a subset (focus mode)

Click a subset row in the Project Panel to enter subset focus mode. Non-member entities are dimmed on the canvas.

The **Focus Mode Toolbar** (above the canvas) also provides a **Subset:** dropdown for switching between subsets or exiting focus mode by choosing _(none)_.

Click the active subset row again, or choose _(none)_ in the dropdown, to exit focus mode.

### Renaming a subset

Double-click the subset name or click **✎** on the subset row. The rename cascades automatically to all entities' `subset_of` arrays — no manual update required.

### Deleting a subset

Click **×** on the subset row. The subset definition is removed from the schema, and the subset name is removed from all entities' `subset_of` arrays.

### Demoting a subset to a view

Click **⬇** on the subset row to create a [Named View](#named-views) from the current subset membership.

- A new view named `<subset name> (view)` is created with all current subset members.
- The view is activated immediately.
- The original subset is **not** deleted — both continue to exist.

---

## View ↔ Subset round-trips

| Operation | Source | Result |
|-----------|--------|--------|
| Promote | Named View → Subset | Subset created; view members tagged; view preserved |
| Demote | Subset → Named View | View created from members; subset preserved |

Promoting and demoting are non-destructive — the original always remains after the conversion.

---

## Persistence

| Artefact | Stored in |
|----------|-----------|
| Named Views | `.linkml-editor.yaml` editor manifest |
| Subsets | Schema YAML (`subsets:` dict + entity `subset_of:`) |

Views are personal to the editor installation; Subsets are part of the portable schema and visible to any tool that reads LinkML.
