import * as aplicacoes from "./aplicacoes.js";

const DEFAULT_OFF = new Set();
const STORE_KEY = "empresas-quant-ui-v2";

const state = {
  empresas: [],
  categorias: {},
  limites: {}, // { categoria: N } do modo "padrão" (ausente = todas)
  active: new Set(),
  search: "",
  topN: "auto", // "auto" = limites por categoria | N | 0 = todas
  indep: false,
  status: "todas", // todas | aplicadas | pendentes
  aplicadas: {}, // { id: { aplicado, em } } vindo do mock
  sortKey: null,
  sortDir: 1,
};

const $ = (sel) => document.querySelector(sel);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const fmtBi = (v) =>
  v == null ? "—" : (v / 1e9).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function detail(e) {
  return [e.subtipo, e.estrategia, e.conglomerado && `conglomerado ${e.conglomerado}`, e.observacao, e.cnpj]
    .filter(Boolean)
    .join(" · ");
}

function saveUi() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ active: [...state.active], topN: state.topN, indep: state.indep, status: state.status }));
  } catch {}
}

function loadUi(cats) {
  try {
    const ui = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (ui) {
      state.active = new Set(ui.active.filter((c) => c in cats));
      state.topN = ui.topN ?? "auto";
      state.indep = !!ui.indep;
      state.status = ui.status ?? "todas";
      return;
    }
  } catch {}
  state.active = new Set(Object.keys(cats).filter((c) => !DEFAULT_OFF.has(c)));
}

function filtered() {
  const q = norm(state.search);
  let rows = state.empresas.filter((e) => {
    if (!state.active.has(e.categoria)) return false;
    const limite = state.topN === "auto" ? state.limites[e.categoria] : state.topN;
    if (limite && e.rank > limite) return false;
    if (state.indep && e.categoria.startsWith("gestora_") && !e.independente) return false;
    const aplicada = !!state.aplicadas[e.id];
    if (state.status === "aplicadas" && !aplicada) return false;
    if (state.status === "pendentes" && aplicada) return false;
    if (q && !norm([e.nome, e.cnpj, e.cidade, e.uf, e.conglomerado, e.subtipo, e.estrategia, e.observacao].join(" ")).includes(q))
      return false;
    return true;
  });
  if (state.sortKey) {
    const k = state.sortKey;
    rows = [...rows].sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * state.sortDir;
    });
  }
  return rows;
}

function renderChips() {
  const counts = {};
  for (const e of state.empresas) counts[e.categoria] = (counts[e.categoria] || 0) + 1;
  $("#chips").innerHTML = Object.entries(state.categorias)
    .filter(([k]) => counts[k])
    .map(
      ([k, label]) =>
        `<button type="button" class="chip${state.active.has(k) ? " on" : ""}" data-cat="${esc(k)}" aria-pressed="${state.active.has(k)}">
          ${esc(label)} <span>${counts[k]}</span></button>`
    )
    .join("");
}

/** Painel "Recomendação": categorias na ordem de prioridade, com a meta de cada
 *  uma (as N maiores, ou todas) e quantas dessas o aluno já marcou como aplicadas. */
function renderReco() {
  const total = {}, feitas = {};
  for (const e of state.empresas) {
    const lim = state.limites[e.categoria];
    if (lim && e.rank > lim) continue;
    total[e.categoria] = (total[e.categoria] || 0) + 1;
    if (state.aplicadas[e.id]) feitas[e.categoria] = (feitas[e.categoria] || 0) + 1;
  }
  $("#reco-list").innerHTML = Object.entries(state.categorias)
    .filter(([k]) => total[k])
    .map(([k, label]) => {
      const n = total[k], f = feitas[k] || 0;
      const meta = state.limites[k] ? `${n} maiores` : `todas (${n})`;
      return `<li><button type="button" class="linklike" data-cat="${esc(k)}">${esc(label)}</button>
        <span class="reco-n">— ${meta}</span>
        <span class="reco-prog${f === n ? " done" : ""}">· ${f}/${n} aplicadas</span></li>`;
    })
    .join("");
}

function showRecomendadas(cats) {
  state.active = new Set(cats);
  state.topN = "auto";
  $("#topn").value = "auto";
  saveUi();
  renderChips();
  renderTable();
}

