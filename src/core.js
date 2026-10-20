/* Ядро генератора: языки, бренд, промпт, проверка статьи. */
'use strict';

const DIRECTIONS = [
  'механика конкретного типа слотов (Megaways, кластерные выплаты, Hold & Win, прогрессивные джекпоты)',
  'математика бонусов и вейджера с расчётами на примерах',
  'ставки на спорт: live-беттинг, маржа букмекера, типы ставок',
  'банкролл-менеджмент и управление рисками',
  'покерная стратегия и математика покера',
  'технологии индустрии: RNG, игровые провайдеры, сертификация, лицензирование',
  'live-казино и игровые шоу',
  'психология игрока и ответственная игра',
  'настольные игры: блэкджек, рулетка, баккара — правила и математика',
  'платежи в онлайн-казино: скорость выплат, лимиты, верификация',
  'волатильность, RTP и hit rate слотов — как их читать',
];

const DEFAULT_TOPICS = [
  'Как волатильность слота влияет на длину игровой сессии: расчёт на примере банкролла 100 €',
  'Вейджер x35 против x50: сколько реально стоит бонус на 200 €',
  'Megaways-механика: откуда берутся 117 649 способов выигрыша',
  'Маржа букмекера: как посчитать её по коэффициентам за 2 минуты',
  'Почему в европейской рулетке преимущество казино вдвое ниже, чем в американской',
];

const DEFAULT_STOP = [
  'в современном мире', 'ни для кого не секрет', 'стоит отметить', 'важно понимать', 'цифровая площадка',
  'инновационный подход', 'в заключение', 'погрузимся',
  "in today's digital", "in today's fast-paced", "in today's world", "it's no secret", 'it is no secret',
  'delve', 'in conclusion', 'game-changer', 'ever-evolving', 'digital landscape', 'innovative approach',
  'digital platform', 'embark on', 'in the realm of',
  'in der heutigen digitalen', 'es ist kein geheimnis', 'abschließend lässt sich',
  "dans le monde d'aujourd'hui", "il n'est un secret pour personne",
  'en el mundo actual', 'no es ningún secreto',
];

// ───────────────────────────── ЯЗЫКИ ─────────────────────────────

const LANGS = {
  en: 'English', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian', fi: 'Finnish', cs: 'Czech', sk: 'Slovak',
  ro: 'Romanian', hu: 'Hungarian', el: 'Greek', bg: 'Bulgarian', hr: 'Croatian', sl: 'Slovenian',
  sr: 'Serbian', lt: 'Lithuanian', lv: 'Latvian', et: 'Estonian', tr: 'Turkish', ru: 'Russian',
  uk: 'Ukrainian', ja: 'Japanese', hi: 'Hindi', ga: 'Irish', is: 'Icelandic',
};

const LANG_ALIASES = {
  nb: 'no', nn: 'no', ua: 'uk', gr: 'el', cz: 'cs', se: 'sv', dk: 'da',
  english: 'en', german: 'de', deutsch: 'de', french: 'fr', spanish: 'es', italian: 'it', portuguese: 'pt',
  dutch: 'nl', polish: 'pl', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', czech: 'cs',
  slovak: 'sk', romanian: 'ro', hungarian: 'hu', greek: 'el', turkish: 'tr', russian: 'ru', ukrainian: 'uk',
  'английский': 'en', 'немецкий': 'de', 'французский': 'fr', 'испанский': 'es', 'итальянский': 'it',
  'португальский': 'pt', 'нидерландский': 'nl', 'голландский': 'nl', 'польский': 'pl', 'шведский': 'sv',
  'датский': 'da', 'норвежский': 'no', 'финский': 'fi', 'чешский': 'cs', 'словацкий': 'sk',
  'румынский': 'ro', 'венгерский': 'hu', 'греческий': 'el', 'турецкий': 'tr', 'русский': 'ru',
  'украинский': 'uk',
};

// Доменная зона → язык (только однозначные зоны; .com/.net/.io/.co и т.п. — не определяют язык)
const TLD_LANG = {
  de: 'de', at: 'de', fr: 'fr', es: 'es', mx: 'es', ar: 'es', cl: 'es', pe: 'es', it: 'it', pt: 'pt',
  br: 'pt', nl: 'nl', pl: 'pl', se: 'sv', dk: 'da', no: 'no', fi: 'fi', cz: 'cs', sk: 'sk', ro: 'ro',
  hu: 'hu', gr: 'el', bg: 'bg', hr: 'hr', si: 'sl', rs: 'sr', lt: 'lt', lv: 'lv', ee: 'et', tr: 'tr',
  uk: 'en', ie: 'en', au: 'en', nz: 'en', us: 'en', ru: 'ru', ua: 'uk', jp: 'ja', is: 'is',
};

// Частотные слова для определения языка по тексту
const STOPWORDS = {
  en: 'the and of to in is that for with are this on it as be by you your at from or can more which have will not',
  de: 'der die und das ist nicht mit den ein eine auch sich auf für von dem zu im des sie es wird werden bei oder wie',
  fr: 'le la les et des est une du que pour dans en pas sur au qui avec plus par ce aux ou sont cette vous',
  es: 'el la los las y de que en es un una por con para del al se no más su como lo pero son está',
  it: 'il di che e la per un una non sono del della con le gli più da nel anche come questo alla si dei',
  pt: 'o a os as de que e do da em um uma para com não por mais dos das no na se ao é são você',
  nl: 'de het een en van is dat op te in voor met niet zijn die ook aan er bij om als maar worden wordt je',
  pl: 'i w na z się nie do to że jest o jak po od dla przez są czy ale może oraz tak tym jego',
  sv: 'och att det som en på är av för med till den har inte om ett kan de var så vid eller från också',
  da: 'og at det en er til på af med for den ikke som har de et kan om var fra eller også være blive vi',
  no: 'og å det er en til på av med for som ikke har de et kan om var fra eller også være bli vi jeg',
  fi: 'ja on ei se että oli ole mutta kun tai myös joka jos sekä mikä ovat voi kuin niin vain tämä hän',
  cs: 'a se na je v že to s z do o jsou jako pro ale by jak tak jeho nebo také který která které',
  ro: 'și de în la cu pe că nu este o un din pentru mai care sunt se ca sau fi lui dar această',
  hu: 'a az és hogy nem is egy meg de van ez csak mint már vagy el ki még volt lesz után minden',
  tr: 've bir bu da de için ile çok daha gibi olarak olan en ne var ama kadar değil sonra ya her',
};
const SIMILAR_LANGS = [['da', 'no', 'sv'], ['cs', 'sk'], ['es', 'pt']];

