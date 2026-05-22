/**
 * Full edit state of the skill tree, persisted to source.
 *
 * The in-app editor (toggle with key "E") rewrites this file via the local
 * server (server.py / run.bat) on every edit. Commit the file and any clone
 * of the repo will reproduce the exact same tree.
 *
 * Three exports cover the complete state:
 *
 *   overrides   -- per base-node diff. Any subset of
 *                  { x, y, label, branch, kind, desc } wins over the auto-layout.
 *
 *   addedNodes  -- full skill objects created with the "Add node" button.
 *                  Shape: { id, label, branch, kind, x, y, desc }.
 *
 *   deletedIds  -- ids of base nodes (from data/skills.js) that should be
 *                  hidden from the render.
 */

export const overrides = {};

export const addedNodes = [];

export const deletedIds = [];
