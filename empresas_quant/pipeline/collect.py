"""Coleta empresas brasileiras com trabalho quantitativo e gera data/empresas.json.

Uso:
    py pipeline/collect.py            # usa cache de ate 7 dias
    py pipeline/collect.py --refresh  # forca novo download

Cada fonte roda isolada: se uma falhar, as outras ainda entram no JSON e o
erro aparece em meta.erros (exibido como aviso no frontend).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import traceback
from collections import defaultdict
from datetime import datetime

from common import DATA_DIR, log, search_links
from sources import bcb_ifdata, cvm_fundos, manual

OUTPUT = DATA_DIR / "empresas.json"
EXCLUIR_GRUPOS = DATA_DIR / "excluir_grupos.csv"
AGRUPAR_COOPERATIVAS = DATA_DIR / "agrupar_cooperativas.csv"

# Ordem de exibicao das categorias.
CATEGORIAS = {
    "banco": "Bancos",
    "pagamentos": "Instituições de pagamento",
    "gestora_multimercado": "Hedge funds (multimercado)",
    "gestora_acoes": "Gestoras de ações",
    "corretora_dtvm": "Corretoras / DTVM",
    "family_office": "Family offices / MFO",
    "credito_nao_bancario": "Financeiras / SCD / fintechs de crédito",
    "infraestrutura": "Infraestrutura de mercado",
    "fintech": "Fintechs / tech",
    "seguradora": "Seguradoras",
    "dados_credito": "Bureaus / dados de crédito",
    "cooperativa": "Cooperativas de crédito",
    "outros": "Outros",
}

# Recomendacao de onde aplicar: quantas empresas (as maiores) cada categoria
# mostra no modo "padrão" do frontend (ausente = todas). Aparece no painel
# "Recomendação" da tela. O JSON guarda todas; o corte é só na exibição.
LIMITES = {
    "banco": 45,
    "pagamentos": 35,
    "gestora_multimercado": 40,
    "gestora_acoes": 45,
    "corretora_dtvm": 20,
    "family_office": 20,
    "credito_nao_bancario": 10,
    "cooperativa": 3,
}


def run_source(name, fn, erros, **kwargs):
    print(f"[{name}]")
    try:
        return fn(**kwargs)
    except Exception as err:  # noqa: BLE001
        traceback.print_exc()
        erros.append(f"{name}: {err}")
        return [], {}


def aplicar_exclusoes(empresas: list[dict], conglomerados: dict[str, set[str]]):
    """Remove empresas de grupos listados em data/excluir_grupos.csv.

    Uma empresa sai se: pertence ao conglomerado prudencial do BCB indicado
    (ou e o proprio conglomerado), tem CNPJ base de uma instituicao desse
    conglomerado (pega gestoras na CVM) ou o nome bate com regex_nome.
    """
    if not EXCLUIR_GRUPOS.exists():
        return empresas, {}
    with open(EXCLUIR_GRUPOS, encoding="utf-8", newline="") as fh:
        grupos = [g for g in csv.DictReader(fh) if (g.get("grupo") or "").strip()]

    removidas: dict[str, int] = {}
    for g in grupos:
        congl = (g.get("conglomerado_bcb") or "").strip().upper()
        roots = conglomerados.get(congl, set()) if congl else set()
        rx = re.compile(g["regex_nome"], re.IGNORECASE) if (g.get("regex_nome") or "").strip() else None

        def pertence(e: dict) -> bool:
            if congl and e["fonte"] == "BCB IF.data":
                if (e.get("conglomerado") or "").upper() == congl:
                    return True
                if e["id"].startswith(f"bcb-{bcb_ifdata.TIPO_PRUDENCIAL}-") and e["nome"].upper() == congl:
                    return True
            if re.sub(r"\D", "", e.get("cnpj") or "")[:8] in roots:
                return True
            return bool(rx and rx.search(e["nome"]))

        fora = [e for e in empresas if pertence(e)]
        empresas = [e for e in empresas if not pertence(e)]
        removidas[g["grupo"]] = len(fora)
        log(f"excluido grupo {g['grupo']}: {len(fora)} empresas")
        for e in fora:
            log(f"    - {e['nome']} ({e['categoria']})")
    return empresas, removidas


def agrupar_cooperativas(empresas: list[dict]):
    """Junta as cooperativas de uma rede (ex.: Sicoob) numa linha so.

    Para cada linha de data/agrupar_cooperativas.csv, as cooperativas cujo nome
    bate com regex_nome saem da lista e entra uma unica empresa com o nome da
    rede, valor da maior cooperativa e id estavel (coop-rede-<slug>), para que
    marcacoes de "aplicado" sobrevivam entre coletas.
    """
    if not AGRUPAR_COOPERATIVAS.exists():
        return empresas, {}
    with open(AGRUPAR_COOPERATIVAS, encoding="utf-8", newline="") as fh:
        redes = [r for r in csv.DictReader(fh) if (r.get("rede") or "").strip() and (r.get("regex_nome") or "").strip()]

    agrupadas: dict[str, int] = {}
    for r in redes:
        rede = r["rede"].strip()
        rx = re.compile(r["regex_nome"], re.IGNORECASE)
        membros = [e for e in empresas if e["categoria"] == "cooperativa" and rx.search(e["nome"])]
        if not membros:
            continue
        maior = max(membros, key=lambda e: e.get("valor") or 0)
        ids = {e["id"] for e in membros}
        empresas = [e for e in empresas if e["id"] not in ids]
        slug = re.sub(r"[^a-z0-9]+", "-", rede.lower()).strip("-")
        empresas.append(
            {
                **maior,
                "id": f"coop-rede-{slug}",
                "nome": rede.upper(),
                "cnpj": "",
                "uf": "",
                "cidade": "",
                "subtipo": "Sistema de cooperativas",
                "observacao": f"{len(membros)} cooperativas agrupadas; valor da maior ({maior['nome']})",
                "links": search_links(rede),
            }
        )
        agrupadas[rede] = len(membros)
        log(f"agrupada rede {rede}: {len(membros)} cooperativas -> 1")
    return empresas, agrupadas


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="ignora o cache e baixa tudo de novo")
    args = parser.parse_args(argv)

    erros: list[str] = []
    bcb, bcb_meta = run_source("BCB IF.data", bcb_ifdata.collect, erros, refresh=args.refresh)
    cvm, cvm_meta = run_source(
        "CVM fundos",
        cvm_fundos.collect,
        erros,
        refresh=args.refresh,
        cnpj_roots=bcb_meta.get("cnpj_roots"),
        cnpj_roots_publicos=bcb_meta.get("cnpj_roots_publicos"),
    )
    man, _ = run_source("Curadoria", manual.collect, erros, refresh=args.refresh)

    if "cnpj_roots_publicos" not in bcb_meta:
        erros.append("CVM: sem dados do BCB, gestoras de instituicoes publicas podem aparecer")
    print("[Exclusoes]")
    empresas, exclusoes = aplicar_exclusoes(bcb + cvm + man, bcb_meta.get("conglomerados", {}))
    empresas, agrupadas = agrupar_cooperativas(empresas)
    if not empresas:
        print("[ERRO] nenhuma fonte retornou dados:", *erros, sep="\n  ", file=sys.stderr)
        return 1

    # Rank dentro de cada categoria (maior valor primeiro; sem valor vai pro fim).
    por_cat = defaultdict(list)
    for e in empresas:
        por_cat[e["categoria"]].append(e)
    for lista in por_cat.values():
        lista.sort(key=lambda e: (e.get("valor") is None, -(e.get("valor") or 0), e["nome"]))
        for i, e in enumerate(lista, 1):
            e["rank"] = i
    empresas = [e for cat in CATEGORIAS for e in por_cat.pop(cat, [])] + [
        e for lista in por_cat.values() for e in lista
    ]

    payload = {
        "meta": {
            "gerado_em": datetime.now().isoformat(timespec="seconds"),
            "data_base_bcb": bcb_meta.get("data_base", ""),
            "data_base_cvm": cvm_meta.get("data_base", ""),
            "categorias": CATEGORIAS,
            "limites": LIMITES,
            "exclusoes": exclusoes,
            "cooperativas_agrupadas": agrupadas,
            "erros": erros,
        },
        "empresas": empresas,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".json.part")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(OUTPUT)

    print()
    counts = defaultdict(int)
    for e in empresas:
        counts[e["categoria"]] += 1
    for cat, n in counts.items():
        log(f"{CATEGORIAS.get(cat, cat):45s} {n:5d}")
    log(f"-> {OUTPUT}")
    if erros:
        print("[AVISO] fontes com erro:", *erros, sep="\n  ")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
