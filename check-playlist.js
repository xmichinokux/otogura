// 再生リストまわりの決めごとを、画面を開かずに確かめる
const fs = require('node:fs');
const path = require('node:path');
const { 掃除する, m3uにする, m3uを読む } = require('./src/playlists');

const dir = path.resolve('test-music');
const a = path.join(dir, 'a_song.mp3');
const b = path.join(dir, 'b_song.mp3');
const 無い = path.join(dir, 'zzz_missing.mp3');

const 判定 = [];
const t = (name, ok) => 判定.push([name, ok]);

/* 1. 同じ曲を複数回入れられる（指示書） */
const 重複あり = [a, b, a];
t('同じ曲を複数回持てる', 重複あり.filter((x) => x === a).length === 2);

/* 2. 位置で1つだけ外せる（パスを鍵にすると両方消える） */
const 外した = [...重複あり];
外した.splice(0, 1);                    // 先頭の a だけ外す
t('同じ曲が2つあるとき、片方だけ外せる',
  外した.length === 2 && 外した[0] === b && 外した[1] === a);

/* 3. 手で並べ替えられる */
const 並べ替え = [...重複あり];
[並べ替え[0], 並べ替え[1]] = [並べ替え[1], 並べ替え[0]];
t('隣と入れ替えられる', 並べ替え[0] === b && 並べ替え[1] === a);

/* 4. 元ファイルが消えたら、再生リストからも自動で消える */
const { lists, 落とした } = 掃除する([{ id: 'x', name: 'テスト', tracks: [a, 無い, b] }]);
t('存在しないファイルが落ちる', lists[0].tracks.length === 2 && !lists[0].tracks.includes(無い));
t('落とした件数を返す', 落とした === 1);
t('★実ファイルは消えていない', fs.existsSync(a) && fs.existsSync(b));

/* 5. m3u が標準形式で書ける／読み戻せる */
const 情報 = new Map([[a, { title: 'Apple', artist: 'the beatles', duration: 3.1 }]]);
const m3u = m3uにする([a, b], 情報);
t('#EXTM3U で始まる', m3u.startsWith('#EXTM3U'));
t('#EXTINF が入る', m3u.includes('#EXTINF:3,the beatles - Apple'));
t('改行が CRLF', m3u.includes('\r\n'));
const 読み戻し = m3uを読む(m3u, dir);
t('読み戻すと元のパスに戻る', 読み戻し.length === 2 && 読み戻し[0] === a && 読み戻し[1] === b);

/* 6. m3u に重複が保たれる（指示書: 同じ曲を複数回） */
const 重複m3u = m3uを読む(m3uにする([a, b, a]), dir);
t('m3u でも重複が保たれる', 重複m3u.length === 3);

