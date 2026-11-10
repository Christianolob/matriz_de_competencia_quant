"""Helpers shared by the data sources: cached downloads, name cleanup, links."""

from __future__ import annotations

import json
import re
import shutil
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent  # empresas_quant/
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"

USER_AGENT = "Mozilla/5.0 (compatible; empresas-quant-collector/1.0)"
DEFAULT_MAX_AGE_DAYS = 7


def log(msg: str) -> None:
    print(f"  {msg}")
    sys.stdout.flush()


def fetch(
    url: str,
    name: str,
    *,
    refresh: bool = False,
    max_age_days: float | None = DEFAULT_MAX_AGE_DAYS,
    timeout: int = 300,
) -> Path:
    """Download `url` into data/cache/<name>, reusing a fresh cached copy.

    max_age_days=None means the file never expires (immutable snapshots).
    If the download fails but an older cached copy exists, that copy is used.
    """
    dest = CACHE_DIR / name
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and not refresh:
        if max_age_days is None:
            return dest
        age_days = (time.time() - dest.stat().st_mtime) / 86400
        if age_days < max_age_days:
            return dest

    tmp = dest.with_suffix(dest.suffix + ".part")
    log(f"baixando {url}")
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=timeout) as resp, open(tmp, "wb") as fh:
            shutil.copyfileobj(resp, fh)
        tmp.replace(dest)
    except Exception as err:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        if dest.exists():
            log(f"[aviso] download falhou ({err}); usando cache antigo de {dest.name}")
            return dest
        raise
    return dest


def fetch_json(url: str, name: str, **kwargs):
    """fetch() + json.load; a non-JSON body (error page) evicts the cache file."""
    path = fetch(url, name, **kwargs)
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        path.unlink(missing_ok=True)
        raise RuntimeError(f"resposta invalida de {url}: {err}") from err


def strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )


def norm(text: str) -> str:
    return strip_accents(text or "").strip().lower()


_SUFFIXES = re.compile(
    r"\b("
    r"S\.?/?A\.?|LTDA\.?|S/A|EIRELI|"
    r"GEST(AO|ÃO) DE (RECURSOS|INVESTIMENTOS|ATIVOS)|GESTORA DE RECURSOS|"
    r"ADMINISTRA(CAO|ÇÃO|DORA) DE RECURSOS|ASSET MANAGEMENT|INVESTIMENTOS|"
    r"INSTITUI(CAO|ÇÃO) DE PAGAMENTO|"
    r"CORRETORA DE (CAMBIO|CÂMBIO|T[IÍ]TULOS E VALORES MOBILI[AÁ]RIOS)|"
    r"DISTRIBUIDORA DE T[IÍ]TULOS E VALORES MOBILI[AÁ]RIOS|"
    r"CCTVM|CTVM|DTVM|CVC|PRUDENCIAL"
    r")\b",
    re.IGNORECASE,
)


_GENERIC_START = re.compile(
    r"\s(GEST[AÃ]O|GESTORA|ADMINISTRA\w*|CONSULTORIA|CORRETORA|DISTRIBUIDORA|"
    r"INSTITUI\w*|ADQUIR\w*|SERVI\w*|INTERNET|PARTICIPA\w*|SOCIEDADE|"
    r"CR[EÉ]DITO|FINANCIAMENTO|E|DE|DO|DA)\b.*$",
    re.IGNORECASE,
)


def short_name(name: str) -> str:
    """Rough brand name for search links: 'KAPITALO INVESTIMENTOS LTDA.' -> 'KAPITALO'."""
    s = re.sub(r"\s+-\s+.*$", "", name)  # 'NU PAGAMENTOS S.A. - INSTITUICAO...' -> 'NU PAGAMENTOS S.A.'
    s = _SUFFIXES.sub(" ", s)
    s = re.sub(r"[,./()]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = _GENERIC_START.sub("", s).strip()
    if s.upper().startswith("BANCO ") and len(s.split()) > 1:
        s = s[6:]
    return s or name


def search_links(name: str) -> dict:
    brand = short_name(name)
    return {
        "linkedin": "https://www.linkedin.com/jobs/search/?keywords="
        + quote(f"{brand} quant")
        + "&location=Brasil",
        "google": "https://www.google.com/search?q=" + quote(f"{brand} trabalhe conosco vagas"),
    }


def format_cnpj(digits: str) -> str:
    d = re.sub(r"\D", "", digits or "")
    if len(d) != 14:
        return d
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
