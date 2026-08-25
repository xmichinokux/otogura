'use strict';

/**
 * 覚え書き（library-cache.json）まわりの検査。
 *
 * ■ なぜ要るか（2026-08-25 実地）
 * 本人からの報告:
 *   > 直したタグがアプリを立ち上げ直すともとに戻っています。
 *
 * 原因は main.js の 1 行だった。
 *
 *   const { scanLibrary, アートワークを読む, readTags } = require('./library');
 *                                                    ↑ 目印 が入っていない
 *
 * なのに下のほうで 目印() を呼んでいた。**ReferenceError で毎回落ちていた。**
 * しかも囲みが try/catch { console.warn } だったので、画面には何も出ない。
 * MP3 そのものは書き換わるので、直った直後は正しく見える。
 * 覚え書きだけが古いまま残り、次に開くと元に戻る ―― という形で出た。
 *
 * ★型検査も、目で読むのも、これを見つけられない。
 * **使っているのに import していない名前**は、その行が実行されるまで誰も気づかない。
 * だから機械に数えさせる。
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let 失敗 = 0;
const 確認 = (名, 条件, 補足 = '') => {
  if (条件) { console.log(`  OK   ${名}`); } else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗 += 1; }
};

/* ───────────────────────────────────────────────
   1. 使っているのに import していない名前が無いか
   ─────────────────────────────────────────────── */
console.log('\n[1] 自分のファイルから取り込み忘れている名前');

/** そのファイルが require している自作モジュールと、取り込んだ名前 */
function 取り込み一覧(src) {
  const 出 = [];
  const re = /const\s*\{([^}]*)\}\s*=\s*require\(\s*'(\.[^']*)'\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const 名前 = m[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
    出.push({ 先: m[2], 名前 });
  }
  return 出;
}

/**
 * コメントと文字列を落とす。
 * ★落とさないと、コメントに書いた名前を「使っている」と数えてしまう。
 * Aegis で同じ間違いをした（JSX の `// loading...` をコメントと誤読）ので、先に落とす。
 */
function 素の文(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const 調べるファイル = ['src/main.js', 'src/renderer.js', 'src/library.js', 'src/playlists.js'];
let 抜け = [];

for (const rel of 調べるファイル) {
  const p = path.join(__dirname, rel);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const 本文 = 素の文(src);

  for (const { 先, 名前 } of 取り込み一覧(src)) {
    const 相手 = path.join(path.dirname(p), 先 + (先.endsWith('.js') ? '' : '.js'));
    if (!fs.existsSync(相手)) continue;
    let 相手の出し物;
    try { 相手の出し物 = Object.keys(require(相手)); } catch { continue; }

    for (const 名 of 相手の出し物) {
      if (名前.includes(名)) continue;                 // 取り込んである
      // 呼び出しの形で使われていないか（名( ）
      const 使用 = new RegExp(`(^|[^\\w.$])${名.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`).test(本文);
      if (使用) 抜け.push(`${rel} が ${先} の ${名}() を、取り込まずに呼んでいます`);
    }
  }
}
確認('取り込み忘れが無い', 抜け.length === 0, abbr(抜け));

/* ───────────────────────────────────────────────
   1-b. 画面 ↔ 本体 のつなぎに、断線が無いか
   ─────────────────────────────────────────────── */
console.log('\n[1-b] 画面と本体のつなぎ');

/*
 * ★同じ種類の間違い。**呼んでいるのに、向こうに無い。**
 * 押した瞬間まで誰も気づかない（型検査も文法検査も通る）ので、機械に数えさせる。
 */
const 素 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const よむ = (n) => fs.readFileSync(path.join(__dirname, 'src', n), 'utf8');
const pre = よむ('preload.js');
const mainAll = よむ('main.js');
const renAll = 素(よむ('renderer.js'));

const 出せる = [...pre.matchAll(/^\s*([^\s:,{}]+)\s*:/gm)].map((m) => m[1]);
const 使う = [...new Set([...renAll.matchAll(/window\.mp3\.([^\s(.,;)]+)/g)].map((m) => m[1]))];
const 橋に無い = 使う.filter((n) => !出せる.includes(n));
確認(`画面が呼ぶ ${使う.length} 個が、すべて preload にある`, 橋に無い.length === 0, 橋に無い.join(', '));

/*
 * ★逆向きも見る（2026-08-25 実地）。
 *
 * 「（『外したものを戻す』で戻せます）」と画面に書いてあるのに、
 * **その操作がどこにも無かった。** preload には窓口があり、本体にも処理があり、
 * 画面からだけ呼ばれていない。だから一度外すと二度と戻せない。
 *
 * 本人からの報告「足したのに読み込まれない」の正体がこれだった。
 * 足し直したファイルが、前に外した道と同じだったので、ずっと除かれ続けていた。
 *
 * ★出口があるのに誰も通らない道は、**書いた本人しか気づけない。**
 */
const 使われていない = 出せる.filter((n) => !使う.includes(n));
確認(
  `preload の ${出せる.length} 個が、すべて画面から呼ばれている`,
  使われていない.length === 0,
  `呼ばれていない: ${使われていない.join(', ')}`,
);

const 受ける = [...mainAll.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]);
const 送る = [...new Set([...pre.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]))];
const 受け手なし = 送る.filter((c) => !受ける.includes(c));
確認(`preload が呼ぶ ${送る.length} 個に、すべて本体の受け手がある`, 受け手なし.length === 0, 受け手なし.join(', '));

