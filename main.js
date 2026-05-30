import { skills as baseSkills } from "./data/skills.js";
import { applyLayout } from "./data/layout.js";
import { parentsOf } from "./data/relationships.js";
import {
  overrides as fileOverrides,
  addedNodes as fileAddedNodes,
  deletedIds as fileDeletedIds,
  addedEdges as fileAddedEdges,
  deletedEdges as fileDeletedEdges,
} from "./data/overrides.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const svg = document.getElementById("tree");
const backgroundLayer = document.getElementById("background-layer");
const edgesLayer = document.getElementById("edges-layer");
const nodesLayer = document.getElementById("nodes-layer");
const tooltip = document.getElementById("tooltip");

// World size matches the initial viewBox.
const WORLD = { w: 2400, h: 1800 };
const CX = 1200;
const CY = 900;

// ---------- Editor state ----------
//
// The committed source of truth is `data/overrides.js`. localStorage is
// used only as a fallback while the local server is unreachable: when a
// PUT fails, the editor writes the in-memory state there with
// `pending: true`. On the next page load, that pending state wins so no
// edit is lost; once a save succeeds, the editor clears localStorage.

const STORAGE_KEY = "matriz-edits";

function fileEditState() {
  return {
    overrides: { ...(fileOverrides ?? {}) },
    added: (fileAddedNodes ?? []).map((s) => ({ ...s })),
    deleted: [...(fileDeletedIds ?? [])],
    addedEdges: (fileAddedEdges ?? []).map((e) => ({ ...e })),
    deletedEdges: (fileDeletedEdges ?? []).map((e) => ({ ...e })),
  };
}

function loadEditState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fileEditState();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.pending) return fileEditState();
    return {
      overrides: parsed.overrides ?? {},
      added: parsed.added ?? [],
      deleted: parsed.deleted ?? [],
      addedEdges: parsed.addedEdges ?? [],
      deletedEdges: parsed.deletedEdges ?? [],
    };
  } catch {
    return fileEditState();
  }
}

function persistPending() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pending: true, ...editState })
    );
  } catch {
    // localStorage may be disabled; nothing else we can do.
  }
}

function clearPending() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const editState = loadEditState();

// ---------- Pipeline: base skills -> layout -> editState -> render ----------

let skills = []; // current visible skill list
let skillById = new Map();

function rebuildSkills() {
  // Start from a fresh deep-ish copy of base skills.
  const base = baseSkills.map((s) => ({ ...s }));
  applyLayout(base);

  // Append added nodes (use stored x/y as-is since they were placed manually).
  const added = editState.added.map((s) => ({ ...s }));
  let combined = [...base, ...added];

  // Drop deleted base nodes.
  const deleted = new Set(editState.deleted);
  combined = combined.filter((s) => !deleted.has(s.id));

  // Apply overrides on top.
  combined = combined.map((s) => ({ ...s, ...(editState.overrides[s.id] ?? {}) }));

  skills = combined;
  skillById = new Map(skills.map((s) => [s.id, s]));
}

// ---------- Domain / color helpers ----------

const DOMAIN_RGB = {
  modeling:   [34, 197, 94],
  technology: [59, 130, 246],
  finance:    [239, 68, 68],
};

const DOMAIN_HEX = {
  modeling:   "#22c55e",
  technology: "#3b82f6",
  finance:    "#ef4444",
};

// Pre-designed zone colors for 50/50 two-domain mixes.
// Raw RGB average gives olive for red+green; these anchors look correct.
const ZONE_RGB = {
  "modeling+technology": [45, 212, 191],   // teal  #2dd4bf
  "technology+finance":  [168, 85, 247],   // purple #a855f7
  "modeling+finance":    [245, 158, 11],   // amber  #f59e0b
};

/** Returns the effective domains object for a skill. */
function getEffectiveDomains(skill) {
  if (skill.domains) return skill.domains;
  if (skill.branch === "modeling")   return { modeling: 1 };
  if (skill.branch === "technology") return { technology: 1 };
  if (skill.branch === "finance")    return { finance: 1 };
  return { modeling: 0.34, technology: 0.33, finance: 0.33 };
}

