@echo off
chcp 65001 >nul
rem Запуск тестовой копии из текущих файлов проекта. Рабочая программа и её данные не затрагиваются.
set "EXE=%LOCALAPPDATA%\Programs\ArticleGenerator\ArticleGenerator.exe"
set "TEST=%LOCALAPPDATA%\Programs\ArticleGenerator-TEST\ArticleGenerator.exe"
if not exist "%EXE%" (
  echo Не найдена установленная программа: %EXE%
  pause
  exit /b 1
)
echo Готовлю тестовую копию...
set ELECTRON_RUN_AS_NODE=1
"%EXE%" "%~dp0test\prepare-test-app.js" || (echo Ошибка подготовки & pause & exit /b 1)
set ELECTRON_RUN_AS_NODE=
start "" "%TEST%"
