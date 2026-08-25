// タグ書き換えが、他の情報を壊さないか確かめる
const fs = require('node:fs');
const path = require('node:path');
const NodeID3 = require('node-id3');
const { タグを書く } = require('./src/tags');

const 元 = path.resolve('test-music/b_song.mp3');       // 曲名/演者/アルバム入り
const 試験 = path.resolve('test-music/_tagtest.mp3');
fs.copyFileSync(元, 試験);

const 判定 = [];
const t = (name, ok, 補足 = '') => 判定.push([name, ok, 補足]);

const 前 = NodeID3.read(試験);
console.log('書く前: ' + JSON.stringify({ title: 前.title, artist: 前.artist, album: 前.album, genre: 前.genre }));

/* 1. ジャンルだけ足す → 他が消えないか */
const r1 = タグを書く(試験, { genre: 'Metalcore' });
const 後 = NodeID3.read(試験);
console.log('書いた後: ' + JSON.stringify({ title: 後.title, artist: 後.artist, album: 後.album, genre: 後.genre }));

t('書き込みが成功した', r1.ok, r1.error ?? '');
t('ジャンルが入った', 後.genre === 'Metalcore');
t('★曲名が消えていない', 後.title === 前.title);
t('★演者が消えていない', 後.artist === 前.artist);
t('★アルバムが消えていない', 後.album === 前.album);

/* 2. 空文字は「触らない」（うっかり全消ししない） */
タグを書く(試験, { artist: '   ' });
const 後2 = NodeID3.read(試験);
t('空文字を渡しても演者が消えない', 後2.artist === 前.artist);

/* 3. 知らない欄は受け付けない */
const r3 = タグを書く(試験, { comment: 'いたずら' });
t('書ける欄以外は拒否する', r3.ok === false);

/* 4. 読めないファイルには触らない */
const 壊れ = path.resolve('test-music/_broken.mp3');
fs.writeFileSync(壊れ, Buffer.from('これは MP3 ではない'));
const r4 = タグを書く(壊れ, { genre: 'X' });
t('MP3 でないファイルには書かない', r4.ok === false, r4.error ?? '');

/* 5. 音の中身（タグの後ろ）が変わっていないか */
const 元の音 = fs.readFileSync(元);
const 後の音 = fs.readFileSync(試験);
const フレーム = (buf) => { const i = buf.indexOf(Buffer.from([0xff, 0xfb])); return i < 0 ? null : buf.slice(i); };
const a = フレーム(元の音); const b = フレーム(後の音);
t('★音のデータが変わっていない', !!a && !!b && a.equals(b));

fs.unlinkSync(試験); fs.unlinkSync(壊れ);              // 試験用に作ったものだけ片付ける

console.log('');
let ng = 0;
for (const [n, ok, 補足] of 判定) { if (!ok) ng += 1; console.log(`  ${ok ? '✓' : '★'} ${n}${補足 ? '（' + 補足 + '）' : ''}`); }
console.log(`\n通らなかったもの: ${ng} 件`);