/** Returns a CSS rgb() color for a domains object. */
function getMixedColor(domains) {
  const keys = Object.keys(domains).sort();
  const total = Object.values(domains).reduce((s, v) => s + v, 0);

  if (keys.length === 1) {
    const [r, g, b] = DOMAIN_RGB[keys[0]] ?? [128, 128, 128];
    return `rgb(${r},${g},${b})`;
  }

  if (keys.length === 2) {
    const zoneKey = keys.join("+");
    const zone = ZONE_RGB[zoneKey];
    if (zone) {
      // Interpolate: at 50/50 use zone color; skewed → lean toward dominant domain.
      const w0 = domains[keys[0]] / total;
      const w1 = domains[keys[1]] / total;
      const balance = 1 - Math.abs(w0 - w1) * 2; // 1 at 50/50, 0 at extremes
      const domKey = w0 >= w1 ? keys[0] : keys[1];
      const dom = DOMAIN_RGB[domKey] ?? [128, 128, 128];
      const r = Math.round(zone[0] * balance + dom[0] * (1 - balance));
      const g = Math.round(zone[1] * balance + dom[1] * (1 - balance));
      const b = Math.round(zone[2] * balance + dom[2] * (1 - balance));
      return `rgb(${r},${g},${b})`;
    }
  }

  // Three-domain or fallback: weighted average
  let r = 0, g = 0, b = 0;
  for (const [domain, weight] of Object.entries(domains)) {
    const [dr, dg, db] = DOMAIN_RGB[domain] ?? [128, 128, 128];
    r += dr * (weight / total);
    g += dg * (weight / total);
    b += db * (weight / total);
  }
  // Near-equal weights → push toward white (Quant apex)
  const weights = Object.values(domains);
  const maxDiff = Math.max(...weights) - Math.min(...weights);
  if (maxDiff < 0.12) return "#e2e8f0";
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Draws a colored arc ring outside a circle to show domain percentages. */
function drawDomainRing(g, cx, cy, radius, domains) {
  const total = Object.values(domains).reduce((s, v) => s + v, 0);
  const ringR = radius + 6;
  const GAP_DEG = 4;
  const entries = Object.entries(domains).filter(([, w]) => w / total > 0.02);
  const useGap = entries.length > 1;

  let angleDeg = -90; // start at top
  for (const [domain, weight] of entries) {
    const sweep = (weight / total) * 360;
    const arcSweep = useGap ? sweep - GAP_DEG : sweep;
    if (arcSweep <= 0) continue;

    const startRad = (angleDeg * Math.PI) / 180;
    const endRad   = ((angleDeg + arcSweep) * Math.PI) / 180;
    const x1 = cx + ringR * Math.cos(startRad);
    const y1 = cy + ringR * Math.sin(startRad);
    const x2 = cx + ringR * Math.cos(endRad);
    const y2 = cy + ringR * Math.sin(endRad);
    const largeArc = arcSweep > 180 ? 1 : 0;

    const path = arcSweep >= 359
      ? `M ${cx - ringR} ${cy} A ${ringR} ${ringR} 0 1 1 ${cx - ringR + 0.001} ${cy}`
      : `M ${x1} ${y1} A ${ringR} ${ringR} 0 ${largeArc} 1 ${x2} ${y2}`;

    el("path", {
      d: path,
      class: "domain-ring",
      stroke: DOMAIN_HEX[domain] ?? "#fff",
      fill: "none",
    }, g);

    angleDeg += sweep;
  }
}

// ---------- SVG helpers ----------

function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function getRadius(kind) {
  switch (kind) {
    case "root":
      return 32;
    case "hub":
      return 18;
    case "detail":
      return 10;
    case "cross":
      return 22;
    case "apex":
      return 36;
    default:
      return 12;
  }
}

function getLabelOffset(kind) {
  switch (kind) {
    case "root":
      return 56;
    case "hub":
      return 36;
    case "detail":
      return 24;
    case "cross":
      return 42;
    case "apex":
      return 60;
    default:
      return 28;
  }
}

// ---------- Edge resolution ----------

function effectiveParentsOf(childId) {
  const base = parentsOf(childId);
  const added = (editState.addedEdges ?? [])
    .filter((e) => e.to === childId)
    .map((e) => e.from);
  const deletedSet = new Set(
    (editState.deletedEdges ?? [])
      .filter((e) => e.to === childId)
      .map((e) => e.from)
  );
  return [...new Set([...base, ...added])].filter(
    (id) => !deletedSet.has(id)
  );
}

// ---------- Render ----------

function angleOf(x, y) {
  return (Math.atan2(CY - y, x - CX) * 180) / Math.PI;
}

function arcPoint(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CX + r * Math.cos(rad),
    y: CY - r * Math.sin(rad),
  };
}

