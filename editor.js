/**
 * Edit mode for the skill tree.
 *
 * Toggle with the "E" key or the toolbar button. While in edit mode:
 *  - Click a node to select it; the side panel shows its metadata.
 *  - Drag a node to move it (writes a position override).
 *  - "Add node" creates a new circle at the viewport center.
 *  - The side panel lets you edit label, branch, kind, description.
 *  - Delete removes the node (added nodes are erased; base nodes are tombstoned).
 *  - "Code" toggles a left-side live preview of data/overrides.js with a Copy button.
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
  const codeToggleBtn = document.getElementById("editor-code-toggle");

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

  const codePanel = document.getElementById("editor-code-panel");
  const codePanelClose = document.getElementById("editor-code-close");
  const codeText = document.getElementById("editor-code-text");
  const codeCopyBtn = document.getElementById("editor-code-copy");
  const codeStatus = document.getElementById("editor-code-status");

  if (!toolbar || !toggleBtn) return; // UI not present, do nothing.

  // ---------- State ----------

  let editing = false;
  let selectedId = null;
  let dragging = null;
  let lastBranch = "modeling";
  let suppressNextClick = false;

  // ---------- Helpers ----------

  function isAddedId(id) {
    return tree.isAdded(id);
  }

  function isFromBase(id) {
    return tree.getBaseSkills().some((s) => s.id === id);
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
    const skill = tree.getSkillById(id);
    if (!skill) return;

    event.stopPropagation();
    event.preventDefault();
    body.dataset.suppressPan = "1";

    const world = tree.clientToWorld(event.clientX, event.clientY);
    dragging = {
      id,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: skill.x - world.x,
      offsetY: skill.y - world.y,
    };
    selectNode(id);
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (!dragging.started && Math.hypot(dx, dy) < 3) return;
    dragging.started = true;

    const world = tree.clientToWorld(event.clientX, event.clientY);
    moveNodeTo(
      dragging.id,
      Math.round(world.x + dragging.offsetX),
      Math.round(world.y + dragging.offsetY)
    );
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
          const st = tree.getEditState();
          const stored = st.added.find((s) => s.id === id);
          if (stored) {
            stored.x = skill.x;
            stored.y = skill.y;
            tree.addNode(stored);
          }
        } else {
          tree.setOverride(id, { x: skill.x, y: skill.y });
        }
        fillPanel(id);
        refreshCodePanel();
      }
    }
  });

  function moveNodeTo(id, x, y) {
    const skill = tree.getSkillById(id);
    if (!skill) return;
    skill.x = x;
    skill.y = y;

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
        scheduleFullRedraw();
      }
    });

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
      clearSelection();
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
    selectNode(id);
    refreshCodePanel();
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
    fillPanel(id);
    refreshCodePanel();
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
    refreshCodePanel();
  });

  revertBtn.addEventListener("click", () => {
    if (!selectedId) return;
    if (isAddedId(selectedId)) {
      tree.removeAdded(selectedId);
      clearSelection();
    } else {
      tree.clearOverride(selectedId);
      tree.unmarkDeleted(selectedId);
    }
    tree.redraw();
    if (selectedId) fillPanel(selectedId);
    refreshCodePanel();
  });

  // ---------- Live code panel + auto-save ----------

  let saveTimer = null;
  let saveInFlight = false;
  let pendingAfterFlight = false;

  function refreshCodePanel({ skipAutosave = false } = {}) {
    if (codeText) codeText.value = buildOverridesFile();
    if (!skipAutosave) scheduleSave();
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    setStatus("dirty", "Saving...");
    saveTimer = setTimeout(saveNow, 400);
  }

  async function saveNow() {
    saveTimer = null;
    if (saveInFlight) {
      pendingAfterFlight = true;
      return;
    }
    const body = buildOverridesFile();
    saveInFlight = true;
    setStatus("saving", "Saving...");
    try {
      const res = await fetch("data/overrides.js", {
        method: "PUT",
        headers: { "Content-Type": "application/javascript" },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("saved", `Saved ${formatTime(new Date())}`);
    } catch (err) {
      const hint =
        err && err.message
          ? `Save failed (${err.message}). Run via run.bat to enable saving.`
          : "Save failed. Run via run.bat to enable saving.";
      setStatus("error", hint);
    } finally {
      saveInFlight = false;
      if (pendingAfterFlight) {
        pendingAfterFlight = false;
        scheduleSave();
      }
    }
  }

  function setStatus(kind, text) {
    if (!codeStatus) return;
    codeStatus.dataset.state = kind;
    codeStatus.textContent = text;
  }

  function formatTime(d) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function buildOverridesFile() {
    const st = tree.getEditState();
    const fileOv = tree.getFileOverrides();
    const merged = { ...fileOv, ...st.overrides };

    const lines = [
      "/**",
      " * Manual position and metadata overrides for the skill tree.",
      " * Auto-saved by the in-app editor; safe to edit by hand.",
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

  if (codeToggleBtn) {
    codeToggleBtn.addEventListener("click", () => {
      const willOpen = !codePanel.classList.contains("is-open");
      codePanel.classList.toggle("is-open", willOpen);
      codeToggleBtn.setAttribute("aria-pressed", String(willOpen));
      if (willOpen) refreshCodePanel({ skipAutosave: true });
    });
  }
  if (codePanelClose) {
    codePanelClose.addEventListener("click", () => {
      codePanel.classList.remove("is-open");
      if (codeToggleBtn) codeToggleBtn.setAttribute("aria-pressed", "false");
    });
  }
  if (codeCopyBtn) {
    codeCopyBtn.addEventListener("click", () =>
      copyText(codeText, codeCopyBtn)
    );
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
  refreshCodePanel({ skipAutosave: true });
  setStatus("idle", "Auto-save ready");
}

if (window.tree) {
  initEditor();
} else {
  window.addEventListener("tree:ready", initEditor, { once: true });
}
