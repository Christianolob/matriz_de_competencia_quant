# Quant Competence Matrix

RPG-style **circular** skill tree for quant career competencies. Three branches (Modeling, Technology, Finance) sit on the outer ring; skills evolve inward. Cross-branch nodes and the apex sit toward the center.

## Controls

- **Hover** a node for details.
- **Drag** to pan, **scroll** to zoom, **double-click** to reset.

## How to open

Double-click `run.bat`, or `python -m http.server 8000` → `http://localhost:8000`.

## Structure

```
  index.html
  main.js
  data/skills.js    # graph data
  data/layout.js    # circular radial positions
  run.bat
```

## Layout (circular)

- **Roots** on the outer ring (Modeling top, Technology bottom-left, Finance bottom-right).
- **Hubs** and **skills** in angular wedges, growing **inward**.
- **Cross** nodes on boundaries between branches (ML, Pricing, Trading).
- **Apex** (Quant Researcher) at the center.

Positions are computed by `data/layout.js` (planar wedges, no crossing straight edges between branches).

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
