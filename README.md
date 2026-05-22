# Quant Competence Matrix

RPG-style **circular** skill tree for quant career competencies. Three branches (Modeling, Technology, Finance) sit on the outer ring; skills evolve inward. Cross-branch nodes and the apex sit toward the center.

## Controls

- **Hover** a node for details.
- **Drag** to pan, **scroll** to zoom, **double-click** to reset.
- Press **`E`** (or click **Edit**) to enter edit mode.

## How to open

Double-click `run.bat`, or run `python server.py 8000` → `http://localhost:8000`.

`run.bat` launches `server.py`, a tiny local server that both serves the static files and accepts auto-save writes to `data/overrides.js` from the in-app editor.

## Structure

```
  index.html
  main.js                # render + pan/zoom + tooltip + tree API
  editor.js              # edit mode (drag, CRUD, side panel, live code panel, auto-save)
  styles.css
  server.py              # static server + PUT /data/overrides.js (auto-save target)
  data/skills.js         # base node metadata
  data/relationships.js  # explicit graph edges (nearby parent-child links)
  data/layout.js         # circular radial positions
  data/overrides.js      # committed manual overrides on top of auto-layout (auto-saved)
  run.bat
```

## Layout (circular)

- **Roots** on the outer ring (Modeling top, Technology bottom-left, Finance bottom-right).
- **Hubs** and **skills** in angular wedges, growing **inward**.
- **Cross** nodes on boundaries between branches (ML, Pricing, Trading).
- **Apex** (Quant Researcher) at the center.

Relationships are defined in `data/relationships.js`. The graph is no longer a star: each outer point connects to nearby next steps, and only selected bridge skills feed cross-branch nodes near the center.

Positions are computed by `data/layout.js` (planar wedges, no crossing straight edges) and then `data/overrides.js` and any `localStorage` overrides are layered on top.

## Skill kinds

| Kind     | Role                          |
| -------- | ----------------------------- |
| `root`   | Modeling / Technology / Finance |
| `hub`    | Sub-area (Economics, Backend, …) |
| `detail` | Concrete skill                |
| `cross`  | Hybrid between two branches   |
| `apex`   | Center goal                   |

Career-title nodes (Economist, Backend Developer, …) are **not** used — only domain skills (e.g. **Economics**).

## Branches

- Modeling — green
- Technology — blue
- Finance — red

## Edit mode

The tree ships with an in-app editor for tweaking node positions and metadata without leaving the browser.

### Toggle

- Press **`E`** or click the **Edit** button (bottom-left toolbar).
- The right-side panel slides in when a node is selected; the left-side **Code** panel mirrors `data/overrides.js` live.

### Operations

- **Move** — click and drag any node. Drag releases write a position override.
- **Add node** — toolbar button creates a new node at the viewport center, defaulting to the last-edited branch and `kind: "detail"`.
- **Edit metadata** — selecting a node opens the side panel with editable Label, Branch, Kind and Description fields. Branch/Kind changes re-render the node with the right color and size.
- **Delete** — base nodes are tombstoned (kept out of the render); custom-added nodes are removed entirely.
- **Revert** — drops the override (or removes the added node), restoring the auto-layout value.

Edges/relationships are intentionally **not** editable from the UI. Edit `data/relationships.js` directly if you need to wire new nodes up.

### Persistence: auto-save to `data/overrides.js`

When you launch the app via `run.bat` (or `python server.py 8000`), every edit auto-saves to `data/overrides.js` on disk via a debounced HTTP `PUT` to the local server. The **Code** panel header shows the live status: `Saving...`, `Saved 22:14:07`, or `Save failed` if the server is not available.

That means once you are happy with your tree, you can simply commit:

```bash
git add data/overrides.js
git commit -m "Update skill tree overrides"
git push
```

The previous-session edits also remain in `localStorage` (key `matriz-edits`) as a backup — useful if you ever open the page without the local server.

### Live overrides code

Click **Code** in the toolbar to slide in a left-side panel showing the live `data/overrides.js` content. The textarea updates after every drag, metadata edit, add or delete; the **Copy** button is still there as a fallback if you want to paste somewhere else.

New nodes you create via **Add node** stay in `localStorage` only — they are **not** auto-saved to `data/overrides.js`, because that file is for overrides on top of base nodes. To promote a custom node into source, copy its data manually into `data/skills.js` and add edges in `data/relationships.js`.

### Out of scope

- Editing edges via the UI.
- Exporting newly added nodes as a code snippet.
- Undo/redo, multi-select, snap-to-grid, touch input.
