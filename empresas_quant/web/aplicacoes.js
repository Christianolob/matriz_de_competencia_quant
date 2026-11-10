/**
 * MOCK de "candidaturas" — sem integração com backend.
 *
 * Guarda no localStorage deste navegador quais empresas o usuário marcou como
 * "aplicado" (e quando). A interface é assíncrona de propósito, imitando uma
 * API real: para integrar depois, basta trocar o corpo destas funções por
 * chamadas HTTP (ex.: GET/PUT /api/aplicacoes/:id) sem mexer no app.js.
 *
 * Formato salvo: { [empresaId]: { aplicado: true, em: "2026-11-10T00:30:00.000Z" } }
 */

const KEY = "empresas-quant-aplicacoes-mock";

let cache = null;

function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    cache = {};
  }
  return cache;
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Modo privado / storage bloqueado: mantém só em memória nesta aba.
  }
}

/** Todas as marcações: { id: { aplicado, em } }. */
export async function listar() {
  return { ...read() };
}

/** Marca/desmarca uma empresa. Retorna o registro salvo (ou null ao desmarcar). */
export async function marcar(id, aplicado) {
  const db = read();
  if (aplicado) db[id] = { aplicado: true, em: new Date().toISOString() };
  else delete db[id];
  write();
  return db[id] ?? null;
}

/** Apaga todas as marcações (útil para demo). */
export async function limpar() {
  cache = {};
  write();
}
