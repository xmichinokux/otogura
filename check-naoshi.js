'use strict';

/*
 * 手直し（消せる別ファイル）と、ジャンル埋めの検査。
 *
 * ■ 本人の希望（2026-08-30）
 *   > ジャンル名をまとめるや自分でタグを直しても立ち上げ直すともとに戻るので
 *   > どこかに記録をセーブして、そのセーブデータを削除や直すことで
 *   > 元通りにすることはできないでしょうか？
 *   > ジャンル名無しのデータがたくさんあって…AI の力で振り分けられないでしょうか？
 *   > 多少の間違いはありにします（振り分けられないことのほうが面倒なので）。
 *
 * ★ここで見張るのは 4 つ。
 *
 *  1. **元の曲を書き換えない。** 手直しは重ねるだけ。写しを返す。
 *  2. **消せば完全に元通り。** それがこの層の約束。
 *  3. **手元で決まるものは AI に訊かない。**
 *     実測で 59% は同じ演者の他の曲から決まる。推測ですらない。
 *  4. **AI が作った知らないジャンル名を通さない。**
 *     「多少の間違いはあり」でも、カラムが知らない名前で埋まるのは別の話。
 */

const fs = require('node:fs');
const path = require('node:path');
const naoshi = require('./src/naoshi');

let 落ちた = 0;
function 確認(題, 真, 補) {
  console.log((真 ? '  OK   ' : '  NG   ') + 題 + (真 || !補 ? '' : ' ― ' + 補));
  if (!真) 落ちた += 1;
}

console.log('[1] ★元の曲を書き換えない（重ねるだけ）');
{
  const 手直し = naoshi.手直しを整える({
    曲: { 'A.mp3': { genre: 'Punk', 元: { genre: 'ジャンル名無し' } } },
  });
  const 元の曲 = { path: 'A.mp3', genre: 'ジャンル名無し', artist: 'あ' };
  const 出 = naoshi.手直しを当てる(元の曲, 手直し);

  確認('手直しが当たる', 出.genre === 'Punk');
  確認('★元の曲は変わらない', 元の曲.genre === 'ジャンル名無し',
    '覚え書きの中身をその場で変えると、走査の使い回し判定が狂います');
  確認('★別のものが返る（写し）', 出 !== 元の曲);
  確認('★手直しした印が付く', 出.手直し === true, '画面で印を出すのに要ります');
  確認('ほかの欄はそのまま', 出.artist === 'あ' && 出.path === 'A.mp3');

  const 当たらない = naoshi.手直しを当てる({ path: 'B.mp3', genre: 'Rock' }, 手直し);
  確認('★手直しの無い曲は、そのまま返る', 当たらない.genre === 'Rock' && !当たらない.手直し);

  const 並び = [元の曲, { path: 'B.mp3', genre: 'Rock' }];
  const 重ねた = naoshi.手直しを重ねる(並び, 手直し);
  確認('並びぜんぶに重なる', 重ねた[0].genre === 'Punk' && 重ねた[1].genre === 'Rock');
  確認('★重ねても元の並びは無傷', 並び[0].genre === 'ジャンル名無し');
  確認('★手直しが空なら、そのまま返す（写しも作らない）',
    naoshi.手直しを重ねる(並び, { 曲: {} }) === 並び);
}

