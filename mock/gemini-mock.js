/*
 * Мок-Gemini: имитация generativelanguage API для проверки логики генерации без траты лимита.
 *
 * Отвечает так же, как настоящий API: валидная статья, 429 (в минуту / в день / лимит 0),
 * 404 «используйте models/X», 500, зависание (status 0 через 150 сек — как таймаут в main.js).
 *
 * По умолчанию соблюдает бесплатные лимиты из CLAUDE.md (RPM/RPD на каждую модель):
 * если программа шлёт запросы чаще, мок сам вернёт 429 — так проверяется равномерная отправка.
 *
 * createMockGemini({ clock, limits, script, used, latencyMs }) → { gemini(req), log, stats }
 *   clock    — { setTimeout, now } (виртуальное время из тестов);
 *   limits   — { model: { rpm, rpd } }; модели не из списка отвечают 429 с quotaValue 0;
 *   script   — { model: ['ok', 'bad', 'timeout', '429min:20', '429day', '429zero', '404move:X', '500', 'late:60'] } —
 *              ответы по порядку для конкретной модели; когда список кончился — обычное поведение;
 *   used     — { model: n } — сколько запросов уже потрачено сегодня (для проверки дневного лимита);
 *   latencyMs — время «написания» статьи (по умолчанию 20 сек).
 */
'use strict';

const FREE_LIMITS = {
  'gemini-3.8-flash': { rpm: 5, rpd: 20 },
  'gemini-3.5-flash': { rpm: 5, rpd: 20 },
  'gemini-2.5-flash-lite': { rpm: 10, rpd: 20 },
};

const FILLER = [
  'Most players look at the headline number first, but the real story is in how that number is spread across a session.',
  'A slot with a return of 96% keeps on average four units out of every hundred that pass through it over a very long run.',
  'That figure says nothing about a single evening, because short sessions are dominated by variance rather than by the long-run average.',
  'If the stake is one euro and the bankroll is one hundred euros, a low-volatility game usually lets the session last for several hundred spins.',
  'A high-volatility game with the same return can empty the same bankroll in a fraction of that time and then pay a large win on a later visit.',
  'This is why the same return can feel generous to one player and harsh to another who played for the same length of time.',
  'The wagering requirement turns a bonus into a cost that can be calculated in advance with simple arithmetic.',
  'With a requirement of thirty-five times on a bonus of two hundred euros, the player has to place seven thousand euros in bets.',
  'At a return of 96% the expected loss on that turnover is about two hundred and eighty euros, which is more than the bonus itself.',
  'Bookmakers work in a similar way, and their margin can be read directly from the odds that are shown for a match.',
  'When the implied probabilities of all outcomes add up to more than one hundred percent, the difference is the margin of the bookmaker.',
  'Players who track these numbers tend to make calmer decisions and are less likely to chase losses after a bad run.',
  'None of this guarantees a result, but it turns vague impressions into figures that can be compared from one game to another.',
  'It also helps to set a session limit before playing and to treat it as the price of entertainment rather than as an investment.',
];

function wordCount(s) { return (String(s).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length; }

/** Берёт из промпта программы то, что нужно для статьи */
function readTask(body) {
  const first = (((body.contents || [])[0] || {}).parts || [])[0] || {};
  const p = String(first.text || '');
  const get = k => { const m = p.match(new RegExp('^' + k + ': (.*)$', 'm')); return m ? m[1].trim() : ''; };
  return {
    acceptor: get('Акцептор'), anchor: get('Анкор'), brand: get('Бренд'),
    cross: /^Вариант ссылки: Б/m.test(p),
  };
}

let articleSeq = 0;
/**
 * Статья по структуре 1.2.0, которая проходит проверку кода: 7 разделов, бренд по разу в №1, №3–7,
 * ссылка во 2-м разделе (вариант А — в абзаце, Б — в цитате специалиста). bad = без ссылки и бренда.
 */
function makeArticle(t, bad) {
  const n = ++articleSeq;
  let fi = n % FILLER.length;
  const next = () => FILLER[fi++ % FILLER.length];
  const sents = k => { const a = []; for (let i = 0; i < k; i++) a.push(next()); return a.join(' '); };
  const link = bad ? t.anchor : '<a href="' + t.acceptor + '">' + t.anchor + '</a>';
  const brand = bad ? 'the platform' : t.brand;
  // абзац из 5 предложений, одно из них — с брендом
  const withBrand = phrase => '<p>' + sents(2) + ' ' + phrase + ' ' + sents(3) + '</p>';
  const s2 = t.cross
    ? '<p>' + sents(4) + '</p><p>„Spelers die hun sessies vooraf plannen, verliezen minder tijd aan impulsieve beslissingen; ook op een entertainmentplatform zoals ' +
      link + ' zie je dat duidelijke limieten het spel overzichtelijker maken”, aldus de Nederlandse kansspelanalist Jan de Wit.</p><p>' + sents(2) + '</p>'
    : '<p>' + sents(2) + ' A comparison of session data on the gaming platform ' + link + ' shows the same pattern. ' + sents(3) + '</p>';
  const html = [
    '```html',
    '<h1>Session length and volatility: worked example number ' + n + '</h1>',
    '<h2>Why the average return misleads</h2>' + withBrand('Market analyses mention ' + brand + ' casino as one example of this effect.'),
    '<h2>What session data shows</h2>' + s2,
    '<h2>Reading the bonus terms</h2>' + withBrand('Observations around ' + brand + ' point in the same direction.') +
      '<ul><li>Bonus of 200 euros at thirty-five times means 7000 euros in bets.</li><li>Expected loss at 96% return is about 280 euros.</li>' +
      '<li>Games with lower contribution stretch the turnover further.</li><li>Time limits shorten the window for clearing the bonus.</li></ul>',
    '<h2>Comparing volatility in numbers</h2>' + withBrand('Studies of game lobbies such as ' + brand + ' use the same categories.') +
      '<table><tr><th>Volatility</th><th>Typical return</th><th>Spins per 100 euros</th></tr><tr><td>Low</td><td>96%</td><td>about 600</td></tr>' +
      '<tr><td>Medium</td><td>96%</td><td>about 350</td></tr><tr><td>High</td><td>96%</td><td>about 180</td></tr></table>',
    '<h2>Setting limits before the session</h2>' + withBrand('Loyalty programmes at operators like ' + brand + ' are often analysed in this context.') +
      '<ol><li>Decide the session budget in advance.</li><li>Choose the volatility that fits the budget.</li><li>Stop when the budget is used.</li></ol>',
    '<h2>Patterns across player groups</h2>' + withBrand('Segment reports that include ' + brand + ' describe similar groups.'),
    '<h2>Where the analysis goes next</h2>' + withBrand('Future studies involving ' + brand + ' are expected to refine these figures.'),
    '```',
  ].join('\n');
  return html;
}

function okResponse(text) {
  return JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }] });
}