/*
 * ★スマホへ持ち出す（2026-08-30 本人の希望）
 *   > プレイリストに紐づいたデータだけ同期できないかな？と思ったんです。
 *
 * ★測ってから決めた（本人のライブラリ）:
 *   1 曲 4.6 MB ／ 一本 30 曲 ≒ 139 MB ／ 全部 388 GB
 *   全部はスマホに入らない。一本ぶんなら軽い。だから一本ぶんだけ運ぶ。
 *   全 86,044 曲が .mp3 なので、変換は要らない。
 */
{
  const { 名前を安全に, 持ち出すm3u } = require('./src/playlists');

  // ★スマホ側（FAT32 など）で使えない字は Windows より多い
  const 汚い = 'AC/DC: Back*In?Black "x" <y>|z';
  t('★使えない字を落とす', !/[\\/:*?"<>|]/.test(名前を安全に(汚い)));
  t('長すぎる名前は詰める', 名前を安全に('あ'.repeat(300), 40).length === 40);
  t('空でも名前になる', 名前を安全に('') === '無題' && 名前を安全に(null) === '無題');
  // ★末尾の点と空白は Windows が嫌う
  t('★末尾の点と空白を落とす', 名前を安全に('だめな名前. ') === 'だめな名前');

  /*
   * ★m3u の中は相対の名前。
   * いつもの書き出しは Windows の絶対パスなので、
   * スマホにその場所が無く、1 曲も鳴らない。
   */
  const m = 持ち出すm3u([
    { 名前: '01 - A - B.mp3', artist: 'A', title: 'B', duration: 180 },
    { 名前: '02 - C - D.mp3', artist: 'C', title: 'D' },
  ]);
  t('#EXTM3U で始まる', m.startsWith('#EXTM3U'));
  t('★中は相対の名前だけ（絶対パスを書かない）', /^01 - A - B\.mp3$/m.test(m) && !/[A-Za-z]:\\/.test(m));
  t('長さと名前が入る', /#EXTINF:180,A - B/.test(m));
  t('長さが分からなければ -1', /#EXTINF:-1,C - D/.test(m));
  // ★題も書く。ファイル名だけだと、取り込んだとき「playlist」になってしまう
  const 題付き = 持ち出すm3u([{ 名前: 'x.mp3' }], '腐液のゴボゴボ行進');
  t('★#PLAYLIST に音蔵の名前を書く', /#PLAYLIST:腐液のゴボゴボ行進/.test(題付き));
  t('題が無ければ #PLAYLIST を書かない', !/#PLAYLIST/.test(持ち出すm3u([{ 名前: 'x.mp3' }])));

  /* 本体のやることを、書いてあることでも守る */
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 頭 = 本体.indexOf('ipcMain.handle(\'lists:exportFolder\'');
  // ★この受け口の中だけを見る（4000 字で切ると隣の受け口まで入ってしまう）
  const 尻 = 頭 >= 0 ? 本体.indexOf(String.fromCharCode(10) + '});', 頭) : -1;
  const 中 = 尻 > 頭 ? 本体.slice(頭, 尻) : '';
  t('持ち出すところがある', 頭 >= 0);
  // ★元のファイルを触るのは、このアプリで一番やってはいけないこと
  t('★コピーするだけ（動かさない・消さない）', /fs\.copyFile\(/.test(中) && !/fs\.rename\(|fs\.unlink\(|fs\.rm\(/.test(中));
  // ★置き場を間違えて指されたときに、消してしまうほうが怖い
  t('★持ち出す先の知らないファイルも消さない', /余り \+= 1/.test(中) && !/unlink|rmSync/.test(中));
  // ★139 MB のコピー中に本体が詰まると、キー入力が届かない
  t('★1 曲ごとに息継ぎする', /await 息継ぎ\(\)/.test(中));
  t('★運べなかったものを黙らない', /見つからない/.test(中) && /運べなかった/.test(中));
  // ★画面に出ていない曲だと、ファイル名そのままになって誰の何か分からない
  t('★曲名は覚え書きからも引く', /覚え書きを読む\(\)/.test(中));
  // ★m3u のファイル名も、音蔵で付けた名前にする
  t('★m3u の名前を再生リストの名前にする', 中.includes("名前を安全に(l.name, 60) + '.m3u'") && !中.includes("'playlist.m3u'"));
}

/*
 * ★長く持った設定を、丸ごと書き戻さないこと（2026-09-04 本人の報告）。
 *
 *   > プレイリストをいくつか消す → AI DJ に作らせる → 新しいのが表示されない
 *   > よく見ると消したはずのプレイリストがある
 *   > そのプレイリストを消すと、消したのが全部消えて新しいのが出てくる
 *
 * ★走査は 93,856 曲で数分かかる。その始めに読んだ設定を終わりに書き戻すと、
 * **走査中にやった変更が全部 巻き戻る。** 再生リストも、フォルダも、まとめも。
 * 書く直前に読み直して、触る欄だけ差し替えること。
 */
{
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 素 = 本体.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  t(
    '★走査の終わりは、設定を読み直してから書く',
    素.includes('const 今の設定 = await 設定を読む();')
      && 素.includes('if (掃除.落とした) { 今の設定.lists = 掃除.lists; await 設定を書く(今の設定); }'),
  );
  t(
    '★走査の終わりで、古い s を丸ごと書き戻さない',
    !/const 掃除 = 掃除する\(s\.lists\);[\s\S]{0,160}?設定を書く\(s\)/.test(素),
  );
}

console.log('');
let ng = 0;
for (const [n, ok] of 判定) { if (!ok) ng += 1; console.log(`  ${ok ? '✓' : '★'} ${n}`); }
console.log(`\n通らなかったもの: ${ng} 件`);
process.exit(ng ? 1 : 0);
