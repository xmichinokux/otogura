// シャッフルが本当に「再生回数の少ない曲」を選びやすいか、実際に引いて数える
const { 次を選ぶ, 巡が終わったか } = require('./src/shuffle');

const 曲 = {
  'よく聴く曲（50回）': 50,
  'たまに聴く曲（10回）': 10,
  '数回聴いた曲（2回）': 2,
  '一度だけ聴いた（1回）': 1,
  '忘れている曲A（0回）': 0,
  '忘れている曲B（0回）': 0,
};
const 候補 = Object.keys(曲);
const 回数表 = 曲;

/* 1. 1万回引いて、どれが何回出たか（巡は使わず、重みだけ見る） */
const 出た = Object.fromEntries(候補.map((p) => [p, 0]));
const N = 10000;
for (let i = 0; i < N; i += 1) {
  const p = 次を選ぶ(候補, 回数表, new Set());
  出た[p] += 1;
}

console.log(`■ ${N} 回引いた結果（均等なら各 ${(100 / 候補.length).toFixed(1)}%）\n`);
for (const p of 候補) {
  const 率 = (出た[p] / N) * 100;
  const 棒 = '█'.repeat(Math.round(率));
  console.log(`  ${p.padEnd(22)} ${率.toFixed(1).padStart(5)}%  ${棒}`);
}

const 忘れ = (出た['忘れている曲A（0回）'] + 出た['忘れている曲B（0回）']) / N;
const よく = 出た['よく聴く曲（50回）'] / N;
console.log(`\n  忘れている曲（0回）の合計 : ${(忘れ * 100).toFixed(1)}%`);
console.log(`  よく聴く曲（50回）        : ${(よく * 100).toFixed(1)}%`);
console.log(`  → 0回の曲は 50回の曲の約 ${Math.round((忘れ / 2) / よく)} 倍 出やすい`);

/* 2. 同じ曲が続けて出ないか（巡を使う） */
console.log('\n■ 巡を使うと、同じ曲が続けて出ないか');
let 済み = new Set();
const 並び = [];
for (let i = 0; i < 候補.length; i += 1) {
  const p = 次を選ぶ(候補, 回数表, 済み);
  並び.push(p);
  済み.add(p);
}
const 重複 = 並び.length - new Set(並び).size;
console.log(`  1巡で出た曲: ${並び.length} 曲 / 重複 ${重複} 件 ${重複 === 0 ? '✓' : '★'}`);
console.log(`  巡が終わったと判定できるか: ${巡が終わったか(候補, 済み) ? '✓' : '★'}`);

/* 3. 締め出していないか（よく聴く曲も、たまには出る） */
console.log('\n■ よく聴く曲も締め出していないか');
console.log(`  50回の曲が 1万回中に出た回数: ${出た['よく聴く曲（50回）']} 回 ${出た['よく聴く曲（50回）'] > 0 ? '✓ 出る' : '★ 出ない'}`);

/* ───────────────────────────────────────────────
   4. 画面側の「対象の決め方」（2026-08-29 本人の希望 2 件）

     > シャッフルを選んだ時、再生ボタンを押すと最初の一曲目から
     > ランダム再生してほしい。今は自分で一曲目を選ばないといけない
     > シャッフルの対象は下のカラムに表示されてる曲のリストにできないかな？

   ★どちらも「開いて押すまで分からない」種類なので、機械に押させる。
   画面のコード（renderer.js）は window / document があって Node から
   そのままは呼べないので、**その部分だけ切り出して**動かす（check-sort.js と同じ）。
   切り出しに失敗したら黙って通さず、はっきり落とす。
   ─────────────────────────────────────────────── */
console.log('\n■ 対象の決め方（いまの列 / 流し始める / 次の曲 / 送る）');

const fs = require('node:fs');
const path = require('node:path');

let 失敗4 = 0;
const 確認4 = (名, 条件, 補足 = '') => {
  if (条件) { console.log(`  OK   ${名}`); } else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗4 += 1; }
};

const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
const 始め4 = 画面.indexOf('function いまの列()');
const 終わり4 = 画面.indexOf('\n}', 画面.indexOf('function 送る(方向)'));
if (始め4 < 0 || 終わり4 < 0) {
  console.log('  NG   renderer.js から「対象の決め方」を切り出せませんでした');
  process.exit(1);
}
const 切り出し4 = 画面.slice(始め4, 終わり4 + 2);

/* 画面の変数・関数の代わり（ここに無いものを使い始めたら、下の eval が落ちる） */
function 台を作る() {
  const 曲を作る = (i, 属性 = {}) => ({
    path: `C:/m/${属性.artist ?? 'A'}/${i}.mp3`,
    title: `曲${i}`, artist: 属性.artist ?? 'A', album: 属性.album ?? 'AL', genre: 'G',
    track: i, タグあり: true, ...属性,
  });
  return {
    tracks: [
      曲を作る(1, { artist: 'あ' }), 曲を作る(2, { artist: 'あ' }),
      曲を作る(3, { artist: 'い' }), 曲を作る(4, { artist: 'い' }),
      曲を作る(5, { artist: 'う' }),
    ],
    曲を作る,
  };
}

