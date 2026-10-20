/*
 * Готовит тестовую копию программы из текущих файлов проекта — без сборки и без npm.
 *
 * Берёт Electron из установленной программы (%LOCALAPPDATA%\Programs\ArticleGenerator),
 * копирует его в ...\Programs\ArticleGenerator-TEST и кладёт файлы проекта в resources\app
 * (Electron загружает папку app раньше, чем app.asar). Библиотеки (html-to-docx) берутся из установленного app.asar.
 *
 * Тестовая копия хранит данные отдельно: %APPDATA%\Генератор статей ТЕСТ\data.json —
 * рабочие задачи и ключ не затрагиваются. Рабочая программа не меняется.
 *
 * Запуск — через «ЗАПУСК ТЕСТА.bat» в корне проекта.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROGRAMS = path.join(process.env.LOCALAPPDATA, 'Programs');
const SRC = path.join(PROGRAMS, 'ArticleGenerator');
const DST = path.join(PROGRAMS, 'ArticleGenerator-TEST');
const APP = path.join(DST, 'resources', 'app');

if (!fs.existsSync(path.join(SRC, 'ArticleGenerator.exe'))) {
  console.error('Не найдена установленная программа: ' + SRC);
  process.exit(1);
}

// 1. Electron — один раз (≈300 МБ), без app.asar
if (!fs.existsSync(path.join(DST, 'ArticleGenerator.exe'))) {
  console.log('Копирую Electron в ' + DST + ' (один раз)…');
  fs.cpSync(SRC, DST, { recursive: true, filter: s => path.basename(s) !== 'app.asar' || path.dirname(s) !== path.join(SRC, 'resources') });
}

// 2. Библиотеки из установленного app.asar — один раз
const NM = path.join(APP, 'node_modules');
if (!fs.existsSync(path.join(NM, 'html-to-docx'))) {
  console.log('Копирую библиотеки из app.asar…');
  fs.mkdirSync(APP, { recursive: true });
  copyDir(path.join(SRC, 'resources', 'app.asar', 'node_modules'), NM);
}

/** Рекурсивное копирование через readdir/readFile — так читается и содержимое app.asar */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach(e => {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.writeFileSync(b, fs.readFileSync(a));
  });
}

// 3. Файлы проекта — каждый раз заново
fs.rmSync(path.join(APP, 'src'), { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'src'), path.join(APP, 'src'), { recursive: true });
['main.js', 'preload.js'].forEach(f => fs.copyFileSync(path.join(ROOT, f), path.join(APP, f)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.productName = pkg.productName + ' ТЕСТ';   // отдельная папка данных
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('Тестовая копия ' + pkg.version + ' готова: ' + DST);
