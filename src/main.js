'use strict';

/**
 * 音蔵（Otogura） — メインプロセス
 *
 * ■ 指示書で決まっていること（守る）
 * ・削除は「一覧から外すだけ」。**ファイルは消さない。**
 *   → このファイルには fs.unlink / rm の類を一切書かない。書いたら仕様違反。
 * ・タグが読めない／壊れている MP3 は一覧に出さない
 * ・スキャン対象のフォルダはアプリ内で追加・削除できる
 * ・再生状態は保存しない（次回起動時に復元しない）
 *
 * ■ まだ聞いていないので勝手に決めないこと
 * 指示書に無い判断が要るときは、実装で埋めずに相談する。
 */

const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
/*
 * ★目印 を忘れずに入れること（2026-08-25 実地）。
 * これが抜けていたせいで track:reread の中が ReferenceError で落ち、
 * **タグを直しても覚え書きが更新されず、立ち上げ直すと元に戻っていた。**
 * 下の catch が console.warn で握りつぶしていたので、画面には何も出なかった。
 */
const { scanLibrary, アートワークを読む, readTags, 目印 } = require('./library');
const { 掃除する, m3uにする, m3uを読む, 名前を安全に, 持ち出すm3u } = require('./playlists');
const { タグを書く } = require('./tags');
const genre = require('./genre');
const naoshi = require('./naoshi');
const { おすすめを聞く, プレイリストを作らせる, 木を生やす, 候補の数, 作る曲数, 見せる演者の数,
  目盛の数, 既定の目盛, 幅の段, 量の段, 強度の段, 幅を読む, 量を読む, 強度を読む, 木を混ぜる, ジャンルをまとめさせる, ジャンルを埋めさせる, 中断する } = require('./ai');
const { 読み込む: 響きを読み込む, 響きの一節 } = require('./resonance');   // 一覧は画面側が作る（見える曲だけを対象にするため）

/**
 * ★アプリ名を、ここで決め打ちする（2026-08-25 実地）。
 *
 * データの置き場はアプリ名から決まる。そしてアプリ名は、
 * **どう起動したかで変わってしまう。**
 *
 *   electron .              → package.json を読む → "Otogura"
 *   electron なにか.js      → 読まない          → **"Electron"**
 *
 * 後者だと `AppData\Roaming\Electron` を見にいく。
 * 登録フォルダも再生リストも覚え書きも、**空に見える。**
 * 実際これで、画面の検査が本物と違うフォルダを読み、
 * 「ボタンが出ない」という**嘘の不合格**を出した。
 *
 * ★置き場は、起動のされ方に左右されてはいけない。だからここで固定する。
 */
app.setName('Otogura');

/** 設定（スキャン対象フォルダ・一覧から外した曲）の置き場 */
const 設定ファイル = () => path.join(app.getPath('userData'), 'settings.json');

const 既定の設定 = { folders: [], hidden: [], lists: [], plays: {}, gains: {}, widths: {}, volume: 1, タグ無しを隠す: true, シャッフル除外: [], AIの目盛: { 幅: 既定の目盛, 量: 既定の目盛, 強度: 既定の目盛 }, ジャンルのまとめ: { 組: [], 作った日: '' }, 自分の音源: [] };

/** 1〜5 に丸める。数でないものは真ん中に */
function 目盛ひとつ(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 既定の目盛;
  return Math.max(1, Math.min(目盛の数, Math.round(n)));
}
function 目盛を整える(v) {
  const o = (v && typeof v === 'object') ? v : {};
  return { 幅: 目盛ひとつ(o.幅), 量: 目盛ひとつ(o.量), 強度: 目盛ひとつ(o.強度) };
}

async function 設定を読む() {
  try {
    const raw = await fs.readFile(設定ファイル(), 'utf8');
    const v = JSON.parse(raw);
    return {
      folders: Array.isArray(v.folders) ? v.folders.filter((s) => typeof s === 'string') : [],
      hidden: Array.isArray(v.hidden) ? v.hidden.filter((s) => typeof s === 'string') : [],
      // 再生リスト: { id, name, tracks: string[] }。同じ曲を複数回入れられるので重複は潰さない
      lists: Array.isArray(v.lists)
        ? v.lists
            .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
            .map((l) => ({ id: l.id, name: l.name, tracks: Array.isArray(l.tracks) ? l.tracks.filter((x) => typeof x === 'string') : [] }))
        : [],
      // 再生回数。シャッフルで「忘れている曲」を選ぶために使う
      plays: (v.plays && typeof v.plays === 'object' && !Array.isArray(v.plays)) ? v.plays : {},
      // 音量そろえ用に測った倍率 { パス: 倍率 }。測り直さなくて済むよう覚えておく
      gains: (v.gains && typeof v.gains === 'object' && !Array.isArray(v.gains)) ? v.gains : {},
      // 一覧の列幅 { 列id: 画素 }
      widths: (v.widths && typeof v.widths === 'object' && !Array.isArray(v.widths)) ? v.widths : {},
      // 音量（0〜1）。★覚えないと、開くたびに大音量から始まる
      volume: (typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1) ? v.volume : 1,
      /*
       * ★タグの無い曲を隠すか。既定は隠す。
       * 本人の理由: バンドで作った試作品が混ざっていて、再生したくない。
       * 以前は問答無用で消していたが、**選べるようにした**
       * （消えた理由が分からないほうが困る）。
       */
      タグ無しを隠す: v.タグ無しを隠す !== false,
      /*
       * ★シャッフルに入れない曲（本人の希望 2026-08-29）。
       * 「一覧から外す」（hidden）とは別物。**一覧には残り、押せば鳴る。**
       * くじを引くときだけ候補から外す。
       */
      シャッフル除外: Array.isArray(v.シャッフル除外) ? v.シャッフル除外.filter((x) => typeof x === 'string') : [],
      /*
       * ★AI の 2 つのつまみ（対象の幅・選出の量）。1〜5。
       * 範囲の外は黙って真ん中に寄せる。人が手で書き換えても壊れないように。
       */
      AIの目盛: 目盛を整える(v.AIの目盛),
      /*
       * ★ジャンル名のまとめ（2026-08-30 本人の希望）。
       *   > ジャンル名が適当に付けられたデータがたくさんあって困ってる
       *
       * ★これは**別の層**。元のジャンル名にも mp3 のタグにも触らない。
       * 見るときに重ねるだけなので、捨てれば元通りになる。
       * 人の手でも直せる場所なので、読むたびに整える。
       */
      ジャンルのまとめ: genre.ジャンルのまとめを整える(v.ジャンルのまとめ),
      /*
       * ★自分の音源の演者名（2026-08-30 本人の話）。
       *   > 自分のバンド1 は僕のバンドで作曲途中のデータがたくさんあって
       *   > それが読み込まれてる。これはシャッフルの対象にされたくない
       *
       * ★覚えるのは**演者名**。曲のパスではない。
       * パスだと、走査し直したり新しく録ったぶんがまた混ざる。
       * ★曲は消さない。一覧にも残る。くじと AI の候補に入らないだけ。
       */
      自分の音源: Array.isArray(v.自分の音源)
        ? [...new Set(v.自分の音源.filter((x) => typeof x === 'string')
            .map((x) => x.toLocaleLowerCase('ja').trim()).filter(Boolean))]
        : [],
    };
  } catch {
    return { ...既定の設定 };
  }
}

/*
 * ★書けたかを確かめる（2026-08-30）。
 *
 * 実地で、settings.json が 5 日間まったく更新されていないのに
 * 同じ置き場の 手直し.json は書けている、という状態が見つかった。
 * コードは同じ形で、原因は突き止められていない。
 *
 * ★分からないものを黙らせない。書いたあとに読み返して、
 * 中身が合わなければ**投げる**。呼んだ側から画面へ伝わる。
 * 設定が黙って失われるのが、いちばん困る。
 */
