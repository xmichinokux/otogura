'use strict';

/**
 * 曲一覧の並び順の検査。
 *
 * ■ なぜ要るか（2026-08-25）
 * 並び順の既定を、これまでに 2 回変えている。
 *   ファイル名順 → 曲名順 → アーティスト順
 * 変えるたびに「思ったとおりに並んでいるか」を目で確かめていたが、
 * **17 万曲の一覧を目で確かめることはできない。**
 *
 * それに、アーティスト順は「アーティストで並べる」だけでは足りない。
 * 同じ人の中がアルバムばらばらだと、結局読みにくい。
 * **アーティスト → アルバム → 曲番号** まで揃っているかを、機械に数えさせる。
 *
 * ★画面のコード（renderer.js）は、そのままでは Node から呼べない
 * （window や document がある）。並び順の部分だけ切り出して動かす。
 * 切り出しに失敗したら黙って通さず、はっきり落とす。
 */

const fs = require('node:fs');
const path = require('node:path');

let 失敗 = 0;
const 確認 = (名, 条件, 補足 = '') => {
  if (条件) { console.log(`  OK   ${名}`); } else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗 += 1; }
};

/* 並び順の部分だけ切り出す */
const src = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
const 始め = src.indexOf('const 照合 = new Intl.Collator');
const 終わり = src.indexOf('\n}', src.indexOf('function 曲を並べる'));
if (始め < 0 || 終わり < 0) {
  console.log('  NG   renderer.js から並び順の部分を切り出せませんでした');
  process.exit(1);
}
const 切り出し = src.slice(始め, 終わり + 2);

// 画面の変数の代わり
// eslint-disable-next-line prefer-const
let 再生回数 = {};

/*
 * ★切り出した中に `let 並び = ...` が入っている。
 * そのまま eval すると、**外から並び順を変えられない**
 * （こちらで 並び = {key:'title'} と書いても、中の 並び は別物）。
 * 実際これで、曲名順とアーティスト順が同じ結果になり、検査が嘘をついた。
 * 中の 並び を書き換える口を、一緒に取り出す。
 */
// eslint-disable-next-line no-eval
const [曲を並べる, 並びを決める, 照合器] = eval(
  `${切り出し}\n[曲を並べる, (v) => { 並び = v; }, 照合]`,
);

console.log('\n[1] 既定の並びは何か');
const 既定 = /let\s+並び\s*=\s*\{\s*key:\s*'([^']+)'/.exec(src);
確認('既定はアーティスト順', 既定 && 既定[1] === 'artist', `いまの既定: ${既定 ? 既定[1] : '読めません'}`);

console.log('\n[2] 作った台で、狙いどおりに並ぶか');
const 台 = [
  { artist: 'B バンド', album: 'ら行アルバム', track: 2, title: 'ん', path: 'p1' },
  { artist: 'A バンド', album: 'Z アルバム', track: 10, title: 'あ', path: 'p2' },
  { artist: 'A バンド', album: 'Z アルバム', track: 2, title: 'い', path: 'p3' },
  { artist: 'A バンド', album: 'A アルバム', track: 1, title: 'う', path: 'p4' },
  { artist: 'A バンド', album: 'Z アルバム', track: null, title: 'あああ', path: 'p5' },
  { artist: 'a ばんど', album: 'A アルバム', track: 2, title: 'え', path: 'p6' },
];
const 並んだ = [...台].sort(曲を並べる).map((t) => t.path);
確認(
  'アーティスト → アルバム → 曲番号 の順になる',
  並んだ.join(',') === 'p4,p6,p3,p2,p5,p1',
  `出た順: ${並んだ.join(',')}`,
);
確認(
  '曲番号 10 が 2 より後ろに来る（文字として比べていない）',
  並んだ.indexOf('p2') > 並んだ.indexOf('p3'),
);
確認(
  '曲番号の無い曲は、番号のある曲より後ろ',
  並んだ.indexOf('p5') > 並んだ.indexOf('p2'),
);
確認(
  '大文字小文字・全角半角が違っても同じアーティストとして隣り合う',
  Math.abs(並んだ.indexOf('p4') - 並んだ.indexOf('p6')) === 1,
  '「A バンド」と「a ばんど」が離れています',
);

