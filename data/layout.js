/**
 * Circular (radial) planar layout.
 * Each branch occupies an angular wedge; trees grow inward toward the center.
 * Cross nodes sit on wedge boundaries; apex at the center.
 */

import { parentsOf } from "./relationships.js";

const CX = 1200;
const CY = 900;

const R = {
  root: 860,
  step: 65,
  minLocal: 210,
  cross: 110,
  apex: 0,
};

const CROSS_ANCHORS = {
  "cross-ml": {
    angle: 150,
    parents: ["stats-regression", "cloud-ml"],
  },
  "cross-pricing": {
    angle: 30,
    parents: ["markets-derivatives"],
  },
  "cross-trading": {
    angle: 270,
    parents: ["data-streaming", "markets-microstructure"],
  },
};

const BRANCH_WEDGES = {
  modeling: { start: 38, end: 142, rootAngle: 90 },
  technology: { start: 158, end: 262, rootAngle: 210 },
  finance: { start: 278, end: 382, rootAngle: 330 },
};

const CHILD_ORDER = {
  "mod-root": ["mod-pure-math"],
  "mod-pure-math": [
    "math-real-analysis",
    "mod-stats",
  ],
  "math-real-analysis": [
    "math-linalg",
  ],
  "math-linalg": [
    "math-topology",
  ],
  "math-topology": [
    "math-abstract-algebra",
  ],
  "mod-stats": [
    "stats-frequentist",
    "stats-bayesian",
    "stats-regression",
  ],
  "stats-regression": [
    "stats-timeseries",
    "mod-stoc",
  ],
  "mod-stoc": [
    "stoc-brownian",
    "stoc-ito",
  ],
  "stoc-ito": [
    "stoc-sde",
  ],
  "stoc-sde": [
    "stoc-poisson",
    "mod-opt",
  ],
  "mod-opt": [
    "opt-convex",
    "opt-stochastic",
  ],
  "opt-stochastic": [
    "opt-mip",
  ],
  "opt-mip": [
    "opt-numerical",
  ],
  "tec-root": ["tec-cloud"],
  "tec-cloud": [
    "cloud-compute",
    "tec-backend",
  ],
  "cloud-compute": [
    "cloud-storage",
  ],
  "cloud-storage": [
    "cloud-ml",
  ],
  "tec-backend": [
    "backend-apis",
    "backend-db-sql",
  ],
  "backend-db-sql": [
    "backend-db-nosql",
  ],
  "backend-db-nosql": [
    "backend-langs",
  ],
  "backend-langs": [
    "backend-microservices",
    "tec-frontend",
  ],
  "tec-frontend": [
    "frontend-react",
    "frontend-state",
  ],
  "frontend-state": [
    "frontend-css",
  ],
  "frontend-css": [
    "frontend-build",
    "tec-devops",
  ],
  "tec-devops": [
    "devops-ci",
    "devops-iac",
  ],
  "devops-iac": [
    "devops-monitor",
    "tec-data",
  ],
  "tec-data": [
    "data-pipelines",
    "data-warehouse",
  ],
  "data-warehouse": [
    "data-streaming",
  ],
  "fin-root": ["fin-markets"],
  "fin-markets": [
    "markets-equity",
    "fin-alt",
  ],
  "markets-equity": [
    "markets-fixed-income",
  ],
  "markets-fixed-income": [
    "markets-fx",
  ],
  "markets-fx": [
    "markets-derivatives",
  ],
  "markets-derivatives": [
    "markets-microstructure",
  ],
  "fin-alt": [
    "alt-hedge",
    "alt-pe",
  ],
  "alt-pe": [
    "alt-real-estate",
    "fin-acc",
  ],
  "fin-acc": [
    "acc-statements",
    "acc-corp",
  ],
  "acc-corp": [
    "acc-tax",
    "fin-econ",
  ],
  "fin-econ": [
    "econ-macro",
    "econ-micro",
  ],
  "econ-micro": [
    "econ-econometrics",
  ],
  "econ-econometrics": [
    "econ-monetary",
  ],
};

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: Math.round(CX + r * Math.cos(rad)),
    y: Math.round(CY - r * Math.sin(rad)),
  };
}