async function 設定を書く(v) {
  await fs.mkdir(path.dirname(設定ファイル()), { recursive: true });
  const 文 = JSON.stringify(v, null, 2);
  await fs.writeFile(設定ファイル(), 文, 'utf8');
  let 読み返し;
  try {
    読み返し = await fs.readFile(設定ファイル(), 'utf8');
  } catch (e) {
    throw new Error('設定を書いたのに読み返せません: ' + ((e && e.message) || '不明'));
  }
  if (読み返し !== 文) {
    throw new Error('設定を書いたのに、中身が変わっていません（' + 設定ファイル() + '）');
  }
}

function ウィンドウを作る() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    title: '音蔵 — Otogura',
    backgroundColor: '#ffffff',
    /*
     * ★アイコン（2026-08-25。本人の希望「アイコンをダブルクリックしたい」）。
     * 無いと、タスクバーに Electron の既定のアイコンが出て
     * **自分のアプリに見えない。**
     * 作り方は tools/make-icon.js（画像ファイルを直に置かず、作り直せるようにした）。
     */
    icon: path.join(__dirname, '..', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));
  return win;
}

/**
 * ★以前の名前で保存されたデータを引き継ぐ（2026-08-25）。
 *
 * ■ なぜ要るか
 * Electron は**アプリ名から保存先フォルダを決める。**
 *
 *   name: "mp3player"    → AppData\Roaming\mp3player
 *   productName: "Otogura" → AppData\Roaming\Otogura
 *
 * つまり名前を変えると、**登録したフォルダも再生リストも覚え書きも見えなくなる。**
 * 使う人には「全部消えた」としか見えない
 * （実際、以前これに近いことが起きて「同期したデータが消えていた」と言われた）。
 *
 * ★引き継ぎは**写す**。動かさない。
 * 失敗しても元が残るし、古い版のアプリを起動しても使える。
 * 60 MB あるが、一度きりなので構わない。
 */
const 昔の名前 = ['mp3player'];

async function 引っ越す() {
  const 新 = app.getPath('userData');
  const 運ぶもの = ['settings.json', 'library-cache.json'];

  for (const 昔 of 昔の名前) {
    const 旧 = path.join(path.dirname(新), 昔);
    if (旧 === 新) continue;

    const 写した = [];
    for (const 名 of 運ぶもの) {
      const も = path.join(新, 名);
      const ふ = path.join(旧, 名);
      try {
        // すでに新しい側にあるなら触らない（上書きして失うのが一番まずい）
        await fs.access(も);
        continue;
      } catch { /* 新しい側には無い。続ける */ }
      try {
        await fs.access(ふ);
      } catch { continue; }                       // 古い側にも無い
      try {
        await fs.mkdir(新, { recursive: true });
        await fs.copyFile(ふ, も);
        写した.push(名);
      } catch (e) {
        // ★黙って失敗させない。「消えた」と誤解されるのが一番困る
        return { ok: false, 元: 旧, error: (e && e.message) ? e.message : '不明' };
      }
    }
    if (写した.length) return { ok: true, 元: 旧, 写した };
  }
  return null;                                    // 引き継ぐものは無かった
}

/** 引っ越しの結果。画面から聞かれたら答える（黙って済ませない） */
let 引っ越しの結果 = null;

/*
 * ★同じアプリを 2 つ以上動かさない（2026-08-25 実地）。
 *
 * 本人からの報告:
 *   > 今開いたアプリとデスクトップにあるアイコンの音蔵では中身が違うのですが
 *
 * 2 つ動くと、**両方が走査して、同じ覚え書きに書き込む。**
 * 後から書いたほうが勝つので、片方の読み込みがまるごと消える。
 * 画面に出ているものが食い違い、どちらが本当か分からなくなる。
 *
 * 2 つ目が起動したら、**開かずに、いまある窓を前に出す。**
 */
const 一つだけ = app.requestSingleInstanceLock();
if (!一つだけ) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [窓] = BrowserWindow.getAllWindows();
    if (!窓) return;
    if (窓.isMinimized()) 窓.restore();
    窓.show();
    窓.focus();
  });

  app.whenReady().then(async () => {
    引っ越しの結果 = await 引っ越す();
    ウィンドウを作る();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) ウィンドウを作る();
    });
  });
}

/* ── 気分でおすすめ（本人の希望 2026-08-29）─────────────────
   ★このアプリで唯一、外に通信するところ。
     送るのは「ジャンル名の一覧」と「打ち込んだ気分の文」だけ。
     曲名もファイルのパスも送らない。押したときだけ通信する。

   ★キーが無くても壊れないこと（本人の指示）。
     無ければ機能が画面に出ないだけで、ほかは今までどおり動く。 */

/** キーの置き場。settings.json とは別にする（あちらは人が開いて読むファイル） */
const キーファイル = () => path.join(app.getPath('userData'), 'ai-key.bin');

/**
 * ★平文で置かない。
 * Windows なら safeStorage が DPAPI で暗号化してくれる。
 * 使えない環境では**保存を断る**。平文で書くくらいなら、保存しないほうがいい。
 */
async function キーを読む() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const 中身 = await fs.readFile(キーファイル());
    const v = safeStorage.decryptString(中身);
    return (typeof v === 'string' && v.trim()) ? v.trim() : null;
  } catch {
    return null;                                  // 無い・読めない → 使えないだけ
  }
}

ipcMain.handle('ai:status', async () => ({
  使える: !!(await キーを読む()),
  しまえる: safeStorage.isEncryptionAvailable(),
}));

ipcMain.handle('ai:setKey', async (_e, キー) => {
  if (typeof キー !== 'string' || !キー.trim()) return { ok: false, error: 'キーが空です' };
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'この環境では暗号化して保存できません。平文では保存しません' };
  }
  try {
    await fs.mkdir(path.dirname(キーファイル()), { recursive: true });
    await fs.writeFile(キーファイル(), safeStorage.encryptString(キー.trim()));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : '保存に失敗しました' };
  }
});

ipcMain.handle('ai:clearKey', async () => {
  // ★消すのはキーのファイルだけ。音楽ファイルは一切触らない
  try { await fs.unlink(キーファイル()); } catch { /* もともと無い */ }
  return { ok: true };
});

/** @param 手がかり { 気分, ジャンル一覧, 年一覧 } ―― 画面が作って渡す */
ipcMain.handle('ai:suggest', async (_e, 手がかり) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  /*
   * ★つまみは画面から受け取らず、**ここで設定から読む。**
   * 画面の言い値を信じると、直せば何曲でも頼めてしまう。
   * 置き場を 1 つにしておけば、画面と食い違いようがない。
   */
  const 目盛 = (await 設定を読む()).AIの目盛;
  return おすすめを聞く({
    キー,
    気分: 手がかり && 手がかり.気分,
    ジャンル一覧: 手がかり && 手がかり.ジャンル一覧,
    年一覧: (手がかり && 手がかり.年一覧) || [],
    幅目盛: 目盛.幅,
  });
});

/**
 * 何曲渡して何曲作らせるか。画面が候補を選ぶのに使う。
 * ★つまみの段そのものも返す。画面が数を持たないようにするため
 * （持たせると、段を足したとき片方だけ直す事故になる）。
 */
