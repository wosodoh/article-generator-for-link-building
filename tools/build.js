/*
 * Сборка готовой программы для коллег — без npm и @electron/packager.
 *
 *   set ELECTRON_RUN_AS_NODE=1
 *   "%LOCALAPPDATA%\Programs\ArticleGenerator\ArticleGenerator.exe" tools\build.js v1.1.5
 *
 * Что делает:
 *  1. берёт файлы программы (main.js, preload.js, package.json, src/) из git-тега — ровно ту версию, что в теге;
 *  2. берёт библиотеки (node_modules: html-to-docx и зависимости) из установленного app.asar;
 *  3. упаковывает всё в resources\app.asar;
 *  4. рядом кладёт Electron из установленной программы и README_RU.txt;
 *  5. сжимает в dist\ArticleGenerator-<версия>-win-x64.zip (внутри — папка ArticleGenerator).
 * Тесты, мок, CLAUDE.md в сборку не попадают.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUNTIME = path.join(process.env.LOCALAPPDATA, 'Programs', 'ArticleGenerator');
const tag = process.argv[2];
if (!tag) { console.error('Укажите тег: tools\\build.js v1.1.5'); process.exit(1); }

const git = (...args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

// ── 1. Файлы программы из тега ──
const APP_PATHS = ['main.js', 'preload.js', 'package.json', 'src'];
const appFiles = {};   // путь → Buffer
git('ls-tree', '-r', '--name-only', tag, '--', ...APP_PATHS).toString('utf8').split('\n').filter(Boolean).forEach(p => {
  appFiles[p] = git('show', tag + ':' + p);
});
const pkg = JSON.parse(appFiles['package.json'].toString('utf8'));
const version = pkg.version;
console.log('Версия ' + version + ' из ' + tag + ': ' + Object.keys(appFiles).join(', '));

// ── 2. Библиотеки из установленного app.asar (Electron читает asar как папку) ──
function readTree(dir, prefix, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const rel = prefix + '/' + e.name;
    if (e.isDirectory()) readTree(path.join(dir, e.name), rel, out);
    else out[rel] = fs.readFileSync(path.join(dir, e.name));
  });
}
readTree(path.join(RUNTIME, 'resources', 'app.asar', 'node_modules'), 'node_modules', appFiles);
if (!appFiles['node_modules/html-to-docx/package.json']) throw new Error('В установленной программе нет html-to-docx');

// ── 3. Упаковка в asar ──
// Формат: [UInt32 4][UInt32 размер заголовка] + заголовок (Pickle-строка с JSON) + содержимое файлов подряд
function packAsar(files) {
  const header = { files: {} };
  const chunks = [];
  let offset = 0;
  Object.keys(files).sort().forEach(p => {
    const parts = p.split('/');
    let node = header;
    parts.slice(0, -1).forEach(d => { node.files[d] = node.files[d] || { files: {} }; node = node.files[d]; });
    node.files[parts[parts.length - 1]] = { size: files[p].length, offset: String(offset) };
    chunks.push(files[p]);
    offset += files[p].length;
  });
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const padded = json.length + ((4 - (json.length % 4)) % 4);
  const headerPickle = Buffer.alloc(8 + padded);
  headerPickle.writeUInt32LE(4 + padded, 0);     // размер полезной части Pickle
  headerPickle.writeUInt32LE(json.length, 4);    // длина строки
  json.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  return Buffer.concat([sizePickle, headerPickle].concat(chunks));
}

// ── 4. Папка программы ──
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'stage-' + version);
const OUT = path.join(STAGE, 'ArticleGenerator');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(RUNTIME, OUT, { recursive: true, filter: s => !/[\\/]resources[\\/]app(\.asar)?$/i.test(s) && !/README_RU\.txt$/i.test(s) });
fs.mkdirSync(path.join(OUT, 'resources'), { recursive: true });
// Electron перехватывает запись в *.asar как в архив — на время записи отключаем это
process.noAsar = true;
fs.writeFileSync(path.join(OUT, 'resources', 'app.asar'), packAsar(appFiles));
process.noAsar = false;
fs.copyFileSync(path.join(ROOT, 'tools', 'README_RU.txt'), path.join(OUT, 'README_RU.txt'));

// проверка: Electron должен прочитать собранный asar
const check = JSON.parse(fs.readFileSync(path.join(OUT, 'resources', 'app.asar', 'package.json'), 'utf8'));
if (check.version !== version) throw new Error('Собранный app.asar не читается');
fs.readFileSync(path.join(OUT, 'resources', 'app.asar', 'node_modules', 'html-to-docx', 'package.json'));

// ── 5. Zip (tar из Windows умеет zip) ──
const zip = path.join(DIST, 'ArticleGenerator-' + version + '-win-x64.zip');
fs.rmSync(zip, { force: true });
execFileSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-c', '-f', zip, '-C', STAGE, 'ArticleGenerator']);
console.log('Готово: ' + zip + ' (' + Math.round(fs.statSync(zip).size / 1048576) + ' МБ)');
