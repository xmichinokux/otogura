'use strict';

/**
 * 再生リスト。
 *
 * ■ 指示書で決まっていること
 * ・作成・保存・編集できる
 * ・並び順は**利用者が手で並べ替える**（自動で並べない）
 * ・**同じ曲を複数回追加できる**（だから重複を潰さない）
 * ・複数の曲をまとめて追加できる
 * ・m3u など標準形式で保存（他のプレイヤーでも開ける）
 * ・削除するときは確認ダイアログを出す（＝画面側の仕事）
 * ・**元の MP3 ファイルが消えたら、再生リストからも自動で削除する**
 *
 * ■ 守っていること
 * ここでも**ファイルを消さない。**再生リストから外すのは、記録の側だけ。
 */

const fs = require('node:fs');
const path = require('node:path');

/** 実体が無くなった曲を落とす。指示書「元ファイルを削除したら再生リストからも自動削除」 */
function 実体のあるものだけ(paths) {
  return paths.filter((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

/**
 * 全再生リストから、消えたファイルを取り除く。
 * @returns { lists, 落とした } 落とした件数は画面に伝える（黙って減らさない）
 */
function 掃除する(lists) {
  let 落とした = 0;
  const out = lists.map((l) => {
    const 残り = 実体のあるものだけ(l.tracks);
    落とした += l.tracks.length - 残り.length;
    return { ...l, tracks: 残り };
  });
  return { lists: out, 落とした };
}

/**
 * m3u を書き出す。#EXTM3U 付きの拡張 m3u（他のプレイヤーで開ける）。
 * @param 曲情報 path → { title, artist, duration } の対応表（無ければパスだけ書く）
 */
function m3uにする(paths, 曲情報 = new Map()) {
  const 行 = ['#EXTM3U'];
  for (const p of paths) {
    const t = 曲情報.get(p);
    if (t) {
      const 秒 = Number.isFinite(t.duration) ? Math.round(t.duration) : -1;
      行.push(`#EXTINF:${秒},${t.artist} - ${t.title}`);
    }
    行.push(p);
  }
  // Windows のプレイヤーで開くので改行は CRLF
  return 行.join('\r\n') + '\r\n';
}

/** m3u を読む（コメント行を飛ばして、パスだけ拾う） */
function m3uを読む(text, 基準フォルダ) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    out.push(path.isAbsolute(line) ? line : path.resolve(基準フォルダ, line));
  }
  return out;
}

module.exports = { 実体のあるものだけ, 掃除する, m3uにする, m3uを読む };