function 走らせる(仕込み) {
  const 環境 = {
    tracks: 仕込み.tracks,
    sel: 仕込み.sel ?? { genre: null, artist: null, album: null },
    絞った回数: 0,
    流したもの: [],
    出た文字: [],
    nowPath: 仕込み.nowPath ?? null,
  };
  /*
   * ★画面の変数は「素の let」として用意する。
   * 切り出した本文を書き換えて動かそうとすると、
   * 「巡」が「巡が終わったか」の中まで置き換わるような事故が起きる（実際に起きた）。
   * 書き換えないのがいちばん安全。
   */
  const 前置き = `
    const 開いているリスト = () => null;
    const 曲を並べる = (a, b) => (a.track ?? 0) - (b.track ?? 0);
    function 絞る(level) {
      環境.絞った回数 += 1;
      return 環境.tracks.filter((t) => {
        if (level > 1 && 環境.sel.artist && t.artist !== 環境.sel.artist) return false;
        return true;
      });
    }
    const $ = () => ({ set textContent(v) { 環境.出た文字.push(String(v)); }, get textContent() { return ''; } });
    const audio = { pause() {}, getAttribute: () => null };
    function 再生する(t, o) {
      環境.流したもの.push(t.path);
      nowPath = t.path; 環境.nowPath = t.path;
      if (!o || !o.列を保つ) 巡 = new Set();
      巡.add(t.path);
    }
    let tracks = 環境.tracks;
    let nowPath = 環境.nowPath;
    let 巡 = new Set(仕込み.巡 ?? []);
    let シャッフル = !!仕込み.シャッフル;
    let 繰り返し = 仕込み.繰り返し ?? 'none';
    let 再生回数 = 仕込み.再生回数 ?? {};
  `;
  // eslint-disable-next-line no-new-func
  const 動かす = new Function('環境', '仕込み', '次を選ぶ', '巡が終わったか',
    `${前置き}
${切り出し4}
 return { いまの列, 流し始める, 次の曲, 送る };`);
  return { 環境, ...動かす(環境, 仕込み, 次を選ぶ, 巡が終わったか) };
}

const 台 = 台を作る();

/* 4-1. ▶ を押すだけで流れ始めるか（シャッフル ON） */
{
  const { 環境, 流し始める } = 走らせる({ tracks: 台.tracks, シャッフル: true });
  流し始める();
  確認4(
    '★シャッフル ON で、曲を選ばずに ▶ だけで流れ始める',
    環境.流したもの.length === 1,
    `流れたもの: ${JSON.stringify(環境.流したもの)}`,
  );
}

/* 4-2. シャッフル OFF なら並びの頭から */
{
  const { 環境, 流し始める } = 走らせる({ tracks: 台.tracks, シャッフル: false });
  流し始める();
  確認4('シャッフル OFF なら並びの先頭から', 環境.流したもの[0] === 台.tracks[0].path, `${環境.流したもの[0]}`);
}

/* 4-3. 鳴らせない曲を頭に置いても、それは選ばない */
{
  const 鳴らない = 台.曲を作る(0, { artist: 'あ', 鳴らせる: false });
  鳴らない.track = 0;                                  // 並びの先頭に来る
  const { 環境, 流し始める } = 走らせる({ tracks: [鳴らない, ...台.tracks], シャッフル: false });
  流し始める();
  確認4('★鳴らせない曲は、押していきなり選ばれない', 環境.流したもの[0] !== 鳴らない.path, `${環境.流したもの[0]}`);
}

/* 4-4. ここが本題 ―― 絞り込みを変えたら、対象もそこに変わるか */
{
  const { 環境, いまの列 } = 走らせる({ tracks: 台.tracks });
  const 全部 = いまの列().length;
  環境.sel.artist = 'あ';                              // 再生を止めずに絞り込みだけ変える
  const 絞った後 = いまの列().length;
  確認4(
    '★絞り込みを変えると、対象もそこに変わる（止めなくていい）',
    全部 === 5 && 絞った後 === 2,
    `全部 ${全部} 曲 → 「あ」で絞ると ${絞った後} 曲`,
  );

  環境.sel.artist = null;                              // 選び直せば、また全体に戻る
  確認4('絞り込みを外すと、また全体が対象になる', いまの列().length === 5);
}

/* 4-5. 送る で対象を作り直しすぎていないか（86,000 曲を毎回並べ直さない） */
{
  const 鳴らない = (i) => 台.曲を作る(i, { artist: 'あ', 鳴らせる: false });
  const 並び = [台.曲を作る(1, { artist: 'あ' }), 鳴らない(2), 鳴らない(3), 鳴らない(4), 台.曲を作る(5, { artist: 'あ' })];
  const { 環境, 送る } = 走らせる({ tracks: 並び, nowPath: 並び[0].path });
  送る(1);
  確認4(
    '鳴らせない曲を飛ばして、鳴る曲まで進む',
    環境.流したもの[0] === 並び[4].path,
    `流れたもの: ${JSON.stringify(環境.流したもの)}`,
  );
  確認4(
    '★飛ばした数だけ絞り直していない',
    環境.絞った回数 === 1,
    `絞った回数: ${環境.絞った回数}（飛ばすたびに絞ると 86,000 曲では持ちません）`,
  );
  確認4('飛ばしたことを黙っていない', 環境.出た文字.some((s) => s.includes('飛ばしました')), JSON.stringify(環境.出た文字));
}

console.log(失敗4 ? `\n★ ${失敗4} 件だめでした\n` : '\nすべて通りました\n');
process.exit(失敗4 ? 1 : 0);
