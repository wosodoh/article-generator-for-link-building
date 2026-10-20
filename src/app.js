/* Генератор статей — интерфейс и генерация */
'use strict';
const C = window.Core;
const $ = sel => document.querySelector(sel);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const host = u => C.hostOf(u).replace(/^www\./, '');

// ───────────────────────────── Данные ─────────────────────────────

const DEFAULT_SETTINGS = {
  apiKey: '', model: 'gemini-3.8-flash',
  fallbacks: 'gemini-3.5-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-2.5-flash-lite',
  parallel: 1, rpm: 5, maxAttempts: 2, strict: false, minWords: 400, maxWords: 550, mode: 'igaming', temperature: 0.9,
};
// Резервные модели по умолчанию в версиях до 1.1.2 — заменяем на новые при загрузке
const OLD_DEFAULT_FALLBACKS = 'gemini-3.5-flash, gemini-3.1-flash-lite, gemini-flash-lite-latest';
const S = { settings: Object.assign({}, DEFAULT_SETTINGS), topics: C.DEFAULT_TOPICS.slice(), stop: C.DEFAULT_STOP.slice(), projects: {}, donors: {}, tasks: [] };

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.api.save(S).catch(e => toast('Не удалось сохранить: ' + e.message)), 300);
}

const STATUS_LABEL = { new: 'Новая', need_lang: 'Нужен язык', work: 'В работе', ok: 'ОК', check: 'Проверить', error: 'Ошибка' };
const FILTERS = [['all', 'Все'], ['new', 'Новые'], ['need_lang', 'Нужен язык'], ['work', 'В работе'], ['ok', 'ОК'], ['check', 'Проверить'], ['error', 'Ошибки']];
let taskFilter = 'all';
const selected = new Set();
let run = null;

// ───────────────────────────── Утилиты UI ─────────────────────────────

let toastTimer = null;
function toast(msg, ms) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms || 4000);
}

const LANG_OPTIONS = '<option value="">— выберите —</option>' + Object.keys(C.LANG_RU)
  .map(c => '<option value="' + c + '">' + c + ' — ' + C.LANG_RU[c] + '</option>').join('');
function langSelect(cls, value, guess) {
  return '<select class="' + cls + (value ? (guess ? ' guess' : '') : ' need') + '">' + LANG_OPTIONS.replace('value="' + value + '"', 'value="' + value + '" selected') + '</select>';
}

function showView(name) {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  if (name === 'tasks') renderTasks();
  if (name === 'articles') renderArticles();
  if (name === 'projects') renderProjects();
  if (name === 'settings') renderSettings();
}

// ───────────────────────────── Задачи: добавление и языки ─────────────────────────────

function isReady(t) { return !!(t.langDonor && t.langLink && t.brand); }
function updateReady(t) {
  if (t.status === 'new' || t.status === 'need_lang') t.status = isReady(t) ? 'new' : 'need_lang';
}

function projectFor(t) {
  const key = C.projectKey(t.acceptor);
  if (!S.projects[key]) S.projects[key] = { url: t.acceptor, brand: C.brandGuess(t.acceptor, t.anchor), lang: '', brandManual: false };
  const p = S.projects[key];
  // анкор с брендом может подсказать бренд лучше домена (betanonl.net + «betano casino» → Betano)
  if (!p.brandManual) {
    const g = C.brandGuess(t.acceptor, t.anchor);
    if (g !== C.brandFromUrl(t.acceptor)) p.brand = g;
  }
  return p;
}

function resolveTask(t) {
  const p = projectFor(t);
  if (!t.langDonor) {
    // выбранный вручную язык донора > доменная зона > угаданный по сайту ранее
    const d = S.donors[C.projectKey(t.donor)];
    const u = C.langFromUrl(t.donor);
    if (d && d.lang && !d.guess) { t.langDonor = d.lang; t.langDonorSrc = 'сохранён для донора'; }
    else if (u.lang) { t.langDonor = u.lang; t.langDonorSrc = u.source; }
    else if (d && d.lang) { t.langDonor = d.lang; t.langDonorSrc = d.src + ' — проверьте'; t.langGuess = true; }
  }
  if (!t.langLink) {
    const u = C.langFromUrl(t.acceptor);
    if (u.lang && u.source.indexOf('зона') !== 0) t.langLink = u.lang;   // путь /nl/ или поддомен — точнее проекта
    else if (p.lang) t.langLink = p.lang;
    else if (u.lang) t.langLink = u.lang;
  }
  if (!t.brand) t.brand = p.brand;
  updateReady(t);
}

async function addRows(rows) {
  let added = 0, dup = 0;
  // Одинаковые строки в плане — отдельные статьи. Дублем считаем только то, что уже есть в задачах:
  // если такая строка уже добавлена N раз, первые N её копий во вставке пропускаем (повторная вставка того же).
  const key = r => r.donor + '|' + r.acceptor + '|' + r.anchor;
  const exists = {};
  S.tasks.forEach(t => { exists[key(t)] = (exists[key(t)] || 0) + 1; });
  rows.forEach(r => {
    const k = key(r);
    if (exists[k] > 0) { exists[k]--; dup++; return; }
    const t = { id: uid(), donor: r.donor, acceptor: r.acceptor, anchor: r.anchor, langDonor: '', langDonorSrc: '',
      langLink: r.langLink || '', brand: '', topic: r.topic || '', status: 'new', created: Date.now() };
    resolveTask(t);
    S.tasks.push(t);
    added++;
  });
  // бренд проекта мог уточниться по анкорам — обновим ещё не сгенерированные задачи
  S.tasks.forEach(t => {
    const p = S.projects[C.projectKey(t.acceptor)];
    if (p && (t.status === 'new' || t.status === 'need_lang') && !p.brandManual) t.brand = p.brand;
  });
  save(); renderAll();
  const msg = $('#pasteMsg');
  msg.className = 'paste-msg ok';
  const base = 'Добавлено задач: ' + added + (dup ? ' · пропущено дублей: ' + dup : '');
  msg.textContent = base + ' · определяю языки…';
  await detectProjectLangs();
  await detectDonorLangs((i, n) => { msg.textContent = base + ' · определяю язык доноров по сайтам: ' + i + ' из ' + n + '…'; });
  const need = S.tasks.filter(t => t.status === 'need_lang').length;
  const guessed = S.tasks.filter(t => t.langGuess && (t.status === 'new' || t.status === 'need_lang')).length;
  msg.textContent = base + (need ? ' · выберите язык в строках, подсвеченных красным: ' + need : ' · всё готово к генерации') +
    (guessed ? ' · язык угадан по сайту (жёлтые) — проверьте: ' + guessed : '');
}

