"""Lista curada em data/manual.csv (empresas fora das bases do BCB/CVM)."""

from __future__ import annotations

import csv
import re

from common import DATA_DIR, log, search_links

PATH = DATA_DIR / "manual.csv"


def collect(refresh: bool = False) -> tuple[list[dict], dict]:  # noqa: ARG001
    records = []
    with open(PATH, encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            nome = (row.get("nome") or "").strip()
            if not nome or nome.startswith("#"):
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-")
            records.append(
                {
                    "id": f"manual-{slug}",
                    "nome": nome,
                    "categoria": (row.get("categoria") or "outros").strip(),
                    "fonte": "Curadoria",
                    "valor": None,
                    "valor_tipo": "",
                    "site": (row.get("site") or "").strip(),
                    "observacao": (row.get("observacao") or "").strip(),
                    "links": search_links(nome),
                }
            )
    log(f"manual.csv: {len(records)} empresas")
    return records, {}
