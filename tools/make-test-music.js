'use strict';

/**
 * 検査用の MP3 を作る。
 *
 *   node tools/make-test-music.js
 *
 * ■ ★なぜ、音楽ファイルを配らずに作るのか
 * check-*.js を動かすには MP3 が要る。だが**音源をリポジトリに入れてはいけない。**
 * 実際、手元の test-music に市販の音源が 1 曲混ざっていた（確かめるために置いたもの）。
 *
 * .gitignore の除外に頼るのは危ない。
 * git は「親フォルダを除外すると、中のファイルを ! で戻せない」ので、
 * 書いたつもりの例外が**黙って効かない。**
 * 音源を 1 つも置かなければ、間違いようがない。
 *
 * ここで作るのは**無音**の MPEG フレームで、中身は当たり障りのないもの。
 */

const fs = require('node:fs');
const path = require('node:path');
const NodeID3 = require('node-id3');

const 出す先 = path.join(__dirname, '..', 'test-music');

/**
 * 無音の MPEG フレームを 1 つ作る。
 * MPEG-1 Layer III / 128 kbps / 44.1 kHz / ステレオ。
 * このときのフレームの大きさは 417 バイト（式: 144 × ビットレート ÷ 標本化周波数）。
 */
function 無音のフレーム() {
  const 大きさ = 417;
  const f = Buffer.alloc(大きさ, 0);
  f[0] = 0xff;            // 同期
  f[1] = 0xfb;            // MPEG-1 / Layer III / 誤り訂正なし
  f[2] = 0x90;            // 128 kbps / 44.1 kHz
  f[3] = 0x00;            // ステレオ
  return f;
}

/** 何秒ぶんか作る（1 フレーム = 1152 標本 ≒ 26 ミリ秒） */
function 無音の中身(秒 = 2) {
  const 本数 = Math.ceil((秒 * 44100) / 1152);
  return Buffer.concat(Array.from({ length: 本数 }, 無音のフレーム));
}

const 作るもの = [
  { file: 'a_song.mp3', tags: { title: 'A Song', artist: 'Test Artist', album: 'Test Album', genre: 'Rock', trackNumber: '1' } },
  { file: 'b_song.mp3', tags: { title: 'B Song', artist: 'Test Artist', album: 'Test Album', genre: 'Rock', trackNumber: '2' } },
  { file: 'c_song.mp3', tags: { title: 'C Song', artist: 'ほかの人', album: 'べつのアルバム', genre: 'Jazz' } },
  { file: 'd_song.mp3', tags: { title: 'D Song', artist: 'ほかの人', album: 'べつのアルバム' } },   // ジャンル無し
  // ★タグを付けない。「タグの無い曲を隠す」を試すための 1 曲
  { file: 'no_tag.mp3', tags: null },
];

fs.mkdirSync(出す先, { recursive: true });

for (const { file, tags } of 作るもの) {
  const p = path.join(出す先, file);
  fs.writeFileSync(p, 無音の中身(2));
  if (tags) {
    const r = NodeID3.update(tags, p);
    // ★黙って失敗させない
    if (r !== true) {
      console.error(`  ★${file} にタグを書けませんでした: ${(r && r.message) || '理由不明'}`);
      process.exitCode = 1;
      continue;
    }
  }
  console.log(`  作りました: ${file}  ${fs.statSync(p).size} バイト${tags ? '' : '（タグ無し）'}`);
}

console.log('');
console.log('できました。check-*.js を動かせます。');
console.log('★ここに市販の音源を置かないでください（.gitignore で外していますが、そもそも置かないのが確実です）。');
