# LinkML Visual Schema Editor — User Guide

A graphical tool for creating and editing [LinkML](https://linkml.io/) schemas without hand-editing YAML.

---

## Getting Started

Open the app in your browser (`pnpm dev` → [http://localhost:5173](http://localhost:5173)) or launch the Electron desktop build. A demo schema loads automatically so you can explore before creating your own.

---

## Interface Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  ⬡ LinkML Visual Schema Editor          [Validate] [Git] [⚙]   │  ← Header
├──────────────┬──────────────────────────────┬────────┬──────────┤
│              │   [Focus Mode Toolbar]        │        │          │
│   Project    │                              │ Props  │  YAML    │
│   Panel      │         Canvas               │ Panel  │ Preview  │
│              │                              │        │          │
├──────────────┴──────────────────────────────┴────────┴──────────┤
│  [Validation Panel] [Git Panel]                                 │  ← Bottom panels
├─────────────────────────────────────────────────────────────────┤
│  personinfo.yaml · 2 class(es) · 1 enum(s)    [keyboard hints] │  ← Status bar
└─────────────────────────────────────────────────────────────────┘
```

### Panels

| Panel | Location | Purpose |
|---|---|---|
| **Project Panel** | Left sidebar | Navigate between schemas in a project; switch active schema |
| **Canvas** | Center | Visual ERD diagram of your schema — drag, zoom, connect nodes |
| **Properties Panel** | Right sidebar | Edit the selected class, slot, or enum |
| **YAML Preview** | Far right | Live read-only view of the YAML being generated |
| **Validation Panel** | Bottom (toggle) | Errors and warnings from schema validation |
| **Git Panel** | Bottom (toggle) | Stage, commit, and push changes when Git is available |

---

## Working with the Canvas

### Navigation

| Action | How |
|---|---|
| Pan | Click and drag on empty canvas space |
| Zoom | Scroll wheel or pinch |
| Fit all nodes in view | Press `F` |
| Select a node | Click it |
| Select multiple nodes | Shift-click or drag a selection box |

### Adding Nodes

- **Right-click** anywhere on the canvas to open the context menu.
- Choose **Add Class** or **Add Enum**.

### Connecting Classes

- Hover over a class node — connection handles (small dots) appear on its edges.
- Drag from a handle on one class to a handle on another to create an `is_a` (inheritance) relationship.

### Deleting Nodes or Edges

- Select a node or edge, then press `Delete` (or `Backspace`).

### Undo / Redo

- `Ctrl+Z` / `Cmd+Z` — undo
- `Ctrl+Y` / `Cmd+Shift+Z` — redo

---

## Editing Schema Elements

### Classes

Click a class node to select it. The **Properties Panel** on the right shows:

- **Name** and **Description**
- **is_a** — parent class (inheritance)
- **Mixins** — list of mixin classes to apply
- **Abstract** / **Mixin** flags
- **Attributes/Slots** — add, rename, delete, and configure each slot's range, cardinality, and identifiers

### Enumerations

Click an enum node. The Properties Panel shows:

- **Name** and **Description**
- **Permissible values** — add or remove values, set meaning URIs

### Schema Settings

Click **⚙ Schema Settings** in the header to edit the active schema's top-level metadata:

- Schema name, title, and description
- Default prefix and URI
- Additional prefixes
- Imports list

---

## Projects and Multi-Schema Support

A **project** is a collection of related schema files sharing a namespace hierarchy.

- The **Project Panel** on the left lists all schemas in the current project.
- Click a schema name to switch to it.
- One schema can `import` another — imported classes appear as read-only references.

---

## Saved Views

A **view** is an editor-only filter that pins a named list of entities on the canvas — useful for working on a specific slice of a large schema without changing the schema itself.

- **Create a view** — select nodes on the canvas, then click **+** in the Views section of the Project Panel.
- **Activate a view** — click its name in the Project Panel; the canvas shows only those entities.
- **Rename / duplicate / delete** — use the action icons on the right of each view row.
- **Promote to subset** — click ⬆ on a view row to convert it into a schema-level LinkML `subset:` definition (writes `in_subset` tags on each member entity). Only available when all members are in the active writable schema.

---

## LinkML Subsets

**Subsets** are a first-class LinkML concept (`subsets:` in the YAML) that group entities by domain or concern. The editor provides full editing support for subsets, listed in the **Subsets** section of the Project Panel.

### Viewing and focussing subsets

- Click a subset name in the Project Panel to enter **Subset Focus** — only entities tagged with that subset are shown on the canvas. Click again to exit.

### Creating and editing subsets

- Click **+** in the Subsets section header to create a new subset.
- Click **✎** on a subset row to rename it (all `in_subset` references cascade automatically).
- Click **×** to delete a subset (all `in_subset` references are removed).

### Managing entity membership

**In the Properties Panel** (right sidebar):
- Select a class or enum on the canvas; a **In Subsets** section lists all available subsets with checkboxes.
- Check/uncheck to add or remove the entity from a subset.
- Schema-level slots also show the **In Subsets** section when you expand them in **Schema Settings → Schema Slots**.

**On the canvas** (context menu):
- Right-click a class or enum node; the context menu shows **Add to subset ▸** and **Remove from subset ▸** fly-out menus.

### Subsets vs Views — when to use which

| | **View** | **Subset** |
|---|---|---|
| Stored in | `.linkml-editor.yaml` (editor only) | `schema.yaml` (schema file — shared) |
| Visible to LinkML tools | No | Yes |
| Use for | Personal canvas organisation | Domain groupings meaningful to downstream tools |

**Demote subset to view** — click ⬇ on a subset row to copy its membership into a new editor view. The subset itself is preserved; the view gives you an editor-side reference to the same set.

---

## Focus Modes

The **Focus Mode Toolbar** (above the canvas) lets you isolate a subset of the schema:

- **No Focus** — show all classes and enums
- **Class Focus** — show only the selected class and its direct relationships
- **Subset Focus** — show only elements tagged with a specific LinkML subset (also activatable from the Subsets panel)

Use focus modes when working on large schemas to reduce visual clutter.

---

## Importing and Exporting YAML

### Import (load an existing schema)

Use the **Project Panel** or the platform file dialog (varies by browser/desktop) to open an existing `.yaml` or `.yml` LinkML schema file.

### Export (save your work)

- Click **⚙ Schema Settings → Export** (or use the keyboard shortcut shown in the status bar).
- The YAML Preview panel always shows the exact YAML that will be saved.
- The status bar shows **● unsaved changes** when there are edits not yet written to disk.

---

## Git Integration

When Git is available (Electron desktop, or a browser with OPFS support), the **Git Panel** provides:

- **Status** — staged, unstaged, and untracked files
- **Stage / Unstage** files
- **Commit** — write a commit message and commit staged changes
- **Push** — push to the configured remote (prompts for credentials if needed)

> **Note:** Git features require a Git repository to be initialised in the project directory (`git init`).

---

## Validation

Click **✓ Validate** in the header to open the **Validation Panel**. It checks your schema for:

- Missing required fields (e.g. a slot with no `range`)
- Invalid references (e.g. `is_a` pointing to a class that doesn't exist)
- Structural issues (circular inheritance, duplicate identifiers)

Errors appear in red; warnings appear in yellow. The status bar also summarises the error/warning counts.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F` | Fit all nodes in view |
| `Delete` / `Backspace` | Delete selected node or edge |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Cmd+Shift+Z` | Redo |
| Right-click canvas | Open context menu (add class/enum) |
