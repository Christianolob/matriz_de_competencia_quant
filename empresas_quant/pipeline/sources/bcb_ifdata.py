"""Banco Central - IF.data: bancos, instituicoes de pagamento, corretoras, financeiras.

Usa os mesmos arquivos JSON que o site https://www3.bcb.gov.br/ifdata/ consome
(o OData do Olinda para IF.data costuma responder 500):

  rest/relatorios2025a2030                       -> indice de datas-base e arquivos
  rest/arquivos?nomeArquivo=<dt>/cadastroYYYYMM_<tipo>.json
        tipo 1009 = conglomerados prudenciais e instituicoes independentes
        tipo 1006 = instituicoes individuais
  rest/arquivos?nomeArquivo=<dt>/trelYYYYMM_<id>.json  -> colunas do relatorio "Resumo"
  rest/arquivos?nomeArquivo=<dt>/infoYYYYMM.json       -> definicao de cada coluna (lid)
  rest/arquivos?nomeArquivo=<dt>/dadosYYYYMM_<n>.json  -> valores {e: entidade, v: [{i: lid, v}]}

Cadastro: campo c<lid> das colunas descritivas (c0 codigo, c2 nome, c3 TCB,
c6/c7 controle (1 = Publico), c8 TI, c10 UF, c11 cidade, c12 segmento, c22 conglomerado, c33 CNPJ base).
"""

from __future__ import annotations

import re

from common import fetch, fetch_json, log, norm, search_links

BASE = "https://www3.bcb.gov.br/ifdata"
INDEX_FALLBACK = "relatorios2025a2030"

TIPO_PRUDENCIAL = 1009
TIPO_INDIVIDUAL = 1006

# TCB -> categoria. Bancos e cooperativas vem dos conglomerados prudenciais
# (evita contar Itau Unibanco S.A. e Itau Holding duas vezes); IPs, corretoras
# e financeiras vem das instituicoes individuais (Nubank/Mercado Pago/Stone
# aparecem como IPs individuais mesmo dentro de conglomerados).
CATEGORIA_PRUDENCIAL = {
    "b1": "banco",
    "b2": "banco",
    "b4": "banco",
    "b3S": "cooperativa",
    "b3C": "cooperativa",
}
CATEGORIA_INDIVIDUAL = {
    "n4": "pagamentos",
    "n2": "corretora_dtvm",
    "n1": "credito_nao_bancario",
}

# TC - Tipo de Controle: 1 = Publico (estatais), 2 = Privado nacional, 3 = Estrangeiro.
CONTROLE_PUBLICO = "1"

WANTED_COLUMNS = {
    "ativo total": "ativo_total",
    "patrimonio liquido": "patrimonio_liquido",
    "lucro liquido": "lucro_liquido",
}


def _index_name(refresh: bool) -> str:
    """Descobre o nome do indice atual (ex.: relatorios2025a2030) lendo o index.html."""
    try:
        page = fetch(f"{BASE}/index.html", "bcb/index.html", refresh=refresh)
        m = re.search(r"/ifdata/rest/(relatorios[0-9a-z]+)", page.read_text("utf-8", "replace"))
        if m:
            return m.group(1)
    except Exception as err:  # noqa: BLE001
        log(f"[aviso] index.html do IF.data indisponivel ({err}); usando {INDEX_FALLBACK}")
    return INDEX_FALLBACK


def _arquivo(path: str, refresh: bool):
    safe = path.replace("/", "_").lstrip("_")
    # Arquivos de uma data-base sao snapshots: so expiram via --refresh.
    return fetch_json(
        f"{BASE}/rest/arquivos?nomeArquivo={path}",
        f"bcb/{safe}",
        refresh=refresh,
        max_age_days=None,
    )


def _resumo_columns(files: list[dict], tipo: int, info: dict, refresh: bool) -> dict:
    """Mapeia ativo_total/patrimonio_liquido/lucro_liquido -> lid para o tipo dado."""
    for f in files:
        trel = f.get("trel")
        if not trel or norm(trel.get("n", "")) != "resumo":
            continue
        rel = _arquivo(f["f"], refresh)
        if not any(s.get("id") == tipo for s in rel.get("s", [])):
            continue
        cols = {}
        for col in rel.get("c", []):
            meta = info.get(col.get("ifd"))
            if meta and norm(meta["n"]) in WANTED_COLUMNS:
                cols[WANTED_COLUMNS[norm(meta["n"])]] = meta["lid"]
        if "ativo_total" in cols:
            return cols
    raise RuntimeError(f"relatorio 'Resumo' para tipo {tipo} nao encontrado")


def _load_values(files: list[dict], lids: set[int], refresh: bool) -> dict[int, dict[int, float]]:
    """Le os arquivos dados*.json ate encontrar todos os lids pedidos."""
    values: dict[int, dict[int, float]] = {}
    missing = set(lids)
    for f in files:
        if "/dados" not in f["f"] or not missing:
            continue
        dados = _arquivo(f["f"], refresh)
        found = set()
        for ent in dados.get("values", []):
            for item in ent.get("v", []):
                if item["i"] in missing:
                    values.setdefault(ent["e"], {})[item["i"]] = item["v"]
                    found.add(item["i"])
        missing -= found
    if missing:
        raise RuntimeError(f"colunas {sorted(missing)} nao encontradas nos arquivos de dados")
    return values


