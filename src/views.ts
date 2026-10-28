import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { config } from './config';
import type { Card, Data, Entity, RecordItem } from './data';
import { entityName, periodLabel, relatedRecords } from './discovery';
import { confidenceLabel, esc, html, precisionLabel, raw, Raw } from './html';
import { applyFilters, buildIndex, emptyFilters, filtersFromHash, filtersToQuery } from './search';

export interface View { title: string; body: Raw; after?: (root: HTMLElement) => void }

export function makeViews(data: Data) {
  const index = buildIndex(data);
  const g = data.graph;
  const regionByName = new Map(g.regions.map((r) => [r.name!, r]));
  const scholarByName = new Map(g.scholars.map((s) => [s.name!, s]));
  const expByName = new Map(g.expeditions.map((e) => [e.name!, e]));
  const periodById = new Map(g.periods.map((p) => [p.id, p]));

  const rec = (id: string) => data.byId.get(id)!;
  const link = (href: string, text: string, cls = '') => html`<a class="${cls}" href="#${href}">${text}</a>`;
  const years = (r: RecordItem) => (r.yearFirst ? (r.yearFirst === r.yearLast ? `${r.yearFirst}` : `${r.yearFirst}–${r.yearLast}`) : '—');

  function recordCard(r: RecordItem): Raw {
    return html`<article class="card">
      <h3>${link(`/record/${r.id}`, r.site)}</h3>
      <p class="meta">№ ${r.collectionNo} · ${r.periods.map((p) => periodLabel(data, p)).join(', ') || '—'}</p>
      <p class="meta">${r.regions.join(', ')}${r.districts.length ? ' · ' + r.districts.join(', ') + ' р-н' : ''}</p>
      <p class="meta">Роки досліджень: ${years(r)}</p>
    </article>`;
  }
  const cards = (list: RecordItem[], max = 24) =>
    html`<div class="grid">${list.slice(0, max).map(recordCard)}</div>${list.length > max ? html`<p class="meta">Показано ${max} з ${list.length}. ${link('/collection', 'Уся колекція →')}</p>` : ''}`;

  function sourceList(card: Card): Raw {
    const items = card.sources.map((s) => data.enrichment.sources[s]).filter(Boolean);
    if (!items.length) return html``;
    return html`<details class="sources"><summary>Джерела (${items.length}) · <span class="badge conf-${card.confidence}">${confidenceLabel[card.confidence]}</span></summary>
      <ul>${items.map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a> <small>(${s.license})</small></li>`)}</ul></details>`;
  }
  function enrichmentBlock(card: Card | undefined, fallback = ''): Raw {
    if (!card) return html`<p class="note">${fallback || 'Для цієї сутності ще немає довідкової картки — лише дані реєстру.'}</p>`;
    return html`<section class="enrich" aria-label="Довідка">
      ${card.dating ? html`<p><strong>Датування:</strong> ${card.dating}</p>` : ''}
      ${card.summary || card.bio ? html`<p>${card.summary ?? card.bio}</p>` : ''}
      ${card.facts?.length ? html`<h3>Чи знали ви?</h3><ul class="facts">${card.facts.map((f) => html`<li>${f.text}</li>`)}</ul>` : ''}
      ${card.artifacts?.length ? html`<p><strong>Типові знахідки:</strong> ${card.artifacts.join(' · ')}</p>` : ''}
      ${sourceList(card)}</section>`;
  }
  const chips = (items: Raw[]) => html`<p class="chips">${items.map((i) => html`<span class="chip">${i}</span>`)}</p>`;
  const carousel = (title: string, list: RecordItem[]) => (list.length ? html`<section><h2>${title}</h2><div class="strip">${list.map(recordCard)}</div></section>` : '');

  const photoBlock = (card?: Card): Raw => card?.photo
    ? html`<figure class="portrait"><img src="${import.meta.env.BASE_URL}photos/${card.photo.file}" alt="Фото: ${card.fullName ?? ''}" width="240" loading="lazy"><figcaption>Фото: <a href="${card.photo.url}" target="_blank" rel="noopener">${card.photo.credit}</a>, ${card.photo.license}</figcaption></figure>`
    : html``;

  function entityPage(kind: string, title: string, e: Entity, card: Card | undefined, extra: Raw, fallback = ''): View {
    const list = e.records.map(rec).sort((a, b) => a.collectionNo - b.collectionNo);
    return {
      title,
      body: html`<h1>${title}</h1><p class="meta">Записів у реєстрі: ${e.count}</p>${photoBlock(card)}${enrichmentBlock(card, fallback)}${extra}<h2>Колекції</h2>${cards(list)}`,
    };
  }

  const home = (): View => {
    const yearsAll = data.records.map((r) => r.yearFirst).filter((y): y is number => !!y);
    return {
      title: 'Головна',
      after: mountMap,
      body: html`<section class="hero"><h1>Книга VI: колекції, що чекають на відкриття</h1>
        <p>${data.records.length} надходжень до наукового фонду Інституту археології: від кам'яної доби до козацького часу. Обирайте карту, часову шкалу чи колекцію — і дізнавайтеся більше про артефакти, місця, експедиції та науковців.</p>
        <p class="actions">${link('/map', '🗺 Карта', 'btn')} ${link('/timeline', '⏳ Шкала часу', 'btn')} ${link('/collection', '📚 Колекція', 'btn')}</p></section>
        <ul class="stats"><li><strong>${data.records.length}</strong> записів</li><li><strong>${g.scholars.length}</strong> науковців</li><li><strong>${g.expeditions.length}</strong> експедицій</li><li><strong>${g.regions.length}</strong> регіонів</li><li><strong>${Math.min(...yearsAll)}–${Math.max(...yearsAll)}</strong> роки досліджень</li></ul>
        <h2>Карта колекцій</h2>${mapBlock()}
        <h2>Епохи</h2><p class="chips">${g.periods.filter((p) => p.count > 0).sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).map((p) => html`<span class="chip">${link(`/period/${p.id}`, `${periodLabel(data, p.id)} · ${p.count}`)}</span>`)}</p>`,
    };
  };

  const recordView = (id: string): View => {
    const r = data.byId.get(id);
    if (!r) return notFound();
    const geo = data.geo[r.id];
    const rows: [string, Raw | string][] = [
      ['Колекція №', String(r.collectionNo)], ['Акт прийому', [r.actNo, r.receivedAt].filter(Boolean).join(' від ') || '—'],
      ['Датування', r.datingText ?? '—'], ['Тип пам\'ятки', r.siteTypeText ?? '—'], ['Види досліджень', r.researchTypes.join(', ') || '—'],
      ['Роки досліджень', r.yearsText ?? '—'], ['Ящиків / одиниць зберігання', `${r.boxes ?? '—'} / ${r.units ?? '—'}`],
      ['Примітки', r.notes ?? '—'], ['Додатки до акту', r.attachments ?? '—'],
    ];
    const places = r.regions.map((n) => (regionByName.get(n) ? link(`/place/${regionByName.get(n)!.id}`, n) : html`${n}`));
    const authors = r.authors.map((n) => (scholarByName.get(n) ? link(`/scholar/${scholarByName.get(n)!.id}`, n) : html`${n}`));
    const exp = r.expedition && expByName.get(r.expedition) ? link(`/expedition/${expByName.get(r.expedition)!.id}`, r.expedition) : html`${r.expedition ?? '—'}`;
    return {
      title: r.site,
      body: html`<p><a href="#/collection">← До колекції</a></p><h1>${r.site}</h1>
        ${chips([...r.periods.map((p) => link(`/period/${p}`, periodLabel(data, p))), ...r.siteTypes.map((t) => link(`/type/${t}`, data.siteTypeLabels[t] ?? t))])}
        <dl class="facts-table">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}
          <dt>Область</dt><dd>${places.map((p) => html`${p} `)}</dd><dt>Район</dt><dd>${r.districts.join(', ') || '—'}</dd>
          <dt>Автори досліджень</dt><dd>${authors.map((p) => html`${p} `)}</dd><dt>Експедиція</dt><dd>${exp}</dd>
          ${geo ? html`<dt>Розташування</dt><dd>${geo.label} <span class="badge">${precisionLabel[geo.precision]}</span></dd>` : ''}</dl>
        ${scanBlock(r)}
        <h2>Контекст</h2>${r.periods.map((p) => html`<h3>${periodLabel(data, p)}</h3>${enrichmentBlock(data.enrichment.periods[p])}`)}
        ${r.siteTypes.map((t) => html`<h3>${data.siteTypeLabels[t] ?? t}</h3>${enrichmentBlock(data.enrichment.siteTypes[t])}`)}
        ${carousel('Схожі колекції', relatedRecords(data, r))}
        ${reportLink(`Запис ${r.id}: ${r.site}`)}`,
    };
  };

  function scanBlock(r: RecordItem): Raw {
    if (!r.scanRef) return html`<div class="scan-placeholder">Скан для цього запису відсутній.</div>`;
    const src = `${import.meta.env.BASE_URL}scans/${r.scanRef}.jpg`;
    return html`<figure class="scan"><a href="${src}" target="_blank" rel="noopener noreferrer"><img src="${src}" loading="lazy" alt="Скан сторінки реєстру${r.pdfPage ? `, стор. PDF ${r.pdfPage}` : ''}"></a>
      <figcaption>Скан сторінки реєстру${r.pdfPage ? ` (стор. PDF ${r.pdfPage})` : ''}. Клацніть, щоб відкрити в повному розмірі. На сторінці є й інші записи.</figcaption></figure>`;
  }

  function reportLink(subject: string): Raw {
    if (!config.repoUrl) return html`<p class="meta">Знайшли помилку? Повідомте автора сайту.</p>`;
    const url = `${config.repoUrl}/issues/new?title=${encodeURIComponent(`Помилка в даних: ${subject}`)}`;
    return html`<p class="meta"><a href="${url}" target="_blank" rel="noopener noreferrer">Повідомити про помилку</a></p>`;
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
    return entityPage('place', e.name!, e, data.enrichment.regions[id], html`<h2>Епохи тут</h2>${chips(ps)}`);
  };
  const expeditionView = (id: string): View => {
    const e = g.expeditions.find((x) => x.id === id);
    if (!e) return notFound();
    const people = (e.scholars ?? []).map((n) => (scholarByName.get(n) ? link(`/scholar/${scholarByName.get(n)!.id}`, n) : html`${n}`));
    const extra = html`<p>Роки: ${e.yearFirst ?? '—'}–${e.yearLast ?? '—'} · Регіони: ${(e.regions ?? []).join(', ')}</p><h2>Науковці</h2>${chips(people)}`;
    return entityPage('expedition', e.name!, e, data.enrichment.expeditions[id], extra, 'Профіль складено автоматично з даних реєстру.');
  };
  const scholarView = (id: string): View => {
    const s = g.scholars.find((x) => x.id === id);
    if (!s) return notFound();
    const card = data.enrichment.scholars[id];
    const title = card?.fullName ? `${card.fullName} (${s.name})` : s.name!;
    const extra = html`<p>Роки досліджень у реєстрі: ${s.yearFirst ?? '—'}–${s.yearLast ?? '—'} · Області: ${(s.regions ?? []).join(', ') || '—'}</p>
      <h2>Епохи, які вивчав</h2>${chips((s.periods ?? []).map((p) => link(`/period/${p}`, periodLabel(data, p))))}
      ${s.expeditions?.length ? html`<h2>Експедиції</h2>${chips(s.expeditions.map((n) => (expByName.get(n) ? link(`/expedition/${expByName.get(n)!.id}`, n) : html`${n}`)))}` : ''}`;
    return entityPage('scholar', title, s, card, extra, `Профіль складено автоматично з реєстру: ${s.count} записів. Біографічні відомості ще не додано.`);
  };

  const scholarsView = (): View => {
    const list = [...g.scholars].sort((a, b) => b.count - a.count || (a.name ?? '').localeCompare(b.name ?? '', 'uk'));
    const item = (s: Entity) => {
      const c = data.enrichment.scholars[s.id];
      const img = c?.photo ? html`<img src="${import.meta.env.BASE_URL}photos/${c.photo.file}" alt="" width="56" height="56" loading="lazy">` : html`<span class="avatar" aria-hidden="true">${(s.name ?? '?')[0]}</span>`;
      return html`<li data-name="${(`${s.name} ${c?.fullName ?? ''}`).toLowerCase()}"><a href="#/scholar/${s.id}">${img}<span><strong>${c?.fullName ?? s.name}</strong><br><span class="meta">${s.count} записів · ${s.yearFirst ?? '—'}–${s.yearLast ?? '—'}</span></span></a></li>`;
    };
    return {
      title: 'Дослідники',
      body: html`<h1>Дослідники</h1><label>Пошук за прізвищем <input type="search" id="scholar-q" placeholder="Прізвище…"></label>
        <p class="meta" aria-live="polite"><span id="scholar-n">${list.length}</span> з ${list.length}</p><ul class="people">${list.map(item)}</ul>`,
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
      html`<label>${label}<select name="${name}"><option value="">Усі</option>${opts.map(([v, t]) => html`<option value="${v}" ${raw(v === value ? 'selected' : '')}>${t}</option>`)}</select></label>`;
    return {
      title: 'Колекція',
      body: html`<h1>Колекція</h1><form id="filters" class="filters" role="search"><label>Пошук<input type="search" name="q" value="${f.q}" placeholder="№ колекції, назва пункту, автор, культура…"></label>
        ${sel('period', 'Період', g.periods.filter((p) => p.count).map((p) => [p.id, periodLabel(data, p.id)]), f.period)}
        ${sel('region', 'Область', g.regions.map((r) => [r.name!, r.name!]), f.region)}
        ${sel('type', 'Тип пам\'ятки', g.siteTypes.map((t) => [t.id, data.siteTypeLabels[t.id] ?? t.id]), f.type)}
        ${sel('author', 'Автор', g.scholars.map((s) => [s.name!, s.name!]), f.author)}
        <button class="btn" type="submit">Знайти</button> <a class="btn" href="#/collection">Скинути</a></form>
        <p class="meta" aria-live="polite">Знайдено: ${list.length}</p>${cards(list, list.length)}`,
      after: (root) => {
        root.querySelector<HTMLFormElement>('#filters')?.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target as HTMLFormElement);
          const nf = { ...emptyFilters };
          (Object.keys(nf) as (keyof typeof nf)[]).forEach((k) => { nf[k] = String(fd.get(k) ?? ''); });
          location.hash = `#/collection?${filtersToQuery(nf)}`;
        });
      },
    };
  };

  const mapBlock = (): Raw => html`<p class="note">Положення показано приблизно — на рівні району або області. Точні координати пам'яток не публікуються, щоб захистити їх від несанкціонованих розкопок.</p>
        <label>Період <select id="map-period"><option value="">Усі</option>${g.periods.filter((p) => p.count).map((p) => html`<option value="${p.id}">${periodLabel(data, p.id)}</option>`)}</select></label>
        <div id="map" class="map" role="application" aria-label="Інтерактивна карта"></div>
        <details open><summary>Список місць (альтернатива карті)</summary><div id="map-list"></div></details>`;

  const mountMap = (root: HTMLElement) => {
    const groups = new Map<string, { label: string; lat: number; lon: number; precision: string; ids: string[] }>();
        const map = L.map(root.querySelector<HTMLElement>('#map')!).setView([49, 32], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '© учасники OpenStreetMap' }).addTo(map);
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
            const sample = gr.ids.slice(0, 5).map((id) => `<li><a href="#/record/${esc(id)}">${esc(rec(id).site)}</a></li>`).join('');
            m.bindPopup(`<strong>${esc(gr.label)}</strong><br>Записів: ${gr.ids.length} <small>(${esc(precisionLabel[gr.precision])})</small><ul>${sample}</ul>`);
            m.addTo(layer);
          }
          const regionLinks = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
          root.querySelector('#map-list')!.innerHTML = `<ul>${regionLinks.map((gr) => `<li>${esc(gr.label)} — ${gr.ids.length} (${esc(precisionLabel[gr.precision])}) · <a href="#/record/${esc(gr.ids[0])}">перший запис</a></li>`).join('')}</ul>`;
        };
        draw('');
        root.querySelector('#map-period')!.addEventListener('change', (e) => draw((e.target as HTMLSelectElement).value));
        setTimeout(() => map.invalidateSize(), 0);
  };

  const mapView = (): View => ({ title: 'Карта', body: html`<h1>Карта колекцій</h1>${mapBlock()}`, after: mountMap });

  const timelineView = (): View => {
    const ps = g.periods.filter((p) => p.count && p.id !== 'other').sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    const maxP = Math.max(...ps.map((p) => p.count));
    const byYear = new Map<number, number>();
    data.records.forEach((r) => { if (r.yearFirst) byYear.set(r.yearFirst, (byYear.get(r.yearFirst) ?? 0) + 1); });
    const ys = [...byYear.keys()].sort((a, b) => a - b);
    const maxY = Math.max(...byYear.values());
    const fmt = (y?: number) => (y === undefined ? '' : y < 0 ? `${Math.abs(y)} р. до н.е.` : `${y} р. н.е.`);
    return {
      title: 'Шкала часу',
      body: html`<h1>Шкала часу</h1><h2>За епохами</h2><ol class="bars">${ps.map((p) => html`<li><a href="#/period/${p.id}"><span class="lbl">${periodLabel(data, p.id)} <small>(${fmt(p.start)} – ${fmt(p.end)})</small></span><span class="bar" style="width:${Math.max(3, (p.count / maxP) * 100)}%">${p.count}</span></a></li>`)}</ol>
        <h2>За роками досліджень</h2><ol class="bars">${ys.map((y) => html`<li><a href="#/collection?q=${y}"><span class="lbl">${y}</span><span class="bar alt" style="width:${Math.max(3, (byYear.get(y)! / maxY) * 100)}%">${byYear.get(y)}</span></a></li>`)}</ol>`,
    };
  };

  const aboutView = (): View => ({
    title: 'Про проєкт і джерела',
    body: html`<h1>Про проєкт і джерела</h1>
      <p>Сайт створено на основі «Книги реєстрації колекцій № VI» Інституту археології НАН України (колекції № 1073–1362). Записи нормалізовано автоматично: періоди, області, автори зведено до єдиних назв, а оригінальні значення збережено.</p>
      <h2>Що написано на обкладинці</h2><ul>${data.cover.slice(0, 6).map((l) => html`<li>${l}</li>`)}</ul>
      <h2>Довідкові дані</h2><p>Описи епох, типів пам'яток, регіонів і науковців додано окремо й завжди супроводжуються посиланнями та рівнем достовірності. Тексти Вікіпедії (CC BY-SA 4.0) перефразовано. Карта — © учасники OpenStreetMap.</p>
      <ul>${Object.values(data.enrichment.sources).map((s) => html`<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a> <small>(${s.license})</small></li>`)}</ul>
      <h2>Приватність і охорона пам'яток</h2><p>Координати показано з точністю до району чи області. Сайт не збирає персональних даних. Про науковців наведено тільки публічні професійні відомості.</p>
      ${reportLink('сторінка «Про проєкт»')}`,
  });

  function notFound(): View { return { title: 'Не знайдено', body: html`<h1>Сторінку не знайдено</h1><p><a href="#/">На головну</a></p>` }; }

  function route(hashValue: string): View {
    const [path, query = ''] = hashValue.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
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
