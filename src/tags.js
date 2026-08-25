'use strict';

/**
 * MP3 のタグを書き換える。
 *
 * ■ ★ここだけは、利用者のファイルそのものを書き換える
 * このアプリは「削除は一覧から外すだけ。ファイルは消さない」という約束で作ってきた。
 * タグ編集は、その唯一の例外として本人が頼んだもの（2026-08-24）。
 * だから、壊さないための決まりを置く。
 *
 *   1. **既存のタグを消さない。** update() を使い、渡された欄だけ差し替える
 *      （write() は他のタグを消してしまうので使わない）
 *   2. 空文字は「消す」ではなく「触らない」。うっかり全消しにしない
 *   3. 書く前に**読めることを確かめる**。読めないファイルには触らない
 *   4. 失敗したら理由をそのまま返す。黙って成功したことにしない
 */

const fs = require('node:fs');
const NodeID3 = require('node-id3');

/**
 * 中身が MP3 か、先頭を見て判断する。
 * ・"ID3" で始まる（ID3v2 タグ付き）
 * ・または MPEG のフレーム同期（0xFF 0xEx/0xFx）が先頭付近にある
 */
function MP3らしいか(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const 読んだ = fs.readSync(fd, buf, 0, buf.length, 0);
    if (読んだ < 3) return false;
    if (buf.slice(0, 3).toString('latin1') === 'ID3') return true;
    for (let i = 0; i < 読んだ - 1; i += 1) {
      if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

/** 書き換えてよい欄。ここに無いものは受け付けない */
const 書ける欄 = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  genre: 'genre',
};

/**
 * @param filePath 対象の MP3
 * @param 変更 { title?, artist?, album?, genre? } 触らない欄は入れない
 * @returns { ok: true } | { ok: false, error }
 */
function タグを書く(filePath, 変更) {
  // 3. MP3 でないファイルには触らない。
  // ★NodeID3.read() は中身が無くても {raw:{}} を返すので、戻り値では判定できない
  //   （実測で、MP3 でないファイルにも書き込めてしまった）。
  //   ID3 ヘッダか MPEG フレーム同期があるかを、自分で見る。
  if (!MP3らしいか(filePath)) {
    return { ok: false, error: 'MP3 ファイルではないようです' };
  }

  const 差分 = {};
  for (const [key, tag] of Object.entries(書ける欄)) {
    const v = 変更?.[key];
    if (typeof v !== 'string') continue;        // 2. 渡されなかった欄は触らない
    const 値 = v.trim();
    if (!値) continue;                          // 2. 空は「消す」ではなく「触らない」
    差分[tag] = 値;
  }
  if (!Object.keys(差分).length) return { ok: false, error: '変更するところがありません' };

  // 1. update は既存のタグを保ったまま、渡した欄だけ差し替える
  const r = NodeID3.update(差分, filePath);
  if (r === true) return { ok: true };
  // 4. 失敗の理由をそのまま返す
  return { ok: false, error: (r && r.message) ? r.message : '書き込みに失敗しました' };
}

module.exports = { タグを書く, 書ける欄 };