ipcMain.handle('ai:sizes', async () => {
  const 目盛 = (await 設定を読む()).AIの目盛;
  return {
    候補の数: 幅を読む(目盛.幅).候補,
    作る曲数: 量を読む(目盛.量).曲数,
    目盛,
    目盛の数,
    幅の段,
    量の段,
    // ★文脈の強度。札だけ渡す（頼み文そのものは画面に出さない）
    強度の段: 強度の段.map((x) => ({ 札: x.札 })),
    // ★つまみを触っていないときの値。README と食い違わないように出しておく
    もとの候補の数: 候補の数,
    もとの作る曲数: 作る曲数,
  };
});

/** つまみを動かした。★1〜5 に丸めてから書く */
ipcMain.handle('ai:setScale', async (_e, 目盛) => {
  const s = await 設定を読む();
  s.AIの目盛 = 目盛を整える(目盛);
  await 設定を書く(s);
  return s.AIの目盛;
});

/** @param 手がかり { 気分, 候補 } ―― 候補は画面が 200 曲だけ選んで渡す */
ipcMain.handle('ai:playlist', async (_e, 手がかり) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  const 目盛 = (await 設定を読む()).AIの目盛;
  return プレイリストを作らせる({
    キー,
    気分: 手がかり && 手がかり.気分,
    候補: 手がかり && 手がかり.候補,
    曲数: 量を読む(目盛.量).曲数,
    強度目盛: 目盛.強度,
    // ★画面が突き合わせた結果を、そのまま頼み文に差し込む
    響き: 響きの一節((手がかり && 手がかり.響き) || []),
  });
});

/* ── Resonance（Kokoro OS のカルチャーツリー）─────────────
   ★読むだけ。音楽ファイルにも、ライブラリの保存先にも一切触らない。
   ★置き場は settings.json とは別にする（あちらは人が開いて読むファイル。
     木は 7 本で 20KB あり、混ぜると読めなくなる）。 */

const 響きファイル = () => path.join(app.getPath('userData'), 'resonance.json');

ipcMain.handle('resonance:load', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Resonance の書き出し（JSON）を選ぶ',
    filters: [{ name: 'Resonance の木', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  let 文;
  try {
    文 = await fs.readFile(r.filePaths[0], 'utf8');
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : '読めませんでした' };
  }
  // ★中身を確かめてから写す。壊れたものを置いて、次の起動で困らないように
  const 確かめ = 響きを読み込む(文);
  if (!確かめ.ok) return { ok: false, error: 確かめ.error };
  try {
    await fs.mkdir(path.dirname(響きファイル()), { recursive: true });
    await fs.writeFile(響きファイル(), 文, 'utf8');
  } catch (e) {
    return { ok: false, error: '控えを保存できませんでした（' + ((e && e.message) || '不明') + '）' };
  }
  return { ok: true, 木: 確かめ.木, 元: r.filePaths[0] };
});

/** 前に読み込んだものを返す。無ければ null（**エラーにしない**） */
ipcMain.handle('resonance:get', async () => {
  try {
    const 文 = await fs.readFile(響きファイル(), 'utf8');
    const r = 響きを読み込む(文);
    return r.ok ? r.木 : null;
  } catch {
    return null;
  }
});

/**
 * 言葉から木を生やして、控えに足す。
 *
 * ★生やした木と、読み込んだ木を**同じ置き場に混ぜる**。
 * 形をそろえてあるので（ai.js の 木を生やす を参照）、
 * この先はまったく同じ道を通る。分けると片方だけ直す事故になる。
 */
/* ── ジャンル名のまとめ ─────────────────────────────────
   ★元のジャンル名にも mp3 のタグにも触らない。覚え書きに別の層として置くだけ。
   気に入らなければ genre:forget で捨てれば、元通りになる。 */

/* ── 自分の音源 ─────────────────────────────────────────
   ★曲は消さない。一覧にも残る。押せば鳴る。
   くじ（シャッフル）と AI の候補に入らないだけ。 */

/* ── 手直し ─────────────────────────────────────────────
   ★消せる別ファイル（手直し.json）に残す。消せば完全に元通り。 */

/* ── 打った文の履歴 ───────────────────────────────────── */

/*
 * ★走っている AI を止める（2026-08-30 本人の希望）。
 *   > AIに指示を出した後、生成を途中で止めることってできますか？
 *
 * ★止めても、それまでに使ったぶんは請求される。
 * だから「止めた＝ただになる」とは言わない。**途中で切るだけ。**
 */
ipcMain.handle('ai:cancel', async () => ({ ok: true, 止めた: 中断する() }));

ipcMain.handle('hist:get', async () => 履歴を読む());

/** 打った文を覚える。★同じ文は上に来るだけで、増えない */
ipcMain.handle('hist:add', async (_e, 種, 文) => {
  if (種 !== '気分' && 種 !== '言葉') return 履歴を読む();
  const t = String(文 ?? '').trim();
  if (!t) return 履歴を読む();
  const h = await 履歴を読む();
  h[種] = [t, ...h[種].filter((x) => x.toLocaleLowerCase('ja') !== t.toLocaleLowerCase('ja'))]
    .slice(0, 履歴の上限);
  await 履歴を書く(h);
  return h;
});

/** 1 件だけ消す */
ipcMain.handle('hist:remove', async (_e, 種, 文) => {
  const h = await 履歴を読む();
  if (種 === '気分' || 種 === '言葉') {
    h[種] = h[種].filter((x) => x !== String(文 ?? ''));
    await 履歴を書く(h);
  }
  return h;
});

/** その種類を全部消す。種類を渡さなければ、履歴ファイルごと消す */
ipcMain.handle('hist:clear', async (_e, 種) => {
  if (種 === '気分' || 種 === '言葉') {
    const h = await 履歴を読む();
    h[種] = [];
    await 履歴を書く(h);
    return h;
  }
  try { await fs.unlink(履歴ファイル()); } catch { /* もともと無い */ }
  return { 気分: [], 言葉: [] };
});

ipcMain.handle('naoshi:get', async () => {
  手直しの控え = await 手直しを読む();
  return { 手直し: 手直しの控え, 置き場: 手直しファイル() };
});

/** 手直しを足す（AI の振り分けも、手で直したぶんも、ここへ入る） */
ipcMain.handle('naoshi:add', async (_e, 足すもの, 今日) => {
  const 前 = await 手直しを読む();
  const 後 = naoshi.手直しに足す(前, 足すもの, typeof 今日 === 'string' ? 今日 : '');
  await 手直しを書く(後);
  手直しの控え = 後;
  return { ok: true, 手直し: 後, 件数: Object.keys(後.曲).length };
});

/** 手直しを丸ごと捨てる（★これで完全に元通りになる） */
ipcMain.handle('naoshi:forget', async () => {
  try { await fs.unlink(手直しファイル()); } catch { /* もともと無い */ }
  手直しの控え = { 曲: {}, 直した日: '' };
  return { ok: true };
});

/** 手直しファイルの置き場を、explorer で開く（本人が中を見て直せるように） */
ipcMain.handle('naoshi:reveal', async () => {
  try {
    await 手直しを書く(await 手直しを読む());   // 無ければ作ってから見せる
    shell.showItemInFolder(手直しファイル());
    return { ok: true, 置き場: 手直しファイル() };
  } catch (e) {
    return { ok: false, error: (e && e.message) || '不明' };
  }
});

ipcMain.handle('genre:fill', async (_e, 残り, ジャンル一覧) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  return ジャンルを埋めさせる({ キー, 残り, ジャンル一覧 });
});

ipcMain.handle('own:set', async (_e, 演者たち, 入れるか) => {
  const s = await 設定を読む();
  const 今 = new Set(s.自分の音源);
  const 綺麗 = (Array.isArray(演者たち) ? 演者たち : [])
    .filter((x) => typeof x === 'string')
    .map((x) => x.toLocaleLowerCase('ja').trim())
    .filter(Boolean);
  for (const 名 of 綺麗) {
    if (入れるか) 今.add(名); else 今.delete(名);
  }
  s.自分の音源 = [...今];
  await 設定を書く(s);
  return s.自分の音源;
});