/** Root→hub: arc on the outer ring so spokes do not cross sibling hubs. */
function appendRootHubEdge(parent, child) {
  const a0 = angleOf(parent.x, parent.y);
  const a1 = angleOf(child.x, child.y);
  let delta = a1 - a0;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  const mid = arcPoint(getRadius("root"), a0 + delta / 2);
  const endArc = arcPoint(getRadius("root"), a1);
  const d = `M ${parent.x} ${parent.y} Q ${mid.x} ${mid.y} ${endArc.x} ${endArc.y} L ${child.x} ${child.y}`;
  const g = el("g", {
    class: "edge-group",
    "data-from": parent.id,
    "data-to": child.id,
  }, edgesLayer);
  el("path", { d, class: "edge-outer", fill: "none" }, g);
  el("path", { d, class: "edge-inner", fill: "none" }, g);
}

function drawEdges() {
  for (const skill of skills) {
    for (const prereqId of effectiveParentsOf(skill.id)) {
      const parent = skillById.get(prereqId);
      if (!parent) continue;

      if (parent.kind === "root" && skill.kind === "hub") {
        appendRootHubEdge(parent, skill);
        continue;
      }

      const g = el("g", {
        class: "edge-group",
        "data-from": parent.id,
        "data-to": skill.id,
      }, edgesLayer);
      const coords = { x1: parent.x, y1: parent.y, x2: skill.x, y2: skill.y };
      el("line", { ...coords, class: "edge-outer" }, g);
      el("line", { ...coords, class: "edge-inner" }, g);
    }
  }
}

function drawNodes() {
  for (const skill of skills) {
    const domains = getEffectiveDomains(skill);
    const isMixed = Object.keys(domains).length > 1;

    const g = el(
      "g",
      {
        class: `node kind-${skill.kind} branch-${skill.branch}`,
        "data-id": skill.id,
      },
      nodesLayer
    );

    const r = getRadius(skill.kind);
    const circle = el("circle", { cx: skill.x, cy: skill.y, r }, g);

    if (isMixed) {
      const color = getMixedColor(domains);
      g.style.color = color;
      circle.style.fill = color;
      circle.style.stroke = color;
      drawDomainRing(g, skill.x, skill.y, r, domains);
    }

    const text = el(
      "text",
      {
        x: skill.x,
        y: skill.y + getLabelOffset(skill.kind),
      },
      g
    );
    text.textContent = skill.label;
  }
}

function clearLayers() {
  while (backgroundLayer.firstChild) backgroundLayer.removeChild(backgroundLayer.firstChild);
  while (edgesLayer.firstChild) edgesLayer.removeChild(edgesLayer.firstChild);
  while (nodesLayer.firstChild) nodesLayer.removeChild(nodesLayer.firstChild);
}

// Career-level rings drawn behind everything else. Outermost = Junior
// (broadest, entry-level coverage); innermost is intentionally unnamed
// — the peak that goes beyond formal titles.
const CAREER_RINGS = [
  { id: "junior",  label: "Junior",  r: 980, color: "#b87333" }, // bronze
  { id: "pleno",   label: "Pleno",   r: 720, color: "#94a3b8" }, // silver
  { id: "senior",  label: "Senior",  r: 440, color: "#facc15" }, // gold
  { id: "master",  label: "?",       r: 180, color: "#a78bfa" }, // mystery violet
];

function drawBackground() {
  for (const ring of CAREER_RINGS) {
    el("circle", {
      cx: CX,
      cy: CY,
      r: ring.r,
      class: `career-ring career-ring--${ring.id}`,
      stroke: ring.color,
    }, backgroundLayer);

    const t = el("text", {
      x: CX,
      y: CY - ring.r + 22,
      class: "career-label",
      fill: ring.color,
    }, backgroundLayer);
    t.textContent = ring.label;
  }
}

function redraw() {
  rebuildSkills();
  clearLayers();
  drawBackground();
  drawEdges();
  drawNodes();
}

// ---------- Tooltip ----------

const BRANCH_LABELS = {
  modeling: "Modeling",
  technology: "Technology",
  finance: "Finance",
  cross: "Hybrid",
};

