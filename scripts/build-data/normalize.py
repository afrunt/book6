"""Normalization of Book6.xlsx rows into typed records and an entity graph."""
import json
import re
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAPPINGS = ROOT / "data" / "mappings"

UK_LAT = {
    "а": "a", "б": "b", "в": "v", "г": "h", "ґ": "g", "д": "d", "е": "e", "є": "ye", "ж": "zh",
    "з": "z", "и": "y", "і": "i", "ї": "yi", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n",
    "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ь": "", "ю": "yu", "я": "ya", "ъ": "", "ы": "y", "э": "e",
    "ё": "yo", "'": "", "ʼ": "", "’": "",
}


def slug(text):
    out = "".join(UK_LAT.get(ch, ch) for ch in text.lower())
    return re.sub(r"[^a-z0-9]+", "-", out).strip("-")


def clean(value):
    """Return a trimmed single-spaced string, or None for empty / placeholder cells."""
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).replace("\xa0", " ")).strip()
    if text in ("", "-", "-//-", "—"):
        return None
    return text


def load_json(name):
    return json.loads((MAPPINGS / name).read_text(encoding="utf-8"))


def split_list(text, seps=r"[;,]"):
    if not text:
        return []
    return [p.strip() for p in re.split(seps, text) if p.strip()]


def normalize_apostrophes(text):
    return text.replace("’", "ʼ").replace("'", "ʼ")


def normalize_person(name, aliases):
    name = normalize_apostrophes(re.sub(r"\s+", " ", name.replace("\xa0", " ")).strip())
    name = re.sub(r"\b([А-ЯІЇЄҐA-Z])\.\s+(?=[А-ЯІЇЄҐA-Z]\.)", r"\1.", name)
    name = re.sub(r"\.\s*$", ".", name)
    return aliases.get(name, name)


def split_authors(text, aliases):
    """Authors are comma-separated; 'Surname I.I.' tokens never contain a comma themselves."""
    if not text:
        return []
    people = []
    for part in re.split(r",", text):
        part = part.strip()
        if part:
            people.append(normalize_person(part, aliases))
    return people


def parse_years(text):
    """Return (first, last, list) of research years from strings like '1990-1997, 2004'."""
    if not text:
        return None, None, []
    years = set()
    for token in re.findall(r"\d{4}(?:\s*-\s*\d{4})?", str(text)):
        if "-" in token:
            a, b = [int(x) for x in re.split(r"\s*-\s*", token)]
            if 1800 <= a <= b <= 2100:
                years.update(range(a, b + 1))
        else:
            n = int(token)
            if 1800 <= n <= 2100:
                years.add(n)
    if not years:
        return None, None, []
    ordered = sorted(years)
    return ordered[0], ordered[-1], ordered


def parse_date(value):
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    text = clean(value)
    if not text:
        return None
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{2,4})", text)
    if m:
        d, mth, y = m.groups()
        y = int(y)
        y = y + (2000 if y < 50 else 1900) if y < 100 else y
        try:
            return date(y, int(mth), int(d)).isoformat()
        except ValueError:
            return None
    return None


ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(text):
    total = 0
    prev = 0
    for ch in reversed(text):
        v = ROMAN.get(ch, 0)
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


