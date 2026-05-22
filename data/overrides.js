/**
 * Full edit state of the skill tree, persisted to source.
 *
 * Auto-saved by the in-app editor (server.py / run.bat). Three exports
 * cover the complete state:
 *
 *   overrides   -- per base-node diff (subset of x, y, label, branch, kind, desc)
 *   addedNodes  -- full skill objects created with the Add node button
 *   deletedIds  -- ids of base nodes hidden from the render
 *
 * Commit this file and any clone reproduces the same tree.
 */

export const overrides = {
  "opt-mip": { x: 801, y: 662 },
  "opt-numerical": { x: 915, y: 663 },
  "opt-stochastic": { x: 843, y: 587 },
};

export const addedNodes = [
];

export const deletedIds = [
];