ipcMain.handle('own:get', async () => (await 設定を読む()).自分の音源);

ipcMain.handle('genre:group', async (_e, 一覧) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  /*
   * ★渡ってくるのは**ジャンル名と曲数だけ**。曲は 1 曲も送らない。
   * 画面が数えたものをそのまま使う（本体でもう一度 86,044 曲を回さない）。
   */
  const 綺麗 = (Array.isArray(一覧) ? 一覧 : [])
    .filter((g) => g && typeof g.名 === 'string' && g.名.trim())
    .map((g) => ({
      名: String(g.名).trim(),
      鍵: String(g.鍵 || g.名).toLocaleLowerCase('ja').trim(),
      曲数: Number.isFinite(g.曲数) ? g.曲数 : 0,
    }));
  if (!綺麗.length) return { ok: false, error: 'まとめるジャンルがありません' };
  return ジャンルをまとめさせる({ キー, 一覧: 綺麗 });
});

/** まとめを覚える（本人が見て、要らない親を外したあとのもの） */
ipcMain.handle('genre:save', async (_e, まとめ) => {
  const s = await 設定を読む();
  s.ジャンルのまとめ = genre.ジャンルのまとめを整える(まとめ);
  await 設定を書く(s);
  return { ok: true, ジャンルのまとめ: s.ジャンルのまとめ };
});

/** まとめを捨てる（★元のジャンル名は無傷なので、これで完全に元通りになる） */
ipcMain.handle('genre:forget', async () => {
  const s = await 設定を読む();
  s.ジャンルのまとめ = { 組: [], 作った日: '' };
  await 設定を書く(s);
  return { ok: true };
});

ipcMain.handle('ai:tree', async (_e, 手がかり) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  const r = await 木を生やす({
    キー,
    言葉: 手がかり && 手がかり.言葉,
    手元の演者: (手がかり && 手がかり.手元の演者) || [],
    幅目盛: (await 設定を読む()).AIの目盛.幅,
    蔵書: (手がかり && 手がかり.蔵書) || null,
    // ★同じ言葉なら、すでに挙げた名前を渡して「別のものを」と頼む
    すでにある: (手がかり && Array.isArray(手がかり.すでにある)) ? 手がかり.すでにある : [],
    強度目盛: (await 設定を読む()).AIの目盛.強度,
  });
  if (!r.ok) return r;

  /*
   * ★同じ言葉で辿り直したら、**入れ替えずに足す**（2026-08-29 本人の報告）。
   *   > 一度resonance生成したものと同じ名前で生成しても元の結果と同じままだった
   *
   * 前は入れ替えていたので、AI が似た答えを返すと**何も変わらなかった。**
   * 足していく形にすれば、押すたびに広がる ―― 「もっと辿る」になる。
   *
   * ★曲がたくさん当たるジャンルで演者が足りない、という不便もこれで直せる:
   *   > resonanceで選出した曲が結果的に多いと選出するバンドが少なくなるのが不便
   */
  let 前 = { version: 1, entries: [] };
  try {
    const 文 = await fs.readFile(響きファイル(), 'utf8');
    const p = JSON.parse(文);
    if (p && Array.isArray(p.entries)) 前 = p;
  } catch { /* まだ無い */ }
  前.version = 1;
  前.exportedAt = new Date().toISOString();
  const 前の同じ = 前.entries.find((e) => e && e.keyword === r.結果.keyword);
  const 混ぜた = 木を混ぜる(前の同じ, r.結果);
  前.entries = [混ぜた, ...前.entries.filter((e) => e && e.keyword !== r.結果.keyword)];

  const 確かめ = 響きを読み込む(JSON.stringify(前));
  if (!確かめ.ok) return { ok: false, error: '生やした木を保存できませんでした（' + 確かめ.error + '）' };
  try {
    await fs.mkdir(path.dirname(響きファイル()), { recursive: true });
    await fs.writeFile(響きファイル(), JSON.stringify(前, null, 2), 'utf8');
  } catch (e) {
    return { ok: false, error: '保存できませんでした（' + ((e && e.message) || '不明') + '）' };
  }
  return {
    ok: true,
    生やした: r.結果,
    木: 確かめ.木,
    // ★何個増えたか。同じ言葉で押し直したときに「増えた」と言えるように
    増えた: r.結果.nodes.length,
    全部で: 混ぜた.nodes.length,
  };
});

ipcMain.handle('ai:treeSizes', async () => ({ 見せる演者の数 }));

/** 辿った言葉ごとに、名前を変える／消す。★木の中身は触らない */
async function 響きを書き換える(手当て) {
  let 生;
  try { 生 = JSON.parse(await fs.readFile(響きファイル(), 'utf8')); } catch { return { ok: false, error: '辿ったものがありません' }; }
  if (!生 || !Array.isArray(生.entries)) return { ok: false, error: '中身が読めません' };
  生.entries = 手当て(生.entries);
  生.version = 1;
  const 確かめ = 響きを読み込む(JSON.stringify(生));
  if (!確かめ.ok) {
    // ★全部消えた場合は、控えごと消す（空の木を置くと、次に読めない）
    if (/使える木がありません/.test(確かめ.error)) {
      try { await fs.unlink(響きファイル()); } catch { /* もともと無い */ }
      return { ok: true, 木: null };
    }
    return { ok: false, error: 確かめ.error };
  }
  await fs.writeFile(響きファイル(), JSON.stringify(生, null, 2), 'utf8');
  return { ok: true, 木: 確かめ.木 };
}

ipcMain.handle('resonance:rename', async (_e, 旧, 新) => {
  if (typeof 旧 !== 'string' || typeof 新 !== 'string' || !新.trim()) return { ok: false, error: '名前が空です' };
  return 響きを書き換える((es) => es.map((e) => (e && e.keyword === 旧 ? { ...e, keyword: 新.trim() } : e)));
});

ipcMain.handle('resonance:remove', async (_e, 言葉) => {
  if (typeof 言葉 !== 'string') return { ok: false, error: '指定が正しくありません' };
  return 響きを書き換える((es) => es.filter((e) => e && e.keyword !== 言葉));
});

ipcMain.handle('resonance:clear', async () => {
  // ★消すのはこの控えだけ。音楽ファイルには触らない
  try { await fs.unlink(響きファイル()); } catch { /* もともと無い */ }
  return { ok: true };
});

ipcMain.handle('migration:get', async () => 引っ越しの結果);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ── 画面から呼ばれるもの ───────────────────────────────── */

ipcMain.handle('settings:get', async () => 設定を読む());

ipcMain.handle('folders:add', async () => {
  const r = await dialog.showOpenDialog({
    title: 'スキャンするフォルダを選ぶ',
    properties: ['openDirectory', 'multiSelections'],
  });
  if (r.canceled) return null;
  const s = await 設定を読む();
  for (const p of r.filePaths) if (!s.folders.includes(p)) s.folders.push(p);
  await 設定を書く(s);
  return s;
});

ipcMain.handle('folders:remove', async (_e, folder) => {
  const s = await 設定を読む();
  s.folders = s.folders.filter((f) => f !== folder);
  await 設定を書く(s);
  return s;
});

/**
 * 一覧から外す。**ファイルは消さない。**
 * 指示書の「削除＝一覧から外すだけ（ファイルは残る）」に対応。
 */
ipcMain.handle('tracks:hide', async (_e, filePath) => {
  const s = await 設定を読む();
  if (!s.hidden.includes(filePath)) s.hidden.push(filePath);
  await 設定を書く(s);
  return s;
});

