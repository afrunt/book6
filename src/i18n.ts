export type Lang = 'uk' | 'en';

export interface CardText { title?: string; dating?: string; summary?: string; fullName?: string; years?: string; bio?: string; facts?: string[]; artifacts?: string[]; fields?: string[] }
export interface I18n {
  periods: Record<string, CardText>; siteTypes: Record<string, CardText>; regions: Record<string, CardText>;
  expeditions: Record<string, CardText>; scholars: Record<string, CardText>;
  regionNames: Record<string, string>; expeditionNames: Record<string, string>;
  siteTypeLabels: Record<string, string>; periodLabels: Record<string, string>;
}

const UK_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'y', і: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
};
const INITIAL: Record<string, string> = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };
const MEDIAL: Record<string, string> = { є: 'ie', ї: 'i', й: 'i', ю: 'iu', я: 'ia' };

/** Ukrainian national romanization (KMU 2010), word by word. */
export function translit(text: string): string {
  const src = text.replace(/зг/g, 'zgh').replace(/Зг/g, 'Zgh');
  let out = '';
  let start = true;
  for (const ch of src) {
    const low = ch.toLowerCase();
    const upper = ch !== low;
    let r: string | undefined;
    if (INITIAL[low]) r = start ? INITIAL[low] : MEDIAL[low];
    else if (UK_LAT[low] !== undefined) r = UK_LAT[low];
    else if (low === 'ь' || low === "'" || low === '’' || low === 'ʼ') r = '';
    if (r === undefined) { out += ch; start = !/[\p{L}]/u.test(ch); continue; }
    out += upper && r ? r[0].toUpperCase() + r.slice(1) : r;
    start = false;
  }
  return out;
}

/** "Яневич О.О." -> "O. O. Yanevych" */
export function latinPerson(name: string): string {
  const [surname, ...rest] = name.replace(/\.(?=\p{L})/gu, '. ').split(/\s+/);
  return [...rest.map(translit), translit(surname)].join(' ');
}