function normalizeLang(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim().toLowerCase();
  if (!s) return '';
  s = s.split(/[\s(]/)[0];                       // «de (html)» → «de»
  if (LANG_ALIASES[s]) return LANG_ALIASES[s];
  const code = s.split(/[-_]/)[0];               // «de-AT» → «de»
  if (LANGS[code]) return code;
  if (LANG_ALIASES[code]) return LANG_ALIASES[code];
  return '';
}

function langName(code) { return (LANGS[code] || code) + ' (' + code + ')'; }

// Название языка на нём самом — модели так понятнее, на каком языке писать
const LANG_NATIVE = {
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', nl: 'Nederlands',
  pl: 'Polski', sv: 'Svenska', da: 'Dansk', no: 'Norsk', fi: 'Suomi', cs: 'Čeština', sk: 'Slovenčina', ro: 'Română',
  hu: 'Magyar', el: 'Ελληνικά', bg: 'Български', hr: 'Hrvatski', sl: 'Slovenščina', sr: 'Srpski', lt: 'Lietuvių',
  lv: 'Latviešu', et: 'Eesti', tr: 'Türkçe', ru: 'Русский', uk: 'Українська', ja: '日本語', hi: 'हिन्दी', ga: 'Gaeilge', is: 'Íslenska',
};
function langFull(code) { return (LANG_NATIVE[code] ? LANG_NATIVE[code] + ' — ' : '') + langName(code); }
// Языки, которые пишутся не латиницей — для них проверка «статья кириллицей» не нужна
const NON_LATIN_LANGS = ['ru', 'uk', 'bg', 'el', 'ja', 'hi'];

function areSimilarLangs(a, b) {
  if (a === b) return true;
  return SIMILAR_LANGS.some(g => g.indexOf(a) >= 0 && g.indexOf(b) >= 0);
}

/** Определение языка по тексту. Возвращает {lang, confident, ranking}. */
function detectLangFromText(text) {
  const tokens = (String(text).toLowerCase().match(/[\p{L}]+/gu) || []).slice(0, 4000);
  if (tokens.length < 30) return { lang: '', confident: false, ranking: [] };
  const scores = {};
  Object.keys(STOPWORDS).forEach(l => {
    const set = new Set(STOPWORDS[l].split(' '));
    let n = 0;
    tokens.forEach(t => { if (set.has(t)) n++; });
    scores[l] = n / tokens.length;
  });
  const ranking = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  const top = ranking[0], second = ranking[1];
  const confident = scores[top] >= 0.12 && scores[top] >= scores[second] * 1.25;
  return { lang: top, confident, ranking, scores };
}

// ───────────────────────────── URL, БРЕНД, ЯЗЫК ССЫЛКИ ─────────────────────────────

function hostOf(url) {
  const m = String(url || '').trim().toLowerCase().match(/^(?:[a-z]+:\/\/)?([^\/?#:]+)/);
  return m ? m[1] : '';
}

function pathSegments(url) {
  const s = String(url || '').trim().replace(/^[a-z]+:\/\/[^\/]+/i, '');
  return s.split(/[?#]/)[0].split('/').filter(Boolean);
}

/** Основная метка домена (без www, поддоменов и зоны, с учётом co.uk / com.br и т.п.) */
function mainDomainLabel(url) {
  const labels = hostOf(url).replace(/^www\d*\./, '').split('.').filter(Boolean);
  if (labels.length < 2) return labels[0] || '';
  const SLD = ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'gen', 'ltd', 'plc'];
  const n = labels.length;
  if (n >= 3 && SLD.indexOf(labels[n - 2]) >= 0 && labels[n - 1].length === 2) return labels[n - 3];
  return labels[n - 2];
}

function topLevelZone(url) {
  const labels = hostOf(url).split('.');
  return labels[labels.length - 1] || '';
}

// Гео-хвосты доменов-акцепторов: betano-nl, betano-schweiz, betanoswitzerland — это не часть бренда
const GEO_WORDS = 'schweiz|switzerland|suisse|svizzera|nederland|netherlands|holland|deutschland|germany|austria|oesterreich|' +
  'osterreich|belgie|belgium|espana|spain|italia|italy|france|polska|poland|portugal|canada|australia|ireland|sverige|sweden|' +
  'norge|norway|danmark|denmark|suomi|finland|greece|hellas|romania|czech|cesko|slovakia|hungary|turkey|turkiye';
const GEO_PART = new RegExp('^(?:[a-z]{2}|' + GEO_WORDS + ')$');
const GEO_SUFFIX = new RegExp('(?:' + GEO_WORDS + ')$');

/** super-slots-online.com → Super Slots Online; vulkanbet.com → Vulkanbet; betano-nl.com → Betano; betanoswitzerland.net → Betano */
function brandFromUrl(url) {
  let name = mainDomainLabel(url);
  if (!name) return '';
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  if (name.indexOf('-') >= 0) {
    const parts = name.split('-').filter(Boolean);
    while (parts.length > 1 && GEO_PART.test(parts[parts.length - 1])) parts.pop();
    return parts.map(cap).join(' ');
  }
  const geo = name.match(GEO_SUFFIX);
  if (geo && name.length - geo[0].length >= 3) name = name.slice(0, -geo[0].length);
  return cap(name);
}

/**
 * Бренд с подсказкой из анкора: betanonl.net + «betano casino» → Betano.
 * Если слово анкора — начало домена, берём его (домены часто = бренд + гео/суффикс).
 */
function brandGuess(acceptorUrl, anchor) {
  if (mainDomainLabel(acceptorUrl).indexOf('-') >= 0) return brandFromUrl(acceptorUrl);   // гео-хвост отрезается там
  const label = mainDomainLabel(acceptorUrl);
  const words = (String(anchor || '').match(/[\p{L}\p{N}]+/gu) || []).filter(w => w.length >= 3);
  let best = '';
  words.forEach(w => {
    const lw = w.toLowerCase();
    if (label.indexOf(lw) === 0 && lw.length > best.length) best = lw;
  });
  if (best && best.length < label.length) return best.charAt(0).toUpperCase() + best.slice(1);
  return brandFromUrl(acceptorUrl);
}

// Страна акцептора — для голоса специалиста в цитате (вариант Б)
const COUNTRY_BY_CODE = {
  ch: 'Швейцария', nl: 'Нидерланды', de: 'Германия', at: 'Австрия', be: 'Бельгия', fr: 'Франция', es: 'Испания',
  it: 'Италия', pt: 'Португалия', br: 'Бразилия', pl: 'Польша', se: 'Швеция', dk: 'Дания', no: 'Норвегия', fi: 'Финляндия',
  cz: 'Чехия', sk: 'Словакия', ro: 'Румыния', hu: 'Венгрия', gr: 'Греция', uk: 'Великобритания', ie: 'Ирландия',
  ca: 'Канада', au: 'Австралия', nz: 'Новая Зеландия', mx: 'Мексика', ar: 'Аргентина', cl: 'Чили', pe: 'Перу', tr: 'Турция',
  bg: 'Болгария', hr: 'Хорватия', si: 'Словения', rs: 'Сербия', lt: 'Литва', lv: 'Латвия', ee: 'Эстония', ua: 'Украина',
  jp: 'Япония', is: 'Исландия', lu: 'Люксембург',
};
const COUNTRY_BY_WORD = {
  schweiz: 'ch', switzerland: 'ch', suisse: 'ch', svizzera: 'ch', nederland: 'nl', netherlands: 'nl', holland: 'nl',
  deutschland: 'de', germany: 'de', austria: 'at', oesterreich: 'at', osterreich: 'at', belgie: 'be', belgium: 'be',
  espana: 'es', spain: 'es', italia: 'it', italy: 'it', france: 'fr', polska: 'pl', poland: 'pl', portugal: 'pt',
  canada: 'ca', australia: 'au', ireland: 'ie', sverige: 'se', sweden: 'se', norge: 'no', norway: 'no', danmark: 'dk',
  denmark: 'dk', suomi: 'fi', finland: 'fi', greece: 'gr', hellas: 'gr', romania: 'ro', czech: 'cz', cesko: 'cz',
  slovakia: 'sk', hungary: 'hu', turkey: 'tr', turkiye: 'tr',
};
const COUNTRY_BY_LANG = { nl: 'nl', de: 'de', fr: 'fr', es: 'es', it: 'it', pt: 'pt', pl: 'pl', sv: 'se', da: 'dk', no: 'no',
  fi: 'fi', cs: 'cz', sk: 'sk', ro: 'ro', hu: 'hu', el: 'gr', bg: 'bg', hr: 'hr', sl: 'si', sr: 'rs', lt: 'lt', lv: 'lv',
  et: 'ee', tr: 'tr', uk: 'ua', ja: 'jp', is: 'is' };

/** betanoswitzerland.net → Швейцария, betano-nl.com → Нидерланды, site.de → Германия; иначе по языку ссылки; '' — не понять */
function acceptorCountry(url, langLink) {
  const zone = topLevelZone(url);
  if (COUNTRY_BY_CODE[zone]) return COUNTRY_BY_CODE[zone];
  const label = mainDomainLabel(url);
  const parts = label.split('-');
  for (let i = parts.length - 1; i >= 1; i--) if (COUNTRY_BY_CODE[parts[i]]) return COUNTRY_BY_CODE[parts[i]];
  const word = Object.keys(COUNTRY_BY_WORD).find(w => label.indexOf(w) >= 0);
  if (word) return COUNTRY_BY_CODE[COUNTRY_BY_WORD[word]];
  return COUNTRY_BY_CODE[COUNTRY_BY_LANG[langLink]] || '';
}

/** Случайные инициалы для вымышленного специалиста — чтобы имена не повторялись от статьи к статье */
function expertInitials(rnd) {
  const L = 'ABDEFGHJKLMNPRSTVW';
  const r = rnd || Math.random;
  return L[Math.floor(r() * L.length)] + '. ' + L[Math.floor(r() * L.length)] + '.';
}

/** Язык по URL: путь (/de/, /en-gb/), поддомен (de.site.com), зона. Возвращает {lang, source}. */
function langFromUrl(url) {
  const segs = pathSegments(url).slice(0, 2);
  for (const seg of segs) {
    const m = seg.toLowerCase().match(/^([a-z]{2})(?:[-_][a-z]{2})?$/);
    if (m && normalizeLang(m[1])) return { lang: normalizeLang(m[1]), source: 'путь /' + seg + '/' };
  }
  const labels = hostOf(url).split('.');
  if (labels.length >= 3 && /^[a-z]{2}$/.test(labels[0]) && LANGS[labels[0]]) {
    return { lang: labels[0], source: 'поддомен ' + labels[0] };
  }
  const tld = topLevelZone(url);
  if (TLD_LANG[tld]) return { lang: TLD_LANG[tld], source: 'зона .' + tld };
  return { lang: '', source: '' };
}

function htmlLangAttr(html) {
  const m = String(html).match(/<html[^>]*\blang\s*=\s*["']?([a-zA-Z_-]+)/i);
  if (m) return normalizeLang(m[1]);
  const og = String(html).match(/property\s*=\s*["']og:locale["'][^>]*content\s*=\s*["']([a-zA-Z_-]+)/i);
  return og ? normalizeLang(og[1]) : '';
}

/**
 * Язык сайта по его странице: текст надёжнее атрибута lang (темы WordPress часто оставляют lang="en-US").
 * Возвращает {lang, source} или {lang: ''}.
 */
function guessLangFromHtml(html) {
  const attr = htmlLangAttr(html);
  const det = detectLangFromText(visibleText(html));
  if (det.confident) {
    // близкие языки (da/no/sv, cs/sk, es/pt) текстом различаются плохо — тут верим атрибуту
    if (attr && attr !== det.lang && areSimilarLangs(attr, det.lang)) return { lang: attr, source: 'сайт: lang="' + attr + '"' };
    return { lang: det.lang, source: 'сайт: текст страницы' };
  }
  if (attr) return { lang: attr, source: 'сайт: lang="' + attr + '"' };
  return { lang: '', source: '' };
}

function visibleText(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&');
}

/** Тематика сайта: title + meta description */
function siteTopic(html) {
  const t = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const d = String(html).match(/<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)/i) ||
    String(html).match(/<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i);
  return [t ? decodeEntities(t[1]).trim() : '', d ? decodeEntities(d[1]).trim() : '']
    .filter(Boolean).join(' — ').replace(/\s+/g, ' ').slice(0, 300);
}

// ───────────────────────────── ОЧИСТКА И ПРОВЕРКА СТАТЬИ ─────────────────────────────

function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Убирает ```html, обёртки документа, лишние атрибуты; ставит точный href акцептора. */
function sanitizeHtml(raw, acceptor) {
  let h = String(raw || '').trim();
  const fence = h.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) h = fence[1];
  const body = h.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) h = body[1];
  h = h.replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<(head|script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(html|body|meta|link)[^>]*>/gi, '');
  // атрибуты: оставляем только href у <a>
  h = h.replace(/<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*?)?(\/?)>/g, (m, tag, attrs, selfClose) => {
    const t = tag.toLowerCase();
    if (t === 'a') return '<a href="' + escapeAttr(acceptor) + '">';
    return '<' + t + (selfClose ? ' /' : '') + '>';
  });
  h = h.replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*>/g, (m, tag) => '</' + tag.toLowerCase() + '>');
  return h.trim();
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Буквы, которые и выглядят, и звучат одинаково в латинице и кириллице. р/с/у/х/в/н сюда не входят:
// модель путает их то по виду (сontrol), то по звучанию (zodра = zodra), угадать нельзя — такие слова только показываем
const CYR_TO_LAT = { 'а': 'a', 'е': 'e', 'о': 'o', 'к': 'k', 'м': 'm', 'т': 't',
  'А': 'A', 'Е': 'E', 'О': 'O', 'К': 'K', 'М': 'M', 'Т': 'T' };
const LAT_TO_CYR = {};
Object.keys(CYR_TO_LAT).forEach(c => { if (!LAT_TO_CYR[CYR_TO_LAT[c]]) LAT_TO_CYR[CYR_TO_LAT[c]] = c; });
const WORD_RE = /[\p{L}]+/gu;
const isMixed = w => /\p{Script=Latin}/u.test(w) && /\p{Script=Cyrillic}/u.test(w);

/** Слова, где перемешаны латиница и кириллица (zodра) */
function mixedScriptWords(text) {
  return (String(text).match(WORD_RE) || []).filter(isMixed);
}

/** Ставкa → Ставка, mаrge → marge: однозначные буквы меньшинства заменяем буквами алфавита, которого в слове больше */
function fixMixedScript(text) {
  return String(text).replace(WORD_RE, w => {
    if (!isMixed(w)) return w;
    const cyr = (w.match(/\p{Script=Cyrillic}/gu) || []).length;
    const lat = (w.match(/\p{Script=Latin}/gu) || []).length;
    const map = lat >= cyr ? CYR_TO_LAT : LAT_TO_CYR;
    const fixed = w.replace(/./gu, ch => map[ch] || ch);
    return isMixed(fixed) ? w : fixed;   // если заменить нечем — оставляем, проверка покажет мелочь
  });
}

/** Мелкие ошибки исправляем кодом, без лишнего запроса к модели (быстрее). */
function autoFix(h, ctx) {
  h = String(h).replace(/\*\*([^*<>]+)\*\*/g, '$1');
  h = h.replace(/>([^<]+)</g, (m, text) => '>' + fixMixedScript(text) + '<');
  const aRe = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  const links = h.match(aRe) || [];
  // одна ссылка, но анкор изменён (регистр/падеж) — ставим анкор дословно
  if (links.length === 1) h = h.replace(aRe, '<a href="' + escapeAttr(ctx.acceptor) + '">' + escapeHtml(ctx.anchor) + '</a>');
  return h;
}

function stripTags(h) { return decodeEntities(String(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }

function countWords(text) {
  return (String(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
}

function countBrand(text, brand) {
  if (!brand) return 0;
  const forms = [brand];
  const joined = brand.replace(/\s+/g, '');
  if (joined !== brand) forms.push(joined);
  // короткий бренд без цифр (например «Spin») — считаем с учётом регистра, чтобы не ловить обычные слова
  const caseInsensitive = brand.length >= 6 || /\d|\s/.test(brand);
  const re = new RegExp('(?<![\\p{L}\\p{N}])(?:' + forms.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}])',
    caseInsensitive ? 'giu' : 'gu');
  return (String(text).match(re) || []).length;
}

/** Делит статью на части: до первого <h2> и 4 раздела. */
function splitSections(h) {
  const parts = String(h).split(/(?=<h2[\s>])/i);
  return { head: parts[0] || '', sections: parts.slice(1) };
}

/** Блоки раздела (p / blockquote / ul / ol / table) по порядку, без заголовка */
function sectionBlocks(section) {
  const body = section.replace(/<h2[\s\S]*?<\/h2>/i, '');
  const re = /<(p|blockquote|ul|ol|table)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(body)) !== null) blocks.push({ tag: m[1].toLowerCase(), html: m[0] });
  return blocks;
}

/**
 * Проверка статьи. ctx: {acceptor, anchor, brand, cross, lang, minWords, maxWords, stop[], usedH1[]}
 * Возвращает {errors[] — критичные (нарушают ТЗ по ссылке/бренду/языку), soft[] — мелочи, h1, words}
 */
function validateArticle(h, ctx) {
  const errors = [], soft = [];
  const E = m => errors.push(m), S = m => soft.push(m);
  const count = re => (h.match(re) || []).length;

  if (/```|\*\*/.test(h)) S('В тексте остались символы Markdown (``` или **) — нужен только HTML');

  const h1s = h.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1 = h1s.length ? stripTags(h1s[0]) : '';
  if (h1s.length !== 1) E('Должен быть ровно один <h1>, сейчас ' + h1s.length);
  if (h1 && countBrand(h1, ctx.brand) > 0) E('Бренд «' + ctx.brand + '» нельзя использовать в <h1>');
  if (h1 && (ctx.usedH1 || []).some(x => String(x).trim().toLowerCase() === h1.toLowerCase())) {
    E('Заголовок <h1> повторяет уже использованный — придумай другую тему');
  }

  // <h2> — короткий подзаголовок; модель иногда кладёт в него целый абзац
  const h2Texts = (h.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi) || []).map(stripTags);
  const longH2 = h2Texts.filter(x => countWords(x) > 12).length;
  if (longH2) E('Заголовки <h2> должны быть короткими подзаголовками (3–8 слов), а не абзацами: ' + longH2 + ' шт. длиннее 12 слов. Текст раздела — только в <p>, <ul>, <ol>, <table>');

  const mixed = mixedScriptWords(stripTags(h));
  if (mixed.length) S('Слова со смешанными буквами (латиница + кириллица): ' + mixed.slice(0, 5).join(', '));

  const { head, sections } = splitSections(h);
  if (sections.length < 3 || sections.length > 5) E('Нужно ровно 4 раздела <h2>, сейчас ' + sections.length);
  else if (sections.length !== 4) S('Нужно ровно 4 раздела <h2>, сейчас ' + sections.length);
  if (stripTags(head.replace(/<h1[\s\S]*?<\/h1>/i, '')).length > 0) S('Между <h1> и первым <h2> не должно быть текста');

  // Ссылка — всегда критично
  const aCount = count(/<a\b/gi);
  const aMatch = h.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
  if (aCount !== 1) E('Нужен ровно один тег <a> (ссылка на акцептор), сейчас ' + aCount);
  if (aMatch) {
    const text = stripTags(aMatch[1]);
    const want = String(ctx.anchor).replace(/\s+/g, ' ').trim();
    if (text !== want) E('Текст ссылки должен быть ровно «' + want + '» (без изменения формы/регистра), сейчас «' + text + '»');
  }

  const bqCount = count(/<blockquote\b/gi);
  if (sections.length >= 1) {
    const s0 = sections[0];
    const blocks = sectionBlocks(s0);
    if (!/<a\b/i.test(s0)) E('Ссылка должна быть в первом разделе <h2>');
    if (ctx.cross) {
      if (bqCount !== 1) E('Нужен ровно один <blockquote> с цитатой на языке ссылки, сейчас ' + bqCount);
      if (!(blocks[1] && blocks[1].tag === 'blockquote' && /<a\b/i.test(blocks[1].html))) {
        E('В первом разделе порядок должен быть: <p> переход → <blockquote> с ссылкой → <p> перевод цитаты. Ссылка — внутри <blockquote>, вторым блоком');
      }
      if (!(blocks[2] && blocks[2].tag === 'p')) S('Сразу после <blockquote> нужен <p>, который продолжает мысль специалиста на языке статьи');
      // перед цитатой — нормальное вступление, а не одна фраза «аналитик X объясняет…»
      if (blocks[0] && blocks[0].tag === 'p' && countWords(stripTags(blocks[0].html)) < 30) {
        S('Перед цитатой нужен полноценный вступительный абзац (2–3 предложения по теме), а не одна фраза-подводка');
      }
      const bq = blocks[1] && blocks[1].tag === 'blockquote' ? blocks[1].html : '';
      if (bq) {
        // «betano live wetten erfreut sich…» — анкор подлежащим в начале цитаты звучит неестественно
        const inner = bq.replace(/^<blockquote[^>]*>\s*(?:<p[^>]*>\s*)?/i, '');
        if (/^[„"«“‚'\s]*<a\b/i.test(inner)) E('Цитата начинается с анкора — встрой ссылку в середину или конец фразы (например «…bei Anbietern wie АНКОР…»)');
        const sentences = stripTags(bq).split(/[.!?…]+(?=\s|$|["»“”])/).filter(x => x.trim().length > 3).length;
        if (sentences > 2) S('Цитата длиннее 2 предложений (' + sentences + ')');
      }
    } else {
      if (bqCount > 0) E('<blockquote> запрещён (языки донора и ссылки совпадают)');
      // по ТЗ: 1-й или 2-й абзац, изредка 3-й
      const at = blocks.findIndex(b => /<a\b/i.test(b.html));
      if (/<a\b/i.test(s0) && !(at >= 0 && at <= 2 && blocks[at].tag === 'p')) {
        E('Ссылка должна стоять в 1-м, 2-м или 3-м абзаце <p> первого раздела <h2>');
      }
    }
    if (/<(ul|ol|table)\b/i.test(s0)) S('В первом разделе (со ссылкой) не должно быть списков и таблиц');
    const b0 = countBrand(stripTags(s0.replace(/<a\b[\s\S]*?<\/a>/gi, ' ')), ctx.brand);
    if (b0 > 0) E('В первом разделе (со ссылкой) бренд упоминать нельзя, сейчас ' + b0 + ' раз(а)');
  }
  let brandTotal = 0;
  for (let i = 1; i < Math.min(sections.length, 4); i++) {
    const b = countBrand(stripTags(sections[i].replace(/<a\b[\s\S]*?<\/a>/gi, ' ')), ctx.brand);
    brandTotal += b;
    if (b !== 1) S('В разделе <h2> №' + (i + 1) + ' бренд «' + ctx.brand + '» должен быть ровно 1 раз, сейчас ' + b);
  }
  if (sections.length > 1 && brandTotal === 0) E('Бренд «' + ctx.brand + '» не упомянут ни разу (нужно по 1 разу в разделах №2–4)');

  // Списки и таблица
  const ul = count(/<ul\b/gi), ol = count(/<ol\b/gi), tb = count(/<table\b/gi);
  if (ul !== 1) S('Нужен ровно один маркированный список <ul>, сейчас ' + ul);
  if (ol !== 1) S('Нужен ровно один нумерованный список <ol>, сейчас ' + ol);
  if (tb !== 1) S('Нужна ровно одна таблица <table>, сейчас ' + tb);
  if (tb === 1 && !/<th\b/i.test(h)) S('В таблице нужна строка заголовков <th>');

  // Объём: небольшое отклонение — мелочь, сильное — критично
  const text = stripTags(h);
  const words = countWords(text);
  if (words < ctx.minWords || words > ctx.maxWords) {
    const msg = 'Объём ' + words + ' слов, нужно ' + ctx.minWords + '–' + ctx.maxWords +
      (words < ctx.minWords ? ' — добавь конкретики (цифры, пример расчёта)' : ' — сократи воду');
    if (words < ctx.minWords * 0.85 || words > ctx.maxWords * 1.15) E(msg); else S(msg);
  }

  // Стоп-фразы
  const low = text.toLowerCase();
  const found = (ctx.stop || []).filter(p => p && low.indexOf(String(p).toLowerCase()) >= 0);
  if (found.length) S('Убери запрещённые фразы: ' + found.map(f => '«' + f + '»').join(', '));

  // Статья кириллицей вместо латиницы (модель «съехала» на язык инструкций) — критично.
  // Проверка по частотным словам русский не знает, поэтому смотрим на алфавит.
  if (ctx.lang && NON_LATIN_LANGS.indexOf(ctx.lang) < 0) {
    const body = stripTags(h.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' '));
    const cyr = (body.match(/\p{Script=Cyrillic}/gu) || []).length;
    const lat = (body.match(/\p{Script=Latin}/gu) || []).length;
    if (cyr > lat) E('Статья написана кириллицей (похоже на русский), а нужен ' + langFull(ctx.lang) + '. Перепиши всю статью на этом языке');
  }

  // Язык статьи (без цитаты) — критично
  if (ctx.lang && STOPWORDS[ctx.lang]) {
    const det = detectLangFromText(stripTags(h.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')));
    if (det.confident && !areSimilarLangs(det.lang, ctx.lang)) {
      E('Статья написана не на том языке (похоже на ' + langName(det.lang) + '), нужен ' + langName(ctx.lang));
    }
  }

  return { errors, soft, h1, words };
}

// ───────────────────────────── ПРОМПТ ─────────────────────────────

function systemPrompt() {
  return [
    'РОЛЬ: Senior SEO-копирайтер в нише iGaming (казино, слоты, ставки, покер). Пишешь экспертные аналитические статьи с одной SEO-ссылкой и упоминаниями бренда. Выводишь только чистый HTML.',
    '',
    'ЯЗЫК: вся статья строго на «Языке статьи» из задания (кроме цитаты в варианте Б). Пиши как носитель языка, без кальки с русского.',
    'ВАЖНО: эти инструкции написаны по-русски только для удобства. Статья НИКОГДА не пишется на русском, если «Язык статьи» не русский: заголовки, абзацы, списки и таблица — целиком на «Языке статьи».',
    '',
    'СТРУКТУРА (строго в этом порядке):',
    '<h1> — уникальный конкретный заголовок, БЕЗ бренда.',
    'Каждый <h2> — КОРОТКИЙ подзаголовок из 3–8 слов, без точки в конце. Никогда не пиши в <h2> предложения и абзацы: весь текст раздела — только в <p>, <ul>, <ol>, <table>.',
    '<h2> №1 — 3 блока (см. правило ссылки). Здесь SEO-ссылка. Бренда здесь НЕТ. Списков и таблиц НЕТ.',
    '<h2> №2 — 2 абзаца <p> + маркированный список <ul> (4–5 пунктов <li>). Ровно 1 упоминание бренда.',
    '<h2> №3 — 2 абзаца <p> + таблица <table> с первой строкой <th> (3–5 строк данных, сравнение в цифрах). Ровно 1 упоминание бренда.',
    '<h2> №4 — 2 абзаца <p> + нумерованный список <ol> (3–5 пунктов <li>). Ровно 1 упоминание бренда.',
    'Никакого текста между <h1> и первым <h2>.',
    'ОБЪЁМ: вся статья от {MIN} до {MAX} слов, включая списки и таблицу. Пиши около {SEC} слов на раздел <h2>: абзац — 2–4 коротких предложения, пункт списка — одна строка. Превысить {MAX} хуже, чем написать чуть короче.',
    '',
    'ШАБЛОН — заполни его, не меняя теги и их порядок (в варианте Б второй <p> раздела №1 заменяется на <blockquote>, см. ниже):',
    '<h1>…</h1>',
    '<h2>…</h2><p>…</p><p>… <a href="АКЦЕПТОР">АНКОР</a> …</p><p>…</p>',
    '<h2>…</h2><p>… БРЕНД + слово casino на языке статьи …</p><p>…</p><ul><li>…</li><li>…</li><li>…</li><li>…</li></ul>',
    '<h2>…</h2><p>… БРЕНД …</p><p>…</p><table><tr><th>…</th><th>…</th><th>…</th></tr><tr><td>…</td><td>…</td><td>…</td></tr>…</table>',
    '<h2>…</h2><p>… БРЕНД …</p><p>…</p><ol><li>…</li><li>…</li><li>…</li></ol>',
    '',
    'SEO-ССЫЛКА (в разделе <h2> №1). Анкор вставляй ДОСЛОВНО, символ в символ: без изменения падежа, формы, регистра.',
    'Вариант А (языки совпадают): раздел №1 = 3 абзаца <p>. В 1-м или 2-м <p> естественно встроена <a href="АКЦЕПТОР">АНКОР</a>.',
    'Вариант Б (языки разные): раздел №1 = <p> → <blockquote> → <p>. Цитата должна звучать как живые слова специалиста из «Страны акцептора»:',
    '  1) <p> на «Языке статьи», 3–4 предложения: сначала обычное вступление по теме раздела (2–3 предложения, без бренда), и только последнее предложение подводит к мнению специалиста — его профессия (аналитик рынка азартных игр, специалист по ставкам, консультант по игорному праву и т.п.), страна и вымышленные имя и фамилия полностью (см. задание). Не начинай статью со специалиста. Без титулов, без названий реальных компаний, университетов и организаций.',
    '  2) <blockquote> — прямая речь этого специалиста: 1–2 предложения строго на «Языке ссылки», так, как сказал бы носитель из этой страны. Внутри — <a href="АКЦЕПТОР">АНКОР</a>, встроенная в середину или конец фразы как естественная её часть (например: «…op platforms zoals АНКОР, waar…», «…bei Anbietern wie АНКОР…»). НИКОГДА не начинай цитату с анкора и не делай анкор подлежащим.',
    '  3) <p> на «Языке статьи»: 2–3 предложения, которые развивают мысль специалиста применительно к теме статьи. Цитату НЕ переводи и не пересказывай. В этом абзаце нет ни анкора, ни бренда.',
    '',
    'БРЕНД: ровно 3 упоминания — по одному в разделах №2, №3, №4.',
    '№2 — бренд + слово «казино» на языке статьи (например «Brand casino» / «Brand Casino» / «casino Brand» по нормам языка); №3 и №4 — чистый бренд.',
    'Бренд — только нейтральное упоминание как пример платформы, одной фразой на языке статьи. НЕ приписывай бренду функции, лимиты, сроки выплат, правила, бонусы, рекомендации и любые другие утверждения о нём — это реальная компания, а ты не знаешь её условий. Никаких призывов играть, регистрироваться, вносить депозит, никаких бонус-кодов и обещаний выигрыша.',
    '',
    'ФАКТЫ И ЦИФРЫ: только общеизвестные данные — типичные диапазоны RTP (например, большинство видеослотов 94–97%), стандартные механики, математика вейджера и маржи с расчётами на примерах. RTP конкретного слота — только если уверен. ЗАПРЕЩЕНО выдумывать исследования, опросы, статистику рынка, «средние» и «типичные» проценты, даты, имена экспертов (кроме одного вымышленного специалиста в цитате варианта Б) и источники.',
    'ТАБЛИЦА: только (а) расчёт на условном примере, который виден из текста (коэффициенты → маржа; бонус и вейджер → оборот и ожидаемая потеря; ставка и RTP → средняя потеря за N спинов), или (б) общеизвестные параметры правил игр (например, число зеро и преимущество казино в европейской и американской рулетке). ЗАПРЕЩЕНЫ таблицы «средних значений по рынку», «по лигам», «по минутам матча», «по годам», а также сравнения реальных операторов и их условий.',
    '',
    'СТИЛЬ: аналитика, конкретика, короткие предложения, примеры с расчётами. Абзацы начинаются по-разному. Без воды, вводных клише и рекламного тона.',
    'Запрещённые фразы (и их аналоги на любом языке): {STOP}.',
    '',
    'КОД: ровно один тег <a> на всю статью. <blockquote> — только в варианте Б. Без <html>, <head>, <body>, стилей, классов и любых атрибутов (кроме href). Без Markdown.',
    '',
    'ПЕРЕД ВЫВОДОМ проверь про себя (проверку не выводи): все <h2> — короткие подзаголовки; ссылка на месте и анкор дословный; бренд ровно 3 раза в разделах №2–4, не в <h1> и без утверждений о нём; <ul>, <table>, <ol> на своих местах; в таблице только расчёт или правила игр; язык статьи верный, все слова написаны буквами одного алфавита; объём не больше {MAX} слов; нет запрещённых фраз и выдуманных источников.',
    '',
    'ФОРМАТ ВЫВОДА: только HTML-код статьи в одном блоке ```html ... ```, без слов до или после.',
  ].join('\n');
}

function userPrompt(t) {
  const lines = [
    'ЯЗЫК СТАТЬИ: ' + langFull(t.langDonor) + (t.langDonor !== 'ru' ? ' — вся статья на этом языке, НЕ на русском.' : ''),
    'Донор: ' + t.donor,
    'Язык статьи (язык донора): ' + langFull(t.langDonor),
    'Акцептор: ' + t.acceptor,
    'Анкор: ' + t.anchor,
    'Язык ссылки: ' + langFull(t.langLink),
    'Вариант ссылки: ' + (t.cross ? 'Б (языки разные — цитата специалиста в <blockquote> на языке ссылки, без перевода)' : 'А (языки совпадают — ссылка в 1-м или 2-м абзаце)'),
    'Бренд: ' + t.brand,
  ];
  if (t.cross) {
    lines.push('Страна акцептора: ' + (t.country || 'страна, где говорят на «Языке ссылки»'));
    const ini = String(t.initials || '').match(/[A-Z]/g) || [];
    lines.push('Специалист для цитаты: придумай полное имя и фамилию, типичные для этой страны' +
      (ini.length === 2 ? ' (имя на букву ' + ini[0] + ', фамилия на букву ' + ini[1] + ')' : '') +
      '. Пиши имя и фамилию полностью, не инициалами.');
  }
  if (t.topic) {
    lines.push('Тема: ' + t.topic + ' (переведи и адаптируй заголовок на язык статьи)');
  } else if (t.bridge) {
    lines.push('Тема: придумай сам — на СТЫКЕ тематики сайта-донора и iGaming/онлайн-игр. ' +
      'Угол зрения — из ниши донора, основное содержание — про казино, слоты, ставки или игровую индустрию ' +
      '(пример: сайт про освещение → «Инновации в освещении и их применение в дизайне онлайн-игр»; ' +
      'сайт про моду → «Одежда для геймеров: инклюзивность и комфорт за долгой сессией»).');
    lines.push('Тематика донора: ' + (t.donorTopic || 'не удалось определить — ориентируйся на домен ' + t.donor));
    if (t.examples.length) lines.push('Примеры удачных тем (ориентир по стилю и конкретике, не копировать):\n- ' + t.examples.join('\n- '));
  } else {
    lines.push('Тема: придумай сам. Направление: ' + t.direction + '. Тема должна быть узкой и конкретной. Тематику сайта-донора игнорируй.');
    if (t.examples.length) lines.push('Примеры удачных тем (ориентир по стилю и конкретике, не копировать):\n- ' + t.examples.join('\n- '));
  }
  if (t.usedH1.length) lines.push('Уже использованные заголовки — НЕ повторяй и не делай похожих:\n- ' + t.usedH1.join('\n- '));
  return lines.join('\n');
}

/** Красиво переносит строки в HTML для удобного копирования */
function prettyHtml(h) {
  return String(h)
    .replace(/\s*(<\/(h1|h2|p|ul|ol|table|blockquote|tr)>)\s*/gi, '$1\n')
    .replace(/\s*(<\/li>)\s*/gi, '$1\n')
    .replace(/\s*(<(ul|ol|table|blockquote|tr)>)\s*/gi, '$1\n')
    .replace(/\n{2,}/g, '\n').trim();
}

/** Разбор ответа: {text} | {retry} | {dropThinking} | {switchModel} | {error, fatal} */
function geminiParse(code, txt, s) {
  if (code === 200) {
    const j = JSON.parse(txt);
    const c = j.candidates && j.candidates[0];
    if (!c || !c.content || !c.content.parts) {
      const reason = (c && c.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || 'неизвестно';
      return { error: 'Пустой ответ модели (причина: ' + reason + ')' };
    }
    return { text: c.content.parts.filter(p => !p.thought).map(p => p.text || '').join('') };
  }
  if (code === 429) {
    const q = parseQuota(txt);
    if (q.perDay || q.limitZero) {
      if (s.fallbacks && s.fallbacks.length) return { dailyLimit: true, unavailable: q.limitZero && !q.perDay, quota: q };
      return { error: q.limitZero && !q.perDay
        ? 'Модель «' + s.model + '» недоступна на бесплатном тарифе (лимит 0) — выберите другую в Настройках'
        : 'Дневной лимит бесплатного API исчерпан по всем моделям — продолжите завтра', fatal: true };
    }
    return { retry: true, waitMs: q.retryMs, quota: q };
  }
  if (code >= 500) return { retry: true, waitMs: 5000, quota: { metric: 'сервер Google перегружен' } };
  if (code === 400 && /thinking/i.test(txt) && !s.noThinkingCfg) return { dropThinking: true };
  const suggested = code === 404 && txt.match(/use (?:models\/)?(gemini-[\w.-]+)/i);
  if (suggested && suggested[1] !== s.model) return { switchModel: suggested[1] };
  if (code === 404 && s.fallbacks && s.fallbacks.length) return { dailyLimit: true, unavailable: true };
  return { error: 'Gemini ' + code + ': ' + txt.slice(0, 300), fatal: [400, 401, 403, 404].indexOf(code) >= 0 };
}


/** Разбор ответа 429: какой лимит сработал, сколько ждать */
function parseQuota(txt) {
  const q = { perDay: false, limitZero: false, retryMs: 0, metric: '' };
  let j = null;
  try { j = JSON.parse(txt); } catch (e) { j = null; }
  const details = (j && j.error && j.error.details) || [];
  details.forEach(d => {
    const type = String(d['@type'] || '');
    if (/RetryInfo/.test(type) && d.retryDelay) q.retryMs = Math.ceil(parseFloat(d.retryDelay) * 1000) || 0;
    if (/QuotaFailure/.test(type)) (d.violations || []).forEach(v => {
      const id = String(v.quotaId || '') + ' ' + String(v.quotaMetric || '');
      if (/PerDay/i.test(id)) q.perDay = true;
      if (/token/i.test(id)) q.metric = 'токенов в минуту'; else if (!q.metric) q.metric = /PerDay/i.test(id) ? 'запросов в день' : 'запросов в минуту';
      if (String(v.quotaValue) === '0') q.limitZero = true;
    });
  });
  if (!details.length) {
    if (/per ?day|PerDay|daily/i.test(txt)) q.perDay = true;
    const m = String(txt).match(/retry in ([\d.]+)s/i);
    if (m) q.retryMs = Math.ceil(parseFloat(m[1]) * 1000);
  }
  if (/limit: 0\b/.test(txt)) q.limitZero = true;
  if (!q.metric) q.metric = q.perDay ? 'запросов в день' : 'запросов в минуту';
  return q;
}

// ───────────────────────────── ДЛЯ ПРОГРАММЫ ─────────────────────────────

const LANG_RU = {
  en: 'английский', de: 'немецкий', fr: 'французский', es: 'испанский', it: 'итальянский', pt: 'португальский',
  nl: 'нидерландский', pl: 'польский', sv: 'шведский', da: 'датский', no: 'норвежский', fi: 'финский',
  cs: 'чешский', sk: 'словацкий', ro: 'румынский', hu: 'венгерский', el: 'греческий', bg: 'болгарский',
  hr: 'хорватский', sl: 'словенский', sr: 'сербский', lt: 'литовский', lv: 'латышский', et: 'эстонский',
  tr: 'турецкий', ru: 'русский', uk: 'украинский', ja: 'японский', hi: 'хинди', ga: 'ирландский', is: 'исландский',
};

const IMPORT_MAP = {
  donor: ['domain', 'донор', 'donor', 'сайт'],
  anchor: ['anchor', 'анкор'],
  acceptor: ['project', 'акцептор', 'acceptor', 'проект'],
  langLink: ['язык ссылки', 'link language'],
  topic: ['тема', 'topic'],
};

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

function looksLikeUrl(s) { return /^(https?:\/\/)?[^\s\/]+\.[a-z]{2,}(\/|$)/i.test(String(s || '').trim()); }

/**
 * Разбор вставки из Excel. cells: массив строк, каждая — массив {text, href}.
 * Возвращает {rows:[{donor, anchor, acceptor, langLink, topic}], error}
 */
function parseRows(cells) {
  cells = cells.filter(r => r.some(c => String(c.text || '').trim()));
  if (!cells.length) return { rows: [], error: 'Пусто — скопируйте строки в Excel и вставьте сюда' };
  const head = cells[0].map(c => String(c.text || '').trim().toLowerCase());
  const idx = {};
  Object.keys(IMPORT_MAP).forEach(k => { idx[k] = head.findIndex(h => IMPORT_MAP[k].indexOf(h) >= 0); });
  let first = 1;
  if (idx.donor < 0 || idx.anchor < 0 || idx.acceptor < 0) {
    first = 0; idx.langLink = -1; idx.topic = -1;
    const width = Math.max.apply(null, cells.map(r => r.length));
    if (width >= 11) { idx.donor = 0; idx.anchor = 2; idx.acceptor = 10; }
    else if (width === 3) { idx.donor = 0; idx.anchor = 1; idx.acceptor = 2; }
    else return { rows: [], error: 'Не понял колонки. Скопируйте строки плана целиком (A…K: Domain … Project) или три колонки: Донор, Анкор, Проект.' };
  }
  const url = c => {
    if (!c) return '';
    const t = String(c.text || '').trim();
    if (looksLikeUrl(t)) return normUrl(t);
    return c.href ? normUrl(c.href) : (t ? normUrl(t) : '');
  };
  const rows = [];
  for (let r = first; r < cells.length; r++) {
    const row = cells[r];
    const donor = url(row[idx.donor]);
    const acceptor = url(row[idx.acceptor]);
    const anchor = String((row[idx.anchor] || {}).text || '').replace(/\s+/g, ' ').trim();
    if (!donor || !acceptor || !anchor) continue;
    rows.push({
      donor, acceptor, anchor,
      langLink: idx.langLink >= 0 ? normalizeLang((row[idx.langLink] || {}).text) : '',
      topic: idx.topic >= 0 ? String((row[idx.topic] || {}).text || '').trim() : '',
    });
  }
  return { rows, error: rows.length ? '' : 'Не нашёл строк, где заполнены донор, анкор и проект' };
}

function projectKey(url) { return hostOf(url).replace(/^www\./, ''); }

/** Запрос к Gemini: {url, body} */
function geminiRequestBody(system, contents, s) {
  const gen = { temperature: s.temperature, maxOutputTokens: 16384 };
  if (!s.noThinkingCfg) {
    gen.thinkingConfig = /gemini-2\.5/.test(s.model) ? { thinkingBudget: /pro/.test(s.model) ? 128 : 0 } : { thinkingLevel: 'low' };
  }
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(s.model) + ':generateContent',
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: contents, generationConfig: gen }),
  };
}

const Core = {
  DIRECTIONS, DEFAULT_TOPICS, DEFAULT_STOP, LANGS, LANG_RU, normalizeLang, langName, areSimilarLangs, detectLangFromText,
  hostOf, mainDomainLabel, brandFromUrl, brandGuess, acceptorCountry, expertInitials, langFromUrl, htmlLangAttr, guessLangFromHtml, siteTopic, decodeEntities,
  sanitizeHtml, autoFix, fixMixedScript, mixedScriptWords, validateArticle, countWords, countBrand, stripTags, escapeHtml, escapeAttr, prettyHtml,
  systemPrompt, userPrompt, geminiParse, parseQuota, geminiRequestBody, parseRows, normUrl, projectKey, looksLikeUrl,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
if (typeof window !== 'undefined') window.Core = Core;
