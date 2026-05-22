/**
 * Manual position and metadata overrides for the skill tree.
 *
 * Applied AFTER the auto-layout (data/layout.js) runs, so any field listed here
 * wins over the computed value. The in-app editor (toggle with key "E") writes
 * to this file via the local server (server.py / run.bat) every time you make
 * an edit -- just commit and push afterwards.
 *
 * Each entry can contain any subset of: { x, y, label, branch, kind, desc }.
 * Example:
 *   "math-real-analysis": { x: 740, y: 380 },
 *   "custom-modeling-1": {
 *     x: 900, y: 410,
 *     label: "Bayesian Networks",
 *     branch: "modeling",
 *     kind: "detail",
 *     desc: "Probabilistic graphical models.",
 *   },
 */

export const overrides = {};