const DOMAIN_LABELS = {
  modeling:   "Modeling",
  technology: "Technology",
  finance:    "Finance",
};

const KIND_LABELS = {
  root: "Branch root",
  hub: "Hub",
  detail: "Skill",
  cross: "Cross-branch",
  apex: "Apex",
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showTooltip(skill, event) {
  const branchLabel = BRANCH_LABELS[skill.branch] || skill.branch;
  const kindLabel = KIND_LABELS[skill.kind] || skill.kind;
  const domains = getEffectiveDomains(skill);
  const isMixed = Object.keys(domains).length > 1;

  let domainsHtml = "";
  if (isMixed) {
    const total = Object.values(domains).reduce((s, v) => s + v, 0);
    const bars = Object.entries(domains)
      .sort(([, a], [, b]) => b - a)
      .map(([d, w]) => {
        const pct = Math.round((w / total) * 100);
        const color = DOMAIN_HEX[d] ?? "#fff";
        return `<span class="tooltip__domain-bar" style="--domain-color:${color};--domain-pct:${pct}%">`
          + `<span class="tooltip__domain-swatch" style="background:${color}"></span>`
          + `${escapeHtml(DOMAIN_LABELS[d] ?? d)} ${pct}%`
          + `</span>`;
      })
      .join("");
    domainsHtml = `<div class="tooltip__domains">${bars}</div>`;
  }

  tooltip.innerHTML = `
    <div class="tooltip__title">${escapeHtml(skill.label)}</div>
    <div class="tooltip__badges">
      <span class="tooltip__badge branch-${skill.branch}">${escapeHtml(branchLabel)}</span>
      <span class="tooltip__badge tooltip__badge--kind kind-${skill.kind}">${escapeHtml(kindLabel)}</span>
    </div>
    ${domainsHtml}
    <p class="tooltip__desc">${escapeHtml(skill.desc ?? "")}</p>
  `;
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  positionTooltip(event);
}

function hideTooltip() {
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
}

function positionTooltip(event) {
  const offset = 14;
  const rect = tooltip.getBoundingClientRect();
  let x = event.clientX + offset;
  let y = event.clientY + offset;
  if (x + rect.width > window.innerWidth - 8) {
    x = event.clientX - rect.width - offset;
  }
  if (y + rect.height > window.innerHeight - 8) {
    y = event.clientY - rect.height - offset;
  }
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

// ---------- Hover interaction ----------

function highlightConnections(skill, on) {
  const edges = edgesLayer.querySelectorAll(
    `[data-from="${skill.id}"], [data-to="${skill.id}"]`
  );
  edges.forEach((edge) => edge.classList.toggle("is-active", on));
}

function attachHover() {
  svg.addEventListener("mouseover", (event) => {
    if (document.body.classList.contains("is-editing")) return;
    const node = event.target.closest(".node");
    if (!node) return;
    const id = node.getAttribute("data-id");
    const skill = skillById.get(id);
    if (!skill) return;
    highlightConnections(skill, true);
    showTooltip(skill, event);
  });

  svg.addEventListener("mousemove", (event) => {
    if (document.body.classList.contains("is-editing")) return;
    if (tooltip.classList.contains("is-visible")) {
      positionTooltip(event);
    }
  });

  svg.addEventListener("mouseout", (event) => {
    const node = event.target.closest(".node");
    if (!node) return;
    const id = node.getAttribute("data-id");
    const skill = skillById.get(id);
    if (skill) highlightConnections(skill, false);
    hideTooltip();
  });
}

// ---------- Pan & zoom (via viewBox) ----------

const view = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
let panning = false;
let panStart = null;
let viewStart = null;

function applyView() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}

function clientToWorld(clientX, clientY) {
  // Use the CTM of a content-layer element so the viewBox transform (pan/zoom)
  // and preserveAspectRatio letterboxing are both correctly accounted for.
  const ctm = edgesLayer.getScreenCTM();
  if (ctm) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const { x, y } = pt.matrixTransform(ctm.inverse());
    return { x, y };
  }
  // Fallback: coarse approximation when CTM is unavailable.
  const rect = svg.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  return { x: view.x + px * view.w, y: view.y + py * view.h };
}

function viewportCenterWorld() {
  return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
}