def _ti_names(filtros: list[dict]) -> dict[str, str]:
    for flt in filtros:
        if norm(flt.get("n", "")).startswith("ti "):
            return {d["v"]: re.sub(r"^\d+\s*-\s*", "", d["n"]) for d in flt.get("d", [])}
    return {}


def _clean_name(name: str) -> str:
    return re.sub(r"\s*-\s*PRUDENCIA?L?$", "", name.strip())


def _num(v):
    return float(v) if isinstance(v, (int, float)) else None


def collect(refresh: bool = False) -> tuple[list[dict], dict]:
    index = _index_name(refresh)
    datas = fetch_json(f"{BASE}/rest/{index}", f"bcb/{index}.json", refresh=refresh)
    datas = sorted(datas, key=lambda d: d["dt"], reverse=True)

    last_err = None
    for entry in datas:
        dt = entry["dt"]
        try:
            return _collect_dt(entry, refresh)
        except Exception as err:  # noqa: BLE001
            last_err = err
            log(f"[aviso] data-base {dt} falhou ({err}); tentando a anterior")
    raise RuntimeError(f"nenhuma data-base do IF.data utilizavel: {last_err}")


def _collect_dt(entry: dict, refresh: bool) -> tuple[list[dict], dict]:
    dt = entry["dt"]
    files = entry["files"]
    by_suffix = {f["f"].rsplit("/", 1)[-1]: f["f"] for f in files}
    log(f"IF.data data-base {dt}")

    info = {x["id"]: x for x in _arquivo(by_suffix[f"info{dt}.json"], refresh)}
    filtros = _arquivo(by_suffix[f"filtro{dt}.json"], refresh)
    ti_names = _ti_names(filtros)

    cad_prud = _arquivo(by_suffix[f"cadastro{dt}_{TIPO_PRUDENCIAL}.json"], refresh)
    cad_ind = _arquivo(by_suffix[f"cadastro{dt}_{TIPO_INDIVIDUAL}.json"], refresh)
    cols_prud = _resumo_columns(files, TIPO_PRUDENCIAL, info, refresh)
    cols_ind = _resumo_columns(files, TIPO_INDIVIDUAL, info, refresh)
    values = _load_values(files, set(cols_prud.values()) | set(cols_ind.values()), refresh)

    data_base = f"{str(dt)[:4]}-{str(dt)[4:]}"
    records: list[dict] = []

    def build(cad: dict, categoria: str, cols: dict, tipo: int) -> dict:
        vals = values.get(int(cad["c0"]), {})
        nome = _clean_name(cad["c2"])
        cnpj = cad.get("c33", "")
        conglomerado = _clean_name(cad.get("c22", "") or "")
        return {
            "id": f"bcb-{tipo}-{cad['c0']}",
            "nome": nome,
            "categoria": categoria,
            "fonte": "BCB IF.data",
            "valor": _num(vals.get(cols["ativo_total"])),
            "valor_tipo": "Ativo total",
            "patrimonio_liquido": _num(vals.get(cols.get("patrimonio_liquido"))),
            "lucro_liquido": _num(vals.get(cols.get("lucro_liquido"))),
            "cnpj": cnpj if cnpj.isdigit() else "",
            "tcb": cad.get("c3", ""),
            "subtipo": ti_names.get(cad.get("c8", ""), ""),
            "segmento": cad.get("c12", ""),
            "controle": cad.get("c7", ""),
            "conglomerado": conglomerado if conglomerado and conglomerado != nome else "",
            "uf": cad.get("c10", ""),
            "cidade": cad.get("c11", ""),
            "data_base": data_base,
            "links": search_links(nome),
        }

    # Empresas publicas (estatais) ficam de fora.
    cad_prud = [c for c in cad_prud if c.get("c6") != CONTROLE_PUBLICO]
    publicos = {c["c33"] for c in cad_ind if c.get("c6") == CONTROLE_PUBLICO and c.get("c33", "").isdigit()}
    cad_ind = [c for c in cad_ind if c.get("c6") != CONTROLE_PUBLICO]

    for cad in cad_prud:
        cat = CATEGORIA_PRUDENCIAL.get(cad.get("c3"))
        if cat:
            records.append(build(cad, cat, cols_prud, TIPO_PRUDENCIAL))
    for cad in cad_ind:
        cat = CATEGORIA_INDIVIDUAL.get(cad.get("c3"))
        if cat:
            records.append(build(cad, cat, cols_ind, TIPO_INDIVIDUAL))

    cnpj_roots = {c.get("c33", "") for c in cad_ind if (c.get("c33") or "").isdigit()}
    # Conglomerado prudencial -> CNPJs base das instituicoes que o compoem.
    conglomerados: dict[str, set[str]] = {}
    for c in cad_ind:
        nome = _clean_name(c.get("c22") or "").upper()
        if nome and (c.get("c33") or "").isdigit():
            conglomerados.setdefault(nome, set()).add(c["c33"])
    log(f"IF.data: {len(records)} instituicoes privadas ({len(publicos)} publicas removidas)")
    return records, {
        "data_base": data_base,
        "cnpj_roots": cnpj_roots,
        "cnpj_roots_publicos": publicos,
        "conglomerados": conglomerados,
    }
