/*
 * Проверка логики генерации на мок-Gemini (реальный лимит не тратится).
 *
 * Node не нужен — подходит Electron из установленной программы:
 *   set ELECTRON_RUN_AS_NODE=1
 *   "%LOCALAPPDATA%\Programs\ArticleGenerator\ArticleGenerator.exe" test\run.js
 * Результат пишется в test\last-run.txt (окно Electron не выводит текст в консоль).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./harness');
const { FREE_LIMITS } = require('../mock/gemini-mock');

const out = [];
const print = s => { out.push(s); console.log(s); };
let failed = 0;

function task(i, extra) {
  return Object.assign({
    id: 't' + i, donor: 'https://donor' + i + '.co.uk/', acceptor: 'https://betanonl.net/', anchor: 'betano casino',
    langDonor: 'en', langDonorSrc: 'зона .uk', langLink: 'en', brand: 'Betano', topic: '', status: 'new', created: 1,
  }, extra || {});
}
function data(settings, n, taskExtra) {
  const tasks = [];
  for (let i = 1; i <= n; i++) tasks.push(task(i, taskExtra && taskExtra(i)));
  return { settings: Object.assign({ apiKey: 'test-key' }, settings || {}), projects: {}, tasks };
}

/** Запускает генерацию всех новых задач и ждёт окончания (в виртуальном времени) */
async function generate(app, limitMs) {
  let done = false;
  app.eval('generate()').then(() => { done = true; });
  await app.clock.runUntil(() => done, limitMs || 6 * 3600000);
}

function gaps(log) {
  const g = [];
  for (let i = 1; i < log.length; i++) g.push(log[i].at - log[i - 1].at);
  return g;
}
const tasksOf = app => app.eval('S').tasks;
const sec = ms => Math.round(ms / 1000) + ' сек';

async function test(name, fn) {
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };
  try { await fn(check); } catch (e) { fails.push('исключение: ' + (e.stack || e.message)); }
  if (fails.length) { failed++; print('❌ ' + name + '\n   - ' + fails.join('\n   - ')); } else print('✅ ' + name);
}

const LIMITS_PLUS = Object.assign({}, FREE_LIMITS, { 'gemini-3.9-flash': { rpm: 5, rpd: 20 } });