const uk = {
  siteTitle: 'Книга VI — археологічні колекції',
  description: 'Інтерактивна колекція археологічних надходжень: артефакти, місця, експедиції та науковці.',
  skip: 'До основного змісту', mainMenu: 'Основне меню', language: 'English',
  nav: { home: 'Головна', map: 'Карта', timeline: 'Шкала часу', collection: 'Колекція', scholars: 'Дослідники', about: 'Про проєкт' },
  loading: 'Завантаження…', loadFail: (m: string) => `Не вдалося завантажити дані: ${m}. Оновіть сторінку.`,
  footer: 'Дані: Книга реєстрації колекцій № VI', footerLink: 'Джерела та приватність',
  yearsOfResearch: 'Роки досліджень', districtSuffix: ' р-н', registerNo: '№',
  shown: (n: number, total: number) => `Показано ${n} з ${total}.`, allCollection: 'Уся колекція →',
  sources: 'Джерела',
  confidence: { high: 'висока достовірність', medium: 'середня достовірність', low: 'потребує перевірки' } as Record<string, string>,
  precision: { region: 'приблизно (область)', district: 'район', settlement: 'місто' } as Record<string, string>,
  noCard: 'Для цієї сутності ще немає довідкової картки — лише дані реєстру.',
  reference: 'Довідка', dating: 'Датування', didYouKnow: 'Чи знали ви?', typicalFinds: 'Типові знахідки',
  photo: 'Фото', recordsInRegister: 'Записів у реєстрі', collections: 'Колекції',
  similar: 'Схожі колекції',
  homeTitle: 'Головна', heroTitle: 'Книга VI: колекції, що чекають на відкриття',
  heroText: (n: number) => `${n} надходжень до наукового фонду Інституту археології: від кам'яної доби до козацького часу. Обирайте карту, часову шкалу чи колекцію — і дізнавайтеся більше про артефакти, місця, експедиції та науковців.`,
  btnMap: '🗺 Карта', btnTimeline: '⏳ Шкала часу', btnCollection: '📚 Колекція',
  statRecords: 'записів', statScholars: 'науковців', statExpeditions: 'експедицій', statRegions: 'регіонів', statYears: 'роки досліджень',
  mapTitle: 'Карта колекцій', epochs: 'Епохи',
  backToCollection: '← До колекції', collectionNo: 'Колекція №', act: 'Акт прийому', actFrom: ' від ', siteType: "Тип пам'ятки",
  researchTypes: 'Види досліджень', boxesUnits: 'Ящиків / одиниць зберігання', notes: 'Примітки', attachments: 'Додатки до акту',
  region: 'Область', district: 'Район', authors: 'Автори досліджень', expedition: 'Експедиція', location: 'Розташування',
  context: 'Контекст', registerNote: '',
  recordSubject: (id: string, site: string) => `Запис ${id}: ${site}`,
  noScan: 'Скан для цього запису відсутній.', scanTitle: (p: string | null) => `Скан сторінки реєстру${p ? `, стор. PDF ${p}` : ''}`,
  scanCaption: (p: string | null) => `Скан сторінки реєстру${p ? ` (стор. PDF ${p})` : ''}. Клацніть, щоб відкрити в повному розмірі. На сторінці є й інші записи.`,
  reportNoRepo: 'Знайшли помилку? Повідомте автора сайту.', reportLink: 'Повідомити про помилку',
  reportIssue: (s: string) => `Помилка в даних: ${s}`, aboutSubject: 'сторінка «Про проєкт»',
  placesHere: 'Епохи тут', years: 'Роки', regionsLabel: 'Регіони', scholarsHeading: 'Науковці',
  autoProfile: 'Профіль складено автоматично з даних реєстру.',
  scholarYears: 'Роки досліджень у реєстрі', areas: 'Області', studiedEpochs: 'Епохи, які вивчав', expeditions: 'Експедиції',
  scholarAuto: (n: number) => `Профіль складено автоматично з реєстру: ${n} записів. Біографічні відомості ще не додано.`,
  scholarsTitle: 'Дослідники', searchSurname: 'Пошук за прізвищем', surnamePlaceholder: 'Прізвище…', ofTotal: 'з', recordsWord: 'записів',
  collectionTitle: 'Колекція', search: 'Пошук', searchPlaceholder: '№ колекції, назва пункту, автор, культура…',
  all: 'Усі', period: 'Період', typeLabel: "Тип пам'ятки", authorLabel: 'Дослідник', find: 'Знайти', reset: 'Скинути', found: 'Знайдено',
  mapNote: "Положення показано приблизно — на рівні району або області. Точні координати пам'яток не публікуються, щоб захистити їх від несанкціонованих розкопок.",
  mapAria: 'Інтерактивна карта', placeList: 'Список місць (альтернатива карті)', osm: '© учасники OpenStreetMap',
  popupRecords: 'Записів', firstRecord: 'перший запис',
  timelineTitle: 'Шкала часу', byEpoch: 'За епохами', byYear: 'За роками досліджень',
  bce: (y: number) => `${y} р. до н.е.`, ce: (y: number) => `${y} р. н.е.`,
  aboutTitle: 'Про проєкт і джерела',
  aboutIntro: "Сайт створено на основі «Книги реєстрації колекцій № VI» Інституту археології НАН України (колекції № 1073–1362). Записи нормалізовано автоматично: періоди, області, автори зведено до єдиних назв, а оригінальні значення збережено.",
  aboutCover: 'Що написано на обкладинці', aboutRef: 'Довідкові дані',
  aboutRefText: "Описи епох, типів пам'яток, регіонів і науковців додано окремо й завжди супроводжуються посиланнями та рівнем достовірності. Тексти Вікіпедії (CC BY-SA 4.0) перефразовано. Карта — © учасники OpenStreetMap.",
  aboutPrivacy: "Приватність і охорона пам'яток",
  aboutPrivacyText: 'Координати показано з точністю до району чи області. Сайт не збирає персональних даних. Про науковців наведено тільки публічні професійні відомості.',
  notFoundTitle: 'Не знайдено', notFoundH: 'Сторінку не знайдено', toHome: 'На головну',
  photoAlt: 'Фото',
};

export type Dict = typeof uk;

