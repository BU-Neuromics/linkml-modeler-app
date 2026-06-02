# View Modes

The editor supports three ways to visualise the same schema. All three modes share the same selection state, so switching modes does not change what is selected or what the Properties Panel shows.

Switch modes using the **View Mode** buttons at the top of the [Display Panel](./display-panel#view-mode), or by activating a [Named View](./views-and-subsets#named-views) that has a mode override.

---

## Canvas View

**Canvas** is the default ERD-style graph. Nodes are draggable and the canvas is pannable and zoomable.

### Toolbar

Above the canvas:

| Button | Action |
|--------|--------|
| `+ Class` | Add a new class to the schema |
| `+ Enum` | Add a new enum to the schema |
| `+ Label` | Place a free-floating text label on the canvas |
| Auto-layout icon | Re-run ELK-based automatic layout |

### Navigation

| Action | How |
|--------|-----|
| Pan | Click-drag on empty canvas space |
| Zoom | Scroll wheel or pinch gesture |
| Fit all in view | Press `F` |
| Select a node | Click it |
| Multi-select | Shift-click, or drag a selection box |
| Collapse a node | Double-click it |

### Context menu

Right-click any class or enum node to:

- **Delete** the node
- **Add to subset ▸** — add to a specific [Subset](./views-and-subsets#subsets)
- **Remove from subset ▸** — remove from a specific Subset

---

## Outline View

**Outline** renders the schema as a collapsible hierarchy tree. It is better suited to schemas with deep inheritance trees or when screen space is limited.

### Layout

Nodes are grouped into two sections: **Classes** and **Enums**. Each row can be expanded to reveal child elements:

- **Class rows** — shows the class name with optional `abstract` / `mixin` badges. Expand to see:
  - Child classes (those that declare `is_a: <this class>`)
  - Slots defined on the class, with `req`, `[]`, and range-type badges
  - Classes that apply this class as a mixin
- **Enum rows** — expand to see permissible values

### Interaction

| Action | Keyboard | Mouse |
|--------|----------|-------|
| Select a row | `Enter` or `Space` | Click |
| Move focus up / down | `↑` / `↓` | — |
| Expand / collapse | `→` / `←` | Click disclosure triangle |

Selection in Outline drives the same Properties Panel as Canvas — the selected class or enum is editable without switching back to Canvas mode.

---

## Table View

**Table** is a spreadsheet-style bulk-edit grid. It is well suited for rapidly editing many classes, slots, or enum values without navigating between nodes.

> **Enabling Table View:** Table view is a feature flag. If the `table` button is absent from the [Rendering](./display-panel#rendering) section of the Display Panel, scroll down to the **Developer** section and click **table: off** to toggle it on. The `table` button will appear immediately — no page reload required.

### Row type switcher

Three row types are available, selected via the toggle at the top of the table:

| Button | Rows show |
|--------|-----------|
| `classes` | One row per class |
| `slots` | One row per slot, grouped by owning class |
| `enums` | One row per enum |

### Columns

**Classes:**

| Column | Editable | Description |
|--------|----------|-------------|
| Name | Yes | Class name |
| is_a | Yes | Parent class |
| abstract | Yes | Abstract flag (checkbox) |
| mixin | Yes | Mixin flag (checkbox) |
| Description | Yes | Human-readable description |

**Slots:**

| Column | Editable | Description |
|--------|----------|-------------|
| Class | No | Owning class name |
| Slot | Yes | Slot name |
| range | Yes | Range type |
| req | Yes | Required flag (checkbox) |
| multi | Yes | Multivalued flag (checkbox) |
| id | Yes | Identifier flag (checkbox) |
| Description | Yes | Human-readable description |

**Enums:**

| Column | Editable | Description |
|--------|----------|-------------|
| Name | Yes | Enum name |
| Values | Yes | Comma-separated permissible values |
| Description | Yes | Human-readable description |

### Editing cells

- **Text cells:** Double-click to enter edit mode. Press `Enter` to commit or `Esc` to cancel. Clicking away also commits.
- **Checkbox cells:** Single-click to toggle.

### Active view filtering

When a [Named View](./views-and-subsets#named-views) is active, the table shows only the classes/enums that are members of that view.
