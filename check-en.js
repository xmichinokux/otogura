'use strict';

/**
 * 英語にして、本物の画面を読む検査。
 *
 * ■ なぜ要るか（2026-08-30）
 * 訳の数を数える検査（check-lang.js）は、**画面が出るかどうかは見ていない。**
 * 今回は 437 個の文を 言() に通し、index.html は起動時に覚えてから訳す形にした。
 * どちらも「開いて見るまで分からない」種類の変更なので、開いて見る。
 *
 * ★仮の置き場を先に決める。
 * そうしないと、本人が音蔵を開いたままのときに二重起動と見なされて開けない
 * （二重起動の見張りは、置き場ごとに掛かる）。
 *
 * 使い方: npx electron check-en.js
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

if (process.versions.electron) {
  const { app } = require('electron');

  /* ★本物の置き場に触らない。ライブラリも設定も、いっさい変えない */
  const 仮 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-en-'));
  app.setPath('userData', 仮);

  require(path.join(__dirname, 'src', 'main.js'));

  const 出た = [];
  let 済んだ = false;

  app.on('browser-window-created', (_e, win) => {
    win.hide();
    win.webContents.on('console-message', (_ev, level, message) => {
      /* ★electron 自身の注意書きは、この作りの話ではないので外す */
      if (level >= 2 && !message.includes('Electron Security Warning')) {
        出た.push('画面のエラー: ' + message.slice(0, 300));
      }
    });
    win.webContents.on('preload-error', (_ev, p, err) => {
      出た.push('preload のエラー: ' + p + ' / ' + err.message);
    });

    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        if (済んだ) return;
        済んだ = true;
        const 読む = (js) => win.webContents.executeJavaScript(js).catch((e) => 'ERR:' + e.message);
        try {
          /* ── ① 日本語のまま読む ── */
          const 日 = await 読む("document.body.innerText.slice(0, 4000)");

          /*
           * ★下のボタンを、本人の画面と同じ形にしておく（2026-08-30）。
           * 空のライブラリだと「外したものを戻す」が隠れたままで、
           * 日本語が残っていても気づけない。実際、前の版はここを見逃した。
           */
          await 読む("(() => { 外したものボタンを直す(2349); タグ無しのボタンを直す();"
            + " 再スキャンのボタンを直す(); return true; })()");

          /* ── ② 英語に切り替える（札を 2 回押すと ja → en） ── */
          await 読む("(async () => { await window.mp3.言葉を変える('en'); })()");
          await 読む("(() => { 言葉の設定 = 'en'; 言葉を入れる('en'); 画面を訳す();"
            + " const b = document.getElementById('aibar'); if (b) b.dataset.形 = '';"
            + " 描き直す(); return true; })()");
          await new Promise((r) => setTimeout(r, 800));
          const 英 = await 読む("document.body.innerText.slice(0, 4000)");

          const 見る = (名, 条, 添え) => {
            console.log('  ' + (条 ? 'OK  ' : 'NG  ') + ' ' + 名 + (条 || !添え ? '' : ' ― ' + 添え));
            if (!条) process.exitCode = 1;
          };

          console.log('');
          console.log('[英語] 実際に開いて確かめる');
          見る('★画面が開く', typeof 日 === 'string' && !日.startsWith('ERR:'), 日);
          見る('★画面の中でエラーが出ていない', 出た.length === 0, 出た.join(' / '));

          /* ★title は innerText に出ない。説明の文も見たいので、別に集める */
          const 説明 = await 読む("[...document.querySelectorAll('[title]')].map((e) => e.title).join(' | ')");
          const 英語の印 = ['Add a folder', 'Rescan', 'Genre', 'Artist', 'Album'];
          for (const v of 英語の印) 見る('★英語で出る: ' + v, 英.includes(v));
          見る('★説明も英語になる: Volume', 説明.includes('Volume'));
          見る('★説明に日本語が残っていない', !/[぀-ヿ]/.test(説明),
            (説明.match(/[^|]*[぀-ヿ][^|]*/g) || []).slice(0, 3).join('／'));

          /* ★もとの日本語が残っていないか。残っていれば訳が抜けている */
          const 残り = ['フォルダを追加', '再スキャン', '音量', 'アーティスト',
            'タグ無し', '曲を戻す', '止める']
            .filter((v) => 英.includes(v));
          見る('★日本語が残っていない', 残り.length === 0, 残り.join('／'));

          /* ★日本語に戻せるか（覚えたもとの文から訳し直せているか） */
          await 読む("(() => { 言葉の設定 = 'ja'; 言葉を入れる('ja'); 画面を訳す();"
            + " 描き直す(); return true; })()");
          await new Promise((r) => setTimeout(r, 500));
          const 戻り = await 読む("document.body.innerText.slice(0, 4000)");
          見る('★日本語に戻せる', 戻り.includes('フォルダを追加') && !戻り.includes('Add a folder'));

          console.log('');
        } catch (e) {
          console.log('  NG   読めませんでした ― ' + e.message);
          process.exitCode = 1;
        }
        app.quit();
      }, 4000);
    });
  });

  app.on('window-all-closed', () => app.quit());
  setTimeout(() => { if (!済んだ) { console.log('  NG   時間切れ'); process.exitCode = 1; app.quit(); } }, 40000);
}
