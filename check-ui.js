'use strict';

/**
 * 画面を実際に開いて確かめる検査。
 *
 * ■ なぜ要るか（2026-08-25 実地）
 * ほかの検査は「計算部分」しか見ていない。だから、この 2 つを見逃した。
 *
 *   1. 画面が「（『外したものを戻す』で戻せます）」と案内しているのに、
 *      **その操作がどこにも無かった**
 *   2. ボタンを作ったあとも、**出す処理が走査の終わりにしかなく、
 *      50 分待たないと出てこなかった**（本人から「出てないです」と言われた）
 *
 * どちらも、**開いて見るまで分からない。**
 * だから開いて見る。ここは人の代わりに機械が画面を見る場所。
 *
 * 使い方: node check-ui.js
 *   （中で electron を起動して、本物の画面を読む）
 *
 * ★このファイルはリポジトリの一番上に置くこと。
 * electron は「渡されたファイルのあるフォルダ」をアプリの場所と見なす。
 * 下の階層に置くと package.json が見つからず、**別のフォルダの設定を読んでしまう。**
 */

const path = require('node:path');

/* ── electron の中で動いているとき ───────────────────────── */
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');

  // 本体をそのまま読み込む（窓も IPC も、本物と同じものを使う）
  require(path.join(__dirname, 'src', 'main.js'));

  app.on('browser-window-created', (_e, win) => {
    win.hide();                                  // 検査中に画面を出さない
    // ★画面の中で起きたエラーを拾う。拾わないと「なぜか出ない」で終わる
    win.webContents.on('console-message', (_ev, level, message) => {
      if (level >= 2) console.log('画面のエラー: ' + message.slice(0, 200));
    });
    win.webContents.on('preload-error', (_ev, p, err) => {
      console.log('preload のエラー: ' + p + ' / ' + err.message);
    });
    win.webContents.once('did-finish-load', () => {
      /*
       * ★1 回だけ見るのでは足りない（2026-08-25）。
       * 最初この検査は 9 秒後に 1 回だけ見ていた。すると**通ったり落ちたりした。**
       * 出る／出ないではなく「**いつ**出るか」の問題なので、時間で追う。
       */
      const 記録 = [];
      const t0 = Date.now();
      const 見張る = setInterval(async () => {
        try {
          const v = await win.webContents.executeJavaScript(
            "(() => { const e = document.getElementById('unhide');"
            + " if (!e) return null; const s = getComputedStyle(e);"
            + " return { 見えている: s.display !== 'none', 文字: (e.textContent||'').trim() }; })()",
          );
          記録.push({ 秒: +((Date.now() - t0) / 1000).toFixed(1), ...(v || { 要素なし: true }) });
        } catch { /* 読めない瞬間は飛ばす */ }
      }, 500);

      // 起動直後の状態を見る。走査の完了は待たない（待たずに出るのが要件）
      setTimeout(async () => {
        clearInterval(見張る);
        try {
          const r = await win.webContents.executeJavaScript(`(() => {
            const み = (id) => {
              const e = document.getElementById(id);
              if (!e) return { ある: false };
              const s = getComputedStyle(e);
              return { ある: true, 見えている: s.display !== 'none' && s.visibility !== 'hidden', 文字: (e.textContent || '').trim() };
            };
            return {
              外す戻す: み('unhide'),
              状態: み('status'),
              タグ無し: み('untagged'),
              再スキャン: み('rescan'),
              一覧の行数: document.querySelectorAll('#tbody tr').length,
              エラー: window.__検査エラー || null,
            };
          })()`);
          r.時間の記録 = 記録;
          console.log('PROBE=' + JSON.stringify(r));
        } catch (e) {
          console.log('PROBE=' + JSON.stringify({ 失敗: e.message }));
        }
        app.quit();
      }, 9000);
    });
  });
  return;
}

/* ── node から呼ばれたとき: electron を起動して結果を読む ── */
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const electron = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
if (!fs.existsSync(electron)) {
  console.log('  --   electron が見つからないので飛ばしました（npm install してください）');
  process.exit(0);
}

// 外した曲が 0 件だと「出ないのが正しい」ので、確かめようがない
const 設定 = path.join(process.env.APPDATA || '', 'Otogura', 'settings.json');
let 外した数 = 0;
try { 外した数 = (JSON.parse(fs.readFileSync(設定, 'utf8')).hidden || []).length; } catch { /* 無ければ 0 */ }

console.log('\n[画面] 実際に開いて確かめる');
console.log(`  いま一覧から外している曲: ${外した数} 件`);

const 子 = spawn(electron, [__filename], { cwd: __dirname });
let 出 = '';
子.stdout.on('data', (d) => { 出 += d; });
子.stderr.on('data', () => { /* electron の雑音は捨てる */ });

const 時間切れ = setTimeout(() => { 子.kill(); }, 60000);

子.on('close', () => {
  clearTimeout(時間切れ);
  const m = /PROBE=(\{.*\})/.exec(出);
  if (!m) {
    console.log('  NG   画面を読めませんでした');
    console.log('       ★アプリを開いたままだと、ここは必ず失敗します。');
    console.log('       （同じアプリは 2 つ動かさない作りにしてあるため）');
    console.log('       音蔵を閉じてから、もう一度お試しください。');
    process.exit(1);
  }
  const r = JSON.parse(m[1]);
  let 失敗 = 0;
  const 確認 = (名, 条件, 補足 = '') => {
    if (条件) console.log(`  OK   ${名}`);
    else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗 += 1; }
  };

  // ★いつ出たかを、そのまま見せる。通った／落ちただけでは直しようが無い
  if (Array.isArray(r.時間の記録) && r.時間の記録.length) {
    const 出た = r.時間の記録.find((x) => x.見えている);
    const 最後 = r.時間の記録[r.時間の記録.length - 1];
    console.log(`  「戻す」ボタン: ${出た ? `${出た.秒} 秒で出ました（「${出た.文字}」）` : `${最後.秒} 秒たっても出ていません`}`);
  }

  確認('再スキャンのボタンがある', r.再スキャン && r.再スキャン.見えている);
  確認('タグ無しの切り替えがある', r.タグ無し && r.タグ無し.見えている);
  確認('状態を出す場所がある', r.状態 && r.状態.ある);

  if (外した数 > 0) {
    /*
     * ★ここが本題。**走査を待たずに**出ていること。
     * 86,057 曲では走査に 50 分かかる。終わってから出しても意味が無い。
     */
    確認(
      '「外したものを戻す」が、起動してすぐ出ている',
      r.外す戻す && r.外す戻す.見えている,
      r.外す戻す && r.外す戻す.ある ? '要素はあるが見えていません（出す処理が走査の後になっています）' : 'ボタンそのものがありません',
    );
    確認(
      'そのボタンに件数が出ている',
      r.外す戻す && /\d/.test(r.外す戻す.文字),
      `いまの文字: 「${r.外す戻す ? r.外す戻す.文字 : ''}」`,
    );
  } else {
    確認('外したものが 0 件なら、ボタンは出ていない', !(r.外す戻す && r.外す戻す.見えている));
  }

  console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
  process.exit(失敗 ? 1 : 0);
});
