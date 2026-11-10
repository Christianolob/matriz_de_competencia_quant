"""CVM Dados Abertos - gestoras de fundos (proxy para hedge funds).

Fonte: https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip
  registro_classe.csv  -> classes (Classificacao, Situacao, PL, Exclusivo, FIC...)
  registro_fundo.csv   -> fundo -> gestor (CNPJ + nome)

Agrega, por gestor (pessoa juridica), o PL das classes "Em Funcionamento Normal"
que NAO sao FIC (Classe_Cotas=S, evita dupla contagem master/feeder) nem
exclusivas (mandatos de previdencia/family office). Gestoras de instituicoes
publicas (CNPJ de instituicao com controle publico no BCB, ex.: BB DTVM,
Caixa DTVM) ficam de fora.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import Counter, defaultdict

from common import fetch, format_cnpj, log, search_links

URL = "https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip"

CLASSIFICACAO_CATEGORIA = {
    "Multimercado": "gestora_multimercado",
    "Ações": "gestora_acoes",
}

# Gestoras ligadas a bancos/fundacoes: marcadas como nao-independentes.
LIGADA_RE = re.compile(
    r"\b(BANCO|BCO|ITAU|ITAÚ|BRADESCO|SANTANDER|CAIXA|BB |BTG|SAFRA|XP |UBS|"
    r"J\.?\s?P\.? MORGAN|CREDIT SUISSE|SICREDI|SICOOB|FUNDA[CÇ][AÃ]O|PREVID[EÊ]NCIA|"
    r"SEGURIDADE|DTVM|CCTVM|CTVM|CORRETORA)\b",
    re.IGNORECASE,
)

# Family offices / multi family offices: gestoras cujo PL e majoritariamente de
# classes EXCLUSIVAS (fundo de um unico cotista = carteira de uma familia).
# Heuristica: >= FO_MIN_SHARE do PL em classes exclusivas e >= FO_MIN_PL, sem
# ser banco, fundacao/previdencia, seguradora ou instituicao do BCB.
FO_MIN_SHARE = 0.7
FO_MIN_PL = 500e6
NAO_FO_RE = re.compile(
    r"\b(PREV\w*|FUNDO MULTIPATROCINADO|SEGUR\w*|RESSEGUR\w*|IRB|VIDA|"
    r"MORGAN STANLEY|MERRILL|CITI\w*|BNP|RABOBANK|CHARLES RIVER|ADVISORY)\b",
    re.IGNORECASE,
)


def _reader(zf: zipfile.ZipFile, name: str):
    return csv.DictReader(io.TextIOWrapper(zf.open(name), encoding="latin-1"), delimiter=";")


def _float(v: str) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def collect(
    refresh: bool = False,
    cnpj_roots: set[str] | None = None,
    cnpj_roots_publicos: set[str] | None = None,
) -> tuple[list[dict], dict]:
    path = fetch(URL, "cvm/registro_fundo_classe.zip", refresh=refresh)
    cnpj_roots = cnpj_roots or set()
    publicos = cnpj_roots_publicos or set()

    with zipfile.ZipFile(path) as zf:
        fundos = {
            r["ID_Registro_Fundo"]: r
            for r in _reader(zf, "registro_fundo.csv")
            if r.get("Tipo_Pessoa_Gestor") == "PJ" and r.get("CPF_CNPJ_Gestor")
        }
        agg: dict[tuple[str, str], dict] = defaultdict(
            lambda: {"pl": 0.0, "n": 0, "nome": "", "estrategias": Counter()}
        )
        datas = Counter()
        # Por gestor, todas as classificacoes: PL total e PL exclusivo (family office).
        fo: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "excl": 0.0, "n": 0, "nome": ""})
        for r in _reader(zf, "registro_classe.csv"):
            if r.get("Situacao") != "Em Funcionamento Normal" or r.get("Classe_Cotas") == "S":
                continue
            fundo = fundos.get(r["ID_Registro_Fundo"])
            if not fundo:
                continue
            pl = _float(r.get("Patrimonio_Liquido"))
            f = fo[fundo["CPF_CNPJ_Gestor"]]
            f["total"] += pl
            f["nome"] = fundo["Gestor"].strip()
            if r.get("Exclusivo") == "S":
                f["excl"] += pl
                f["n"] += 1
            cat = CLASSIFICACAO_CATEGORIA.get(r.get("Classificacao", ""))
            if not cat or r.get("Exclusivo") == "S":
                continue
            a = agg[(cat, fundo["CPF_CNPJ_Gestor"])]
            a["pl"] += pl
            a["n"] += 1
            a["nome"] = fundo["Gestor"].strip()
            a["estrategias"][r.get("Classificacao_Anbima") or "?"] += max(pl, 0)
            if r.get("Data_Patrimonio_Liquido"):
                datas[r["Data_Patrimonio_Liquido"]] += 1

    data_base = datas.most_common(1)[0][0] if datas else ""
    records = []
    for (cat, cnpj), a in agg.items():
        if a["pl"] <= 0 or cnpj[:8] in publicos:
            continue
        ligada = cnpj[:8] in cnpj_roots or bool(LIGADA_RE.search(a["nome"]))
        estrategia = a["estrategias"].most_common(1)[0][0] if a["estrategias"] else ""
        records.append(
            {
                "id": f"cvm-{cat}-{cnpj}",
                "nome": a["nome"],
                "categoria": cat,
                "fonte": "CVM",
                "valor": a["pl"],
                "valor_tipo": "PL (classes nao exclusivas)",
                "n_fundos": a["n"],
                "estrategia": estrategia,
                "independente": not ligada,
                "cnpj": format_cnpj(cnpj),
                "data_base": data_base,
                "links": search_links(a["nome"]),
            }
        )
    n_fo = 0
    for cnpj, f in fo.items():
        if f["excl"] < FO_MIN_PL or f["excl"] < FO_MIN_SHARE * f["total"]:
            continue
        if cnpj[:8] in publicos or cnpj[:8] in cnpj_roots:
            continue
        if LIGADA_RE.search(f["nome"]) or NAO_FO_RE.search(f["nome"]):
            continue
        n_fo += 1
        records.append(
            {
                "id": f"cvm-family_office-{cnpj}",
                "nome": f["nome"],
                "categoria": "family_office",
                "fonte": "CVM",
                "valor": f["excl"],
                "valor_tipo": "PL em classes exclusivas",
                "n_fundos": f["n"],
                "estrategia": f"{f['excl'] / f['total']:.0%} do PL em fundos exclusivos",
                "independente": True,
                "cnpj": format_cnpj(cnpj),
                "data_base": data_base,
                "links": search_links(f["nome"]),
            }
        )
    log(f"CVM: {len(records)} registros, {n_fo} family offices (data-base PL {data_base})")
    return records, {"data_base": data_base}
