/**
 * Guided tour system using driver.js.
 *
 * Each tour is a named sequence of driver.js steps. Tours are triggered from
 * the Help menu in MenuBar and can be re-run at any time. Before starting a
 * tour, panels that the tour references are opened so their DOM elements exist.
 */
import { driver, type DriveStep, type Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAppStore } from '../store/index.js';

// ── Theme-aware styles for driver.js popovers ─────────────────────────────────
// Uses CSS custom properties from tokens.css so light/dark theme switching
// on <html data-theme="..."> automatically drives correct popover colors.

const TOUR_STYLES = `
  .lme-tour-popover {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    color: var(--color-fg-primary);
    font-family: var(--font-family-mono);
    max-width: 320px;
    padding: 18px 20px 14px;
    box-shadow: var(--shadow-modal);
  }
  .lme-tour-popover .driver-popover-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--color-accent-default);
    margin-bottom: 8px;
  }
  .lme-tour-popover .driver-popover-description {
    font-size: var(--font-size-sm);
    line-height: 1.65;
    color: var(--color-fg-secondary);
  }
  .lme-tour-popover .driver-popover-description b {
    color: var(--color-fg-primary);
    font-weight: var(--font-weight-semibold);
  }
  .lme-tour-popover .driver-popover-description code,
  .lme-tour-popover .driver-popover-description kbd {
    background: var(--color-bg-canvas);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-fg-primary);
  }
  /* Footer layout: [Back] [Progress (centered)] [Next/Done]
     display:contents on navigation-btns flattens Back/Next into the footer
     flex container so we can order them around the progress text. */
  .lme-tour-popover .driver-popover-footer {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lme-tour-popover .driver-popover-navigation-btns {
    display: contents;
  }
  .lme-tour-popover .driver-popover-prev-btn,
  .lme-tour-popover .driver-popover-next-btn,
  .lme-tour-popover .driver-popover-done-btn {
    background-image: none;
    background: var(--color-bg-surface-raised);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-md);
    color: var(--color-fg-primary);
    cursor: pointer;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    margin: 0;
    order: 1;
    padding: 5px 12px;
    text-shadow: none;
  }
  .lme-tour-popover .driver-popover-next-btn,
  .lme-tour-popover .driver-popover-done-btn {
    background: var(--color-accent-default);
    border-color: var(--color-accent-active);
    color: var(--color-fg-on-accent);
  }
  .lme-tour-popover .driver-popover-prev-btn {
    order: -1;
  }
  .lme-tour-popover .driver-popover-prev-btn:hover { background: var(--color-bg-hover); }
  .lme-tour-popover .driver-popover-next-btn:hover,
  .lme-tour-popover .driver-popover-done-btn:hover { background: var(--color-accent-active); }
  .lme-tour-popover .driver-popover-progress-text {
    flex: 1;
    order: 0;
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-fg-muted);
    font-family: var(--font-family-mono);
  }
  .lme-tour-popover .driver-popover-close-btn {
    color: var(--color-fg-muted);
    font-size: 16px;
    line-height: 1;
    position: absolute;
    top: 12px;
    right: 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: var(--font-family-mono);
  }
  .lme-tour-popover .driver-popover-close-btn:hover { color: var(--color-fg-secondary); }
  .driver-overlay { background: rgba(0,0,0,0.65) !important; }
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.id = 'lme-tour-styles';
  el.textContent = TOUR_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

// ── Shared popover config ─────────────────────────────────────────────────────

const BASE_CONFIG: Partial<Config> = {
  animate: true,
  smoothScroll: true,
  allowClose: true,
  overlayOpacity: 0.6,
  stagePadding: 6,
  stageRadius: 6,
  popoverClass: 'lme-tour-popover',
  nextBtnText: 'Next →',
  prevBtnText: '← Back',
  doneBtnText: 'Done',
  showProgress: true,
  progressText: '{{current}} of {{total}}',
};

// ── Helper: poll for a DOM element then invoke callback ───────────────────────
// Advances to the next step once selector is present in the DOM, or after
// timeoutMs if the element never arrives (e.g. empty schema).

function waitForElement(selector: string, onReady: () => void, timeoutMs = 2000): void {
  const deadline = Date.now() + timeoutMs;
  const interval = window.setInterval(() => {
    if (document.querySelector(selector) || Date.now() >= deadline) {
      window.clearInterval(interval);
      onReady();
    }
  }, 50);
}

// ── Tour: App Overview ────────────────────────────────────────────────────────

const overviewSteps: DriveStep[] = [
  {
    element: '#lme-logo',
    popover: {
      title: '⬡ LinkML Visual Schema Editor',
      description:
        'Welcome! This app lets you design LinkML schemas visually on an ERD-style canvas — no hand-editing YAML required. This tour will show you where everything lives.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#lme-menubar',
    popover: {
      title: 'Menu Bar',
      description:
        'The menu bar gives you access to all file operations (<b>File</b>), undo/redo (<b>Edit</b>), panel toggles (<b>View</b>), git actions (<b>Git</b>), and these tours (<b>Help</b>).',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#lme-project-panel',
    popover: {
      title: 'Project Panel',
      description:
        'The <b>Project Panel</b> on the left lists every schema file in your project. Click a file to make it active. Files marked <i>imported</i> are read-only references from another schema.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#lme-canvas-area',
    popover: {
      title: 'Canvas',
      description:
        'The <b>canvas</b> is your visual workspace. Classes and enumerations appear as nodes. Scroll to zoom, drag empty space to pan, and press <kbd>F</kbd> to fit everything in view.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-toolbar',
    popover: {
      title: 'Canvas Toolbar',
      description:
        'Use these buttons to <b>add a class</b>, <b>add an enum</b>, or <b>auto-layout</b> the diagram. You can also right-click anywhere on the canvas to get the same options.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-focus-toolbar',
    popover: {
      title: 'Focus Mode Toolbar',
      description:
        'When working on large schemas, <b>Focus Mode</b> lets you isolate a subset or just the nodes you have selected — hiding everything else to reduce clutter.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Properties Panel',
      description:
        'Click any node on the canvas to select it. The <b>Properties Panel</b> on the right will show its editable fields — name, description, slots, enums, inheritance, and more.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-panel',
    popover: {
      title: 'Display Panel',
      description:
        'The <b>Display Panel</b> controls how the canvas looks: switch rendering modes (canvas / outline / table), filter edge types, expand selections by neighbourhood, and tune hop dimming and clustering.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-validation-panel',
    popover: {
      title: 'Validation Panel',
      description:
        'The <b>Validation Panel</b> at the bottom checks your schema for errors and warnings — missing ranges, invalid references, circular inheritance, and so on. Click it to expand.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Git Panel',
      description:
        'Next to Validation, the <b>Git Panel</b> lets you stage files, write commit messages, push to a remote, and view recent history — all without leaving the editor.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#lme-footer',
    popover: {
      title: 'Status Bar',
      description:
        'The status bar shows the active file name, class/enum counts, any validation errors, and the latest git commit. Common keyboard shortcuts are listed on the right.',
      side: 'top',
      align: 'start',
    },
  },
];

// ── Tour: Project Panel ───────────────────────────────────────────────────────

const projectPanelSteps: DriveStep[] = [
  {
    element: '#lme-project-panel',
    popover: {
      title: 'Project Panel Overview',
      description:
        'The <b>Project Panel</b> shows every schema file that belongs to your project. A project is a folder that can contain multiple linked <code>.yaml</code> files.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#lme-project-panel',
    popover: {
      title: 'Switching Active Schemas',
      description:
        'Click any file row to make that schema active. The canvas and Properties Panel will switch to show that file\'s classes and enums. Only one schema is active at a time.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-project-panel',
    popover: {
      title: 'File Indicators',
      description:
        '<b>●</b> (orange dot) means the file has unsaved changes. The <b>◻</b>/<b>◼</b> icons show whether a schema is editable or read-only. Click the visibility dot to show or hide a schema on the canvas.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-menubar',
    popover: {
      title: 'Adding & Importing Schemas',
      description:
        'Use <b>File → New Schema…</b> to create a blank schema file in your project, or <b>File → Import Schema…</b> to bring in an existing <code>.yaml</code> file. Imported schemas appear as read-only references.',
      side: 'bottom',
      align: 'start',
    },
  },
];

// ── Tour: Canvas & Workspace ──────────────────────────────────────────────────

const canvasSteps: DriveStep[] = [
  {
    element: '#lme-canvas-area',
    popover: {
      title: 'The Canvas',
      description:
        'This is your schema workspace. Classes appear as hexagon-bordered cards; enumerations appear in orange. Drag nodes to reposition them — positions are saved automatically.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-add-class',
    popover: {
      title: 'Adding a Class',
      description:
        'Click <b>⬡ + Class</b> to add a new class to the canvas and schema. You can also right-click anywhere on the canvas background for the same option.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-add-enum',
    popover: {
      title: 'Adding an Enumeration',
      description:
        'Click <b>◈ + Enum</b> to add a new enumeration. Enums hold a fixed list of permissible values and can be used as the range of a slot.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-layout',
    popover: {
      title: 'Auto Layout',
      description:
        'Click <b>⬡ Layout</b> to automatically arrange all nodes using the ELK graph layout engine. Useful after adding many classes at once, or when the diagram gets cluttered.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-area',
    popover: {
      title: 'Creating Relationships',
      description:
        'To create an <b>is_a</b> (inheritance) relationship, hover over a class node until small connection handles appear on its edges, then drag from one handle to another class.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-canvas-area',
    popover: {
      title: 'Selecting & Deleting',
      description:
        'Click a node to select it. Hold <kbd>Shift</kbd> and click (or drag a rubber-band box) to select multiple. Press <kbd>Delete</kbd> or <kbd>Backspace</kbd> to remove selected nodes or edges.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-focus-toolbar',
    popover: {
      title: 'Focus Mode',
      description:
        'Select one or more nodes, then click <b>⬡ Focus Selection</b> to hide everything else and concentrate on just those nodes and their neighbours. Use the subset dropdown to focus by LinkML subset tag.',
      side: 'bottom',
      align: 'start',
    },
  },
];

// ── Tour: Properties & YAML Preview ──────────────────────────────────────────

const propertiesSteps: DriveStep[] = [
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Properties Panel',
      description:
        'The <b>Properties Panel</b> is context-sensitive — its content changes based on what you select. With nothing selected it shows the active schema\'s metadata.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Editing a Class',
      description:
        'Click any class node on the canvas to select it. You can then edit its <b>name</b>, <b>description</b>, <b>is_a</b> parent, <b>mixins</b>, and toggle the <b>abstract</b> or <b>mixin</b> flags.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Managing Slots (Attributes)',
      description:
        'Slots are the fields of a class. In the Properties Panel you can add, rename, and delete slots, and configure each slot\'s <b>range</b> (type), <b>cardinality</b>, and identifier flags.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Editing an Enumeration',
      description:
        'Select an enum node to edit its name, description, and <b>permissible values</b>. You can also set optional meaning URIs for each value to link to ontology terms.',
      side: 'left',
      align: 'center',
    },
  },
  {
    element: '#lme-yaml-preview',
    popover: {
      title: 'YAML Preview',
      description:
        'The <b>YAML Preview</b> panel (far right) shows the exact YAML that will be written to disk when you save. It updates in real time as you edit. Toggle it via <b>View → YAML Preview</b>.',
      side: 'left',
      align: 'start',
    },
  },
];

// ── Tour: Validation ──────────────────────────────────────────────────────────

const validationSteps: DriveStep[] = [
  {
    element: '#lme-validation-panel',
    popover: {
      title: 'Validation Panel',
      description:
        'The <b>Validation Panel</b> checks your schema for structural problems. Click it to expand. Validation never blocks saving — errors are informational.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#lme-validation-panel',
    popover: {
      title: 'Running Validation',
      description:
        'Click <b>▶ Validate</b> inside the panel to run a full check. The summary bar shows counts of <span style="color:#f87171">errors</span>, <span style="color:#fbbf24">warnings</span>, and info messages.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-validation-panel',
    popover: {
      title: 'Filtering & Jumping',
      description:
        'Use the filter buttons (<b>Errors</b>, <b>Warnings</b>, <b>Info</b>) to narrow the list. Click <b>↗ jump</b> on any issue to select the offending class or slot on the canvas.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-footer',
    popover: {
      title: 'Status Bar Summary',
      description:
        'Error and warning counts are also visible in the status bar at the bottom of the screen, so you always have a quick read on schema health without expanding the panel.',
      side: 'top',
      align: 'start',
    },
  },
];

// ── Tour: Git Workflow ────────────────────────────────────────────────────────

const gitSteps: DriveStep[] = [
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Git Panel',
      description:
        'The <b>Git Panel</b> provides full version control from inside the editor. Click it to expand. Git is available when you open a folder that already has a git repository, or after cloning.',
      side: 'top',
      align: 'start',
    },
  },
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Changes Tab — Staging Files',
      description:
        'The <b>Changes</b> tab shows modified, untracked, and staged files. Check files to stage them, or use <b>Stage All</b> to stage everything at once.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Committing',
      description:
        'Type a commit message in the text area and click <b>Commit</b> to create a new commit from your staged files. The <b>Log</b> tab shows recent commits with their hashes and timestamps.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Pushing & Pulling',
      description:
        'Use <b>↑ Push</b> to send commits to your remote. If credentials are required, you\'ll be prompted securely. Use <b>↓ Pull</b> to fetch the latest from the remote.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-git-panel',
    popover: {
      title: 'Settings Tab',
      description:
        'The <b>Settings</b> tab lets you configure the remote URL, author name, and email for this repository. Credentials are stored securely using the platform keychain.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#lme-menubar',
    popover: {
      title: 'Git Menu',
      description:
        'The <b>Git</b> menu in the menu bar provides quick shortcuts to open the panel for committing, pushing, and pulling without having to click the bottom tab.',
      side: 'bottom',
      align: 'start',
    },
  },
];

// ── Tour: Display Panel & Canvas Views ───────────────────────────────────────
// onNextClick for mode-switching steps uses opts.driver from the callback args
// so the steps array is fully static.

const displayPanelSteps: DriveStep[] = [
  {
    element: '#lme-display-panel',
    popover: {
      title: 'Display Panel',
      description:
        'The <b>Display Panel</b> is your visual control centre. It lets you switch rendering modes, filter edge types, tune highlights, expand node selections by neighbourhood, and adjust advanced canvas settings.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-mode-canvas',
    popover: {
      title: 'Rendering Modes',
      description:
        'Switch between three canvas views: <b>canvas</b> (ERD diagram), <b>outline</b> (collapsible tree), and <b>table</b> (spreadsheet). The tour will demonstrate each one live.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-toggle-range',
    popover: {
      title: 'Edge Filters',
      description:
        'Toggle the visibility of each edge type — <b>range</b> (slot type arrows), <b>is_a</b> (inheritance), <b>mixin</b>, and <b>union_of</b>. Hiding irrelevant edge types reduces visual clutter on dense schemas.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-highlight-hover',
    popover: {
      title: 'Highlight on Hover / Selection',
      description:
        'When <b>Hover</b> is on, hovering a node highlights its edges and dims unrelated ones. <b>Selection</b> does the same but stays active while a node is selected.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-sel-neighbors-both',
    popover: {
      title: 'Selection Neighborhood',
      description:
        'Expand your selection by graph neighbourhood: <b>neighbors</b>, directional <b>in/out</b>, <b>ancestors</b>/<b>descendants</b> via inheritance, <b>component</b> (all connected nodes), and slot <b>range</b> targets/sources.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-sel-save-view',
    popover: {
      title: 'Save Selection as View',
      description:
        'After expanding or hand-picking a selection, click <b>save as view</b> to save it as a named view in the Project Panel. The view remembers which nodes were selected and can be activated any time.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-range-edges-show',
    popover: {
      title: 'Range Edge Rendering',
      description:
        'Choose how slot range relationships are drawn: <b>show</b> draws arrows, <b>inline</b> renders the type as a chip inside the class box, and <b>auto</b> picks the best mode based on schema density.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-hop-dimming-toggle',
    popover: {
      title: 'Hop-Distance Dimming',
      description:
        'When enabled, nodes farther than <b>N hops</b> from your selection are dimmed. Useful for tracing local neighbourhoods without hiding nodes entirely. Adjust the hop count with the number input.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-display-group-by-import-source',
    popover: {
      title: 'Import-Source Clustering',
      description:
        'When enabled, nodes are grouped into swimlane backgrounds by their source schema. Useful when your project imports multiple schemas — you can instantly see which entities belong to which file.',
      side: 'left',
      align: 'start',
    },
  },
  // Switch to Outline: onNextClick drives the canvas live, then advances.
  {
    element: '#lme-display-mode-outline',
    popover: {
      title: 'Outline Mode — Live Demo',
      description:
        'Click <b>Next</b> to switch the canvas to <b>Outline mode</b>. Outline mode shows a collapsible tree of all classes and enums — great for navigating large schemas without the ERD clutter.',
      side: 'left',
      align: 'start',
      onNextClick: (_el, _step, opts) => {
        useAppStore.getState().setGlobalRenderMode('outline');
        waitForElement('#lme-outline-view', () => opts.driver.moveNext());
      },
    },
  },
  {
    element: '#lme-outline-view',
    popover: {
      title: 'Outline View',
      description:
        'The <b>Outline view</b> shows your schema as a collapsible tree. Classes are arranged in inheritance order with their slots nested beneath. Clicking a row selects it — the Properties Panel updates accordingly.',
      side: 'right',
      align: 'start',
    },
  },
  // lme-outline-classes-header is present when any classes exist; driver.js
  // gracefully centres the popover if the schema is empty.
  {
    element: '#lme-outline-classes-header',
    popover: {
      title: 'Classes Section',
      description:
        'The <b>Classes</b> section header separates class rows from enum rows. Classes are sorted alphabetically and shown in their inheritance hierarchy — child classes are indented under their parents.',
      side: 'right',
      align: 'start',
    },
  },
  // Switch to Table from the last outline step: enable flag + switch, then advance.
  {
    element: '#lme-outline-enums-header',
    popover: {
      title: 'Enums Section',
      description:
        'The <b>Enums</b> section lists all enumerations. Expand an enum row to see its permissible values. Click any enum to select it and view or edit it in the Properties Panel.',
      side: 'right',
      align: 'start',
      onNextClick: (_el, _step, opts) => {
        const store = useAppStore.getState();
        store.setTableModeEnabled(true);
        store.setGlobalRenderMode('table');
        waitForElement('#lme-table-root', () => opts.driver.moveNext());
      },
    },
  },
  {
    element: '#lme-table-root',
    popover: {
      title: 'Table View',
      description:
        'The <b>Table view</b> renders your schema as a spreadsheet for bulk editing. Switch between <b>Classes</b>, <b>Slots</b>, and <b>Enums</b> rows using the toolbar. Click any cell to edit inline.',
      side: 'top',
      align: 'start',
    },
  },
];

// ── Tour: Views & Subsets ─────────────────────────────────────────────────────

const viewsSubsetsSteps: DriveStep[] = [
  {
    element: '#lme-project-panel',
    popover: {
      title: 'Views & Subsets',
      description:
        'The <b>Project Panel</b> hosts two powerful ways to organise your schema: <b>Views</b> (editor-only saved perspectives) and <b>Subsets</b> (LinkML first-class groupings written to your YAML). Both sections live in the lower part of this panel.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#lme-views-section',
    popover: {
      title: 'Views Section',
      description:
        'The <b>Views</b> section lists named canvas perspectives. Each view remembers which nodes were selected when you saved it, and can also store its own render mode and edge-filter overrides. Views are stored in <code>.linkml-editor.yaml</code> — not in your schema YAML.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#lme-views-section',
    popover: {
      title: 'Saving a View from Selection',
      description:
        'Select one or more nodes on the canvas, then click the <b>+</b> button in the Views header to save that selection as a new named view. The view highlights those nodes whenever it is activated.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-views-section',
    popover: {
      title: 'Activating & Editing Views',
      description:
        'Click any view row to activate it — the canvas focuses on that view\'s members. Each row has action buttons: <b>✎</b> rename, <b>⧉</b> duplicate, <b>⬆</b> promote to a LinkML subset, and <b>×</b> delete.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-subsets-section',
    popover: {
      title: 'Subsets Section',
      description:
        'The <b>Subsets</b> section lists LinkML <code>subsets</code> defined in your active schema. Subsets are written to your YAML and can be used downstream for filtering, documentation, and code generation.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#lme-subsets-section',
    popover: {
      title: 'Creating a Subset',
      description:
        'Click the <b>+</b> button in the Subsets header to create a new LinkML subset. Type the name and press Enter. The subset is added to your schema YAML immediately.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-subsets-section',
    popover: {
      title: 'Subset Row Actions',
      description:
        'Each subset row has action buttons: <b>✎</b> rename, <b>⬇</b> demote to a view (copies members into an editor view without modifying schema YAML), and <b>×</b> delete.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#lme-properties-panel',
    popover: {
      title: 'Subset Membership via Properties',
      description:
        'Select a class or enum on the canvas, then look for the <b>"In Subsets"</b> section in the Properties Panel. Use the checkboxes to add or remove the entity from any subset — the YAML updates immediately.',
      side: 'left',
      align: 'start',
    },
  },
  {
    element: '#lme-views-section',
    popover: {
      title: 'Promote View → Subset',
      description:
        'Click <b>⬆</b> on a view row to promote it to a full LinkML subset. All the view\'s members are tagged with the new subset in your schema YAML, and the view is replaced by the subset in the Subsets list.',
      side: 'right',
      align: 'start',
    },
  },
];

// ── Tour registry & launcher ──────────────────────────────────────────────────

export type TourId =
  | 'overview'
  | 'project-panel'
  | 'canvas'
  | 'properties'
  | 'validation'
  | 'git'
  | 'display-panel'
  | 'views-subsets';

export const TOURS: Record<TourId, DriveStep[]> = {
  overview: overviewSteps,
  'project-panel': projectPanelSteps,
  canvas: canvasSteps,
  properties: propertiesSteps,
  validation: validationSteps,
  git: gitSteps,
  'display-panel': displayPanelSteps,
  'views-subsets': viewsSubsetsSteps,
};

/**
 * Exported for test coverage: every TourId must have an entry here, and the
 * test verifies that every entry has a matching TOURS record + Help-menu
 * launcher. MenuBar iterates this array to build the Help menu tour items.
 */
export const HELP_TOUR_DEFS: ReadonlyArray<{
  id: TourId;
  label: string;
  requiresProject: boolean;
}> = [
  { id: 'overview',       label: '▶ App Overview',                    requiresProject: false },
  { id: 'overview',       label: '▶ Getting Started (Splash Page)',    requiresProject: true  },
  { id: 'project-panel',  label: '▶ Project Panel',                   requiresProject: true  },
  { id: 'canvas',         label: '▶ Canvas & Workspace',              requiresProject: true  },
  { id: 'properties',     label: '▶ Properties & YAML Preview',       requiresProject: true  },
  { id: 'validation',     label: '▶ Validation',                      requiresProject: true  },
  { id: 'git',            label: '▶ Git Workflow',                    requiresProject: true  },
  { id: 'display-panel',  label: '▶ Display Panel & Canvas Views',    requiresProject: true  },
  { id: 'views-subsets',  label: '▶ Views & Subsets',                 requiresProject: true  },
];

/**
 * Start a named tour. Panels that the tour requires are opened first so their
 * DOM elements are guaranteed to be mounted when driver.js highlights them.
 */
export function startTour(
  id: TourId,
  opts?: {
    /** Called to ensure a panel is open before the tour starts. */
    openValidationPanel?: () => void;
    openGitPanel?: () => void;
    openPropertiesPanel?: () => void;
    openYamlPreview?: () => void;
    openProjectPanel?: () => void;
  }
): void {
  // Pre-open panels required by this tour so their elements are in the DOM.
  if (id === 'overview' || id === 'validation') {
    opts?.openValidationPanel?.();
  }
  if (id === 'overview' || id === 'git') {
    opts?.openGitPanel?.();
  }
  if (id === 'overview' || id === 'properties') {
    opts?.openPropertiesPanel?.();
  }
  if (id === 'properties') {
    opts?.openYamlPreview?.();
  }
  if (id === 'views-subsets') {
    opts?.openProjectPanel?.();
    opts?.openPropertiesPanel?.();
  }

  injectStyles();

  if (id === 'display-panel') {
    // Capture render state before the tour so we can restore it on exit.
    const store = useAppStore.getState();
    const originalMode = store.globalRenderMode;
    const originalTableMode = store.tableModeEnabled;
    const originalViewId = store.activeViewId;

    // Deactivate any active view so globalRenderMode drives the canvas directly.
    if (originalViewId !== null) {
      store.setActiveViewId(null);
    }

    setTimeout(() => {
      const d = driver({
        ...BASE_CONFIG,
        steps: displayPanelSteps,
        onDestroyed: () => {
          const s = useAppStore.getState();
          s.setGlobalRenderMode(originalMode);
          s.setTableModeEnabled(originalTableMode);
          if (originalViewId !== null) {
            s.setActiveViewId(originalViewId);
          }
        },
      });
      d.drive();
    }, 80);
    return;
  }

  if (id === 'views-subsets') {
    setTimeout(() => {
      // Expand Views and Subsets sections if the user had them collapsed.
      const viewsBtn = document.getElementById('lme-views-section') as HTMLButtonElement | null;
      const subsetsBtn = document.getElementById('lme-subsets-section') as HTMLButtonElement | null;
      if (viewsBtn?.title === 'Expand views') viewsBtn.click();
      if (subsetsBtn?.title === 'Expand subsets') subsetsBtn.click();

      const d = driver({ ...BASE_CONFIG, steps: viewsSubsetsSteps });
      d.drive();
    }, 80);
    return;
  }

  const steps = TOURS[id];

  // Small delay so React can flush any state updates from the panel opens above.
  setTimeout(() => {
    const d = driver({ ...BASE_CONFIG, steps });
    d.drive();
  }, 80);
}
