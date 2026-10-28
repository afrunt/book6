"""Build pipeline: Book6.xlsx + enrichment -> public/data/*.json (deterministic).

Usage: python3 scripts/build-data/build.py
Fails with a non-zero exit code when integrity checks are violated.
"""
import json
import sys
from pathlib import Path

import normalize as n

ROOT = Path(__file__).resolve().parents[2]
ENR = ROOT / "data" / "enrichment"
OUT = ROOT / "public" / "data"
PRECISION_ORDER = {"region": 0, "district": 1, "settlement": 2}
THRESHOLDS = {"periods": 3, "siteTypes": 5, "scholars": 5}


def load(name):
    return json.loads((ENR / name).read_text(encoding="utf-8"))


def dump(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(
        json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8"
    )


def resolve_geo(record, cache, overrides, region_ids, regions_cfg):
    """Pick the public map position of a record; precision never exceeds the place's allowed cap."""
    districts = record["districts"]
    regions = record["regions"]
    if not regions:
        return None
    region = regions[0]
    cap = regions_cfg.get("items", {}).get(region_ids.get(region, ""), {}).get(
        "publicPrecision", regions_cfg.get("defaultPublicPrecision", "district")
    )
    if len(districts) == 1:
        key = f"{region}|{districts[0]}"
        point = overrides.get("districts", {}).get(key) or cache["districts"].get(key)
        if point and point.get("lat") is not None:
            return {"lat": round(point["lat"], 2), "lon": round(point["lon"], 2), "precision": "district",
                    "label": f"{districts[0]} р-н, {region}", "approx": False, "cap": cap}
    point = cache["regions"].get(region)
    if not point:
        return None
    precision = "settlement" if cap == "settlement" else "region"
    return {"lat": round(point["lat"], 2), "lon": round(point["lon"], 2), "precision": precision,
            "label": region, "approx": True, "cap": cap}


def main():
    records, report, cover, periods, types = n.normalize(str(ROOT / "Book6.xlsx"))
    graph = n.build_graph(records, periods)
    sources = load("sources.json")["sources"]
    enr = {k: load(f"{k}.json") for k in ("periods", "site-types", "scholars", "expeditions", "regions")}
    cache = load("geo-cache.json")
    overrides = load("geo-overrides.json")
    region_ids = {r["name"]: r["id"] for r in graph["regions"]}

    errors, warnings = [], []
    ids = [r["id"] for r in records]
    if len(ids) != len(set(ids)):
        errors.append("record ids are not unique")
    for r in records:
        if not r["site"] or r["collectionNo"] is None:
            errors.append(f"record {r['id']} lacks site or collectionNo")

    def check_entry(kind, key, entry):
        entry_sources = list(entry.get("sources", []))
        for fact in entry.get("facts", []):
            if not fact.get("sources"):
                errors.append(f"{kind}/{key}: fact without sources")
            entry_sources += fact.get("sources", [])
        if not entry.get("sources"):
            errors.append(f"{kind}/{key}: entry without sources")
        if not entry.get("confidence"):
            errors.append(f"{kind}/{key}: entry without confidence")
        for s in entry_sources:
            if s not in sources:
                errors.append(f"{kind}/{key}: unknown source {s}")

    entity_ids = {
        "period": {p["id"] for p in graph["periods"]},
        "siteType": {t["id"] for t in graph["siteTypes"]},
        "region": {r["id"] for r in graph["regions"]},
        "scholar": {s["id"] for s in graph["scholars"]},
        "expedition": {e["id"] for e in graph["expeditions"]},
    }
    kinds = {"periods": "period", "site-types": "siteType", "scholars": "scholar", "expeditions": "expedition",
             "regions": "region"}
    for file, kind in kinds.items():
        for key, entry in enr[file]["items"].items():
            check_entry(file, key, entry)
            ph = entry.get("photo")
            if ph:
                if not all(ph.get(k) for k in ("file", "credit", "license", "url")):
                    errors.append(f"{file}/{key}: photo needs file, credit, license and url")
                elif not (ROOT / "public" / "photos" / ph["file"]).exists():
                    errors.append(f"{file}/{key}: photo file {ph['file']} is missing")
            if key not in entity_ids[kind]:
                errors.append(f"{file}/{key}: no such entity in the register")

    geo = {}
    for r in records:
        g = resolve_geo(r, cache, overrides, region_ids, enr["regions"])
        if g is None:
            continue
        if PRECISION_ORDER[g["precision"]] > PRECISION_ORDER[g["cap"]]:
            errors.append(f"record {r['id']}: precision {g['precision']} exceeds cap {g['cap']}")
        g.pop("cap")
        geo[r["id"]] = g

    below = {"periods": [], "siteTypes": [], "scholars": []}
    for p in graph["periods"]:
        if p["count"] >= THRESHOLDS["periods"] and p["id"] not in enr["periods"]["items"]:
            below["periods"].append(p["id"])
    for t in graph["siteTypes"]:
        if t["count"] >= THRESHOLDS["siteTypes"] and t["id"] not in enr["site-types"]["items"]:
            below["siteTypes"].append(t["id"])
    for s in graph["scholars"]:
        if s["count"] >= THRESHOLDS["scholars"] and s["id"] not in enr["scholars"]["items"]:
            below["scholars"].append(s["id"])
    for k, v in below.items():
        if v:
            warnings.append(f"{k} above enrichment threshold without manual card: {', '.join(v)}")

    public_records = [{k: v for k, v in r.items() if k != "raw"} for r in records]
    used = set()
    for file in enr.values():
        for entry in file["items"].values():
            used.update(entry.get("sources", []))
            for f in entry.get("facts", []):
                used.update(f.get("sources", []))
    enrichment = {
        "periods": enr["periods"]["items"], "siteTypes": enr["site-types"]["items"],
        "scholars": enr["scholars"]["items"], "expeditions": enr["expeditions"]["items"],
        "regions": enr["regions"]["items"], "sources": {k: v for k, v in sources.items() if k in used},
    }
    quality = {"recordCount": len(records), "normalization": report, "belowThreshold": below,
               "geoCoverage": f"{len(geo)}/{len(records)}", "errors": errors, "warnings": warnings}

    dump("records.json", public_records)
    dump("graph.json", graph)
    dump("geo.json", geo)
    dump("enrichment.json", enrichment)
    dump("cover.json", cover)
    dump("quality.json", quality)
    print(f"records={len(records)} geo={len(geo)} warnings={len(warnings)} errors={len(errors)}")
    for w in warnings:
        print("WARN", w)
    for e in errors:
        print("ERROR", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