function renderTable() {
  renderReco();
  const rows = filtered();
  const nAplic = Object.keys(state.aplicadas).length;
  $("#count").textContent = `${rows.length} empresas · ${nAplic} aplicada${nAplic === 1 ? "" : "s"}`;
  $("#table tbody").innerHTML = rows
    .map((e) => {
      const links = [
        e.site && `<a href="${esc(e.site)}" target="_blank" rel="noopener">site</a>`,
        `<a href="${esc(e.links.linkedin)}" target="_blank" rel="noopener">Procurar LinkedIn</a>`,
        `<a href="${esc(e.links.google)}" target="_blank" rel="noopener">Procurar no site</a>`,
      ]
        .filter(Boolean)
        .join(" ");
      const badge = e.categoria.startsWith("gestora_") && e.independente ? '<span class="badge">independente</span>' : "";
      const ap = state.aplicadas[e.id];
      const quando = ap ? new Date(ap.em).toLocaleDateString("pt-BR") : "";
      return `<tr class="${ap ? "applied" : ""}">
        <td class="apply"><label title="${ap ? "Aplicado em " + esc(quando) : "Marcar como aplicado"}">
          <input type="checkbox" data-id="${esc(e.id)}" ${ap ? "checked" : ""} />
          <span>${ap ? esc(quando) : "aplicar"}</span></label></td>
        <td class="num">${e.rank}</td>
        <td><div class="name">${esc(e.nome)} ${badge}</div><div class="detail">${esc(detail(e))}</div></td>
        <td><span class="cat cat-${esc(e.categoria)}">${esc(state.categorias[e.categoria] || e.categoria)}</span></td>
        <td class="num" title="${esc(e.valor_tipo)}${e.data_base ? " · " + esc(e.data_base) : ""}">${fmtBi(e.valor)}</td>
        <td class="num">${e.n_fundos ?? ""}</td>
        <td>${esc(e.uf ?? "")}</td>
        <td class="links">${links}</td>
      </tr>`;
    })
    .join("");
  document.querySelectorAll("#table th[data-key]").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.key === state.sortKey);
    th.dataset.dir = th.dataset.key === state.sortKey ? (state.sortDir > 0 ? "▲" : "▼") : "";
  });
}

function exportCsv() {
  const cols = ["rank", "nome", "categoria", "valor", "valor_tipo", "n_fundos", "estrategia", "independente", "subtipo",
    "conglomerado", "cnpj", "uf", "cidade", "data_base", "fonte", "site"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const row = (e) => [...cols.map((c) => q(e[c])), q(state.aplicadas[e.id] ? "sim" : ""), q(state.aplicadas[e.id]?.em)];
  const lines = [[...cols, "aplicado", "aplicado_em"].join(";"), ...filtered().map((e) => row(e).join(";"))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "empresas_quant.csv" });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  let data;
  try {
    const res = await fetch("../data/empresas.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    $("#meta").textContent = "";
    $("#errors").hidden = false;
    $("#errors").textContent = `Não foi possível ler data/empresas.json (${err.message}). Rode run.bat para coletar os dados.`;
    return;
  }
  const { meta, empresas } = data;
  state.empresas = empresas;
  state.categorias = meta.categorias;
  state.limites = meta.limites || {};
  loadUi(meta.categorias);

  $("#meta").textContent =
    `Gerado em ${new Date(meta.gerado_em).toLocaleString("pt-BR")} · BCB data-base ${meta.data_base_bcb || "—"} · CVM PL em ${meta.data_base_cvm || "—"}` +
    Object.entries(meta.exclusoes || {}).map(([g, n]) => ` · excluído grupo ${g} (${n})`).join("") +
    Object.entries(meta.cooperativas_agrupadas || {}).map(([r, n]) => ` · ${r}: ${n} cooperativas em 1 linha`).join("");
  if (meta.erros?.length) {
    $("#errors").hidden = false;
    $("#errors").innerHTML = "Fontes com erro (dados parciais):<br>" + meta.erros.map(esc).join("<br>");
  }

  state.aplicadas = await aplicacoes.listar();
  $("#topn").value = String(state.topN);
  $("#status").value = state.status;
  $("#indep").checked = state.indep;

  $("#chips").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".chip");
    if (!btn) return;
    const cat = btn.dataset.cat;
    if (ev.altKey) state.active = new Set([cat]);
    else state.active.has(cat) ? state.active.delete(cat) : state.active.add(cat);
    saveUi();
    renderChips();
    renderTable();
  });
  $("#search").addEventListener("input", (ev) => {
    state.search = ev.target.value;
    renderTable();
  });
  $("#topn").addEventListener("change", (ev) => {
    state.topN = ev.target.value === "auto" ? "auto" : Number(ev.target.value);
    saveUi();
    renderTable();
  });
  $("#indep").addEventListener("change", (ev) => {
    state.indep = ev.target.checked;
    saveUi();
    renderTable();
  });
  document.querySelectorAll("#table th[data-key]").forEach((th) =>
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDir = -state.sortDir;
      else {
        state.sortKey = k;
        state.sortDir = k === "valor" || k === "n_fundos" ? -1 : 1;
      }
      renderTable();
    })
  );
  $("#export").addEventListener("click", exportCsv);
  $("#reco-list").addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-cat]");
    if (btn) showRecomendadas([btn.dataset.cat]);
  });
  $("#reco-all").addEventListener("click", () => showRecomendadas(Object.keys(state.categorias)));
  $("#status").addEventListener("change", (ev) => {
    state.status = ev.target.value;
    saveUi();
    renderTable();
  });
  $("#table tbody").addEventListener("change", async (ev) => {
    const box = ev.target.closest('input[type="checkbox"][data-id]');
    if (!box) return;
    const reg = await aplicacoes.marcar(box.dataset.id, box.checked);
    if (reg) state.aplicadas[box.dataset.id] = reg;
    else delete state.aplicadas[box.dataset.id];
    renderTable();
  });
  $("#reset-aplic").addEventListener("click", async () => {
    if (!Object.keys(state.aplicadas).length || !confirm("Desmarcar todas as empresas aplicadas?")) return;
    await aplicacoes.limpar();
    state.aplicadas = {};
    renderTable();
  });

  renderChips();
  renderTable();
}

init();
