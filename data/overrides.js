/**
 * Full edit state of the skill tree, persisted to source.
 *
 * Auto-saved by the in-app editor (server.py / run.bat). Five exports
 * cover the complete state:
 *
 *   overrides    -- per base-node diff (subset of x, y, label, branch, kind, desc)
 *   addedNodes   -- full skill objects created with the Add node button
 *   deletedIds   -- ids of base nodes hidden from the render
 *   addedEdges   -- extra edges beyond data/relationships.js  { from, to }
 *   deletedEdges -- base edges removed via the Connect tool    { from, to }
 *
 * Commit this file and any clone reproduces the same tree.
 */

export const overrides = {
  "math-real-analysis": { x: 1562, y: 354 },
  "opt-mip": { x: 801, y: 662 },
  "opt-numerical": { x: 915, y: 663 },
  "opt-stochastic": { x: 843, y: 587 },
};

export const addedNodes = [
  {
    id: "custom-cross-1",
    label: "teste",
    branch: "finance",
    kind: "detail",
    x: 1459,
    y: 829,
    desc: "",
  },
  {
    id: "custom-finance-1",
    label: "teste 2",
    branch: "finance",
    kind: "detail",
    x: 1482,
    y: 885,
    desc: "",
  },
];

export const deletedIds = [
  "backend-langs",
];

export const addedEdges = [
  { from: "backend-db-nosql", to: "backend-microservices" },
  { from: "math-real-analysis", to: "stats-bayesian" },
  { from: "math-real-analysis", to: "stats-timeseries" },
  { from: "stoc-poisson", to: "opt-numerical" },
];

export const deletedEdges = [
];
