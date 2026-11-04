@echo off
rem Start Otogura. Double-click this file; no terminal commands needed.
rem Keep this file ASCII with CRLF line endings: cmd reads a .bat in the system
rem code page, so UTF-8 Japanese breaks the lines before any chcp can run.

cd /d "%~dp0"

if not exist "node_modules\" (
  echo First run: installing. This takes a while...
  call npm install
  if errorlevel 1 (
    echo.
    echo Install failed. Check that Node.js is installed: https://nodejs.org/
    pause
    exit /b 1
  )
)

rem Call electron directly. npm start adds extra cmd and node layers, and closing
rem their black window can take the app down with it.
set "EXE=node_modules\electron\dist\electron.exe"

if not exist "%EXE%" (
  echo.
  echo Not found: %EXE%
  echo Run "npm install" here, then try again.
  pause
  exit /b 1
)

start "" "%EXE%" .
exit /b 0