class PeriodMapper:
    def __init__(self):
        data = load_json("periods.json")
        self.periods = data["periods"]
        self.century_rules = data["century_rules"]
        self.other = data["other"]
        self.ignore = [re.compile(x) for x in data.get("ignore", [])]
        self.compiled = [(p["id"], [re.compile(x) for x in p["patterns"]]) for p in self.periods]

    def map_token(self, token):
        t = normalize_apostrophes(token.lower().strip().rstrip(".?"))
        ids = []
        for pid, regs in self.compiled:
            if any(r.search(t) for r in regs):
                ids.append(pid)
        if ids:
            # specific cultures win over the generic "bronze" bucket for the same token
            if len(ids) > 1 and "bronze" in ids and any(i in ids for i in ("yamna", "catacomb", "srubna")):
                ids.remove("bronze")
            return ids
        m = re.findall(r"([IVX]+)\s*(?:-\s*([IVX]+))?\s*(?:ст|тис)", token.replace("\xa0", " "))
        if m:
            bce = "до н.е" in token or "до н. е" in token
            out = []
            for a, b in m:
                lo, hi = roman(a), roman(b) if b else roman(a)
                for c in {lo, hi}:
                    for rule in self.century_rules:
                        if rule["bce"] == bce and rule["from"] <= c <= rule["to"]:
                            out.append(rule["period"])
            return list(dict.fromkeys(out))
        return []

    def map_text(self, text):
        """Return (period ids, unmapped tokens)."""
        if not text:
            return [], []
        found, unmapped = [], []
        # century lists like "XII-XIII, XVII-XVIII ст." share one trailing "ст.": handle whole text first
        tokens = re.split(r"[;,]|(?<=\d)\.\s", text)
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            ids = self.map_token(tok)
            if not ids and re.fullmatch(r"[IVX]+(\s*-\s*[IVX]+)?", tok):
                ids = self.map_token(tok + " ст.")
            if ids:
                found.extend(ids)
            elif re.fullmatch(r"[\d\s,.]+", tok) or tok in ("-",) or any(r.search(normalize_apostrophes(tok.lower())) for r in self.ignore):
                continue
            else:
                unmapped.append(tok)
        return list(dict.fromkeys(found)), unmapped

    def label(self, pid):
        for p in self.periods:
            if p["id"] == pid:
                return p["label"]
        return self.other["label"]


class SiteTypeMapper:
    def __init__(self):
        data = load_json("site-types.json")
        self.types = data["types"]
        self.compiled = [(t["id"], [re.compile(x) for x in t["patterns"]]) for t in self.types]

    def map_text(self, text):
        if not text:
            return []
        t = text.lower().strip()
        ids = [tid for tid, regs in self.compiled if any(r.search(t) for r in regs)]
        if "kurgan" in ids and "kurgan-cemetery" in ids:
            ids.remove("kurgan")
        return list(dict.fromkeys(ids)) or ["other"]


def split_regions(text, cfg):
    text = clean(text)
    if not text:
        return []
    if text in cfg["aliases"]:
        return cfg["aliases"][text]
    parts = [p.strip() for p in re.split(r",", text) if p.strip()]
    out = []
    for p in parts:
        p = re.sub(r"\s*обл\..*$", "", p)
        if p in cfg["regions"]:
            out.append(p)
    return out


def split_districts(text):
    text = clean(text)
    if not text:
        return []
    return [normalize_apostrophes(p.strip()) for p in text.split(",") if p.strip()]


def read_rows(xlsx_path):
    import openpyxl

    wb = openpyxl.load_workbook(xlsx_path, read_only=False, data_only=True)
    ws = wb["Book 6"]
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    cover = []
    if "Нетабличний текст" in wb.sheetnames:
        cover = [r[0] for r in wb["Нетабличний текст"].iter_rows(values_only=True)][1:]
    return header, rows[1:], [c for c in cover if c]