const 送信 = [...new Set([...mainAll.matchAll(/送る\(\s*'([^']+)'/g)].map((m) => m[1]))];
const 受信 = [...new Set([...pre.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)].map((m) => m[1]))];
確認('本体が送るお知らせを、画面が全部受けている', 送信.every((c) => 受信.includes(c)), 送信.filter((c) => !受信.includes(c)).join(', '));
確認('画面が待っているお知らせを、本体が全部送っている', 受信.every((c) => 送信.includes(c)), 受信.filter((c) => !送信.includes(c)).join(', '));

/* ───────────────────────────────────────────────
   2. 握りつぶし（catch の中が console だけ）が残っていないか
   ─────────────────────────────────────────────── */
console.log('\n[2] 失敗を黙って捨てている catch');

/*
 * ★全部が悪いわけではない。「読めないフォルダは飛ばす」のように、
 * わざと黙らせている場所はある。ここで見るのは**覚え書きまわりだけ。**
 * 覚え書きが書けないのは、使う人に見える形で壊れるので、黙ってはいけない。
 */
const mainSrc = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
const rereadBlock = mainSrc.slice(mainSrc.indexOf("ipcMain.handle('track:reread'"), mainSrc.indexOf("ipcMain.handle('volume:get'"));
確認(
  'タグ読み直しの失敗が、呼んだ側に返っている',
  rereadBlock.includes('覚え') && /return\s*\{[^}]*tracks/.test(rereadBlock),
  '失敗を握りつぶすと「画面では直って見えるのに、次に開くと戻る」になります',
);
確認(
  'タグ読み直しの catch が console だけで終わっていない',
  !/catch\s*\([^)]*\)\s*\{\s*console\.\w+\([^)]*\);\s*\}/.test(rereadBlock),
);

/* ───────────────────────────────────────────────
   2-b. アプリ名を変えたときの引き継ぎ
   ─────────────────────────────────────────────── */
console.log('\n[2-b] 名前を変えたときのデータ引き継ぎ');

/*
 * ★Electron は**アプリ名から保存先フォルダを決める。**
 * 名前を変えると、登録したフォルダも再生リストも 60 MB の覚え書きも見えなくなる。
 * 使う人には「全部消えた」としか見えない。
 * だから、昔の名前の一覧と引き継ぎ処理が、消えていないかを見張る。
 */
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const 今の名前 = pkg.productName || pkg.name;
確認('productName が決まっている', !!pkg.productName, `いま: ${今の名前}`);

/*
 * ★アプリ名を決め打ちしているか（2026-08-25 実地）。
 * `electron .` なら package.json を読むが、`electron なにか.js` は読まない。
 * すると名前が "Electron" になり、**別のフォルダを見て中身が空に見える。**
 * データの置き場が、起動のされ方で変わってはいけない。
 */
const 決め打ち = new RegExp(`app\\.setName\\(\\s*'${今の名前}'\\s*\\)`).test(mainAll);
確認(
  `アプリ名を app.setName('${今の名前}') で決め打ちしている`,
  決め打ち,
  '起動のされ方でデータの置き場が変わってしまいます',
);

