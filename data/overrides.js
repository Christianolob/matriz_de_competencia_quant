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
  "acc-corp": { x: 1732, y: 1049 },
  "acc-tax": { x: 1652, y: 1044 },
  "cloud-compute": { x: 511, y: 855 },
  "cloud-ml": { x: 835, y: 774 },
  "cloud-storage": { x: 619, y: 833 },
  "data-streaming": { x: 1064, y: 1202 },
  "ds-deep-learning": { x: 440, y: 690 },
  "ds-eda": { x: 451, y: 544 },
  "ds-feature-eng": { x: 435, y: 622 },
  "ds-mlops": { x: 468, y: 752 },
  "ds-stats-learning": { x: 557, y: 396 },
  "ds-supervised": { x: 457, y: 427 },
  "ds-unsupervised": { x: 569, y: 780 },
  "econ-econometrics": { x: 1657, y: 930 },
  "econ-macro": { x: 1754, y: 866 },
  "econ-micro": { x: 1708, y: 921 },
  "econ-monetary": { x: 1642, y: 846 },
  "factor-carry": { x: 1475, y: 629 },
  "factor-low-vol": { x: 1725, y: 549 },
  "factor-momentum": { x: 1417, y: 1001 },
  "factor-quality": { x: 1483, y: 1013 },
  "factor-size": { x: 1569, y: 1028 },
  "factor-value": { x: 1353, y: 981 },
  "fin-alt": { x: 2086, y: 1143 },
  "fin-root": { x: 3363, y: 2413 },
  "markets-derivatives": { x: 1420, y: 1304 },
  "markets-microstructure": { x: 1270, y: 1160 },
  "math-real-analysis": { x: 1562, y: 354 },
  "mod-pure-math": { x: 1200, y: 105 },
  "mod-root": { x: 1236, y: -1694 },
  "opt-mip": { x: 870, y: 639 },
  "opt-numerical": { x: 915, y: 663 },
  "opt-stochastic": { x: 843, y: 587 },
  "qf-portfolio": { x: 1661, y: 749 },
  "stats-regression": { x: 1171, y: 603 },
  "tec-root": { x: -1248, y: 2026 },
};

export const addedNodes = [
];

export const deletedIds = [
  "backend-langs",
];

export const addedEdges = [
  { from: "backend-db-nosql", to: "backend-microservices" },
  { from: "cross-pricing", to: "qf-factor-models" },
  { from: "cross-pricing", to: "qf-fin-econ" },
  { from: "cross-pricing", to: "qf-portfolio" },
  { from: "cross-pricing", to: "qf-risk-models" },
  { from: "cross-trading", to: "ft-algo-trading" },
  { from: "cross-trading", to: "ft-backtesting" },
  { from: "cross-trading", to: "ft-execution" },
  { from: "ds-hub", to: "cross-ml" },
  { from: "ds-hub", to: "ds-deep-learning" },
  { from: "ds-hub", to: "ds-eda" },
  { from: "ds-hub", to: "ds-feature-eng" },
  { from: "ds-hub", to: "ds-mlops" },
  { from: "ds-hub", to: "ds-stats-learning" },
  { from: "ds-hub", to: "ds-supervised" },
  { from: "ds-hub", to: "ds-unsupervised" },
  { from: "fin-acc", to: "acc-audit" },
  { from: "fin-acc", to: "acc-dcf" },
  { from: "fin-acc", to: "acc-ifrs" },
  { from: "fin-acc", to: "acc-ratios" },
  { from: "fin-econ", to: "qf-portfolio" },
  { from: "math-real-analysis", to: "stats-bayesian" },
  { from: "math-real-analysis", to: "stats-timeseries" },
  { from: "qf-factor-models", to: "factor-carry" },
  { from: "qf-factor-models", to: "factor-low-vol" },
  { from: "qf-factor-models", to: "factor-momentum" },
  { from: "qf-factor-models", to: "factor-quality" },
  { from: "qf-factor-models", to: "factor-size" },
  { from: "qf-factor-models", to: "factor-value" },
  { from: "qf-factor-models", to: "math-abstract-algebra" },
  { from: "stoc-poisson", to: "opt-numerical" },
];

export const deletedEdges = [
  { from: "fin-root", to: "fin-markets" },
  { from: "markets-derivatives", to: "cross-pricing" },
  { from: "tec-root", to: "tec-cloud" },
];