const en: Dict = {
  siteTitle: 'Book VI — Archaeological Collections',
  description: 'An interactive catalogue of archaeological accessions: artefacts, sites, expeditions and scholars.',
  skip: 'Skip to main content', mainMenu: 'Main menu', language: 'Українська',
  nav: { home: 'Home', map: 'Map', timeline: 'Timeline', collection: 'Collection', scholars: 'Scholars', about: 'About' },
  loading: 'Loading…', loadFail: (m: string) => `Could not load the data: ${m}. Please reload the page.`,
  footer: 'Data: Accession Register of Collections, Book VI', footerLink: 'Sources and privacy',
  yearsOfResearch: 'Years of research', districtSuffix: ' district', registerNo: 'No.',
  shown: (n: number, total: number) => `Showing ${n} of ${total}.`, allCollection: 'Whole collection →',
  sources: 'Sources',
  confidence: { high: 'high confidence', medium: 'medium confidence', low: 'needs verification' },
  precision: { region: 'approximate (oblast)', district: 'district', settlement: 'city' },
  noCard: 'There is no reference card for this entry yet — only register data.',
  reference: 'Reference', dating: 'Dating', didYouKnow: 'Did you know?', typicalFinds: 'Typical finds',
  photo: 'Photo', recordsInRegister: 'Records in the register', collections: 'Collections',
  similar: 'Similar collections',
  homeTitle: 'Home', heroTitle: 'Book VI: collections waiting to be discovered',
  heroText: (n: number) => `${n} accessions to the research collection of the Institute of Archaeology, from the Stone Age to the Cossack era. Explore the map, the timeline or the collection to learn more about artefacts, sites, expeditions and scholars.`,
  btnMap: '🗺 Map', btnTimeline: '⏳ Timeline', btnCollection: '📚 Collection',
  statRecords: 'records', statScholars: 'scholars', statExpeditions: 'expeditions', statRegions: 'regions', statYears: 'years of research',
  mapTitle: 'Collections map', epochs: 'Periods',
  backToCollection: '← Back to the collection', collectionNo: 'Collection No.', act: 'Accession act', actFrom: ' dated ', siteType: 'Site type',
  researchTypes: 'Types of research', boxesUnits: 'Boxes / storage units', notes: 'Notes', attachments: 'Act attachments',
  region: 'Oblast', district: 'District', authors: 'Researchers', expedition: 'Expedition', location: 'Location',
  context: 'Context', registerNote: 'Register fields (dating, notes, act details) are shown in the original Ukrainian; site and person names are transliterated.',
  recordSubject: (id: string, site: string) => `Record ${id}: ${site}`,
  noScan: 'No scan is available for this record.', scanTitle: (p: string | null) => `Scan of the register page${p ? `, PDF p. ${p}` : ''}`,
  scanCaption: (p: string | null) => `Scan of the register page${p ? ` (PDF p. ${p})` : ''}. Click to open it in full size. The page also contains other records.`,
  reportNoRepo: 'Found a mistake? Please tell the site author.', reportLink: 'Report a mistake',
  reportIssue: (s: string) => `Data error: ${s}`, aboutSubject: '“About” page',
  placesHere: 'Periods here', years: 'Years', regionsLabel: 'Regions', scholarsHeading: 'Scholars',
  autoProfile: 'This profile was compiled automatically from the register data.',
  scholarYears: 'Years of research in the register', areas: 'Oblasts', studiedEpochs: 'Periods studied', expeditions: 'Expeditions',
  scholarAuto: (n: number) => `This profile was compiled automatically from the register: ${n} records. Biographical details have not been added yet.`,
  scholarsTitle: 'Scholars', searchSurname: 'Search by surname', surnamePlaceholder: 'Surname…', ofTotal: 'of', recordsWord: 'records',
  collectionTitle: 'Collection', search: 'Search', searchPlaceholder: 'Collection No., site name, author, culture…',
  all: 'All', period: 'Period', typeLabel: 'Site type', authorLabel: 'Researcher', find: 'Search', reset: 'Reset', found: 'Found',
  mapNote: 'Locations are approximate — at district or oblast level. Exact site coordinates are not published, to protect sites from illegal digging.',
  mapAria: 'Interactive map', placeList: 'List of places (map alternative)', osm: '© OpenStreetMap contributors',
  popupRecords: 'Records', firstRecord: 'first record',
  timelineTitle: 'Timeline', byEpoch: 'By period', byYear: 'By year of research',
  bce: (y: number) => `${y} BCE`, ce: (y: number) => `${y} CE`,
  aboutTitle: 'About the project and sources',
  aboutIntro: 'The site is based on the “Accession Register of Collections, Book VI” of the Institute of Archaeology of the National Academy of Sciences of Ukraine (collections No. 1073–1362). Records were normalised automatically: periods, oblasts and authors are unified under single names, while the original values are preserved.',
  aboutCover: 'What the cover says (original Ukrainian)', aboutRef: 'Reference material',
  aboutRefText: 'Descriptions of periods, site types, regions and scholars were added separately and are always accompanied by links and a confidence level. Wikipedia texts (CC BY-SA 4.0) are paraphrased. Map © OpenStreetMap contributors. English texts are translations of the Ukrainian originals.',
  aboutPrivacy: 'Privacy and protection of sites',
  aboutPrivacyText: 'Coordinates are shown only to district or oblast accuracy. The site does not collect personal data. Only public professional information is given about scholars.',
  notFoundTitle: 'Not found', notFoundH: 'Page not found', toHome: 'Back to the home page',
  photoAlt: 'Photo',
};

export const dicts: Record<Lang, Dict> = { uk, en };

export interface Names { region(n: string): string; expedition(n: string): string; person(n: string): string; site(s: string): string; district(n: string): string; geoLabel(l: string): string }

export function makeNames(lang: Lang, i18n?: I18n): Names {
  if (lang === 'uk' || !i18n) {
    const id = (s: string) => s;
    return { region: id, expedition: id, person: id, site: id, district: id, geoLabel: id };
  }
  const region = (n: string) => i18n.regionNames[n] || translit(n);
  return {
    region,
    expedition: (n) => i18n.expeditionNames[n] || translit(n),
    person: latinPerson,
    site: translit,
    district: (n) => `${translit(n)} district`,
    geoLabel: (l) => {
      const m = l.match(/^(.*) р-н, (.*)$/);
      return m ? `${translit(m[1])} district, ${region(m[2])}` : region(l);
    },
  };
}