function normAngle(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

function wedgeSpan(start, end) {
  if (end >= start) return end - start;
  return 360 - start + end;
}

function lerpAngle(start, end, t) {
  const span = wedgeSpan(start, end);
  return normAngle(start + t * span);
}

function buildGraph(skills) {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const children = new Map();
  for (const s of skills) children.set(s.id, []);
  for (const s of skills) {
    for (const p of parentsOf(s.id)) {
      children.get(p).push(s.id);
    }
  }
  return { byId, children };
}

function countLeaves(id, children) {
  const kids = children.get(id) || [];
  if (!kids.length) return 1;
  return kids.reduce((sum, c) => sum + countLeaves(c, children), 0);
}

function boundaryAngleForNode(id) {
  for (const cfg of Object.values(CROSS_ANCHORS)) {
    if (cfg.parents.includes(id)) return cfg.angle;
  }
  return null;
}

function orderChildren(parentId, childIds) {
  const order = CHILD_ORDER[parentId];
  if (!order) return childIds;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...childIds].sort(
    (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999)
  );
}

function radiusForKind(kind, depth = 1) {
  if (kind === "root") return R.root;
  if (kind === "cross") return R.cross;
  if (kind === "apex") return R.apex;
  return Math.max(R.minLocal, R.root - depth * R.step);
}

function layoutSubtree(
  id,
  angleStart,
  angleEnd,
  byId,
  children,
  positions,
  wedgeStart,
  wedgeEnd,
  depth = 1
) {
  const node = byId.get(id);
  const ba = boundaryAngleForNode(id);
  const r = radiusForKind(node.kind, depth);

  const angle = ba !== null ? ba : lerpAngle(angleStart, angleEnd, 0.5);
  positions.set(id, polar(r, angle));

  const kids = orderChildren(id, children.get(id) || []);
  if (!kids.length) return;

  const totalLeaves = kids.reduce(
    (sum, cid) => sum + countLeaves(cid, children),
    0
  );
  let t = 0;
  const span = wedgeSpan(angleStart, angleEnd);
  for (const cid of kids) {
    const leaves = countLeaves(cid, children);
    const childSpan = (span * leaves) / totalLeaves;
    const childStart = lerpAngle(angleStart, angleEnd, t / span);
    const childEnd = lerpAngle(
      angleStart,
      angleEnd,
      (t + childSpan) / span
    );
    layoutSubtree(
      cid,
      childStart,
      childEnd,
      byId,
      children,
      positions,
      wedgeStart,
      wedgeEnd,
      depth + 1
    );
    t += childSpan;
  }
}

export function applyLayout(skills) {
  const { byId, children } = buildGraph(skills);
  const positions = new Map();

  for (const [branch, wedge] of Object.entries(BRANCH_WEDGES)) {
    const root = skills.find((s) => s.branch === branch && s.kind === "root");
    if (!root) continue;
    positions.set(root.id, polar(R.root, wedge.rootAngle));

    const hubs = orderChildren(root.id, children.get(root.id) || []);
    const totalLeaves = hubs.reduce(
      (sum, h) => sum + countLeaves(h, children),
      0
    );
    let t = 0;
    const span = wedgeSpan(wedge.start, wedge.end);
    for (const hubId of hubs) {
      const leaves = countLeaves(hubId, children);
      const hubSpan = (span * leaves) / totalLeaves;
      const a0 = lerpAngle(wedge.start, wedge.end, t / span);
      const a1 = lerpAngle(wedge.start, wedge.end, (t + hubSpan) / span);
      layoutSubtree(
        hubId,
        a0,
        a1,
        byId,
        children,
        positions,
        wedge.start,
        wedge.end
      );
      t += hubSpan;
    }
  }

  for (const [crossId, cfg] of Object.entries(CROSS_ANCHORS)) {
    positions.set(crossId, polar(R.cross, cfg.angle));
    for (const pid of cfg.parents) {
      const p = byId.get(pid);
          if (p) positions.set(pid, polar(R.minLocal, cfg.angle));
    }
  }

  const apex = skills.find((s) => s.kind === "apex");
  if (apex) positions.set(apex.id, polar(R.apex, 0));

  for (const s of skills) {
    const pos = positions.get(s.id);
    if (pos) {
      s.x = pos.x;
      s.y = pos.y;
    }
  }

  return skills;
}
