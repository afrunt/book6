import { config } from './config';
import { loadData } from './data';
import { esc } from './html';
import { makeViews } from './views';
import './style.css';

const app = document.getElementById('app')!;
const nav: [string, string][] = [['/', 'Головна'], ['/map', 'Карта'], ['/timeline', 'Шкала часу'], ['/collection', 'Колекція'], ['/scholars', 'Дослідники'], ['/about', 'Про проєкт']];

async function start() {
  app.innerHTML = '<p class="loading">Завантаження…</p>';
  let router: ReturnType<typeof makeViews>;
  try {
    router = makeViews(await loadData());
  } catch (e) {
    app.innerHTML = `<p class="note">Не вдалося завантажити дані: ${esc((e as Error).message)}. Оновіть сторінку.</p>`;
    return;
  }
  const render = () => {
    const view = router.route(location.hash || '#/');
    const current = (location.hash || '#/').replace('#', '').split('?')[0];
    app.innerHTML = `<header class="top"><a class="brand" href="#/">🏺 ${esc(config.siteTitle)}</a>
      <nav aria-label="Основне меню"><ul>${nav.map(([h, t]) => `<li><a href="#${h}" ${current === h || (h !== '/' && current.startsWith(h)) ? 'aria-current="page"' : ''}>${t}</a></li>`).join('')}</ul></nav></header>
      <main id="main" tabindex="-1">${view.body.value}</main>
      <footer>Дані: Книга реєстрації колекцій № VI · <a href="#/about">Джерела та приватність</a></footer>`;
    document.title = `${view.title} — ${config.siteTitle}`;
    view.after?.(app);
    const main = document.getElementById('main')!;
    window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  };
  window.addEventListener('hashchange', render);
  render();
}
void start();