/** Язык доноров без языка (.com/.net и т.п.) — угадываем по странице сайта, по 5 сайтов одновременно */
async function detectDonorLangs(progress) {
  const keys = [];
  S.tasks.forEach(t => {
    const k = C.projectKey(t.donor);
    if (!t.langDonor && (t.status === 'new' || t.status === 'need_lang') && keys.indexOf(k) < 0) keys.push(k);
  });
  let done = 0;
  const one = async k => {
    const t0 = S.tasks.find(t => C.projectKey(t.donor) === k);
    const html = await window.api.fetchPage(t0.donor).catch(() => '');
    const g = html ? C.guessLangFromHtml(html) : { lang: '' };
    progress(++done, keys.length);
    if (!g.lang || (S.donors[k] && !S.donors[k].guess)) return;
    S.donors[k] = { lang: g.lang, guess: true, src: g.source };
    S.tasks.forEach(t => {
      if (C.projectKey(t.donor) === k && !t.langDonor && (t.status === 'new' || t.status === 'need_lang')) {
        t.langDonor = g.lang; t.langDonorSrc = g.source + ' — проверьте'; t.langGuess = true; updateReady(t);
      }
    });
  };
  for (let i = 0; i < keys.length; i += 5) await Promise.all(keys.slice(i, i + 5).map(one));
  if (keys.length) { save(); renderAll(); }
}

/** Язык проектов без языка — по атрибуту lang страницы (программа открывает сайт со своего компьютера) */
async function detectProjectLangs() {
  const todo = Object.keys(S.projects).filter(k => !S.projects[k].lang);
  for (const k of todo) {
    const p = S.projects[k];
    const html = await window.api.fetchPage(p.url).catch(() => '');
    const lang = html ? C.htmlLangAttr(html) : '';
    if (!lang) continue;
    p.lang = lang;
    S.tasks.forEach(t => {
      if (C.projectKey(t.acceptor) === k && !t.langLink && (t.status === 'new' || t.status === 'need_lang')) { t.langLink = lang; updateReady(t); }
    });
  }
  if (todo.length) { save(); renderAll(); }
}

// ───────────────────────────── Вставка из Excel ─────────────────────────────

function cellsFromClipboard(html, text) {
  if (html && /<tr[\s>]/i.test(html)) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = [];
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [];
      tr.querySelectorAll('td,th').forEach(td => {
        const a = td.querySelector('a[href]');
        const item = { text: td.textContent.replace(/\s+/g, ' ').trim(), href: a ? a.getAttribute('href') : '' };
        const span = Math.max(1, parseInt(td.getAttribute('colspan') || '1', 10));
        cells.push(item);
        for (let i = 1; i < span; i++) cells.push({ text: '', href: '' });
      });
      rows.push(cells);
    });
    if (rows.length) return rows;
  }
  return String(text || '').split(/\r?\n/).map(line => line.split('\t').map(c => ({ text: c.trim(), href: '' })));
}

function onPaste(e) {
  e.preventDefault();
  const cd = e.clipboardData;
  const cells = cellsFromClipboard(cd.getData('text/html'), cd.getData('text/plain'));
  const res = C.parseRows(cells);
  if (res.error) {
    const msg = $('#pasteMsg');
    msg.className = 'paste-msg err'; msg.textContent = res.error;
    return;
  }
  addRows(res.rows);
}

// ───────────────────────────── Задачи: таблица ─────────────────────────────

function statusHtml(t) {
  let label = STATUS_LABEL[t.status] || t.status;
  if (t.status === 'work' && t.step) label += ': ' + t.step;
  let note = '';
  if (t.status === 'error' || t.status === 'check') note = (t.errors && t.errors[0]) || (t.soft && t.soft[0]) || '';
  else if (t.status === 'ok' && t.soft && t.soft.length) note = 'Мелочи: ' + t.soft.join(' · ');
  else if (t.status === 'need_lang') note = !t.langDonor ? 'выберите язык донора' : !t.langLink ? 'выберите язык ссылки' : 'впишите бренд';
  const title = [].concat(t.errors || [], t.soft || []).join('\n');
  return '<span class="st st-' + t.status + '" title="' + esc(title) + '">' + esc(label) + '</span>' +
    (note ? '<span class="note" title="' + esc(title || note) + '">' + esc(note) + '</span>' : '');
}

function taskRowHtml(t) {
  const locked = t.status === 'work';
  const has = !!t.html;
  return '<tr data-id="' + t.id + '" class="' + (selected.has(t.id) ? 'sel' : '') + '">' +
    '<td class="c-chk"><input type="checkbox" class="rowchk"' + (selected.has(t.id) ? ' checked' : '') + '></td>' +
    '<td title="' + esc(t.donor) + '"><span class="url">' + esc(host(t.donor)) + '</span></td>' +
    '<td title="' + esc(t.acceptor) + '"><span class="url">' + esc(host(t.acceptor)) + '</span></td>' +
    '<td title="' + esc(t.anchor) + '">' + esc(t.anchor) + '</td>' +
    '<td title="' + esc(t.langDonorSrc || '') + '">' + (locked ? esc(t.langDonor) : langSelect('f-ld', t.langDonor, t.langGuess)) + '</td>' +
    '<td>' + (locked ? esc(t.langLink) : langSelect('f-ll', t.langLink)) + '</td>' +
    '<td>' + (locked ? esc(t.brand) : '<input type="text" class="f-br" value="' + esc(t.brand) + '">') + '</td>' +
    '<td class="c-status">' + statusHtml(t) + '</td>' +
    '<td class="c-act">' +
      (has ? '<button class="btn icon" data-act="preview" title="Предпросмотр">👁</button><button class="btn icon" data-act="copy" title="Копировать HTML">📋</button>' : '') +
      (locked ? '' : '<button class="btn icon" data-act="del" title="Удалить">✕</button>') +
    '</td></tr>';
}

