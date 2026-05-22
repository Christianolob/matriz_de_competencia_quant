/**
 * Edit mode for the skill tree.
 *
 * Toggle with the "E" key or the toolbar button. While in edit mode:
 *  - Click a node to select it; the side panel shows its metadata.
 *  - Drag a node to move it (writes a position override).
 *  - "Add node" creates a new circle at the viewport center.
 *  - The side panel lets you edit label, branch, kind, description.
 *  - Delete removes the node (added nodes are erased; base nodes are tombstoned).
 *  - Export opens a modal with snippets to paste into data/overrides.js and data/skills.js.
 *  - Reset edits clears localStorage and reloads.
 *
 * Edges (relationships) are not editable from the UI on purpose -- edit
 * data/relationships.js directly in your code editor.
 */

function initEditor() {
  const tree = window.tree;
  if (!tree) return;

  const body = document.body;
  const toolbar = document.getElementById("editor-toolbar");
  const toggleBtn = document.getElementById("editor-toggle");
  const addBtn = document.getElementById("editor-add");
  const exportBtn = document.getElementById("editor-export");
  const resetBtn = document.getElementById("editor-reset");
  const counter = document.getElementById("editor-counter");

  const panel = document.getElementById("editor-panel");
  const panelClose = document.getElementById("editor-panel-close");
  const inputId = document.getElementById("editor-id");
  const inputLabel = document.getElementById("editor-label");
  const inputBranch = document.getElementById("editor-branch");
  const inputKind = document.getElementById("editor-kind");
  const inputDesc = document.getElementById("editor-desc");
  const inputX = document.getElementById("editor-x");
  const inputY = document.getElementById("editor-y");
  const deleteBtn = document.getElementById("editor-delete");
  const revertBtn = document.getElementById("editor-revert");

  const modal = document.getElementById("editor-export-modal");
  const modalClose = document.getElementById("editor-export-close");
  const modalOverridesText = document.getElementById("editor-export-overrides");
  const modalAddedText = document.getElementById("editor-export-added");
  const copyOverridesBtn = document.getElementById("editor-copy-overrides");
  const copyAddedBtn = document.getElementById("editor-copy-added");

  if (!toolbar || !toggleBtn) return; // UI not present, do nothing.

  // ---------- State ----------

  let editing = false;
  let selectedId = null;
  let dragging = null; // { id, started: bool, lastX, lastY }
  let lastBranch = "modeling";
  let suppressNextClick = false;

  // ---------- Helpers ----------

  function isAddedId(id) {
    return tree.isAdded(id);
  }

  function isFromBase(id) {
    return tree.getBaseSkills().some((s) => s.id === id);
  }

  function refreshCounter() {
    const st = tree.getEditState();
    const n =
      Object.keys(st.overrides).length + st.added.length + st.deleted.length;
    counter.textContent = n === 0 ? "no edits" : `${n} edit${n > 1 ? "s" : ""}`;
    counter.classList.toggle("is-dirty", n > 0);
  }

  function setEditing(on) {
    editing = on;
    body.classList.toggle("is-editing", editing);
    toggleBtn.setAttribute("aria-pressed", String(editing));
    toggleBtn.textContent = editing ? "Exit edit" : "Edit";
    addBtn.disabled = !editing;
    if (!editing) {
      clearSelection();
    }
  }

  function clearSelection() {
    if (selectedId) {
      const node = tree.nodesLayer.querySelector(
        `[data-id="${cssEscape(selectedId)}"]`
      );
      if (node) node.classList.remove("is-selected");
    }
    selectedId = null;
    panel.classList.remove("is-open");
  }

  function selectNode(id) {
    if (selectedId === id) return;
    clearSelection();
    selectedId = id;
    const node = tree.nodesLayer.querySelector(
      `[data-id="${cssEscape(id)}"]`
    );
    if (node) node.classList.add("is-selected");
    fillPanel(id);
    panel.classList.add("is-open");
  }

  function fillPanel(id) {
    const skill = tree.getSkillById(id);
    if (!skill) return;
    inputId.value = skill.id;
    inputLabel.value = skill.label ?? "";
    inputBranch.value = skill.branch ?? "modeling";
    inputKind.value = skill.kind ?? "detail";
    inputDesc.value = skill.desc ?? "";
    inputX.value = Math.round(skill.x);
    inputY.value = Math.round(skill.y);
    revertBtn.disabled = !hasOverride(id) && !isAddedId(id);
  }

  function hasOverride(id) {
    return Object.prototype.hasOwnProperty.call(
      tree.getEditState().overrides,
      id
    );
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  // ---------- Drag ----------

  tree.svg.addEventListener("mousedown", (event) => {
    if (!editing) return;
    if (event.button !== 0) return;
    const node = event.target.closest(".node");
    if (!node) return;

    const id = node.getAttribute("data-id");
    event.stopPropagation();
    event.preventDefault();
    body.dataset.suppressPan = "1";

    dragging = { id, started: false, startX: event.clientX, startY: event.clientY };
    selectNode(id);
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (!dragging.started && Math.hypot(dx, dy) < 3) return;
    dragging.started = true;

    const world = tree.clientToWorld(event.clientX, event.clientY);
    moveNodeTo(dragging.id, Math.round(world.x), Math.round(world.y));
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    const id = dragging.id;
    const wasDrag = dragging.started;
    dragging = null;
    delete body.dataset.suppressPan;
    if (wasDrag) suppressNextClick = true;

    if (wasDrag) {
      const skill = tree.getSkillById(id);
      if (skill) {
        if (isAddedId(id)) {
          // Mutate the stored added node directly.
          const st = tree.getEditState();
          const stored = st.added.find((s) => s.id === id);
          if (stored) {
            stored.x = skill.x;
            stored.y = skill.y;
            tree.addNode(stored); // re-saves to localStorage
          }
        } else {
          tree.setOverride(id, { x: skill.x, y: skill.y });
        }
        refreshCounter();
        fillPanel(id);
      }
    }
  });

  function moveNodeTo(id, x, y) {
    const skill = tree.getSkillById(id);
    if (!skill) return;
    skill.x = x;
    skill.y = y;

    // Update node visuals.
    const g = tree.nodesLayer.querySelector(`[data-id="${cssEscape(id)}"]`);
    if (g) {
      const circle = g.querySelector("circle");
      const text = g.querySelector("text");
      if (circle) {
        circle.setAttribute("cx", String(x));
        circle.setAttribute("cy", String(y));
      }
      if (text) {
        text.setAttribute("x", String(x));
        text.setAttribute(
          "y",
          String(y + tree.getLabelOffset(skill.kind))
        );
      }
    }

    // Update connected edges.
    const edges = tree.edgesLayer.querySelectorAll(
      `[data-from="${cssEscape(id)}"], [data-to="${cssEscape(id)}"]`
    );
    edges.forEach((edge) => {
      if (edge.tagName.toLowerCase() === "line") {
        const fromId = edge.getAttribute("data-from");
        const toId = edge.getAttribute("data-to");
        const from = tree.getSkillById(fromId);
        const to = tree.getSkillById(toId);
        if (!from || !to) return;
        edge.setAttribute("x1", String(from.x));
        edge.setAttribute("y1", String(from.y));
        edge.setAttribute("x2", String(to.x));
        edge.setAttribute("y2", String(to.y));
      } else {
        // Path (root->hub arc): easier to redraw the whole tree on next idle,
        // but during drag we just trigger a full redraw which preserves selection.
        scheduleFullRedraw();
      }
    });

    // Live-update inputs in the panel if this node is selected.
    if (selectedId === id) {
      inputX.value = String(x);
      inputY.value = String(y);
    }
  }

  let redrawScheduled = false;
  function scheduleFullRedraw() {
    if (redrawScheduled) return;
    redrawScheduled = true;
    requestAnimationFrame(() => {
      redrawScheduled = false;
      tree.redraw();
      if (selectedId) {
        const node = tree.nodesLayer.querySelector(
          `[data-id="${cssEscape(selectedId)}"]`
        );
        if (node) node.classList.add("is-selected");
      }
    });
  }

  // ---------- Selection on click ----------

  tree.svg.addEventListener("click", (event) => {
    if (!editing) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const node = event.target.closest(".node");
    if (!node) {
      clearSelection();
      return;
    }
    selectNode(node.getAttribute("data-id"));
  });

  // ---------- Toolbar buttons ----------

  toggleBtn.addEventListener("click", () => setEditing(!editing));

  document.addEventListener("keydown", (event) => {
    if (event.key === "e" || event.key === "E") {
      const t = event.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setEditing(!editing);
    }
    if (event.key === "Escape") {
      if (modal.classList.contains("is-open")) {
        modal.classList.remove("is-open");
      } else {
        clearSelection();
      }
    }
  });

  addBtn.addEventListener("click", () => {
    if (!editing) return;
    const center = tree.viewportCenterWorld();
    const branch = lastBranch;
    let n = 1;
    let id;
    do {
      id = `custom-${branch}-${n++}`;
    } while (tree.getSkillById(id));

    const node = {
      id,
      label: "New skill",
      branch,
      kind: "detail",
      x: Math.round(center.x),
      y: Math.round(center.y),
      desc: "",
      prereqs: [],
    };
    tree.addNode(node);
    tree.redraw();
    refreshCounter();
    selectNode(id);
  });

  exportBtn.addEventListener("click", openExportModal);
  modalClose.addEventListener("click", () =>
    modal.classList.remove("is-open")
  );
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("is-open");
  });

  copyOverridesBtn.addEventListener("click", () =>
    copyText(modalOverridesText, copyOverridesBtn)
  );
  copyAddedBtn.addEventListener("click", () =>
    copyText(modalAddedText, copyAddedBtn)
  );

  resetBtn.addEventListener("click", () => {
    if (!confirm("Discard all unsaved edits and reload?")) return;
    tree.resetAll();
    location.reload();
  });

  // ---------- Side panel inputs ----------

  inputLabel.addEventListener("input", () => {
    if (!selectedId) return;
    applyMetadataEdit(selectedId, { label: inputLabel.value });
  });
  inputBranch.addEventListener("change", () => {
    if (!selectedId) return;
    lastBranch = inputBranch.value;
    applyMetadataEdit(selectedId, { branch: inputBranch.value });
  });
  inputKind.addEventListener("change", () => {
    if (!selectedId) return;
    applyMetadataEdit(selectedId, { kind: inputKind.value });
  });
  inputDesc.addEventListener("input", () => {
    if (!selectedId) return;
    applyMetadataEdit(selectedId, { desc: inputDesc.value });
  });

  function applyMetadataEdit(id, patch) {
    if (isAddedId(id)) {
      const st = tree.getEditState();
      const stored = st.added.find((s) => s.id === id);
      if (stored) {
        Object.assign(stored, patch);
        tree.addNode(stored);
      }
    } else {
      tree.setOverride(id, patch);
    }
    tree.redraw();
    if (selectedId) {
      const node = tree.nodesLayer.querySelector(
        `[data-id="${cssEscape(selectedId)}"]`
      );
      if (node) node.classList.add("is-selected");
    }
    refreshCounter();
    fillPanel(id);
  }

  panelClose.addEventListener("click", clearSelection);

  deleteBtn.addEventListener("click", () => {
    if (!selectedId) return;
    if (!confirm(`Delete "${selectedId}"?`)) return;
    if (isAddedId(selectedId)) {
      tree.removeAdded(selectedId);
    } else if (isFromBase(selectedId)) {
      tree.markDeleted(selectedId);
    }
    clearSelection();
    tree.redraw();
    refreshCounter();
  });

  revertBtn.addEventListener("click", () => {
    if (!selectedId) return;
    if (isAddedId(selectedId)) {
      // For added nodes, "revert" means delete entirely.
      tree.removeAdded(selectedId);
      clearSelection();
    } else {
      tree.clearOverride(selectedId);
      tree.unmarkDeleted(selectedId);
    }
    tree.redraw();
    refreshCounter();
    if (selectedId) fillPanel(selectedId);
  });

  // ---------- Export modal ----------

  function openExportModal() {
    modalOverridesText.value = buildOverridesFile();
    modalAddedText.value = buildAddedSnippet();
    modal.classList.add("is-open");
  }

  function buildOverridesFile() {
    const st = tree.getEditState();
    const fileOv = tree.getFileOverrides();
    const merged = { ...fileOv, ...st.overrides };

    const lines = [
      "/**",
      " * Manual position and metadata overrides for the skill tree.",
      " * Generated by the in-app editor; safe to edit by hand.",
      " */",
      "",
      "export const overrides = {",
    ];

    const ids = Object.keys(merged).sort();
    for (const id of ids) {
      const v = merged[id];
      const parts = [];
      if (typeof v.x === "number") parts.push(`x: ${v.x}`);
      if (typeof v.y === "number") parts.push(`y: ${v.y}`);
      if (typeof v.label === "string")
        parts.push(`label: ${JSON.stringify(v.label)}`);
      if (typeof v.branch === "string")
        parts.push(`branch: ${JSON.stringify(v.branch)}`);
      if (typeof v.kind === "string")
        parts.push(`kind: ${JSON.stringify(v.kind)}`);
      if (typeof v.desc === "string")
        parts.push(`desc: ${JSON.stringify(v.desc)}`);
      if (parts.length === 0) continue;
      lines.push(`  ${JSON.stringify(id)}: { ${parts.join(", ")} },`);
    }

    lines.push("};", "");
    return lines.join("\n");
  }

  function buildAddedSnippet() {
    const st = tree.getEditState();
    if (!st.added.length) {
      return "// No new nodes to append.\n";
    }
    const lines = [
      "// Append these objects to the `skills` array in data/skills.js:",
      "",
    ];
    for (const s of st.added) {
      lines.push("{");
      lines.push(`  id: ${JSON.stringify(s.id)},`);
      lines.push(`  label: ${JSON.stringify(s.label ?? "")},`);
      lines.push(`  branch: ${JSON.stringify(s.branch ?? "modeling")},`);
      lines.push(`  kind: ${JSON.stringify(s.kind ?? "detail")},`);
      lines.push(`  x: ${Math.round(s.x ?? 0)},`);
      lines.push(`  y: ${Math.round(s.y ?? 0)},`);
      lines.push(`  desc: ${JSON.stringify(s.desc ?? "")},`);
      lines.push(`  prereqs: [],`);
      lines.push("},");
    }
    if (st.deleted.length) {
      lines.push("");
      lines.push("// Also remove these ids from data/skills.js (or keep");
      lines.push("// the tombstone in data/overrides.js as `deleted`):");
      for (const id of st.deleted) {
        lines.push(`//   ${id}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  function copyText(textarea, button) {
    textarea.select();
    try {
      navigator.clipboard.writeText(textarea.value);
    } catch {
      document.execCommand("copy");
    }
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = original), 1200);
  }

  // ---------- Boot ----------

  setEditing(false);
  refreshCounter();
}

if (window.tree) {
  initEditor();
} else {
  window.addEventListener("tree:ready", initEditor, { once: true });
}