function attachPanZoom() {
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
      const scale = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, (view.w * factor) / WORLD.w)
      );
      const newW = WORLD.w * scale;
      const newH = WORLD.h * scale;

      const before = clientToWorld(event.clientX, event.clientY);
      const rect = svg.getBoundingClientRect();
      view.x = before.x - ((event.clientX - rect.left) / rect.width) * newW;
      view.y = before.y - ((event.clientY - rect.top) / rect.height) * newH;
      view.w = newW;
      view.h = newH;
      applyView();
    },
    { passive: false }
  );

  svg.addEventListener("mousedown", (event) => {
    if (event.target.closest(".node")) return;
    if (event.button !== 0) return;
    // The editor may consume empty-area clicks for "create node" flows;
    // it sets data-suppress-pan on the body in that case.
    if (document.body.dataset.suppressPan === "1") return;
    panning = true;
    panStart = { x: event.clientX, y: event.clientY };
    viewStart = { ...view };
    svg.classList.add("is-panning");
    hideTooltip();
  });

  window.addEventListener("mousemove", (event) => {
    if (!panning) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((event.clientX - panStart.x) * viewStart.w) / rect.width;
    const dy = ((event.clientY - panStart.y) * viewStart.h) / rect.height;
    view.x = viewStart.x - dx;
    view.y = viewStart.y - dy;
    applyView();
  });

  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    svg.classList.remove("is-panning");
  });

  svg.addEventListener("dblclick", () => {
    view.x = 0;
    view.y = 0;
    view.w = WORLD.w;
    view.h = WORLD.h;
    applyView();
  });
}

// ---------- Boot ----------

redraw();
attachHover();
attachPanZoom();
applyView();

// ---------- Public API for the editor ----------

window.tree = {
  // State accessors
  getSkills: () => skills,
  getSkillById: (id) => skillById.get(id),
  getEditState: () => editState,
  getBaseSkills: () => baseSkills,

  // Mutations (caller is responsible for calling redraw / scheduleSave)
  setOverride(id, patch) {
    const existing = editState.overrides[id] ?? {};
    editState.overrides[id] = { ...existing, ...patch };
  },
  clearOverride(id) {
    delete editState.overrides[id];
  },
  addNode(node) {
    const idx = editState.added.findIndex((s) => s.id === node.id);
    if (idx >= 0) editState.added[idx] = node;
    else editState.added.push(node);
  },
  removeAdded(id) {
    editState.added = editState.added.filter((s) => s.id !== id);
  },
  isAdded(id) {
    return editState.added.some((s) => s.id === id);
  },
  markDeleted(id) {
    if (!editState.deleted.includes(id)) editState.deleted.push(id);
  },
  unmarkDeleted(id) {
    editState.deleted = editState.deleted.filter((d) => d !== id);
  },

  // Edge mutations
  hasEdge(from, to) {
    return effectiveParentsOf(to).includes(from);
  },
  addEdge(from, to) {
    const ae = editState.addedEdges ?? (editState.addedEdges = []);
    const de = editState.deletedEdges ?? (editState.deletedEdges = []);
    // Remove from deletedEdges if previously deleted.
    editState.deletedEdges = de.filter(
      (e) => !(e.from === from && e.to === to)
    );
    // Only add if not already present in effective set.
    if (!effectiveParentsOf(to).includes(from)) {
      ae.push({ from, to });
    }
  },
  removeEdge(from, to) {
    const ae = editState.addedEdges ?? (editState.addedEdges = []);
    const de = editState.deletedEdges ?? (editState.deletedEdges = []);
    const isBase = parentsOf(to).includes(from);
    // Remove from addedEdges if it was a custom addition.
    editState.addedEdges = ae.filter(
      (e) => !(e.from === from && e.to === to)
    );
    // Tombstone base edges so they stay removed after reload.
    if (isBase && !de.some((e) => e.from === from && e.to === to)) {
      de.push({ from, to });
    }
  },

  // Pending-state persistence (used by the editor on save success/failure)
  persistPending,
  clearPending,

  // Drawing
  redraw,

  // Geometry
  clientToWorld,
  viewportCenterWorld,
  getRadius,
  getLabelOffset,

  // Decorations (used by editor to keep domain rings in sync while dragging)
  getEffectiveDomains,
  drawDomainRing,

  // Layers (so the editor can patch in place during drag)
  edgesLayer,
  nodesLayer,
  svg,

  // Constants
  BRANCH_LABELS,
  KIND_LABELS,
};

window.dispatchEvent(new CustomEvent("tree:ready"));
