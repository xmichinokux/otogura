'use strict';

/**
 * アプリのアイコン（icon.ico）を作る。
 *
 * ■ なぜ道具にしたか
 * 画像ファイルを直に置くと、**どう作ったか分からないものがリポジトリに残る。**
 * ここで作れば、色や形を変えたいときに作り直せる。
 * （音楽ファイルを置かないのと同じ考え方 → tools/make-test-music.js）
 *
 * 外部のライブラリは使わない。PNG も ICO も、仕様どおりに自分で組み立てる。
 *
 * 使い方: node tools/make-icon.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/* ── PNG を作る ───────────────────────────────────────── */

/** CRC32（PNG の各かたまりの末尾に付ける） */
const CRC表 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC表[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** PNG の「かたまり」1 つ */
function かたまり(種類, 中身) {
  const 長さ = Buffer.alloc(4);
  長さ.writeUInt32BE(中身.length, 0);
  const 名 = Buffer.from(種類, 'latin1');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([名, 中身])), 0);
  return Buffer.concat([長さ, 名, 中身, c]);
}

/** RGBA の並び（幅 × 高さ × 4）から PNG を組み立てる */
function PNGにする(rgba, 幅, 高さ) {
  const 署名 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(幅, 0);
  ihdr.writeUInt32BE(高さ, 4);
  ihdr[8] = 8;      // 1 色あたり 8 ビット
  ihdr[9] = 6;      // RGBA
  ihdr[10] = 0;     // 圧縮方式
  ihdr[11] = 0;     // ふるい分け方式
  ihdr[12] = 0;     // 飛ばし書きしない

  // 各行の先頭に「ふるい分けなし（0）」を付ける
  const 生 = Buffer.alloc((幅 * 4 + 1) * 高さ);
  for (let y = 0; y < 高さ; y += 1) {
    生[y * (幅 * 4 + 1)] = 0;
    rgba.copy(生, y * (幅 * 4 + 1) + 1, y * 幅 * 4, (y + 1) * 幅 * 4);
  }

  return Buffer.concat([
    署名,
    かたまり('IHDR', ihdr),
    かたまり('IDAT', zlib.deflateSync(生, { level: 9 })),
    かたまり('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 絵を描く ─────────────────────────────────────────── */

/**
 * レコード盤。
 * ★色は Kokoro OS と揃える（紫 #7c3aed）。同じ作り手のものだと分かるように。
 *
 * ふちのギザギザを消すため、1 画素を 4×4 に割って平均する
 * （画像ライブラリを使わずに、なめらかにする一番素直なやり方）。
 */
const 紫 = [0x7c, 0x3a, 0xed];
const 白 = [0xff, 0xff, 0xff];
const 薄紫 = [0xc4, 0xb5, 0xfd];

function 描く(size) {
  const 割 = 4;                                   // 1 画素を 4×4 で見る
  const rgba = Buffer.alloc(size * size * 4);
  const 角 = size * 0.22;                         // 角の丸み

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < 割; sy += 1) {
        for (let sx = 0; sx < 割; sx += 1) {
          const px = x + (sx + 0.5) / 割;
          const py = y + (sy + 0.5) / 割;
          const 色 = 一点(px, py, size, 角);
          if (色) { r += 色[0]; g += 色[1]; b += 色[2]; a += 255; }
        }
      }
      const n = 割 * 割;
      const i = (y * size + x) * 4;
      // 中が透けている画素は、色を平均するときに数から外す
      const 実 = a / 255;
      rgba[i] = 実 ? Math.round(r / 実) : 0;
      rgba[i + 1] = 実 ? Math.round(g / 実) : 0;
      rgba[i + 2] = 実 ? Math.round(b / 実) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

/** その一点が何色か。外なら null（透ける） */
function 一点(px, py, size, 角) {
  // 角の丸い四角の外か
  const dx = Math.max(角 - px, 0, px - (size - 角));
  const dy = Math.max(角 - py, 0, py - (size - 角));
  if (Math.hypot(dx, dy) > 角) return null;

  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(px - cx, py - cy);

  if (d < size * 0.05) return 紫;                 // 真ん中の穴
  if (d < size * 0.10) return 薄紫;               // ラベル
  if (d < size * 0.32) {
    /*
     * 溝は外まわりに 2 本だけ、細く。
     * ★最初は 3 本を等間隔で太く入れたが、**レコードではなく的に見えた。**
     * 本物の溝は外側に寄っていて細い。そこだけ真似すると、それらしくなる。
     */
    const 溝 = [0.255, 0.29];
    for (const s of 溝) if (Math.abs(d / size - s) < 0.006) return 薄紫;
    return 白;
  }
  return 紫;
}

/* ── ICO にまとめる ───────────────────────────────────── */

const 大きさ = [256, 128, 64, 48, 32, 16];
const 画像 = 大きさ.map((s) => PNGにする(描く(s), s, s));

const 頭 = Buffer.alloc(6);
頭.writeUInt16LE(0, 0);              // 予約
頭.writeUInt16LE(1, 2);              // 1 = アイコン
頭.writeUInt16LE(大きさ.length, 4);

let 位置 = 6 + 16 * 大きさ.length;
const 目次 = [];
大きさ.forEach((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s >= 256 ? 0 : s;           // 256 は 0 と書く決まり
  e[1] = s >= 256 ? 0 : s;
  e[2] = 0;                          // 色数（0 = 制限なし）
  e[3] = 0;                          // 予約
  e.writeUInt16LE(1, 4);             // 面の数
  e.writeUInt16LE(32, 6);            // 1 画素 32 ビット
  e.writeUInt32LE(画像[i].length, 8);
  e.writeUInt32LE(位置, 12);
  位置 += 画像[i].length;
  目次.push(e);
});

const 出先 = path.join(__dirname, '..', 'icon.ico');
fs.writeFileSync(出先, Buffer.concat([頭, ...目次, ...画像]));

// PNG も 1 枚残す（README や GitHub での表示用）
fs.writeFileSync(path.join(__dirname, '..', 'icon.png'), 画像[0]);

console.log(`作りました: ${出先}`);
console.log(`  ${大きさ.join(' / ')} 画素の ${大きさ.length} 枚入り、${(fs.statSync(出先).size / 1024).toFixed(1)} KB`);
