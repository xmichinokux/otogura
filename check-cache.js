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
  console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
  process.exit(失敗 ? 1 : 0);
})();

function abbr(list) {
  if (!list.length) return '';
  return list.slice(0, 5).join(' / ') + (list.length > 5 ? ` ほか ${list.length - 5} 件` : '');
}
