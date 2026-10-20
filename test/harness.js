/*
 * Запуск настоящего src/app.js вне Electron: заглушка DOM, виртуальные часы, мок-Gemini вместо сети.
 * Виртуальное время: 150 сек таймаута или 12 сек паузы проходят мгновенно, но код видит их «как есть».
 */
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { createMockGemini } = require('../mock/gemini-mock');

const ROOT = path.join(__dirname, '..');

/** Виртуальные часы: таймеры срабатывают по порядку времени, между ними выполняются все промисы */
function createClock() {
  let now = Date.UTC(2026, 9, 20, 9, 0, 0);
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, +ms || 0), fn, every, id }); return id; };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now); }
    static now() { return now; }
  }
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
  return {
    now: () => now,
    pending: () => timers.size,
    Date: FakeDate,
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, Math.max(1, +ms || 1)),
    clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id),
    /** Крутит время, пока cond() не станет true. limitMs — защита от вечного цикла (виртуальные мс). */
    async runUntil(cond, limitMs) {
      const end = now + (limitMs || 6 * 3600000);
      for (;;) {
        await flush();
        if (cond()) return;
        let next = null;
        timers.forEach(t => { if (!next || t.at < next.at || (t.at === next.at && t.id < next.id)) next = t; });
        if (!next) throw new Error('Зависание: нет таймеров, а условие не выполнено');
        if (next.at > end) throw new Error('Превышено время ожидания (' + Math.round((limitMs || 0) / 1000) + ' сек виртуальных)');
        now = Math.max(now, next.at);
        if (next.every) next.at = now + next.every; else timers.delete(next.id);
        next.fn();
      }
    },
  };
}

/** Универсальный «элемент»: всё, к чему обращается app.js, существует и ничего не делает */
function makeEl(extra) {
  return Object.assign({
    textContent: '', innerHTML: '', value: '', checked: false, hidden: false, disabled: false, type: 'text', className: '',
    style: {}, dataset: {}, outerHTML: '',
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {}, focus() {}, querySelector: () => makeEl(), querySelectorAll: () => [], contains: () => false,
  }, extra || {});
}

/**
 * Загружает app.js. opts: { data — содержимое data.json (или null), mock — параметры мок-Gemini }
 * Возвращает { ctx, clock, mock, api, eval(code), saved(), steps }
 */
async function loadApp(opts) {
  opts = opts || {};
  const clock = createClock();
  const mock = createMockGemini(Object.assign({ clock }, opts.mock || {}));
  const els = {};
  const steps = [];   // { at, id, step } — что показывала строка задачи
  let savedData = null;
  let ctx;
  const navActive = makeEl({ dataset: { view: 'tasks' } });
  const document = {
    activeElement: null,
    querySelector(sel) {
      const m = sel.match(/^#taskTable tr\[data-id="([^"]+)"\]/);
      if (m) {
        const t = vm.runInContext('S', ctx).tasks.find(x => x.id === m[1]);
        if (t && t.status === 'work' && t.step) steps.push({ at: clock.now(), id: t.id, step: t.step });
        return null;
      }
      if (sel === '.nav.active') return navActive;
      return els[sel] || (els[sel] = makeEl());
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const api = {
    load: async () => (opts.data ? JSON.parse(JSON.stringify(opts.data)) : null),
    save: async data => { savedData = JSON.parse(JSON.stringify(data)); return true; },
    dataPath: async () => 'test',
    gemini: req => mock.gemini(req),
    listModels: async () => ({ status: 200, text: '{"models":[]}' }),
    fetchPage: async url => (opts.pages || {})[url] || '',   // страницы сайтов: { url: html }
    saveFile: async () => '', openPath: async () => {}, openUrl: async () => {}, copy: async () => true,
  };
  ctx = vm.createContext({
    console, document, confirm: () => true, alert() {},
    setTimeout: clock.setTimeout, setInterval: clock.setInterval, clearTimeout: clock.clearTimeout, clearInterval: clock.clearInterval,
    Date: clock.Date,
  });
  ctx.window = ctx;
  ctx.window.api = api;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8'), ctx, { filename: 'app.js' });
  await clock.runUntil(() => true);
  return {
    ctx, clock, mock, api, steps, els,
    eval: code => vm.runInContext(code, ctx),
    saved: () => savedData,
  };
}

module.exports = { loadApp, createClock };
