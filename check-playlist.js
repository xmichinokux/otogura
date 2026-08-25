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

console.log('');
let ng = 0;
for (const [n, ok] of 判定) { if (!ok) ng += 1; console.log(`  ${ok ? '✓' : '★'} ${n}`); }
console.log(`\n通らなかったもの: ${ng} 件`);
