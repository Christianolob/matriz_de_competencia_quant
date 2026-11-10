/**
 * Edit mode for the skill tree.
 *
 * Toggle with the "E" key or the toolbar button. While in edit mode:
 *  - Click a node to select it; the side panel shows its metadata.
 *  - Drag a node to move it. If multiple nodes are selected, drag any one
 *    of them to move the whole group while preserving relative positions.
 *  - Shift+click a node to add/remove it from the selection.
 *  - Shift+drag on empty background draws a marquee that selects every
 *    node whose center falls inside the rectangle.
 *  - "Add node" creates a new circle at the viewport center.
 *  - The side panel lets you edit label, branch, kind, description.
 *    It only shows when exactly one node is selected.
 *  - Delete removes the selected node(s) (added nodes are erased; base
 *    nodes are tombstoned).
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

  const SVG_NS = "http://www.w3.org/2000/svg";

  // ---------- State ----------

  let editing = false;
  let selectedIds = new Set();
  let anchorId = null; // most recently focused; drives the side panel
  let dragging = null;
  let marquee = null;
  let lastBranch = "modeling";
  let suppressNextClick = false;
  let clipboard = []; // snapshots from the last Ctrl+C, positioned relative to the first item
  const undoStack = []; // edit-state snapshots; Ctrl+Z pops and restores the last one

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
      endMarquee(true);
    }
  }

  function nodeElement(id) {
    return tree.nodesLayer.querySelector(`[data-id="${cssEscape(id)}"]`);
  }

  function clearSelection() {
    for (const id of selectedIds) {
      const node = nodeElement(id);
      if (node) node.classList.remove("is-selected");
    }
    selectedIds.clear();
    anchorId = null;
    updatePanelForSelection();
  }

  function addToSelection(id) {
    if (selectedIds.has(id)) return;
    selectedIds.add(id);
    const node = nodeElement(id);
    if (node) node.classList.add("is-selected");
  }

  function removeFromSelection(id) {
    if (!selectedIds.has(id)) return;
    selectedIds.delete(id);
    const node = nodeElement(id);
    if (node) node.classList.remove("is-selected");
    if (anchorId === id) {
      anchorId = selectedIds.size > 0 ? [...selectedIds][selectedIds.size - 1] : null;
    }
  }

  function selectOnly(id) {
    for (const sid of [...selectedIds]) {
      if (sid !== id) removeFromSelection(sid);
    }
    addToSelection(id);
    anchorId = id;
    updatePanelForSelection();
  }

  function toggleSelection(id) {
    if (selectedIds.has(id)) {
      removeFromSelection(id);
    } else {
      addToSelection(id);
      anchorId = id;
    }
    updatePanelForSelection();
  }

  function updatePanelForSelection() {
    if (selectedIds.size === 1) {
      const [only] = selectedIds;
      fillPanel(only);
      panel.classList.add("is-open");
    } else {
      panel.classList.remove("is-open");
    }
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

  // ---------- Undo ----------

  function snapshotState() {
    const st = tree.getEditState();
    const snap = {
      overrides: JSON.parse(JSON.stringify(st.overrides ?? {})),
      added: JSON.parse(JSON.stringify(st.added ?? [])),
      deleted: [...(st.deleted ?? [])],
      addedEdges: JSON.parse(JSON.stringify(st.addedEdges ?? [])),
      deletedEdges: JSON.parse(JSON.stringify(st.deletedEdges ?? [])),
    };
    snap.__json = JSON.stringify(snap);
    return snap;
  }

  // Capture the current state BEFORE a mutation, so Ctrl+Z can return to it.
  // Consecutive identical snapshots (e.g. focusing a field without typing)
  // are skipped so undo never appears to do nothing.
  function pushUndo() {
    const snap = snapshotState();
    const top = undoStack[undoStack.length - 1];
    if (top && top.__json === snap.__json) return;
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
  }

  function restoreState(snap) {
    const st = tree.getEditState();
    // Mutate the live editState object in place; main.js holds this reference.
    st.overrides = JSON.parse(JSON.stringify(snap.overrides));
    st.added = JSON.parse(JSON.stringify(snap.added));
    st.deleted = [...snap.deleted];
    st.addedEdges = JSON.parse(JSON.stringify(snap.addedEdges));
    st.deletedEdges = JSON.parse(JSON.stringify(snap.deletedEdges));
  }

  function undo() {
    if (undoStack.length === 0) return;
    const snap = undoStack.pop();
    restoreState(snap);
    clearConnectSource();
    removePreviewLine();
    clearSelection();
    tree.redraw();
    scheduleSave();
  }

  // ---------- Copy / paste / rename ----------

  function isTypingTarget(t) {
    return (
      t &&
      (t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable)
    );
  }

  function copySelection() {
    if (selectedIds.size === 0) return;
    const skills = [...selectedIds]
      .map((id) => tree.getSkillById(id))
      .filter(Boolean);
    if (skills.length === 0) return;
    const ox = skills[0].x;
    const oy = skills[0].y;
    clipboard = skills.map((s) => ({
      label: s.label ?? "",
      branch: s.branch ?? "modeling",
      kind: s.kind ?? "detail",
      desc: s.desc ?? "",
      rx: (s.x ?? 0) - ox,
      ry: (s.y ?? 0) - oy,
    }));
  }

  function pasteClipboard() {
    if (clipboard.length === 0) return;
    pushUndo();
    const center = tree.viewportCenterWorld();
    const newIds = [];
    for (const entry of clipboard) {
      const branch = entry.branch || "modeling";
      let n = 1;
      let id;
      do {
        id = `custom-${branch}-${n++}`;
      } while (tree.getSkillById(id));
      const node = {
        id,
        label: entry.label,
        branch: entry.branch,
        kind: entry.kind,
        desc: entry.desc,
        x: Math.round(center.x + entry.rx),
        y: Math.round(center.y + entry.ry),
      };
      tree.addNode(node);
      newIds.push(id);
    }
    tree.redraw();
    clearSelection();
    for (const id of newIds) addToSelection(id);
    if (newIds.length > 0) anchorId = newIds[newIds.length - 1];
    updatePanelForSelection();
    scheduleSave();
  }

  function beginRenameSelected() {
    if (selectedIds.size !== 1 || !anchorId) return;
    panel.classList.add("is-open");
    // Ensure the panel is populated for the anchor before focusing.
    fillPanel(anchorId);
    inputLabel.focus();
    inputLabel.select();
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
      const g = nodeElement(connectSource);
      if (g) g.classList.remove("is-connect-source");
    }
    connectSource = null;
  }

  function setConnectSource(id) {
    clearConnectSource();
    connectSource = id;
    const g = nodeElement(id);
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

  // ---------- Marquee selection ----------

  function startMarquee(event) {
    const world = tree.clientToWorld(event.clientX, event.clientY);
    const rectEl = document.createElementNS(SVG_NS, "rect");
    rectEl.setAttribute("id", "marquee-rect");
    rectEl.setAttribute("fill", "rgba(120, 170, 255, 0.12)");
    rectEl.setAttribute("stroke", "#7aaaff");
    rectEl.setAttribute("stroke-dasharray", "6 4");
    rectEl.setAttribute("vector-effect", "non-scaling-stroke");
    rectEl.setAttribute("pointer-events", "none");
    tree.edgesLayer.appendChild(rectEl);
    marquee = {
      startWorld: world,
      rectEl,
      additive: event.shiftKey,
      baseSelection: event.shiftKey ? new Set(selectedIds) : new Set(),
    };
    body.dataset.suppressPan = "1";
  }

  function updateMarquee(event) {
    if (!marquee) return;
    const cur = tree.clientToWorld(event.clientX, event.clientY);
    const x1 = Math.min(marquee.startWorld.x, cur.x);
    const y1 = Math.min(marquee.startWorld.y, cur.y);
    const x2 = Math.max(marquee.startWorld.x, cur.x);
    const y2 = Math.max(marquee.startWorld.y, cur.y);
    marquee.rectEl.setAttribute("x", String(x1));
    marquee.rectEl.setAttribute("y", String(y1));
    marquee.rectEl.setAttribute("width", String(x2 - x1));
    marquee.rectEl.setAttribute("height", String(y2 - y1));

    const next = new Set(marquee.baseSelection);
    for (const skill of tree.getSkills()) {
      if (
        typeof skill.x === "number" &&
        typeof skill.y === "number" &&
        skill.x >= x1 &&
        skill.x <= x2 &&
        skill.y >= y1 &&
        skill.y <= y2
      ) {
        next.add(skill.id);
      }
    }
    for (const id of [...selectedIds]) {
      if (!next.has(id)) removeFromSelection(id);
    }
    for (const id of next) {
      if (!selectedIds.has(id)) addToSelection(id);
    }
    if (!anchorId && selectedIds.size > 0) {
      anchorId = [...selectedIds][selectedIds.size - 1];
    }
    updatePanelForSelection();
  }

  function endMarquee(silent = false) {
    if (!marquee) return;
    if (marquee.rectEl && marquee.rectEl.parentNode) {
      marquee.rectEl.parentNode.removeChild(marquee.rectEl);
    }
    marquee = null;
    delete body.dataset.suppressPan;
    if (!silent) suppressNextClick = true;
  }

  // ---------- Drag ----------

  tree.svg.addEventListener("mousedown", (event) => {
    if (!editing) return;
    if (event.button !== 0) return;

    const node = event.target.closest(".node");

    if (!node) {
      // Empty background. Shift = marquee select; otherwise let pan handle it.
      if (event.shiftKey) {
        event.stopPropagation();
        event.preventDefault();
        startMarquee(event);
      }
      return;
    }

    const id = node.getAttribute("data-id");
    const skill = tree.getSkillById(id);
    if (!skill) return;

    event.stopPropagation();
    event.preventDefault();
    body.dataset.suppressPan = "1";

    // Shift on a node: leave selection change to the click handler (toggle),
    // do not start a drag.
    if (event.shiftKey) return;

    // If clicking a node that isn't part of the current selection, replace
    // the selection with just this one before dragging. If it IS already
    // selected, keep the whole group and drag everything together.
    if (!selectedIds.has(id)) {
      selectOnly(id);
    } else if (selectedIds.size === 1) {
      // Single existing selection — refresh anchor / panel.
      anchorId = id;
      updatePanelForSelection();
    }

    const world = tree.clientToWorld(event.clientX, event.clientY);
    const ids = [...selectedIds];
    const offsets = new Map();
    for (const sid of ids) {
      const s = tree.getSkillById(sid);
      if (!s) continue;
      offsets.set(sid, { ox: s.x - world.x, oy: s.y - world.y });
    }

    dragging = {
      ids,
      offsets,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (marquee) {
      updateMarquee(event);
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (!dragging.started && Math.hypot(dx, dy) < 3) return;
    dragging.started = true;

    const world = tree.clientToWorld(event.clientX, event.clientY);
    for (const sid of dragging.ids) {
      const off = dragging.offsets.get(sid);
      if (!off) continue;
      moveNodeTo(
        sid,
        Math.round(world.x + off.ox),
        Math.round(world.y + off.oy)
      );
    }
  });

  window.addEventListener("mouseup", () => {
    if (marquee) {
      endMarquee();
      return;
    }
    if (!dragging) return;
    const ids = dragging.ids;
    const wasDrag = dragging.started;
    dragging = null;
    delete body.dataset.suppressPan;
    if (wasDrag) suppressNextClick = true;

    if (wasDrag) {
      pushUndo();
      for (const sid of ids) {
        const skill = tree.getSkillById(sid);
        if (!skill) continue;
        if (isAddedId(sid)) {
          const stored = tree.getEditState().added.find((s) => s.id === sid);
          if (stored) {
            stored.x = skill.x;
            stored.y = skill.y;
            tree.addNode(stored);
          }
        } else {
          tree.setOverride(sid, { x: skill.x, y: skill.y });
        }
      }
      if (anchorId && selectedIds.has(anchorId)) fillPanel(anchorId);
      scheduleSave();
    }
  });

  function moveNodeTo(id, x, y) {
    const skill = tree.getSkillById(id);
    if (!skill) return;
    skill.x = x;
    skill.y = y;

    const g = nodeElement(id);
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

    if (anchorId === id && selectedIds.size === 1) {
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
      for (const id of selectedIds) {
        const node = nodeElement(id);
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
        pushUndo();
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
        clearConnectSource();
        return;
      }
      const id = node.getAttribute("data-id");
      if (!connectSource) {
        setConnectSource(id);
      } else if (id === connectSource) {
        clearConnectSource();
      } else {
        pushUndo();
        if (tree.hasEdge(connectSource, id)) {
          tree.removeEdge(connectSource, id);
        } else {
          tree.addEdge(connectSource, id);
        }
        clearConnectSource();
        removePreviewLine();
        tree.redraw();
        // Chain connections: the node just connected to (the second click)
        // becomes the source for the next edge, so A->B->C->... is fast.
        setConnectSource(id);
        scheduleSave();
      }
      return;
    }

    if (!node) {
      clearSelection();
      return;
    }
    const id = node.getAttribute("data-id");
    if (event.shiftKey) {
      toggleSelection(id);
    } else {
      selectOnly(id);
    }
  });

  // Double-click a node: open the (enlarged) editor panel and jump straight
  // into the name field, ready to type. Single click keeps select/move.
  tree.svg.addEventListener("dblclick", (event) => {
    if (!editing || connectMode) return;
    const node = event.target.closest(".node");
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    const id = node.getAttribute("data-id");
    if (!tree.getSkillById(id)) return;
    selectOnly(id);
    beginRenameSelected();
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
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setEditing(!editing);
      return;
    }
    if (event.key === "Escape") {
      if (marquee) {
        endMarquee(true);
      } else if (connectMode) {
        setConnectMode(false);
      } else {
        clearSelection();
      }
      return;
    }
    if (!editing) return;
    const typing = isTypingTarget(event.target);
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.shiftKey &&
      (event.key === "z" || event.key === "Z")
    ) {
      if (typing) return; // let the browser undo text inside inputs
      event.preventDefault();
      undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "c" || event.key === "C")) {
      if (typing) return; // let the browser copy text
      if (selectedIds.size === 0) return;
      event.preventDefault();
      copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "v" || event.key === "V")) {
      if (typing) return; // let the browser paste text
      if (clipboard.length === 0) return;
      event.preventDefault();
      pasteClipboard();
      return;
    }
    if (event.key === "F2") {
      if (typing) return;
      if (selectedIds.size !== 1) return;
      event.preventDefault();
      beginRenameSelected();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (typing) return;
      if (selectedIds.size === 0) return;
      event.preventDefault();
      pushUndo();
      for (const id of [...selectedIds]) {
        if (isAddedId(id)) {
          tree.removeAdded(id);
        } else if (isFromBase(id)) {
          tree.markDeleted(id);
        }
      }
      clearSelection();
      tree.redraw();
      scheduleSave();
    }
  });

  addBtn.addEventListener("click", () => {
    if (!editing) return;
    pushUndo();
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
    selectOnly(id);
    scheduleSave();
  });

  // ---------- Side panel inputs ----------

  inputLabel.addEventListener("input", () => {
    if (!anchorId) return;
    applyMetadataEdit(anchorId, { label: inputLabel.value });
  });
  inputBranch.addEventListener("change", () => {
    if (!anchorId) return;
    lastBranch = inputBranch.value;
    applyMetadataEdit(anchorId, { branch: inputBranch.value });
  });
  inputKind.addEventListener("change", () => {
    if (!anchorId) return;
    applyMetadataEdit(anchorId, { kind: inputKind.value });
  });
  inputDesc.addEventListener("input", () => {
    if (!anchorId) return;
    applyMetadataEdit(anchorId, { desc: inputDesc.value });
  });

  // Snapshot the pre-edit state once when a metadata field gains focus, so a
  // whole edit (label/desc typing, branch/kind change) is a single undo step.
  for (const input of [inputLabel, inputBranch, inputKind, inputDesc]) {
    input.addEventListener("focus", () => {
      if (editing && anchorId) pushUndo();
    });
  }

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
    for (const sid of selectedIds) {
      const node = nodeElement(sid);
      if (node) node.classList.add("is-selected");
    }
    fillPanel(id);
    scheduleSave();
  }

  panelClose.addEventListener("click", clearSelection);

  deleteBtn.addEventListener("click", () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const label =
      ids.length === 1
        ? `"${ids[0]}"`
        : `${ids.length} selected nodes`;
    if (!confirm(`Delete ${label}?`)) return;
    pushUndo();
    for (const id of ids) {
      if (isAddedId(id)) {
        tree.removeAdded(id);
      } else if (isFromBase(id)) {
        tree.markDeleted(id);
      }
    }
    clearSelection();
    tree.redraw();
    scheduleSave();
  });

  revertBtn.addEventListener("click", () => {
    if (selectedIds.size === 0) return;
    pushUndo();
    const ids = [...selectedIds];
    for (const id of ids) {
      if (isAddedId(id)) {
        tree.removeAdded(id);
      } else {
        tree.clearOverride(id);
        tree.unmarkDeleted(id);
      }
    }
    // Drop any selected ids that no longer exist after revert (added removals).
    for (const id of [...selectedIds]) {
      if (!tree.getSkillById(id)) {
        selectedIds.delete(id);
        if (anchorId === id) anchorId = null;
      }
    }
    tree.redraw();
    for (const id of selectedIds) {
      const node = nodeElement(id);
      if (node) node.classList.add("is-selected");
    }
    if (!anchorId && selectedIds.size > 0) {
      anchorId = [...selectedIds][selectedIds.size - 1];
    }
    updatePanelForSelection();
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
      if (node.domains && Object.keys(node.domains).length > 0) {
        lines.push(`    domains: ${JSON.stringify(node.domains)},`);
      }
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
