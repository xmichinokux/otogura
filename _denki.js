/*
 * アプリと同じ Electron の中で、実物のライブラリに対して scanLibrary を走らせ、
 * 「何も変わっていないときの再スキャン」が本当に何秒かかるかを測る。
 *
 * 1 回目で覚え書きとフォルダの記録を作り、2 回目を測る（本人の状況と同じ）。
 * ★書き込みはしない。音蔵の設定にも覚え書きにも触らない。
 */
const { app } = require('electron');
const path = require('node:path');

const 蔵 = process.argv.find((a) => a.startsWith('--lib='));
const 根 = 蔵 ? 蔵.slice('--lib='.length) : 'E:/iTunes Music';

app.whenReady().then(async () => {
  const { scanLibrary } = require(path.join(__dirname, 'src/library'));
  const 秒 = (t0) => (Number(process.hrtime.bigint() - t0) / 1e9).toFixed(1);

  console.log(`測る場所: ${根}`);
  console.log('1 回目（覚え書きを作る）…');
  const a0 = process.hrtime.bigint();
  const 一 = await scanLibrary([根], [], {}, null, null, null, null, null, null);
  console.log(`  ${一.tracks.length.toLocaleString()} 曲 / `
    + `フォルダ ${Object.keys(一.フォルダの覚え.棚).length.toLocaleString()} 件 / ${秒(a0)} 秒\n`);

  // 2 回目。画面へ渡すところ・進み具合も、アプリと同じように受ける
  for (const [名, 渡すか] of [['いまの作り（全曲を画面へ渡す）', true], ['画面へ渡さない場合', false]]) {
    let 進みの回数 = 0; let 渡した曲数 = 0; let 渡した回数 = 0;
    const b0 = process.hrtime.bigint();
    const 二 = await scanLibrary(
      [根], [], 一.覚え書き,
      () => { 進みの回数 += 1; },
      渡すか ? (部分) => { 渡した回数 += 1; 渡した曲数 += 部分.length; } : null,
      null, null, 一.フォルダの覚え, null,
    );
    console.log(`${名}`);
    console.log(`  ${秒(b0)} 秒   使い回し ${二.使い回し.toLocaleString()} / `
      + `開かず ${二.開かずに済んだフォルダ.toLocaleString()} / 開いた ${二.開いたフォルダ}`);
    console.log(`  進み ${進みの回数} 回 / 画面へ ${渡した回数} 回（${渡した曲数.toLocaleString()} 曲）\n`);
  }

  app.quit();
}).catch((e) => { console.log('☠ ' + (e && e.message)); app.quit(); });