console.log('\n[2] ★消せば元通り／壊れていても落ちない');
{
  確認('★空の手直しなら、何も変わらない',
    naoshi.手直しを当てる({ path: 'A', genre: 'X' }, { 曲: {} }).genre === 'X');
  確認('★手直しが無くても落ちない',
    naoshi.手直しを当てる({ path: 'A', genre: 'X' }, null).genre === 'X');

  let 落ちない = true;
  for (const v of [null, undefined, 42, 'あ', [], { 曲: 'ちがう' }, { 曲: { a: null } },
    { 曲: { a: { genre: 5 } } }, { 曲: { '': { genre: 'x' } } }]) {
    try {
      const m = naoshi.手直しを整える(v);
      if (!m || typeof m.曲 !== 'object') 落ちない = false;
    } catch { 落ちない = false; }
  }
  確認('★壊れた手直しファイルでも落ちない', 落ちない,
    '人が手で直せる場所なので、読むたびに整えます');
  確認('★中身の無い手直しは落とす',
    Object.keys(naoshi.手直しを整える({ 曲: { a: {} } }).曲).length === 0);
  確認('★文字でない値は落とす',
    Object.keys(naoshi.手直しを整える({ 曲: { a: { genre: 5, artist: null } } }).曲).length === 0);
  確認('★元の値も残す（1 件だけ戻せるように）',
    naoshi.手直しを整える({ 曲: { a: { genre: 'x', 元: { genre: 'y' } } } }).曲.a.元.genre === 'y');
}

console.log('\n[3] ★手元で決まるものは、AI に訊かない');
{
  /*
   * ★実測の形をなぞる。
   * Leatherface は 2 曲がジャンル未定、他の 352 曲が Punk だった。
   * これは推測ではない。この人自身が付けた値。
   */
  const tracks = [];
  for (let i = 0; i < 20; i += 1) tracks.push({ path: 'L' + i, artist: 'Leatherface', genre: 'Punk' });
  tracks.push({ path: 'L-x', artist: 'Leatherface', genre: 'ジャンル名無し' });
  tracks.push({ path: 'L-y', artist: 'Leatherface', genre: '' });
  for (let i = 0; i < 3; i += 1) tracks.push({ path: 'M' + i, artist: 'Leatherface', genre: 'Rock' });
  /* 手がかりの無い演者 */
  tracks.push({ path: 'N-1', artist: 'Balmora', album: 'in oblivion', genre: 'ジャンル名無し' });
  tracks.push({ path: 'N-2', artist: 'Balmora', album: 'in oblivion', genre: 'Unknown' });

  const { 決まった, 残り } = naoshi.演者から決める(tracks);

  確認('★同じ演者に付いているジャンルで決まる', 決まった.length === 2,
    '実際: ' + 決まった.length + ' 曲');
  確認('★いちばん多いものを採る（Punk 20 / Rock 3）',
    決まった.every((x) => x.genre === 'Punk'),
    '実際: ' + 決まった.map((x) => x.genre).join('、'));
  確認('★空のジャンルも「未定」として拾う',
    決まった.some((x) => x.path === 'L-y'));
  確認('★なぜそう決めたかを残す', /同じ演者の他の 20 曲/.test(決まった[0].訳 || ''));
  確認('★元の値も残す（戻せるように）',
    決まった.some((x) => x.元 === 'ジャンル名無し'));

  確認('★手がかりの無い演者だけが、AI に回る', 残り.length === 1,
    '実際: ' + 残り.length + ' 組');
  確認('その演者の曲がまとまっている', 残り[0].artist === 'Balmora' && 残り[0].曲.length === 2);
  確認('★Unknown も未定として拾う', 残り[0].曲.some((x) => x.path === 'N-2'));

  確認('ジャンル未定の見分け',
    naoshi.ジャンル未定か({ genre: '' }) && naoshi.ジャンル未定か({ genre: 'ジャンル名無し' })
      && naoshi.ジャンル未定か({ genre: 'Unknown' }) && naoshi.ジャンル未定か({})
      && !naoshi.ジャンル未定か({ genre: 'Punk' }));

  /* ★同じ数のときに、毎回同じ答えになるか */
  const 二 = [
    { path: 'a', artist: 'X', genre: 'AAA' }, { path: 'b', artist: 'X', genre: 'BBB' },
    { path: 'c', artist: 'X', genre: 'ジャンル名無し' },
  ];
  const 一回目 = naoshi.演者から決める(二).決まった[0].genre;
  const 二回目 = naoshi.演者から決める(二).決まった[0].genre;
  確認('★同数のときも、毎回同じ答えになる', 一回目 === 二回目 && 一回目 === 'AAA',
    '押すたびに変わると、直したのか分からなくなります');
}

