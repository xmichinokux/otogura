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

/*
 * ★スマホへ持ち出すところ（2026-08-30 本人の希望）。
 *
 *   > 音蔵の作るプレイリストが最高なので自分のandroid端末で再生できないかな？
 *   > プレイリストのデータはandoridに入っていないので、
 *   > プレイリストに紐づいたデータだけ同期できないかな？と思ったんです。
 *
 * ★測ってから決めた（本人のライブラリ）:
 *   1 曲の平均 4.6 MB ／ 一本 30 曲 ≒ 139 MB
 *   ライブラリ全部は 388 GB ―― **スマホには入らない。**
 *   でも一本ぶんなら軽い。だから「一本ぶんだけ運ぶ」。
 *   形式は全 86,044 曲が .mp3 なので、変換は要らない。
 *
 * ★m3u の中は**相対の名前**にする。
 * いまの書き出しは Windows の絶対パス（E:\\… ）なので、
 * スマホにその場所が無く、1 曲も鳴らない。
 */

/**
 * ファイル名に使えない字を落とす。
 * ★スマホ側（FAT32 など）で使えない字は Windows より多い。
 * 落とさないと、コピーはできても**スマホで開けないファイル**ができる。
 */
function 名前を安全に(名, 上限 = 80) {
  const s = String(名 == null ? '' : 名)
    .replace(/[\\/:*?"<>|]/g, '_')      // Windows と FAT32 で使えない字
    .replace(/[\x00-\x1f]/g, '')          // 制御文字
    .replace(/[. ]+$/, '')                 // 末尾の点と空白（Windows が嫌う）
    .trim();
  const 詰めた = s.length > 上限 ? s.slice(0, 上限) : s;
  return 詰めた || '無題';
}

/**
 * 持ち出す用の m3u。**相対の名前だけ**を書く。
 *
 * ★題も書く（2026-08-30 本人の希望）:
 *   > 書き出したプレイリストのフォルダー内にあるプレイリストのタイトルは
 *   > 音蔵についてるプレイリストの名前と同じにしてほしいです。
 * #PLAYLIST は m3u の決まりごとで、プレイヤーが一覧の名前として読む。
 * ファイル名だけだと、取り込んだときに「playlist」という名前になってしまう。
 *
 * @param 並び [{ 名前, artist, title, duration }]
 * @param 題   再生リストの名前（音蔵で付けたものそのまま）
 */
function 持ち出すm3u(並び, 題 = '') {
  const 行 = ['#EXTM3U'];
  // ★飾りを落とさず、音蔵で付けた名前をそのまま書く
  if (題) 行.push('#PLAYLIST:' + 題);
  for (const x of 並び) {
    const 秒 = Number.isFinite(x.duration) ? Math.round(x.duration) : -1;
    行.push(`#EXTINF:${秒},${x.artist || ''} - ${x.title || ''}`);
    行.push(x.名前);
  }
  return 行.join('\r\n') + '\r\n';
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

module.exports = {
  名前を安全に, 持ち出すm3u, 実体のあるものだけ, 掃除する, m3uにする, m3uを読む };
