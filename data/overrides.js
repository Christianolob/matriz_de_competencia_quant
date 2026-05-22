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
};

export const addedNodes = [
  {
    id: "custom-modeling-1",
    label: "New skill",
    branch: "modeling",
    kind: "detail",
    x: 900,
    y: 670,
    desc: "",
  },
];

export const deletedIds = [
];
