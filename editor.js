/**
 * Edit mode for the skill tree.
 *
 * Toggle with the "E" key or the toolbar button. While in edit mode:
 *  - Click a node to select it; the side panel shows its metadata.
 *  - Drag a node to move it.
 *  - "Add node" creates a new circle at the viewport center.
 *  - The side panel lets you edit label, branch, kind, description.
 *  - Delete removes the node (added nodes are erased; base nodes are tombstoned).
 *  - "Connect" enters connection mode: click source node, then click target to
 *    add or remove an edge. Escape cancels. Clicking background clears selection.
 *
 * Every edit auto-saves to data/overrides.js via the local server (server.py).
 * The full state lives in that file, so committing it reproduces the tree
 * on any clone.
 */

function initEditor() {
  const tree = window.tree;
  if (!tree) return;

  const body = document.body;
  const toolbar = document.getElementById("editor-toolbar");
  const toggleBtn = document.getElementById("editor-toggle");
  const addBtn = document.getElementById("editor-add");
  const connectBtn = document.getElementById("editor-connect");

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

  const errorBanner = document.getElementById("editor-save-error");
  const errorText = errorBanner
    ? errorBanner.querySelector(".editor-save-error__text")
    : null;
  const errorRetry = errorBanner
    ? errorBanner.querySelector(".editor-save-error__retry")
    : null;

  if (!toolbar || !toggleBtn) return; // UI not present, do nothing.

  // ---------- State ----------

  let editing = false;
  let selectedId = null;
  let dragging = null;
  let lastBranch = "modeling";
  let suppressNextClick = false;

  // Connect mode state
  let connectMode = false;
  let connectSource = null; // id of the first node clicked

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
    if (connectBtn) connectBtn.disabled = !editing;
    if (!editing) {
      clearSelection();
      setConnectMode(false);
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

  // ---------- Connect mode ----------

  function setConnectMode(on) {
    connectMode = on;
    body.classList.toggle("is-connecting", connectMode);
    if (connectBtn) connectBtn.setAttribute("aria-pressed", String(connectMode));
    if (!connectMode) {
      clearConnectSource();
      removePreviewLine();
    }
  }

  function clearConnectSource() {
    if (connectSource) {
      const g = tree.nodesLayer.querySelector(
        `[data-id="${cssEscape(connectSource)}"]`
      );
      if (g) g.classList.remove("is-connect-source");
    }
    connectSource = null;
  }

  function setConnectSource(id) {
    clearConnectSource();
    connectSource = id;
    const g = tree.nodesLayer.querySelector(`[data-id="${cssEscape(id)}"]`);
    if (g) g.classList.add("is-connect-source");
  }

  // Preview line from source node to cursor
  let previewLine = null;

  function updatePreviewLine(worldX, worldY) {
    if (!connectSource) {
      removePreviewLine();
      return;
    }
    const src = tree.getSkillById(connectSource);
    if (!src) {
      removePreviewLine();
      return;
    }
    if (!previewLine) {
      const SVG_NS = "http://www.w3.org/2000/svg";
      previewLine = document.createElementNS(SVG_NS, "line");
      previewLine.id = "connect-preview";
      previewLine.setAttribute("pointer-events", "none");
      tree.edgesLayer.appendChild(previewLine);
    }
    previewLine.setAttribute("x1", String(src.x));
    previewLine.setAttribute("y1", String(src.y));
    previewLine.setAttribute("x2", String(worldX));
    previewLine.setAttribute("y2", String(worldY));
  }

  function removePreviewLine() {
    if (previewLine && previewLine.parentNode) {
      previewLine.parentNode.removeChild(previewLine);
    }
    previewLine = null;
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
          const stored = tree
            .getEditState()
            .added.find((s) => s.id === id);
          if (stored) {
            stored.x = skill.x;
            stored.y = skill.y;
            tree.addNode(stored);
          }
        } else {
          tree.setOverride(id, { x: skill.x, y: skill.y });
        }
        fillPanel(id);
        scheduleSave();
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
      // Domain-ring arcs are paths with absolute coordinates and don't
      // follow the circle automatically — wipe and redraw them.
      g.querySelectorAll(".domain-ring").forEach((p) => p.remove());
      if (tree.getEffectiveDomains && tree.drawDomainRing) {
        const domains = tree.getEffectiveDomains(skill);
        if (Object.keys(domains).length > 1) {
          tree.drawDomainRing(g, x, y, tree.getRadius(skill.kind), domains);
        }
      }
    }

    const edges = tree.edgesLayer.querySelectorAll(
      `[data-from="${cssEscape(id)}"], [data-to="${cssEscape(id)}"]`
    );
    edges.forEach((edgeGroup) => {
      const fromId = edgeGroup.getAttribute("data-from");
      const toId = edgeGroup.getAttribute("data-to");
      const from = tree.getSkillById(fromId);
      const to = tree.getSkillById(toId);
      if (!from || !to) return;
      const lines = edgeGroup.querySelectorAll("line");
      if (lines.length === 0) { scheduleFullRedraw(); return; }
      lines.forEach((line) => {
        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x));
        line.setAttribute("y2", String(to.y));
      });
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

  // ---------- Selection / connect on click ----------

  tree.svg.addEventListener("click", (event) => {
    if (!editing) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }

    const node = event.target.closest(".node");
    const clickedEdge = event.target.closest(".edge-group");

    // In connect mode, clicking directly on an edge (not the preview) deletes it.
    if (connectMode && clickedEdge && clickedEdge.id !== "connect-preview") {
      const from = clickedEdge.getAttribute("data-from");
      const to = clickedEdge.getAttribute("data-to");
      if (from && to) {
        tree.removeEdge(from, to);
        clearConnectSource();
        removePreviewLine();
        tree.redraw();
        scheduleSave();
      }
      return;
    }

    if (connectMode) {
      if (!node) {
        // Click on background: clear source, stay in connect mode
        clearConnectSource();
        return;
      }
      const id = node.getAttribute("data-id");
      if (!connectSource) {
        // First click: set source
        setConnectSource(id);
      } else if (id === connectSource) {
        // Click on the same node: deselect source
        clearConnectSource();
      } else {
        // Second click on a different node: toggle edge
        if (tree.hasEdge(connectSource, id)) {
          tree.removeEdge(connectSource, id);
        } else {
          tree.addEdge(connectSource, id);
        }
        const prevSource = connectSource;
        clearConnectSource();
        removePreviewLine();
        tree.redraw();
        // Re-highlight source (stays selected for chaining)
        setConnectSource(prevSource);
        scheduleSave();
      }
      return;
    }

    if (!node) {
      clearSelection();
      return;
    }
    selectNode(node.getAttribute("data-id"));
  });

  // Preview line follows mouse while in connect mode with a source selected
  tree.svg.addEventListener("mousemove", (event) => {
    if (!connectMode || !connectSource) return;
    const world = tree.clientToWorld(event.clientX, event.clientY);
    updatePreviewLine(world.x, world.y);
  });

  // ---------- Toolbar buttons ----------

  toggleBtn.addEventListener("click", () => setEditing(!editing));

  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      if (!editing) return;
      setConnectMode(!connectMode);
    });
  }

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
      if (connectMode) {
        setConnectMode(false);
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
    };
    tree.addNode(node);
    tree.redraw();
    selectNode(id);
    scheduleSave();
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
      const stored = tree.getEditState().added.find((s) => s.id === id);
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
    scheduleSave();
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
    scheduleSave();
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
    scheduleSave();
  });

  // ---------- Auto-save ----------

  let saveTimer = null;
  let saveInFlight = false;
  let pendingAfterFlight = false;

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
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
    try {
      const res = await fetch("data/overrides.js", {
        method: "PUT",
        headers: { "Content-Type": "application/javascript" },
        body,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      hideError();
      tree.clearPending();
    } catch (err) {
      tree.persistPending();
      showError(err);
    } finally {
      saveInFlight = false;
      if (pendingAfterFlight) {
        pendingAfterFlight = false;
        scheduleSave();
      }
    }
  }

  function showError(err) {
    if (!errorBanner) return;
    const detail = err && err.message ? ` (${err.message})` : "";
    if (errorText) {
      errorText.textContent = `Save to data/overrides.js failed${detail}. Run via run.bat to enable saving.`;
    }
    errorBanner.hidden = false;
  }

  function hideError() {
    if (!errorBanner) return;
    errorBanner.hidden = true;
  }

  if (errorRetry) {
    errorRetry.addEventListener("click", () => {
      saveNow();
    });
  }

  function buildOverridesFile() {
    const st = tree.getEditState();
    const lines = [
      "/**",
      " * Full edit state of the skill tree, persisted to source.",
      " *",
      " * Auto-saved by the in-app editor (server.py / run.bat). Five exports",
      " * cover the complete state:",
      " *",
      " *   overrides    -- per base-node diff (subset of x, y, label, branch, kind, desc)",
      " *   addedNodes   -- full skill objects created with the Add node button",
      " *   deletedIds   -- ids of base nodes hidden from the render",
      " *   addedEdges   -- extra edges beyond data/relationships.js  { from, to }",
      " *   deletedEdges -- base edges removed via the Connect tool    { from, to }",
      " *",
      " * Commit this file and any clone reproduces the same tree.",
      " */",
      "",
      "export const overrides = {",
    ];

    const ids = Object.keys(st.overrides ?? {}).sort();
    for (const id of ids) {
      const v = st.overrides[id];
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

    const added = (st.added ?? [])
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    lines.push("export const addedNodes = [");
    for (const node of added) {
      lines.push("  {");
      lines.push(`    id: ${JSON.stringify(node.id)},`);
      lines.push(`    label: ${JSON.stringify(node.label ?? "")},`);
      lines.push(`    branch: ${JSON.stringify(node.branch ?? "modeling")},`);
      lines.push(`    kind: ${JSON.stringify(node.kind ?? "detail")},`);
      lines.push(`    x: ${Math.round(node.x ?? 0)},`);
      lines.push(`    y: ${Math.round(node.y ?? 0)},`);
      lines.push(`    desc: ${JSON.stringify(node.desc ?? "")},`);
      lines.push("  },");
    }
    lines.push("];", "");

    const deleted = (st.deleted ?? []).slice().sort();
    lines.push("export const deletedIds = [");
    for (const id of deleted) {
      lines.push(`  ${JSON.stringify(id)},`);
    }
    lines.push("];", "");

    const addedEdges = (st.addedEdges ?? [])
      .slice()
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    lines.push("export const addedEdges = [");
    for (const e of addedEdges) {
      lines.push(`  { from: ${JSON.stringify(e.from)}, to: ${JSON.stringify(e.to)} },`);
    }
    lines.push("];", "");

    const deletedEdges = (st.deletedEdges ?? [])
      .slice()
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    lines.push("export const deletedEdges = [");
    for (const e of deletedEdges) {
      lines.push(`  { from: ${JSON.stringify(e.from)}, to: ${JSON.stringify(e.to)} },`);
    }
    lines.push("];", "");

    return lines.join("\n");
  }

  // ---------- Boot ----------

  setEditing(false);
  hideError();
}

if (window.tree) {
  initEditor();
} else {
  window.addEventListener("tree:ready", initEditor, { once: true });
}