console.log('\n[4] ★AI の返事を、手元のジャンル名だけに濾す');
{
  const 残り = [
    { artist: 'Balmora', 盤: new Set(['in oblivion']), 曲: [{ path: 'a', 元: '' }, { path: 'b', 元: '' }] },
    { artist: 'Bleed', 盤: new Set(['bleed']), 曲: [{ path: 'c', 元: '' }] },
    { artist: 'Contact', 盤: new Set(), 曲: [{ path: 'd', 元: '' }] },
  ];
  const 一覧 = ['Hardcore', 'Metal Core', 'Punk'];

  const 文 = naoshi.埋める頼み文(残り, 一覧);
  確認('頼み文に演者が入る', 文.includes('Balmora') && 文.includes('Bleed'));
  確認('★使えるジャンルを渡す', 文.includes('Hardcore、Metal Core、Punk'));
  確認('★新しい名前を作るなと言っている', 文.includes('新しい名前を作らないでください'));
  確認('★迷っても選べと言っている（本人が「多少の間違いはあり」と言ったので）',
    文.includes('選ばないより、多少外れても選んだほうが役に立ちます'));

  const 出 = naoshi.埋める返事を整える({
    割り当て: [
      { 番号: 1, ジャンル: 'Metal Core', 訳: '盤名から' },
      { 番号: 2, ジャンル: 'hardcore', 訳: '小文字で返ってきた' },
      { 番号: 3, ジャンル: 'Shoegaze', 訳: '★手元に無い名前' },
      { 番号: 9, ジャンル: 'Punk', 訳: '★番号が範囲の外' },
      { 番号: 1, ジャンル: 'Punk', 訳: '★同じ番号が二度' },
    ],
  }, 残り, 一覧);

  確認('★手元に無いジャンルは落ちる', !出.決まった.some((c) => c.genre === 'Shoegaze'));
  確認('★落としたものを覚え書きに残す', 出.落とした.知らないジャンル.includes('Shoegaze'));
  確認('★番号が範囲の外なら落ちる', 出.落とした.番号が変 === 1);
  確認('★同じ番号は 1 回だけ', 出.決まった.filter((c) => c.artist === 'Balmora').length === 1);
  確認('★大文字小文字が違っても通し、手元の字面に直す',
    出.決まった.some((c) => c.artist === 'Bleed' && c.genre === 'Hardcore'),
    'カラムの字面と食い違うと、押したものと違って見えます');
  確認('曲がぶら下がっている',
    出.決まった.find((c) => c.artist === 'Balmora').曲.length === 2);
  確認('訊いた数を返す', 出.訊いた === 3);
}

console.log('\n[5] 手直しに足すところ');
{
  const 出 = naoshi.手直しに足す({ 曲: {} }, [
    { path: 'a', genre: 'Punk', 元: 'ジャンル名無し', 訳: 'ためし' },
    { path: 'b', genre: '', 元: 'x' },
    { path: '', genre: 'Punk' },
    null,
  ], '2026-08-30');
  確認('足せる', 出.曲.a.genre === 'Punk');
  確認('★元の値も一緒に残す', 出.曲.a.元.genre === 'ジャンル名無し');
  確認('訳も残す', 出.曲.a.訳 === 'ためし');
  確認('★ジャンルが空なら足さない', !出.曲.b);
  確認('★パスが空なら足さない', !出.曲['']);
  確認('★壊れたものが混ざっても落ちない', Object.keys(出.曲).length === 1);
  確認('直した日を残す', 出.直した日 === '2026-08-30');

  const 二度目 = naoshi.手直しに足す(出, [{ path: 'a', genre: 'Rock', 元: 'Punk' }], '2026-08-31');
  確認('★同じ曲は上書きされる', 二度目.曲.a.genre === 'Rock');
  確認('★上書きしても、直前の値が元として残る', 二度目.曲.a.元.genre === 'Punk');
}

