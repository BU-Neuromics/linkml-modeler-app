# Display Panel

The **Display Panel** is a fixed sidebar located between the Project Panel and the canvas. It consolidates all visual-rendering controls in one place. Changes take effect immediately.

---

## Rendering

Three mutually exclusive rendering modes are available. The active mode is highlighted.

| Button | Mode | Description |
|--------|------|-------------|
| `canvas` | ERD Canvas | Default graph view — draggable nodes connected by typed edges |
| `outline` | Outline | Collapsible hierarchy tree — useful for large schemas |
| `table` | Table | Spreadsheet-style bulk-edit grid _(feature-flagged; see [Developer](#developer) below)_ |

The mode set here is the **global default**. A [Named View](./views-and-subsets#named-views) can override it with its own render mode, which takes effect when that view is activated.

---

## Edge Filters

Toggle which edge types are drawn on the canvas. A hidden edge type is still part of the schema — it is only visually suppressed.

| Toggle | Edge type |
|--------|-----------|
| `range` | Slot → range-class edges |
| `is_a` | Inheritance edges |
| `mixin` | Mixin-application edges |
| `union_of` | Union edges |

> **Tip:** Hiding `range` edges reduces clutter when there are many slot references. Range types can still be seen inline — see [Range Edges](#range-edges) below.

---

## Highlight

Two independent highlight behaviours can be toggled on or off.

| Toggle | Effect |
|--------|--------|
| **Hover** | Edges connected to the node under the cursor are highlighted while the cursor is over it |
| **Selection** | Edges connected to selected nodes stay highlighted (sticky) after the click |

---

## Selection

These buttons expand or modify the current node selection without changing the schema. They are most useful before [saving a Named View](./views-and-subsets#creating-a-view).

Selection buttons are disabled when nothing is selected.

### Neighbour expansion

| Button | Selects |
|--------|---------|
| **neighbors** | All nodes directly connected to the selection (both directions) |
| **← in** | Nodes with edges _pointing to_ the selection |
| **out →** | Nodes with edges _originating from_ the selection |

### Ancestry / descent

| Button | Selects |
|--------|---------|
| **ancestors** | Transitive `is_a` + mixin ancestors |
| **descendants** | Transitive `is_a` + mixin descendants |

### Graph reachability

| Button | Selects |
|--------|---------|
| **component** | All nodes reachable from the selection (full connected component) |

### Range navigation

| Button | Selects |
|--------|---------|
| **range →** | Classes that are slot-range targets of the selection |
| **← range** | Classes whose slots reference the selection as a range |

### N-hop expansion

Enter a number (1–9) in the hop field and click **n-hop** (the button label updates, e.g. `2-hop`) to expand the selection by up to _n_ relationship hops in all directions.

### Utility

| Button | Effect |
|--------|--------|
| **invert** | Selects all entities _not_ currently selected |
| **clear** | Clears the entire selection |
| **save as view** | Saves the current selection as a [Named View](./views-and-subsets#named-views) |

---

## Range Edges

Controls how slot → range relationships are displayed.

| Mode | Behaviour |
|------|-----------|
| **show** | Range relationships drawn as explicit ERD edges |
| **inline** | Range type shown as a clickable chip inside the class box — no edge drawn |
| **auto** | The app chooses based on schema density |

When an active Named View has its own range-edge override, a **view override** notice appears below the buttons.

---

## Hop Dimming

When hop dimming is on, nodes farther than _n_ hops from the selected node(s) are dimmed to reduce visual noise.

1. Click the **off** button to enable hop dimming (it changes to **on**).
2. Set the hop distance in the adjacent number field (1–9). The label `hops` confirms the unit.

Nodes within _n_ hops of any selected node remain fully visible; all others are dimmed. Dimming resets when the selection is cleared.

---

## Clustering

Toggle **by import source** to group nodes into swimlane clusters based on the schema file that defines them. This is useful when a project imports multiple schemas and you want to see which classes come from which file.

> **Note:** The swimlane layout overrides manual node positioning. Disable the toggle to return to free-layout mode.

---

## Developer

The **Developer** section contains a feature flag for Table view. It is intended for testing and may be removed in a future release.

| Button | Effect |
|--------|--------|
| **table: off** / **table: on** | Enable or disable the `table` rendering mode button in the Rendering section |

Enabling this flag unlocks the `table` button in [Rendering](#rendering). See [Table View](./view-modes#table-view) for details on using it.