console.log('\n[3] 本人のライブラリで、実際にアーティストがまとまるか');
/*
 * ★新しい名前と昔の名前、両方を見る。
 * アプリ名を変えると保存先フォルダも変わる（Electron がそう決めている）。
 * 片方しか見ないと、引っ越し前は「覚え書きが無い」と言って検査を飛ばしてしまう。
 */
const 覚えファイル = ['Otogura', 'mp3player']
  .map((n) => path.join(process.env.APPDATA || '', n, 'library-cache.json'))
  .find((p) => fs.existsSync(p)) ?? '';
if (fs.existsSync(覚えファイル)) {
  const 覚え = JSON.parse(fs.readFileSync(覚えファイル, 'utf8'));
  const 曲 = [];
  for (const e of Object.values(覚え)) if (e && e.track) 曲.push(e.track);

  /*
   * 並べたあと、同じアーティストが何回に分かれて現れるか数える。
   *
   * ★「同じかどうか」は、3カラムと同じ物差しで見る。
   * 画面は The Beatles と the beatles を同じ人としてまとめているので、
   * ここで文字どおりに比べると、まとまっているのに「散らばっている」と出る。
   */
  const 同じ人 = (a, b) => 照合器.compare(a, b) === 0;
  const 散らばり = (key) => {
    並びを決める({ key, 逆: false });
    const s = [...曲].sort(曲を並べる);
    let 塊 = 0;
    for (let i = 0; i < s.length; i += 1) if (i === 0 || !同じ人(s[i].artist, s[i - 1].artist)) 塊 += 1;
    return 塊;
  };
  // 人数も同じ物差しで数える
  const 名前 = [...new Set(曲.map((t) => t.artist))].sort((a, b) => 照合器.compare(a, b));
  let 人数 = 0;
  for (let i = 0; i < 名前.length; i += 1) if (i === 0 || !同じ人(名前[i], 名前[i - 1])) 人数 += 1;

  const 曲名順 = 散らばり('title');
  const 演者順 = 散らばり('artist');
  console.log(`  ${曲.length.toLocaleString('ja-JP')} 曲 / アーティスト ${人数.toLocaleString('ja-JP')} 人`);
  console.log(`  曲名順に並べたとき      : ${曲名順.toLocaleString('ja-JP')} 個の塊に散らばる`);
  console.log(`  アーティスト順に並べたとき: ${演者順.toLocaleString('ja-JP')} 個の塊`);
  確認('アーティスト順なら、1 人につき 1 か所にまとまる', 演者順 === 人数, `${演者順} 個 ≠ ${人数} 人`);
  確認('曲名順よりも、はっきりまとまっている', 演者順 < 曲名順, `${演者順} / ${曲名順}`);

  /*
   * 同じ人の中で、アルバムも 1 か所にまとまっているか。
   *
   * ★ここも**並べたときと同じ物差しで数える。**
   * 文字どおりに数えると "Album" と "album" が別のアルバムになり、
   * 隣り合って並んでいるのに「散らばっている」と出る（実際にそう出た）。
   */
  並びを決める({ key: 'artist', 逆: false });
  const s2 = [...曲].sort(曲を並べる);
  let アルバム塊 = 0;
  for (let i = 0; i < s2.length; i += 1) {
    if (i === 0 || !同じ人(s2[i].artist, s2[i - 1].artist) || !同じ人(s2[i].album, s2[i - 1].album)) アルバム塊 += 1;
  }
  // 枚数も同じ物差しで。人ごとにアルバム名をまとめて数える
  const 人ごと = new Map();
  for (const t of 曲) {
    const k = t.artist.toLocaleLowerCase('ja');
    if (!人ごと.has(k)) 人ごと.set(k, new Set());
    人ごと.get(k).add(t.album.toLocaleLowerCase('ja'));
  }
  let 枚数 = 0;
  for (const st of 人ごと.values()) 枚数 += st.size;
  console.log(`  アルバム ${枚数.toLocaleString('ja-JP')} 枚 → ${アルバム塊.toLocaleString('ja-JP')} 個の塊`);
  確認('同じアルバムの曲も、1 か所にまとまる', アルバム塊 === 枚数, `${アルバム塊} 個 ≠ ${枚数} 枚`);
} else {
  console.log('  --   覚え書きが無いので飛ばしました');
}

console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
process.exit(失敗 ? 1 : 0);
