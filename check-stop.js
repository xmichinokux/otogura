'use strict';

/**
 * 走査を途中で止められるか、の検査。
 */
/*
 * 「止める」の検査。
 *
 * ★本人のライブラリは走査しない（2026-08-29）。
 * 本人のパソコンが走査で固まって再起動になった直後なので、
 * ここで 86,044 曲を読みにいくのは、原因を上乗せするだけ。
 * **その場で作った小さなフォルダ**で確かめる。
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanLibrary, collectTracks } = require('./src/library');

let 失敗 = 0;
const 確認 = (名, 条件, 補足 = '') => {
  if (条件) console.log(`  OK   ${名}`);
  else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗 += 1; }
};

/** 空の mp3 を並べた仮のフォルダを作る（中身は読めないので「読めない曲」になる） */
function 台を作る(曲数, 階層 = 3) {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-stop-'));
  let 作った = 0;
  const 掘る = (親, 深) => {
    for (let i = 0; i < 4 && 作った < 曲数; i += 1) {
      if (深 < 階層) {
        const 子 = path.join(親, 'd' + 深 + '_' + i);
        fs.mkdirSync(子, { recursive: true });
        掘る(子, 深 + 1);
      }
      while (作った < 曲数 && 作った % 25 !== 24) {
        fs.writeFileSync(path.join(親, 's' + 作った + '.mp3'), 'x');
        作った += 1;
      }
      if (作った < 曲数) { fs.writeFileSync(path.join(親, 's' + 作った + '.mp3'), 'x'); 作った += 1; }
    }
  };
  掘る(根, 0);
  return { 根, 作った };
}

(async () => {
  console.log('\n[1] 数えている最中に止まるか');
  {
    const { 根, 作った } = 台を作る(4000);
    let 止めて = false;
    const out = [];
    // 500 件ごとに知らせが来る。1 回目で止める合図を出す
    await collectTracks(根, out, 0, () => { 止めて = true; }, () => 止めて);
    fs.rmSync(根, { recursive: true, force: true });
    確認(
      '★数えている途中で切り上げる',
      out.length < 作った,
      `${out.length} / ${作った} 件で止まった（全部数えたら止まっていません）`,
    );
    確認('そこまで数えたぶんは残る', out.length > 0, `${out.length} 件`);
  }

  console.log('\n[2] 読んでいる最中に止まるか');
  {
    const { 根, 作った } = 台を作る(600);
    let 止めて = false;
    let 段階 = '';
    const r = await scanLibrary(
      [根], [], {},
      (p) => {
        段階 = p.段階;
        // 読み始めたら、すぐ止める合図を出す
        if (p.段階 === '読んでいます') 止めて = true;
      },
      null, null,
      () => 止めて,
    );
    fs.rmSync(根, { recursive: true, force: true });
    確認('★止めたことを呼んだ側に伝える', r.止めた === true, `止めた=${r.止めた}（黙って「読み終えた」と言ってはいけない）`);
    確認('最後の知らせが「止めました」になる', 段階 === '止めました', `いまの段階: ${段階}`);
    確認('見つけた数はそのまま返る', r.found === 作った, `${r.found} / ${作った}`);
  }

  console.log('\n[3] 止めなければ、最後まで読む');
  {
    const { 根, 作った } = 台を作る(300);
    const r = await scanLibrary([根], [], {}, null, null, null, () => false);
    fs.rmSync(根, { recursive: true, force: true });
    確認('止めた=false で返る', r.止めた === false, `止めた=${r.止めた}`);
    確認('全部見つける', r.found === 作った, `${r.found} / ${作った}`);
  }

  console.log('\n[4] 止めるかを渡さなくても、今までどおり動く');
  {
    const { 根, 作った } = 台を作る(120);
    const r = await scanLibrary([根], [], {});
    fs.rmSync(根, { recursive: true, force: true });
    確認('★渡さなければ止まらない（既存の呼び出しを壊さない）', r.止めた === false && r.found === 作った, `止めた=${r.止めた} / ${r.found} 件`);
  }

  console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
  process.exit(失敗 ? 1 : 0);
})();
