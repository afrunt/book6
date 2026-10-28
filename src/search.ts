import MiniSearch from 'minisearch';
import type { Data, RecordItem } from './data';
import { periodLabel } from './discovery';

export interface Filters { q: string; period: string; region: string; type: string; author: string }
export const emptyFilters: Filters = { q: '', period: '', region: '', type: '', author: '' };

export function buildIndex(data: Data): MiniSearch<RecordItem & { periodText: string; authorText: string }> {
  const ms = new MiniSearch<RecordItem & { periodText: string; authorText: string }>({
    fields: ['site', 'datingText', 'periodText', 'authorText', 'expedition', 'notes', 'siteTypeText', 'regionText', 'districtText'],
    idField: 'id',
    extractField: (doc, field) => {
      if (field === 'regionText') return doc.regions.join(' ');
      if (field === 'districtText') return doc.districts.join(' ');
      return ((doc as unknown as Record<string, unknown>)[field] as string) ?? '';
    },
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { site: 3, authorText: 2 } },
  });
  ms.addAll(data.records.map((r) => ({ ...r, periodText: r.periods.map((p) => periodLabel(data, p)).join(' '), authorText: r.authors.join(' ') })));
  return ms;
}

export function applyFilters(data: Data, index: ReturnType<typeof buildIndex>, f: Filters): RecordItem[] {
  const q = f.q.trim();
  const byNumber = q.match(/^(?:№|no\.?|n)?\s*(\d{2,})$/i);
  let list: RecordItem[];
  if (q) {
    const found = index.search(q).map((h) => data.byId.get(String(h.id))!).filter(Boolean).sort((a, b) => a.collectionNo - b.collectionNo);
    if (byNumber) {
      // collection numbers first (exact, then prefix), then ordinary text matches such as research years
      const n = byNumber[1];
      const nums = data.records.filter((r) => String(r.collectionNo).startsWith(n)).sort((a, b) => Number(String(b.collectionNo) === n) - Number(String(a.collectionNo) === n) || a.collectionNo - b.collectionNo);
      const seen = new Set(nums.map((r) => r.id));
      list = [...nums, ...found.filter((r) => !seen.has(r.id))];
    } else list = found;
  } else list = [...data.records].sort((a, b) => a.collectionNo - b.collectionNo);
  if (f.period) list = list.filter((r) => r.periods.includes(f.period));
  if (f.region) list = list.filter((r) => r.regions.includes(f.region));
  if (f.type) list = list.filter((r) => r.siteTypes.includes(f.type));
  if (f.author) list = list.filter((r) => r.authors.includes(f.author));
  return list;
}

export function filtersFromHash(query: string): Filters {
  const p = new URLSearchParams(query);
  return { q: p.get('q') ?? '', period: p.get('period') ?? '', region: p.get('region') ?? '', type: p.get('type') ?? '', author: p.get('author') ?? '' };
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  (Object.keys(f) as (keyof Filters)[]).forEach((k) => f[k] && p.set(k, f[k]));
  return p.toString();
}
