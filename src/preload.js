'use strict';

/**
 * 画面側に渡す窓口。ここに書いたものだけが使える。
 * **ファイルを消す機能は用意しない**（指示書: 削除は一覧から外すだけ）。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mp3', {
  設定を取る: () => ipcRenderer.invoke('settings:get'),
  フォルダを足す: () => ipcRenderer.invoke('folders:add'),
  フォルダを外す: (folder) => ipcRenderer.invoke('folders:remove', folder),
  // ★覚えている一覧をすぐ出す（走査を待たない）
  覚えている一覧: () => ipcRenderer.invoke('library:cached'),
  // ★アプリ名を変えたときの引き継ぎ結果。黙って済ませない
  引っ越しの結果: () => ipcRenderer.invoke('migration:get'),
  走査する: () => ipcRenderer.invoke('scan'),
  // ★走査を途中で止める。押しても、そこまで読んだぶんは残る
  走査を止める: () => ipcRenderer.invoke('scan:stop'),
  // ★走査の進み具合。170,000 曲だと数えるだけで 5 分かかるので、無言にしない
  走査の進みを受ける: (fn) => ipcRenderer.on('scan:progress', (_e, p) => fn(p)),
  走査の途中経過を受ける: (fn) => ipcRenderer.on('scan:partial', (_e, a) => fn(a)),
  // ★アートワークは再生する 1 曲だけ読む（全曲ぶんは 17.8 GB になる）
  アートワークを取る: (filePath) => ipcRenderer.invoke('artwork:get', filePath),
  // ★タグを直したあと、その曲だけ読み直す（全走査を避けるため）
  // ★まとめて渡す。1曲ずつだと、60MB の覚え書きを曲数ぶん書き直すことになる
  まとめて読み直す: (paths) => ipcRenderer.invoke('track:reread', paths),
  一覧から外す: (filePath) => ipcRenderer.invoke('tracks:hide', filePath),
  // ★まとめて外す。1曲ずつだと設定ファイルを曲数ぶん書き直すことになる
  まとめて一覧から外す: (paths) => ipcRenderer.invoke('tracks:hideMany', paths),
  外したものを戻す: () => ipcRenderer.invoke('tracks:unhideAll'),

  // 気分でおすすめ。★キーが無ければ 使える:false が返るだけで、壊れない
  AIが使えるか: () => ipcRenderer.invoke('ai:status'),
  AIのキーを入れる: (キー) => ipcRenderer.invoke('ai:setKey', キー),
  AIのキーを消す: () => ipcRenderer.invoke('ai:clearKey'),
  気分でおすすめ: (手がかり) => ipcRenderer.invoke('ai:suggest', 手がかり),
  AIの大きさ: () => ipcRenderer.invoke('ai:sizes'),
  // ★つまみ（対象の幅・選出の量）。AI DJ と Resonance の両方に効く
  AIのつまみを変える: (目盛) => ipcRenderer.invoke('ai:setScale', 目盛),
  AIにプレイリストを作らせる: (手がかり) => ipcRenderer.invoke('ai:playlist', 手がかり),

  // Resonance（Kokoro OS のカルチャーツリー）。★読むだけ
  響きを読み込む: () => ipcRenderer.invoke('resonance:load'),
  響きを取る: () => ipcRenderer.invoke('resonance:get'),
  響きを消す: () => ipcRenderer.invoke('resonance:clear'),
  // ★音蔵の中で木を生やす（Resonance が無くても使える）
  木を生やす: (手がかり) => ipcRenderer.invoke('ai:tree', 手がかり),
  木の大きさ: () => ipcRenderer.invoke('ai:treeSizes'),

  /*
   * ★ジャンル名のまとめ（2026-08-30 本人の希望）。
   * 渡すのは**ジャンル名と曲数だけ**。曲は 1 曲も渡らない。
   * 覚えるのは別の層で、元のジャンル名にも mp3 のタグにも触らない。
   */
  /*
   * ★自分の音源（2026-08-30）。演者名で覚える。
   * 曲は消さない。一覧にも残る。くじと AI の候補に入らないだけ。
   */
  /*
   * ★手直し（2026-08-30）。消せる別ファイルに残す層。
   * 消せば完全に元通りになる。
   */
  /*
   * ★打った文の履歴（2026-08-30）。設定とは別のファイルに置いてある。
   * 消したくなるものなので、消しても他を巻き込まない。
   */
  履歴を取る: () => ipcRenderer.invoke('hist:get'),
  履歴に足す: (種, 文) => ipcRenderer.invoke('hist:add', 種, 文),
  履歴から消す: (種, 文) => ipcRenderer.invoke('hist:remove', 種, 文),
  履歴を全部消す: (種) => ipcRenderer.invoke('hist:clear', 種),

  手直しを取る: () => ipcRenderer.invoke('naoshi:get'),
  手直しを足す: (足すもの, 今日) => ipcRenderer.invoke('naoshi:add', 足すもの, 今日),
  手直しを捨てる: () => ipcRenderer.invoke('naoshi:forget'),
  手直しの置き場を開く: () => ipcRenderer.invoke('naoshi:reveal'),
  ジャンルを埋めさせる: (残り, ジャンル一覧) => ipcRenderer.invoke('genre:fill', 残り, ジャンル一覧),

  自分の音源を取る: () => ipcRenderer.invoke('own:get'),
  自分の音源を変える: (演者たち, 入れるか) => ipcRenderer.invoke('own:set', 演者たち, 入れるか),

  ジャンルをまとめさせる: (一覧) => ipcRenderer.invoke('genre:group', 一覧),
  ジャンルのまとめを覚える: (まとめ) => ipcRenderer.invoke('genre:save', まとめ),
  ジャンルのまとめを捨てる: () => ipcRenderer.invoke('genre:forget'),
  // 辿った言葉ごとに、名前を変える／消す
  響きの名前を変える: (旧, 新) => ipcRenderer.invoke('resonance:rename', 旧, 新),
  響きをひとつ消す: (言葉) => ipcRenderer.invoke('resonance:remove', 言葉),
  // ★シャッフルに入れない曲。「一覧から外す」とは別（一覧には残り、押せば鳴る）
  シャッフル除外を取る: () => ipcRenderer.invoke('shuffleskip:get'),
  シャッフル除外を変える: (paths, 除外する) => ipcRenderer.invoke('shuffleskip:set', paths, 除外する),

  // 再生リスト
  リストを取る: () => ipcRenderer.invoke('lists:get'),
  リストを作る: (name) => ipcRenderer.invoke('lists:create', name),
  リストを消す: (id) => ipcRenderer.invoke('lists:remove', id),
  リスト名を変える: (id, name) => ipcRenderer.invoke('lists:rename', id, name),
  リストに足す: (id, paths) => ipcRenderer.invoke('lists:add', id, paths),
  リストの中身を入れ替える: (id, paths) => ipcRenderer.invoke('lists:setTracks', id, paths),
  m3uに書き出す: (id, 曲情報) => ipcRenderer.invoke('lists:exportM3u', id, 曲情報),
  // ★一本ぶんの曲を、フォルダへコピーする（スマホへ持ち出す用。元は触らない）
  スマホへ持ち出す: (id, 曲情報) => ipcRenderer.invoke('lists:exportFolder', id, 曲情報),
  持ち出しの進みを受ける: (fn) => ipcRenderer.on('export:progress', (_e, p) => fn(p)),
  m3uを読み込む: () => ipcRenderer.invoke('lists:importM3u'),

  // 再生回数（シャッフルで『忘れている曲』を選ぶために使う）
  再生回数を取る: () => ipcRenderer.invoke('plays:get'),
  再生回数を足す: (filePath) => ipcRenderer.invoke('plays:bump', filePath),

  // タグの編集（このアプリで唯一、ファイルそのものを書き換える）
  // 音量そろえ
  // 上限を渡すと、それより大きいファイルは読まずに { 大きすぎる: バイト数 } が返る
  音を読む: (filePath, 上限) => ipcRenderer.invoke('audio:bytes', filePath, 上限),
  倍率を取る: () => ipcRenderer.invoke('gains:get'),
  倍率を覚える: (filePath, 倍率) => ipcRenderer.invoke('gains:set', filePath, 倍率),

  // 音量（覚える）
  音量を取る: () => ipcRenderer.invoke('volume:get'),
  音量を覚える: (v) => ipcRenderer.invoke('volume:set', v),

  // タグの無い曲を隠すか
  タグ無しを隠すか: () => ipcRenderer.invoke('untagged:get'),
  タグ無しを隠す設定: (v) => ipcRenderer.invoke('untagged:set', v),

  // 一覧の列幅
  列幅を取る: () => ipcRenderer.invoke('widths:get'),
  列幅を覚える: (幅) => ipcRenderer.invoke('widths:set', 幅),

  タグを書く: (filePath, 変更) => ipcRenderer.invoke('tags:write', filePath, 変更),
});
