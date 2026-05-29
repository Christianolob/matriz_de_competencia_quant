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
  "cloud-compute": { x: 511, y: 855 },
  "cloud-storage": { x: 619, y: 833 },
  "markets-microstructure": { x: 1270, y: 1160 },
  "math-real-analysis": { x: 1562, y: 354 },
  "opt-mip": { x: 801, y: 662 },
  "opt-numerical": { x: 915, y: 663 },
  "opt-stochastic": { x: 843, y: 587 },
};

export const addedNodes = [
];

export const deletedIds = [
  "backend-langs",
];

export const addedEdges = [
  { from: "backend-db-nosql", to: "backend-microservices" },
  { from: "cross-ml", to: "ds-hub" },
  { from: "cross-pricing", to: "qf-factor-models" },
  { from: "cross-pricing", to: "qf-fin-econ" },
  { from: "cross-pricing", to: "qf-portfolio" },
  { from: "cross-pricing", to: "qf-risk-models" },
  { from: "cross-trading", to: "ft-algo-trading" },
  { from: "cross-trading", to: "ft-backtesting" },
  { from: "cross-trading", to: "ft-execution" },
  { from: "ds-hub", to: "ds-deep-learning" },
  { from: "ds-hub", to: "ds-eda" },
  { from: "ds-hub", to: "ds-feature-eng" },
  { from: "ds-hub", to: "ds-mlops" },
  { from: "ds-hub", to: "ds-stats-learning" },
  { from: "ds-hub", to: "ds-supervised" },
  { from: "ds-hub", to: "ds-unsupervised" },
  { from: "fin-econ", to: "qf-portfolio" },
  { from: "math-real-analysis", to: "stats-bayesian" },
  { from: "math-real-analysis", to: "stats-timeseries" },
  { from: "qf-factor-models", to: "math-abstract-algebra" },
  { from: "stoc-poisson", to: "opt-numerical" },
];

export const deletedEdges = [
];
