@echo off
rem ============================================================
rem  音蔵（Otogura）を起動する
rem
rem  ★このファイルをダブルクリックすれば開きます。
rem    ターミナルを開いてコマンドを打つ必要はありません。
rem
rem  ★なぜ作ったか（2026-08-25）
rem    アプリが落ちたあと「立ち上げ方が分からなかった」と言われた。
rem    npm start を知らないと開けない、というのは道具として不親切だった。
rem
rem  ★デスクトップにアイコンを置きたいときは
rem      デスクトップにアイコンを作る.bat
rem    を一度ダブルクリックしてください。
rem    そちらから開けば、この黒い窓が一瞬も出ません。
rem ============================================================

rem ★文字コードを UTF-8 に合わせる（合わせないと下の日本語が化ける）
chcp 65001 >nul

cd /d "%~dp0"

if not exist "node_modules\" (
  echo 初回の準備をしています。少し時間がかかります...
  call npm install
  if errorlevel 1 (
    echo.
    echo 準備に失敗しました。Node.js が入っているか確かめてください。
    echo   https://nodejs.org/
    pause
    exit /b 1
  )
)

rem ★electron を直に呼ぶ。
rem   npm start だと、間に cmd と node がもう 1 枚ずつ挟まる。
rem   黒い窓が残ったり、それを閉じたときに巻き添えでアプリが落ちたりする。
set "EXE=node_modules\electron\dist\electron.exe"

if not exist "%EXE%" (
  echo.
  echo 起動に必要なファイルが見つかりません: %EXE%
  echo 次を実行してから、もう一度お試しください。
  echo   npm install
  pause
  exit /b 1
)

start "" "%EXE%" .
exit /b 0