console.log('\n[6] ★本体と画面に、ちゃんと繋いであるか');
{
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 橋 = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  const 素 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 素頁 = 頁.replace(/<!--[\s\S]*?-->/g, ' ');

  確認(
    '★覚え書きとは別のファイルに置く',
    /手直しファイル = \(\) => path\.join\(app\.getPath\('userData'\), '手直し\.json'\)/.test(本体),
    '32 MB の覚え書きの中では、本人が開くことすらできません',
  );
  確認(
    '★人が読める形で書く（直せることが値打ちなので）',
    /JSON\.stringify\(naoshi\.手直しを整える\(v\), null, 2\)/.test(本体),
  );
  確認(
    '★曲を渡す 2 か所で重ねている',
    (本体.match(/naoshi\.手直しを重ねる\(/g) || []).length >= 2,
    '片方だけだと、走査したあとと前で見え方が変わります',
  );
  確認(
    '★捨てる道がある（消せば元通り）',
    /ipcMain\.handle\('naoshi:forget'[\s\S]{0,200}fs\.unlink\(手直しファイル\(\)\)/.test(本体),
  );
  確認(
    '★置き場を開く道がある（中を見て直せるように）',
    /ipcMain\.handle\('naoshi:reveal'[\s\S]{0,300}showItemInFolder/.test(本体),
  );
  確認('橋が 4 つとも通してある',
    ['naoshi:get', 'naoshi:add', 'naoshi:forget', 'naoshi:reveal'].every((k) => 橋.includes(k)));
  確認('画面が naoshi.js を読み込んでいる',
    /<script src="naoshi\.js"><\/script>/.test(素頁)
      && 素頁.indexOf('naoshi.js') < 素頁.indexOf('renderer.js'));

  確認('★埋めるボタンを作って、欄に並べている',
    /埋める押す\.id = "aifill"/.test(素) && /(box|道具箱)\.append\([^)]*埋める押す/.test(素));
  確認('★そのボタンが繋がっている',
    /埋める押す\.onclick/.test(素) && /await ジャンルを埋める\(/.test(素));
  確認('★見るボタンと捨てるボタンを、欄に並べている',
    /(box|道具箱)\.append\([^)]*手直し見る[^)]*手直し捨てる/.test(素));
  確認('★捨てる前に訊く',
    /手直し捨てる\.onclick[\s\S]{0,400}?await 訊く\(/.test(素));
  確認('★起動時に手直しを読んでいる',
    /await window\.mp3\.手直しを取る\(\)/.test(素));
  確認('★手直しの有無で、ボタンの出し隠しを描き直すたびに直す',
    /function まとめのボタンを直す\(\)[\s\S]{0,400}naoshishow/.test(素));
  確認('★一覧で、手直しした曲が分かる',
    /t\.手直し\) tr\.classList\.add\('naoshi'\)/.test(素) && /tr\.naoshi td\.title::after/.test(頁));

  /* ★手元で決まるぶんを先にやっているか（AI に全部投げていないか） */
  確認(
    '★AI に訊く前に、手元で決める',
    /\} = 演者から決める\(全部\)/.test(素)
      && 素.indexOf('演者から決める(全部)') < 素.indexOf('window.mp3.ジャンルを埋めさせる'),
    '実測で 59% は手元で決まります。訊くだけ無駄で、しかも不確かになります',
  );
  確認(
    '★AI がだめでも、手元で決まったぶんは活かす',
    /if \(!決まった\.length\) return;/.test(素),
  );
}

console.log('\n[7] ★手で直したほうが勝つか');
/*
 * ■ 実地の不具合（2026-08-30）。本人からの報告:
 *   > ジャンルをまとめたタブの中でタグ編集（ジャンルの編集）をすると
 *   > ジャンルをまとめたタブ内で反映されなかったので反映したいです。
 *   > オリジナルのタブの方へは反映を確認しました。
 *   > （あ、ジャンル名無しを変更しました）
 *
 * ★「ジャンル名無し」の曲には、AI で埋めた手直しが載っている。
 * その曲のタグを手で直しても、**重ねる層のほうが勝ち続けていた。**
 * mp3 も覚え書きも新しい値になっているのに、画面では古い値のまま。
 *
 * 実際に本体を 3 回立ち上げて確かめた（直す前）:
 *   AI の手直しで Punk → 手で Hardcore に直す → ★Punk のまま
 *
 * ★手で直したほうが新しく、意図もはっきりしている。手が勝つ。
 * ★ただし外すのは**書いた欄だけ**。
 */
{
  const 出 = naoshi.手直しから外す({
    曲: {
      'a.mp3': { genre: 'Punk', artist: '演', 元: { genre: 'ジャンル名無し', artist: '' } },
      'b.mp3': { genre: 'Rock', 元: { genre: '' } },
    },
  }, 'a.mp3', ['genre']);

  確認('★書いた欄の手直しが外れる', 出.手直し.曲['a.mp3'].genre === undefined);
  確認('★外した欄を返す', 出.外した.join() === 'genre');
  確認(
    '★書いていない欄の手直しは残す',
    出.手直し.曲['a.mp3'].artist === '演',
    'アーティストだけ直したのにジャンルまで消えるのは、頼んでいないことです',
  );
  確認('★元の値も、その欄だけ落とす',
    出.手直し.曲['a.mp3'].元.genre === undefined && 出.手直し.曲['a.mp3'].元.artist === '');
  確認('★ほかの曲は触らない', 出.手直し.曲['b.mp3'].genre === 'Rock');

  /* ★空になったら、その曲ごと落とす */
  const 空 = naoshi.手直しから外す({ 曲: { 'a.mp3': { genre: 'Punk' } } }, 'a.mp3', ['genre']);
  確認('★手直しが空になったら、その曲ごと落とす', 空.手直し.曲['a.mp3'] === undefined);

  /* ★手直しの無い曲でも落ちない */
  const 無 = naoshi.手直しから外す({ 曲: {} }, 'z.mp3', ['genre']);
  確認('★手直しの無い曲でも落ちない', 無.外した.length === 0);
  確認('★パスが空でも落ちない', naoshi.手直しから外す({ 曲: {} }, '', ['genre']).外した.length === 0);
  確認('★壊れた手直しでも落ちない', (() => {
    try { return naoshi.手直しから外す(null, 'a', null).外した.length === 0; } catch { return false; }
  })());

  /* ★本体が、タグを書いたときに呼んでいるか */
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 頭 = 本体.indexOf("ipcMain.handle('tags:write'");
  const 尻 = 本体.indexOf('});', 本体.indexOf('return r;', 頭));
  const 道 = 頭 >= 0 && 尻 > 頭 ? 本体.slice(頭, 尻) : '';
  確認('タグを書くところを切り出せる', !!道);
  確認(
    '★タグを書いたら、その欄の手直しを外す',
    /naoshi\.手直しから外す\(前, filePath, 欄たち\)/.test(道),
    '外さないと、重ねる層が勝ち続けて、手の直しが消えます',
  );
  確認(
    '★外すのは、実際に書いた欄だけ',
    /const 欄たち = Object\.keys\(変更\)\.filter/.test(道),
  );
  確認(
    '★外したら覚え書きに書いて、控えも入れ替える',
    /await 手直しを書く\(後\);/.test(道) && /手直しの控え = 後;/.test(道),
    '控えを入れ替えないと、次に曲を渡すときに古い層が重なります',
  );
  確認(
    '★タグが書けなかったときは、手直しに触らない',
    /if \(!r \|\| !r\.ok\) return r;/.test(道),
  );
  確認(
    '★手直しを外せなくても、黙らない',
    /手直しの外し方: 'だめでした/.test(道),
  );
}

console.log('');
if (落ちた) { console.log(`★${落ちた} 個 落ちました`); process.exit(1); }
console.log('すべて通りました');
