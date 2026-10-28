"""One-off geocoder: resolves region and district centroids through Nominatim and caches them.

Usage: python3 scripts/build-data/geocode.py
The result (data/enrichment/geo-cache.json) is committed so the regular build never touches the network.
Respects the Nominatim usage policy: one request per second, identifying User-Agent, cached results.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import normalize as n

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "enrichment" / "geo-cache.json"
UA = "history-site-archaeology-collection/0.1 (educational project)"

REGION_QUERY = {
    "АРК": "Автономна Республіка Крим, Україна",
    "Молдова": "Молдова",
    "Київ": "Київ, Україна",
    "Воронезька": "Воронезька область, Росія",
    "Курська": "Курська область, Росія",
    "Білгородська": "Білгородська область, Росія",
}


def query(q):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1, "accept-language": "uk"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.load(resp)
    time.sleep(1.1)
    if not data:
        return None
    d = data[0]
    return {"lat": round(float(d["lat"]), 4), "lon": round(float(d["lon"]), 4), "displayName": d["display_name"]}


def main():
    records, *_ = n.normalize(ROOT / "Book6.xlsx")
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {"regions": {}, "districts": {}}
    regions = sorted({r for rec in records for r in rec["regions"]})
    for reg in regions:
        if reg in cache["regions"]:
            continue
        q = REGION_QUERY.get(reg, f"{reg} область, Україна")
        cache["regions"][reg] = query(q)
        print("region", reg, cache["regions"][reg] and cache["regions"][reg]["displayName"])
    pairs = sorted({(rec["regions"][0], rec["districts"][0]) for rec in records if len(rec["regions"]) == 1 and len(rec["districts"]) == 1})
    for reg, dist in pairs:
        key = f"{reg}|{dist}"
        if key in cache["districts"]:
            continue
        if dist in ("Київ", "Севастополь", "Дніпро"):
            q = f"{dist}, Україна"
        else:
            q = f"{dist} район, {reg} область, Україна"
        cache["districts"][key] = query(q)
        print("district", key, cache["districts"][key] and cache["districts"][key]["displayName"][:90])
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