def normalize(xlsx_path):
    header, rows, cover = read_rows(xlsx_path)
    regions_cfg = load_json("oblasts.json")
    people_cfg = load_json("people.json")
    periods = PeriodMapper()
    types = SiteTypeMapper()

    records, report = [], defaultdict(list)
    ordinals = defaultdict(int)
    prev_site = None
    for idx, row in enumerate(rows):
        row = list(row) + [None] * (19 - len(row))
        site = clean(row[2])
        if site is None and row[2] is not None and str(row[2]).strip() == "-//-":
            site = prev_site  # ditto mark: same site as the row above
        prev_site = site
        col_no = row[1]
        if not site or col_no is None:
            raise ValueError(f"Row {idx + 2}: missing site or collection number")
        col_no = int(col_no)
        ordinals[col_no] += 1
        rid = f"{col_no}-{ordinals[col_no]}"

        regions = split_regions(row[9], regions_cfg)
        if row[9] and not regions:
            report["unmapped_regions"].append((rid, str(row[9])))
        districts = split_districts(row[8])
        if clean(row[9]) == "Канівський" and "Канівський" not in districts:
            districts = ["Канівський"] + districts
        if not regions:
            report["no_region"].append(rid)

        period_ids, unmapped = periods.map_text(clean(row[15]))
        for u in unmapped:
            report["unmapped_periods"].append((rid, u))
        y1, y2, years = parse_years(clean(row[13]))
        if clean(row[13]) and not years:
            report["unparsed_years"].append((rid, str(row[13])))

        authors = split_authors(clean(row[10]), people_cfg["authors"])
        expedition = clean(row[11])

        raw = {str(h): (v.isoformat() if isinstance(v, (datetime, date)) else v) for h, v in zip(header, row)}
        rec = {
            "id": rid,
            "collectionNo": col_no,
            "site": site,
            "section": clean(row[3]),
            "actNo": clean(row[4]),
            "receivedAt": parse_date(row[5]),
            "boxes": clean(row[6]),
            "units": clean(row[7]),
            "regions": regions,
            "districts": districts,
            "periods": period_ids,
            "datingText": clean(row[15]),
            "siteTypes": types.map_text(clean(row[14])),
            "siteTypeText": clean(row[14]),
            "researchTypes": [normalize_apostrophes(x) for x in split_list(clean(row[12]))],
            "yearFirst": y1,
            "yearLast": y2,
            "yearsText": clean(row[13]),
            "authors": authors,
            "expedition": expedition,
            "notes": clean(row[17]),
            "attachments": clean(row[16]),
            "pdfPage": clean(row[0]),
            "scanRef": clean(row[18]),
            "raw": raw,
        }
        records.append(rec)

    return records, dict(report), cover, periods, types


def build_graph(records, periods):
    """Entity graph keyed by stable ids, with record counts and cross-links."""
    scholars, expeditions, regions, districts, period_nodes, type_nodes = (
        defaultdict(lambda: {"records": [], "expeditions": set(), "periods": set(), "regions": set(), "years": set()})
        for _ in range(6)
    )
    for r in records:
        for a in r["authors"]:
            s = scholars[a]
            s["records"].append(r["id"])
            if r["expedition"]:
                s["expeditions"].add(r["expedition"])
            s["periods"].update(r["periods"])
            s["regions"].update(r["regions"])
            if r["yearFirst"]:
                s["years"].update(range(r["yearFirst"], (r["yearLast"] or r["yearFirst"]) + 1))
        if r["expedition"]:
            e = expeditions[r["expedition"]]
            e["records"].append(r["id"])
            e["periods"].update(r["periods"])
            e["regions"].update(r["regions"])
            e["scholars"] = e.get("scholars", set()) | set(r["authors"])
            if r["yearFirst"]:
                e["years"].update(range(r["yearFirst"], (r["yearLast"] or r["yearFirst"]) + 1))
        for reg in r["regions"]:
            regions[reg]["records"].append(r["id"])
            regions[reg]["periods"].update(r["periods"])
        for d in r["districts"]:
            key = f"{(r['regions'] or ['?'])[0]}|{d}"
            districts[key]["records"].append(r["id"])
        for p in r["periods"] or ["other"]:
            period_nodes[p]["records"].append(r["id"])
        for t in r["siteTypes"]:
            type_nodes[t]["records"].append(r["id"])

    def ser(d, label_key="name", extra=None):
        out = []
        for key in sorted(d):
            v = d[key]
            item = {"id": slug(key) if label_key == "name" else key, label_key: key, "count": len(v["records"]), "records": v["records"]}
            for f in ("expeditions", "periods", "regions", "scholars"):
                if f in v:
                    item[f] = sorted(v[f])
            if v.get("years"):
                item["yearFirst"], item["yearLast"] = min(v["years"]), max(v["years"])
            if extra:
                item.update(extra(key))
            out.append(item)
        return out

    return {
        "scholars": ser(scholars),
        "expeditions": ser(expeditions),
        "regions": ser(regions),
        "periods": [
            {"id": pid, "label": periods.label(pid), "count": len(v["records"]), "records": v["records"],
             **{k: next((p[k] for p in periods.periods if p["id"] == pid), None) for k in ("start", "end")}}
            for pid, v in sorted(period_nodes.items(), key=lambda kv: next((i for i, p in enumerate(periods.periods) if p["id"] == kv[0]), 999))
        ],
        "siteTypes": [{"id": k, "count": len(v["records"]), "records": v["records"]} for k, v in sorted(type_nodes.items())],
    }
