'use strict';

/**
 * 画面側。
 *
 * ■ 指示書で決まっていること
 * ・上の3カラムは絞り込み、下が実際に再生する曲一覧（本人の回答: C）
 * ・削除は一覧から外すだけ。ファイルは消さない（本人の回答: B）
 * ・大文字小文字を区別せず、まとめて並べる
 * ・並び順の既定はファイル名順（A-Z）
 *   → ★本人の判断で 2 回変えている。いまは**アーティスト順**
 *     （ファイル名順 → 曲名順 2026-08-24 → アーティスト順 2026-08-25）
 * ・再生状態は保存しない（次回起動時に復元しない）
 */

const $ = (id) => document.getElementById(id);
const audio = $('audio');

/*
 * ★エラーを画面に出す。
 *
 * 2026-08-25 の実地で、不具合の原因を 3 回推測して 1 回外した。
 * 画面側で例外が出ても**どこにも出ないので、押した人には
 * 「ボタンが反応しない」としか見えない。**
 * 原因を当てにいく前に、まず見えるようにする。
 *
 * （このアプリ自身が「黙って失敗しない」を掲げているのに、
 *   画面側だけ黙っていた。）
 */
function 不具合を出す(何が, e) {
  const 文 = e && e.message ? e.message : String(e);
  try {
    const s = document.getElementById('status');
    if (s) s.textContent = `⚠ ${何が}でエラー: ${文}`;
  } catch { /* 画面すら出せないときは、下の console に残る */ }
  console.error(`[${何が}]`, e);
}
window.addEventListener('error', (e) => 不具合を出す('画面', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => 不具合を出す('処理', e.reason));

/** 全曲。走査のたびに入れ替わる */
let tracks = [];
/** タグの無い曲を隠すか。バンドの試作品を出さないため（設定で覚える） */
let タグ無しを隠す = true;
/** 音量 0〜1。★覚えないと、開くたびに大音量から始まる */
let 音量 = 1;
/** 絞り込みの選択。null = 指定なし */
/*
 * 3 カラムで選んでいるもの。**null = すべて**、それ以外は選んだ名前の集合。
 *
 * ■ ★1 つだけ → 複数に変えた（2026-08-29 本人の希望）
 *   > シャッフルの対象範囲の指定と、シャッフルの対象にしたくないものの指定をしたい
 *   > 3カラム部分をctrlやshiftを押しながらクリックすることで複数選べるようにできないかな
 *
 * 絞り込みは 絞る() の 1 か所に集まっているので、ここを集合にすれば
 * **下の一覧も、シャッフルの対象も、次の曲も、まとめてついてくる。**
 *
 * ★中身は小文字にして持つ。列の見出しは「The Beatles / the beatles」を
 * まとめて 1 つに見せているので（まとめる()）、選んだかどうかも同じ規則で見る。
 * ここを厳密比較にすると「まとめて出したのに、選ぶと片方しか出ない」が起きる。
 *
 * ★空集合は作らない。最後の 1 つを外したら null（すべて）に戻す。
 * 空のまま残すと、下の一覧が 0 件になって「壊れた」ようにしか見えない。
 */
let sel = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null };

/*
 * 3 カラムに何を出すか（2026-08-29 本人の希望）。
 *   > 「日付」タブみたいなものを用意して年、月、日を選べる感じで。
 *   > そこでタブを切り替えて選べる、みたいな感じで。
 *
 * ★切り替えても、**前のタブの絞り込みは残す**（本人の選択）。
 * 「ジャンル=Hardcore」を選んでから日付タブで「2015 年」を選ぶと、
 * その掛け合わせになる。絞り込みは 絞る() 一か所に集まっているので、
 * 両方を重ねるだけで済む。
 * ★残す以上、**隠れている側に絞り込みがあることをタブに出す**。
 * 出さないと「なぜこれしか出ないのか」が分からなくなる。
 */
let カラムタブ = 'tag';                                // 'tag' | 'date'

/** 年月日を、そのタブの列に出す文字にする。日付が無ければ null */
const 年月日 = {
  年: (t) => (t.更新日時 > 0 ? String(new Date(t.更新日時).getFullYear()) : null),
  月: (t) => (t.更新日時 > 0 ? 日付(t.更新日時).slice(0, 7) : null),
  日: (t) => (t.更新日時 > 0 ? 日付(t.更新日時) : null),
};

/** タブごとの列の並び（左から） */
const カラムタブの列 = {
  tag: [
    { key: 'genre', 見出し: 'ジャンル', 取る: (t) => t.genre },
    { key: 'artist', 見出し: 'アーティスト', 取る: (t) => t.artist },
    { key: 'album', 見出し: 'アルバム', 取る: (t) => t.album },
  ],
  date: [
    { key: '年', 見出し: '年', 取る: 年月日.年, 新しい順: true },
    { key: '月', 見出し: '月', 取る: 年月日.月, 新しい順: true },
    { key: '日', 見出し: '日', 取る: 年月日.日, 新しい順: true },
  ],
};

/** 小文字にして比べる（列のまとめ方と同じ規則） */
const 小文字 = (v) => String(v).toLocaleLowerCase('ja');

/*
 * シャッフルに入れない曲（本人の希望 2026-08-29）。
 *
 * ★「一覧から外す」とは別物。混ぜないこと。
 *   一覧から外す   … 一覧に出ない。押せない。走査でも省く
 *   シャッフル除外 … **一覧に出る。押せば鳴る。** くじに入らないだけ
 *
 * 「聴きたくない曲」ではなく「不意に流れてほしくない曲」のための仕組み。
 * 消すのではないので、設定に覚えておく（アプリを閉じても残る）。
 */
let シャッフル除外 = new Set();

/** Shift の範囲選択で使う、直前に押した位置（列ごと） */
let 列の起点 = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null };
/** いま列に出している並び（Shift の範囲を数えるのに使う） */
let 列の並び = { genre: [], artist: [], album: [], 年: [], 月: [], 日: [] };
/** いま再生している曲の path */
let nowPath = null;
/** 再生リスト。{ id, name, tracks: string[] } */
let lists = [];
/** いま開いている再生リストの id。null = ライブラリ */
let 開いているID = null;
/** ライブラリでチェックした曲（まとめて再生リストに追加する用） */
const 選択中 = new Set();
/** 名前を入れている最中か。{ mode: 'new'|'rename', id, value } */
let 名前入力 = null;
/** タグを直している最中か。{ 対象: string[], 値: {genre,artist,album} } */
let タグ編集 = null;
/** ドラッグ中に掴んでいる行の位置。null = 掴んでいない */
let 掴んでいる = null;
/** 並べ替えた直後に click が飛んでくるのを無視するための札 */
let 並べ替えた直後 = false;

/* ── 再生の続き方（本人の指定 2026-08-24）───────────────────
   1. 曲が終わったら**次へ進む**
   2. 最後まで行ったら**止まる**
   3. 繰り返し … しない / 1曲 / 全体
   4. シャッフル … **再生回数が少ない曲を選びやすく**（src/shuffle.js） */

/** 'none' | 'one' | 'all' */
let 繰り返し = 'none';
let シャッフル = false;
/** 再生回数 { パス: 回数 } */
let 再生回数 = {};
/*
 * ★「いま流している並び」を覚えるのをやめた（2026-08-29。本人の希望）。
 *
 * もとは曲を押した時点の一覧を 流している列 に覚えていた。
 * 理由は「再生中に絞り込みを変えると次の曲が変わってしまうから」。
 *
 * だが本人から、**それが困る**と言われた:
 *   > 現在のシャッフルはアーティストやアルバムを選んだ状態で再生したときの
 *   > 中を選んでシャッフルするのですが、全体をシャッフルしたいと思うと
 *   > 一度停止して全体を選びなおさないといけないです。
 *   > そこで、シャッフルの対象は下のカラムに表示されてる曲のリストに
 *   > できないかな？と思いました。
 *
 * つまり「変わってしまう」ではなく「**変えられる**」ほうが欲しかった。
 * 3 カラムで絞れば、そのまま次からそこが対象になる。止めなくていい。
 *
 * ★覚えるのをやめたので、代わりに いまの列() をその都度呼ぶ。
 * 絞り込みの規則は 絞る() 一か所に集まっているので、
 * 「一覧に無いのに再生される」は起きない。
 */
/** シャッフルで、この巡に流した曲 */
let 巡 = new Set();
/** この曲の再生回数をもう足したか（半分まで聴いたら1回。二重に数えない） */
let 数えた = false;

/* ── 並び順 ─────────────────────────────────────────────
   指示書:「大文字小文字を区別せず、まとめて並べる」
   3カラムと曲一覧で同じ規則を使う（どこかだけ違うと分からなくなる）*/
const 照合 = new Intl.Collator('ja', { sensitivity: 'base', numeric: true });
const 名前で並べる = (a, b) => 照合.compare(a, b);

/** ファイル名（パスの末尾）で並べる。指示書の既定 */
const ファイル名 = (t) => t.path.replace(/^.*[\\/]/, '');

/**
 * 一覧の並び順。
 *
 * ★既定は「アーティスト順」（2026-08-25 に変更。本人の希望）。
 *   > 下のカラムの曲の並びのデフォルトをアーティスト欄を選択にしたいです。
 *   > 今は曲順なのでアーティストがバラバラなので。
 *
 * ここまでの経緯:
 *   ファイル名順（指示書の既定）
 *   → 曲名順（見出しが「曲名」なのに中身がファイル名順で分かりにくかった）
 *   → アーティスト順（同じ人の曲が離れて並ぶのが使いにくかった）
 *
 * 見出しを押すと 曲名 / アーティスト / アルバム / 再生 で並べ替え。もう一度で逆順。
 *
 * ★再生リストには効かせない。
 * 指示書で「再生リスト内は利用者が手で並べ替える」と決まっているので、
 * ここで並べ替えると、手で並べた順が消えてしまう。
 */
let 並び = { key: 'artist', 逆: false };

const 並びの取り出し = {
  title: (t) => t.title,
  artist: (t) => t.artist,
  album: (t) => t.album,
  // 再生回数は数として比べる。文字として比べると 10 が 2 より前に来る
  plays: (t) => 再生回数[t.path] ?? 0,
  /*
   * ★日付（2026-08-29 本人の希望）。
   *   > 音楽データを生成日の新しい順に並べることってできますか？
   *
   * 中身はファイルの**更新日時**。実測で、これがいちばん実態に合っていた
   * （作成日時はコピーした日に上書きされて全部同じ。くわしくは library.js）。
   * ★日付の無い曲は 0 にして、新しい順のときに**いちばん下**へ回す。
   */
  date: (t) => t.更新日時 ?? 0,
};

/**
 * 同じ値だったときに、次に何で比べるか。
 *
 * ★アーティスト順にするだけでは足りない（2026-08-25）。
 * 同じ人の曲が集まっても、その中がアルバムばらばらの曲名順では読みにくい。
 * **アーティスト → アルバム → 曲番号** まで揃えて、やっと一枚ずつ並ぶ。
 *
 * 曲番号の無い曲は最後に回す（先頭に固まると、番号のある曲が押し出される）。
 */
const 曲番号 = (t) => (typeof t.track === 'number' ? t.track : Number.MAX_SAFE_INTEGER);
const 次に比べるもの = {
  artist: [(t) => t.album, 曲番号, (t) => t.title],
  album: [曲番号, (t) => t.title, (t) => t.artist],
  title: [(t) => t.artist, (t) => t.album],
  plays: [(t) => t.artist, (t) => t.album, 曲番号, (t) => t.title],
  // 同じ日に入れたものは、まとめて 1 枚ずつ並ぶようにする
  date: [(t) => t.artist, (t) => t.album, 曲番号, (t) => t.title],
};

/** 2 つの値を比べる。数どうしは数として、それ以外は名前として */
function 比べる(x, y) {
  return (typeof x === 'number' && typeof y === 'number')
    ? x - y
    : 照合.compare(String(x), String(y));
}

function 曲を並べる(a, b) {
  const 取る = 並びの取り出し[並び.key] ?? ((t) => t.title);
  let r = 比べる(取る(a), 取る(b));
  // 同じ値のときは、決めた順に次の手がかりで比べる
  if (r === 0) {
    for (const 次 of (次に比べるもの[並び.key] ?? [])) {
      r = 比べる(次(a), 次(b));
      if (r !== 0) break;
    }
  }
  // それでも同じなら、いつも同じ順に落ち着くようパスで決める
  if (r === 0) r = 照合.compare(a.path, b.path);
  return 並び.逆 ? -r : r;
}

