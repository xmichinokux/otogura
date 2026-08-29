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

const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
/*
 * ★目印 を忘れずに入れること（2026-08-25 実地）。
 * これが抜けていたせいで track:reread の中が ReferenceError で落ち、
 * **タグを直しても覚え書きが更新されず、立ち上げ直すと元に戻っていた。**
 * 下の catch が console.warn で握りつぶしていたので、画面には何も出なかった。
 */
const { scanLibrary, アートワークを読む, readTags, 目印 } = require('./library');
const { 掃除する, m3uにする, m3uを読む } = require('./playlists');
const { タグを書く } = require('./tags');
const { おすすめを聞く, プレイリストを作らせる, 候補の数, 作る曲数 } = require('./ai');   // 一覧は画面側が作る（見える曲だけを対象にするため）

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

const 既定の設定 = { folders: [], hidden: [], lists: [], plays: {}, gains: {}, widths: {}, volume: 1, タグ無しを隠す: true, シャッフル除外: [] };

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
    };
  } catch {
    return { ...既定の設定 };
  }
}

async function 設定を書く(v) {
  await fs.mkdir(path.dirname(設定ファイル()), { recursive: true });
  await fs.writeFile(設定ファイル(), JSON.stringify(v, null, 2), 'utf8');
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
  return おすすめを聞く({
    キー,
    気分: 手がかり && 手がかり.気分,
    ジャンル一覧: 手がかり && 手がかり.ジャンル一覧,
    年一覧: (手がかり && 手がかり.年一覧) || [],
  });
});

/** 何曲渡して何曲作らせるか。画面が候補を選ぶのに使う */
ipcMain.handle('ai:sizes', async () => ({ 候補の数, 作る曲数 }));

/** @param 手がかり { 気分, 候補 } ―― 候補は画面が 200 曲だけ選んで渡す */
ipcMain.handle('ai:playlist', async (_e, 手がかり) => {
  const キー = await キーを読む();
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  return プレイリストを作らせる({
    キー,
    気分: 手がかり && 手がかり.気分,
    候補: 手がかり && 手がかり.候補,
  });
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
ipcMain.handle('library:cached', async () => {
  const s = await 設定を読む();
  const 覚え = await 覚え書きを読む();
  const 隠す = new Set(s.hidden);
  const tracks = [];
  for (const [p, v] of Object.entries(覚え)) {
    if (隠す.has(p)) continue;
    // ★曲でないもの（macOS の付随ファイル）は出さない。走査を待たずに効かせる
    if (p.replace(/^.*[\\/]/, '').startsWith('._')) continue;
    if (v && v.track) tracks.push(v.track);
  }
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
ipcMain.handle('scan', async (e) => {
  const s = await 設定を読む();
  const 覚え = await 覚え書きを読む();
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
  );

  const 保存 = await 覚え書きを書く(r.覚え書き);

  // ★走査のたびに再生リストも掃除する。
  // 起動時だけだと、アプリを開いたまま MP3 を消したときに保存データが古いまま残る
  // （指示書の『先に確かめたほうがいいこと』が、まさにこのズレを警告していた）
  const 掃除 = 掃除する(s.lists);
  if (掃除.落とした) { s.lists = 掃除.lists; await 設定を書く(s); }

  return {
    tracks: r.tracks, 見つかった: r.found, 読めなかった: r.unreadable, hidden: r.hidden,
    使い回し: r.使い回し,
    lists: 掃除.lists, リストから落とした: 掃除.落とした,
    // ★覚え書きを残せなかったら、その理由も返す。黙って捨てない
    覚え書きの保存: 保存,
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
  return タグを書く(filePath, 変更);
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