(async () => {
  await test('Настройки по умолчанию (первый запуск)', async check => {
    const app = await loadApp({ data: null });
    const s = app.eval('S.settings');
    check(s.model === 'gemini-3.8-flash', 'модель: ' + s.model);
    check(s.fallbacks === 'gemini-3.5-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-2.5-flash-lite', 'резервные: ' + s.fallbacks);
    check(+s.parallel === 1, 'одновременно: ' + s.parallel);
    check(+s.rpm === 5, 'запросов в минуту: ' + s.rpm);
    check(+s.minChars === 4500 && +s.maxChars === 6500, 'объём: ' + s.minChars + '–' + s.maxChars);
  });

  await test('Старые настройки: алиас gemini-flash-latest и старые резервные заменяются, свои значения сохраняются', async check => {
    const app = await loadApp({ data: data({ model: 'gemini-flash-latest',
      fallbacks: 'gemini-3.5-flash, gemini-3.1-flash-lite, gemini-flash-lite-latest', minChars: 4200, maxChars: 6000 }, 0) });
    const s = app.eval('S.settings');
    check(s.model === 'gemini-3.8-flash', 'модель: ' + s.model);
    check(s.fallbacks === 'gemini-3.5-flash, gemini-3.7-flash, gemini-3.6-flash, gemini-2.5-flash-lite', 'резервные: ' + s.fallbacks);
    check(+s.minChars === 4200 && +s.maxChars === 6000, 'объём пользователя изменился: ' + s.minChars + '–' + s.maxChars);
    const app2 = await loadApp({ data: data({ model: 'gemini-3.5-flash', fallbacks: 'gemini-2.5-flash-lite, gemini-flash-lite-latest' }, 0) });
    const s2 = app2.eval('S.settings');
    check(s2.model === 'gemini-3.5-flash', 'своя модель изменилась: ' + s2.model);
    check(s2.fallbacks === 'gemini-2.5-flash-lite', 'алиас не убран из своих резервных: ' + s2.fallbacks);
  });

  for (const parallel of [1, 3]) {
    await test('Равномерная отправка: 8 статей, ' + parallel + ' поток(а), статья пишется 5 сек — ни одного 429, интервал ≥ 12 сек', async check => {
      const app = await loadApp({ data: data({ parallel }, 8), mock: { latencyMs: 5000 } });
      await generate(app);
      const log = app.mock.log;
      const r429 = log.filter(x => /^429/.test(x.result)).length;
      check(r429 === 0, 'ответов 429: ' + r429);
      const min = Math.min.apply(null, gaps(log));
      check(min >= 12000, 'минимальный интервал между запросами: ' + sec(min));
      check(log.length === 8, 'запросов: ' + log.length);
      const ok = tasksOf(app).filter(t => t.status === 'ok').length;
      check(ok === 8, 'готово ОК: ' + ok + ' из 8');
      check(app.steps.some(x => /^жду очереди запросов · \d+ сек$/.test(x.step)), 'в статусе нет «жду очереди запросов · N сек»');
      const total = app.clock.now() - log[0].at;
      print('   (8 статей за ' + sec(total) + ' виртуального времени)');
    });
  }

  await test('Запросов в минуту = 10 (gemini-2.5-flash-lite): интервал ≥ 6 сек, без 429', async check => {
    const app = await loadApp({ data: data({ model: 'gemini-2.5-flash-lite', fallbacks: '', rpm: 10, parallel: 3 }, 6), mock: { latencyMs: 3000 } });
    await generate(app);
    const log = app.mock.log;
    check(log.every(x => x.result === 'ok'), 'результаты: ' + log.map(x => x.result).join(','));
    const min = Math.min.apply(null, gaps(log));
    check(min >= 6000 && min < 12000, 'минимальный интервал: ' + sec(min));
  });

  await test('Секундомер в статусе: «пишу статью · N сек»', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { script: { 'gemini-3.8-flash': ['late:34'] } } });
    await generate(app);
    const st = app.steps.map(x => x.step);
    const secs = st.map(s => (s.match(/^пишу статью · (\d+) сек$/) || [])[1]).filter(Boolean).map(Number);
    check(secs.length > 20, 'обновлений секундомера: ' + secs.length);
    check(Math.max.apply(null, secs) >= 33, 'максимум на секундомере: ' + Math.max.apply(null, secs));
  });

  await test('Дневной лимит основной модели → сразу резервная', async check => {
    const app = await loadApp({ data: data({}, 3), mock: { used: { 'gemini-3.8-flash': 20 } } });
    await generate(app);
    const log = app.mock.log;
    check(log.filter(x => x.model === 'gemini-3.8-flash').length === 1, 'запросов к исчерпанной модели: ' + log.filter(x => x.model === 'gemini-3.8-flash').length);
    check(tasksOf(app).every(t => t.status === 'ok' && t.model === 'gemini-3.5-flash'), 'статусы/модели: ' + tasksOf(app).map(t => t.status + '/' + t.model).join(', '));
  });

  await test('Лимит 0 (модель недоступна бесплатно) → следующая резервная, без ожидания retryDelay', async check => {
    const app = await loadApp({ data: data({}, 2), mock: { used: { 'gemini-3.8-flash': 20, 'gemini-3.5-flash': 20 } } });
    await generate(app);
    const order = app.mock.log.map(x => x.model + ':' + x.result);
    check(tasksOf(app).every(t => t.status === 'ok' && t.model === 'gemini-2.5-flash-lite'), 'статусы/модели: ' + tasksOf(app).map(t => t.status + '/' + t.model).join(', '));
    check(order.slice(0, 4).join(' ') === 'gemini-3.8-flash:429day gemini-3.5-flash:429day gemini-3.7-flash:429zero gemini-3.6-flash:429zero', 'порядок: ' + order.join(' '));
  });

  await test('Все модели исчерпаны → остановка с понятной причиной, остальные задачи остаются «Новая»', async check => {
    const app = await loadApp({ data: data({}, 3), mock: { used: { 'gemini-3.8-flash': 20, 'gemini-3.5-flash': 20, 'gemini-2.5-flash-lite': 20 } } });
    await generate(app);
    const ts = tasksOf(app);
    check(ts[0].status === 'error' && /Дневной лимит/.test(ts[0].errors[0]), 'первая задача: ' + ts[0].status + ' ' + (ts[0].errors || []).join(''));
    check(ts.slice(1).every(t => t.status === 'new'), 'остальные: ' + ts.slice(1).map(t => t.status).join(','));
    check(app.eval('run') === null, 'генерация не завершилась');
  });

  await test('Таймаут 150 сек → один повтор → ОК', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { script: { 'gemini-3.8-flash': ['timeout'] } } });
    await generate(app);
    const t = tasksOf(app)[0];
    check(t.status === 'ok', 'статус: ' + t.status + ' ' + (t.errors || []).join(''));
    check(app.mock.log.length === 2, 'запросов: ' + app.mock.log.length);
  });

  await test('Два таймаута → «Ошибка» с причиной, очередь идёт дальше, статья не держит очередь > 6 мин', async check => {
    const app = await loadApp({ data: data({}, 2), mock: { script: { 'gemini-3.8-flash': ['timeout', 'timeout'] } } });
    await generate(app);
    const [a, b] = tasksOf(app);
    check(a.status === 'error' && /не ответил/.test(a.errors[0]), 'первая: ' + a.status + ' ' + (a.errors || []).join(''));
    check(b.status === 'ok', 'вторая: ' + b.status);
    const held = app.mock.log[2].at - app.mock.log[0].at;
    check(held <= 6 * 60000, 'очередь стояла ' + sec(held));
  });

  await test('429 в минуту с retryDelay 20 сек → ждём и повторяем', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { script: { 'gemini-3.8-flash': ['429min:20'] } } });
    await generate(app);
    const log = app.mock.log;
    check(tasksOf(app)[0].status === 'ok', 'статус: ' + tasksOf(app)[0].status);
    check(log.length === 2 && log[1].at - log[0].at >= 20000, 'пауза: ' + (log[1] ? sec(log[1].at - log[0].at) : 'нет повтора'));
  });

  await test('500 «модель перегружена» → повтор → ОК', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { script: { 'gemini-3.8-flash': ['500'] } } });
    await generate(app);
    check(tasksOf(app)[0].status === 'ok', 'статус: ' + tasksOf(app)[0].status + ' ' + (tasksOf(app)[0].errors || []).join(''));
  });

  await test('404 «use models/X» → переход на X и сохранение в настройках', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { limits: LIMITS_PLUS, script: { 'gemini-3.8-flash': ['404move:gemini-3.9-flash'] } } });
    await generate(app);
    check(tasksOf(app)[0].status === 'ok', 'статус: ' + tasksOf(app)[0].status);
    check(app.saved().settings.model === 'gemini-3.9-flash', 'в настройках: ' + app.saved().settings.model);
  });

  await test('Статья с критичными ошибками → один запрос на исправление → ОК', async check => {
    const app = await loadApp({ data: data({}, 1), mock: { script: { 'gemini-3.8-flash': ['bad'] } } });
    await generate(app);
    const t = tasksOf(app)[0];
    check(t.status === 'ok' && t.attempts === 2, 'статус ' + t.status + ', запросов ' + t.attempts);
  });

  await test('Вариант Б (en → de): цитата со ссылкой проходит проверку', async check => {
    const app = await loadApp({ data: data({}, 1, () => ({ langLink: 'de' })) });
    await generate(app);
    const t = tasksOf(app)[0];
    check(t.status === 'ok', 'статус ' + t.status + ' ' + (t.errors || []).concat(t.soft || []).join(' · '));
  });

  await test('Вставка: одинаковые строки — отдельные статьи; повторная вставка тех же строк не добавляет ничего', async check => {
    const app = await loadApp({ data: data({}, 0) });
    const row = (donor, anchor) => ({ donor: 'https://' + donor + '/', acceptor: 'https://betano-nl.com/', anchor, langLink: '', topic: '' });
    const paste = [];
    for (let i = 0; i < 9; i++) paste.push(row('dutchcaribbeanlegalportal.com', 'Betano Casino NL'));
    for (let i = 0; i < 8; i++) paste.push(row('wouters-bouwadvies.nl', 'https://betano-nl.com/'));
    const add = async rows => {
      let done = false;
      app.ctx.__rows = rows;
      app.eval('addRows(__rows)').then(() => { done = true; });
      await app.clock.runUntil(() => done);
      return app.els['#pasteMsg'].textContent;
    };
    let msg = await add(paste);
    check(tasksOf(app).length === 17, 'после первой вставки задач: ' + tasksOf(app).length + ' (' + msg + ')');
    msg = await add(paste);
    check(tasksOf(app).length === 17, 'повторная вставка добавила: ' + (tasksOf(app).length - 17));
    check(/пропущено дублей: 17/.test(msg), 'сообщение: ' + msg);
    msg = await add(paste.concat([row('dutchcaribbeanlegalportal.com', 'Betano Casino NL'), row('newdonor.nl', 'betano')]));
    check(tasksOf(app).length === 19, 'план дополнен двумя строками, задач: ' + tasksOf(app).length + ' (' + msg + ')');
  });

  // ── Язык донора ──
  const NL_TEXT = '<p>' + 'De meeste spelers kijken eerst naar het getal, maar het echte verhaal zit in hoe dat over een sessie wordt verdeeld. Het is niet voor iedereen en dat is ook de bedoeling van deze pagina. '.repeat(4) + '</p>';
  const DA_TEXT = '<p>' + 'Det er ikke altid let at finde det rigtige, og der er også mange som har en mening om det. Vi kan hjælpe med at finde frem til det for dig. '.repeat(4) + '</p>';
  const pasteRows = async (app, rows) => {
    let done = false;
    app.ctx.__rows = rows;
    app.eval('addRows(__rows)').then(() => { done = true; });
    await app.clock.runUntil(() => done && !app.clock.pending());   // и отложенное сохранение тоже
    return app.els['#pasteMsg'].textContent;
  };
  const prow = donor => ({ donor, acceptor: 'https://betano-nl.com/', anchor: 'Betano Casino NL', langLink: 'nl', topic: '' });
  /** Выбор языка в строке таблицы — как событие change от <select class="f-ld"> */
  const chooseDonorLang = async (app, t, lang) => {
    app.ctx.__ev = { target: { value: lang, classList: { contains: c => c === 'f-ld' }, closest: () => ({ dataset: { id: t.id } }) } };
    app.eval('onTaskChange(__ev)');
    await app.clock.runUntil(() => !app.clock.pending());
  };

  await test('Язык донора: выбор в одной строке → во всех строках донора и при следующих вставках', async check => {
    const app = await loadApp({ data: data({}, 0) });
    await pasteRows(app, [prow('https://dutchcaribbeanlegalportal.com'), prow('https://dutchcaribbeanlegalportal.com'), prow('https://other.com')]);
    let ts = tasksOf(app);
    check(ts.every(t => t.status === 'need_lang'), 'до выбора: ' + ts.map(t => t.status).join(','));
    await chooseDonorLang(app, ts[0], 'nl');
    ts = tasksOf(app);
    check(ts[0].langDonor === 'nl' && ts[1].langDonor === 'nl', 'строки донора: ' + ts[0].langDonor + ',' + ts[1].langDonor);
    check(ts[2].langDonor === '', 'чужой донор тоже изменился: ' + ts[2].langDonor);
    check(app.saved() && app.saved().donors['dutchcaribbeanlegalportal.com'].lang === 'nl', 'язык не сохранён в data.json');
    await pasteRows(app, [prow('https://www.dutchcaribbeanlegalportal.com/'), prow('https://dutchcaribbeanlegalportal.com')]);
    ts = tasksOf(app);
    check(ts.length === 4 && ts[3].langDonor === 'nl' && !ts[3].langGuess && ts[3].status === 'new', 'новая вставка: ' + ts.slice(3).map(t => t.langDonor + '/' + t.status).join(','));
  });

  await test('Язык донора угадывается по сайту: жёлтая строка, генерировать можно', async check => {
    const app = await loadApp({ data: data({}, 0), pages: {
      'https://dutchcaribbeanlegalportal.com': '<html lang="en-US"><head><title>Portal</title></head><body>' + NL_TEXT + '</body></html>',
      'https://dansk-site.com': '<html lang="da"><body>' + DA_TEXT + '</body></html>',
      'https://only-attr.com': '<html lang="de-DE"><body><p>Kurz.</p></body></html>',
    } });
    const msg = await pasteRows(app, [prow('https://dutchcaribbeanlegalportal.com'), prow('https://dansk-site.com'), prow('https://only-attr.com'), prow('https://empty.com')]);
    const ts = tasksOf(app);
    check(ts[0].langDonor === 'nl' && ts[0].langGuess && ts[0].status === 'new', 'текст важнее lang="en-US": ' + ts[0].langDonor + '/' + ts[0].status);
    check(ts[1].langDonor === 'da', 'датский: ' + ts[1].langDonor);
    check(ts[2].langDonor === 'de' && ts[2].langGuess, 'только атрибут: ' + ts[2].langDonor);
    check(ts[3].langDonor === '' && ts[3].status === 'need_lang', 'пустой сайт: ' + ts[3].langDonor + '/' + ts[3].status);
    check(/угадан по сайту.*: 3/.test(msg), 'сообщение: ' + msg);
    check(/class="f-ld guess"/.test(app.eval('taskRowHtml(S.tasks[0])')), 'нет жёлтой подсветки');
    // исправление угаданного — запоминается как ручной выбор, подсветка уходит
    await chooseDonorLang(app, ts[0], 'en');
    check(!tasksOf(app)[0].langGuess && app.saved().donors['dutchcaribbeanlegalportal.com'].lang === 'en', 'ручной выбор не сохранился');
  });

  await test('Язык донора: ручной выбор важнее доменной зоны; .nl без памяти — по зоне', async check => {
    const app = await loadApp({ data: Object.assign(data({}, 0), { donors: { 'english-site.nl': { lang: 'en', guess: false } } }) });
    await pasteRows(app, [prow('https://english-site.nl'), prow('https://wouters-bouwadvies.nl')]);
    const ts = tasksOf(app);
    check(ts[0].langDonor === 'en', 'сохранённый: ' + ts[0].langDonor);
    check(ts[1].langDonor === 'nl' && !ts[1].langGuess, 'по зоне: ' + ts[1].langDonor);
  });

  // ── 1.1.5: бренд, проверка статьи, промпт ──
  const C = require('../src/core');
  const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const nlCtx = (brand, anchor) => ({ acceptor: 'https://betano-nl.com/', anchor, brand, cross: false, lang: 'nl',
    minChars: 4500, maxChars: 6500, stop: C.DEFAULT_STOP, usedH1: [] });
  const checkArticle = (html, ctx) => C.validateArticle(C.autoFix(C.sanitizeHtml(html, ctx.acceptor), ctx), ctx);

  await test('Бренд из домена: гео-хвост отрезается, подсказка из анкора работает', async check => {
    const cases = [
      ['https://betano-nl.com/', 'Betano Casino NL', 'Betano'], ['https://betano-nl.com/', 'https://betano-nl.com/', 'Betano'],
      ['https://betano-schweiz.ch/', 'bahigo casino schweiz', 'Betano'], ['https://betanoswitzerland.net/', 'bahigo login', 'Betano'],
      ['https://winnit-nl.com/', 'winnit', 'Winnit'], ['https://betanonl.net/', 'betano casino', 'Betano'],
      ['https://super-slots-online.com/', 'slots', 'Super Slots Online'], ['https://vulkanbet.com/', 'online casino', 'Vulkanbet'],
      ['https://1wins.co.uk/', '1win', '1win'], ['https://thebahigocasino.com/', 'bahigo 75', 'Thebahigocasino'],
    ];
    cases.forEach(([url, anchor, want]) => {
      const got = C.brandGuess(url, anchor);
      check(got === want, url + ' + «' + anchor + '» → «' + got + '», нужно «' + want + '»');
    });
  });

  await test('Сохранённый бренд «Betano Nl» исправляется при запуске, ручной бренд не трогается', async check => {
    const d = data({}, 2, i => ({ acceptor: i === 1 ? 'https://betano-nl.com/' : 'https://winnit-nl.com/', brand: i === 1 ? 'Betano Nl' : 'Winnit NL!', status: i === 1 ? 'ok' : 'new' }));
    d.projects = { 'betano-nl.com': { url: 'https://betano-nl.com/', brand: 'Betano Nl', lang: 'nl', brandManual: false },
      'winnit-nl.com': { url: 'https://winnit-nl.com/', brand: 'Winnit NL!', lang: 'nl', brandManual: true } };
    const app = await loadApp({ data: d });
    const S = app.eval('S');
    check(S.projects['betano-nl.com'].brand === 'Betano', 'проект: ' + S.projects['betano-nl.com'].brand);
    check(S.tasks[0].brand === 'Betano', 'задача: ' + S.tasks[0].brand);
    check(S.projects['winnit-nl.com'].brand === 'Winnit NL!' && S.tasks[1].brand === 'Winnit NL!', 'ручной бренд изменился');
  });

  await test('Ваша плохая статья: длинные <h2> и отсутствие ссылки — критичные; «zodра» видно в мелочах; однозначные буквы код правит сам', async check => {
    const ctx = nlCtx('Betano', 'Betano Casino Nederland');
    const v = checkArticle(fixture('bad-nl.html'), ctx);
    check(v.errors.some(e => /<h2> должны быть короткими.*4 шт/.test(e)), 'нет ошибки про длинные <h2>: ' + v.errors.join(' | '));
    check(v.errors.some(e => /ровно один тег <a>/.test(e)), 'нет ошибки про ссылку');
    check(v.soft.some(e => /смешанными буквами.*zodр/.test(e)), 'нет мелочи про «zodра»: ' + v.soft.join(' | '));
    check(C.fixMixedScript('Ставкa и mаrge') === 'Ставка и marge', 'однозначные буквы: ' + C.fixMixedScript('Ставкa и mаrge'));
    check(C.fixMixedScript('zodра') !== 'zodpa', '«zodра» превратилось в «zodpa»');
    const html = C.autoFix('<p>De mаrge is 5%.</p>', ctx);
    check(html === '<p>De marge is 5%.</p>', 'autoFix: ' + html);
  });

  // ── 1.2.0: структура по промпту команды ──
  const teamCtx = (brand, anchor, lang) => ({ acceptor: 'https://qbet-s.org/', anchor, brand, cross: true, lang,
    minChars: 4500, maxChars: 6500, stop: C.DEFAULT_STOP, usedH1: [] });

  await test('Три эталонные статьи команды проходят проверку без серьёзных ошибок', async check => {
    [['team-de-cross-nl-1.html', 'qbet-s.org', 'qbet casino', 'de'], ['team-de-cross-nl-2.html', 'QBet', 'QBet Casino', 'de'],
      ['team-en-cross-nl-3.html', 'Qbet', 'Casino QBet', 'en']].forEach(([f, brand, anchor, lang]) => {
      const v = checkArticle(fixture(f), teamCtx(brand, anchor, lang));
      check(!v.errors.length, f + ': ' + v.errors.join(' | '));
      check(!v.soft.some(e => /бренд/.test(e)), f + ' замечания по бренду: ' + v.soft.filter(e => /бренд/.test(e)).join(' | '));
    });
  });

  await test('Ссылка: в 1-м разделе — серьёзная ошибка, в 3-м — мелочь, во 2-м — норма', async check => {
    const ctx = teamCtx('Qbet', 'Casino QBet', 'en');
    const art = fixture('team-en-cross-nl-3.html');
    const link = '<a title="Casino QBet" href="https://qbet-s.org/" target="_blank" rel="noopener noreferrer">Casino QBet</a>';
    const noLink = art.replace(link, 'this platform');
    const secs = noLink.split(/(?=<h2>)/);
    const put = i => { const s = secs.slice(); s[i] = s[i].replace('</p>', ' A gaming platform such as ' + link + ' illustrates this.</p>'); return s.join(''); };
    const v1 = checkArticle(put(1), ctx);
    check(v1.errors.some(e => /не должна стоять в первом разделе/.test(e)), 'ссылка в 1-м разделе прошла: ' + v1.errors.join(' | '));
    const v3 = checkArticle(put(3), Object.assign({}, ctx, { cross: false }));
    check(!v3.errors.length && v3.soft.some(e => /во 2-м разделе, сейчас в №3/.test(e)), 'ссылка в 3-м: ' + v3.errors.concat(v3.soft).join(' | '));
  });

  await test('Бренд: QBet = Qbet, «spin» ≠ Spin, форма «бренд + casino», бренд во 2-м разделе — мелочь', async check => {
    check(C.countBrand('QBet and Qbet and QBET', 'Qbet') === 3, 'регистр внутри бренда');
    check(C.countBrand('one spin, then Spin', 'Spin') === 1, 'короткий бренд ловит обычное слово');
    check(C.hasBrandCasino('analyses of QBet Casino show', 'Qbet') && C.hasBrandCasino('het kasino Betano', 'Betano'), 'форма бренд + casino не найдена');
    const ctx = teamCtx('QBet', 'QBet Casino', 'de');
    const art = fixture('team-de-cross-nl-2.html');
    const v = checkArticle(art.replace('Psychologische Untersuchungen zeigen', 'Psychologische Untersuchungen rund um QBet zeigen'), ctx);
    check(v.soft.some(e => /Во 2-м разделе \(со ссылкой\) бренда быть не должно/.test(e)), 'бренд во 2-м разделе не замечен: ' + v.soft.join(' | '));
    const noCasino = art.replace(/QBet Casino<\/strong>/g, 'QBet</strong>');
    check(checkArticle(noCasino, ctx).soft.some(e => /форма «QBet casino»/.test(e)), 'нет мелочи про форму бренд + casino');
  });

  await test('Заголовок с «Как/How», элементы в одном разделе, объём — проверяются', async check => {
    const ctx = teamCtx('Qbet', 'Casino QBet', 'en');
    const art = fixture('team-en-cross-nl-3.html');
    const how = art.replace('<h1>Cooldown Mechanics', '<h1>How Cooldown Mechanics');
    check(checkArticle(how, ctx).soft.some(e => /не должен начинаться с «Как»/.test(e)), 'заголовок с How не замечен');
    const sameSec = art.replace('<ol>', '<ul><li>x</li></ul><ol>').replace(/<ul>\s*<li>Average session duration[\s\S]*?<\/ul>/, '');
    check(checkArticle(sameSec, ctx).soft.some(e => /в разных разделах/.test(e)), 'ul и ol в одном разделе не замечены');
    const short = art.split(/(?=<h2>)/).slice(0, 4).join('') + '<h2>Ending</h2><p>Short.</p><h2>More</h2><p>Short.</p><h2>Last</h2><p>Short.</p>';
    check(checkArticle(short, ctx).errors.some(e => /Объём \d+ знаков/.test(e)), 'короткая статья не поймана');
  });

  await test('Промпт: 7 разделов, бренд 6 раз, ссылка во 2-м разделе, объём в знаках, все подстановки заполнены', async check => {
    const app = await loadApp({ data: data({}, 1) });
    await generate(app);
    const sys = app.mock.log[0].body.systemInstruction.parts[0].text;
    check(!/\{(MIN|MAX|SEC|STOP)\}/.test(sys), 'остались подстановки: ' + (sys.match(/\{[A-Z]+\}/g) || []).join(','));
    check(/РОВНО 7 разделов <h2>/.test(sys), 'нет 7 разделов');
    check(/от 4500 до 6500 знаков с пробелами, около 750 знаков на раздел/.test(sys), 'нет объёма в знаках');
    check(/ровно 6 упоминаний: по одному в разделах №1, №3, №4, №5, №6, №7\. Во 2-м разделе бренда НЕТ/.test(sys), 'нет правила бренда');
    check(/SEO-ССЫЛКА — ровно одна, во 2-м разделе/.test(sys), 'нет правила ссылки');
    check(/Не начинается со слова «Как»/.test(sys), 'нет правила про «Как»');
    check(tasksOf(app)[0].status === 'ok' && !(tasksOf(app)[0].soft || []).length, 'мок-статья: ' + (tasksOf(app)[0].soft || []).join(' | '));
  });

  // ── 1.1.6: вариант Б — специалист из страны акцептора ──
  await test('Страна акцептора по домену и языку ссылки', async check => {
    const cases = [['https://betanoswitzerland.net/', 'de', 'Швейцария'], ['https://betano-schweiz.ch/', 'de', 'Швейцария'],
      ['https://betano-nl.com/', 'nl', 'Нидерланды'], ['https://qbet-s.org/', 'nl', 'Нидерланды'], ['https://site.de/', 'de', 'Германия'],
      ['https://1wins.co.uk/', 'en', 'Великобритания'], ['https://vulkanbet.com/', 'pl', 'Польша'], ['https://example.com/', 'en', '']];
    cases.forEach(([url, lang, want]) => {
      const got = C.acceptorCountry(url, lang);
      check(got === want, url + ' (' + lang + ') → «' + got + '», нужно «' + want + '»');
    });
    const ini = new Set();
    for (let i = 0; i < 50; i++) ini.add(C.expertInitials());
    check(ini.size > 30 && [...ini].every(x => /^[A-Z]\. [A-Z]\.$/.test(x)), 'инициалы: ' + [...ini].slice(0, 5).join(', '));
  });

  await test('Ваша статья en → de: цитата, начинающаяся с анкора, — серьёзная ошибка', async check => {
    const ctx = { acceptor: 'https://betanoswitzerland.net/', anchor: 'betano live wetten', brand: 'Betano', cross: true, lang: 'en',
      minChars: 4500, maxChars: 6500, stop: C.DEFAULT_STOP, usedH1: [] };
    const v = checkArticle(fixture('bad-cross-en-de.html'), ctx);
    check(v.errors.some(e => /Цитата начинается с анкора/.test(e)), 'нет ошибки: ' + v.errors.join(' | '));
    const fixed = fixture('bad-cross-en-de.html').replace('<blockquote><a href="https://betanoswitzerland.net/">betano live wetten</a> erfreut sich großer Beliebtheit, wobei',
      '<blockquote>„Bei Anbietern wie <a href="https://betanoswitzerland.net/">betano live wetten</a> sehen wir, dass');
    const v2 = checkArticle(fixed, ctx);
    check(!v2.errors.some(e => /Цитата/.test(e)), 'ссылка в середине цитаты считается ошибкой: ' + v2.errors.join(' | '));
  });

  await test('Промпт варианта Б: страна, инициалы специалиста и правило «не начинать цитату с анкора»', async check => {
    const app = await loadApp({ data: data({}, 2, i => ({ acceptor: 'https://betanoswitzerland.net/', anchor: 'betano live wetten',
      langDonor: 'en', langLink: i === 1 ? 'de' : 'en' })) });
    await generate(app);
    const user = n => app.mock.log[n].body.contents[0].parts[0].text;
    const sys = app.mock.log[0].body.systemInstruction.parts[0].text;
    check(/Страна акцептора: Швейцария/.test(user(0)), 'нет страны: ' + user(0));
    check(/имя на букву [A-Z], фамилия на букву [A-Z]\)\. Пиши имя и фамилию полностью, не инициалами/.test(user(0)), 'нет указания на полное имя: ' + user(0));
    check(!/Страна акцептора/.test(user(1)), 'страна попала в вариант А');
    check(/НИКОГДА не начинай цитату с анкора/.test(sys) && /имя и фамилия вымышленные, полные/.test(sys), 'нет правил варианта Б');
    check(tasksOf(app).every(t => t.status === 'ok'), 'статусы: ' + tasksOf(app).map(t => t.status + ' ' + (t.errors || []).join('')).join(' | '));
  });

  // ── 1.1.7: статья на русском вместо языка донора ──
  await test('Статья на русском вместо нидерландского — серьёзная ошибка (раньше проходила молча)', async check => {
    const ctx = nlCtx('Betano', 'https://betano-nl.com/');
    const ru = 'Отказ от эмоционального контроля часто приводит к быстрой потере депозита из-за дисперсии слотов. ' +
      'Математическое ожидание в играх с отрицательным балансом всегда работает против игрока на длинной дистанции. ';
    const russian = fixture('good-nl.html').replace(/<(p|li|h1|h2|th|td)>(?!<a)[^<]*(?=<)/g, (m, tag) => '<' + tag + '>' + ru);
    const v = checkArticle(russian, ctx);
    check(v.errors.some(e => /кириллицей/.test(e)), 'русская статья не поймана: ' + v.errors.join(' | '));
    check(!checkArticle(fixture('good-nl.html'), ctx).errors.some(e => /кириллицей/.test(e)), 'нидерландская статья считается русской');
    const ruCtx = Object.assign({}, ctx, { lang: 'ru' });
    check(!checkArticle(russian, ruCtx).errors.some(e => /кириллицей/.test(e)), 'русская статья для русского донора считается ошибкой');
  });

  await test('Промпт без русских фраз-примеров; язык статьи назван явно; вариант Б без перевода', async check => {
    const app = await loadApp({ data: data({}, 1, () => ({ acceptor: 'https://betano-nl.com/', langDonor: 'en', langLink: 'nl' })) });
    await generate(app);
    const sys = app.mock.log[0].body.systemInstruction.parts[0].text;
    const user = app.mock.log[0].body.contents[0].parts[0].text;
    check(/^ЯЗЫК СТАТЬИ: English — English \(en\) — вся статья на этом языке, НЕ на русском\./.test(user), 'первая строка задания: ' + user.split('\n')[0]);
    check(/Язык ссылки: Nederlands — Dutch \(nl\)/.test(user), 'язык ссылки: ' + (user.match(/Язык ссылки: .*/) || [''])[0]);
    check(/Статья НИКОГДА не пишется на русском/.test(sys), 'нет правила «не на русском»');
    ['на платформах вроде', 'Короткий подзаголовок', 'Конкретный заголовок', 'БРЕНД казино', 'как отмечают аналитики', 'точный перевод цитаты']
      .forEach(p => check(sys.indexOf(p) < 0, 'в промпте осталось «' + p + '»'));
    check(/Цитату не переводи/.test(sys), 'нет правила «без перевода»');
  });

  print('\n' + (failed ? 'Не прошло: ' + failed : 'Все проверки прошли'));
  fs.writeFileSync(path.join(__dirname, 'last-run.txt'), out.join('\n') + '\n');
  process.exitCode = failed ? 1 : 0;
})();
