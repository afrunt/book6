import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData, type Data } from './data';
import { existsSync } from 'node:fs';
import { relatedRecords } from './discovery';
import { applyFilters, buildIndex, emptyFilters } from './search';
import { makeViews } from './views';
import { latinPerson, translit } from './i18n';

let data: Data;
beforeAll(async () => {
  globalThis.fetch = (async (url: string) => {
    const file = String(url).split('data/')[1];
    return { ok: true, json: async () => JSON.parse(readFileSync(`public/data/${file}`, 'utf8')) };
  }) as unknown as typeof fetch;
  data = await loadData('/');
});

describe('data integrity', () => {
  it('has unique ids and resolvable graph links', () => {
    expect(new Set(data.records.map((r) => r.id)).size).toBe(data.records.length);
    for (const s of data.graph.scholars) s.records.forEach((id) => expect(data.byId.has(id)).toBe(true));
  });
  it('shows enrichment only with sources and confidence', () => {
    for (const group of [data.enrichment.periods, data.enrichment.scholars, data.enrichment.regions]) {
      for (const card of Object.values(group)) {
        if (!card.noData) expect(card.sources.length).toBeGreaterThan(0);
        card.sources.forEach((s) => expect(data.enrichment.sources[s]).toBeDefined());
        expect(card.confidence).toBeTruthy();
      }
    }
  });
  it('never publishes finer than district precision outside Kyiv', () => {
    for (const r of data.records) {
      const g = data.geo[r.id];
      if (g && g.precision === 'settlement') expect(r.regions[0]).toBe('Київ');
    }
  });
});

describe('discovery', () => {
  it('related records exclude the record itself', () => {
    const r = data.records[0];
    expect(relatedRecords(data, r).every((o) => o.id !== r.id)).toBe(true);
  });
});

describe('scans', () => {
  it('every scan reference has an image file', () => {
    for (const r of data.records) if (r.scanRef) expect(existsSync(`public/scans/${r.scanRef}.jpg`), r.id).toBe(true);
  });
  it('record page embeds its scan', () => {
    const r = data.records.find((x) => x.scanRef)!;
    expect(makeViews(data).route(`#/record/${r.id}`).body.value).toContain(`scans/${r.scanRef}.jpg`);
  });
});

describe('search and routing', () => {
  it('finds records by free text and filters', () => {
    const idx = buildIndex(data);
    expect(applyFilters(data, idx, { ...emptyFilters, q: 'Бовтишка' }).length).toBeGreaterThan(0);
    expect(applyFilters(data, idx, { ...emptyFilters, period: 'tripillia' }).length).toBe(data.graph.periods.find((p) => p.id === 'tripillia')!.count);
  });
  it('finds records by collection number, exact first', () => {
    const idx = buildIndex(data);
    const r = data.records[0];
    const res = applyFilters(data, idx, { ...emptyFilters, q: `№ ${r.collectionNo}` });
    expect(res[0].collectionNo).toBe(r.collectionNo);
    expect(applyFilters(data, idx, { ...emptyFilters, q: String(r.collectionNo).slice(0, 3) }).every((x) => x.collectionNo > 0)).toBe(true);
  });
  it('renders key routes without errors and escapes content', () => {
    const { route } = makeViews(data);
    for (const h of ['#/', '#/map', '#/timeline', '#/collection?q=Київ', '#/record/1073-1', '#/period/tripillia', '#/type/kurgan', '#/place/cherkaska', '#/scholar/kruts-v-o', '#/expedition/trypilska-arkheolohichna-ekspedytsiya', '#/about']) {
      const v = route(h);
      expect(v.body.value.length, h).toBeGreaterThan(50);
      expect(v.title, h).not.toBe('Не знайдено');
    }
    expect(route('#/record/nope').title).toBe('Не знайдено');
  });
});

describe('scholars list', () => {
  it('lists every scholar with a link to the personal page', () => {
    const body = makeViews(data).route('#/scholars').body.value;
    expect((body.match(/href="#\/scholar\//g) ?? []).length).toBe(data.graph.scholars.length);
  });
});

describe('english version', () => {
  it('romanizes names with the national standard', () => {
    expect(translit('Єнакієве Юрій Їжак Зґгдь')).toBe('Yenakiieve Yurii Yizhak Zghd');
    expect(latinPerson('Яневич О.О.')).toBe('O. O. Yanevych');
  });
  it('renders English routes with English links and no untranslated cards', async () => {
    const en = await loadData('/', 'en');
    const { route } = makeViews(en);
    const home = route('#/en/');
    expect(home.title).toBe('Home');
    expect(home.body.value).toContain('href="#/en/map"');
    for (const h of ['#/en/map', '#/en/timeline', '#/en/collection?q=Tripillia', '#/en/record/1073-1', '#/en/period/tripillia', '#/en/place/cherkaska', '#/en/scholar/yanevych-o-o', '#/en/scholars', '#/en/about']) {
      expect(route(h).body.value.length, h).toBeGreaterThan(50);
    }
    expect(route('#/en/period/tripillia').body.value).not.toMatch(/Датування/);
    expect(route('#/en/scholar/yanevych-o-o').body.value).toContain('Oleksandr');
    expect(route('#/en/record/nope').title).toBe('Not found');
    const idx = buildIndex(en, (r) => translit(r.site));
    expect(applyFilters(en, idx, { ...emptyFilters, q: 'Bovtyshka' }).length).toBeGreaterThan(0);
  });
  it('keeps Ukrainian as the default', () => {
    expect(makeViews(data).route('#/').body.value).toContain('href="#/map"');
  });
});
