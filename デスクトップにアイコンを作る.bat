@echo off
rem ============================================================
rem  デスクトップに「音蔵」のアイコンを作る
rem
rem  ★一度ダブルクリックするだけです。
rem    そのあとは、デスクトップのアイコンから開けます。
rem    （そちらから開けば、黒い窓は一瞬も出ません）
rem ============================================================

rem ★文字コードを UTF-8 に合わせる。
rem   合わせないと、下の日本語が文字化けして読めなくなる
rem   （このファイル自体が UTF-8 で保存されているため）。
chcp 65001 >nul

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\make-shortcut.ps1"
echo.
pause