function filteredTasks() {
  return S.tasks.filter(t => taskFilter === 'all' || t.status === taskFilter);
}

function renderTasks() {
  const counts = {};
  S.tasks.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
  $('#taskFilters').innerHTML = FILTERS.map(([k, l]) => {
    const n = k === 'all' ? S.tasks.length : (counts[k] || 0);
    if (k !== 'all' && !n && taskFilter !== k) return '';
    return '<button class="chip' + (taskFilter === k ? ' active' : '') + '" data-f="' + k + '">' + l + '<i>' + n + '</i></button>';
  }).join('');
  const list = filteredTasks();
  $('#taskTable tbody').innerHTML = list.map(taskRowHtml).join('');
  $('#taskEmpty').hidden = list.length > 0;
  $('#taskEmpty').textContent = S.tasks.length ? 'Нет задач с таким статусом.' : 'Задач пока нет. Нажмите «+ Вставить из Excel».';
  $('#chkAll').checked = list.length > 0 && list.every(t => selected.has(t.id));
  updateSelInfo();
  const ready = S.tasks.filter(t => t.status === 'new').length;
  $('#btnGenerate').textContent = ready ? 'Сгенерировать (' + ready + ')' : 'Сгенерировать';
  $('#btnGenerate').disabled = !!run || !ready;
  renderNav();
}

function renderRow(t) {
  const tr = document.querySelector('#taskTable tr[data-id="' + t.id + '"]');
  if (!tr) return;
  const active = document.activeElement;
  if (active && tr.contains(active) && t.status !== 'work') { tr.querySelector('.c-status').innerHTML = statusHtml(t); return; }
  tr.outerHTML = taskRowHtml(t);
}

function updateSelInfo() {
  [...selected].forEach(id => { if (!S.tasks.some(t => t.id === id)) selected.delete(id); });
  const n = selected.size;
  $('#selInfo').textContent = n ? 'Выбрано: ' + n : '';
  $('#btnRegenSel').disabled = !n || !!run;
  $('#btnDelSel').disabled = !n || !!run;
}

function renderNav() {
  $('#navTasks').textContent = S.tasks.length || '';
  $('#navArticles').textContent = S.tasks.filter(t => t.html).length || '';
  $('#navProjects').textContent = Object.keys(S.projects).length || '';
  $('#modelInfo').textContent = 'Модель: ' + (run ? run.s.model : S.settings.model);
}

function renderAll() {
  const v = document.querySelector('.nav.active').dataset.view;
  if (v === 'tasks') renderTasks();
  else if (v === 'articles') renderArticles();
  else if (v === 'projects') renderProjects();
  renderNav();
}

function taskById(id) { return S.tasks.find(t => t.id === id); }

function onTaskChange(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const t = taskById(tr.dataset.id);
  if (!t) return;
  if (e.target.classList.contains('rowchk')) {
    if (e.target.checked) selected.add(t.id); else selected.delete(t.id);
    tr.classList.toggle('sel', e.target.checked);
    updateSelInfo();
    return;
  }
  const p = S.projects[C.projectKey(t.acceptor)];
  if (e.target.classList.contains('f-ld')) {
    t.langDonor = e.target.value; t.langDonorSrc = 'вручную'; t.langGuess = false;
    // запоминаем язык донора и подставляем во все его строки, которые ещё не сгенерированы
    const dk = C.projectKey(t.donor);
    if (t.langDonor) {
      S.donors[dk] = { lang: t.langDonor, guess: false };
      S.tasks.forEach(x => {
        if (x !== t && C.projectKey(x.donor) === dk && ['new', 'need_lang', 'error'].includes(x.status)) {
          x.langDonor = t.langDonor; x.langDonorSrc = 'вручную'; x.langGuess = false; updateReady(x);
        }
      });
    }
  } else if (e.target.classList.contains('f-ll')) {
    t.langLink = e.target.value;
    // запоминаем язык для проекта и подставляем в остальные его задачи без языка
    if (p && !p.lang && t.langLink && !/путь|поддомен/.test(C.langFromUrl(t.acceptor).source)) {
      p.lang = t.langLink;
      S.tasks.forEach(x => { if (C.projectKey(x.acceptor) === C.projectKey(t.acceptor) && !x.langLink) { x.langLink = p.lang; updateReady(x); } });
    }
  } else if (e.target.classList.contains('f-br')) {
    const v = e.target.value.trim();
    t.brand = v;
    if (p && v) {
      const old = p.brand;
      p.brand = v; p.brandManual = true;
      S.tasks.forEach(x => {
        if (x !== t && C.projectKey(x.acceptor) === C.projectKey(t.acceptor) && ['new', 'need_lang', 'error'].includes(x.status) && x.brand === old) x.brand = v;
      });
    }
  } else return;
  if (t.status === 'error' && isReady(t)) t.status = 'new';
  updateReady(t);
  save();
  renderTasks();
}

function onTaskClick(e) {
  const chip = e.target.closest('.chip');
  if (chip) { taskFilter = chip.dataset.f; renderTasks(); return; }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const t = taskById(btn.closest('tr[data-id]').dataset.id);
  if (!t) return;
  if (btn.dataset.act === 'preview') openPreview(t);
  if (btn.dataset.act === 'copy') copyHtml(t);
  if (btn.dataset.act === 'del') {
    if (!confirm('Удалить задачу?\n' + host(t.donor) + ' → ' + t.anchor)) return;
    S.tasks = S.tasks.filter(x => x !== t);
    save(); renderTasks();
  }
}

// ───────────────────────────── Генерация ─────────────────────────────

