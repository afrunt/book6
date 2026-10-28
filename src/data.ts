import { makeNames, type CardText, type I18n, type Lang, type Names } from './i18n';

export interface RecordItem {
  id: string; collectionNo: number; site: string; actNo: string | null; receivedAt: string | null;
  boxes: string | null; units: string | null; regions: string[]; districts: string[]; periods: string[];
  datingText: string | null; siteTypes: string[]; siteTypeText: string | null; researchTypes: string[];
  yearFirst: number | null; yearLast: number | null; yearsText: string | null; authors: string[];
  expedition: string | null; notes: string | null; attachments: string | null; scanRef: string | null; pdfPage: string | null;
}
export interface Entity {
  id: string; name?: string; label?: string; count: number; records: string[];
  periods?: string[]; regions?: string[]; scholars?: string[]; expeditions?: string[];
  yearFirst?: number; yearLast?: number; start?: number; end?: number;
}
export interface Graph { scholars: Entity[]; expeditions: Entity[]; regions: Entity[]; periods: Entity[]; siteTypes: Entity[] }
export interface Fact { text: string; sources: string[] }
export interface Card {
  title?: string; dating?: string; summary?: string; fullName?: string; years?: string | null; bio?: string;
  facts?: Fact[]; artifacts?: string[]; fields?: string[]; photo?: { file: string; credit: string; license: string; url: string };
  noData?: boolean; sources: string[]; confidence: 'high' | 'medium' | 'low';
}
export interface Source { title: string; url: string; license: string }
export interface Enrichment {
  periods: Record<string, Card>; siteTypes: Record<string, Card>; scholars: Record<string, Card>;
  expeditions: Record<string, Card>; regions: Record<string, Card>; sources: Record<string, Source>;
}
export interface GeoPoint { lat: number; lon: number; precision: 'region' | 'district' | 'settlement'; label: string; approx: boolean }

export interface Data {
  lang: Lang; names: Names;
  records: RecordItem[]; byId: Map<string, RecordItem>; graph: Graph; enrichment: Enrichment;
  geo: Record<string, GeoPoint>; cover: string[];
  siteTypeLabels: Record<string, string>;
}

export const SITE_TYPE_LABELS: Record<string, string> = {
  settlement: 'Поселення', city: 'Місто', hillfort: 'Городище та фортеця', campsite: 'Стоянка',
  kurgan: 'Курган', 'kurgan-cemetery': 'Курганний могильник', burial: 'Могильник і поховання', other: 'Інше',
};

function overlay(base: Card, o?: CardText): Card {
  if (!o) return base;
  return {
    ...base, title: o.title ?? base.title, dating: o.dating ?? base.dating, summary: o.summary ?? base.summary,
    fullName: o.fullName ?? base.fullName, years: o.years ?? base.years, bio: o.bio ?? base.bio,
    artifacts: o.artifacts ?? base.artifacts, fields: o.fields ?? base.fields,
    facts: base.facts?.map((f, i) => ({ ...f, text: o.facts?.[i] ?? f.text })),
  };
}
const overlayGroup = (group: Record<string, Card>, tr: Record<string, CardText>) =>
  Object.fromEntries(Object.entries(group).map(([k, c]) => [k, overlay(c, tr[k])]));

export async function loadData(base = import.meta.env.BASE_URL, lang: Lang = 'uk'): Promise<Data> {
  const get = async <T>(f: string): Promise<T> => {
    const r = await fetch(`${base}data/${f}`);
    if (!r.ok) throw new Error(`Не вдалося завантажити ${f}`);
    return r.json() as Promise<T>;
  };
  const [records, graph, enrichment, geo, cover] = await Promise.all([
    get<RecordItem[]>('records.json'), get<Graph>('graph.json'), get<Enrichment>('enrichment.json'),
    get<Record<string, GeoPoint>>('geo.json'), get<string[]>('cover.json'),
  ]);
  let labels = SITE_TYPE_LABELS;
  let i18n: I18n | undefined;
  if (lang === 'en') {
    i18n = await get<I18n>('i18n-en.json');
    enrichment.periods = overlayGroup(enrichment.periods, i18n.periods);
    enrichment.siteTypes = overlayGroup(enrichment.siteTypes, i18n.siteTypes);
    enrichment.regions = overlayGroup(enrichment.regions, i18n.regions);
    enrichment.expeditions = overlayGroup(enrichment.expeditions, i18n.expeditions);
    enrichment.scholars = overlayGroup(enrichment.scholars, i18n.scholars);
    graph.periods = graph.periods.map((p) => ({ ...p, label: i18n!.periodLabels[p.id] ?? p.label }));
    labels = { ...SITE_TYPE_LABELS, ...i18n.siteTypeLabels };
  }
  return { lang, names: makeNames(lang, i18n), records, byId: new Map(records.map((r) => [r.id, r])), graph, enrichment, geo, cover, siteTypeLabels: labels };
}