const 昔一覧 = /const\s+昔の名前\s*=\s*\[([^\]]*)\]/.exec(mainAll);
const 昔たち = 昔一覧 ? [...昔一覧[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
確認('昔の名前が控えてある', 昔たち.length > 0, `控え: ${昔たち.join(', ') || 'なし'}`);
確認(
  '昔の名前に、いまの名前が混ざっていない',
  !昔たち.includes(今の名前),
  '自分自身から引き継ごうとして、何も起きません',
);
確認('引き継ぎは「写す」で、動かしていない', mainAll.includes('copyFile') && !/\brename\(/.test(mainAll));
確認(
  '新しい側にすでにある物は上書きしない',
  /すでに新しい側にあるなら触らない/.test(mainAll),
  '上書きすると、いまの設定を失います',
);
確認('引き継ぎの失敗が、画面に届く', mainAll.includes("ipcMain.handle('migration:get'") && renAll.includes('引っ越しの結果'));

/*
 * ★同じアプリが 2 つ動かないこと（2026-08-25 実地）。
 * 2 つ動くと、両方が走査して同じ覚え書きに書き込み、後勝ちで片方が消える。
 * 画面の中身が食い違い、「どっちが本当か分からない」状態になる。
 */
確認(
  '同じアプリを 2 つ動かせない作りになっている',
  mainAll.includes('requestSingleInstanceLock'),
  '2 つ動くと、覚え書きを奪い合って中身が食い違います',
);
確認(
  '2 つ目が起動したら、いまある窓を前に出す',
  /second-instance/.test(mainAll) && /focus\(\)/.test(mainAll),
  '黙って終わると「押しても開かない」に見えます',
);

/* ───────────────────────────────────────────────
   3. 読み方の版を上げたら、古い覚え書きが使い回されないか
   ─────────────────────────────────────────────── */
console.log('\n[3] 読み方の版');

const lib = require('./src/library');
const libSrc = fs.readFileSync(path.join(__dirname, 'src/library.js'), 'utf8');
const 版 = /const\s+読み方の版\s*=\s*(\d+)/.exec(libSrc);
確認('読み方の版が書いてある', !!版);

(async () => {
  if (版) {
    const 仮 = path.join(os.tmpdir(), `mp3player-check-${process.pid}.mp3`);
    fs.writeFileSync(仮, Buffer.from('ID3      ', 'latin1'));
    const m = await lib.目印(仮);
    fs.unlinkSync(仮);
    確認('目印に版が入っている', typeof m === 'string' && m.startsWith(`v${版[1]}:`), `いまの目印: ${m}`);
    確認(
      '版の無い古い目印とは、必ず食い違う',
      typeof m === 'string' && m !== m.replace(/^v\d+:/, ''),
      '食い違わないと、読み方を直しても古い値を持ち続けます',
    );
  }

  /* ───────────────────────────────────────────────
     4. 途中で閉じても、そこまでの覚え書きが残るか
     ─────────────────────────────────────────────── */
  console.log('\n[4] 走査を途中で止めても、覚え書きが残るか');

  const 受け取った = [];
  const 元 = lib.scanLibrary;
  /*
   * ★関数の .length では数えられない（この検査を書いたとき間違えた）。
   * 既定値のある引数（hidden = []）から先は .length に入らないので、
   * 引数が 6 つあっても .length は 1 を返す。**書いてある文を見る。**
   */
  const 引数 = /function\s+scanLibrary\s*\(([^)]*)\)/.exec(libSrc);
  const 引数名 = 引数 ? 引数[1].split(',').map((s) => s.trim().split('=')[0].trim()) : [];
  確認(
    'scanLibrary が「覚え書きの途中経過」を受け取れる',
    引数名.includes('覚え途中'),
    `いまの引数: ${引数名.join(' / ')}`,
  );
  // 実際に走らせて、途中経過が来るか見る
  const 台 = path.join(__dirname, 'test-music');
  if (fs.existsSync(台)) {
    const r = await 元([台], [], {}, null, null, (増分) => 受け取った.push(Object.keys(増分).length));
    確認('走査そのものは動く', r.tracks.length > 0, `${r.tracks.length} 曲`);
    // 台が 2,000 曲に満たなければ、最後の 1 回だけ来る
    確認('覚え書きの途中経過が届く', 受け取った.length > 0, `届いた回数: ${受け取った.length}`);

    /*
     * ★外した曲の記録まで捨てていないか（2026-08-25 実地）。
     *
     * 走査の最後に覚え書きを丸ごと書き換えるので、
     * 外した曲は一覧から消えるだけでなく**記録ごと消えていた。**
     * すると「戻す」を押しても中身が無く、17 万曲の読み直し待ちになる。
     * 実際、本人が戻した 3 曲が覚え書きから消えていた。
     *
     * 外すのは「一覧に出さない」約束であって、忘れる約束ではない。
     */
    console.log('\n[5] 一覧から外しても、記録は残るか');
    const 道 = Object.keys(r.覚え書き);
    const 外す = 道[0];
    const 外した = await 元([台], [外す], r.覚え書き);
    確認('外した曲は一覧から消える', !外した.tracks.some((t) => t.path === 外す));
    確認(
      '外した曲の記録は残る',
      !!外した.覚え書き[外す],
      '消すと、戻したときに読み直しから始まります',
    );
    const 戻した = await 元([台], [], 外した.覚え書き);
    確認('戻すと一覧に出る', 戻した.tracks.some((t) => t.path === 外す));
    確認(
      '戻すのに読み直しが要らない',
      戻した.使い回し === 戻した.tracks.length,
      `使い回せたのは ${戻した.使い回し}/${戻した.tracks.length} 件`,
    );
  } else {
    console.log('  --   test-music が無いので飛ばしました（npm run test-music で作れます）');
  }

  console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
  process.exit(失敗 ? 1 : 0);
})();

function abbr(list) {
  if (!list.length) return '';
  return list.slice(0, 5).join(' / ') + (list.length > 5 ? ` ほか ${list.length - 5} 件` : '');
}
