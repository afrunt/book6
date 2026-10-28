import { loadData } from './data';
import { esc } from './html';
import { dicts, type Lang } from './i18n';
import { makeViews } from './views';
import './style.css';

const app = document.getElementById('app')!;
const routers: Partial<Record<Lang, ReturnType<typeof makeViews>>> = {};
const navPaths: [keyof typeof dicts.uk.nav, string, string][] = [['home', '/', '🏠'], ['map', '/map', '🗺'], ['timeline', '/timeline', '⏳'], ['collection', '/collection', '📚'], ['scholars', '/scholars', '👥'], ['about', '/about', 'ℹ️']];

const langOf = (hash: string): Lang => (/^#?\/en(\/|\?|$)/.test(hash) ? 'en' : 'uk');

async function render() {
  const hash = location.hash || '#/';
  const lang = langOf(hash);
  const T = dicts[lang];
  document.documentElement.lang = lang === 'en' ? 'en' : 'uk';
  document.querySelector('.skip')!.textContent = T.skip;
  document.querySelector('meta[name="description"]')?.setAttribute('content', T.description);
  if (!routers[lang]) {
    app.innerHTML = `<p class="loading">${T.loading}</p>`;
    try {
      routers[lang] = makeViews(await loadData(import.meta.env.BASE_URL, lang));
    } catch (e) {
      app.innerHTML = `<p class="note">${esc(T.loadFail((e as Error).message))}</p>`;
      return;
    }
    if (langOf(location.hash || '#/') !== lang) return;
  }
  const view = routers[lang]!.route(hash);
  const prefix = lang === 'en' ? '/en' : '';
  const current = hash.replace('#', '').replace(/^\/en(?=\/|\?|$)/, '').split('?')[0] || '/';
  const other = lang === 'en' ? hash.replace(/^#\/en/, '#') : `#/en${hash.replace(/^#/, '') === '/' ? '' : hash.replace(/^#/, '')}`;
  app.innerHTML = `<header class="top"><a class="brand" href="#${prefix}/"><span aria-hidden="true">🏺</span> <span class="brand-text">${esc(T.siteTitle)}</span></a>
    <a class="lang" href="${other === '#' ? '#/' : esc(other)}" lang="${lang === 'en' ? 'uk' : 'en'}">${T.language}</a></header>
    <nav class="tabs" aria-label="${T.mainMenu}"><ul>${navPaths.map(([k, h, icon]) => `<li><a href="#${prefix}${h}" ${current === h || (h !== '/' && current.startsWith(h)) ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${icon}</span><span class="txt">${T.nav[k]}</span></a></li>`).join('')}</ul></nav>
    <main id="main" tabindex="-1">${view.body.value}</main>
    <footer>${T.footer} · <a href="#${prefix}/about">${T.footerLink}</a></footer>`;
  document.title = `${view.title} — ${T.siteTitle}`;
  view.after?.(app);
  const main = document.getElementById('main')!;
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', () => void render());
void render();
