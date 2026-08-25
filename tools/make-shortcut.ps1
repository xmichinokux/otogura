# デスクトップに「音蔵」のアイコンを作る。
#
# ★なぜ要るか（2026-08-25。本人の希望）
#   > 立ち上げ方ってターミナル以外ないんですか？
#   > アイコンをダブルクリックするみたいな普通の方法なんですが。
#
#   起動.bat でも開けるが、黒い窓が一瞬出るうえ、アイコンが .bat のままで
#   「自分のアプリ」に見えない。
#
# ★electron.exe を直に指す。
#   npm start を経由すると、間に cmd と node が挟まって黒い窓が残る。
#   直に呼べば、窓は一枚も出ない。
#
# 使い方（どちらでも）
#   ・「デスクトップにアイコンを作る.bat」をダブルクリック
#   ・powershell -ExecutionPolicy Bypass -File tools\make-shortcut.ps1

$ErrorActionPreference = 'Stop'

$proj = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $proj 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $proj 'icon.ico'

# ★黙って失敗させない。作ったつもりで壊れたショートカットが残るのが一番困る
if (-not (Test-Path $exe)) {
  Write-Host ''
  Write-Host '起動に必要なファイルが見つかりません:' -ForegroundColor Red
  Write-Host "  $exe"
  Write-Host ''
  Write-Host 'このフォルダで npm install を実行してから、もう一度お試しください。'
  exit 1
}

# アイコンが無ければ、その場で作る
if (-not (Test-Path $icon)) {
  Write-Host 'アイコンを作っています...'
  & node (Join-Path $PSScriptRoot 'make-icon.js')
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop '音蔵.lnk'

$w = New-Object -ComObject WScript.Shell
$s = $w.CreateShortcut($lnk)
$s.TargetPath       = $exe
$s.Arguments        = '.'
$s.WorkingDirectory = $proj
$s.Description      = '音蔵 — Otogura'
if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
$s.Save()

if (Test-Path $lnk) {
  Write-Host ''
  Write-Host 'デスクトップにアイコンを作りました。' -ForegroundColor Green
  Write-Host "  $lnk"
  Write-Host ''
  Write-Host 'ダブルクリックで開きます。スタートメニューに置きたいときは、'
  Write-Host 'このアイコンを右クリック →「スタートメニューにピン留めする」。'
} else {
  Write-Host 'アイコンを作れませんでした。' -ForegroundColor Red
  exit 1
}