/**
 * ★まとめて一覧から外す（本人の希望 2026-08-25）。
 * ファイルは消さない。1 曲ずつ呼ぶと設定を何度も書くので、まとめて受け取る。
 */
ipcMain.handle('tracks:hideMany', async (_e, paths) => {
  const s = await 設定を読む();
  for (const p of (Array.isArray(paths) ? paths : [])) {
    if (typeof p === 'string' && !s.hidden.includes(p)) s.hidden.push(p);
  }
  await 設定を書く(s);
  return s.hidden.length;
});

/*
 * ── シャッフルに入れない曲 ──────────────────────────────
 * ★「一覧から外す」と混ぜないこと。
 *   一覧から外す … 一覧に出ない。押せない
 *   シャッフル除外 … 一覧に出る。押せば鳴る。くじに入らないだけ
 * 本人は両方ほしいと言った（2026-08-29）ので、別々に持つ。
 */
ipcMain.handle('shuffleskip:get', async () => (await 設定を読む()).シャッフル除外);

/** まとめて入れ替える。1 曲ずつだと設定ファイルを曲数ぶん書き直すことになる */
ipcMain.handle('shuffleskip:set', async (_e, paths, 除外する) => {
  const s = await 設定を読む();
  const 集合 = new Set(s.シャッフル除外);
  for (const p of (Array.isArray(paths) ? paths : [])) {
    if (typeof p !== 'string') continue;
    if (除外する) 集合.add(p); else 集合.delete(p);
  }
  s.シャッフル除外 = [...集合];
  await 設定を書く(s);
  return s.シャッフル除外;
});

ipcMain.handle('tracks:unhideAll', async () => {
  const s = await 設定を読む();
  s.hidden = [];
  await 設定を書く(s);
  return s;
});

/**
 * ★走査の覚え書きは、設定とは別のファイルに置く。
 * 本人のライブラリは 171,085 曲。settings.json に混ぜると数十 MB になり、
 * **人が開いて読めるファイルではなくなる。**
 * 設定は小さく保ち、機械が使う大きいものは別にする。
 */
/*
 * ★手直し（2026-08-30 本人の希望）。
 *   > どこかに記録をセーブして、そのセーブデータを削除や直すことで
 *   > 元通りにすることはできないでしょうか？
 *
 * ★覚え書き（library-cache.json・32 MB）とは別のファイルにする。
 * 覚え書きは走査が作り直すもので、手で直したものを混ぜると
 * 走査のたびに消えるかどうかが読めなくなる。
 * こちらは小さいので、本人が開いて見て、直して、消せる。
 *
 * ★このファイルを消せば、完全に元通りになる。それがこの層の約束。
 */
/*
 * ★打った文の履歴（2026-08-30 本人の希望）。
 *   > 一回使ったら入力欄の文字は消えてほしいと思う反面、
 *   > 同じ条件でどんなのできるかな？と試そうとする自分もいて
 *   > イチイチ文字が消えるのが面倒くさいと思います。
 *   > 入力欄の履歴が残って入力欄をクリックするとしたに履歴が表示される、
 *   > みたいな機能があればいいのかな？
 *   > ちなみに、履歴は消したいとも思うので履歴を消すなにかもほしいのですが。
 *
 * ★消したくなるものなので、**設定とは別のファイル**に置く。
 * 消すときに、ほかの設定を巻き込まない。
 */
const 履歴ファイル = () => path.join(app.getPath('userData'), '履歴.json');

/** 履歴は 1 種類につき 20 件まで。それ以上は古いものから捨てる */
const 履歴の上限 = 20;

function 履歴を整える(v) {
  const o = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const 出 = {};
  for (const 種 of ['気分', '言葉']) {
    const 生 = Array.isArray(o[種]) ? o[種] : [];
    const 見た = new Set();
    const 並び = [];
    for (const x of 生) {
      if (typeof x !== 'string') continue;
      const t = x.trim();
      if (!t || 見た.has(t.toLocaleLowerCase('ja'))) continue;
      見た.add(t.toLocaleLowerCase('ja'));
      並び.push(t.slice(0, 200));
      if (並び.length >= 履歴の上限) break;
    }
    出[種] = 並び;
  }
  return 出;
}

async function 履歴を読む() {
  try {
    return 履歴を整える(JSON.parse(await fs.readFile(履歴ファイル(), 'utf8')));
  } catch {
    return { 気分: [], 言葉: [] };
  }
}

async function 履歴を書く(v) {
  await fs.mkdir(path.dirname(履歴ファイル()), { recursive: true });
  await fs.writeFile(履歴ファイル(), JSON.stringify(履歴を整える(v), null, 2), 'utf8');
}

const 手直しファイル = () => path.join(app.getPath('userData'), '手直し.json');

async function 手直しを読む() {
  try {
    return naoshi.手直しを整える(JSON.parse(await fs.readFile(手直しファイル(), 'utf8')));
  } catch {
    return { 曲: {}, 直した日: '' };
  }
}

async function 手直しを書く(v) {
  await fs.mkdir(path.dirname(手直しファイル()), { recursive: true });
  /* ★人が開いて読める形で書く。直せることが値打ちなので、詰めない */
  await fs.writeFile(手直しファイル(), JSON.stringify(naoshi.手直しを整える(v), null, 2), 'utf8');
}

const 覚え書きファイル = () => path.join(app.getPath('userData'), 'library-cache.json');

