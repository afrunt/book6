import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { config } from './config';
import type { Card, Data, Entity, RecordItem } from './data';
import { entityName, periodLabel, relatedRecords } from './discovery';
import { esc, html, raw, Raw } from './html';
import { dicts, translit } from './i18n';
import { applyFilters, buildIndex, emptyFilters, filtersFromHash, filtersToQuery } from './search';

export interface View { title: string; body: Raw; after?: (root: HTMLElement) => void }

export function makeViews(data: Data) {
  const lang = data.lang;
  const T = dicts[lang];
  const N = data.names;
  const P = lang === 'en' ? '/en' : '';
  const H = (path: string) => `#${P}${path}`;
  const latin = (r: RecordItem) => (lang === 'en' ? `${translit(r.site)} ${r.authors.map(N.person).join(' ')} ${r.regions.map(N.region).join(' ')} ${r.districts.map(translit).join(' ')}` : '');
  const index = buildIndex(data, latin);
  const g = data.graph;
  const regionByName = new Map(g.regions.map((r) => [r.name!, r]));
  const scholarByName = new Map(g.scholars.map((s) => [s.name!, s]));
  const expByName = new Map(g.expeditions.map((e) => [e.name!, e]));
  const periodById = new Map(g.periods.map((p) => [p.id, p]));

  const rec = (id: string) => data.byId.get(id)!;
  const link = (href: string, text: string, cls = '') => html`<a class="${cls}" href="${H(href)}">${text}</a>`;
  const years = (r: RecordItem) => (r.yearFirst ? (r.yearFirst === r.yearLast ? `${r.yearFirst}` : `${r.yearFirst}–${r.yearLast}`) : '—');

  function recordCard(r: RecordItem): Raw {
    return html`<article class="card">
      <h3>${link(`/record/${r.id}`, N.site(r.site))}</h3>
      <p class="meta">${T.registerNo} ${r.collectionNo} · ${r.periods.map((p) => periodLabel(data, p)).join(', ') || '—'}</p>
      <p class="meta">${r.regions.map(N.region).join(', ')}${r.districts.length ? ' · ' + r.districts.map((d) => d + T.districtSuffix).join(', ') : ''}</p>
      <p class="meta">${T.yearsOfResearch}: ${years(r)}</p>
    </article>`;
  }
  const cards = (list: RecordItem[], max = 24) =>
    html`<div class="grid">${list.slice(0, max).map(recordCard)}</div>${list.length > max ? html`<p class="meta">${T.shown(max, list.length)} ${link('/collection', T.allCollection)}</p>` : ''}`;

  function sourceList(card: Card): Raw {
    const items = card.sources.map((s) => data.enrichment.sources[s]).filter(Boolean);
    if (!items.length) return html``;
    return html`<details class="sources"><summary>${T.sources} (${items.length}) · <span class="badge conf-${card.confidence}">${T.confidence[card.confidence]}</span></summary>
      <ul>${items.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a> <small>(${s.license})</small></li>`)}</ul></details>`;
  }
  function enrichmentBlock(card: Card | undefined, fallback = ''): Raw {
    if (!card) return html`<p class="note">${fallback || T.noCard}</p>`;
    return html`<section class="enrich" aria-label="${T.reference}">
      ${card.dating ? html`<p><strong>${T.dating}:</strong> ${card.dating}</p>` : ''}
      ${card.summary || card.bio ? html`<p>${card.summary ?? card.bio}</p>` : ''}
      ${card.facts?.length ? html`<h3>${T.didYouKnow}</h3><ul class="facts">${card.facts.map((f) => html`<li>${f.text}</li>`)}</ul>` : ''}
      ${card.artifacts?.length ? html`<p><strong>${T.typicalFinds}:</strong> ${card.artifacts.join(' · ')}</p>` : ''}
      ${sourceList(card)}</section>`;
  }
  const chips = (items: Raw[]) => html`<p class="chips">${items.map((i) => html`<span class="chip">${i}</span>`)}</p>`;
  const carousel = (title: string, list: RecordItem[]) => (list.length ? html`<section><h2>${title}</h2><div class="strip">${list.map(recordCard)}</div></section>` : '');

  const photoBlock = (card?: Card): Raw => card?.photo
    ? html`<figure class="portrait"><img src="${import.meta.env.BASE_URL}photos/${card.photo.file}" alt="${T.photoAlt}: ${card.fullName ?? ''}" width="240" loading="lazy"><figcaption>${T.photo}: <a href="${card.photo.url}" target="_blank" rel="noopener">${card.photo.credit}</a>, ${card.photo.license}</figcaption></figure>`
    : html``;

  function entityPage(kind: string, title: string, e: Entity, card: Card | undefined, extra: Raw, fallback = ''): View {
    const list = e.records.map(rec).sort((a, b) => a.collectionNo - b.collectionNo);
    return {
      title,
      body: html`<h1>${title}</h1><p class="meta">${T.recordsInRegister}: ${e.count}</p>${photoBlock(card)}${enrichmentBlock(card, fallback)}${extra}<h2>${T.collections}</h2>${cards(list)}`,
    };
  }

  const home = (): View => {
    const yearsAll = data.records.map((r) => r.yearFirst).filter((y): y is number => !!y);
    return {
      title: T.homeTitle,
      after: mountMap,
      body: html`<section class="hero"><h1>${T.heroTitle}</h1>
        <p>${T.heroText(data.records.length)}</p>
        <p class="actions">${link('/map', T.btnMap, 'btn')} ${link('/timeline', T.btnTimeline, 'btn')} ${link('/collection', T.btnCollection, 'btn')}</p></section>
        <ul class="stats"><li><strong>${data.records.length}</strong> ${T.statRecords}</li><li><strong>${g.scholars.length}</strong> ${T.statScholars}</li><li><strong>${g.expeditions.length}</strong> ${T.statExpeditions}</li><li><strong>${g.regions.length}</strong> ${T.statRegions}</li><li><strong>${Math.min(...yearsAll)}–${Math.max(...yearsAll)}</strong> ${T.statYears}</li></ul>
        <h2>${T.mapTitle}</h2>${mapBlock()}
        <h2>${T.epochs}</h2><p class="chips">${g.periods.filter((p) => p.count > 0).sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).map((p) => html`<span class="chip">${link(`/period/${p.id}`, `${periodLabel(data, p.id)} · ${p.count}`)}</span>`)}</p>`,
    };
  };

  const recordView = (id: string): View => {
    const r = data.byId.get(id);
    if (!r) return notFound();
    const geo = data.geo[r.id];
    const rows: [string, Raw | string][] = [
      [T.collectionNo, String(r.collectionNo)], [T.act, [r.actNo, r.receivedAt].filter(Boolean).join(T.actFrom) || '—'],
      [T.dating, r.datingText ?? '—'], [T.siteType, r.siteTypeText ?? '—'], [T.researchTypes, r.researchTypes.join(', ') || '—'],
      [T.yearsOfResearch, r.yearsText ?? '—'], [T.boxesUnits, `${r.boxes ?? '—'} / ${r.units ?? '—'}`],
      [T.notes, r.notes ?? '—'], [T.attachments, r.attachments ?? '—'],
    ];
    const places = r.regions.map((n) => (regionByName.get(n) ? link(`/place/${regionByName.get(n)!.id}`, N.region(n)) : html`${N.region(n)}`));
    const authors = r.authors.map((n) => (scholarByName.get(n) ? link(`/scholar/${scholarByName.get(n)!.id}`, N.person(n)) : html`${N.person(n)}`));
    const exp = r.expedition && expByName.get(r.expedition) ? link(`/expedition/${expByName.get(r.expedition)!.id}`, N.expedition(r.expedition)) : html`${r.expedition ? N.expedition(r.expedition) : '—'}`;
    return {
      title: N.site(r.site),
      body: html`<p><a href="${H('/collection')}">${T.backToCollection}</a></p><h1>${N.site(r.site)}</h1>${lang === 'en' ? html`<p class="note">${T.registerNote}</p>` : ''}
        ${chips([...r.periods.map((p) => link(`/period/${p}`, periodLabel(data, p))), ...r.siteTypes.map((t) => link(`/type/${t}`, data.siteTypeLabels[t] ?? t))])}
        <dl class="facts-table">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}
          <dt>${T.region}</dt><dd>${places.map((p) => html`${p} `)}</dd><dt>${T.district}</dt><dd>${r.districts.map(N.site).join(', ') || '—'}</dd>
          <dt>${T.authors}</dt><dd>${authors.map((p) => html`${p} `)}</dd><dt>${T.expedition}</dt><dd>${exp}</dd>
          ${geo ? html`<dt>${T.location}</dt><dd>${N.geoLabel(geo.label)} <span class="badge">${T.precision[geo.precision]}</span></dd>` : ''}</dl>
        ${scanBlock(r)}
        <h2>${T.context}</h2>${r.periods.map((p) => html`<h3>${periodLabel(data, p)}</h3>${enrichmentBlock(data.enrichment.periods[p])}`)}
        ${r.siteTypes.map((t) => html`<h3>${data.siteTypeLabels[t] ?? t}</h3>${enrichmentBlock(data.enrichment.siteTypes[t])}`)}
        ${carousel(T.similar, relatedRecords(data, r))}
        ${reportLink(T.recordSubject(r.id, N.site(r.site)))}`,
    };
  };

  function scanBlock(r: RecordItem): Raw {
    if (!r.scanRef) return html`<div class="scan-placeholder">${T.noScan}</div>`;
    const src = `${import.meta.env.BASE_URL}scans/${r.scanRef}.jpg`;
    return html`<figure class="scan"><a href="${src}" target="_blank" rel="noopener noreferrer"><img src="${src}" loading="lazy" alt="${T.scanTitle(r.pdfPage)}"></a>
      <figcaption>${T.scanCaption(r.pdfPage)}</figcaption></figure>`;
  }

  function reportLink(subject: string): Raw {
    if (!config.repoUrl) return html`<p class="meta">${T.reportNoRepo}</p>`;
    const url = `${config.repoUrl}/issues/new?title=${encodeURIComponent(T.reportIssue(subject))}`;
    return html`<p class="meta"><a href="${url}" target="_blank" rel="noopener noreferrer">${T.reportLink}</a></p>`;
  }

  const periodView = (id: string): View => {
    const p = periodById.get(id);
    if (!p) return notFound();
    const neighbours = g.periods.filter((x) => x.count > 0 && x.id !== 'other').sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const i = neighbours.findIndex((x) => x.id === id);
    const nav = html`<p class="chips">${i > 0 ? html`<span class="chip">← ${link(`/period/${neighbours[i - 1].id}`, periodLabel(data, neighbours[i - 1].id))}</span>` : ''}${i >= 0 && i < neighbours.length - 1 ? html`<span class="chip">${link(`/period/${neighbours[i + 1].id}`, periodLabel(data, neighbours[i + 1].id))} →</span>` : ''}</p>`;
    return entityPage('period', periodLabel(data, id), p, data.enrichment.periods[id], nav);
  };
  const typeView = (id: string): View => {
    const t = g.siteTypes.find((x) => x.id === id);
    return t ? entityPage('type', data.siteTypeLabels[id] ?? id, t, data.enrichment.siteTypes[id], html``) : notFound();
  };
  const placeView = (id: string): View => {
    const e = g.regions.find((x) => x.id === id);
    if (!e) return notFound();
    const ps = (e.periods ?? []).map((p) => link(`/period/${p}`, periodLabel(data, p)));
    return entityPage('place', N.region(e.name!), e, data.enrichment.regions[id], html`<h2>${T.placesHere}</h2>${chips(ps)}`);
  };
  const expeditionView = (id: string): View => {
    const e = g.expeditions.find((x) => x.id === id);
    if (!e) return notFound();
    const people = (e.scholars ?? []).map((n) => (scholarByName.get(n) ? link(`/scholar/${scholarByName.get(n)!.id}`, N.person(n)) : html`${N.person(n)}`));
    const extra = html`<p>${T.years}: ${e.yearFirst ?? '—'}–${e.yearLast ?? '—'} · ${T.regionsLabel}: ${(e.regions ?? []).map(N.region).join(', ')}</p><h2>${T.scholarsHeading}</h2>${chips(people)}`;
    return entityPage('expedition', N.expedition(e.name!), e, data.enrichment.expeditions[id], extra, T.autoProfile);
  };
  const scholarView = (id: string): View => {
    const s = g.scholars.find((x) => x.id === id);
    if (!s) return notFound();
    const card = data.enrichment.scholars[id];
    const title = card?.fullName ? `${card.fullName} (${N.person(s.name!)})` : N.person(s.name!);
    const extra = html`<p>${T.scholarYears}: ${s.yearFirst ?? '—'}–${s.yearLast ?? '—'} · ${T.areas}: ${(s.regions ?? []).map(N.region).join(', ') || '—'}</p>
      <h2>${T.studiedEpochs}</h2>${chips((s.periods ?? []).map((p) => link(`/period/${p}`, periodLabel(data, p))))}
      ${s.expeditions?.length ? html`<h2>${T.expeditions}</h2>${chips(s.expeditions.map((n) => (expByName.get(n) ? link(`/expedition/${expByName.get(n)!.id}`, N.expedition(n)) : html`${N.expedition(n)}`)))}` : ''}`;
    return entityPage('scholar', title, s, card, extra, T.scholarAuto(s.count));
  };

  const scholarsView = (): View => {
    const list = [...g.scholars].sort((a, b) => b.count - a.count || N.person(a.name ?? '').localeCompare(N.person(b.name ?? ''), lang));
    const item = (s: Entity) => {
      const c = data.enrichment.scholars[s.id];
      const img = c?.photo ? html`<img src="${import.meta.env.BASE_URL}photos/${c.photo.file}" alt="" width="56" height="56" loading="lazy">` : html`<span class="avatar" aria-hidden="true">${N.person(s.name ?? '?')[0]}</span>`;
      return html`<li data-name="${(`${s.name} ${N.person(s.name ?? '')} ${c?.fullName ?? ''}`).toLowerCase()}"><a href="${H(`/scholar/${s.id}`)}">${img}<span><strong>${c?.fullName ?? N.person(s.name ?? '')}</strong><br><span class="meta">${s.count} ${T.recordsWord} · ${s.yearFirst ?? '—'}–${s.yearLast ?? '—'}</span></span></a></li>`;
    };
    return {
      title: T.scholarsTitle,
      body: html`<h1>${T.scholarsTitle}</h1><label>${T.searchSurname} <input type="search" id="scholar-q" placeholder="${T.surnamePlaceholder}"></label>
        <p class="meta" aria-live="polite"><span id="scholar-n">${list.length}</span> ${T.ofTotal} ${list.length}</p><ul class="people">${list.map(item)}</ul>`,
      after: (root) => {
        const q = root.querySelector<HTMLInputElement>('#scholar-q')!;
        q.addEventListener('input', () => {
          const v = q.value.trim().toLowerCase(); let n = 0;
          root.querySelectorAll<HTMLElement>('.people li').forEach((li) => { const ok = !v || li.dataset.name!.includes(v); li.hidden = !ok; if (ok) n++; });
          root.querySelector('#scholar-n')!.textContent = String(n);
        });
      },
    };
  };

  const collectionView = (query: string): View => {
    const f = filtersFromHash(query);
    const list = applyFilters(data, index, f);
    const sel = (name: string, label: string, opts: [string, string][], value: string) =>
      html`<label>${label}<select name="${name}"><option value="">${T.all}</option>${opts.map(([v, t]) => html`<option value="${v}" ${raw(v === value ? 'selected' : '')}>${t}</option>`)}</select></label>`;
    return {
      title: T.collectionTitle,
      body: html`<h1>${T.collectionTitle}</h1><form id="filters" class="filters" role="search"><label>${T.search}<input type="search" name="q" value="${f.q}" placeholder="${T.searchPlaceholder}"></label>
        ${sel('period', T.period, g.periods.filter((p) => p.count).map((p) => [p.id, periodLabel(data, p.id)]), f.period)}
        ${sel('region', T.region, g.regions.map((r) => [r.name!, N.region(r.name!)]), f.region)}
        ${sel('type', T.typeLabel, g.siteTypes.map((t) => [t.id, data.siteTypeLabels[t.id] ?? t.id]), f.type)}
        ${sel('author', T.authorLabel, g.scholars.map((s) => [s.name!, N.person(s.name!)]), f.author)}
        <button class="btn" type="submit">${T.find}</button> <a class="btn" href="${H('/collection')}">${T.reset}</a></form>
        <p class="meta" aria-live="polite">${T.found}: ${list.length}</p>${cards(list, list.length)}`,
      after: (root) => {
        root.querySelector<HTMLFormElement>('#filters')?.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target as HTMLFormElement);
          const nf = { ...emptyFilters };
          (Object.keys(nf) as (keyof typeof nf)[]).forEach((k) => { nf[k] = String(fd.get(k) ?? ''); });
          location.hash = `${H('/collection')}?${filtersToQuery(nf)}`;
        });
      },
    };
  };

  const mapBlock = (): Raw => html`<p class="note">${T.mapNote}</p>
        <label>${T.period} <select id="map-period"><option value="">${T.all}</option>${g.periods.filter((p) => p.count).map((p) => html`<option value="${p.id}">${periodLabel(data, p.id)}</option>`)}</select></label>
        <div id="map" class="map" role="application" aria-label="${T.mapAria}"></div>
        <details open><summary>${T.placeList}</summary><div id="map-list"></div></details>`;

  const mountMap = (root: HTMLElement) => {
    const groups = new Map<string, { label: string; lat: number; lon: number; precision: string; ids: string[] }>();
        const map = L.map(root.querySelector<HTMLElement>('#map')!).setView([49, 32], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: T.osm }).addTo(map);
        const layer = L.layerGroup().addTo(map);
        const draw = (period: string) => {
          layer.clearLayers(); groups.clear();
          for (const r of data.records) {
            const pt = data.geo[r.id];
            if (!pt || (period && !r.periods.includes(period))) continue;
            const key = `${pt.lat},${pt.lon}`;
            const gr = groups.get(key) ?? { label: pt.label, lat: pt.lat, lon: pt.lon, precision: pt.precision, ids: [] };
            gr.ids.push(r.id); groups.set(key, gr);
          }
          for (const gr of groups.values()) {
            const m = L.circleMarker([gr.lat, gr.lon], { radius: 5 + Math.sqrt(gr.ids.length) * 2, color: '#8a4b0f', fillColor: '#c97a2b', fillOpacity: 0.6 });
            const sample = gr.ids.slice(0, 5).map((id) => `<li><a href="${H('/record/' + esc(id))}">${esc(N.site(rec(id).site))}</a></li>`).join('');
            m.bindPopup(`<strong>${esc(N.geoLabel(gr.label))}</strong><br>${T.popupRecords}: ${gr.ids.length} <small>(${esc(T.precision[gr.precision])})</small><ul>${sample}</ul>`);
            m.addTo(layer);
          }
          const regionLinks = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
          root.querySelector('#map-list')!.innerHTML = `<ul>${regionLinks.map((gr) => `<li>${esc(N.geoLabel(gr.label))} — ${gr.ids.length} (${esc(T.precision[gr.precision])}) · <a href="${H('/record/' + esc(gr.ids[0]))}">${T.firstRecord}</a></li>`).join('')}</ul>`;
        };
        draw('');
        root.querySelector('#map-period')!.addEventListener('change', (e) => draw((e.target as HTMLSelectElement).value));
        setTimeout(() => map.invalidateSize(), 0);
  };

  const mapView = (): View => ({ title: T.nav.map, body: html`<h1>${T.mapTitle}</h1>${mapBlock()}`, after: mountMap });

  const timelineView = (): View => {
    const ps = g.periods.filter((p) => p.count && p.id !== 'other').sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const maxP = Math.max(...ps.map((p) => p.count));
    const byYear = new Map<number, number>();
    data.records.forEach((r) => { if (r.yearFirst) byYear.set(r.yearFirst, (byYear.get(r.yearFirst) ?? 0) + 1); });
    const ys = [...byYear.keys()].sort((a, b) => a - b);
    const maxY = Math.max(...byYear.values());
    const fmt = (y?: number) => (y === undefined ? '' : y < 0 ? T.bce(Math.abs(y)) : T.ce(y));
    return {
      title: T.timelineTitle,
      body: html`<h1>${T.timelineTitle}</h1><h2>${T.byEpoch}</h2><ol class="bars">${ps.map((p) => html`<li><a href="${H(`/period/${p.id}`)}"><span class="lbl">${periodLabel(data, p.id)} <small>(${fmt(p.start)} – ${fmt(p.end)})</small></span><span class="bar" style="width:${Math.max(3, (p.count / maxP) * 100)}%">${p.count}</span></a></li>`)}</ol>
        <h2>${T.byYear}</h2><ol class="bars">${ys.map((y) => html`<li><a href="${H(`/collection`)}?q=${y}"><span class="lbl">${y}</span><span class="bar alt" style="width:${Math.max(3, (byYear.get(y)! / maxY) * 100)}%">${byYear.get(y)}</span></a></li>`)}</ol>`,
    };
  };

  const aboutView = (): View => ({
    title: T.aboutTitle,
    body: html`<h1>${T.aboutTitle}</h1>
      <p>${T.aboutIntro}</p>
      <h2>${T.aboutCover}</h2><ul>${data.cover.slice(0, 6).map((l) => html`<li>${l}</li>`)}</ul>
      <h2>${T.aboutRef}</h2><p>${T.aboutRefText}</p>
      <ul>${Object.values(data.enrichment.sources).map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a> <small>(${s.license})</small></li>`)}</ul>
      <h2>${T.aboutPrivacy}</h2><p>${T.aboutPrivacyText}</p>
      ${reportLink(T.aboutSubject)}`,
  });

  function notFound(): View { return { title: T.notFoundTitle, body: html`<h1>${T.notFoundH}</h1><p><a href="${H('/')}">${T.toHome}</a></p>` }; }

  function route(hashValue: string): View {
    const [path, query = ''] = hashValue.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'en') parts.shift();
    const [a, b] = [parts[0] ?? '', decodeURIComponent(parts[1] ?? '')];
    switch (a) {
      case '': return home();
      case 'map': return mapView();
      case 'timeline': return timelineView();
      case 'collection': return collectionView(query);
      case 'record': return recordView(b);
      case 'period': return periodView(b);
      case 'type': return typeView(b);
      case 'place': return placeView(b);
      case 'expedition': return expeditionView(b);
      case 'scholars': return scholarsView();
      case 'scholar': return scholarView(b);
      case 'about': return aboutView();
      default: return notFound();
    }
  }
  return { route };
}
