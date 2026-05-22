# Quant Competence Matrix

RPG-style **circular** skill tree for quant career competencies. Three branches (Modeling, Technology, Finance) sit on the outer ring; skills evolve inward. Cross-branch nodes and the apex sit toward the center.

## Controls

- **Hover** a node for details.
- **Drag** to pan, **scroll** to zoom, **double-click** to reset.
- Press **`E`** (or click **Edit**) to enter edit mode.

## How to open

Double-click `run.bat`, or run `python server.py 8000`. The script opens the browser at `http://localhost:8000/` automatically.

`run.bat` launches `server.py`, a small local server that both serves the static files and accepts auto-save writes to `data/overrides.js` from the in-app editor. If port 8000 is already taken (e.g. you opened the .bat twice), the server tries 8001..8009 and prints which one it ended up on.

## Structure

```
  index.html
  main.js                # render + pan/zoom + tooltip + tree API
  editor.js              # edit mode (drag, CRUD, side panel, auto-save)
  styles.css
  server.py              # static server + PUT /data/overrides.js (auto-save target)
  data/skills.js         # base node metadata
  data/relationships.js  # explicit graph edges (nearby parent-child links)
  data/layout.js         # circular radial positions
  data/overrides.js      # full edit state (overrides, addedNodes, deletedIds), auto-saved
  run.bat
```

## Layout (circular)

- **Roots** on the outer ring (Modeling top, Technology bottom-left, Finance bottom-right).
- **Hubs** and **skills** in angular wedges, growing **inward**.
- **Cross** nodes on boundaries between branches (ML, Pricing, Trading).
- **Apex** (Quant Researcher) at the center.

Relationships are defined in `data/relationships.js`. The graph is no longer a star: each outer point connects to nearby next steps, and only selected bridge skills feed cross-branch nodes near the center.

Positions are computed by `data/layout.js` (planar wedges, no crossing straight edges) and then the contents of `data/overrides.js` (overrides + added + deleted) are layered on top.

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
- The right-side panel slides in when a node is selected.

### Operations

- **Move** — click and drag any node. The cursor offset is preserved so the node does not jump.
- **Add node** — toolbar button creates a new node at the viewport center, defaulting to the last-edited branch and `kind: "detail"`.
- **Edit metadata** — selecting a node opens the side panel with editable Label, Branch, Kind and Description fields. Branch/Kind changes re-render the node with the right color and size.
- **Delete** — base nodes are tombstoned (kept out of the render); custom-added nodes are removed entirely.
- **Revert** — drops the override (or removes the added node), restoring the auto-layout value.

Edges/relationships are intentionally **not** editable from the UI. Edit `data/relationships.js` directly if you need to wire new nodes up.

### What gets saved

Every edit is silently auto-saved to [`data/overrides.js`](data/overrides.js) via the local server. That single file holds the **entire** edit state through three exports:

```js
export const overrides   = { /* per base-node diffs */ };
export const addedNodes  = [ /* skill objects you created */ ];
export const deletedIds  = [ /* base node ids you deleted */ ];
```

Because the file fully describes the diff against `data/skills.js`, committing it reproduces your tree on any clone:

```bash
git add data/overrides.js
git commit -m "Update skill tree"
git push
```

The save itself is silent. A red banner only appears at the top if a save fails (for example, if you opened the page without `run.bat` / `server.py` running). Until you re-establish the connection, your unsaved edits are kept in `localStorage` under the key `matriz-edits` and replayed on reload.

### Out of scope

- Editing edges via the UI.
- Auto git commit/push.
- Undo/redo, multi-select, snap-to-grid, touch input.