async function 覚え書きを読む() {
  try {
    const raw = await fs.readFile(覚え書きファイル(), 'utf8');
    const v = JSON.parse(raw);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch {
    return {};                                 // 無ければ、ただの初回
  }
}

/**
 * 覚え書きを書く。**失敗したら、その理由を返す。**
 *
 * ★ここは以前 console.warn だけだった（2026-08-25、Aegis の指摘で直した）。
 * 「黙って失敗させない」とコメントしておきながら、
 * **出していたのは開発者用の窓で、使う人には見えなかった。**
 * コメントは、失敗を見せてくれない。
 *
 * 覚えられなくても走査そのものは成り立つので、**止めはしない。**
 * ただし黙りもしない。171,085 曲では読み直しに 50 分かかる。
 * それが毎回捨てられていることに気づけないのが、いちばん困る。
 */
async function 覚え書きを書く(v) {
  try {
    await fs.mkdir(path.dirname(覚え書きファイル()), { recursive: true });
    await fs.writeFile(覚え書きファイル(), JSON.stringify(v), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : '不明' };
  }
}

/**
 * ★覚えている一覧を、走査せずにそのまま返す。
 *
 * 起動のたびに全走査していたのが、
 * 「立ち上げ直したらデータが消えていた」の正体だった。
 * 171,085 曲ではファイルを数えるだけで 5 分かかるので、
 * その間ずっと一覧が空に見える。**消えたのではなく、まだ出ていなかった。**
 *
 * 覚え書きから作れば、待ち時間ゼロで前回の一覧が出る。
 * 変わったぶんは、そのあと裏で走査して追いつく。
 */
/**
 * 覚え書きから一覧を作る。
 * ★走査せずに出すところと、フォルダが無いときの戻り値で、同じものを使う。
 * 2 か所に書くと、片方だけ直す事故になる。
 */
/*
 * ★手直しを重ねてから渡す（2026-08-30）。
 * ここと走査の返しの 2 か所だけで、画面も AI もくじも書き出しも
 * 直したあとの値を見る。ほかには手を入れなくて済む。
 */
let 手直しの控え = { 曲: {}, 直した日: '' };

function 覚えている曲(s, 覚え) {
  const 隠す = new Set(s.hidden);
  const tracks = [];
  for (const [p, v] of Object.entries(覚え)) {
    if (隠す.has(p)) continue;
    // ★曲でないもの（macOS の付随ファイル）は出さない。走査を待たずに効かせる
    if (p.replace(/^.*[\\/]/, '').startsWith('._')) continue;
    if (v && v.track) tracks.push(v.track);
  }
  return naoshi.手直しを重ねる(tracks, 手直しの控え);
}

ipcMain.handle('library:cached', async () => {
  const s = await 設定を読む();
  const tracks = 覚えている曲(s, await 覚え書きを読む());
  return { tracks, 件数: tracks.length };
});

/**
 * 走査。
 *
 * ★2026-08-25 作り直し。171,085 曲を登録したらアプリが落ちたため。
 *   ・進み具合をその場で送る（数えるだけで 5 分かかるので、無言にしない）
 *   ・見つかったそばから送る（全部そろうまで待たせない）
 *   ・前回と変わっていないファイルは、タグを読み直さない
 */
/*
 * ★走査を途中で止められるようにする（2026-08-29 本人の希望）。
 *
 * 大きなライブラリでは、読み終わるまで数十分ディスクを占め続ける
 * （作者の 86,000 曲で約 50 分）。CPU ではなくディスクが詰まるので、
 * ほかのアプリの読み書きまで遅くなる。
 * それまでは**窓を閉じるしか止める方法が無かった。**
 *
 * ★止めても損はしない。30 秒ごとに覚え書きを保存しているので、
 * 次に開いたときは続きから進む。
 */
let 止めてほしい = false;

ipcMain.handle('scan:stop', async () => { 止めてほしい = true; return { ok: true }; });

ipcMain.handle('scan', async (e) => {
  止めてほしい = false;                        // 押し直したら、また最初から
  const s = await 設定を読む();
  const 覚え = await 覚え書きを読む();

  /*
   * ★フォルダが 1 つも登録されていなければ、走査しない（2026-08-29）。
   *
   * scanLibrary は「見つかったものが、そのまま新しい全部」という作り。
   * フォルダが無いと 0 件見つかるので、**覚え書きを {} で上書きして
   * 86,044 件を消し、一覧も 0 曲にする。**
   *
   * 実測（本人の覚え書きで確かめた）:
   *   フォルダ 0 個で走査 → 曲 0 / 覚え書き 0 件（86,044 件が消える）
   *
   * 「止めたら消えた」（0.14.1）と同じ形の間違い。あちらは途中で止めたとき、
   * こちらは**そもそも探す場所が無いとき**。どちらも「見つからない」を
   * 「無くなった」と取り違えている。
   *
   * ★登録し忘れただけで 50 分ぶんが飛ぶ。**覚え書きには指一本触れない。**
   * 覚えている一覧をそのまま返して、フォルダが無いことを画面に言わせる。
   */
  if (!s.folders.length) {
    const tracks = 覚えている曲(s, 覚え);
    return {
      フォルダが無い: true,
      止めた: false,
      tracks,
      見つかった: 0, 読めなかった: 0, hidden: s.hidden.length,
      使い回し: tracks.length,
      lists: s.lists, リストから落とした: 0,
      覚え書きの保存: { ok: true },
      補った: 0,
    };
  }
  const 送る = (種, 値) => { try { e.sender.send(種, 値); } catch { /* 窓が閉じた */ } };

  /*
   * ★途中まででも覚え書きを残す（2026-08-25 実地）。
   *
   * 以前は最後に一度だけ書いていた。171,085 曲では完走まで数分かかるので、
   * その前に閉じると**その回の読み込みはまるごと捨てられる。**
   * 実際に覚え書き 171,085 件が古い形式のまま固まり、
   * 起動のたびに全曲を読み直していた（使い回し 0 件）。永久に追いつかない。
   *
   * 60 MB あるので毎回は書けない。★30 秒に一度までに間引く。
   * 前の書き込みが終わる前に次を始めないよう、札で守る。
   */
  /*
   * ★引き継ぐ前に、曲でないものを落とす（2026-08-25）。
   *
   * 覚え書き 171,092 件のうち **85,039 件**が macOS の付随ファイル（`._` で始まる）だった。
   * 走査では拾わないようにしたが、**途中保存は前の覚え書きに足していく形**なので、
   * 走査が最後まで終わるまで消えない。171,085 曲では 50 分かかる。
   * その間ずっと、一覧に曲でないものが並び続ける。ここで落とせば、すぐ消える。
   */
  const 曲でない = (p) => {
    const 名 = p.replace(/^.*[\\/]/, '');
    return 名.startsWith('._');
  };
  const 統合 = {};
  let 落とした = 0;
  for (const [p, v] of Object.entries(覚え)) {
    if (曲でない(p)) { 落とした += 1; continue; }
    統合[p] = v;
  }
  if (落とした) 送る('scan:progress', { 段階: `曲でないものを ${落とした.toLocaleString('ja-JP')} 件はずしました`, 済み: 落とした, 全体: null });
  let 保存中 = false;
  let 最後の保存 = Date.now();
  const 途中保存 = async () => {
    if (保存中) return;
    保存中 = true;
    最後の保存 = Date.now();
    try { await 覚え書きを書く(統合); } finally { 保存中 = false; }
  };

  const r = await scanLibrary(
    s.folders,
    s.hidden,
    覚え,
    (p) => 送る('scan:progress', p),
    (部分) => 送る('scan:partial', 部分),
    (増分) => {
      Object.assign(統合, 増分);
      if (Date.now() - 最後の保存 >= 30000) 途中保存();
    },
    () => 止めてほしい,                          // ★押されたら、そこで切り上げる
  );

  const 保存 = await 覚え書きを書く(r.覚え書き);

  // ★走査のたびに再生リストも掃除する。
  // 起動時だけだと、アプリを開いたまま MP3 を消したときに保存データが古いまま残る
  // （指示書の『先に確かめたほうがいいこと』が、まさにこのズレを警告していた）
  const 掃除 = 掃除する(s.lists);
  if (掃除.落とした) { s.lists = 掃除.lists; await 設定を書く(s); }

  return {
    // ★途中で止めたことを画面に伝える。黙って「読み終えた」と言わない
    止めた: !!r.止めた,
    tracks: naoshi.手直しを重ねる(r.tracks, 手直しの控え), 見つかった: r.found, 読めなかった: r.unreadable, hidden: r.hidden,
    使い回し: r.使い回し,
    lists: 掃除.lists, リストから落とした: 掃除.落とした,
    // ★覚え書きを残せなかったら、その理由も返す。黙って捨てない
    覚え書きの保存: 保存,
    // 止めたときに、前の記録から補ったぶん
    補った: r.補った ?? 0,
  };
});

/**
 * 再生する 1 曲ぶんのアートワーク。
 * ★一覧では読まない。全曲ぶん持つと 17.8 GB になり、アプリが落ちる（実測）。
 */
ipcMain.handle('artwork:get', async (_e, filePath) => アートワークを読む(filePath));

/**
 * 1 曲だけタグを読み直す。
 * ★タグを直したあとに全走査すると、171,085 曲では数分かかって一覧が空になる。
 * 直した曲だけ読み直せば足りる。
 */
ipcMain.handle('track:reread', async (_e, paths) => {
  const 並び = Array.isArray(paths) ? paths : [paths];
  const 出 = [];
  for (const p of 並び) 出.push(await readTags(p));

  /*
   * ★覚え書きも一緒に直す。
   * 直さないと、画面では変わったのに**次に開いたとき古い値へ戻る。**
   * 覚え書きは「ファイルが変わっていなければ読み直さない」作りなので、
   * ここを放っておくと古い値をずっと持ち続ける。
   *
   * ★まとめて受け取って、**書き込みは 1 回だけ**にする。
   * 覚え書きは 60 MB あるので、1 曲ごとに書くと 14 曲で 14 回書くことになる。
   */
  /*
   * ★ここは黙って失敗してはいけない（2026-08-25 実地）。
   *
   * 以前ここは console.warn で握りつぶしていた。
   * その状態で 目印 の import を忘れており、**毎回 ReferenceError で落ちていた。**
   * タグ自体は書けているので画面上は直って見え、
   * 立ち上げ直すと古い値に戻る、という形で出た。
   * ターミナルを見る人しか気づけない。だから**呼んだ側に返す。**
   */
  let 覚え = { ok: true, 直した: 0 };
  try {
    const 表 = await 覚え書きを読む();
    let 直した = 0;
    for (let i = 0; i < 並び.length; i += 1) {
      if (!出[i]) continue;
      const m = await 目印(並び[i]);
      if (m) { 表[並び[i]] = { 目印: m, track: 出[i] }; 直した += 1; }
    }
    if (直した) await 覚え書きを書く(表);
    覚え = { ok: true, 直した };
  } catch (e) {
    覚え = { ok: false, error: (e && e.message) ? e.message : '不明' };
  }

  return { tracks: 出, 覚え };
});

/** 音量。★覚えないと、開くたびに大音量から始まる */
ipcMain.handle('volume:get', async () => (await 設定を読む()).volume);
ipcMain.handle('volume:set', async (_e, v) => {
  const s = await 設定を読む();
  s.volume = Math.max(0, Math.min(1, Number(v) || 0));
  await 設定を書く(s);
  return s.volume;
});

/** タグの無い曲を隠すか（バンドの試作品を出さないため） */
ipcMain.handle('untagged:get', async () => (await 設定を読む()).タグ無しを隠す);
ipcMain.handle('untagged:set', async (_e, v) => {
  const s = await 設定を読む();
  s.タグ無しを隠す = !!v;
  await 設定を書く(s);
  return s.タグ無しを隠す;
});

/* ── 再生リスト ─────────────────────────────────────────── */

const 新しいID = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

ipcMain.handle('lists:get', async () => {
  const s = await 設定を読む();
  // 指示書:「元の MP3 を削除したら、再生リストからも自動で削除される」
  const { lists, 落とした } = 掃除する(s.lists);
  if (落とした) { s.lists = lists; await 設定を書く(s); }
  return { lists, 落とした };
});

ipcMain.handle('lists:create', async (_e, name) => {
  const s = await 設定を読む();
  s.lists.push({ id: 新しいID(), name: String(name || '新しい再生リスト').slice(0, 80), tracks: [] });
  await 設定を書く(s);
  return s.lists;
});

/** 再生リストごと消す。確認は画面側で出す（指示書: 確認ダイアログを出す） */
ipcMain.handle('lists:remove', async (_e, id) => {
  const s = await 設定を読む();
  s.lists = s.lists.filter((l) => l.id !== id);
  await 設定を書く(s);
  return s.lists;
});

ipcMain.handle('lists:rename', async (_e, id, name) => {
  const s = await 設定を読む();
  const l = s.lists.find((x) => x.id === id);
  if (l) l.name = String(name || l.name).slice(0, 80);
  await 設定を書く(s);
  return s.lists;
});

/** まとめて追加。**重複を潰さない**（指示書: 同じ曲を複数回追加できる） */
ipcMain.handle('lists:add', async (_e, id, paths) => {
  const s = await 設定を読む();
  const l = s.lists.find((x) => x.id === id);
  if (l && Array.isArray(paths)) l.tracks.push(...paths.filter((p) => typeof p === 'string'));
  await 設定を書く(s);
  return s.lists;
});

/** 中身を丸ごと入れ替える（並べ替え・1曲外す は画面側で並びを作ってここへ渡す） */
ipcMain.handle('lists:setTracks', async (_e, id, paths) => {
  const s = await 設定を読む();
  const l = s.lists.find((x) => x.id === id);
  if (l && Array.isArray(paths)) l.tracks = paths.filter((p) => typeof p === 'string');
  await 設定を書く(s);
  return s.lists;
});

/** m3u で書き出す（他のプレイヤーでも開ける形式） */
/**
 * 一本ぶんの曲を、フォルダへコピーする（スマホへ持ち出す用）。
 *
 * ■ 本人の希望（2026-08-30）
 *   > プレイリストに紐づいたデータだけ同期できないかな？
 *
 * ★やらないこと:
 *   ・元のファイルを触らない（**コピーするだけ**。移動も削除もしない）
 *   ・持ち出し先にある知らないファイルを消さない
 *     （置き場を間違えて指されたときに、消してしまうほうが怖い。
 *      残っているものは数えて画面に出し、消すかどうかは本人が決める）
 *
 * ★曲名の頭に番号を付ける。m3u を読まないプレイヤーでも並び順どおりに鳴る。
 * ★1 曲ごとに息継ぎする。139 MB のコピー中に画面が固まらないように
 *   （走査で踏んだのと同じ。本体が詰まるとキー入力が届かない）。
 */
ipcMain.handle('lists:exportFolder', async (e, id, 曲情報) => {
  const s = await 設定を読む();
  const l = s.lists.find((x) => x.id === id);
  if (!l) return { ok: false, error: '再生リストが見つかりません' };
  if (!l.tracks.length) return { ok: false, error: 'この再生リストは空です' };

  const r = await dialog.showOpenDialog({
    title: 'スマホへ持ち出す先を選ぶ（この中にフォルダを作ります）',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };

  /*
   * ★曲名と演者は、画面の言い値だけに頼らない。
   * 一覧に出ていない曲（走査の途中・絞り込みの外）は画面が知らないので、
   * **覚え書きからも引く。** 引けないと 01 - a_song.mp3 のような
   * ファイル名そのままになり、スマホで誰の何か分からなくなる（実測で踏んだ）。
   */
  const 表 = new Map(Array.isArray(曲情報) ? 曲情報.map((t) => [t.path, t]) : []);
  const 覚え = await 覚え書きを読む();
  for (const 道 of l.tracks) {
    if (表.has(道)) continue;
    const v = 覚え[道];
    if (v && v.track) 表.set(道, v.track);
  }

  const 先 = path.join(r.filePaths[0], 'Otogura_' + 名前を安全に(l.name, 60));
  try {
    await fs.mkdir(先, { recursive: true });
  } catch (err) {
    return { ok: false, error: '持ち出す先を作れませんでした（' + ((err && err.message) || '不明') + '）' };
  }

  const 送る = (種, 値) => { try { e.sender.send(種, 値); } catch { /* 窓が閉じた */ } };
  const 息継ぎ = () => new Promise((res) => setImmediate(res));

  const 並び = [];
  const 見つからない = [];
  const 運べなかった = [];
  let 運んだ = 0;
  let 大きさ = 0;

  for (let i = 0; i < l.tracks.length; i += 1) {
    const 道 = l.tracks[i];
    const t = 表.get(道) || {};
    const 拡張 = path.extname(道) || '.mp3';
    const 番 = String(i + 1).padStart(2, '0');
    const 元名 = [t.artist, t.title].filter(Boolean).join(' - ') || path.basename(道, 拡張);
    const 名前 = `${番} - ${名前を安全に(元名, 70)}${拡張}`;

    try {
      const st = await fs.stat(道);
      await fs.copyFile(道, path.join(先, 名前));
      大きさ += st.size;
      運んだ += 1;
      並び.push({ 名前, artist: t.artist, title: t.title, duration: t.duration });
    } catch (err) {
      if (err && err.code === 'ENOENT') 見つからない.push(道);
      else 運べなかった.push(path.basename(道) + '（' + ((err && err.message) || '不明') + '）');
    }

    送る('export:progress', { 済み: i + 1, 全体: l.tracks.length, 大きさ });
    // ★1 曲ごとに順番を譲る。詰めると、コピー中ずっと画面が固まる
    await 息継ぎ();
  }

  if (!並び.length) {
    return { ok: false, error: '運べる曲がありませんでした', 見つからない: 見つからない.length };
  }

  /*
   * ★m3u の名前も、音蔵で付けた名前にする（2026-08-30 本人の希望）。
   * playlist.m3u のままだと、スマホで取り込んだときに
   * **どれも「playlist」という名前**になって見分けがつかない。
   */
  const 題ファイル = 名前を安全に(l.name, 60) + '.m3u';
  try {
    await fs.writeFile(path.join(先, 題ファイル), 持ち出すm3u(並び, l.name), 'utf8');
  } catch (err) {
    return { ok: false, error: '並び順の書き出しに失敗しました（' + ((err && err.message) || '不明') + '）' };
  }

  /*
   * ★前に置いたぶんが残っていないか数える。**消さない。**
   * 置き場を間違えて指されたときに消してしまうほうが怖い。
   */
  let 余り = 0;
  try {
    const 置いた = new Set(並び.map((x) => x.名前).concat([題ファイル]));
    for (const 名 of await fs.readdir(先)) if (!置いた.has(名)) 余り += 1;
  } catch { /* 数えられなくても、運んだことは変わらない */ }

  return {
    ok: true, 先, 運んだ, 大きさ, 余り, 題ファイル,
    見つからない: 見つからない.length,
    運べなかった,
  };
});

ipcMain.handle('lists:exportM3u', async (_e, id, 曲情報) => {
  const s = await 設定を読む();
  const l = s.lists.find((x) => x.id === id);
  if (!l) return { ok: false, error: '再生リストが見つかりません' };

  const r = await dialog.showSaveDialog({
    title: '再生リストを保存',
    defaultPath: `${l.name}.m3u`,
    filters: [{ name: 'プレイリスト', extensions: ['m3u'] }],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };

  const 表 = new Map(Array.isArray(曲情報) ? 曲情報.map((t) => [t.path, t]) : []);
  await fs.writeFile(r.filePath, m3uにする(l.tracks, 表), 'utf8');
  return { ok: true, path: r.filePath };
});

/** m3u を読み込んで、新しい再生リストにする */
ipcMain.handle('lists:importM3u', async () => {
  const r = await dialog.showOpenDialog({
    title: '再生リストを読み込む',
    filters: [{ name: 'プレイリスト', extensions: ['m3u', 'm3u8'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return null;

  const file = r.filePaths[0];
  const text = await fs.readFile(file, 'utf8');
  const paths = m3uを読む(text, path.dirname(file));

  const s = await 設定を読む();
  s.lists.push({ id: 新しいID(), name: path.basename(file, path.extname(file)), tracks: paths });
  await 設定を書く(s);
  return s.lists;
});

/* ── 再生回数 ───────────────────────────────────────────
   ★何を「1回」と数えるか（指示書に無いので決めた）
   **曲の半分まで聴いたら1回。** 押して飛ばしただけでは増やさない。
   ここを「押したら1回」にすると、選曲のために飛ばした曲まで
   「よく聴く曲」になり、シャッフルの狙い（忘れている曲を拾う）が崩れる。 */

ipcMain.handle('plays:get', async () => (await 設定を読む()).plays);

ipcMain.handle('plays:bump', async (_e, filePath) => {
  const s = await 設定を読む();
  s.plays[filePath] = (s.plays[filePath] ?? 0) + 1;
  await 設定を書く(s);
  return s.plays;
});

/* ── タグの編集 ─────────────────────────────────────────
   ★このアプリで唯一、利用者のファイルそのものを書き換えるところ。
   本人の依頼（2026-08-24）。壊さないための決まりは src/tags.js に書いてある。 */

ipcMain.handle('tags:write', async (_e, filePath, 変更) => {
  if (typeof filePath !== 'string' || !変更 || typeof 変更 !== 'object') {
    return { ok: false, error: '指定が正しくありません' };
  }
  const r = await タグを書く(filePath, 変更);
  if (!r || !r.ok) return r;

  /*
   * ★手で直したら、その欄の手直しは外す（2026-08-30 本人の報告）。
   *
   *   > ジャンルをまとめたタブの中でタグ編集をすると反映されなかった
   *   > （ジャンル名無しを変更しました）
   *
   * 「ジャンル名無し」の曲には AI で埋めた手直しが載っている。
   * 外さないと、**重ねる層のほうが勝ち続けて手の直しが消える。**
   * mp3 も覚え書きも新しい値なのに、画面だけ古いまま ―― がこれだった。
   *
   * ★手のほうが新しく、意図もはっきりしている。手が勝つ。
   * ★外すのは**書いた欄だけ**。ほかの欄の手直しは残す。
   */
  try {
    const 欄たち = Object.keys(変更).filter((k) => ['genre', 'artist', 'album', 'title'].includes(k));
    if (欄たち.length) {
      const 前 = await 手直しを読む();
      const { 手直し: 後, 外した } = naoshi.手直しから外す(前, filePath, 欄たち);
      if (外した.length) {
        await 手直しを書く(後);
        手直しの控え = 後;
        return { ...r, 手直しを外した: 外した };
      }
    }
  } catch (e) {
    /* ★黙らせない。タグは書けているので、そのことも一緒に返す */
    return { ...r, 手直しの外し方: 'だめでした: ' + ((e && e.message) || '不明') };
  }
  return r;
});

/* ── 音量そろえ ─────────────────────────────────────────
   曲ごとの音の大きさを測って覚えておく。測るのは初回再生のときだけ。
   波形の取り込みは画面側（Web Audio）が行うので、ここは
   「ファイルの中身を渡す」ことと「測った結果を覚える」ことだけを担う。 */

/**
 * 測るために、ファイルの中身をそのまま渡す（再生とは別経路）。
 *
 * ★上限を超えるファイルは、**読まずに大きさだけ返す**（2026-08-28）。
 * .wav を拾うようにしたら、最大 1,095 MB のファイルが対象に入った。
 * 画面側で「大きいから測らない」と判断するにしても、
 * **ここで読んでから捨てたのでは、1 GB を IPC で運ぶ手間がそのまま残る**
 * （実測: 読み込みだけで 13.0 秒）。だから stat で先に見て、断る。
 *
 * @returns { bytes } 渡せたとき ／ { 大きすぎる: バイト数 } ／ null（読めない）
 */
ipcMain.handle('audio:bytes', async (_e, filePath, 上限) => {
  try {
    if (Number.isFinite(上限) && 上限 > 0) {
      const st = await fs.stat(filePath);
      if (st.size > 上限) return { 大きすぎる: st.size };
    }
    const buf = await fs.readFile(filePath);
    return { bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch {
    return null;                                  // 読めなければ測らない（再生は止めない）
  }
});

ipcMain.handle('gains:get', async () => (await 設定を読む()).gains);

ipcMain.handle('gains:set', async (_e, filePath, 倍率) => {
  if (typeof filePath !== 'string' || !Number.isFinite(倍率)) return null;
  const s = await 設定を読む();
  s.gains[filePath] = 倍率;
  await 設定を書く(s);
  return s.gains;
});

/* 一覧の列幅。長い曲名で表がはみ出したので幅を決められるようにした（2026-08-24） */

ipcMain.handle('widths:get', async () => (await 設定を読む()).widths);

ipcMain.handle('widths:set', async (_e, 幅) => {
  if (!幅 || typeof 幅 !== 'object') return null;
  const s = await 設定を読む();
  s.widths = { ...s.widths, ...幅 };
  await 設定を書く(s);
  return s.widths;
});
