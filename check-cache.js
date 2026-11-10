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
   1-c. Electron で動かないものを呼んでいないか
   ─────────────────────────────────────────────── */
console.log('\n[1-c] Electron で動かないもの');

/*
 * ★prompt() は Electron では動かない（2026-08-29 実地、2 度目）。
 *
 *   画面で起きた例外: "Error: prompt() is not supported."
 *
 * alert と confirm は動くのに prompt だけ使えない、という分かりにくい所。
 * 1 度目は再生リスト名のときで、そのとき renderer.js に注意書きも書いた。
 * それでも 2 度目を踏んだ（APIキーの入力）。本人からの報告:
 *   > そのボタンを押すと処理が走ってエラーがでます。
 *
 * ★コメントに書くだけでは足りなかった。**機械に見張らせる。**
 * 押すまで分からない種類なので、静かに壊れる。
 */
// ★正規表現はリテラルで書く。文字列で組むとエスケープが層を通るたびに壊れる
const promptを呼んでいる = (src) => /(^|[^\w.$])prompt\s*\(/.test(src);
確認(
  '★画面が prompt() を呼んでいない（Electron では動かない）',
  !promptを呼んでいる(renAll),
  '押した瞬間に「prompt() is not supported.」で止まります。画面の中に入力欄を出してください',
);

/*
 * ★confirm / alert も使わない（2026-08-29 実測、3 度目のダイアログ事故）。
 *
 * 本人からの報告:
 *   > 全部外すをやるとまだ文字が打てないのですが
 *
 * prompt は「動かない」だったが、こちらは**動くのに困る**たち:
 *   ダイアログの前  document.hasFocus() = true
 *   閉じたあと      document.hasFocus() = **false**
 *
 * 欄の焦点は記入欄のままなので、**見た目は打てそうに見える。**
 * でもキーは OS が焦点だと思っている別の窓へ行く。
 * こちらから戻す道も試したが、Windows が「裏の窓が前へ出る」のを止めるので
 * 当てにならなかった（効くときと効かないときを、両方この目で見た）。
 *
 * ★答えは prompt のときと同じ ―― **画面の中で訊く。**
 * 画面の中なら、そもそも焦点が窓から出ない。
 */
const 生のダイアログ = (src) => /(^|[^\w.$])(confirm|alert)\s*\(/.test(
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' '),
);
確認(
  '★画面が confirm() / alert() を呼んでいない（閉じたあと打てなくなる）',
  !生のダイアログ(renAll),
  '画面の中の 確かめる() / 知らせる() を使ってください',
);
確認('画面の中の 確かめる() / 知らせる() が用意してある', /const 確かめる = /.test(renAll) && /const 知らせる = /.test(renAll));

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

  /*
   * ★どの拡張子を拾うか（2026-08-28 実地）。本人からの報告:
   *   > 最近買ったスマホに転送する CD プレイヤー型エンコーダーで作った
   *   > mp3 が同期しない
   *
   * 実物は MP3 ではなく **.m4a（AAC-LC 320kbps）**だった。
   * 走査が `.mp3` だけを見ていたので、**そもそも見つけていなかった。**
   * `Documents\MP3` を数えると mp3 1,079 曲に対し m4a 540 曲。
   * 今回の 9 枚だけでなく、40 枚前後が最初から見えていなかった。
   *
   * ★ここは名前だけで決まる（中身は読まない）ので、空ファイルで確かめられる。
   */
  console.log('\n[6] 拾う拡張子');

  const 仮置き = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-ext-'));
  const 奥 = path.join(仮置き, '6A989AE5_Boundary： The True');
  fs.mkdirSync(奥);
  const 置く = (d, n) => fs.writeFileSync(path.join(d, n), '');
  置く(仮置き, 'a.mp3');
  置く(仮置き, 'b.M4A');                       // 大文字でも拾う
  置く(仮置き, 'f.wav');
  置く(仮置き, 'g.flac');
  置く(仮置き, 'c.jpg');                       // 曲ではない
  置く(仮置き, 'd.m4a.txt');                   // 途中に .m4a があるだけ
  置く(仮置き, '.toc');                        // 取り込み機が置く目次
  置く(仮置き, 'h.aiff');                      // ★Electron が鳴らせない。拾わない
  置く(仮置き, 'i.m4p');                       // ★iTunes の DRM 付き。鳴らない
  置く(奥, 'e.m4a');                           // 下の階層も見る
  置く(奥, '._e.m4a');                         // macOS の付随ファイル

  const 集めた = (await lib.collectTracks(仮置き, [])).map((p) => path.basename(p)).sort();
  fs.rmSync(仮置き, { recursive: true, force: true });

  確認('.mp3 を拾う', 集めた.includes('a.mp3'));
  確認('★.m4a を拾う（大文字でも）', 集めた.includes('b.M4A'), `拾ったもの: ${集めた.join(' / ')}`);
  確認('★.wav を拾う', 集めた.includes('f.wav'));
  確認('★.flac を拾う', 集めた.includes('g.flac'));
  確認('下の階層の .m4a も拾う', 集めた.includes('e.m4a'));
  確認('曲でないものは拾わない', !集めた.includes('c.jpg') && !集めた.includes('.toc'));
  確認('拡張子が末尾のものだけ拾う', !集めた.includes('d.m4a.txt'), '.m4a.txt を拾うと曲でないものが混ざります');
  確認('「._」で始まるものは拾わない', !集めた.includes('._e.m4a'));
  確認(
    '★鳴らせない形式は拾わない（aiff / m4p）',
    !集めた.includes('h.aiff') && !集めた.includes('i.m4p'),
    '実測で鳴らなかったので、一覧に出さない',
  );
  確認('拾ったのはこの 5 件だけ', 集めた.length === 5, `${集めた.length} 件: ${集めた.join(' / ')}`);

  /*
   * ★鳴らせない形式の見分け（2026-08-28 実測。**.m4a を拾うようにして作った穴**）。
   *
   * ALAC も拡張子は .m4a なので、一覧に出るのに押しても鳴らない。
   * 本人のライブラリで数えると E:\iTunes Music に **437 曲**あった。
   *
   * 実物で確かめた値（canPlayType は自己申告なので当てにしない）:
   *   ALAC      鳴らない  DEMUXER_ERROR_NO_SUPPORTED_STREAMS
   *   AAC+MP4S  鳴る      150.999365 秒
   *   AAC       鳴る      167.764172 秒
   *
   * ★ここは文字列を渡すだけの検査にする。
   * 本人の音源を指す検査は書かない（公開する前提のファイルなので）。
   */
  console.log('\n[7] 鳴らせない形式を見分けられるか');

  確認('ALAC は鳴らせない', lib.鳴らせるか('ALAC') === false);
  確認('MPEG-4/AAC は鳴らせる', lib.鳴らせるか('MPEG-4/AAC') === true);
  確認(
    '★AAC+MP4S を巻き込まない',
    lib.鳴らせるか('MPEG-4/AAC+MP4S') === true,
    '実測で鳴った 3 件。ここを含めると鳴る曲まで止めてしまいます',
  );
  確認('MPEG 1 Layer 3 は鳴らせる', lib.鳴らせるか('MPEG 1 Layer 3') === true);
  確認(
    '★知らないコーデックは鳴る扱いにする',
    lib.鳴らせるか('なにかの新しい形式') === true && lib.鳴らせるか(undefined) === true,
    '「知っているものだけ鳴る」にすると、測っていない形式を黙って消すことになります',
  );

  /*
   * ★読み方を変えた形式だけ読み直す（2026-08-28）。
   *
   * 全体の版を上げると、**mp3 86,074 曲まで読み直しになる**（冷えたファイルで
   * 36 ms/曲 ≒ 50 分）。読み方を変えたのは .m4a だけなので、そこだけ食い違わせる。
   */
  console.log('\n[8] .m4a だけ読み直す');

  const 仮2 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-mark-'));
  const m3 = path.join(仮2, 'a.mp3');
  const m4 = path.join(仮2, 'a.m4a');
  fs.writeFileSync(m3, 'x'); fs.writeFileSync(m4, 'x');
  const 印3 = await lib.目印(m3);
  const 印4 = await lib.目印(m4);
  fs.rmSync(仮2, { recursive: true, force: true });

  確認('mp3 の目印は、いまの読み方の版のまま', typeof 印3 === 'string' && 印3.startsWith(`v${版 ? 版[1] : '?'}:`), `${印3}`);
  確認('★m4a の目印は mp3 と食い違う', 印3 !== 印4, `mp3: ${印3} / m4a: ${印4}`);
  確認(
    '★m4a の版を上げても、mp3 の目印は変わらない',
    typeof 印3 === 'string' && !/m\d/.test(印3.split(':')[0]),
    `mp3 側に m4a の版が混ざると、86,074 曲の読み直しになります（${印3}）`,
  );

  /*
   * ★日付は目印から取る（2026-08-29 本人の希望）。
   *   > 音楽データを生成日の新しい順に並べることってできますか？
   *
   * 目印を作るのにすでに stat しているので、そこから取れば読み込みは増えない。
   * ★どの日付かは実測で決めた（標本 400 件 × 2 か所）:
   *   作成日時 … E:\iTunes Music の 400 件が全部 2026-08（コピーした日）
   *   更新日時 … 112 種類の月に散らばる（手に入れた時期に沿う）
   */
  console.log('\n[9] 日付を目印から取れるか');

  const 仮3 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-date-'));
  const 曲ファイル = path.join(仮3, 'a.mp3');
  fs.writeFileSync(曲ファイル, 'x');
  const 昔 = new Date('2014-09-15T10:20:30Z');
  fs.utimesSync(曲ファイル, 昔, 昔);
  const 印 = await lib.目印(曲ファイル);
  const 取れた = lib.目印から更新日時(印);
  fs.rmSync(仮3, { recursive: true, force: true });

  確認('★目印から更新日時が取れる', Math.abs(取れた - 昔.getTime()) < 2000,
    `目印: ${印} / 取れた値: ${取れた && new Date(取れた).toISOString()}`);
  確認('壊れた目印では null', lib.目印から更新日時('こわれ') === null && lib.目印から更新日時(null) === null);

  /* ───────────────────────────────────────────────
     10. 変わっていないフォルダを開かずに済ませられるか
     ─────────────────────────────────────────────── */
  /*
   * ★ここが「再スキャンが長い」の正体だった（2026-11-07 本人の報告）。
   *
   *   > 指定のフォルダーに新しいデータを入れて再スキャンするたびに
   *   > 長い読み込みになるのですが、この長さを何とかできないですか？
   *
   * 測ったら、効いていたのは曲数ではなく**フォルダ数**だった。
   * 94,597 曲 / 17,264 フォルダ、置き場は USB の HDD。冷えた状態で
   *   フォルダを 1 つ開く  23.6 ms   ／   曲を 1 つ stat する  0.75 ms
   * なので、開くだけで 6.8 分かかっていた。変わっているのは数個なのに。
   *
   * ★ここで確かめるのは速さではなく、**取りこぼさないこと**。
   * 開かない作りは、間違えると「足したデータが永久に出てこない」になる。
   * それは本人がいちばん困ることなので、足す・消す・名前替え・下に
   * フォルダを作る・中身だけ書き換える、を全部やって確かめる。
   */
  console.log('\n[10] 変わっていないフォルダを開かないか');

  const 仮4 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-dir-'));
  const ア = path.join(仮4, 'A');
  const イ = path.join(仮4, 'B');
  fs.mkdirSync(ア); fs.mkdirSync(イ);
  fs.writeFileSync(path.join(ア, '1.mp3'), 'x');
  fs.writeFileSync(path.join(ア, '2.mp3'), 'x');
  fs.writeFileSync(path.join(イ, '3.mp3'), 'x');

  /*
   * ★刻みを跨がせてから変える（2026-11-11）。
   *
   * Windows のファイル時刻は**約 15.6 ms 刻み**で、同じ刻みの中で 2 回 変えると
   * 更新日時が同じ値のまま残る。すると「変えたのに変わっていない」ように見え、
   * この検査が**たまに落ちた**（実際に 1 度 落ちて、3 回 走らせ直したら通った）。
   *
   * ★偽の警告は、本物の失敗を隠す。だから実験の側で刻みを跨がせる。
   * ここで見たいのは**音蔵の判断**（変わっていなければ開かない／変わったら開く）で、
   * OS が更新日時を動かすかどうかは別に測ってある ――
   * 前から在るフォルダにあとから足す形で **200 回中 200 回**、ちゃんと動いた。
   */
  const 刻みを跨ぐ = () => new Promise((r) => setTimeout(r, 30));

  /** 走査して、道の一覧と開き具合を返す */
  const 走る = async (覚え, 棚) => {
    const r = await lib.scanLibrary([仮4], [], 覚え ?? {}, null, null, null, null, 棚 ?? null);
    return r;
  };

  const 一回目 = await 走る(null, null);
  確認(
    '1 回目は全部 開く',
    一回目.開かずに済んだフォルダ === 0 && 一回目.開いたフォルダ >= 3,
    `開かず ${一回目.開かずに済んだフォルダ} / 開いた ${一回目.開いたフォルダ}`,
  );
  確認('1 回目に 3 曲 見つかる', 一回目.tracks.length === 3, `${一回目.tracks.length} 曲`);
  確認(
    '★フォルダの覚え書きを返す',
    !!一回目.フォルダの覚え && 一回目.フォルダの覚え.版 === lib.フォルダの覚えの版
      && Object.keys(一回目.フォルダの覚え.棚).length >= 3,
    '返さないと、次の走査でまた全部 開きます',
  );

  // 何も変えずにもう一度
  const 二回目 = await 走る(一回目.覚え書き, 一回目.フォルダの覚え);
  確認(
    '★2 回目は、変わっていないフォルダを開かない',
  二回目.開いたフォルダ === 0 && 二回目.開かずに済んだフォルダ >= 3,
    `開かず ${二回目.開かずに済んだフォルダ} / 開いた ${二回目.開いたフォルダ}`,
  );
  確認(
    '★開かなくても、曲は 1 件も減らない',
    二回目.tracks.length === 3,
    `${二回目.tracks.length} 曲 ― 減るなら、覚えた並びの使い回しが壊れています`,
  );

  // ★足したら見つかるか（本人がいちばんよくやること）
  await 刻みを跨ぐ();                        // 足す前
  fs.writeFileSync(path.join(ア, '4.mp3'), 'x');
  const 足し = await 走る(二回目.覚え書き, 二回目.フォルダの覚え);
  確認(
    '★★足したファイルが見つかる',
    足し.tracks.length === 4,
    `${足し.tracks.length} 曲 ― 見つからないなら、入れたデータが永久に出てきません`,
  );
  確認(
    '★足したフォルダだけ開く（ほかは開かない）',
    足し.開いたフォルダ === 1 && 足し.開かずに済んだフォルダ >= 2,
    `開かず ${足し.開かずに済んだフォルダ} / 開いた ${足し.開いたフォルダ}`,
  );

  // ★消したら落ちるか
  await 刻みを跨ぐ();                        // 消す前
  fs.unlinkSync(path.join(ア, '4.mp3'));
  const 消し = await 走る(足し.覚え書き, 足し.フォルダの覚え);
  確認('★消したファイルが落ちる', 消し.tracks.length === 3, `${消し.tracks.length} 曲`);

  // ★名前を変えたら追えるか
  await 刻みを跨ぐ();                        // 名前を変える前
  fs.renameSync(path.join(イ, '3.mp3'), path.join(イ, '3b.mp3'));
  const 改名 = await 走る(消し.覚え書き, 消し.フォルダの覚え);
  確認(
    '★名前を変えたファイルを追える',
    改名.tracks.length === 3 && 改名.tracks.some((t) => t.path.endsWith('3b.mp3')),
    改名.tracks.map((t) => path.basename(t.path)).join(' / '),
  );

  // ★下にフォルダを作ったら見つかるか
  const 奥2 = path.join(イ, 'disc2');
  await 刻みを跨ぐ();                        // 下にフォルダを作る前
  fs.mkdirSync(奥2);
  fs.writeFileSync(path.join(奥2, '5.mp3'), 'x');
  const 新フォルダ = await 走る(改名.覚え書き, 改名.フォルダの覚え);
  確認(
    '★下に作ったフォルダの曲が見つかる',
    新フォルダ.tracks.some((t) => t.path.endsWith('5.mp3')),
    `${新フォルダ.tracks.length} 曲`,
  );

  /*
   * ★中身だけ書き換えたときも読み直すか。
   * 親フォルダの更新日時は動かない（実物の E: で確かめた）。
   * だから曲ごとの stat は残してある。ここを削ると、
   * **外の道具で直したタグを見逃す。**
   */
  await 刻みを跨ぐ();                        // 中身を書き換える前
  fs.writeFileSync(path.join(ア, '1.mp3'), 'xxxxxxxxxxxx');
  const 中身 = await 走る(新フォルダ.覚え書き, 新フォルダ.フォルダの覚え);
  確認(
    '★★中身だけ書き換えた曲は読み直す（フォルダを開かなくても）',
    中身.使い回し === 中身.tracks.length - 1,
    `${中身.tracks.length} 曲のうち 使い回し ${中身.使い回し} 件`
      + '（書き換えた 1 曲だけ読み直すはず）',
  );
  確認(
    '　そのとき、ほかのフォルダは開かない',
    中身.開いたフォルダ === 0,
    `開いた ${中身.開いたフォルダ} ― 中身の変更で開き直すのは無駄です`,
  );

  /*
   * ★版が違えば、覚えた並びは使わない。
   * 拾う拡張子を増やしたのに古い並びを使うと、
   * 新しく拾うはずの形式が**いつまでも出てこない**。
   */
  const 別の版 = await 走る(中身.覚え書き,
    { 版: lib.フォルダの覚えの版 + 1, 棚: (中身.フォルダの覚え || {}).棚 || {} });
  確認(
    '★版が違えば、覚えた並びは使わない',
    別の版.開かずに済んだフォルダ === 0 && 別の版.開いたフォルダ >= 3,
    `開かず ${別の版.開かずに済んだフォルダ} / 開いた ${別の版.開いたフォルダ}`,
  );

  /*
   * ★壊れた覚え書きを渡されても、走査は成り立つこと。
   * 覚え書きのファイルが壊れていても、ただの初回として動けばよい。
   */
  const 壊れ = await 走る(中身.覚え書き, { 版: lib.フォルダの覚えの版, 棚: { [ア]: 'こわれ' } });
  確認(
    '壊れた記録でも、曲を取りこぼさない',
    壊れ.tracks.length === 中身.tracks.length,
    `${壊れ.tracks.length} 曲（期待 ${中身.tracks.length} 曲）`,
  );

  /*
   * ★途中で止めたら、見ていないフォルダの記録を消さないこと。
   * 消すと、次の走査でそこを開き直す（本人のライブラリでは 6.8 分ぶん）。
   */
  const 止めた = await lib.scanLibrary([仮4], [], 中身.覚え書き, null, null, null,
    () => true, 中身.フォルダの覚え);
  確認(
    '★途中で止めても、フォルダの記録を消さない',
    Object.keys((止めた.フォルダの覚え || {}).棚 || {}).length >= Object.keys((中身.フォルダの覚え || {}).棚 || {}).length,
    `止めたあと ${Object.keys((止めた.フォルダの覚え || {}).棚 || {}).length} 件`
      + ` / 前 ${Object.keys((中身.フォルダの覚え || {}).棚 || {}).length} 件`,
  );

  fs.rmSync(仮4, { recursive: true, force: true });

  /*
   * ★数えている途中でも、フォルダの記録が残るか（2026-11-11 本人の報告）。
   *
   *   > 昨日データを追加して再スキャンをしたら、また時間がかかりました
   *
   * ★入れ忘れがあった。**フォルダの記録は、走査が最後まで終わったときにしか
   * 書いていなかった。** 曲の覚え書きは 30 秒ごとに途中保存しているのに。
   * しかも画面は、長い走査のとき「途中で閉じても、次に開いたとき続きから
   * 進みます」と案内する。**その案内に従うと、フォルダの記録だけが失われ**、
   * 次の走査でまた 17,511 フォルダを開くことになる（冷えた実測で 5.8 分）。
   */
  console.log('\n[11] 数えている途中でも、フォルダの記録が残るか');

  const 仮5 = fs.mkdtempSync(path.join(os.tmpdir(), 'otogura-tochu-'));
  for (const n of ['X', 'Y', 'Z']) {
    const d = path.join(仮5, n);
    fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, n + '.mp3'), 'x');
  }

  const 届いた = [];
  const 一回 = await lib.scanLibrary([仮5], [], {}, null, null, null, null, null,
    (増分, 今すぐ) => 届いた.push({ 件: Object.keys(増分).length, 今すぐ, 増分 }));

  確認(
    '★scanLibrary が「フォルダの記録の途中経過」を受け取れる',
    届いた.length > 0,
    '受け取れないと、途中で閉じたときに数え直しがまるごと消えます',
  );
  確認(
    '★数え終わった時点で、必ず一度「いま書け」と言う',
    届いた.some((x) => x.今すぐ === true),
    'ここから先はタグ読みで、本人のライブラリでは 50 分かかることがあります',
  );

  /*
   * ★本番の形で確かめる ―― **途中で渡された記録だけ**を持って、
   * 次の走査でフォルダを開かずに済むか。
   * これができないなら、途中保存に意味が無い。
   */
  const 途中までの棚 = {};
  for (const x of 届いた) Object.assign(途中までの棚, x.増分);
  const 次 = await lib.scanLibrary([仮5], [], 一回.覚え書き, null, null, null, null,
    { 版: lib.フォルダの覚えの版, 棚: 途中までの棚 });
  確認(
    '★★途中で渡された記録だけでも、次は開かずに済む',
    次.開いたフォルダ === 0 && 次.開かずに済んだフォルダ >= 4,
    `開かず ${次.開かずに済んだフォルダ} / 開いた ${次.開いたフォルダ}`,
  );
  確認(
    '　そのとき、曲は 1 件も減らない',
    次.tracks.length === 一回.tracks.length,
    `${次.tracks.length} 曲（期待 ${一回.tracks.length} 曲）`,
  );


  /*
   * ★本体側の配線も見る。
   * library.js が途中経過を渡せても、**main.js が受け取って書かなければ**
   * 何も残らない。上の [11] は library.js だけを直に呼ぶので、そこは通ってしまう。
   */
  {
    const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
    const 素 = 本体.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    確認(
      '★本体が、その途中経過を受け取っている',
      /\(増分, 今すぐ\) => \{[\s\S]{0,160}?Object\.assign\(棚統合, 増分\)/.test(素),
      '受け取らないと、library.js が渡しても捨てられます',
    );
    確認(
      '★「いま書け」と言われたら、待たずに書く',
      /if \(今すぐ \|\| Date\.now\(\) - 棚の最後の保存 >= 30000\) 棚の途中保存\(\);/.test(素),
      '30 秒の間引きだけだと、数え終わった直後に閉じられたぶんが消えます',
    );
    確認(
      '★前の記録を土台にして足す（上書きで消さない）',
      /const 棚統合 = 棚が使える \? \{ \.\.\.前の棚\.棚 \} : \{\};/.test(素),
      '土台にしないと、途中保存のたびに見ていないフォルダの記録が消えます',
    );
  }
  fs.rmSync(仮5, { recursive: true, force: true });

  console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
  process.exit(失敗 ? 1 : 0);
})();

function abbr(list) {
  if (!list.length) return '';
  return list.slice(0, 5).join(' / ') + (list.length > 5 ? ` ほか ${list.length - 5} 件` : '');
}