function runSettings() {
  const st = S.settings;
  const model = String(st.model || DEFAULT_SETTINGS.model).trim().replace(/^models\//, '');
  return {
    apiKey: String(st.apiKey || '').trim(), model,
    fallbacks: String(st.fallbacks || '').split(/[,;\s]+/).map(x => x.trim().replace(/^models\//, '')).filter(x => x && x !== model),
    parallel: Math.min(8, Math.max(1, +st.parallel || 1)),
    rpm: Math.min(60, Math.max(1, +st.rpm || 5)),
    maxAttempts: Math.min(4, Math.max(1, +st.maxAttempts || 2)),
    strict: !!st.strict, bridge: st.mode === 'bridge',
    minWords: +st.minWords || 400, maxWords: +st.maxWords || 550,
    temperature: isNaN(+st.temperature) ? 0.9 : +st.temperature,
  };
}

function usedH1For(t) {
  const same = [], other = [];
  S.tasks.forEach(x => {
    if (!x.h1 || x === t) return;
    (x.acceptor === t.acceptor || x.donor === t.donor ? same : other).push(x.h1);
  });
  return Array.from(new Set(same.concat(other.slice(-25)))).slice(-40);
}

function pick(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

/** Служебные ответы Gemini: смена модели, резервная модель, отключение настройки размышления. true — повторить. */
function applyControl(res, s, usedModel) {
  if (s.model !== usedModel) return true; // другой поток уже переключил модель
  if (res.dropThinking) { s.noThinkingCfg = true; return true; }
  if (res.switchModel) {
    s.model = res.switchModel; S.settings.model = s.model; save();
    toast('Google обновил модель — перешёл на «' + s.model + '»'); renderNav();
    return true;
  }
  if (res.dailyLimit && s.fallbacks.length) {
    s.model = s.fallbacks.shift(); s.noThinkingCfg = false;
    toast((res.unavailable ? 'Модель «' + usedModel + '» недоступна' : 'Дневной лимит «' + usedModel + '» исчерпан') + ' — продолжаю на «' + s.model + '»', 7000);
    renderNav();
    return true;
  }
  return false;
}

/**
 * Общий «шлагбаум»: не больше run.maxActive запросов одновременно, пауза после лимита для всех потоков
 * и равномерная отправка — не чаще одного запроса в 60/rpm секунд (5 в минуту → раз в 12 сек).
 */
async function gate(step) {
  for (;;) {
    const now = Date.now();
    if (run.inFlight < run.maxActive && now >= run.pauseUntil && now >= run.nextAt) break;
    const left = s => Math.ceil(s / 1000) + ' сек';
    if (now < run.pauseUntil) step('пауза после лимита Google · ' + left(run.pauseUntil - now));
    else if (run.inFlight >= run.maxActive) step('в очереди');
    else step('жду очереди запросов · ' + left(run.nextAt - now));
    await sleep(300);
  }
  run.inFlight++;
  run.nextAt = Date.now() + run.interval;
}
function onApiOk() {
  if (++run.okStreak >= 3 && run.maxActive < run.s.parallel) { run.maxActive++; run.okStreak = 0; }
}
function onApiLimit(res) {
  run.okStreak = 0;
  run.maxActive = Math.max(1, run.maxActive - 1);
  const wait = Math.min(90000, Math.max(5000, (res.waitMs || 20000) + 1000));
  run.pauseUntil = Math.max(run.pauseUntil, Date.now() + wait);
  return run.pauseUntil - Date.now();
}

async function processTask(t, s, system) {
  const t0 = Date.now();
  const step = txt => { if (t.step === txt) return; t.step = txt; renderRow(t); };
  try {
    let donorTopic = '';
    if (s.bridge && !t.topic) {
      step('читаю сайт донора…');
      const html = await window.api.fetchPage(t.donor).catch(() => '');
      donorTopic = html ? C.siteTopic(html) : '';
    }
    const task = { donor: t.donor, acceptor: t.acceptor, anchor: t.anchor, langDonor: t.langDonor, langLink: t.langLink,
      brand: t.brand, topic: t.topic, bridge: s.bridge, donorTopic, cross: t.langDonor !== t.langLink,
      usedH1: usedH1For(t), examples: pick(S.topics, 6), direction: pick(C.DIRECTIONS, 1)[0],
      country: C.acceptorCountry(t.acceptor, t.langLink), initials: C.expertInitials() };
    const ctx = { acceptor: task.acceptor, anchor: task.anchor, brand: task.brand, cross: task.cross, lang: task.langDonor,
      minWords: s.minWords, maxWords: s.maxWords, stop: S.stop, usedH1: task.usedH1 };
    const contents = [{ role: 'user', parts: [{ text: C.userPrompt(task) }] }];
    let best = null, attempts = 0, retries = 0, lastErr = 0;

    while (attempts < s.maxAttempts && !run.stop) {
      step(attempts === 0 ? 'пишу статью…' : 'исправляю ' + lastErr + ' ош. (' + (attempts + 1) + ' из ' + s.maxAttempts + ')');
      await gate(step);
      const usedModel = s.model;
      const req = C.geminiRequestBody(system, contents, s);
      const label = attempts === 0 ? 'пишу статью' : 'исправляю ' + lastErr + ' ош. (' + (attempts + 1) + ' из ' + s.maxAttempts + ')';
      const tStart = Date.now();
      step(label + ' · 0 сек');
      const timer = setInterval(() => step(label + ' · ' + Math.round((Date.now() - tStart) / 1000) + ' сек'), 1000);
      let r;
      try { r = await window.api.gemini({ url: req.url, body: req.body, key: s.apiKey }); } finally { clearInterval(timer); run.inFlight--; }
      if (r.status === 200) onApiOk(); else if (r.status === 429) t.lastApi = String(r.text).slice(0, 600);
      if (r.status === 0) {
        // зависший запрос: один повтор, потом статья уходит в «Ошибка», а очередь идёт дальше
        if (++retries > 1) throw new Error('Google не ответил (' + r.text + ') — перегенерируйте позже');
        step(r.text + ' — повторяю…'); await sleep(3000); continue;
      }
      if (r.status === 429 && usedModel !== s.model) continue;
      const res = C.geminiParse(r.status, r.text, s);
      if (res.text !== undefined) {
        attempts++;
        const html = C.autoFix(C.sanitizeHtml(res.text, task.acceptor), ctx);
        const v = C.validateArticle(html, ctx);
        const score = v.errors.length * 10 + v.soft.length;
        if (!best || score < best.score) best = { html, v, score };
        const needFix = v.errors.length > 0 || (s.strict && v.soft.length > 0);
        if (!needFix) break;
        lastErr = v.errors.length + v.soft.length;
        contents.push({ role: 'model', parts: [{ text: res.text }] });
        contents.push({ role: 'user', parts: [{ text:
          'Статья не прошла автоматическую проверку. Исправь ТОЛЬКО эти ошибки, остальное сохрани, и выведи статью целиком заново в блоке ```html:\n- ' +
          v.errors.concat(v.soft).join('\n- ') }] });
        continue;
      }
      if (applyControl(res, s, usedModel)) continue;
      if (res.retry) {
        if (++retries > 8) throw new Error('Gemini не отпускает лимит (' + (res.quota && res.quota.metric) + '). Перегенерируйте позже. Ответ Google: ' + String(t.lastApi || '').slice(0, 200));
        const wait = onApiLimit(res);
        step('лимит ' + (res.quota ? res.quota.metric : '') + ' — жду ' + Math.round(wait / 1000) + ' сек (одновременно: ' + run.maxActive + ')');
        await sleep(wait);
        continue;
      }
      const err = new Error(res.error); err.fatal = res.fatal; throw err;
    }

    if (!best) { t.status = 'new'; t.step = ''; return 'stopped'; }
    const ok = best.v.errors.length === 0 && (!s.strict || best.v.soft.length === 0);
    Object.assign(t, {
      html: best.html, h1: best.v.h1, words: best.v.words, errors: best.v.errors, soft: best.v.soft,
      attempts, seconds: Math.round((Date.now() - t0) / 1000), model: s.model, done: Date.now(),
      status: ok ? 'ok' : 'check', step: '',
    });
    return t.status;
  } catch (e) {
    t.status = 'error'; t.errors = [e.message]; t.soft = []; t.step = '';
    if (e.fatal) { run.stop = true; run.fatal = e.message; }
    return 'error';
  } finally {
    save();
  }
}

function updateRunbar() {
  if (!run) { $('#runbar').hidden = true; return; }
  $('#runbar').hidden = false;
  const done = run.done, total = run.total;
  const elapsed = (Date.now() - run.start) / 1000;
  let eta = '';
  if (done > 0 && done < total) {
    const left = Math.round(elapsed / done * (total - done));
    eta = ' · осталось ~' + (left >= 60 ? Math.round(left / 60) + ' мин' : left + ' сек');
  }
  $('#runText').textContent = (run.stop ? 'Останавливаю… ' : 'Генерация: ') + done + ' из ' + total +
    ' · ✅ ' + run.ok + ' · 🟡 ' + run.check + ' · 🔴 ' + run.err + eta;
  $('#runFill').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
}

async function generate(ids) {
  if (run) { toast('Генерация уже идёт'); return; }
  const s = runSettings();
  if (!s.apiKey) { showView('settings'); toast('Сначала вставьте API-ключ Gemini', 6000); $('#sKey').focus(); return; }
  let list;
  if (ids) {
    list = S.tasks.filter(t => ids.includes(t.id));
    list.forEach(t => { if (t.status !== 'work') { t.status = isReady(t) ? 'new' : 'need_lang'; } });
  } else list = S.tasks.filter(t => t.status === 'new');
  const ready = list.filter(t => t.status === 'new');
  const skipped = list.length - ready.length;
  if (!ready.length) { toast(skipped ? 'Сначала выберите язык/бренд в подсвеченных строках' : 'Нет новых задач'); renderTasks(); return; }

  // слов на раздел: середина диапазона минус заголовки, делённая на 4 раздела (400–550 → 110)
  const perSection = Math.max(50, Math.round(((s.minWords + s.maxWords) / 2 - 30) / 4 / 5) * 5);
  const system = C.systemPrompt().replace(/\{MIN\}/g, s.minWords).replace(/\{MAX\}/g, s.maxWords).replace(/\{SEC\}/g, perSection)
    .replace('{STOP}', S.stop.map(x => '«' + x + '»').join(', '));
  run = { s, total: ready.length, done: 0, ok: 0, check: 0, err: 0, start: Date.now(), stop: false, fatal: '', inFlight: 0, maxActive: s.parallel, pauseUntil: 0, okStreak: 0,
    nextAt: 0, interval: Math.round(60000 / s.rpm) };
  ready.forEach(t => { t.status = 'work'; t.step = 'в очереди'; });
  renderTasks(); updateRunbar();
  if (skipped) toast('Пропущено без языка/бренда: ' + skipped);

  const queue = ready.slice();
  const worker = async () => {
    while (queue.length && !run.stop) {
      const t = queue.shift();
      const r = await processTask(t, s, system);
      if (r === 'stopped') continue;
      run.done++;
      if (r === 'ok') run.ok++; else if (r === 'check') run.check++; else run.err++;
      renderRow(t); updateRunbar(); renderNav();
      if (document.querySelector('.nav.active').dataset.view === 'articles') renderArticles();
    }
  };
  await Promise.all(Array.from({ length: Math.min(s.parallel, queue.length) }, worker));
  queue.forEach(t => { t.status = 'new'; t.step = ''; });
  S.tasks.forEach(t => { if (t.status === 'work') { t.status = 'new'; t.step = ''; } });

  const sec = Math.round((Date.now() - run.start) / 1000);
  const summary = run.fatal ? 'Остановлено: ' + run.fatal
    : 'Готово за ' + (sec >= 60 ? Math.round(sec / 60) + ' мин' : sec + ' сек') + ': ✅ ОК ' + run.ok + ' · 🟡 проверить ' + run.check + ' · 🔴 ошибки ' + run.err;
  run = null;
  save(); updateRunbar(); renderAll();
  toast(summary, 9000);
}

// ───────────────────────────── Статьи ─────────────────────────────

function groupsOfArticles(includePlaced) {
  const groups = [], byKey = {};
  S.tasks.filter(t => t.html && (t.status === 'ok' || t.status === 'check' || t.status === 'work' || t.status === 'error'))
    .filter(t => includePlaced || !t.placed)
    .forEach(t => {
      const k = C.projectKey(t.acceptor);
      if (!byKey[k]) { byKey[k] = { key: k, url: t.acceptor, brand: t.brand, items: [] }; groups.push(byKey[k]); }
      byKey[k].items.push(t);
    });
  return groups;
}

function renderArticles() {
  const all = S.tasks.filter(t => t.html);
  const ok = all.filter(t => t.status === 'ok').length;
  const first = all.filter(t => t.status === 'ok' && t.attempts === 1).length;
  const placed = all.filter(t => t.placed).length;
  const avg = all.length ? Math.round(all.reduce((a, t) => a + (t.seconds || 0), 0) / all.length) : 0;
  $('#stats').innerHTML = all.length ? [
    [all.length, 'статей'], [ok, 'прошли проверку'], [all.length - ok, 'проверить вручную'],
    [all.length ? Math.round(first / all.length * 100) + '%' : '—', 'с первого запроса'], [avg + ' сек', 'в среднем на статью'], [placed, 'размещено'],
  ].map(([v, l]) => '<div class="stat"><b>' + esc(v) + '</b><span>' + l + '</span></div>').join('') : '';
  const groups = groupsOfArticles(!$('#hidePlaced').checked);
  $('#articleGroups').innerHTML = groups.map(g =>
    '<div class="group"><div class="group-head"><h2>' + esc(g.brand) + ' — ' + g.items.length + ' шт.</h2><a href="#" data-url="' + esc(g.url) + '">' + esc(g.key) + '</a></div>' +
    g.items.map(t => {
      const notes = (t.errors || []).concat(t.soft || []);
      return '<div class="card-a' + (t.placed ? ' placed' : '') + '" data-id="' + t.id + '">' +
        '<div class="t"><span class="st st-' + t.status + '">' + esc(STATUS_LABEL[t.status]) + '</span> ' + esc(t.h1 || '(без заголовка)') + '</div>' +
        '<div class="btns">' +
          '<label class="check"><input type="checkbox" class="f-placed"' + (t.placed ? ' checked' : '') + '> Размещено</label>' +
          '<button class="btn small" data-act="preview">Предпросмотр</button>' +
          '<button class="btn small" data-act="regen"' + (run ? ' disabled' : '') + '>Перегенерировать</button>' +
          '<button class="btn small primary" data-act="copy">Копировать HTML</button>' +
        '</div>' +
        '<div class="m">Донор: <b>' + esc(host(t.donor)) + '</b> · Анкор: <b>' + esc(t.anchor) + '</b> · ' + esc(t.langDonor) + (t.langDonor !== t.langLink ? ' → ' + esc(t.langLink) + ' (цитата)' : '') +
          ' · ' + (t.words || 0) + ' слов' + (t.seconds ? ' · ' + t.seconds + ' сек' : '') + '</div>' +
        (notes.length ? '<div class="n">' + esc(notes.join(' · ')) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>').join('');
  $('#articleEmpty').hidden = groups.length > 0;
  $('#articleEmpty').textContent = all.length ? 'Все статьи размещены.' : 'Готовых статей пока нет.';
  renderNav();
}

function onArticlesClick(e) {
  const a = e.target.closest('a[data-url]');
  if (a) { e.preventDefault(); window.api.openUrl(a.dataset.url); return; }
  const card = e.target.closest('.card-a');
  if (!card) return;
  const t = taskById(card.dataset.id);
  if (!t) return;
  if (e.target.classList.contains('f-placed')) {
    t.placed = e.target.checked ? Date.now() : 0;
    save(); renderArticles(); return;
  }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'copy') copyHtml(t);
  if (btn.dataset.act === 'preview') openPreview(t);
  if (btn.dataset.act === 'regen') generate([t.id]).then(renderArticles);
}

async function copyHtml(t) {
  await window.api.copy(t.html);
  toast('HTML скопирован — вставляйте в админку');
}

let previewTask = null;
function openPreview(t) {
  previewTask = t;
  $('#modalTitle').textContent = host(t.donor) + ' → ' + host(t.acceptor);
  const notes = (t.errors || []).concat(t.soft || []);
  $('#modalMeta').innerHTML = 'Анкор: <b>' + esc(t.anchor) + '</b> · Бренд: <b>' + esc(t.brand) + '</b> · ' + esc(t.langDonor) + ' → ' + esc(t.langLink) +
    ' · ' + (t.words || 0) + ' слов · ' + esc(STATUS_LABEL[t.status]) + (notes.length ? '<br><span style="color:var(--warn)">' + esc(notes.join(' · ')) + '</span>' : '');
  $('#modalBody').innerHTML = t.html;
  $('#modal').hidden = false;
}

// ───────────────────────────── Экспорт ─────────────────────────────

function stamp() { const d = new Date(); return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function fileStamp() { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

function exportGroups() {
  const groups = groupsOfArticles(!$('#hidePlaced').checked);
  if (!groups.length) { toast('Нет статей для выгрузки'); return null; }
  return groups;
}

async function exportDocx() {
  const groups = exportGroups(); if (!groups) return;
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  let html = '<h1>Статьи для размещения</h1><p>' + esc(stamp()) + ' · проектов: ' + groups.length + ' · статей: ' + total + '</p>';
  groups.forEach(g => {
    html += '<h1>' + esc(g.brand) + ' — ' + esc(g.key) + ' (' + g.items.length + ' шт.)</h1>';
    g.items.forEach((t, i) => {
      html += '<h2>' + (i + 1) + '. ' + esc(t.h1) + '</h2>';
      html += '<p><b>Донор:</b> ' + esc(t.donor) + '<br><b>Анкор:</b> ' + esc(t.anchor) + '<br><b>Языки:</b> статья ' + esc(t.langDonor) + ', ссылка ' + esc(t.langLink) +
        '<br><b>Слов:</b> ' + (t.words || 0) + ' · <b>Статус:</b> ' + esc(STATUS_LABEL[t.status]) + (t.placed ? ' · размещено' : '') + '</p>';
      html += t.html.replace(/<(\/?)h2>/g, '<$1h4>').replace(/<(\/?)h1>/g, '<$1h3>');
      html += '<p><b>HTML-код:</b></p>';
      C.prettyHtml(t.html).split('\n').forEach(line => {
        html += '<p style="font-family: \'Courier New\'; font-size: 8pt; color: #333333; margin: 0;">' + esc(line) + '</p>';
      });
      html += '<p>&nbsp;</p>';
    });
  });
  const p = await window.api.saveFile({ defaultName: 'Статьи ' + fileStamp() + '.docx', kind: 'docx', content: '<!doctype html><html><body>' + html + '</body></html>' });
  if (p) { toast('Сохранено: ' + p, 6000); window.api.openPath(p); }
}

async function exportHtml() {
  const groups = exportGroups(); if (!groups) return;
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  let body = '<h1>Статьи для размещения</h1><p class="m">' + esc(stamp()) + ' · проектов: ' + groups.length + ' · статей: ' + total + '</p>';
  groups.forEach(g => {
    body += '<section><h2 class="g">' + esc(g.brand) + ' — ' + esc(g.key) + ' <span>(' + g.items.length + ' шт.)</span></h2>';
    g.items.forEach((t, i) => {
      body += '<div class="a"><div class="h">' + (i + 1) + '. ' + esc(t.h1) + '</div>' +
        '<p class="m">Донор: <b>' + esc(t.donor) + '</b> · Анкор: <b>' + esc(t.anchor) + '</b> · ' + esc(t.langDonor) + ' → ' + esc(t.langLink) + ' · ' + (t.words || 0) + ' слов · ' + esc(STATUS_LABEL[t.status]) + '</p>' +
        '<button onclick="cp(this)">Копировать HTML</button><textarea readonly>' + esc(t.html) + '</textarea>' +
        '<details><summary>Показать статью</summary><div class="art">' + t.html.replace(/<(\/?)h1>/g, '<$1h3>').replace(/<(\/?)h2>/g, '<$1h4>') + '</div></details></div>';
    });
    body += '</section>';
  });
  const page = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Статьи ' + fileStamp() + '</title><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#1d2228;line-height:1.5}' +
    'h2.g{margin-top:36px;border-bottom:2px solid #2f6fed;padding-bottom:4px}h2.g span{color:#6b7380;font-weight:400}' +
    '.a{border:1px solid #e3e6ea;border-radius:8px;padding:12px 14px;margin:12px 0}.h{font-weight:700;font-size:16px}.m{color:#6b7380;font-size:13px}' +
    'textarea{display:none}button{background:#2f6fed;color:#fff;border:0;border-radius:6px;padding:6px 12px;cursor:pointer}' +
    'details{margin-top:8px}.art table{border-collapse:collapse}.art td,.art th{border:1px solid #ccd;padding:4px 8px}.art blockquote{border-left:4px solid #999;margin:0;padding:4px 12px}.art a{background:#fff59d}' +
    '</style></head><body>' + body +
    '<script>function cp(b){var t=b.nextElementSibling;navigator.clipboard.writeText(t.value).then(function(){b.textContent="Скопировано ✓";setTimeout(function(){b.textContent="Копировать HTML"},1500)})}</' + 'script></body></html>';
  const p = await window.api.saveFile({ defaultName: 'Статьи ' + fileStamp() + '.html', kind: 'html', content: page });
  if (p) { toast('Сохранено: ' + p, 6000); window.api.openPath(p); }
}

// ───────────────────────────── Проекты ─────────────────────────────

function renderProjects() {
  const keys = Object.keys(S.projects);
  $('#projTable tbody').innerHTML = keys.map(k => {
    const p = S.projects[k];
    const n = S.tasks.filter(t => C.projectKey(t.acceptor) === k).length;
    return '<tr data-k="' + esc(k) + '"><td title="' + esc(p.url) + '">' + esc(k) + '</td>' +
      '<td><input type="text" class="p-br" value="' + esc(p.brand) + '"></td>' +
      '<td>' + langSelect('p-ll', p.lang || '') + '</td><td>' + n + '</td>' +
      '<td class="c-act"><button class="btn icon" data-act="pdel" title="Удалить">✕</button></td></tr>';
  }).join('');
  $('#projEmpty').hidden = keys.length > 0;
  renderNav();
}

function onProjectChange(e) {
  const tr = e.target.closest('tr[data-k]'); if (!tr) return;
  const k = tr.dataset.k, p = S.projects[k]; if (!p) return;
  const open = t => C.projectKey(t.acceptor) === k && ['new', 'need_lang', 'error'].includes(t.status);
  if (e.target.classList.contains('p-br')) {
    const old = p.brand; p.brand = e.target.value.trim(); p.brandManual = true;
    S.tasks.forEach(t => { if (open(t) && (t.brand === old || !t.brand)) { t.brand = p.brand; updateReady(t); } });
  } else if (e.target.classList.contains('p-ll')) {
    const old = p.lang; p.lang = e.target.value;
    S.tasks.forEach(t => { if (open(t) && (!t.langLink || t.langLink === old)) { t.langLink = p.lang; updateReady(t); } });
  } else return;
  save(); renderProjects();
}

function onProjectClick(e) {
  const btn = e.target.closest('button[data-act="pdel"]'); if (!btn) return;
  const k = btn.closest('tr[data-k]').dataset.k;
  if (!confirm('Удалить проект ' + k + ' из списка? Задачи останутся.')) return;
  delete S.projects[k]; save(); renderProjects();
}

// ───────────────────────────── Настройки ─────────────────────────────

function renderSettings() {
  const st = S.settings;
  $('#sKey').value = st.apiKey || '';
  $('#sModel').value = st.model || '';
  $('#sFallbacks').value = st.fallbacks || '';
  $('#sParallel').value = st.parallel;
  $('#sRpm').value = st.rpm;
  $('#sAttempts').value = st.maxAttempts;
  $('#sMin').value = st.minWords;
  $('#sMax').value = st.maxWords;
  $('#sStrict').value = st.strict ? '1' : '0';
  $('#sMode').value = st.mode;
  $('#sTemp').value = st.temperature;
  $('#sTopics').value = S.topics.join('\n');
  $('#sStop').value = S.stop.join('\n');
  window.api.dataPath().then(p => { $('#dataPath').textContent = 'Данные хранятся на этом компьютере: ' + p; });
}

function bindSettings() {
  const map = { sKey: 'apiKey', sModel: 'model', sFallbacks: 'fallbacks', sParallel: 'parallel', sRpm: 'rpm', sAttempts: 'maxAttempts',
    sMin: 'minWords', sMax: 'maxWords', sMode: 'mode', sTemp: 'temperature' };
  Object.keys(map).forEach(id => {
    $('#' + id).addEventListener('input', e => {
      let v = e.target.value;
      if (e.target.type === 'number') v = v === '' ? DEFAULT_SETTINGS[map[id]] : +v;
      else v = String(v).trim();
      S.settings[map[id]] = v; save(); renderNav();
    });
  });
  $('#sStrict').addEventListener('change', e => { S.settings.strict = e.target.value === '1'; save(); });
  $('#sTopics').addEventListener('input', e => { S.topics = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); save(); });
  $('#sStop').addEventListener('input', e => { S.stop = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); save(); });
  $('#btnShowKey').addEventListener('click', () => {
    const k = $('#sKey'); k.type = k.type === 'password' ? 'text' : 'password';
    $('#btnShowKey').textContent = k.type === 'password' ? 'Показать' : 'Скрыть';
  });
  $('#btnCheckKey').addEventListener('click', checkKey);
}

async function checkKey() {
  const msg = $('#keyMsg');
  const s = runSettings();
  if (!s.apiKey) { msg.className = 'msg err'; msg.textContent = 'Вставьте ключ'; return; }
  msg.className = 'msg'; msg.textContent = 'Проверяю…';
  const r = await window.api.listModels(s.apiKey);
  if (r.status !== 200) { msg.className = 'msg err'; msg.textContent = 'Ключ не работает (' + r.status + '): ' + String(r.text).slice(0, 200); return; }
  let models = [];
  try {
    models = (JSON.parse(r.text).models || [])
      .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map(m => m.name.replace('models/', '')).filter(n => /flash/i.test(n) && !/image|tts|audio|live|embedding/i.test(n));
  } catch (e) { /* ignore */ }
  const req = C.geminiRequestBody('Отвечай одним словом.', [{ role: 'user', parts: [{ text: 'Скажи OK' }] }], s);
  const t = await window.api.gemini({ url: req.url, body: req.body, key: s.apiKey });
  const ok = t.status === 200;
  msg.className = 'msg ' + (ok ? 'ok' : 'err');
  msg.textContent = (ok ? '✅ Ключ работает, модель «' + s.model + '» отвечает.' : '❌ Модель «' + s.model + '»: ' + t.status + ' ' + String(t.text).slice(0, 200) + '\nВпишите в «Модель» одну из списка ниже.') +
    '\n\nДоступные flash-модели: ' + models.join(', ');
}

// ───────────────────────────── Запуск ─────────────────────────────

function bind() {
  document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $('#btnPasteToggle').addEventListener('click', () => {
    const box = $('#pasteBox'); box.hidden = !box.hidden;
    if (!box.hidden) { $('#pasteMsg').textContent = ''; $('#pasteArea').focus(); }
  });
  $('#pasteArea').addEventListener('paste', onPaste);
  $('#pasteArea').addEventListener('keydown', e => { if (!(e.ctrlKey || e.metaKey)) e.preventDefault(); });
  $('#btnGenerate').addEventListener('click', () => generate());
  $('#btnStop').addEventListener('click', () => { if (run) { run.stop = true; updateRunbar(); toast('Дописываю текущие статьи и останавливаюсь…'); } });
  const tbody = $('#taskTable tbody');
  tbody.addEventListener('change', onTaskChange);
  tbody.addEventListener('click', onTaskClick);
  $('#taskFilters').addEventListener('click', onTaskClick);
  $('#chkAll').addEventListener('change', e => {
    filteredTasks().forEach(t => { if (e.target.checked) selected.add(t.id); else selected.delete(t.id); });
    renderTasks();
  });
  $('#btnRegenSel').addEventListener('click', () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm('Перегенерировать выбранные задачи: ' + ids.length + '?')) return;
    selected.clear(); generate(ids);
  });
  $('#btnDelSel').addEventListener('click', () => {
    if (!selected.size || !confirm('Удалить выбранные задачи: ' + selected.size + '?')) return;
    S.tasks = S.tasks.filter(t => !selected.has(t.id)); selected.clear(); save(); renderTasks();
  });
  $('#articleGroups').addEventListener('click', onArticlesClick);
  $('#hidePlaced').addEventListener('change', renderArticles);
  $('#btnExportDocx').addEventListener('click', exportDocx);
  $('#btnExportHtml').addEventListener('click', exportHtml);
  const pt = $('#projTable tbody');
  pt.addEventListener('change', onProjectChange);
  pt.addEventListener('click', onProjectClick);
  $('#modalClose').addEventListener('click', () => { $('#modal').hidden = true; });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').hidden = true; });
  $('#modalBody').addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); });
  $('#modalCopy').addEventListener('click', () => previewTask && copyHtml(previewTask));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').hidden = true; });
  bindSettings();
}

/** До 1.1.5 бренд для betano-nl.com получался «Betano Nl» — пересчитываем, если его не правили вручную */
function migrateBrands() {
  Object.keys(S.projects).forEach(k => {
    const p = S.projects[k];
    if (p.brandManual) return;
    const t0 = S.tasks.find(t => C.projectKey(t.acceptor) === k);
    const brand = C.brandGuess(p.url, t0 ? t0.anchor : '');
    if (!brand || brand === p.brand) return;
    const old = p.brand;
    p.brand = brand;
    S.tasks.forEach(t => {
      // и у готовых статей: текст не меняется, но при «Перегенерировать» возьмётся правильный бренд
      if (C.projectKey(t.acceptor) === k && t.brand === old && t.status !== 'work') t.brand = brand;
    });
  });
}

/** Алиасы *-latest медленные (до 200 сек на статью) — убираем их из сохранённых настроек */
function migrateModels(st) {
  const alias = m => /-latest$/i.test(String(m).trim());
  if (alias(st.model)) st.model = DEFAULT_SETTINGS.model;
  if (st.fallbacks === OLD_DEFAULT_FALLBACKS) st.fallbacks = DEFAULT_SETTINGS.fallbacks;
  else st.fallbacks = String(st.fallbacks || '').split(/[,;\s]+/).filter(m => m && !alias(m)).join(', ');
}

async function init() {
  bind();
  const data = await window.api.load();
  if (data) {
    S.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    migrateModels(S.settings);
    if (Array.isArray(data.topics)) S.topics = data.topics;
    if (Array.isArray(data.stop)) S.stop = data.stop;
    S.projects = data.projects || {};
    S.donors = data.donors || {};
    S.tasks = (data.tasks || []).map(t => (t.status === 'work' ? Object.assign(t, { status: 'new', step: '' }) : t));
    migrateBrands();
  }
  if (!S.settings.apiKey) { showView('settings'); toast('Вставьте API-ключ Gemini, чтобы начать', 7000); }
  else showView('tasks');
}

init();
