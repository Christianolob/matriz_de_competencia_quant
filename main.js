import { skills } from "./data/skills.js";
import { applyLayout } from "./data/layout.js";
import { parentsOf } from "./data/relationships.js";

applyLayout(skills);

const SVG_NS = "http://www.w3.org/2000/svg";

const svg = document.getElementById("tree");
const edgesLayer = document.getElementById("edges-layer");
const nodesLayer = document.getElementById("nodes-layer");
const tooltip = document.getElementById("tooltip");

const skillById = new Map(skills.map((s) => [s.id, s]));

// World size matches the initial viewBox.
const WORLD = { w: 2400, h: 1800 };
const CX = 1200;
const CY = 900;

/**
 * Create an SVG element with the given attributes.
 */
function el(name, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

// ---------- Sizing per kind ----------

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
function appendRootHubEdge(parent, child, classes) {
  const a0 = angleOf(parent.x, parent.y);
  const a1 = angleOf(child.x, child.y);
  let delta = a1 - a0;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  const mid = arcPoint(getRadius("root"), a0 + delta / 2);
  const endArc = arcPoint(getRadius("root"), a1);
  const d = `M ${parent.x} ${parent.y} Q ${mid.x} ${mid.y} ${endArc.x} ${endArc.y} L ${child.x} ${child.y}`;
  el(
    "path",
    {
      d,
      class: classes.join(" "),
      "data-from": parent.id,
      "data-to": child.id,
      fill: "none",
    },
    edgesLayer
  );
}

function drawEdges() {
  for (const skill of skills) {
    for (const prereqId of parentsOf(skill.id)) {
      const parent = skillById.get(prereqId);
      if (!parent) continue;
      const isCross = parent.branch !== skill.branch;
      const classes = ["edge", `branch-${parent.branch}`];
      if (isCross) classes.push("cross");

      if (parent.kind === "root" && skill.kind === "hub") {
        appendRootHubEdge(parent, skill, classes);
        continue;
      }

      el(
        "line",
        {
          x1: parent.x,
          y1: parent.y,
          x2: skill.x,
          y2: skill.y,
          class: classes.join(" "),
          "data-from": parent.id,
          "data-to": skill.id,
        },
        edgesLayer
      );
    }
  }
}

function drawNodes() {
  for (const skill of skills) {
    const g = el(
      "g",
      {
        class: `node kind-${skill.kind} branch-${skill.branch}`,
        "data-id": skill.id,
      },
      nodesLayer
    );

    el(
      "circle",
      {
        cx: skill.x,
        cy: skill.y,
        r: getRadius(skill.kind),
      },
      g
    );

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

// ---------- Tooltip ----------

const BRANCH_LABELS = {
  modeling: "Modeling",
  technology: "Technology",
  finance: "Finance",
  cross: "Hybrid",
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
  tooltip.innerHTML = `
    <div class="tooltip__title">${escapeHtml(skill.label)}</div>
    <div class="tooltip__badges">
      <span class="tooltip__badge branch-${skill.branch}">${escapeHtml(branchLabel)}</span>
      <span class="tooltip__badge tooltip__badge--kind kind-${skill.kind}">${escapeHtml(kindLabel)}</span>
    </div>
    <p class="tooltip__desc">${escapeHtml(skill.desc)}</p>
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
    const node = event.target.closest(".node");
    if (!node) return;
    const id = node.getAttribute("data-id");
    const skill = skillById.get(id);
    if (!skill) return;
    highlightConnections(skill, true);
    showTooltip(skill, event);
  });

  svg.addEventListener("mousemove", (event) => {
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
const ZOOM_MIN = 0.35; // smaller w/h means zoomed in; this clamps how zoomed-in
const ZOOM_MAX = 2.5; // larger w/h means zoomed out
let panning = false;
let panStart = null;
let viewStart = null;

function applyView() {
  svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}

function clientToWorld(clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  return { x: view.x + px * view.w, y: view.y + py * view.h };
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

      // Keep the world point under the cursor stationary.
      const before = clientToWorld(event.clientX, event.clientY);
      view.x = before.x - ((event.clientX - svg.getBoundingClientRect().left) / svg.getBoundingClientRect().width) * newW;
      view.y = before.y - ((event.clientY - svg.getBoundingClientRect().top) / svg.getBoundingClientRect().height) * newH;
      view.w = newW;
      view.h = newH;
      applyView();
    },
    { passive: false }
  );

  svg.addEventListener("mousedown", (event) => {
    if (event.target.closest(".node")) return;
    if (event.button !== 0) return;
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

drawEdges();
drawNodes();
attachHover();
attachPanZoom();
applyView();