/**
 * 日付の見せ方。分からないときは「—」。
 * ★時刻までは出さない。列が広くなるだけで、探すときに使うのは日付まで。
 */
const 日付 = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  const 二桁 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${二桁(d.getMonth() + 1)}-${二桁(d.getDate())}`;
};

const 時間 = (sec) => {
  if (!Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

/* ── 絞り込み ─────────────────────────────────────────── */

/**
 * 選択に合う曲。level より手前の選択だけを使う（列ごとの候補を出すため）。
 *
 * ★3カラムは ジャンル → アーティスト → アルバム（2026-08-24 に変更）。
 * 以前は右端が「曲」だったが、下の一覧にも曲名が並ぶので重複していた。
 * 上は絞り込みだけを担い、曲を選ぶのは下の一覧、という役割分担にした。
 */
/**
 * 表に出す曲。
 *
 * ★絞り込みの入口をここ 1 つにする。
 * 一覧・3 カラム・シャッフル・次の曲が、**全部ここを通る。**
 * 二か所で絞ると必ずずれる（「一覧に無いのに再生される」が起きる）。
 *
 * タグ無しを隠す理由（本人・2026-08-25）:
 * > バンドで作った曲の試作品が混ざっていて、それを再生したくない
 */
function 見える曲() {
  return タグ無しを隠す ? tracks.filter((t) => t.タグあり) : tracks;
}

/**
 * ある曲が、そのタブの「左から n 列ぶん」の選択に合うか。
 *
 * ★列でまとめたのと同じ規則で見る（小文字にして比べる）。
 * 厳密比較にすると「まとめて表示したのに、選ぶと片方しか出ない」ことになる。
 */
function タブに合う(t, タブ名, n) {
  const 列 = カラムタブの列[タブ名];
  for (let i = 0; i < n && i < 列.length; i += 1) {
    const 選 = sel[列[i].key];
    if (!選) continue;                             // すべて
    const v = 列[i].取る(t);
    if (v === null || !選.has(小文字(v))) return false;
  }
  return true;
}

/**
 * 選択に合う曲。level より手前の選択だけを使う（列ごとの候補を出すため）。
 *
 * ★level が効くのは**いま開いているタブだけ**。
 * 隠れているタブは、いつも全部の列を効かせる。
 * こうしないと、タブを切り替えた瞬間に向こうの絞り込みが緩んで、
 * **一覧に出る曲が勝手に増える。**「残す」と言った以上、残らないと嘘になる。
 */
function 絞る(level) {
  const 別 = カラムタブ === 'tag' ? 'date' : 'tag';
  return 見える曲().filter((t) => タブに合う(t, カラムタブ, level) && タブに合う(t, 別, 3));
}

/**
 * 大文字小文字の違いを「同じもの」としてまとめる。
 *
 * ★指示書は「区別せず、**まとめて並べる**」。
 * 並び順だけ揃えても、列には The Beatles と the beatles が別々に出てしまう。
 * 表に出す名前は、そのフォルダで**多く使われているほう**を採る
 * （どちらを見出しにするかは指示書に無いので、数の多いほうという素直な決め方にした）。
 */
function まとめる(値の並び) {
  const 束 = new Map();                       // 小文字にした名前 → { 表示名, 件数 }
  for (const v of 値の並び) {
    const key = v.toLocaleLowerCase('ja');
    const e = 束.get(key) ?? { 候補: new Map() };
    e.候補.set(v, (e.候補.get(v) ?? 0) + 1);
    束.set(key, e);
  }
  return [...束.values()]
    .map((e) => [...e.候補.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .sort(名前で並べる);
}


/** そのタブで、いくつ選んでいるか（0 なら絞っていない） */
function カラムタブの選択数(タブ名) {
  return カラムタブの列[タブ名].reduce((n, 列) => n + (sel[列.key] ? sel[列.key].size : 0), 0);
}

/**
 * 3 カラムの中身を切り替えるタブ。
 *
 * ★隠れている側に絞り込みが残っていたら、そのタブに件数を出す。
 * 「残す」と決めた以上、**見えないところで効いている絞り込み**ができる。
 * 出さないと「なぜこれしか出ないのか」が分からなくなる。
 */
function カラムタブを描く() {
  const box = $('coltabs');
  box.innerHTML = '';
  for (const [名, 表示] of [['tag', 'ジャンル / アーティスト / アルバム'], ['date', '日付（年 / 月 / 日）']]) {
    const b = document.createElement('button');
    b.textContent = 表示;
    b.className = カラムタブ === 名 ? 'on' : '';
    const 数 = カラムタブの選択数(名);
    if (数 && カラムタブ !== 名) {
      const m = document.createElement('span');
      m.className = 'mark';
      m.textContent = `● ${数}`;
      b.appendChild(m);
      b.title = `このタブで ${数} 個選んだままです（絞り込みは効いています）`;
    }
    b.onclick = () => { カラムタブ = 名; 描き直す(); };
    box.appendChild(b);
  }
}

function 列を描く(ulId, level, 定義) {
  const { key, 取る: 値を取る } = 定義;
  const 選択中 = sel[key];
  const ul = $(ulId);
  ul.innerHTML = '';
  /*
   * ★null を落としてから、まとめる に渡す。
   * 日付タブは、日付の分からない曲で null を返す。
   * 落とさないと まとめる の中で小文字にしようとして落ちる。
   */
  const 素材 = 絞る(level).map(値を取る).filter((v) => v !== null && v !== undefined && v !== '');
  const 全部 = まとめる(素材);
  // ★日付の列は新しい順。古い順に並べても、探したいのはたいてい最近のもの
  if (定義.新しい順) 全部.reverse();

  // 打ち込んだ字で絞る（大文字小文字は区別しない）
  const 語 = (列の絞り[key] || '').trim().toLocaleLowerCase('ja');
  const 一覧 = 語 ? 全部.filter((v) => v.toLocaleLowerCase('ja').includes(語)) : 全部;

  /*
   * ★件数が多い列にだけ、探す欄を出す（少ない列に出すと邪魔）。
   * 上限（10,000）とは別の数字。**全部出せていても、
   * 5,000 件を目で追うのは無理**なので、探す手立ては早めに出す。
   */
  if (全部.length > 200 || 語) 列の絞りを作る(ul, key, 全部.length);

  const すべて = document.createElement('li');
  const 選んだ数 = 選択中 ? 選択中.size : 0;
  すべて.textContent = 語 ? `合うもの（${一覧.length}）` : `すべて（${一覧.length}）`;
  // ★何個選んでいるかを出す。複数選べるようにすると、見ないと分からなくなる
  if (選んだ数) すべて.textContent += `　― ${選んだ数} 個を選択中`;
  すべて.className = 選択中 === null ? 'on' : '';
  すべて.onclick = () => 選ぶ(level, null);
  ul.appendChild(すべて);

  /*
   * ★上限は 300 → 10,000 に上げた（2026-08-25。**測らずに決めたのが間違いだった**）。
   *
   * 実地の指摘:
   * > カラムを全て「すべて」にしているのに、. と数字のアーティストしか出ない
   *
   * 名前順に並べた先頭 300 件が記号と数字なので、そこで切れていた。
   * **300 件では、列として使いものにならない。**
   *
   * 実測（1 列あたりの件数 ×3 列を描く時間）:
   *      300 件 →   20 ms
   *    6,000 件 →  251 ms   ← 本人のアーティスト 5,672 件はここ
   *   10,000 件 →  396 ms
   *   30,000 件 → 1,149 ms  ← ここまで来ると引っかかる
   *
   * 落ちた原因は列ではなく、曲一覧（170,000 行）とアートワークだった。
   * 列は中身が軽いので、10,000 件までは待てる範囲。
   */
  const 上限 = 10000;
  // ★Shift の範囲は「いま見えている並び」で数える。
  //   打ち込んで絞ったあとなら、その絞った並びの中での範囲になる。
  列の並び[key] = 一覧.slice(0, 上限);
  for (const v of 一覧.slice(0, 上限)) {
    const li = document.createElement('li');
    li.textContent = v;
    li.title = v;
    li.className = 選択中 && 選択中.has(小文字(v)) ? 'on' : '';
    li.onclick = (e) => 選ぶ(level, v, e);
    ul.appendChild(li);
  }

  // ★切り捨てたぶんを黙らない
  if (一覧.length > 上限) {
    const li = document.createElement('li');
    li.className = 'more';
    li.textContent = `ほかに ${(一覧.length - 上限).toLocaleString('ja-JP')} 件（上の欄で絞り込んでください）`;
    ul.appendChild(li);
  }
}

/*
 * ★列を文字で絞る。
 *
 * 2026-08-25 実測: アーティスト 5,672 件 / アルバム 7,305 件。
 * 一度に描けるのは 300 件までなので、**打ち込んで探せないと大半に手が届かない。**
 * 上限を上げると固まるので、探す手立てのほうを用意する。
 */
let 列の絞り = { genre: '', artist: '', album: '', 年: '', 月: '', 日: '' };

function 列の絞りを作る(ul, key, 件数) {
  const li = document.createElement('li');
  li.className = 'findrow';                     // ★li で包む（ul の直下に input を置かない）
  const inp = document.createElement('input');
  inp.className = 'colfind';
  inp.placeholder = `${件数.toLocaleString('ja-JP')} 件から探す`;
  inp.value = 列の絞り[key];
  inp.autocomplete = 'off';
  inp.onclick = (e) => e.stopPropagation();     // 行を選んだ扱いにしない
  inp.oninput = () => {
    列の絞り[key] = inp.value;
    /*
     * ★打つたびに描き直すので、**焦点を戻さないと 1 文字しか打てない。**
     * 同じ間違いを、タグ編集の欄で 3 回踏んだ。
     * 描き直しで要素は作り直されるが、ul そのものは同じなので、
     * その中から新しい入力欄を探して焦点を戻す。
     */
    描き直す();
    const 次 = ul.querySelector('.colfind');
    if (次) { 次.focus(); 次.setSelectionRange(次.value.length, 次.value.length); }
  };
  li.appendChild(inp);
  ul.appendChild(li);
}

/**
 * 列の項目を選ぶ。
 *
 * ・ふつうのクリック … その 1 つだけにする
 * ・Ctrl+クリック    … 1 つずつ足す／外す（**外すのもここ**）
 * ・Shift+クリック   … 直前に押したところからの範囲
 * ・「すべて」       … その列の選択を空にする（＝絞らない）
 *
 * ★上の列を選び直したら、下の選択は外す（今までどおり）。
 * 「ジャンルを 3 つ ＋ そこに無いアーティスト」のような、
 * **実体の無い組み合わせ**が残ると、なぜ 0 件なのか分からなくなる。
 */
function 選ぶ(level, 値, e = null) {
  const 列 = カラムタブの列[カラムタブ];
  const key = 列[level].key;

  let 次 = null;                                 // null = すべて
  if (値 !== null) {
    const 今 = sel[key] ? new Set(sel[key]) : new Set();
    const 並び = 列の並び[key] ?? [];
    const 位置 = 並び.findIndex((v) => 小文字(v) === 小文字(値));

    if (e && e.shiftKey && 列の起点[key] !== null && 位置 >= 0) {
      // 範囲。起点そのものは残したまま、間を足す
      const [a, b] = [列の起点[key], 位置].sort((x, y) => x - y);
      for (const v of 並び.slice(a, b + 1)) 今.add(小文字(v));
    } else if (e && (e.ctrlKey || e.metaKey)) {
      // 1 つずつ足す／外す
      const k = 小文字(値);
      if (今.has(k)) 今.delete(k); else 今.add(k);
      列の起点[key] = 位置;
    } else {
      // ふつうのクリックは、その 1 つだけ
      今.clear();
      今.add(小文字(値));
      列の起点[key] = 位置;
    }
    // ★空集合は作らない。全部外したら「すべて」に戻す
    次 = 今.size ? 今 : null;
  } else {
    列の起点[key] = null;
  }

  /*
   * ★上の列を選び直したら、**そのタブの**下の列だけ外す。
   * 別のタブの選択には触らない（「切り替えても残す」と決めたので）。
   */
  sel = { ...sel, [key]: 次 };
  for (let i = level + 1; i < 列.length; i += 1) {
    sel[列[i].key] = null;
    列の起点[列[i].key] = null;
    列の絞り[列[i].key] = '';
  }
  描き直す();
}

/* ── 列の幅 ─────────────────────────────────────────────
   実地の画面で、長い曲名にひきずられて表が窓からはみ出していた。
   幅を決めたうえで、境目を掴んで変えられるようにする（本人の希望）。 */

const 既定の列幅 = {
  pick: 34, grip: 30, num: 40,
  title: 340, artist: 200, album: 240,
  dur: 64, date: 96, plays: 60, move: 68, act: 90,
};

/** 変えた幅を覚えておく。{ 列id: 画素 } */
let 列幅 = {};

/** 見出しの右端に置く、幅を変えるための取っ手 */
function 幅の取っ手(id, colgroup, 番) {
  const 取っ手 = document.createElement('span');
  取っ手.className = 'resizer';
  取っ手.title = 'ドラッグで幅を変える';

  取っ手.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();                        // 見出しの「並べ替え」を誘発しない
    const 始点 = e.clientX;
    const col = colgroup.children[番];
    const 元幅 = col.getBoundingClientRect
      ? parseFloat(col.style.width) || 120
      : 120;
    document.body.style.cursor = 'col-resize';

    const 動く = (ev) => {
      const 新幅 = Math.max(30, 元幅 + (ev.clientX - 始点));
      col.style.width = `${新幅}px`;
      列幅[id] = 新幅;
    };
    const 離す = async () => {
      document.removeEventListener('mousemove', 動く);
      document.removeEventListener('mouseup', 離す);
      document.body.style.cursor = '';
      await window.mp3.列幅を覚える(列幅);       // 次に開いたときも同じ幅で
    };
    document.addEventListener('mousemove', 動く);
    document.addEventListener('mouseup', 離す);
  };
  return 取っ手;
}


/* ── 3カラムの高さ ─────────────────────────────────────
   ★列の幅は横に掴んで変えられるのに、高さは 240px で固定だった（本人の指摘 2026-08-25）。
   171,085 曲だとアーティストが 5,672 件あるので、列を広く見たい場面が多い。 */

const 既定の高さ = 240;

function 高さを決める(px) {
  // ★下の一覧が潰れないところで止める。全部を列にできると、曲が選べなくなる
  const 上限 = Math.max(120, window.innerHeight - 320);
  const h = Math.max(80, Math.min(上限, px));
  $('cols').style.flexBasis = `${h}px`;
  return h;
}

$('colsizer').onmousedown = (e) => {
  e.preventDefault();
  const 始点 = e.clientY;
  const 元 = $('cols').getBoundingClientRect().height;
  document.body.style.cursor = 'row-resize';
  const 動く = (ev) => 高さを決める(元 + (ev.clientY - 始点));
  const 離す = async () => {
    document.removeEventListener('mousemove', 動く);
    document.removeEventListener('mouseup', 離す);
    document.body.style.cursor = '';
    // 列の幅と同じ入れ物に覚えておく（次に開いたときも同じ高さで）
    列幅.__colsHeight = $('cols').getBoundingClientRect().height;
    await window.mp3.列幅を覚える(列幅);
  };
  document.addEventListener('mousemove', 動く);
  document.addEventListener('mouseup', 離す);
};

/* ── 曲一覧（再生する場所）───────────────────────────── */

/**
 * 一覧を描く。
 * ライブラリを見ているときと、再生リストを見ているときで中身が変わる。
 *
 * ★再生リストは**同じ曲を複数回入れられる**（指示書）ので、
 * 行を見分ける鍵はパスではなく「何番目か」。パスを鍵にすると、
 * 同じ曲が2つ入っているときに片方だけ動かせなくなる。
 */
function 一覧を描く() {
  const リスト = 開いているリスト();
  const tbody = $('tbody');
  tbody.innerHTML = '';

  // 再生リストは並べ替えないでそのまま（指示書: 利用者が手で並べ替える）
  // ★シャッフルや「次の曲」と同じものを使う。ここで別に作ると、
  //   「見えているものと流れるものが違う」が必ず起きる
  const 対象 = いまの列();

  /*
   * ★流せる曲があるなら ▶ を押せるようにする（2026-08-29 実地）。
   *
   * ▶ を押すだけで流し始める作りにしたのに、**ボタンが disabled のままだった。**
   * 有効にしていたのは 再生する() の中だけ ―― つまり
   * **一度曲を押さないと、押して流し始める機能に触れられなかった。**
   * 本人からの報告:
   *   > シャッフルを選択しても再生ボタンがグレーのままなので再生できませんでした
   *
   * ★何か流しているとき（src が付いているとき）は触らない。
   * ここで disabled にすると、**流している最中に止められなくなる**
   * （絞り込みを変えて対象が空になった場合など）。
   * 押したときの分かれ目（$('play').onclick）と同じ条件にしてある。
   */
  if (!audio.getAttribute('src')) {
    $('play').disabled = !対象.some((t) => t.鳴らせる !== false);
  }

  const 何か有る = 見える曲().length > 0;
  $('empty').style.display = 何か有る ? 'none' : 'block';
  $('table').style.display = 何か有る ? '' : 'none';

  // ★見出しも中身に合わせて作る。
  // ライブラリにはチェック欄、再生リストには掴む欄と並べ替え欄があるので、
  // 固定の見出しだと列がずれる（実際に1つぶんずれていた）
  // 列の定義。id は幅を覚えるための鍵
  const 見出し = [
    ...(リスト ? [['grip', '', null, 'grip']] : [['pick', '', null, 'pick']]),
    ['num', '', null, 'num'],
    ['', '曲名', 'title', 'title'],
    ['', 'アーティスト', 'artist', 'artist'],
    ['', 'アルバム', 'album', 'album'],
    ['dur', '長さ', null, 'dur'],
    // ★日付。押すと「新しい順」から始まる（下の 見出しを作る を参照）
    ['date', '日付', 'date', 'date'],
    ['plays', '再生', 'plays', 'plays'],
    ...(リスト ? [['move', '並べ替え', null, 'move']] : []),
    ['act', '', null, 'act'],
  ];

  // ★表の幅を窓に収める。
  // table-layout:auto のままだと、長い曲名にひきずられて表全体が窓からはみ出し、
  // 「長さ」「再生」が画面の外に出ていた（実地の画面で確認）。
  // fixed にして列幅を明示すると、はみ出さず、長い文字は「…」で切れる。
  const table = $('table');
  table.style.tableLayout = 'fixed';
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) { colgroup = document.createElement('colgroup'); table.prepend(colgroup); }
  colgroup.innerHTML = '';
  for (const [, , , id] of 見出し) {
    const col = document.createElement('col');
    col.style.width = `${列幅[id] ?? 既定の列幅[id] ?? 120}px`;
    colgroup.appendChild(col);
  }

  const thead = table.querySelector('thead');
  thead.innerHTML = '';
  const htr = document.createElement('tr');
  見出し.forEach(([cls, label, key, id], 番) => {
    const th = document.createElement('th');
    if (cls) th.className = cls;

    // ★再生リストでは並べ替えない。手で並べた順が消えてしまうので押せなくする
    if (key && !リスト) {
      th.classList.add('sortable');
      th.textContent = label + (並び.key === key ? (並び.逆 ? ' ▼' : ' ▲') : '');
      if (並び.key === key) th.classList.add('sorted');
      th.title = `${label}で並べ替え`;
      th.onclick = () => {
        /*
         * ★日付だけは、最初に押したとき「新しい順」から始める（2026-08-29）。
         * 頼まれたのが「**新しい順**に並べたい」なので、
         * 1 回目に古い順を出して、もう一度押させるのは遠回り。
         */
        const 初手の逆 = key === 'date';
        並び = 並び.key === key ? { key, 逆: !並び.逆 } : { key, 逆: 初手の逆 };
        一覧を描く();
      };
    } else {
      th.textContent = label;
    }

    // 幅を変えられるように、右端に掴む所を置く（最後の列以外）
    if (番 < 見出し.length - 1) th.appendChild(幅の取っ手(id, colgroup, 番));

    htr.appendChild(th);
  });
  thead.appendChild(htr);

  /*
   * ★一度に作る行に上限をかける。
   *
   * 2026-08-25 実測: 本人のライブラリは 171,085 曲。
   * 全部ぶんの <tr> を作ると、**それだけでブラウザが固まる。**
   * アートワークを外して走査は速くなったが、描くほうが残っていた。
   *
   * 絞り込めば普通は数百行なので、上限に当たるのは
   * 「何も絞らずライブラリ全体を見たとき」だけ。
   * ★当たったときは黙らない。下に「あと何曲あるか」を出す。
   */
  /*
   * ★500 → 2,000 に上げた（2026-08-25。こちらも測って決め直した）。
   *
   * 実測（8 列の行を描く時間）:
   *      500 行 →    39 ms
   *    2,000 行 →   146 ms   ← ここにした
   *    5,000 行 →   396 ms
   *   20,000 行 → 1,405 ms
   *   85,000 行 → 5,915 ms   ← ここは無理
   *
   * アルバムやアーティストで絞れば普通は数十行なので、
   * 2,000 なら**実際に当たる場面がほとんど無い。**
   */
  const 一度に描く上限 = 2000;
  const 描く分 = 対象.slice(0, 一度に描く上限);

  描く分.forEach((t, i) => {
    const tr = document.createElement('tr');
    if (t.path === nowPath) tr.className = 'playing';
    /*
     * ★シャッフルから外してある曲は、見て分かるようにする（2026-08-29）。
     * 印が無いと、なぜ流れてこないのかが分からない。**黙って外さない。**
     * 薄くするだけにして、押せることは見た目でも分かるようにしておく。
     */
    if (シャッフル除外.has(t.path)) tr.classList.add('skip');
    // ★ダブルクリックだけだと、押せる場所が見えない（実地で「再生する導線が無い」と言われた）。
    // 1回のクリックでも鳴るようにし、行頭に ▶ も出す。
    // ただし**掴んで並べ替えた直後は鳴らさない**（並べ替えるたびに曲が変わってしまう）
    // シングルクリックで再生する。ダブルクリック用の処理は置かない
    // （置くと2回 play() が走り、1回目が中断されてエラー表示が出る）
    tr.onclick = () => { if (!並べ替えた直後) 再生する(t); };
    tr.style.cursor = 'pointer';

    const td = (cls, text) => {
      const e = document.createElement('td');
      if (cls) e.className = cls;
      e.textContent = text;
      e.title = text;
      return e;
    };

    // 再生リストでは、掴んで並べ替えられる（本人の希望: ドラッグ＆ドロップ）
    if (リスト) {
      const grip = document.createElement('td');
      grip.className = 'grip';
      grip.textContent = '⠿';
      grip.title = 'ドラッグして並べ替え';
      tr.appendChild(grip);

      tr.draggable = true;
      tr.classList.add('pl-row');
      tr.dataset.index = String(i);

      tr.ondragstart = (e) => {
        掴んでいる = i;
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox は何か入れないとドラッグが始まらない
        e.dataTransfer.setData('text/plain', String(i));
      };
      tr.ondragend = () => {
        掴んでいる = null;
        [...tbody.children].forEach((r) => r.classList.remove('dragging', 'dropzone'));
      };
      tr.ondragover = (e) => {
        if (掴んでいる === null) return;
        e.preventDefault();                       // これが無いと drop が起きない
        e.dataTransfer.dropEffect = 'move';
        [...tbody.children].forEach((r) => r.classList.remove('dropzone'));
        tr.classList.add('dropzone');
      };
      tr.ondrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const from = 掴んでいる;
        掴んでいる = null;
        if (from === null || from === i) { 描き直す(); return; }
        const a = [...リスト.tracks];
        const [運ぶ] = a.splice(from, 1);
        a.splice(i, 0, 運ぶ);                      // 落とした位置へ差し込む
        lists = await window.mp3.リストの中身を入れ替える(リスト.id, a);
        並べ替えた直後 = true;
        setTimeout(() => { 並べ替えた直後 = false; }, 300);
        描き直す();
      };
    }

    // ライブラリでは「まとめて再生リストに追加」用のチェック（指示書: 複数曲をまとめて追加）
    if (!リスト) {
      const pick = document.createElement('td');
      pick.className = 'pick';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = 選択中.has(t.path);
      cb.onclick = (e) => {
        e.stopPropagation();
        if (cb.checked) 選択中.add(t.path); else 選択中.delete(t.path);
        /*
         * ★タグを直している最中は、道具の欄を作り直さない。
         *
         * 2026-08-25 実地の不具合（3 回目）:
         * > まとめて選択したあと、タグを記入できなかった
         *
         * 道具の欄はタグ編集中「入力欄そのもの」になっている。
         * ここで 道具を描く() を呼ぶと box.innerHTML = '' で捨てられ、
         * **打った字と焦点が消える。**チェックを 1 つ触るだけで起きる。
         *
         * 数の表示（「選んだ N 曲」）が一瞬ずれるが、
         * 打てなくなるほうがはるかに困る。
         */
        if (!タグ編集 && !名前入力) 道具を描く();
      };
      pick.appendChild(cb);
      tr.appendChild(pick);
    }

    // 行頭は番号ではなく ▶（押せると分かる形にする）。再生中の行は ♪
    const 頭 = document.createElement('td');
    頭.className = 'num play-cell';
    頭.textContent = t.path === nowPath ? '♪' : '▶';
    頭.title = 'クリックで再生';
    tr.appendChild(頭);
    tr.appendChild(td('title', t.title));   // ★class は印（🚫）を出すため。幅は colgroup 側
    tr.appendChild(td('', t.artist));
    tr.appendChild(td('', t.album));
    tr.appendChild(td('dur', 時間(t.duration)));
    tr.appendChild(td('date', 日付(t.更新日時)));
    // シャッフルが『忘れている曲』を選んでいるか見えるように、回数を出す
    tr.appendChild(td('plays', String(再生回数[t.path] ?? 0)));

    if (リスト) {
      // 手で並べ替える（指示書: 利用者が手動で並べ替えられる）
      // 本人の希望でドラッグ＆ドロップ。↑↓ も残す（掴みにくい環境の逃げ道）
      const mv = document.createElement('td');
      mv.className = 'move';
      const 動かす = (差) => async (e) => {
        e.stopPropagation();
        const a = [...リスト.tracks];
        const j = i + 差;
        if (j < 0 || j >= a.length) return;
        [a[i], a[j]] = [a[j], a[i]];
        lists = await window.mp3.リストの中身を入れ替える(リスト.id, a);
        描き直す();
      };
      const up = document.createElement('button');
      up.className = 'mini'; up.textContent = '↑'; up.title = '上へ';
      up.disabled = i === 0; up.onclick = 動かす(-1);
      const down = document.createElement('button');
      down.className = 'mini'; down.textContent = '↓'; down.title = '下へ';
      down.disabled = i === 対象.length - 1; down.onclick = 動かす(1);
      mv.append(up, down);
      tr.appendChild(mv);
    }

    const act = document.createElement('td');
    act.className = 'act';
    const a = document.createElement('span');
    a.className = 'link';
    if (リスト) {
      // 再生リストから外す。曲そのものは消えない
      a.textContent = 'この曲を外す';
      a.onclick = async (e) => {
        e.stopPropagation();
        const rest = [...リスト.tracks];
        rest.splice(i, 1);                       // 位置で消す（同じ曲が複数あっても正しく1つ）
        lists = await window.mp3.リストの中身を入れ替える(リスト.id, rest);
        描き直す();
      };
    } else {
      // 「一覧から外す」。ファイルは消さない
      a.textContent = '一覧から外す';
      a.onclick = async (e) => {
        e.stopPropagation();
        // ★同名の曲が別フォルダにあると、曲名だけでは区別がつかない
        //   （指示書の「先に確かめたほうがいいこと」が、まさにここを警告していた）
        const 場所 = t.path.replace(/[\\/][^\\/]*$/, '');
        if (!confirm(`「${t.title}」を一覧から外しますか？\n\n場所: ${場所}\n\nファイルは削除されません。`)) return;
        await window.mp3.一覧から外す(t.path);

        /*
         * ★走査し直さない。手元の一覧から 1 曲抜くだけ。
         *
         * 2026-08-25 実地の不具合:
         * ここで 走査する() を呼んでいた。171,085 曲だと全部読み直しになり、
         * しかも走査の先頭で tracks を空にするので、
         * **1 曲外したら一覧が全部消えたように見えた。**
         * 実際には消えておらず、数分後に戻る状態だったが、
         * 使う人にはそれが分からない。**待たせるほうが間違い。**
         *
         * 外すのはこちらが知っている 1 曲なので、走査は要らない。
         */
        tracks = tracks.filter((x) => x.path !== t.path);
        描き直す();
      };
    }
    /*
     * ★シャッフルに入れる／入れない（本人の希望 2026-08-29）。
     * 「一覧から外す」の隣に置くが、**別の操作**だと分かる文言にする。
     *   一覧から外す   … 一覧から消える。押せない
     *   シャッフルに入れない … 一覧に残る。押せば鳴る。くじに入らないだけ
     * 再生リストを開いているときは出さない（そこは手で並べる場所なので）。
     */
    if (!リスト) {
      const 外れている = シャッフル除外.has(t.path);
      const sk = document.createElement('span');
      sk.className = 'link';
      sk.textContent = 外れている ? 'シャッフルに戻す' : 'シャッフルに入れない';
      sk.title = 外れている
        ? 'くじで選ばれるように戻します'
        : '一覧には残り、押せば鳴ります。くじで選ばれなくなるだけです';
      sk.onclick = async (e) => {
        e.stopPropagation();
        シャッフル除外 = new Set(await window.mp3.シャッフル除外を変える([t.path], !外れている));
        描き直す();
      };
      act.appendChild(sk);
      act.appendChild(document.createTextNode('　'));
    }
    act.appendChild(a);
    tr.appendChild(act);

    tbody.appendChild(tr);
  });

  /*
   * ★切り捨てたぶんを黙らない。
   * 「500 曲しか無い」と思われるのが一番まずい。
   * どうすれば全部見えるか（絞り込む）も、その場で書く。
   */
  const 残り = 対象.length - 描く分.length;
  if (残り > 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 見出し.length;
    td.className = 'more';
    td.textContent = `ほかに ${残り.toLocaleString('ja-JP')} 曲あります。`
      + '上のジャンル・アーティスト・アルバムで絞ると、全部見えます。';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const 曲数 = `${対象.length.toLocaleString('ja-JP')} 曲`;
  const 但し = 残り > 0 ? `（上から ${描く分.length} 曲を表示中）` : '';
  $('status').textContent = リスト
    ? `${曲数}（再生リスト「${リスト.name}」）`
    : `${曲数}${但し}`;
}

/* ── 再生リスト ─────────────────────────────────────────── */

const 開いているリスト = () => lists.find((l) => l.id === 開いているID) ?? null;

function タブを描く() {
  const box = $('tabs');
  box.innerHTML = '';

  const タブ = (label, id, title) => {
    const b = document.createElement('button');
    b.className = 'tab' + (開いているID === id ? ' on' : '');
    b.textContent = label;
    if (title) b.title = title;
    b.onclick = () => { 開いているID = id; 描き直す(); };
    box.appendChild(b);
    return b;
  };

  タブ('ライブラリ', null);
  for (const l of lists) タブ(`${l.name}（${l.tracks.length}）`, l.id);

  const 新規 = document.createElement('button');
  新規.className = 'tab';
  新規.textContent = '＋ 新しい再生リスト';
  // ★prompt() は使わない。Electron では動かない（alert / confirm は動くのに prompt だけ使えない）。
  // 実地で「押しても反応がない」となった原因。画面内の入力欄に置き換えた。
  新規.onclick = () => { 名前入力 = { mode: 'new', id: null, value: '' }; 描き直す(); };
  box.appendChild(新規);

  const 読込 = document.createElement('button');
  読込.className = 'tab';
  読込.textContent = 'm3u を読み込む';
  読込.onclick = async () => {
    const r = await window.mp3.m3uを読み込む();
    if (!r) return;
    lists = r;
    描き直す();
  };
  box.appendChild(読込);
}

/**
 * 名前を入れる欄。
 * ★prompt() が Electron で使えないので、画面の中に置く。
 */
function 名前入力を描く(box) {
  const inp = document.createElement('input');
  inp.value = 名前入力.value;
  inp.placeholder = '再生リストの名前';
  inp.autocomplete = 'off';
  inp.style.cssText = 'padding:5px 8px;border:1px solid var(--accent);border-radius:4px;font-size:12px;min-width:200px;outline:none;';
  inp.oninput = () => { 名前入力.value = inp.value; };

  const 決める = async () => {
    const name = 名前入力.value.trim();
    if (!name) return;
    if (名前入力.mode === 'new') {
      lists = await window.mp3.リストを作る(name);
      開いているID = lists[lists.length - 1].id;
    } else {
      lists = await window.mp3.リスト名を変える(名前入力.id, name);
    }
    名前入力 = null;
    描き直す();
  };
  const やめる = () => { 名前入力 = null; 描き直す(); };

  inp.onkeydown = (e) => {
    if (e.key === 'Enter') 決める();
    if (e.key === 'Escape') やめる();
  };

  const ok = document.createElement('button');
  ok.className = 'btn';
  ok.textContent = 名前入力.mode === 'new' ? '作る' : '変える';
  ok.onclick = 決める;

  const ng = document.createElement('button');
  ng.className = 'btn';
  ng.textContent = 'やめる';
  ng.onclick = やめる;

  box.append(inp, ok, ng);
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}

/**
 * タグの編集欄。
 *
 * ★このアプリで唯一、利用者のファイルそのものを書き換える。
 * だから「何件に、何を書くか」を必ず見せてから実行する。
 * 空の欄は触らない（うっかり全消しにしない）。
 */
function タグ編集を描く(box) {
  const 欄 = (key, label) => {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:12px;color:var(--dim);';
    const inp = document.createElement('input');
    inp.value = タグ編集.値[key];
    inp.placeholder = '（変えない）';
    inp.autocomplete = 'off';
    inp.style.cssText = 'padding:4px 7px;border:1px solid var(--line);border-radius:4px;font-size:12px;width:130px;outline:none;';
    inp.oninput = () => { タグ編集.値[key] = inp.value; 書くボタンを更新(); };
    wrap.append(document.createTextNode(label), inp);
    box.appendChild(wrap);
    return inp;
  };

  const 説明 = document.createElement('span');
  説明.style.cssText = 'font-size:12px;color:var(--text);font-weight:600;';
  説明.textContent = `${タグ編集.対象.length} 曲のタグを直す:`;
  box.appendChild(説明);

  欄('genre', 'ジャンル');
  欄('artist', 'アーティスト');
  欄('album', 'アルバム');

  const 書く = document.createElement('button');
  書く.className = 'btn';
  box.appendChild(書く);

  const やめる = document.createElement('button');
  やめる.className = 'btn';
  やめる.textContent = 'やめる';
  やめる.onclick = () => { タグ編集 = null; 描き直す(); };
  box.appendChild(やめる);

  const 注意 = document.createElement('span');
  注意.style.cssText = 'font-size:11px;color:#b45309;';
  注意.textContent = '※ MP3 ファイルそのものを書き換えます（空欄は変えません）';
  box.appendChild(注意);

  function 書くボタンを更新() {
    const 入っている = Object.entries(タグ編集.値).filter(([, v]) => v.trim());
    書く.disabled = 入っている.length === 0;
    書く.textContent = 入っている.length
      ? `${入っている.map(([k]) => ({ genre: 'ジャンル', artist: 'アーティスト', album: 'アルバム' })[k]).join('・')}を書き込む`
      : '書き込む';
  }
  書くボタンを更新();

  書く.onclick = async () => {
    const 値 = Object.fromEntries(Object.entries(タグ編集.値).filter(([, v]) => v.trim()));
    const 中身 = Object.entries(値).map(([k, v]) => `${({ genre: 'ジャンル', artist: 'アーティスト', album: 'アルバム' })[k]} → ${v}`).join('\n');
    /*
     * ★曲数が多いときは、かかる時間も伝える。
     * 「まとめて選択」は絞り込んだ全曲を選ぶので、うっかり数万曲になることがある。
     * MP3 そのものを書き換える操作なので、**押す前に重さが分かるようにする。**
     */
    const 数 = タグ編集.対象.length;
    const 目安 = 数 > 500 ? `\n\n※ ${数.toLocaleString('ja-JP')} 曲だと、おおよそ ${Math.ceil(数 / 60)} 秒かかります。`
      + '\n途中でやめられません。曲数が多すぎるときは、上の3カラムで絞ってからにしてください。' : '';
    /*
     * ★MP3 でないものが混じっていたら、押す前に言う（2026-08-28）。
     * .m4a を一覧に出すようにしたので、選択に混ざる。
     * タグを書けるのは MP3 だけ（node-id3 は ID3 タグ専用）。
     * 黙って進めると、終わってから「うまくいかなかったもの N」が出るだけで、
     * **壊れていると誤解される。**書けないことは、始める前に分かるほうがいい。
     */
    const 書けない数 = タグ編集.対象.filter((p) => !/\.mp3$/i.test(p)).length;
    const 書けない断り = 書けない数
      ? `\n\n※ このうち ${書けない数.toLocaleString('ja-JP')} 曲は MP3 ではないので（m4a など）、`
        + 'タグを書き換えられません。飛ばします。\nファイルは壊れていません。再生はできます。'
      : '';
    if (数 === 書けない数) {
      alert('選んだ曲は MP3 ではないので（m4a など）、タグを書き換えられません。\n'
        + 'ファイルは壊れていません。再生はできます。');
      return;
    }
    if (!confirm(
      `${(数 - 書けない数).toLocaleString('ja-JP')} 曲の MP3 ファイルを書き換えます。\n\n${中身}\n\n`
      + 'ファイルそのものが書き換わります（音のデータは変わりません）。'
      + `${書けない断り}${目安}\n\nよろしいですか？`,
    )) return;

    /*
     * ★進み具合を出す。
     * 「まとめて選択」は絞り込んだ全曲を選ぶので、何も絞らずに押すと
     * 8 万曲になることがある（実測: タグ無しだけで 85,764 件）。
     * その間ずっと無言だと、固まったようにしか見えない。
     */
    let 成功 = 0;
    const 失敗 = [];
    const 全体 = タグ編集.対象.length;
    for (const p of タグ編集.対象) {
      const r = await window.mp3.タグを書く(p, 値);
      if (r?.ok) 成功 += 1;
      else 失敗.push(`${p.replace(/^.*[\\/]/, '')}: ${r?.error ?? '不明'}`);
      const 済み = 成功 + 失敗.length;
      if (済み % 20 === 0 || 済み === 全体) {
        $('status').textContent = `タグを書いています ${済み.toLocaleString('ja-JP')} / ${全体.toLocaleString('ja-JP')}`
          + (失敗.length ? `（うまくいかなかったもの ${失敗.length}）` : '');
        // 画面を描き直す隙を作る（詰まったように見えないように）
        await new Promise((r2) => setTimeout(r2, 0));
      }
    }
    const 直した = [...タグ編集.対象];
    タグ編集 = null;
    選択中.clear();

    /*
     * ★直した曲だけ読み直す。全走査しない。
     * 171,085 曲だと全走査に数分かかり、その間は一覧が空になる。
     * **数曲直すのに、全部を読み直す理由が無い。**
     * （「一覧から外す」で同じ間違いをして、一覧が全部消えたように見えた）
     */
    /*
     * ★まとめて読み直す。1 曲ずつ頼まない。
     * 覚え書きは 60 MB あるので、1 曲ごとに書き直すと 14 曲で 14 回書くことになる。
     */
    $('status').textContent = '読み直しています…';
    const 返り = await window.mp3.まとめて読み直す(直した);
    const 新しい = 返り.tracks;
    let 読み直した = 0;
    for (let k = 0; k < 直した.length; k += 1) {
      const t = 新しい[k];
      const i = tracks.findIndex((x) => x.path === 直した[k]);
      if (t && i >= 0) { tracks[i] = t; 読み直した += 1; }
    }
    /*
     * ★覚え書きに残せたかを確かめる（2026-08-25 実地）。
     *
     * MP3 は書き換わっているのに覚え書きが古いままだと、
     * **画面では直って見え、立ち上げ直すと元に戻る。**
     * 実際にそうなった。原因は main.js の import 忘れで、
     * 向こう側の catch が握りつぶしていたので、ここには何も届いていなかった。
     * 届くようにしたので、だめなときは隠さず出す。
     */
    const 覚え注意 = 返り.覚え && 返り.覚え.ok === false
      ? `\n\n⚠ ただし、覚え書きに残せませんでした（${返り.覚え.error}）。\n`
        + 'このまま閉じると、次に開いたとき古い内容に戻って見えます。\n'
        + '「再スキャン」を最後まで走らせると直ります。'
      : '';

    /*
     * ★絞り込みを外す。
     *
     * ジャンルを変えると、その曲は**別のジャンルへ移る。**
     * 「Rock」で絞ったまま Rock 以外に変えると、直した曲が
     * 一覧から消えるので、**変わっていないように見える。**
     * 直したあとは、どこへ行ったか分かるように絞りを外して全部出す。
     */
    // ★日付タブぶんも一緒に外す。片方だけ残ると「絞ったつもりが無いのに出ない」になる
    sel = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null };
    描き直す();

    // 黙って終わらせない。失敗があれば必ず見せる。何件読み直したかも出す
    const 但し = 読み直した < 成功 ? `\n（うち ${成功 - 読み直した} 曲は一覧に見当たらず、表示を更新できませんでした）` : '';
    if (失敗.length) {
      alert(`${成功} 曲を書き換えました。${但し}\n\n${失敗.length} 曲は失敗しました:\n${失敗.slice(0, 10).join('\n')}${覚え注意}`);
    } else {
      alert(`${成功} 曲のタグを書き換えました。${但し}\n\n絞り込みを外したので、変えた内容が一覧で確かめられます。${覚え注意}`);
    }
  };
}

function 道具を描く() {
  const box = $('listtools');
  box.innerHTML = '';

  if (名前入力) { 名前入力を描く(box); return; }
  if (タグ編集) { タグ編集を描く(box); return; }

  const リスト = 開いているリスト();

  const ボタン = (label, fn, 無効 = false) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.disabled = 無効;
    b.onclick = fn;
    box.appendChild(b);
    return b;
  };

  if (!リスト) {
    // ★「まとめて選択」は、追加先の再生リストが無くても出す。
    // タグをまとめて直すときにも使うので、追加専用の道具ではない
    const 見えている = 絞る(3);
    const 全部選ばれている = 見えている.length > 0 && 見えている.every((t) => 選択中.has(t.path));
    ボタン(全部選ばれている ? 'まとめて解除' : `まとめて選択（${見えている.length}）`, () => {
      if (全部選ばれている) 見えている.forEach((t) => 選択中.delete(t.path));
      else 見えている.forEach((t) => 選択中.add(t.path));
      描き直す();
    }, 見えている.length === 0);

    const n0 = 選択中.size;
    if (n0) {
      /*
       * ★見えていない曲が選ばれたままになることを、黙らない。
       *
       * 2026-08-25 実地:
       * > 曲を選んでいないのに「選んだ2曲のタグを直す」と表示されていて2曲選んでいる
       *
       * 選択は絞り込みを変えても残る（別のジャンルの曲もまとめて選べるように）。
       * だが**画面に見えていない曲が数に入っている**と、身に覚えが無い。
       * 残す仕組みは変えず、**見えていない分を数えて出す。**
       */
      const 見えている集合 = new Set(見えている.map((t) => t.path));
      const 見えない数 = [...選択中].filter((p) => !見えている集合.has(p)).length;
      const 但し = 見えない数 ? `（うち ${見えない数} 曲は、いまの絞り込みでは見えていません）` : '';
      ボタン(`選んだ ${n0} 曲のタグを直す${但し}`, () => {
        タグ編集 = { 対象: [...選択中], 値: { genre: '', artist: '', album: '' } };
        描き直す();
      });

      /*
       * ★シャッフルから外す／戻すも、まとめてできるようにする（2026-08-29）。
       * 1 曲ずつだと、アルバム単位で外したいときに使いものにならない。
       * ★「外す」と「戻す」を別のボタンにする。1 つで切り替える形にすると、
       *   外れているものと外れていないものが混ざったときに、どちらに転ぶか分からない。
       */
      const 外れ数 = [...選択中].filter((p) => シャッフル除外.has(p)).length;
      if (外れ数 < n0) {
        ボタン(`選んだ ${n0 - 外れ数} 曲をシャッフルに入れない`, async () => {
          シャッフル除外 = new Set(await window.mp3.シャッフル除外を変える([...選択中], true));
          描き直す();
          $('status').textContent = `${(n0 - 外れ数).toLocaleString('ja-JP')} 曲をシャッフルから外しました（一覧には残ります）`;
        });
      }
      if (外れ数) {
        ボタン(`選んだ ${外れ数} 曲をシャッフルに戻す`, async () => {
          シャッフル除外 = new Set(await window.mp3.シャッフル除外を変える([...選択中], false));
          描き直す();
          $('status').textContent = `${外れ数.toLocaleString('ja-JP')} 曲をシャッフルに戻しました`;
        });
      }

      /*
       * ★「一覧から外す」もまとめてできるようにする（本人の希望 2026-08-25）。
       * ファイルは消さない。一覧から外すだけ、という約束は変えない。
       */
      ボタン(`選んだ ${n0} 曲を一覧から外す`, async () => {
        if (!confirm(
          `${n0.toLocaleString('ja-JP')} 曲を一覧から外します。\n\n`
          + 'ファイルは削除されません。一覧に出なくなるだけです。\n'
          + '（「外したものを戻す」で戻せます）',
        )) return;
        const 外す = [...選択中];
        $('status').textContent = '外しています…';
        const 合計 = await window.mp3.まとめて一覧から外す(外す);
        const 外す集合 = new Set(外す);
        tracks = tracks.filter((t) => !外す集合.has(t.path));
        選択中.clear();
        出ている道 = null;
        // ★外した直後に「戻す」ボタンを出す。案内だけして操作が無いのを直した
        外したものボタンを直す(合計);
        描き直す();
        $('status').textContent = `${外す.length.toLocaleString('ja-JP')} 曲を一覧から外しました（ファイルは残っています）`;
      });

      // ★「選択を解除」は、再生リストが無くても出す。
      //   身に覚えのない選択を、その場で消せるようにするため
      ボタン('選択を解除', () => { 選択中.clear(); 描き直す(); });
    }

    if (!lists.length) return;                 // 追加先が無いときは、ここまで
    const n = 選択中.size;
    const sel2 = document.createElement('select');
    sel2.className = 'btn';
    for (const l of lists) {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.name;
      sel2.appendChild(o);
    }
    box.appendChild(sel2);
    ボタン(`選んだ ${n} 曲を追加`, async () => {
      // 指示書: 同じ曲を複数回追加できる → 重複を確かめずそのまま足す
      lists = await window.mp3.リストに足す(sel2.value, [...選択中]);
      選択中.clear();
      描き直す();
    }, n === 0);
    return;                                    // ★「選択を解除」は上で出している（重複させない）
  }

  ボタン('m3u で保存', async () => {
    const r = await window.mp3.m3uに書き出す(リスト.id, tracks);
    if (r?.ok) alert(`保存しました\n${r.path}`);
    else if (r && !r.canceled) alert(`保存できませんでした（${r.error ?? '不明'}）`);
  }, リスト.tracks.length === 0);

  ボタン('名前を変える', () => {
    名前入力 = { mode: 'rename', id: リスト.id, value: リスト.name };
    描き直す();
  });

  // 指示書:「再生リストを削除するとき、確認ダイアログを出す: 出す」
  ボタン('この再生リストを削除', async () => {
    if (!confirm(`再生リスト「${リスト.name}」を削除しますか？\n\n曲のファイルは削除されません。`)) return;
    lists = await window.mp3.リストを消す(リスト.id);
    開いているID = null;
    描き直す();
  });
}

function 描き直す() {
  const 列たち = カラムタブの列[カラムタブ];
  ['c-genre', 'c-artist', 'c-album'].forEach((id, i) => {
    // 見出しも中身に合わせて書き換える（ジャンル/アーティスト/アルバム ↔ 年/月/日）
    const h = $(id).parentElement.querySelector('h2');
    if (h) h.textContent = 列たち[i].見出し;
    列を描く(id, i, 列たち[i]);
  });
  カラムタブを描く();
  タブを描く();
  道具を描く();
  一覧を描く();
}

/*
 * ★裏の更新でだけ使う描き直し。
 *
 * 2026-08-25 の実地で 2 回間違えた。順に記録する。
 *
 * 1 回目: まとめてタグを直そうとしたら、入力欄に何も打てなかった。
 *   道具を描く() は box.innerHTML = '' で中身を捨てるので、
 *   呼ばれるたびに**入力欄が作り直され、打った字も焦点も消える。**
 *   走査の途中経過で 1.5 秒ごとに 描き直す() を呼んでいたのが原因。
 *
 * 2 回目: それを「描き直す() の中で、編集中なら道具を描かない」と直したら、
 *   **タグを直すボタンが反応しなくなった。**
 *   編集を始めた直後も「編集中」なので、入力欄そのものが描かれなくなっていた。
 *
 * ★分けるべきは「描き直す」ではなく、**誰が呼んだか**だった。
 *   ・人の操作で状態が変わった → 必ず全部描き直す（描き直す）
 *   ・裏でデータが増えた       → 入力中なら触らない（ここ）
 */
function 裏で描き直す() {
  if (名前入力 || タグ編集) return;             // 入力中は触らない
  描き直す();
}

/* ── 再生 ───────────────────────────────────────────── */

/**
 * Windows のパスを、そのまま鳴らせる file:// URL にする。
 *
 * ★ここを素朴に組み立てると、実際の音楽フォルダのほぼ全部で壊れる。
 *   空白・日本語 … 未エンコードだと読み込めない
 *   #            … 以降がフラグメント扱いで捨てられる
 *   ?            … 以降がクエリ扱いで捨てられる
 *   file://C:/   … スラッシュが1本足りない（正しくは file:///C:/）
 */
function ファイルURL(win路) {
  const slash = win路.split('\\').join('/');
  return 'file:///' + encodeURI(slash).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function 再生できない(理由) {
  // ★黙って止まらない。何が起きたか画面に出す
  $('sub').textContent = `再生できませんでした（${理由}）`;
  $('play').textContent = '▶';
}

/**
 * @param 列を保つ true ならシャッフルの巡を仕切り直さない
 *   （自動送りのとき。同じ巡を続けたいので）
 */
function 再生する(t, { 列を保つ = false } = {}) {
  // 曲を選び直したときは、シャッフルの巡も仕切り直す（自動送りのときは続ける）
  if (!列を保つ) 巡 = new Set();
  巡.add(t.path);
  数えた = false;

  nowPath = t.path;
  $('title').textContent = t.title;
  $('sub').textContent = `${t.artist} — ${t.album}`;
  /*
   * ★アートワークは、この 1 曲ぶんだけ今読む。
   * 一覧に全曲ぶん持たせていたのが、アプリが落ちた直接の原因だった
   * （171,085 曲で 17.8 GB。実測）。
   * 読んでいる間に次の曲へ移ることがあるので、**まだその曲かを確かめてから**出す。
   */
  $('art').style.backgroundImage = 'none';
  const この曲 = t.path;
  window.mp3.アートワークを取る(t.path).then((絵) => {
    if (nowPath !== この曲) return;             // もう別の曲に移っている
    $('art').style.backgroundImage = 絵 ? `url(${絵})` : 'none';
  }).catch(() => { /* 絵が無いだけ。再生は続ける */ });
  $('play').disabled = false;
  $('next').disabled = false;
  $('prev').disabled = false;
  $('seek').disabled = false;
  一覧を描く();

  /*
   * ★鳴らせないと分かっている曲は、鳴らそうとせずに理由を言う（2026-08-28）。
   *
   * ALAC（Apple ロスレス）が該当する。拡張子が .m4a なので一覧には出るが、
   * Chromium が demux できない（実測: DEMUXER_ERROR_NO_SUPPORTED_STREAMS）。
   * 本人のライブラリでは 437 曲。
   *
   * ★一覧からは消さない、と本人が決めた（2026-08-28）。
   * 持っている曲が黙って消えるより、出したうえで理由が分かるほうがいい。
   * だからここは「押せるが、押すと理由が出る」にする。
   *
   * ★measure してから鳴らそうとしない。
   * 倍率の測定も decodeAudioData なので、同じ理由で失敗する。無駄に走らせない。
   */
  if (t.鳴らせる === false) {
    再生できない(`${t.codec ?? 'この形式'} は音蔵では鳴らせません`);
    audio.removeAttribute('src');
    audio.load();                                // 前の曲が鳴り続けないように止める
    return;
  }

  // 覚えている倍率があれば即座に、無ければ素の音量で流し始めてから測る
  倍率をかける(倍率表[t.path] ?? 1);
  測って覚える(t);

  audio.src = ファイルURL(t.path);
  audio.play().catch((e) => 再生できない(e?.message || '不明'));
}

/* ── 音量そろえ ─────────────────────────────────────────
   本人の希望:「音源自体のボリュームが違うので音の大きさのバラツキが気になる」

   ★測っている間も再生は止めない。
   初回はいったん素の音量で流し始め、測り終わってから静かに合わせる。
   ここで待たせると「押してから鳴るまで数秒」になり、使い心地が落ちる。 */

let 音量そろえ = true;
/** 測った倍率 { パス: 倍率 } */
let 倍率表 = {};
/** Web Audio の配管。作るのは一度だけ */
let 音の配管 = null;

function 配管を作る() {
  if (音の配管) return 音の配管;
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    音の配管 = { ctx, gain };
  } catch {
    音の配管 = null;                              // 使えない環境では、そろえないだけ
  }
  return 音の配管;
}

/** 倍率を、耳障りにならないよう少しずつ変える */
function 倍率をかける(倍率) {
  const 配管 = 配管を作る();
  if (!配管) return;
  const v = 音量そろえ ? 倍率 : 1;
  try {
    配管.gain.gain.setTargetAtTime(v, 配管.ctx.currentTime, 0.15);
  } catch { /* ignore */ }
}

/*
 * ★大きすぎる曲は測らない（2026-08-28 実測。.wav を拾うようにして分かった）。
 *
 * 測定はファイル全体をメモリに載せて decodeAudioData する作りになっている。
 * mp3 と m4a しか拾っていなかったときは、それで問題が無かった。
 * だが wav を足すと桁が変わる。手元の wav は合計 55.6 GB、**最大 1,095 MB**。
 *
 * その 1,095 MB（49 分の録音）で実際に測った:
 *   読み込み 13.0 秒（1,095 MB）→ decode 4.7 秒 → 波形 1,006 MB
 *   **ピークで約 2.1 GB。合計 18 秒。**
 *
 * 落ちはしなかったが、**曲を 1 つ押しただけでこれは持てない。**
 * 100 MB 超えは 25 件ある。アプリが落ちた元の原因（アートワーク 17.8 GB）と
 * 同じ形の間違いなので、ここで止める。
 *
 * ★測らないだけで、再生は普通にできる。音量がそろわないだけ。
 * 100 MB は、16bit/44.1kHz の wav でおよそ 10 分ぶん。ふつうの曲は超えない
 * （実測: 4 分 56 秒の wav で 49.7 MB、10 分の 320kbps mp3 で 24 MB）。
 */
const 測る上限バイト = 100 * 1024 * 1024;

/** まだ測っていない曲を測る。再生と並行して動かす */
async function 測って覚える(t) {
  if (倍率表[t.path] !== undefined) return;
  const 配管 = 配管を作る();
  if (!配管) return;
  try {
    const 返り = await window.mp3.音を読む(t.path, 測る上限バイト);
    if (!返り) return;
    if (返り.大きすぎる) {
      // ★黙って飛ばさない。「そろっていない」ことが分かるようにする
      if (t.path === nowPath) {
        $('status').textContent =
          `${Math.round(返り.大きすぎる / 1024 / 1024)} MB あるので、音量そろえは測っていません`;
      }
      return;
    }
    const bytes = 返り.bytes;
    if (!bytes) return;
    const buf = await 配管.ctx.decodeAudioData(bytes);
    const ch = [];
    for (let i = 0; i < buf.numberOfChannels; i += 1) ch.push(buf.getChannelData(i));
    const { rms, ピーク } = 測る(ch, 8);           // 8サンプルおき。速さと精度のつり合い
    const { 倍率 } = 倍率を決める(rms, ピーク);
    倍率表[t.path] = 倍率;
    await window.mp3.倍率を覚える(t.path, 倍率);
    if (t.path === nowPath) 倍率をかける(倍率);     // まだ同じ曲を流していれば、いま反映する
  } catch { /* 測れない曲は、そろえないだけ。再生は続ける */ }
}

/* ── 次の曲へ ───────────────────────────────────────────
   指示書に無かったので相談して決めた（2026-08-24）:
   終わったら次へ / 最後まで行ったら止まる / 繰り返し3種 / シャッフルは重み付き */

/**
 * いま流す対象の曲。**下の一覧に出ているものがそのまま対象**（2026-08-29 本人の希望）。
 *
 * ・再生リストを開いていれば、その中身
 * ・そうでなければ、3 カラムで絞った結果（何も絞っていなければ全曲）
 *
 * ★絞り込みは 絞る() 一か所に集めてある。ここで別の絞り方をしない。
 * 二か所で絞ると「一覧に無いのに再生される」が必ず起きる。
 *
 * ★一覧は 2,000 行までしか描かないが、**対象はそこで切らない。**
 * 「表示されている 2,000 曲」ではなく「いま絞り込んでいる範囲」が欲しいもの。
 * 何も絞っていなければ全曲が対象になる（＝全体シャッフル）。
 */
function いまの列() {
  const リスト = 開いているリスト();
  return リスト
    ? リスト.tracks.map((p) => tracks.find((x) => x.path === p)).filter(Boolean)
    : 絞る(3).sort(曲を並べる);
}

/**
 * 何も流していないところから流し始める（▶ を押しただけのとき）。
 *
 * ■ 本人の希望（2026-08-29）
 *   > シャッフルを選んだ時、再生ボタンを押すと最初の一曲目からランダム再生
 *   > してほしい。今は自分で一曲目を選ばないといけないので、それが大変。
 *
 * シャッフルが入っていればくじで、入っていなければ並びの頭から。
 * ★鳴らせない曲（ALAC）は最初から避ける。押していきなり断られるのは親切でない。
 */
function 流し始める() {
  const 列 = いまの列();
  const 鳴る列 = 列.filter((t) => t.鳴らせる !== false);
  if (!鳴る列.length) {
    $('sub').textContent = 列.length ? '流せる曲がありません（この範囲は鳴らせない曲だけです）' : '流せる曲がありません';
    return;
  }
  巡 = new Set();
  let t = 鳴る列[0];
  if (シャッフル) {
    // ★くじの候補からは、シャッフルに入れない曲を外す
    const くじ列 = 鳴る列.filter((x) => !シャッフル除外.has(x.path));
    if (!くじ列.length) {
      $('sub').textContent = 'この範囲は、全部シャッフルから外してあります';
      return;
    }
    const p = 次を選ぶ(くじ列.map((x) => x.path), 再生回数, 巡);
    t = くじ列.find((x) => x.path === p) ?? くじ列[0];
  }
  再生する(t);
}

/**
 * 「直前と同じアーティスト／アルバムを続けない」ための手がかりを作る。
 *
 * ★測ってから入れた（2026-08-29）。広いところでは元から起きていない。
 *   全部 86,044 曲 … 直前と同じ演者 0.1%
 *   アルバム 3 枚 35 曲 … **31.4%**
 * つまり効くのは、3 カラムで数枚だけ選んだとき。
 *
 * ★見るのは直前の 1 曲だけ。避けられないときは避けない（shuffle.js 側）。
 */
function 続けない手がかり(列) {
  const いま = 列.find((t) => t.path === nowPath) ?? null;
  if (!いま) return null;
  const 表 = new Map(列.map((t) => [t.path, t]));
  return { 直前: { artist: いま.artist, album: いま.album }, 情報: (p) => 表.get(p) ?? null };
}

/**
 * 次に流す曲を決める。もう無ければ null（＝止まる）。
 * @param 方向 +1 = 次、-1 = 前
 * @param 列   対象。呼ぶ側で一度だけ作って渡す（送る の中で何度も作り直さないため）
 */
function 次の曲(方向 = 1, 列 = いまの列()) {
  if (!列.length) return null;

  // 1曲繰り返しは、次も同じ曲（⏭ を押したときは進む）
  if (繰り返し === 'one' && 方向 === 1 && 自動送り) {
    return 列.find((t) => t.path === nowPath) ?? 列[0];
  }

  if (シャッフル && 方向 === 1) {
    // ★くじのときだけ外す。並び順で送るときは、いままでどおり流す
    const 候補 = 列.filter((t) => !シャッフル除外.has(t.path)).map((t) => t.path);
    if (!候補.length) return null;               // 全部外していたら止まる
    if (巡が終わったか(候補, 巡)) {
      if (繰り返し !== 'all') return null;      // 最後まで行ったら止まる
      巡 = new Set();                            // 全体繰り返しなら、もう一巡
    }
    const p = 次を選ぶ(候補, 再生回数, 巡, Math.random, 続けない手がかり(列));
    return 列.find((t) => t.path === p) ?? null;
  }

  const i = 列.findIndex((t) => t.path === nowPath);
  const j = i < 0 ? 0 : i + 方向;
  if (j >= 列.length) return 繰り返し === 'all' ? 列[0] : null;   // 最後まで行ったら止まる
  if (j < 0) return 繰り返し === 'all' ? 列[列.length - 1] : null;
  return 列[j];
}

/** 自動送りで来たのか、ボタンで来たのかを区別する（1曲繰り返しの扱いが変わる） */
let 自動送り = false;

/*
 * ★送るときは、鳴らせない曲を飛ばす（2026-08-28）。
 *
 * 一覧を押したときは理由を出して止まる（本人の選択）。
 * だが**自動送りで止まると、ALAC が 1 曲混ざっているだけで列がそこで終わる。**
 * 本人のライブラリには 437 曲あるので、実際に何度も起きる。
 * ⏭ を押したときも同じで、鳴る曲まで進むほうが期待どおり。
 *
 * ★飛ばした数は画面に出す。**黙って飛ばさない。**
 */
function 送る(方向) {
  const 元のいま = nowPath;
  /*
   * ★対象はここで一度だけ作る（2026-08-29）。
   * 次の曲() が既定で いまの列() を呼ぶので、下の輪の中で呼ぶと
   * **飛ばすたびに 86,000 曲を絞って並べ直す**ことになる。
   * 鳴らせない曲が続くと、その回数ぶん繰り返される。
   */
  const 列 = いまの列();
  let t = 次の曲(方向, 列);
  let 飛ばした = 0;
  // 列の長さを超えて回らない（全部鳴らせない列でも必ず抜ける）
  while (t && t.鳴らせる === false && 飛ばした < 列.length) {
    nowPath = t.path;                            // 次を探す起点を進める
    巡.add(t.path);                              // シャッフルでも拾い直さないように
    飛ばした += 1;
    t = 次の曲(方向, 列);
  }
  if (t && t.鳴らせる === false) t = null;       // 列が全部鳴らせなかった

  if (t) {
    再生する(t, { 列を保つ: true });
    if (飛ばした) $('sub').textContent += `（鳴らせない ${飛ばした} 曲を飛ばしました）`;
  } else {
    nowPath = 元のいま;                          // 飛ばしただけで終わったので、起点を戻す
    audio.pause();
    $('sub').textContent = 飛ばした
      ? `鳴らせない曲が ${飛ばした} 曲続いたので止まりました`
      : '最後まで再生しました';
  }
}

audio.onended = () => {
  自動送り = true;
  送る(1);
  自動送り = false;
};

/* 半分まで聴いたら再生回数を1つ足す。押して飛ばしただけでは数えない */
audio.addEventListener('timeupdate', async () => {
  if (数えた || !nowPath) return;
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0 && audio.currentTime > d / 2) {
    数えた = true;
    再生回数 = await window.mp3.再生回数を足す(nowPath);
    一覧を描く();                                 // 画面の回数表示も更新する
  }
});

// ファイル自体が読めない・形式が合わないときも黙らせない
audio.onerror = () => {
  const code = audio.error?.code;
  const 説明 = {
    1: '読み込みが中断された', 2: 'ファイルを読めなかった',
    3: 'ファイルが壊れている', 4: 'この形式は再生できない',
  }[code] ?? `コード ${code}`;
  再生できない(説明);
};

/*
 * ★何も流していないときは、押すだけで流し始める（2026-08-29 本人の希望）。
 *   > 再生ボタンを押すと最初の一曲目からランダム再生してほしい。
 *   > 今は自分で一曲目を選ばないといけないので、それが大変。
 *
 * ★src が付いていないときも同じ扱いにする。
 * 鳴らせない曲（ALAC）を押したあとがこれで、
 * そのままだと ▶ を押しても**何も起きない**（前は無音のまま固まって見えた）。
 */
$('play').onclick = () => {
  if (!audio.getAttribute('src')) { 流し始める(); return; }
  if (audio.paused) audio.play(); else audio.pause();
};
$('next').onclick = () => 送る(1);
$('prev').onclick = () => 送る(-1);

const 繰り返しの表示 = { none: '🔁 しない', one: '🔁 1曲', all: '🔁 全体' };
$('repeat').onclick = () => {
  繰り返し = { none: 'one', one: 'all', all: 'none' }[繰り返し];
  $('repeat').textContent = 繰り返しの表示[繰り返し];
  $('repeat').classList.toggle('on', 繰り返し !== 'none');
};

/*
 * ★音量そのもののつまみ（本人の希望 2026-08-25）。
 * 「音量そろえる」は曲ごとの差をならすもので、全体の大きさは別物。
 * 覚えておかないと、開くたびに大音量から始まる。
 */
$('vol').oninput = () => {
  音量 = Number($('vol').value) / 100;
  audio.volume = 音量;
  $('volicon').textContent = 音量 === 0 ? '🔇' : 音量 < 0.5 ? '🔉' : '🔊';
};
$('vol').onchange = () => { window.mp3.音量を覚える(音量); };

/*
 * ★タグの無い曲を隠す／出す。
 * 隠すと、一覧にも 3 カラムにも出ず、次の曲にも選ばれない
 * （絞り込みの入口が「見える曲」1 つなので、自動でそろう）。
 */
$('untagged').onclick = async () => {
  タグ無しを隠す = !タグ無しを隠す;
  $('untagged').classList.toggle('on', タグ無しを隠す);
  $('untagged').textContent = タグ無しを隠す ? '🏷 タグ無しを隠す' : '🏷 タグ無しも出す';
  await window.mp3.タグ無しを隠す設定(タグ無しを隠す);
  const 隠れる = tracks.filter((t) => !t.タグあり).length;
  描き直す();
  $('status').textContent = タグ無しを隠す
    ? `${見える曲().length} 曲（タグが無く非表示 ${隠れる} 件）`
    : `${見える曲().length} 曲（タグの無い ${隠れる} 件も出しています）`;
};

$('level').onclick = () => {
  音量そろえ = !音量そろえ;
  $('level').textContent = 音量そろえ ? '🔊 音量そろえる' : '🔊 そのまま';
  $('level').classList.toggle('on', 音量そろえ);
  倍率をかける(倍率表[nowPath] ?? 1);
};

$('shuffle').onclick = () => {
  シャッフル = !シャッフル;
  $('shuffle').textContent = シャッフル ? '🔀 オン' : '🔀 オフ';
  $('shuffle').classList.toggle('on', シャッフル);
  巡 = new Set();                                // 切り替えたら巡を仕切り直す
  if (シャッフル && nowPath) 巡.add(nowPath);
};
audio.onplay = () => { $('play').textContent = '⏸'; };
audio.onpause = () => { $('play').textContent = '▶'; };
audio.ontimeupdate = () => {
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) $('seek').value = String(Math.round((audio.currentTime / d) * 1000));
  $('time').textContent = `${時間(audio.currentTime)} / ${時間(d)}`;
};
$('seek').oninput = () => {
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) audio.currentTime = (Number($('seek').value) / 1000) * d;
};

/* ── フォルダと走査 ─────────────────────────────────── */

function フォルダを描く(s) {
  const box = $('folders');
  box.innerHTML = '';
  for (const f of s.folders) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    const name = document.createElement('span');
    name.textContent = f;
    name.title = f;
    const x = document.createElement('b');
    x.textContent = '×';
    x.title = 'スキャン対象から外す';
    x.onclick = async () => {
      const ns = await window.mp3.フォルダを外す(f);
      フォルダを描く(ns);
      /*
       * ★走査し直さない。そのフォルダの下にある曲を抜くだけ。
       * 残るフォルダの曲は、いま持っているものがそのまま正しい。
       */
      const 前 = f.replace(/[\\/]+$/, '');
      tracks = tracks.filter((t) => !t.path.startsWith(前 + '\\') && !t.path.startsWith(前 + '/'));
      描き直す();
    };
    chip.append(name, x);
    box.appendChild(chip);
  }
}

/*
 * ★2026-08-25 作り直し。171,085 曲を登録したらアプリが落ちたため。
 * ファイルを数えるだけで 5 分かかる。**無言の 5 分を作らない。**
 * ・進み具合をその場で出す
 * ・見つかったそばから一覧に足す（全部そろうまで待たせない）
 */
let 走査中 = false;
/** 走査中に溜める場所。いま出ている一覧には混ぜない（二重に並ぶため） */
let 溜まり = [];
/** 走査を始めた時点で、見せるものが無かったか。無ければ途中経過をそのまま出す */
let 見せるものが無い = true;

/** 読み始めた時刻。残り時間を出すために覚えておく */
let 読み始め = 0;

/** アプリ名を変えたときの引き継ぎを知らせる文。1 回だけ出す */
let 引き継ぎの知らせ = '';

/**
 * 残り時間を、**その場で測った速さから**出す。
 *
 * ★決め打ちしない（2026-08-25 実測）。
 * 同じ 1 曲を読むのに、初めて触るファイルは 36 ms、
 * 一度読んだファイルは 1 ms だった。**36 倍違う。**
 * 環境によっても変わるので、いま出ている速さから割り出す。
 */
function 残り時間(済み, 全体) {
  if (!読み始め || 済み < 50 || !全体) return '';
  const 一曲 = (Date.now() - 読み始め) / 済み;
  const 秒 = Math.round(((全体 - 済み) * 一曲) / 1000);
  if (秒 < 90) return `（あと ${秒} 秒ほど）`;
  if (秒 < 5400) return `（あと ${Math.round(秒 / 60)} 分ほど）`;
  return `（あと ${(秒 / 3600).toFixed(1)} 時間ほど）`;
}

// 進み具合。「読み込み中…」だけだと、止まっているのか進んでいるのか分からない
window.mp3.走査の進みを受ける((p) => {
  if (!走査中) return;
  const n = p.済み.toLocaleString('ja-JP');
  const 全 = p.全体 ? ` / ${p.全体.toLocaleString('ja-JP')}` : '';
  if (p.段階 === '読んでいます' && !読み始め) 読み始め = Date.now();
  /*
   * ★長くかかるときは、途中で閉じてよいことを伝える。
   * 171,085 曲を読み直すと 100 分ほどかかる（実測）。
   * 30 秒ごとに覚え書きへ残しているので、閉じても続きから進む。
   * それを言わないと「終わるまで閉じられない」と思わせてしまう。
   */
  const 残り = p.段階 === '読んでいます' ? 残り時間(p.済み, p.全体) : '';
  const 添え = (p.段階 === '読んでいます' && p.全体 > 20000)
    ? ' ／ 途中で閉じても、次に開いたとき続きから進みます' : '';
  $('status').textContent = `${p.段階} ${n}${全}${残り}${添え}`;
});

/*
 * 見つかったそばから溜める。
 * ★いま出ている一覧には混ぜない。混ぜると同じ曲が二重に並ぶ。
 * 一覧が空のとき（＝初回で見せるものが無いとき）だけ、そのまま出す。
 */
window.mp3.走査の途中経過を受ける((部分) => {
  if (!走査中) return;
  溜まり = 溜まり.concat(部分);

  if (見せるものが無い) {
    tracks = 溜まり;
  } else {
    /*
     * ★足されたばかりの曲を、その場で一覧に入れる（2026-08-25）。
     *
     * 以前はここで何もせず、走査が終わるまで溜めるだけだった。
     * 171,085 曲では終わるまで 100 分近くかかるので、
     * **足したファイルが 100 分出てこない。** 本人からそう報告された。
     *
     * いま出ている曲と同じ道のものは入れない（二重に並ぶ）。
     * 道の一覧は毎回作らず、覚えておいて足していく（17 万件を毎回作ると遅い）。
     */
    if (!出ている道) 出ている道 = new Set(tracks.map((t) => t.path));
    let 足した = 0;
    for (const t of 部分) {
      if (出ている道.has(t.path)) continue;
      出ている道.add(t.path);
      tracks.push(t);
      足した += 1;
    }
    if (!足した) return;                   // 描き直す理由が無い
  }

  const 今 = Date.now();
  // ★裏の更新なので「裏で描き直す」を使う。入力中は触らない
  if (今 - 最後に描いた > 描く間隔) { 最後に描いた = 今; 裏で描き直す(); }
});

/** いま一覧に出ている曲の道。途中経過を足すときの重複よけ */
let 出ている道 = null;

let 最後に描いた = 0;
const 描く間隔 = 1500;                    // 1.5 秒に 1 回まで。描きすぎると重くなる

/** 走査を始めた時刻。押しても動かないときに「いつから動いているか」を言うため */
let 走査を始めた = 0;

async function 走査する(押された = false) {
  /*
   * ★二重に走らせない。一覧が二重になるので、ここは変えられない。
   *
   * ただし**黙って返してはいけない**（2026-08-25 実地）。本人からの報告:
   *   > ライブラリのフォルダーにデータを追加して再スキャンしたんですが
   *   > 読み込まれないです
   *
   * 起動すると必ず裏で走査が始まる。171,085 曲だと 100 分近くかかる。
   * その間ずっと「再スキャン」は**押しても何も起きない**状態だった。
   * 壊れているのか、押せていないのか、待てばいいのか、区別がつかない。
   */
  if (走査中) {
    if (押された) {
      const 経過 = 走査を始めた ? Math.round((Date.now() - 走査を始めた) / 1000) : 0;
      const 何分 = 経過 >= 60 ? `${Math.round(経過 / 60)} 分前` : `${経過} 秒前`;
      alert(
        'いま確かめている最中です。\n\n'
        + `${何分}に始まり、まだ終わっていません。\n`
        + '終わるまで、もう一度は始められません（一覧が二重になるため）。\n\n'
        + '進み具合は画面の下端に出ています。\n'
        + '足したファイルは、この確認が終わったときに一覧へ入ります。',
      );
    }
    return;
  }
  走査中 = true;
  走査を始めた = Date.now();

  /*
   * ★いま出ているものを消さない。
   * 消すと、走査が終わるまで一覧が空になる。
   * 171,085 曲だと数分かかるので、その間ずっと「消えた」ように見える
   * （実際にそう言われた）。
   * 途中経過は別に溜めて、終わってから入れ替える。
   */
  溜まり = [];
  見せるものが無い = tracks.length === 0;
  最後に描いた = 0;
  読み始め = 0;                           // 残り時間は、この回の速さで測り直す
  出ている道 = null;                      // 重複よけの一覧は、この回で作り直す
  $('status').textContent = tracks.length
    ? `${tracks.length.toLocaleString('ja-JP')} 曲（確かめています…）`
    : '読み込み中…';

  try {
    const r = await window.mp3.走査する();
    tracks = r.tracks;
    if (Array.isArray(r.lists)) lists = r.lists;   // 走査時に掃除された結果を反映
    // ★走査の終わりも「裏の更新」。入力中に入力欄を壊さない
    裏で描き直す();

    // 指示書の「先に確かめたほうがいいこと」への対応:
    // 表示されなかったファイルがあることを、黙って隠さない
    const 補足 = [];
    const 隠したタグ無し = tracks.filter((t) => !t.タグあり).length;
    if (タグ無しを隠す && 隠したタグ無し) 補足.push(`タグが無く非表示 ${隠したタグ無し} 件`);
    if (r.読めなかった) 補足.push(`読めなかった ${r.読めなかった} 件`);
    // ★数を出すだけでなく、戻すボタンも出す（案内だけして操作が無いのを直した）
    外したものボタンを直す(r.hidden);

    /*
     * ★覚え書きを残せなかったら、はっきり言う（2026-08-25、Aegis の指摘）。
     * 残せないと、171,085 曲・50 分ぶんの読み込みが**毎回捨てられる。**
     * 開発者用の窓にだけ出していたので、使う人には気づきようが無かった。
     */
    if (r.覚え書きの保存 && r.覚え書きの保存.ok === false) {
      alert(
        '読み込んだ結果を保存できませんでした。\n\n'
        + `理由: ${r.覚え書きの保存.error}\n\n`
        + 'このままだと、次に開いたときに**また最初から読み直し**になります。\n'
        + 'ディスクの空きを確かめてください。',
      );
    }
    if (r.hidden) 補足.push(`一覧から外した ${r.hidden} 件`);
    if (r.使い回し) 補足.push(`変わっていない ${r.使い回し} 件は読み直していません`);
    $('status').textContent = `${見える曲().length} 曲${補足.length ? '（' + 補足.join(' / ') + '）' : ''}`;
  } catch (e) {
    // ★黙って失敗させない
    $('status').textContent = '読み込めませんでした: ' + (e && e.message ? e.message : '不明');
  } finally {
    走査中 = false;
  }
}

$('add').onclick = async () => {
  const s = await window.mp3.フォルダを足す();
  if (!s) return;
  フォルダを描く(s);
  await 走査する();
};
$('rescan').onclick = () => 走査する(true);   // ★押されたと伝える（動かないときに黙らないため）

/**
 * 外した曲の数を、ボタンに出す。0 件なら出さない。
 * ★数だけでなく**戻す手段**を置く。案内だけして操作が無いのが、いちばん困る。
 */
function 外したものボタンを直す(件数) {
  const b = $('unhide');
  if (!件数) { b.style.display = 'none'; return; }
  b.style.display = '';
  b.textContent = `↩ 外した ${件数.toLocaleString('ja-JP')} 曲を戻す`;
}

$('unhide').onclick = async () => {
  const s = await window.mp3.設定を取る();
  const 外れている = s.hidden;
  if (!外れている.length) { 外したものボタンを直す(0); return; }

  // 何を戻すのか見せてから聞く。件数だけでは判断できない
  const 見本 = 外れている.slice(0, 8).map((p) => '  ・' + p.replace(/^.*[\\/]/, '')).join('\n');
  if (!confirm(
    `一覧から外した ${外れている.length.toLocaleString('ja-JP')} 曲を、すべて戻します。\n\n`
    + `${見本}${外れている.length > 8 ? `\n  ほか ${外れている.length - 8} 曲` : ''}\n\nよろしいですか？`,
  )) return;

  $('status').textContent = '戻しています…';
  await window.mp3.外したものを戻す();
  /*
   * ★戻したぶんだけ読み直す。走査し直さない。
   * 171,085 曲の走査は 100 分近くかかる。戻すのに 100 分待たせる理由が無い。
   */
  const 返り = await window.mp3.まとめて読み直す(外れている);
  const 道 = new Set(tracks.map((t) => t.path));
  let 戻した = 0;
  for (const t of 返り.tracks) {
    if (!t || 道.has(t.path)) continue;
    道.add(t.path);
    tracks.push(t);
    戻した += 1;
  }
  出ている道 = null;
  外したものボタンを直す(0);
  描き直す();

  const 読めなかった = 返り.tracks.filter((t) => !t).length;
  $('status').textContent = `${戻した.toLocaleString('ja-JP')} 曲を一覧に戻しました`
    + (読めなかった ? `（${読めなかった} 曲は読めませんでした）` : '');
};

(async () => {
  const s = await window.mp3.設定を取る();
  フォルダを描く(s);

  /*
   * ★「戻す」ボタンを、起動したその場で出す（2026-08-25）。
   *
   * 最初は走査が終わったときにしか出していなかった。
   * 86,057 曲では走査に 50 分かかる。**その間ずっと出てこない。**
   * 実際に本人から「出てないです」と言われた。
   *
   * 外した数は設定に入っていて、**起動の時点でもう分かっている。**
   * 分かっているものを、待たせて出す理由が無い。
   */
  外したものボタンを直す(s.hidden.length);

  // 指示書:「元の MP3 を削除したら再生リストからも自動で削除される」
  // 起動時に掃除し、**減ったことを黙らせない**
  再生回数 = await window.mp3.再生回数を取る();
  // ★シャッフルに入れない曲。読まないと、閉じるたびに外した指定が消える
  シャッフル除外 = new Set(await window.mp3.シャッフル除外を取る());
  倍率表 = await window.mp3.倍率を取る();
  列幅 = await window.mp3.列幅を取る();
  // ★覚えた 3 カラムの高さを戻す
  高さを決める(typeof 列幅.__colsHeight === 'number' ? 列幅.__colsHeight : 既定の高さ);

  // ★覚えた音量を戻す。戻さないと、開くたびに大音量から始まる
  音量 = await window.mp3.音量を取る();
  audio.volume = 音量;
  $('vol').value = String(Math.round(音量 * 100));
  $('volicon').textContent = 音量 === 0 ? '🔇' : 音量 < 0.5 ? '🔉' : '🔊';

  // ★覚えた「タグ無しを隠す」を戻す
  タグ無しを隠す = await window.mp3.タグ無しを隠すか();
  $('untagged').classList.toggle('on', タグ無しを隠す);
  $('untagged').textContent = タグ無しを隠す ? '🏷 タグ無しを隠す' : '🏷 タグ無しも出す';

  /*
   * ★アプリ名を変えたときの引き継ぎ。
   * うまくいったなら一言だけ。だめだったなら、はっきり出す。
   * 「消えた」と誤解されるのが、このアプリで一番起きてほしくないこと。
   */
  try {
    const 引 = await window.mp3.引っ越しの結果();
    if (引 && 引.ok === false) {
      alert(
        '以前のデータを引き継げませんでした。\n\n'
        + `元の場所: ${引.元}\n理由: ${引.error}\n\n`
        + 'データは消えていません。上の場所に残っています。\n'
        + 'このまま使うと、フォルダの登録からやり直しになります。',
      );
    } else if (引 && 引.ok) {
      引き継ぎの知らせ = `以前のデータを引き継ぎました（${引.写した.length} 件）`;
    }
  } catch { /* 古い版には無い窓口。無くても困らない */ }

  const r = await window.mp3.リストを取る();
  lists = r.lists;
  if (r.落とした) {
    alert(`再生リストから ${r.落とした} 曲を取り除きました。\n\n元の MP3 ファイルが見つからなくなったためです。`);
  }

  /*
   * ★まず、覚えている一覧をそのまま出す。走査を待たない。
   *
   * 2026-08-25 の実地:
   * > 立ち上げ直したら同期したデータが消えていた
   * 実際は消えておらず、**起動のたびに全走査していた**だけだった。
   * 171,085 曲ではファイルを数えるだけで 5 分かかるので、
   * その間ずっと一覧が空に見える。使う人には区別がつかない。
   *
   * 覚えている一覧なら待ち時間ゼロで出る。
   * ★そのうえで、裏で走査して追いつかせる（消えたファイルや新しい曲を拾う）。
   */
  if (s.folders.length) {
    try {
      const c = await window.mp3.覚えている一覧();
      if (c.tracks.length) {
        tracks = c.tracks;
        描き直す();
        $('status').textContent = (引き継ぎの知らせ ? 引き継ぎの知らせ + ' ／ ' : '')
          + `${c.件数.toLocaleString('ja-JP')} 曲（前回のぶん。いま確かめています…）`;
      }
    } catch { /* 覚えていないだけ。走査すれば出る */ }
    await 走査する();
  } else {
    描き直す();                                 // フォルダが無くてもタブは出す
  }
})();
