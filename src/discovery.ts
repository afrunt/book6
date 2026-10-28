import type { Data, Entity, RecordItem } from './data';

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function entityName(e: Entity): string { return e.name ?? e.label ?? e.id; }

export function periodLabel(data: Data, id: string): string {
  return data.enrichment.periods[id]?.title ?? data.graph.periods.find((p) => p.id === id)?.label ?? id;
}

/** Records sharing a period, region or author with the given one, most-shared first. */
export function relatedRecords(data: Data, rec: RecordItem, limit = 6): RecordItem[] {
  const scored: [number, RecordItem][] = [];
  for (const o of data.records) {
    if (o.id === rec.id) continue;
    const score =
      rec.periods.filter((p) => o.periods.includes(p)).length * 2 +
      rec.regions.filter((r) => o.regions.includes(r)).length +
      rec.authors.filter((a) => o.authors.includes(a)).length * 3 +
      (rec.site === o.site ? 4 : 0);
    if (score > 0) scored.push([score, o]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].collectionNo - b[1].collectionNo);
  return scored.slice(0, limit).map((s) => s[1]);
}