function quota429(model, kind, retrySec) {
  const perDay = kind === 'day';
  const quotaId = perDay ? 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' : 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier';
  const value = kind === 'zero' ? '0' : String((FREE_LIMITS[model] || {})[perDay ? 'rpd' : 'rpm'] || 5);
  const details = [{
    '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
    violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId,
      quotaDimensions: { location: 'global', model }, quotaValue: value }],
  }];
  if (retrySec) details.push({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retrySec + 's' });
  return JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
    message: 'You exceeded your current quota. Please retry in ' + (retrySec || 0) + 's.', details } });
}

function createMockGemini(opts) {
  const clock = opts.clock;
  const limits = opts.limits || FREE_LIMITS;
  const script = {};
  Object.keys(opts.script || {}).forEach(k => { script[k] = opts.script[k].slice(); });
  const usedDay = Object.assign({}, opts.used || {});
  const accepted = {};          // модель → время принятых запросов (для окна в 60 сек)
  const latency = opts.latencyMs || 20000;
  const log = [];               // { at, model, result }
  const wait = ms => new Promise(r => clock.setTimeout(r, ms));

  async function gemini(req) {
    const at = clock.now();
    const model = decodeURIComponent((String(req.url).match(/models\/([^:]+):/) || [])[1] || '');
    const body = JSON.parse(req.body);
    const entry = { at, model, result: '', body };
    log.push(entry);
    const answer = async (result, status, text, delay) => {
      entry.result = result;
      if (delay) await wait(delay);
      return { status, text };
    };

    const planned = (script[model] || []).shift();
    if (planned) {
      const [kind, arg] = planned.split(':');
      if (kind === 'timeout') return answer('timeout', 0, 'Google не ответил за 2,5 мин', 150000);
      if (kind === '500') return answer('500', 503, '{"error":{"code":503,"message":"The model is overloaded."}}', 2000);
      if (kind === '429min') return answer('429min', 429, quota429(model, 'min', +arg || 20), 300);
      if (kind === '429day') return answer('429day', 429, quota429(model, 'day', 0), 300);
      if (kind === '429zero') return answer('429zero', 429, quota429(model, 'zero', 30), 300);
      if (kind === '404move') return answer('404move', 404, JSON.stringify({ error: { code: 404,
        message: 'models/' + model + ' is no longer available to new users. Please use models/' + arg + ' instead.' } }), 300);
      if (kind === 'bad') return answer('bad', 200, okResponse(makeArticle(readTask(body), true)), latency);
      if (kind === 'late') return answer('ok', 200, okResponse(makeArticle(readTask(body), false)), (+arg || 60) * 1000);
      // 'ok' — дальше обычная ветка с учётом лимитов
    }

    const lim = limits[model];
    if (!lim) return answer('429zero', 429, quota429(model, 'zero', 30), 300);
    if ((usedDay[model] || 0) >= lim.rpd) return answer('429day', 429, quota429(model, 'day', 0), 300);
    const win = (accepted[model] || []).filter(t => at - t < 60000);
    accepted[model] = win;
    if (win.length >= lim.rpm) {
      const retry = Math.ceil((win[0] + 60000 - at) / 1000);
      return answer('429min', 429, quota429(model, 'min', retry), 300);
    }
    win.push(at);
    usedDay[model] = (usedDay[model] || 0) + 1;
    return answer('ok', 200, okResponse(makeArticle(readTask(body), false)), latency);
  }

  return { gemini, log, usedDay };
}

module.exports = { createMockGemini, FREE_LIMITS, makeArticle, wordCount };
