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
/*
 * ★OS のダイアログ（confirm / alert）は使わない（2026-08-29 実測）。
 *
 * 本人からの報告:
 *   > 全部外すをやるとまだ文字が打てないのですが
 *
 * 測ったら、遅いのではなかった（描き直しは 148 ms）。
 * **ダイアログを閉じたあと、窓が OS の焦点を失ったままだった。**
 *   ダイアログの前  document.hasFocus() = true
 *   閉じたあと      document.hasFocus() = **false**
 *
 * 欄の焦点（activeElement）は記入欄のままなので、**見た目は打てそうに見える。**
 * でもキーは OS が焦点だと思っている別の窓へ行く。分かりにくい壊れ方。
 *
 * ★こちらから焦点を戻す道も試したが、**当てにならなかった。**
 *   win.focus() … 効くときと効かないときがある（実測で両方見た）
 *   Windows は「裏の窓が勝手に前へ出る」のを止めるので、戻せる保証が無い
 *
 * ★だから OS に出さない。**画面の中で訊く。**
 * prompt() が使えなかったときと、まったく同じ答えになった。
 * 画面の中なら、そもそも焦点が窓から出ない。
 */

/** 画面の中の確認欄。開いている間だけ 決着 が入る */
let 訊いている = null;

function 訊く欄を閉じる(答) {
  const box = document.getElementById('ask');
  if (box) box.className = '';
  const 決着 = 訊いている;
  訊いている = null;
  if (決着) 決着(答);
}

/**
 * 画面の中で訊く。OS のダイアログの代わり。
 *
 * @param 文     見せる文（改行そのまま）
 * @param 選ぶか true なら「はい／やめる」、false なら「閉じる」だけ
 * @returns はい なら true
 */
function 訊く(文, 選ぶか) {
  const box = document.getElementById('ask');
  // ★出せないときは黙って通さない。消す操作が黙って進むほうが怖い
  if (!box) return Promise.resolve(!選ぶか);
  // すでに開いていたら、そちらを閉じてから（重ねない）
  if (訊いている) 訊く欄を閉じる(false);

  box.querySelector('.msg').textContent = 文;
  const 並び = box.querySelector('.row');
  並び.innerHTML = '';

  const 作る = (札, 答, 主) => {
    const b = document.createElement('button');
    b.textContent = 札;
    if (主) b.className = 'main';
    b.onclick = () => 訊く欄を閉じる(答);
    並び.appendChild(b);
    return b;
  };

  const 出来 = new Promise((決着) => { 訊いている = 決着; });
  if (選ぶか) {
    作る('やめる', false, false);
    const はい = 作る('はい', true, true);
    setTimeout(() => はい.focus(), 0);
  } else {
    const 閉 = 作る('閉じる', true, true);
    setTimeout(() => 閉.focus(), 0);
  }
  box.className = 'on';
  return 出来;
}

/** はい／やめる を訊く（confirm の代わり） */
const 確かめる = (文) => 訊く(文, true);
/** 知らせるだけ（alert の代わり） */
const 知らせる = (文) => 訊く(文, false);

/* Enter で「はい」、Escape で「やめる」。押しやすさは OS のものと同じにする */
document.addEventListener('keydown', (e) => {
  if (!訊いている) return;
  if (e.key === 'Escape') { e.preventDefault(); 訊く欄を閉じる(false); }
  if (e.key === 'Enter') { e.preventDefault(); 訊く欄を閉じる(true); }
});

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
/*
 * ★「まとめ」は、ジャンル名をまとめた親で絞るための欄（2026-08-30 本人の希望）。
 *   > ジャンル名が適当に付けられたデータがたくさんあって困ってる
 *
 * ★genre とは別の鍵にしてある。同じ鍵にすると、
 * 隠れているタブの絞り込みも効く作りなので、生の名前と親の名前が
 * ひとつの欄で衝突して、どちらのタブでも何も出なくなる。
 */
let sel = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null, 言葉: null, 響演者: null, 響盤: null, まとめ: null };

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
  /*
   * ★響きのタブ（2026-08-29 本人の希望）。
   *   > 今は選ばれたバンドが入力欄の横に並ぶので、カラムに並べたいです。
   *
   * 札を横に並べると 10 個で打ち止めになり、探せない。
   * カラムに入れれば、いつもの 3 段（絞る・複数選ぶ・打ち込んで探す）が
   * そのまま使える。**新しい操作を覚えなくていい。**
   */
  /*
   * ★ジャンルをまとめて見るタブ（2026-08-30 本人の希望）。
   *
   * ★作りとしては、tag タブの genre を「親の名前」に差し替えただけ。
   * 絞り込み・複数選び・打ち込んで探すは、いつもの仕掛けがそのまま効く。
   * **新しい操作を覚えなくていい**し、AI DJ も響きも、
   * 組む範囲() が 絞る() を通るので、黙って付いてくる。
   */
  まとめ: [
    { key: 'まとめ', 見出し: 'ジャンル（まとめ）', 取る: (t) => まとめた名(まとめ索引, t.genre) },
    { key: 'artist', 見出し: 'アーティスト', 取る: (t) => t.artist },
    { key: 'album', 見出し: 'アルバム', 取る: (t) => t.album },
  ],
  resonance: [
    { key: '言葉', 見出し: '辿った言葉', 取る: (t) => 響きの印(t, 'keyword') },
    { key: '響演者', 見出し: '演者', 取る: (t) => 響きの印(t, 'artist') },
    { key: '響盤', 見出し: 'アルバム', 取る: (t) => t.album },
  ],
};

/** その曲が響きで当たっていれば、その手がかりを返す。当たっていなければ null */
function 響きの印(t, 欄) {
  const v = 響きの当たり && 響きの当たり.曲.get(t.path);
  return v ? v[欄] : null;
}

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
/*
 * ★ジャンル名のまとめ（2026-08-30 本人の希望）。
 *
 * ★これは**別の層**。元のジャンル名にも mp3 のタグにも触らない。
 * 見るときに重ねるだけなので、捨てれば元通りになる。
 * 実測では 86,044 曲に 98 種類のジャンル名が付いていて、
 * 荒れ方は打ち間違いではなく**粒の大きさのばらつき**だった。
 */
let ジャンルのまとめ = { 組: [], 作った日: '' };
let まとめ索引 = new Map();

/**
 * AI のまとめを見てもらう。**押す前に、何がどう変わるかを全部見せる。**
 *
 * ★勝手に当てない。ジャンルの区別はこの人が聴くのに使っているもので、
 * こちらが良かれと思って潰していいものではない。
 * 親ごとに外せるようにして、外したぶんは元の名前のまま残す。
 *
 * @returns 採る組の並び。やめたら null
 */
function まとめを見せて訊く(結果) {
  const box = document.getElementById('ask');
  if (!box) return Promise.resolve(null);
  if (訊いている) 訊く欄を閉じる(false);

  const 箱 = box.querySelector('.box');
  箱.className = 'box wide';
  const 文 = box.querySelector('.msg');
  文.innerHTML = '';

  const 見出し = document.createElement('div');
  const 曲の合計 = 結果.組.reduce((a, c) => a + c.曲数, 0);
  見出し.textContent = `AI が ${結果.組.length} 組にまとめました（${曲の合計.toLocaleString('ja-JP')} 曲ぶん）。`
    + String.fromCharCode(10) + '要らない組はチェックを外してください。外したものは元の名前のまま残ります。';
  文.appendChild(見出し);

  const 並び = document.createElement('div');
  並び.className = 'groups';
  const 印たち = [];
  for (const c of 結果.組) {
    const l = document.createElement('label');
    const 印 = document.createElement('input');
    印.type = 'checkbox';
    印.checked = true;
    印たち.push([印, c]);
    const 親 = document.createElement('span');
    親.className = 'oya';
    親.textContent = ' ' + c.親 + ' ';
    const 数 = document.createElement('span');
    数.className = 'kazu';
    数.textContent = `（${c.子.length} 個 / ${c.曲数.toLocaleString('ja-JP')} 曲）`;
    const 子 = document.createElement('span');
    子.className = 'ko';
    子.textContent = c.子.join('、');
    l.append(印, 親, 数, 子);
    if (c.訳) {
      const 訳 = document.createElement('span');
      訳.className = 'wake';
      訳.textContent = c.訳;
      l.appendChild(訳);
    }
    並び.appendChild(l);
  }
  文.appendChild(並び);

  /*
   * ★まとめなかったものと、落としたものを必ず出す。
   * 黙って減っていると、どこへ行ったのか分からなくなる。
   */
  const 添え = document.createElement('div');
  添え.className = 'said';
  const 言い分 = [];
  if (結果.残り.length) 言い分.push(`まとめなかった名前 ${結果.残り.length} 個は、そのまま残ります`);
  const 落 = 結果.落とした || {};
  if (落.手元に無い && 落.手元に無い.length) {
    言い分.push(`AI が挙げた ${落.手元に無い.length} 個は手元に無い名前だったので外しました`);
  }
  if (落.二重 && 落.二重.length) 言い分.push(`${落.二重.length} 個は二重だったので先の組に入れました`);
  添え.textContent = 言い分.join('。');
  if (言い分.length) 文.appendChild(添え);

  const 行 = box.querySelector('.row');
  行.innerHTML = '';
  const 作る = (札, 答, 主) => {
    const b = document.createElement('button');
    b.textContent = 札;
    if (主) b.className = 'main';
    b.onclick = () => {
      箱.className = 'box';
      訊く欄を閉じる(答);
    };
    行.appendChild(b);
    return b;
  };
  作る('やめる', false, false);
  const はい = 作る('これでまとめる', true, true);
  setTimeout(() => はい.focus(), 0);

  const 出来 = new Promise((決着) => { 訊いている = 決着; });
  box.className = 'on';
  return 出来.then((答) => {
    箱.className = 'box';
    if (!答) return null;
    return 印たち.filter(([印]) => 印.checked).map(([, c]) => c);
  });
}

/**
 * ジャンル名を AI にまとめさせる（2026-08-30 本人の希望）。
 *   > ジャンル名が適当に付けられたデータがたくさんあって困ってるんですが、
 *   > AI がいい感じにまとめてくれる機能って作れますか？
 *
 * ★送るのは**ジャンル名と曲数だけ**。曲は 1 曲も送らない。
 * ★元のジャンル名にも mp3 のタグにも触らない。まとめは別の層。
 */
async function ジャンルをまとめる(言った) {
  /*
   * ★数えるのは「いま見えている曲」全部から。
   * カラムで絞っていると、その中のジャンルしか出てこない。
   * まとめるのは蔵書ぜんぶの話なので、絞りを通さない。
   */
  const 一覧 = ジャンルを数える(見える曲());
  if (!一覧.length) {
    知らせる('まとめられるジャンル名がありません。先にフォルダを走査してください。');
    return;
  }

  言った.textContent = `${一覧.length} 種類のジャンル名をまとめています…`;
  const r = await window.mp3.ジャンルをまとめさせる(
    一覧.map((g) => ({ 名: g.名, 鍵: g.鍵, 曲数: g.曲数 })),
  );
  if (!r || !r.ok) {
    言った.textContent = 'だめでした';
    $('status').textContent = '⚠ まとめられませんでした: ' + ((r && r.error) || '不明');
    return;
  }
  if (!r.組.length) {
    言った.textContent = '';
    知らせる('まとめられる組が見つかりませんでした。いまのままで十分ばらけていないようです。');
    return;
  }

  言った.textContent = '';
  const 採る = await まとめを見せて訊く(r);
  if (!採る || !採る.length) {
    $('status').textContent = 'ジャンルのまとめはやめました（何も変わっていません）';
    return;
  }

  const 覚え = {
    組: 採る.map((c) => ({ 親: c.親, 子: c.子, 訳: c.訳 })),
    作った日: new Date().toISOString().slice(0, 10),
  };
  const 返り = await window.mp3.ジャンルのまとめを覚える(覚え);
  if (!返り || !返り.ok) {
    $('status').textContent = '⚠ まとめを覚えられませんでした';
    return;
  }
  まとめを入れる(返り.ジャンルのまとめ);
  /* ★まとめたら、そのタブを開いて見せる。押した結果がその場で見えないと分からない */
  カラムタブ = 'まとめ';
  sel = { ...sel, まとめ: null };
  描き直す();
  const 曲 = 採る.reduce((a, c) => a + c.曲数, 0);
  $('status').textContent = `ジャンルを ${採る.length} 組にまとめました`
    + `（${曲.toLocaleString('ja-JP')} 曲ぶん）。元のジャンル名はそのまま残っています`;
}

/**
 * まとめの有無に合わせて、2 つのボタンを直す。
 *
 * ★AI の欄は「形（none/mood/key）が変わったときだけ」作り直す作りなので、
 * まとめただけでは札が古いままになる。描き直すたびにここで直す。
 */
function まとめのボタンを直す() {
  /* ★手直しの有無で、2 つのボタンを出し隠しする（欄は作り直さないので、ここで） */
  const 件 = Object.keys((手直し && 手直し.曲) || {}).length;
  for (const id of ['naoshishow', 'naoshioff']) {
    const e = $(id);
    if (e) e.style.display = 件 ? '' : 'none';
  }
  const 捨 = $('naoshioff');
  if (捨 && 件) 捨.textContent = `手直しを捨てる（${件.toLocaleString('ja-JP')} 曲）`;
  const 組む = $('aigenre');
  if (組む) {
    組む.textContent = ジャンルのまとめ.組.length ? 'ジャンル名をまとめ直す' : 'ジャンル名をまとめる';
  }
  const やめ = $('aigenreoff');
  if (やめ) やめ.style.display = ジャンルのまとめ.組.length ? '' : 'none';
}

/** 手直しの控え（★消せる別ファイル『手直し.json』に残してある） */
let 手直し = { 曲: {}, 直した日: '' };
let 手直しの置き場 = '';
/** ★「整える」道具箱を開いているか。閉じたままが既定（毎日は使わないので） */
let 道具箱を開いている = false;

/**
 * ジャンルの付いていない曲を埋める（2026-08-30 本人の希望）。
 *   > ジャンル名無しのデータがたくさんあってそれをいちいち振り分けるのが大変だから
 *   > AI の力でジャンル名無しのデータを他のジャンルに振り分けられないでしょうか？
 *   > 多少の間違いはありにします
 *
 * ★まず手元で決める。AI に訊くのは、それでも決まらなかったぶんだけ。
 * 実測（86,044 曲）: ジャンル未定 2,601 曲のうち **59% は手元で決まる**。
 * 同じ演者の別の曲に付いているジャンルを使うので、推測ですらない。
 */
async function ジャンルを埋める(言った) {
  const 全部 = 見える曲();
  const { 決まった, 残り } = 演者から決める(全部);
  if (!決まった.length && !残り.length) {
    知らせる('ジャンルの付いていない曲はありません。');
    return;
  }

  /* ★AI に訊くのは、手元で決まらなかったぶんだけ */
  let AIの分 = { 決まった: [], 落とした: null, 訊いた: 0 };
  if (残り.length) {
    言った.textContent = `${残り.length} 組を AI に訊いています…`;
    const 一覧 = ジャンルを数える(全部).filter((g) => !ジャンル未定か({ genre: g.名 })).map((g) => g.名);
    const r = await window.mp3.ジャンルを埋めさせる(
      残り.map((b) => ({ artist: b.artist, 盤: [...b.盤], 曲: b.曲 })),
      一覧,
    );
    if (!r || !r.ok) {
      言った.textContent = 'だめでした';
      $('status').textContent = '⚠ 振り分けられませんでした: ' + ((r && r.error) || '不明');
      /* ★AI がだめでも、手元で決まったぶんは活かす */
      if (!決まった.length) return;
    } else {
      AIの分 = r;
    }
  }
  言った.textContent = '';

  /* AI のぶんを、曲ごとの形にほどく */
  const AI曲 = [];
  for (const c of AIの分.決まった) {
    for (const x of c.曲) {
      AI曲.push({ path: x.path, genre: c.genre, 元: x.元, 訳: `AI: ${c.訳 || c.artist}` });
    }
  }

  const 採る = await 埋め方を見せて訊く(決まった, AIの分, AI曲);
  if (!採る || !採る.length) {
    $('status').textContent = 'ジャンルの振り分けはやめました（何も変わっていません）';
    return;
  }

  const 返り = await window.mp3.手直しを足す(採る, new Date().toISOString().slice(0, 10));
  if (!返り || !返り.ok) {
    $('status').textContent = '⚠ 手直しを覚えられませんでした';
    return;
  }
  手直し = 返り.手直し;
  /* ★手元の曲にも当てる。走査し直さずに、その場で見えるように */
  for (const x of 採る) {
    const i = tracks.findIndex((t) => t.path === x.path);
    if (i >= 0) tracks[i] = { ...tracks[i], genre: x.genre, 手直し: true };
  }
  sel = { ...sel, genre: null, まとめ: null };
  描き直す();
  $('status').textContent = `${採る.length.toLocaleString('ja-JP')} 曲にジャンルを入れました`
    + `（手元で ${採る.filter((x) => !/^AI: /.test(x.訳 || '')).length} 曲、AI で ${採る.filter((x) => /^AI: /.test(x.訳 || '')).length} 曲）`
    + '。手直し.json に残してあるので、消せば元通りになります';
}

/**
 * 埋め方を見せて訊く。★手元で決まったぶんと AI のぶんを、分けて見せる。
 * どちらを信じるかが違うので、混ぜて見せてはいけない。
 */
function 埋め方を見せて訊く(決まった, AIの分, AI曲) {
  const box = document.getElementById('ask');
  if (!box) return Promise.resolve(null);
  if (訊いている) 訊く欄を閉じる(false);
  const 箱 = box.querySelector('.box');
  箱.className = 'box wide';
  const 文 = box.querySelector('.msg');
  文.innerHTML = '';

  const 見出し = document.createElement('div');
  見出し.textContent = `ジャンルの付いていない ${(決まった.length + AI曲.length).toLocaleString('ja-JP')} 曲に、ジャンルを入れます。`
    + String.fromCharCode(10) + '要らない組はチェックを外してください。';
  文.appendChild(見出し);

  const 印たち = [];
  const 束 = document.createElement('div');
  束.className = 'groups';
  const 段 = (題, 説き) => {
    const h = document.createElement('div');
    h.className = 'wake';
    h.style.padding = '6px 10px';
    h.style.background = 'var(--accent-bg)';
    h.textContent = 題 + (説き ? `　${説き}` : '');
    束.appendChild(h);
  };
  const 行 = (札, 訳, 曲たち) => {
    const l = document.createElement('label');
    const 印 = document.createElement('input');
    印.type = 'checkbox';
    印.checked = true;
    印たち.push([印, 曲たち]);
    const 名 = document.createElement('span');
    名.className = 'oya';
    名.textContent = ' ' + 札 + ' ';
    const 数 = document.createElement('span');
    数.className = 'kazu';
    数.textContent = `（${曲たち.length} 曲）`;
    l.append(印, 名, 数);
    if (訳) {
      const w = document.createElement('span');
      w.className = 'wake';
      w.textContent = 訳;
      l.appendChild(w);
    }
    束.appendChild(l);
  };

  /* ★手元で決まったぶん。演者ごとにまとめて見せる */
  if (決まった.length) {
    段(`◆ 手元で決まったもの（${決まった.length.toLocaleString('ja-JP')} 曲）`,
      '同じ演者の別の曲に付いているジャンルです。推測ではありません');
    const 演者ごと = new Map();
    for (const x of 決まった) {
      const k = 小文字(String(x.artist || '')) + ' / ' + x.genre;
      if (!演者ごと.has(k)) 演者ごと.set(k, { artist: x.artist, genre: x.genre, 訳: x.訳, 曲: [] });
      演者ごと.get(k).曲.push(x);
    }
    for (const b of [...演者ごと.values()].sort((a, c) => c.曲.length - a.曲.length)) {
      行(`${b.artist} → ${b.genre}`, b.訳, b.曲);
    }
  }

  /* ★AI のぶん */
  if (AI曲.length) {
    段(`◆ AI が当てたもの（${AI曲.length.toLocaleString('ja-JP')} 曲）`,
      '手元に手がかりが無かったぶんです。多少の外れはあります');
    for (const c of AIの分.決まった) {
      const 曲たち = AI曲.filter((x) => x.訳 === `AI: ${c.訳 || c.artist}`);
      if (曲たち.length) 行(`${c.artist} → ${c.genre}`, c.訳, 曲たち);
    }
  }
  文.appendChild(束);

  const 添え = document.createElement('div');
  添え.className = 'said';
  const 言い分 = [];
  const 落 = AIの分.落とした;
  if (落 && 落.知らないジャンル && 落.知らないジャンル.length) {
    言い分.push(`AI が挙げた ${落.知らないジャンル.length} 個は手元に無いジャンル名だったので外しました`);
  }
  const 当たらず = (AIの分.訊いた || 0) - (AIの分.決まった || []).length;
  if (当たらず > 0) 言い分.push(`${当たらず} 組は AI も見当が付きませんでした（そのままです）`);
  言い分.push('入れたぶんは 手直し.json に残ります。消せば元通りになります');
  添え.textContent = 言い分.join('。');
  文.appendChild(添え);

  const 並 = box.querySelector('.row');
  並.innerHTML = '';
  const 作る = (札, 答, 主) => {
    const b = document.createElement('button');
    b.textContent = 札;
    if (主) b.className = 'main';
    b.onclick = () => { 箱.className = 'box'; 訊く欄を閉じる(答); };
    並.appendChild(b);
    return b;
  };
  作る('やめる', false, false);
  const はい = 作る('これで入れる', true, true);
  setTimeout(() => はい.focus(), 0);

  const 出来 = new Promise((決着) => { 訊いている = 決着; });
  box.className = 'on';
  return 出来.then((答) => {
    箱.className = 'box';
    if (!答) return null;
    const 出 = [];
    for (const [印, 曲たち] of 印たち) if (印.checked) 出.push(...曲たち);
    return 出;
  });
}

/** まとめを入れ替えて、索引を作り直す */
function まとめを入れる(v) {
  ジャンルのまとめ = ジャンルのまとめを整える(v);
  まとめ索引 = ジャンルの索引を作る(ジャンルのまとめ);
}

/*
 * ★自分の音源（2026-08-30 本人の話）。
 *   > 自分のバンド1は僕のバンドで作曲途中のデータがたくさんあって
 *   > それが読み込まれてるんです。これはシャッフルの対象にされたくない
 *   > というのがありました。それで、タグなしを表示しないとか、
 *   > そういうことを考えていたという経緯がありました。
 *
 * ★これまで「タグ無しを隠す」でやろうとしていたが、**半分しか効いていなかった。**
 * 実測: 本人の 4 バンドで 453 曲。うちタグが付いているものが 219 曲あり、
 * タグ無しを隠すで消えるのは 48% だけだった。
 * iTunes の頃にタグが付いてしまったものが、そのまま残っていた。
 *
 * ★覚えるのは**演者名**。曲のパスではない。
 * パスだと、走査し直したり新しく録ったぶんが、また混ざる。
 * 実測でも演者名なら 453 曲すべて拾えた（フォルダだと 451 曲）。
 *
 * ★完全一致で見る。部分一致にすると「自分のバンド3」で
 * **名前を含む別のバンド（別のバンド）10 曲**まで巻き込む。
 *
 * ★曲は消さない。一覧にも残る。押せば鳴る。
 * 「不意に流れてほしくない」だけで、「聴きたくない」ではない。
 */
let 自分の音源 = new Set();

/** その曲が、自分の音源か（★演者名の完全一致） */
function 自分のか(t) {
  if (!自分の音源.size) return false;
  return 自分の音源.has(小文字(String((t && t.artist) || '').trim()));
}

let シャッフル除外 = new Set();

/** Shift の範囲選択で使う、直前に押した位置（列ごと） */
let 列の起点 = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null, 言葉: null, 響演者: null, 響盤: null };
/** いま列に出している並び（Shift の範囲を数えるのに使う） */
let 列の並び = { genre: [], artist: [], album: [], 年: [], 月: [], 日: [], 言葉: [], 響演者: [], 響盤: [] };
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
/**
 * 絞り込みを全部外す。
 *
 * ■ 本人の報告（2026-08-30）
 *   > 「ジャンル/アーティスト/アルバム」タブと自分で生成した「ジャンルタブ」があり、
 *   > プレイリストの「ライブラリ」ボタンもあって
 *   > 「どうやってリセットするんだ？」となります。
 *
 * ★タブが増えたぶん、外す場所も増えた。
 * 隠れているタブの絞りも効く作りなので、**見えている列を「すべて」に
 * 戻しても、まだ絞られている**ことがある。それが分かりにくさの正体。
 *
 * ★sel の鍵から作る。欄を足したときに、ここを直し忘れて
 * 「1 つだけ外れない」が起きないように。
 * （同じ形の事故を、止める／戻すの一覧で一度やっている）
 */
function 絞りを外す() {
  const 新 = {};
  for (const k of Object.keys(sel)) 新[k] = null;
  sel = 新;
}

function 絞る(level) {
  const 響き中 = カラムタブ === 'resonance';
  return 見える曲().filter((t) => {
    /*
     * ★響きのタブを開いている間は、**響きで当たった曲だけ**を対象にする。
     * このタブは「辿って見つかったもの」を見る場所なので、
     * 当たっていない曲が混ざると、何を見ているのか分からなくなる。
     */
    if (響き中 && !(響きの当たり && 響きの当たり.曲.has(t.path))) return false;
    // 開いているタブは level まで、隠れているタブはすべての列を効かせる
    for (const 名 of Object.keys(カラムタブの列)) {
      if (!タブに合う(t, 名, 名 === カラムタブ ? level : 3)) return false;
    }
    return true;
  });
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


/* ── 気分でおすすめ ─────────────────────────────────────
   本人の希望（2026-08-29）:
     > その時の気分を言うと AI がおすすめして曲を選んでくれる

   ★AI に曲は選ばせない。**3 カラムに入れる値**を選ばせる。
   そうすると、AI が何をしたかが画面に見えるし（カラムが選ばれた状態になる）、
   納得できなければ手で直せる。無い曲を作られる心配も無い。
   選んだあとは、いまのシャッフルがそのまま働く。

   ★キーが無ければ、この欄は出ない（本人の指示）。出さないだけで、
   ほかの機能は今までどおり動く。 */

let AIが使える = false;
/*
 * キーを打っている最中かどうか（2026-08-29 実地）。
 *
 * ★prompt() は使えない。**Electron では動かない。**
 * このファイルの上のほう（再生リスト名のところ）に、その注意書きを
 * 自分で書いてあったのに、ここで踏んだ。本人からの報告:
 *   > そのボタンを押すと処理が走ってエラーがでます。
 * alert と confirm は動くのに prompt だけ使えない、という分かりにくい所。
 * 再生リスト名と同じく、**画面の中に入力欄を出す**形にする。
 */
let キー入力 = null;

/* ── ★つまみ（対象の幅・選出の量）────────────────────────
   本人の希望（2026-08-29）:
     > AI DJとResonaceですが、対象の幅と選出の量の幅をスライダーで
     > 最小から最大まで選べるようにってできますか？
     > この２つのスライダーを一組として、AI DJとResonace両方に適用

   ★一組で足りる。2 つの道（気分から／言葉から辿って）は、最後に同じ
   プレイリストを作らせる() に入るので、幅と量の意味が共通になる。

   ★段の数も値も、ここには書かない。すべて ai.js の表から受け取る。
   画面にも数を書くと、段を足したとき片方だけ直す事故になる。
   ────────────────────────────────────────────────── */

/** ai:sizes から取った { 目盛, 目盛の数, 幅の段, 量の段 }。取れなければ null（つまみが出ないだけ） */
let AIのつまみ = null;

async function AIのつまみを取り直す() {
  try {
    const v = await window.mp3.AIの大きさ();
    AIのつまみ = (v && v.目盛 && Array.isArray(v.幅の段) && Array.isArray(v.量の段)) ? v : null;
  } catch {
    // ★取れなくても壊さない。つまみが出ないだけで、既定の大きさで動く
    AIのつまみ = null;
  }
}

/**
 * 1 本組むのにかかる、おおよその金額（円）。
 *
 * ★実測（2026-08-29、本人の 86,044 曲）。候補 1 曲は 51 文字 ≒ 23 ﾄｰｸﾝ。
 * 頼み文が 700 ﾄｰｸﾝ、返事は 1 曲 30 ﾄｰｸﾝ見当。
 * Opus 5 の 100万ﾄｰｸﾝあたり $5 / $25 を、150 円/ドルで換算した。
 *
 * ★あくまで目安。値段も為替も変わる。だから画面にも「目安」と書く。
 * それでも出すのは、**つまみを動かす前に見当がつかないと動かせない**から。
 */
function つまみの目安円(幅, 量) {
  const 入り = 幅.候補 * 23 + 700;
  const 出 = 量.曲数 * 30;
  return Math.round((入り * 5 + 出 * 25) / 1000000 * 150 * 10) / 10;
}

/**
 * つまみの行を作る。読み込めていなければ null（呼んだ側は足さない）。
 */
function つまみの行() {
  if (!AIのつまみ) return null;
  const 段数 = AIのつまみ.目盛の数 || AIのつまみ.幅の段.length;

  const 棒を作る = (id, いま) => {
    const b = document.createElement("input");
    b.type = "range"; b.id = id; b.min = "1"; b.max = String(段数); b.step = "1";
    b.value = String(いま);
    return b;
  };
  const 字 = (文, 組) => { const e = document.createElement("span"); e.textContent = 文; if (組) e.className = 組; return e; };

  const 行 = document.createElement("div");
  行.className = "knobs";

  const 幅棒 = 棒を作る("aiwide", AIのつまみ.目盛.幅);
  幅棒.title = "何を見渡すか。AI に渡す候補の曲数・辿る名前の数・選ばせるジャンル数が、いっしょに変わります";
  const 幅札 = 字("", "val"); 幅札.id = "aiwidelabel";

  const 量棒 = 棒を作る("aimany", AIのつまみ.目盛.量);
  量棒.title = "一本を何曲にするか";
  const 量札 = 字("", "val"); 量札.id = "aimanylabel";

  /*
   * ★文脈の強度（2026-08-29 本人の希望）:
   *   > AI DJとResonaceで文脈の王道を守ってほしいときと外してほしいときがある
   * 前は決め打ちで、いつも「外す」側だった。守りたいときに守れなかった。
   */
  const 強棒 = 棒を作る("aistrict", AIのつまみ.目盛.強度 ?? 3);
  強棒.title = "その言葉・気分の王道を守るか、外すか。外すほど深く考えさせるので、少し高くなります";
  const 強札 = 字("", "val"); 強札.id = "aistrictlabel";

  const 説き = 字("", "said"); 説き.id = "aiknobsaid";

  const 札を直す = () => {
    const 幅 = AIのつまみ.幅の段[Number(幅棒.value) - 1];
    const 量 = AIのつまみ.量の段[Number(量棒.value) - 1];
    const 強 = (AIのつまみ.強度の段 || [])[Number(強棒.value) - 1];
    if (!幅 || !量) return;
    幅札.textContent = 幅.札;
    量札.textContent = 量.曲数 + " 曲";
    強札.textContent = 強 ? 強.札 : "";
    /*
     * ★何が変わるのかを、そのまま出す。
     * 「狭い〜広い」だけだと、押すまで何が起きるか分からない。
     */
    説き.textContent = `候補 ${幅.候補} 曲 ／ 辿る名前 ${幅.名前} 個 ／ ジャンル ${幅.ジャンル} まで`
      + (強 ? `　文脈は「${強.札}」` : '')
      + `　→ ${量.曲数} 曲の一本（目安 ${つまみの目安円(幅, 量)} 円）`;
  };

  /*
   * ★動かしている間は書かない（oninput）。離したときに 1 回だけ書く（onchange）。
   * 動かすたびに設定ファイルを書くと、端から端まで動かすだけで 5 回書くことになる。
   */
  const 覚える = async () => {
    札を直す();
    const r = await window.mp3.AIのつまみを変える({
      幅: Number(幅棒.value), 量: Number(量棒.value), 強度: Number(強棒.value),
    });
    if (r && Number.isFinite(r.幅) && Number.isFinite(r.量)) AIのつまみ = { ...AIのつまみ, 目盛: r };
  };
  幅棒.oninput = 札を直す; 量棒.oninput = 札を直す; 強棒.oninput = 札を直す;
  幅棒.onchange = 覚える; 量棒.onchange = 覚える; 強棒.onchange = 覚える;
  札を直す();

  行.append(字("対象の幅"), 幅棒, 幅札, 字("選出の量"), 量棒, 量札, 字("文脈の強度"), 強棒, 強札, 説き);

  // ★いま何から組むのかを、押す前に見せる（誤爆を防ぐ）
  const 範囲 = document.createElement("div");
  範囲.className = "scope";
  行.appendChild(範囲);
  return 行;
}

/** 再生リストの絞り込み。数が増えたので探せるようにした（2026-08-29） */
let 再生リストの絞り = "";

/** 打ちかけの言葉。描き直しで消えないように覚えておく */
let 打ちかけの言葉 = "";
let 打ちかけの辿る言葉 = "";
/** AI がつけた 1 曲ごとのひとこと { パス: 文 }。その場かぎり（覚え書きには入れない） */
const AIのひとこと = new Map();

/**
 * AI が選んだ範囲から、候補を引く。
 *
 * ★くじは いつものシャッフルのもの（次を選ぶ）を使う。
 * 均等に引くと、曲数の多いアーティストばかり候補に入る。
 * 再生回数の重みを効かせたまま引けば、**忘れている曲が候補に入りやすい**
 * という、このアプリの性格をそのまま持ち込める。
 *
 * ★鳴らせない曲（ALAC）と、シャッフルから外した曲は最初から入れない。
 * 候補に入れて選ばれると、押しても鳴らない一本ができあがる。
 */
/**
 * ★響きで当たった曲を、候補に入りやすくする。
 *
 * くじの重みは「再生回数が少ないほど重い」。そこに響きの重みを掛ける。
 * 掛けるだけなので、**忘れている曲を拾う性格は残る。**
 * 響きが無ければ 1 倍（＝これまでどおり）。
 */
function 響きの重み表() {
  if (!響きの当たり || !響きの当たり.曲.size) return null;
  const 表 = {};
  for (const [p, v] of 響きの当たり.曲) 表[p] = v.重み;
  return 表;
}

/** 並びをまぜる（Fisher-Yates）。sort(() => Math.random() - .5) は偏るので使わない */
function まぜる(並び) {
  const a = [...並び];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * AI に渡す候補を引く。
 *
 * ■ ★演者ごとに 1 曲ずつ、巡を回して集める（2026-08-29 本人の希望）
 *   > AI DJの選曲で同じバンドのものがいくつかあるので
 *   > 選択肢が多い場合は同じバンドやアルバムは極力選ばないようにしたいです。
 *
 * ★頼み文に「同じアーティストを続けない」と書くだけでは効かなかった。
 * **候補そのものが偏っていた**から。曲を 1 曲ずつ引くと、持っている曲数が
 * 多いバンドほど何度も当たる。AI は偏った 200 曲から選ぶしかない。
 *
 * ★だから、引き方を変える。演者を 1 周して 1 曲ずつ取り、足りなければ
 * 2 周目に入る。**巡の数が、そのまま「1 人あたり何曲まで」になる。**
 * 避けられないときは避けない ―― シャッフルと同じ考え方（shuffle.js）。
 *
 * ★実測（本人の 85,327 曲・候補 200 曲・5 回引いた平均）。同じ演者の最多:
 *
 *   全部 85,327 曲       2.2 曲 → **1.0 曲**（だぶり 7.8 → 0）
 *   Hardcore 12,537 曲   4.4 曲 → **1.0 曲**（だぶり 39.2 → 0）
 *   演者 30 人 5,263 曲 17.8 曲 → **7.0 曲**（30 人で 200 曲なら 7 が下限）
 *   演者 5 人 1,667 曲  53.4 曲 → **40.0 曲**（5 人で 200 曲なら 40 が下限）
 *
 * ★狭いところでは下限まで下がっている。これ以上は演者がいない。
 *
 * ★くじは いつものシャッフルのもの（次を選ぶ）を使う。
 * ただし引くのは**その演者の中だけ**。再生回数の重みは残るので、
 * 「忘れている曲が候補に入りやすい」という性格はそのまま。
 *
 * ★鳴らせない曲（ALAC）と、シャッフルから外した曲は最初から入れない。
 * 候補に入れて選ばれると、押しても鳴らない一本ができあがる。
 */
/**
 * AI が組むときの範囲。
 *
 * ■ 実地の不具合（2026-08-30）。本人からの報告:
 *   > ライブラリを開いて聞いてる時に AI DJ や Resonance で新しいプレイリストを
 *   > 作ろうとして、プレイリスト内の曲内で再度プレイリストを作る誤爆を
 *   > 何度もやってしまいます。
 *   > カラム上ではジャンル選択をするからちゃんと選んでる気になって操作してしまいます。
 *
 * ★原因はこちらの作り。いまの列() は**再生リストを開いていると、その中身**を返す。
 * 流すときはそれで正しい（開いた一本を流すのだから）。
 * でも**組むときは違う。** カラムでジャンルを選んでいるのに、
 * 候補は開いている一本の 30 曲から引かれていた。
 *
 * ★組む範囲は、いつも**ライブラリ＋カラムの絞り込み**にする。
 * カラムは目に見えていて、本人が触っているもの。そこが範囲であるべき。
 * 再生リストのタブは「いま聴いているもの」であって、「選ぶ元」ではない。
 *
 * ★流す側（いまの列）は変えない。開いた一本を流すのは、そのままが正しい。
 */
/*
 * ★つなぎの小品か（2026-08-30 本人の報告）。
 *   > 高確率でアルバム収録1曲めのインストを1曲目に選ぶことです。
 *   > プレイリストに1曲目のインストは入れたくないんですが、
 *   > これはこれで面白いと思いました。でも、選んでほしくないです。
 *
 * ★長さで切ってはいけない。実測（86,022 曲）:
 *   60 秒未満が 12,176 曲（14.2%）、30 秒未満が 3,755 曲（4.4%）
 * グラインドやパワーヴァイオレンスでは、30 秒が**ふつうの曲**。
 * 長さで切ると、聴きたい曲を大量に落とす。
 *
 * ★題名が**丸ごとその語だけ**のときに限る。実測で 598 曲（0.69%）。
 * 内訳は Intro 417／Outro 104／Interlude 44／Epilogue 11／Prelude 7 …
 * 「Prelude To Extinction」「Intro/Say Goodbye」のような**実曲は当たらない**。
 *
 * ★一覧からは消さない。くじにも残る。**AI に組ませるときの候補から外すだけ。**
 */
const つなぎの語 = /^(intro|outro|interlude|prelude|prologue|epilogue|overture|イントロ|アウトロ|序章|序曲|前奏|間奏)$/i;
function つなぎか(t) {
  return つなぎの語.test(String((t && t.title) || '').trim().replace(/[.。]+$/, ''));
}

function 組む範囲() {
  return 絞る(3).sort(曲を並べる);
}

/** いま何から組むのかを、押す前に見せる（誤爆を防ぐ） */
function 組む範囲を書く() {
  const 面 = document.querySelector('#aibar .scope');
  if (!面) return;
  const 範囲 = 組む範囲();
  const 数 = 範囲.length;

  /*
   * ★カラムに出ているのと同じ字面で出す。
   * sel は小文字で持っているので、そのまま出すと「metal core」になり、
   * カラムの「Metal Core」と食い違う。押したものと違うように見える。
   * 元の字面は、いま範囲に入っている曲から拾う（どれも選択に合っている）。
   */
  const 字面 = {};
  const 取り方 = {};
  for (const 列 of Object.values(カラムタブの列)) {
    for (const c of 列) if (c && c.key && c.取る) 取り方[c.key] = c.取る;
  }
  /*
   * ★絞り込みが無いなら、拾う相手がいない。輪ごと飛ばす。
   * 実測（86,044 曲）: 飛ばさないと 5.7 ms。描き直すたびに走るので効く。
   */
  const 選んでいる鍵 = Object.keys(sel).filter((k) => sel[k] && 取り方[k]);
  for (const t of (選んでいる鍵.length ? 範囲 : [])) {
    for (const k of 選んでいる鍵) {
      const v = 取り方[k](t);
      if (v === null || v === undefined || v === '') continue;
      const 小 = 小文字(v);
      if (!字面[k]) 字面[k] = new Map();
      if (!字面[k].has(小)) 字面[k].set(小, String(v));
    }
  }
  const 見せる = (k, v) => (字面[k] && 字面[k].get(v)) || v;
  const 名 = { genre: "ジャンル", artist: "アーティスト", album: "アルバム", 年: "年", 月: "月", 日: "日", 言葉: "言葉", 響演者: "演者", 響盤: "盤", まとめ: "ジャンル（まとめ）" };
  const 絞り = Object.entries(sel)
    .filter(([, v]) => v)
    .map(([k, v]) => `${名[k] || k}: ${[...v].slice(0, 3).map((x) => 見せる(k, x)).join("・")}${v.size > 3 ? `ほか${v.size - 3}` : ""}`);

  const リスト = 開いているリスト();
  面.innerHTML = '';
  const 足す = (文, 組) => { const e = document.createElement('span'); e.textContent = 文; if (組) e.className = 組; 面.appendChild(e); };
  足す('組む範囲: ');
  足す(`${数.toLocaleString('ja-JP')} 曲`, 'b');
  足す(絞り.length ? `（${絞り.join(' ／ ')}）` : '（ライブラリ全部）');
  /*
   * ★再生リストを開いているときは、はっきり断る。
   * 「聴いているもの」と「組む元」が違うことが、誤爆の正体だった。
   */
  if (リスト) 足す(`　※ いま「${リスト.name}」を聴いていますが、組む元はライブラリです`, 'warn');
}

function AIに渡す候補(何曲) {
  /*
   * ★自分の音源は候補に入れない（2026-08-30）。
   * 入れると、作りかけが一本に混ざるだけでなく、
   * **盤の数が多い＝王道**の足場まで狂う。
   * 実測では、録った回ごとに盤が分かれていて 20 枚あった。
   */
  const 母集団 = 組む範囲().filter((t) => t.鳴らせる !== false
    && !シャッフル除外.has(t.path) && !自分のか(t) && !つなぎか(t));
  if (!母集団.length) return [];
  const 表 = new Map(母集団.map((t) => [t.path, t]));
  const 上限 = Math.min(何曲, 母集団.length);

  /*
   * ★響きの重みを、再生回数の重みに掛ける。
   * 次を選ぶ() は「回数表」の値が小さいほど重い（1/(n+1)）ので、
   * 響きで当たった曲は**回数を小さく見せる**ことで重くする。
   */
  const 響き表 = 響きの重み表();
  const 回数表 = 響き表 ? Object.fromEntries(母集団.map((t) => {
    const n = 再生回数[t.path] ?? 0;
    const w = 響き表[t.path];
    return [t.path, w ? Math.max(0, (n + 1) / w - 1) : n];
  })) : 再生回数;

  // 演者ごとにまとめる。★名前が無い曲は、1 曲で 1 組にする（まとめて 1 曲にしない）
  const 束 = new Map();
  /*
   * ★演者ごとに、持っている盤の数も数える（2026-08-30 本人の指摘）。
   * 束 は path しか持っていないので、ここで一緒に数えておかないと
   * あとから盤を引けない（実際、一度これで作品数が全部 0 枚になった）。
   */
  const 盤の束 = new Map();
  for (const t of 母集団) {
    const k = 小文字((t.artist || '').trim()) || ('\u0000' + t.path);
    if (!束.has(k)) { 束.set(k, []); 盤の束.set(k, new Set()); }
    束.get(k).push(t.path);
    const a = 小文字((t.album || '').trim());
    if (a) 盤の束.get(k).add(a);
  }

  /*
   * ★響きで当たった演者を先に回す。
   * 演者の順をただまぜると、当たった 20 組が 5,861 組に埋もれる。
   * （曲ごとの重みだけでは、演者の順までは効かない）
   */
  const 響いた組 = new Set();
  if (響き表) {
    for (const [k, 道] of 束) if (道.some((p) => 響き表[p])) 響いた組.add(k);
  }
  const 演者 = [...束.keys()];
  const 並べ直す = () => (響いた組.size
    ? [...まぜる(演者.filter((k) => 響いた組.has(k))), ...まぜる(演者.filter((k) => !響いた組.has(k)))]
    : まぜる(演者));

  const 盤の名 = (p) => { const t = 表.get(p); return 小文字((t.artist || '') + ' / ' + (t.album || '')); };
  const 出 = [];
  const 引いた = new Set();
  const 盤数 = new Map();

  for (let 巡 = 1; 巡 <= 上限 && 出.length < 上限; 巡 += 1) {
    let 増えた = 0;
    for (const k of 並べ直す()) {
      if (出.length >= 上限) break;
      const 残り = 束.get(k).filter((x) => !引いた.has(x));
      if (!残り.length) continue;
      /*
       * ★その演者の中では、**いちばん使っていない盤**から取る。
       * 最初は「盤の数 < 巡」にしていたが、巡が上がると上限も上がるので
       * **一度も止まらなかった**（わざと外しても検査が素通りして分かった）。
       * 3 枚持っている人から 3 曲取るなら、3 枚から 1 曲ずつになる。
       */
      const 数え = 残り.map((x) => 盤数.get(盤の名(x)) ?? 0);
      const 一番少ない = Math.min(...数え);
      const 使える = 残り.filter((x, n) => 数え[n] === 一番少ない);
      const p = 次を選ぶ(使える.length ? 使える : 残り, 回数表, new Set());
      if (!p) continue;
      引いた.add(p);
      盤数.set(盤の名(p), (盤数.get(盤の名(p)) ?? 0) + 1);
      const t = 表.get(p);
      出.push({
        番号: 出.length + 1, path: p, artist: t.artist, title: t.title, album: t.album,
        /*
         * ★文脈の強度の足場（2026-08-30 本人の指摘で作り直した）。
         *   > 曲数の多いグラインドコアだとそれが効かなくて
         *   > 曲数の多いマニアックなバンドが王道に入ってきました。
         *   > アルバムの数や作品数の数を調べてから曲数を調べた方がいいのでは？
         *
         * ★その通りだった。曲数は**盤の作りに引きずられる。**
         * 実測（この蔵書）:
         *   1 枚あたりの曲数が、ジャンルで 5.4 曲〜14.6 曲まで開く
         *   ディスコグラフィ盤は 1 枚に 110 曲入っていることがある
         *   → ハードコアでは、曲数の上位 20 組と作品数の上位 20 組が
         *     **6 組しか重ならない（30%）**
         *
         * ★作品数（持っている盤の数）を先に見る。曲数はその次。
         * 長く作っている演者ほど盤が増える。1 枚に何曲詰まっていようと関係ない。
         */
        作品数: (盤の束.get(k) || new Set()).size,
        曲数: 束.get(k).length,
      });
      増えた += 1;
    }
    /*
     * ★1 巡回って 1 曲も増えなければ、もう引けないので抜ける。
     * ただし**止まる保証はこれではなく、巡 <= 上限 のほう。**
     * ここは早く抜けるためだけ（外しても止まることは、わざと外して確かめた）。
     */
    if (!増えた) break;
  }
  return 出;
}

/**
 * AI にプレイリストを組ませて、再生リストとして残す。
 *
 * ★残す形にするのは、**あとから手で直せるから**。
 * 気に入らなければ並べ替えられるし、消せるし、m3u に書き出せる。
 * その仕組みはもうあるので、そこに乗せる。
 */
/**
 * 3 カラムで、自分で何か絞っているか。
 *
 * ■ 本人の希望（2026-08-29）
 *   > 適当なジャンル名を付けてるとAIには認識できないので
 *   > 下のカラムの表示エリアを検索対象にするといいのかも。
 *   > ジャンルが「すべて」を選択していたらAIはAIの知識でジャンルを選択するけど、
 *   > ジャンルを指定してら（一つでも複数でも）カラム下の表示エリアが
 *   > 作られていたらその中から選ぶようにしたいです。
 *
 * ★自分でつけたジャンル名は、AI の知らない言葉のことがある。
 * そこへ「一覧から選べ」と頼むと、意味の分からない名前から選ばせることになる。
 * **自分で絞ってあるなら、そのまま使うのが正しい。** AI に選び直させない。
 */
function 自分で絞っているか() {
  return Object.values(sel).some((v) => v !== null);
}

async function AIに一本組ませる(気分, 言った) {
  const 大きさ = await window.mp3.AIの大きさ();
  const 候補 = AIに渡す候補(大きさ.候補の数);
  if (候補.length < 2) {
    言った.textContent = 'この範囲には、組める曲がありません';
    return false;
  }
  /*
   * ★幅を広げても増えないときは、そう言う（2026-08-30 本人の指摘）。
   *   > 対象幅や文脈の強度をいじって選んでたんですが、結果があまり変わらない
   *
   * 実測: ジャンル「Metal Core」は 2,843 曲・232 組。
   * 幅4（候補 400）で **232 組ぜんぶ**が入る。幅5 にしても増えない。
   * 効かないつまみを黙って置いておくと、動かし続けることになる。
   */
  const 頭打ち = 候補.length < 大きさ.候補の数;
  言った.textContent = `${候補.length} 曲から組んでいます…`
    + (頭打ち ? '（この範囲はこれで全部です）' : '');

  const r = await window.mp3.AIにプレイリストを作らせる({
    気分,
    候補: 候補.map((c) => ({ 番号: c.番号, artist: c.artist, title: c.title, album: c.album, 作品数: c.作品数, 曲数: c.曲数 })),
    // ★響きで当たったものを渡す。description が「なぜおすすめか」になる
    響き: (響きの当たり ? 響きの当たり.当たり : []).map((a) => ({
      artist: a.artist, description: a.description, keyword: a.keyword, depth: a.depth, 曲数: a.曲数,
    })),
  });
  if (!r || !r.ok) {
    const 訳 = (r && r.error) || '不明';
    言った.textContent = 'だめでした';
    $('status').textContent = '⚠ 一本を組めませんでした: ' + 訳;
    return false;
  }

  const 番号表 = new Map(候補.map((c) => [c.番号, c]));
  const 道 = [];
  const 演者たち = [];
  for (const 項 of r.結果.並び) {
    const c = 番号表.get(項.番号);
    if (!c) continue;
    道.push(c.path);
    演者たち.push(小文字((c.artist || '').trim()));
    if (項.ひとこと) AIのひとこと.set(c.path, 項.ひとこと);
  }
  if (!道.length) { 言った.textContent = 'AI が曲を選べませんでした'; return false; }

  // 名前は AI がつけたもの。無ければ気分をそのまま使う
  const 名 = '🤖 ' + (r.結果.題 || 気分).slice(0, 24);
  lists = await window.mp3.リストを作る(名);
  const 新しいの = lists[lists.length - 1];
  lists = await window.mp3.リストの中身を入れ替える(新しいの.id, 道);
  開いているID = 新しいの.id;
  /*
   * ★組み終わったら、絞りを外す（2026-08-30 本人の希望）。
   *   > プレイリストが生成されたらジャンルの選択は一度リセットされること
   *
   * ★絞りは「この一本を組むための指定」だった。組んだらもう役目は終わり。
   * 残しておくと、次に一本を組むときに前の指定が効いたままになり、
   * 「どうやってリセットするんだ？」になる。
   */
  絞りを外す();

  /*
   * ★組んだ一本は、**並んだ順に流す。**
   * ここでシャッフルを入れると、せっかくの流れ（入り・中盤・締め）が壊れる。
   * 本人が欲しかったのは「AI が選んだ順」なので、シャッフルは切る。
   */
  シャッフル = false;
  $('shuffle').textContent = '🔀 オフ';
  $('shuffle').classList.remove('on');

  描き直す();
  言った.textContent = r.結果.題 || 気分;

  /*
   * ★作っただけで、勝手に流さない（2026-08-29 本人の指示）。
   *   > プレイリストができた時に自動で再生されてびっくりしたので
   *   > 再生されないようにしてほしいです。
   *
   * 一本ができた時点で、聴くかどうかは本人が決めること。
   * いま鳴っているものを勝手に止めるのも、勝手に始めるのも、余計なお世話だった。
   */

  /*
   * ★状態の文字は、再生したあとに出す。
   * 先に出すと 再生する() の中の 一覧を描く() に上書きされて、消える（実測）。
   */
  const 落ち = r.結果.落とした ? `（${r.結果.落とした} 件は候補に無くて落としました）` : '';
  /*
   * ★頼んだ曲数が減らされていたら、そう言う。
   * つまみが 2 本あるので「幅は最小・量は最大」（候補 50 で 80 曲）は必ず起きる。
   * 黙って 50 曲にすると、つまみが効いていないように見える。
   */
  const 減り = (r.結果.頼んだ曲数 && r.結果.頼んだ曲数 < 大きさ.作る曲数)
    ? `（候補が ${候補.length} 曲しかないので ${r.結果.頼んだ曲数} 曲にしました。対象の幅を広げると増やせます）` : '';
  /*
   * ★同じ演者が重なったら、黙らない（2026-08-29 本人の報告）。
   * 候補の側で散らしてあるので、重なるのは**もう散らせないとき**だけ。
   * 黙っていると「まだ直っていない」に見える。何組いたのかまで出す。
   */
  const 数 = new Map();
  for (const a of 演者たち) { if (a) 数.set(a, (数.get(a) ?? 0) + 1); }
  const 重なり = [...数.values()].filter((n) => n > 1).length;
  const 散らし = 重なり
    ? `（${重なり} 組が 2 曲以上 ― この範囲には ${r.結果.演者の数 ?? 数.size} 組しかいません）`
    : '（すべて別の演者です）';
  const 打ち止め = 頭打ち
    ? `　※ この範囲は ${候補.length} 曲で全部なので、対象の幅を広げても増えません`
    : '';
  $('status').textContent = `AI が ${道.length} 曲の一本を組みました: 「${名}」${散らし}${落ち}${減り}${打ち止め}　▶ で頭から流れます`;
  return true;
}

/* ── Resonance（Kokoro OS のカルチャーツリー）───────────────
   本人の依頼（2026-08-29）:
     > 「この人が響いた言葉の周りにある名前」から曲を出します。

   ★AI に渡す前に、こちらで突き合わせて**画面に出す**。
   何が当たったか見えないと、選曲が変わった理由が分からなくなる。

   ★86,044 曲を何度も走査しない（本人の指示）。
   突き合わせは曲の側を 1 周するだけで、結果は覚えておく。
   実測 25 ms。走査（ディスク読み）ではなく、手元の配列を 1 周するだけ。 */

/**
 * ★確かめる候補（手元で見つからなかった名前）を開いているか。
 *
 * ■ 本人の依頼（2026-08-29）
 *   > 響きの「外れ」（手元に無かった名前）を、画面に出せるようにしてください。
 *
 * ★もう計算はしてあった（resonance.js の 突き合わせる が返していた）。
 * 画面が一度も読んでいなかっただけ。作ったのは出すところだけ。
 *
 * ★たたんでおく。当たり（鳴らせる曲）が主で、こちらは脇なので、
 * 開いたときだけ場所を取るようにする。
 */
let 確かめる候補を開く = false;

/**
 * ★交差（いくつの言葉から辿り着いたか）を開いているか。
 *
 * ■ 本人の問い（2026-08-29）
 *   > たくさん使えば何かいいことがある機能ってありますか？
 *
 * ★これがそれ。しかも**前は数えずに捨てていた。**
 * 別々の言葉から同じ名前に行き着くのは偶然ではない。
 * そして **1 本目では絶対に起きない。** 言葉を辿るほど出てくる。
 */
let 交差を開く = false;

/** 読み込んだ木。null なら未読み込み（機能が出ないだけ） */
let 響きの木 = null;
/** 突き合わせた結果。tracks が変わったら作り直す */
let 響きの当たり = null;

/** 突き合わせ直す（曲が増えた・木を入れ替えた とき） */
function 響きを合わせ直す() {
  響きの当たり = 響きの木 ? 突き合わせる(響きの木, tracks) : null;
  /*
   * ★響きが無くなったら、響きのタブから出る。
   * 出ないと、空のタブを開いたまま「1 曲も無い」状態になる。
   */
  if (カラムタブ === 'resonance' && !(響きの当たり && 響きの当たり.曲.size)) {
    カラムタブ = 'tag';
    sel = { ...sel, 言葉: null, 響演者: null, 響盤: null };
  }
}

/**
 * 木を生やすときに渡す、手元の演者。
 *
 * ■ ★厚いところと、細いところの両方を渡す（2026-08-29 本人の指摘）
 *   > resonanceって…王道的なのが気になります。マニアックな文脈が苦手というか。
 *
 * ★実測（本人の 85,941 曲）で、渡し方の穴が分かった:
 *
 *   演者 5,860 組。**上位 150 組が占めるのは 15,226 曲（18%）だけ**
 *   150 番目でも 61 曲ある。つまり上位だけ見せると
 *   「たくさん持つ人」にしか見えず、**細いところを持っていることが伝わらない。**
 *
 *   1 曲だけ持っている演者    932 組（15.9%）
 *   4〜10 曲だけの演者      1,895 組（32.3%）
 *
 * だから 3 分の 1 は「1〜数曲だけ持っている演者」から渡す。
 * これが「どこまで踏み込んでよいか」の物差しになる。
 *
 * ★細いほうは曲数順に並べない。**散らして採る。**
 * 並べると同じところ（名前順の頭）ばかりになって、蔵書の広さが伝わらない。
 */
function 手元の演者(何人) {
  const 数 = new Map();
  for (const t of 見える曲()) {
    const a = (t.artist || "").trim();
    if (!a || a === "Unknown") continue;
    数.set(a, (数.get(a) ?? 0) + 1);
  }
  const 全部 = [...数.entries()].sort((a, b) => b[1] - a[1]);

  /*
   * ★上位ばかり見せない（2026-08-29 本人の希望）:
   *   > 僕としては曲数を無視してバンドの選出を多くしてほしいです。
   *
   * 当たるのは「AI が挙げた名前のうち、手元にあるもの」だけ。
   * 上位しか見せないと、AI は当てずっぽうで挙げるしかない。
   *
   * ★上から 3 分の 1、残りは**全体から等間隔で拾う**。
   * 実測（本人の 5,853 組）: 上から採るだけだと 800 番目でも 27 曲あり、
   * 「厚いところ」しか見えない。等間隔なら 1 曲だけの組まで届く。
   */
  const 厚い数 = Math.max(1, Math.round(何人 / 3));
  const 厚い = 全部.slice(0, 厚い数).map(([名前, 曲数]) => ({ 名前, 曲数, 細い: false }));

  const 残り = 全部.slice(厚い数);
  const 細い = [];
  const 欲しい = Math.min(何人 - 厚い.length, 残り.length);
  /*
   * ★端から端まで届くように割る。
   * floor(残り/欲しい) で刻むと**最後まで行き着かない**（検査が捕まえた）。
   * 1,000 組から 300 組採ると、いちばん薄いところが 104 曲で止まっていた。
   */
  for (let i = 0; i < 欲しい; i += 1) {
    const j = Math.min(残り.length - 1, Math.floor((i * 残り.length) / 欲しい));
    const x = 残り[j];
    if (x) 細い.push({ 名前: x[0], 曲数: x[1], 細い: true });
  }
  return [...厚い, ...細い];
}

/** 蔵書の大きさ。「どこまで踏み込んでよいか」を AI に伝えるのに使う */
function 蔵書の大きさ() {
  const 見え = 見える曲();
  const 組 = new Set();
  for (const t of 見え) {
    const a = (t.artist || "").trim();
    if (a && a !== "Unknown") 組.add(小文字(a));
  }
  return { 演者数: 組.size, 曲数: 見え.length };
}

/**
 * 言葉から木を生やす。
 *
 * ★これが Resonance の見本になる（本人の言）。
 *   > resonanceのデモンストレーションとして音蔵を使うので。
 * だから**何が起きたかを見せる**。当たったものと、手元に無かったものを分けて出す。
 * 手元に無い名前こそ「発見」なので、隠さない。
 */
async function 木を生やして足す(言葉, 言った) {
  const 大きさ = await window.mp3.木の大きさ();
  言った.textContent = `「${言葉}」から辿っています…`;
  /*
   * ★同じ言葉でもう一度辿るときは、**すでに挙げた名前を渡す**（2026-08-29）。
   *   > 一度resonance生成したものと同じ名前で生成しても元の結果と同じままだった
   * 前は入れ替えていたので、似た答えが返ると何も変わらなかった。
   * いまは足していくので、押すたびに広がる ―― 「もっと辿る」になる。
   */
  const 前の木 = (響きの木 && Array.isArray(響きの木.木))
    ? 響きの木.木.find((e) => e.keyword === 言葉) : null;
  const すでにある = 前の木 ? 前の木.nodes.map((n) => n.name) : [];

  const r = await window.mp3.木を生やす({
    言葉,
    手元の演者: 手元の演者(大きさ.見せる演者の数),
    // ★蔵書の大きさも渡す。上位だけ見せると「たくさん持つ人」にしか見えないので
    蔵書: 蔵書の大きさ(),
    すでにある,
  });
  if (!r || !r.ok) {
    /*
     * ★理由は下の状態にも出す（2026-08-29）。
     * 上の欄は狭くて「…」で切れるので、**何が起きたか読めない。**
     * 読めないと、こちらにも伝えられない。
     */
    const 訳 = (r && r.error) || "不明";
    言った.textContent = "だめでした";
    $("status").textContent = "⚠ 辿れませんでした: " + 訳;
    return false;
  }

  響きの木 = r.木;
  響きを合わせ直す();
  描き直す();
  /*
   * ★描き直すと欄が作り直されるので、**さっきの 言った は捨てられている。**
   * 古いほうに書いても画面には出ない（実測でそうなっていた）。取り直す。
   */
  言った = $('aisaid') || 言った;   // ★描き直しで欄が作り直されるので、取り直す

  // ★生やした木のうち、手元にあったもの／無かったものを数える
  const 生 = r.生やした.nodes;
  const 当 = new Set((響きの当たり ? 響きの当たり.当たり : []).map((a) => ならす(a.artist)));
  const あった = 生.filter((n) => 当.has(ならす(n.name)));
  const 無かった = 生.filter((n) => !当.has(ならす(n.name)));

  /*
   * ★同じ言葉で押し直したときに、**増えたことが分かる**ようにする。
   * 前は入れ替えだったので「同じままに見える」と言われた。
   * ★演者が足りないときの逃げ道も、ここで教える（もう一度押せば増える）。
   */
  const 積み = (すでにある.length && r.全部で)
    ? `（${すでにある.length} 個に足して、いま ${r.全部で} 個）` : "";
  言った.textContent = `「${言葉}」から ${生.length} 個${積み} ― 手元に ${あった.length} 個`;
  $("status").textContent = `🌐「${言葉}」から ${生.length} 個辿りました${積み}`
    + `　手元にあった ${あった.length} 個: ${あった.slice(0, 6).map((n) => n.name).join(" / ")}`
    + (無かった.length ? `　／ 手元に無い ${無かった.length} 個（発見）: ${無かった.slice(0, 6).map((n) => n.name).join(" / ")}` : "")
    + "　※ 同じ言葉でもう一度「辿る」と、演者を増やせます";
  // ★手元に 1 曲も無ければ、一本は組めない。呼んだ側に伝える
  return あった.length > 0;
}


/** 名前を変えている最中の言葉（null なら変えていない） */
let 言葉の名前変え = null;

/**
 * 辿った言葉の管理欄。
 *
 * ★ここには入力欄も「一本にする」も置かない（2026-08-29 本人の整理）。
 *   > 「このまま一本に」と「混ぜて一本に」が Resonance のところにあったので、
 *   > resonance を使いながら生成するものだと思ってボタンを押してしまい、
 *   > 何個も同じライブラリを生成してしまった。
 * 押すものが並んでいると、押してしまう。**一本を作るのは上の 2 つのボタンだけ**にした。
 *
 * ここに置くのは、辿った言葉の**名前を変える／消す**だけ。
 *   > resonanceで生成したカラムタブの名前変更や削除の機能がほしいです。
 */
/**
 * 確かめる候補を並べる。
 *
 * ■ ★「買い物リスト」として出さない（本人の指示）
 *   > 外れには 3 種類が混ざっています。区別がつきません
 *   >   ① 本当に持っていない
 *   >   ② 持っているが、名前の書かれ方が違う
 *   >   ③ AI が実在しないものを出した
 *   > 見た目では見分けられないので、「買い物リスト」として出さないでください。
 *   > 「確かめる候補」として出してください。見出しもそう書いてください。
 *
 * ★だから、ここから買う・落とす仕掛けは**一切置かない。** 出すのは一覧まで。
 *
 * ■ ★depth で意味が変わるので、depth も出す（本人の指示）
 *   depth 1     … 入口を持っていない（意外な穴）
 *   depth 3 以上 … まだ辿り着いていない場所（探索の先端）
 *
 * 並びは当たりと同じで重い順（深く・新しいほど上）。resonance.js で並べてある。
 */
/**
 * 交差を並べる ―― いくつの言葉から辿り着いたか。
 *
 * ★「使うほど増えるもの」なので、いま何組あるかを必ず出す。
 * 0 のときも、どうすれば増えるかを書く（黙って空にしない）。
 */
function 交差を描く(box, 交差) {
  const 面 = document.createElement('div');
  面.className = 'misslist';

  const 頭 = document.createElement('div');
  頭.className = 'misshead';
  頭.textContent = '交差 ― いくつもの言葉から辿り着いた名前です。'
    + '別々の言葉が同じ名前を指すのは偶然ではありません。'
    + 'その人の中で、いくつもの筋がそこへ通じているということです。'
    + '★言葉を辿るほど増えます（1 本目では起きません）。選ばれやすさも上がります。';
  面.appendChild(頭);

  for (const a of 交差) {
    const 行 = document.createElement('div');
    行.className = 'missrow';

    const 数 = document.createElement('span');
    数.className = 'missdepth';
    数.textContent = a.言葉数 + ' 本';
    数.title = a.言葉数 + ' つの言葉から辿り着きました';

    const 名 = document.createElement('span');
    名.className = 'missname';
    名.textContent = a.artist;

    const 説 = document.createElement('span');
    説.className = 'said';
    説.textContent = `${a.曲数} 曲　［${a.言葉たち.join('・')}］`;

    行.append(数, 名, 説);
    面.appendChild(行);
  }
  box.appendChild(面);
}

function 確かめる候補を描く(box, 外れ) {
  const 面 = document.createElement('div');
  面.className = 'misslist';

  const 頭 = document.createElement('div');
  頭.className = 'misshead';
  頭.textContent = '確かめる候補 ― 手元で見つからなかった名前です。'
    + '演者名だけでなく、盤名・曲名にも当ててみて、それでも見つからなかったものだけ出しています。'
    + 'それでも「持っているのに書かれ方が違う」「AI の思い違い」は残ります。'
    + '買う前に確かめてください。';
  面.appendChild(頭);

  for (const m of 外れ) {
    const 行 = document.createElement('div');
    行.className = 'missrow';

    const 深 = document.createElement('span');
    深.className = 'missdepth';
    深.textContent = '深さ' + m.depth;
    深.title = m.depth <= 1
      ? '入口を持っていません（意外な穴）'
      : (m.depth >= 3 ? 'まだ辿り着いていない場所（探索の先端）' : '');

    const 名 = document.createElement('span');
    名.className = 'missname';
    名.textContent = m.name;

    const 説 = document.createElement('span');
    説.className = 'said';
    // ★交差していれば、そう出す。手元に無いなかでも、いちばん確かめる値打ちがある
    const 交差 = (m.言葉数 > 1)
      ? `［${m.言葉数} 本の言葉から: ${m.言葉たち.join('・')}］`
      : `［「${m.keyword}」から］`;
    説.textContent = (m.description ? m.description + '　' : '') + 交差;

    行.append(深, 名, 説);
    面.appendChild(行);
  }
  box.appendChild(面);
}

function 響きの欄を描く() {
  const box = $('resbar');
  /*
   * ★響きタブを開いているときだけ出す（2026-08-29 本人の指示）。
   *   > 響きの編集欄は響きタブを選んだ時のみ表示にしてほしいです。
   *
   * ここは「辿った言葉を直す・消す」ための欄。
   * ほかのタブを見ているときに出ていても、押す用が無い。
   */
  if (カラムタブ !== 'resonance' || !響きの木 || !響きの当たり || !響きの当たり.曲.size) {
    box.className = ''; box.innerHTML = ''; return;
  }
  box.className = 'on';
  box.innerHTML = '';

  const 印 = document.createElement('span');
  印.textContent = '🌐';
  const 文 = document.createElement('span');
  文.className = 'said';
  文.textContent = `${響きの当たり.当たり.length} 組・${響きの当たり.曲.size.toLocaleString("ja-JP")} 曲`;
  box.append(印, 文);

  // 辿った言葉ごとに、名前を変える／消す
  for (const e of 響きの木.木) {
    if (言葉の名前変え === e.keyword) {
      const inp = document.createElement("input");
      inp.value = e.keyword;
      inp.style.font = "inherit"; inp.style.fontSize = "11px";
      inp.style.padding = "1px 6px"; inp.style.border = "1px solid var(--line)";
      inp.style.borderRadius = "10px"; inp.style.width = "140px";
      const 決める = async () => {
        const v = inp.value.trim();
        言葉の名前変え = null;
        if (v && v !== e.keyword) {
          const r = await window.mp3.響きの名前を変える(e.keyword, v);
          if (r && r.ok) { 響きの木 = r.木; 響きを合わせ直す(); }
          else $("status").textContent = "名前を変えられませんでした（" + ((r && r.error) || "不明") + "）";
        }
        描き直す();
      };
      inp.onkeydown = (ev) => {
        if (ev.key === "Enter") 決める();
        if (ev.key === "Escape") { 言葉の名前変え = null; 描き直す(); }
      };
      inp.onblur = 決める;
      box.appendChild(inp);
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
      continue;
    }
    /*
     * ★1 つの札にまとめる（2026-08-29 本人の指摘）。
     *   > resonanceでできた項目の選択や編集の選択部分のデザインが少し煩雑
     * 前は［言葉］［✎］［×］が別々の丸で、言葉 3 つで丸が 9 個並んでいた。
     * 1 つのものは 1 つに見せる。
     */
    const 札 = document.createElement("span");
    札.className = "resword";
    札.title = e.savedAt ? ("辿った日: " + e.savedAt.slice(0, 10)) : "";

    const 名 = document.createElement("span");
    名.textContent = e.keyword;
    const 数 = document.createElement("span");
    数.className = "resnum";
    数.textContent = e.nodes.length;
    札.append(名, 数);

    const 直す = document.createElement("button");
    直す.textContent = "✎";
    直す.title = "この言葉の名前を変える";
    直す.onclick = () => { 言葉の名前変え = e.keyword; 描き直す(); };

    const 消す = document.createElement("button");
    消す.className = "del"; 消す.textContent = "×";
    消す.title = "この言葉で辿ったものを消す（音楽ファイルには触りません）";
    消す.onclick = async () => {
      if (!await 確かめる(`「${e.keyword}」で辿ったものを消しますか？\n\n曲は何も変わりません。`)) return;
      const r = await window.mp3.響きをひとつ消す(e.keyword);
      if (!r || !r.ok) { $("status").textContent = "消せませんでした（" + ((r && r.error) || "不明") + "）"; return; }
      響きの木 = r.木;
      響きを合わせ直す();
      描き直す();
      $("status").textContent = `「${e.keyword}」を消しました`;
    };

    札.append(直す, 消す);
    box.appendChild(札);
  }

  // 全部忘れさせる。★消えるのは控えだけで、音楽ファイルには触らない
  /*
   * ★確かめる候補（手元で見つからなかった名前）。
   * 0 個なら出さない ―― 「0」を出しても押す用が無い。
   */
  /*
   * ★交差（2 本以上の言葉から辿り着いた名前）。
   * 使うほど増えるものなので、増えたことが見えるようにする。
   */
  const 交差 = (響きの当たり && Array.isArray(響きの当たり.当たり))
    ? 響きの当たり.当たり.filter((a) => (a.言葉数 ?? 1) > 1) : [];
  if (交差.length) {
    const 開閉 = document.createElement("button");
    開閉.className = "restag";
    開閉.textContent = (交差を開く ? "▼ " : "▶ ") + "交差 " + 交差.length;
    開閉.title = "いくつもの言葉から辿り着いた名前です。言葉を辿るほど増えます";
    開閉.onclick = () => { 交差を開く = !交差を開く; 描き直す(); };
    box.appendChild(開閉);
  }

  const 外れ = (響きの当たり && Array.isArray(響きの当たり.外れ)) ? 響きの当たり.外れ : [];
  if (外れ.length) {
    const 開閉 = document.createElement("button");
    開閉.className = "restag";
    開閉.textContent = (確かめる候補を開く ? "▼ " : "▶ ") + "確かめる候補 " + 外れ.length;
    開閉.title = "手元で見つからなかった名前です。演者名だけでなく盤名・曲名にも当てて、"
      + "それでも無かったものだけ出しています（買い物リストではありません）";
    開閉.onclick = () => { 確かめる候補を開く = !確かめる候補を開く; 描き直す(); };
    box.appendChild(開閉);
  }

  /*
   * ★響きで選ばれたバンドから、一本を組む（2026-08-29 本人の希望）。
   *   > やはりResonanceで選出されたバンドを元にプレイリストを作りたい
   *   > シャッフルで流せばいいと思ったんですが、それだと曲数が多すぎる問題が
   *   > あるので、resonanceが選んだバンドから更に厳選して曲を選んで
   *
   * ★前に「響きのところに一本を作るボタンは置かない」と決めた（0.13.0）。
   * あのときは**押すつもりのないボタンが 2 つ**あって、事故が起きたから。
   * いまは 1 つだけ、何が起きるかを名前に書いて置く。
   * 勝手には作らない ―― 押したときだけ。
   */
  const 組む = document.createElement("button");
  組む.className = "restag";
  組む.textContent = "🔀 この響きで一本を組む";
  組む.title = "いま響きで選ばれている曲から、AI が厳選して並べます（勝手には流れません）";
  組む.onclick = async () => {
    const 言葉 = (響きの木 && Array.isArray(響きの木.木))
      ? 響きの木.木.map((e) => e.keyword).join("・") : "響き";
    const 言った = $("aisaid");
    if (!言った) { $("status").textContent = "⚠ 先に APIキーを入れてください"; return; }
    組む.disabled = true;
    try {
      言った.textContent = "響きから組んでいます…";
      await AIに一本組ませる(言葉, $("aisaid") || 言った);
    } finally {
      const b = [...document.querySelectorAll("#resbar button")]
        .find((x) => (x.textContent || "").includes("一本を組む"));
      if (b) b.disabled = false;
    }
  };
  box.appendChild(組む);

  const 外す = document.createElement("button");
  外す.className = "restag";
  外す.textContent = "× 全部外す";
  外す.title = "辿ったものを全部忘れます（音楽ファイルには触りません）";
  外す.onclick = async () => {
    if (!await 確かめる("辿ったものを全部忘れますか？\n\n曲は何も変わりません。")) return;
    /*
     * ★何をしているか出す（2026-08-29 本人の希望）。
     *   > 処理に時間がかかるなら何かしらのインフォメーションは出せないですか？
     * 実際は速い（描き直しで 148 ms）が、**黙って固まったように見えるより、
     * 一言あるほうがいい。**
     */
    $("status").textContent = "響きを外しています…";
    await window.mp3.響きを消す();
    響きの木 = null; 響きの当たり = null;
    響きを合わせ直す();
    描き直す();
    $("status").textContent = "響きを全部外しました";
  };
  box.appendChild(外す);

  // ★開いているときだけ場所を取る。当たり（鳴らせる曲）が主で、こちらは脇なので
  if (交差を開く && 交差.length) 交差を描く(box, 交差);
  if (確かめる候補を開く && 外れ.length) 確かめる候補を描く(box, 外れ);
}

/** いま見えている曲から、AI に渡すジャンル一覧を作る（件数の多い順） */
function AIに渡すジャンル() {
  const 数 = new Map();
  // ★「見える曲」から作る。タグ無しを隠しているなら、その曲は候補に入れない
  for (const t of 見える曲()) {
    const g = (t.genre || "").trim();
    if (!g) continue;
    数.set(g, (数.get(g) ?? 0) + 1);
  }
  return [...数.entries()].sort((a, b) => b[1] - a[1]).map(([名前, 件数]) => ({ 名前, 件数 }));
}

/** 手に入れた年の一覧（新しい順） */
function AIに渡す年() {
  const 年 = new Set();
  for (const t of 見える曲()) if (t.更新日時 > 0) 年.add(String(new Date(t.更新日時).getFullYear()));
  return [...年].sort().reverse();
}

/**
 * 3 カラムの上の欄。3 通りある。
 *   キー入力中 … キーを入れる欄（★prompt() が使えないので画面の中に出す）
 *   キーあり   … 気分を書く欄
 *   キーなし   … 何も出さない（機能そのものを見せない）
 */
function 気分の欄を描く() {
  const box = $("aibar");
  const 形 = キー入力 ? "key" : (AIが使える ? "mood" : "none");
  box.className = 形 === "none" ? "" : "on";
  if (形 === "none") { box.innerHTML = ""; box.dataset.形 = "none"; return; }
  if (box.dataset.形 === 形) return;              // 打っている途中に作り直さない
  box.dataset.形 = 形;
  box.innerHTML = "";

  if (形 === "key") {
    const 印 = document.createElement("span");
    印.textContent = "🔑";
    const 欄 = document.createElement("input");
    欄.id = "aikeyinput";
    欄.type = "password";                          // 肩越しに見えないように
    欄.placeholder = "Anthropic の API キーを貼り付けて Enter";
    欄.oninput = () => { キー入力.value = 欄.value; };
    const しまう = document.createElement("button");
    しまう.className = "btn"; しまう.id = "aikeysave"; しまう.textContent = "しまう";
    const やめる = document.createElement("button");
    やめる.className = "btn"; やめる.textContent = "やめる";
    const 断り = document.createElement("span");
    断り.className = "said";
    断り.textContent = "暗号化してこの PC の中だけに保存します。送るのはジャンル名と気分の文だけです";

    const 保存 = async () => {
      const v = (キー入力.value || "").trim();
      if (!v) return;
      しまう.disabled = true; 欄.disabled = true;
      const r = await window.mp3.AIのキーを入れる(v);
      しまう.disabled = false; 欄.disabled = false;
      if (!r || !r.ok) { 断り.textContent = "しまえませんでした（" + ((r && r.error) || "不明") + "）"; return; }
      キー入力 = null;                              // ★画面にキーを残さない
      AIが使える = true;
      // ★キーを入れて初めて欄が出る。つまみもここで取る（起動時は取れていない）
      await AIのつまみを取り直す();
      描き直す();
      $("status").textContent = "APIキーをしまいました。上の欄に気分を書けます";
    };
    しまう.onclick = 保存;
    欄.onkeydown = (e) => { if (e.key === "Enter") 保存(); };
    やめる.onclick = () => { キー入力 = null; 描き直す(); };

    box.append(印, 欄, しまう, やめる, 断り);
    欄.focus();
    return;
  }

  /*
   * ★記入欄は 2 つ（2026-08-29 本人の整理、2 度目）。
   *   > AIシャッフルプレイリストを作る記入欄とresonanceの記入欄で２つに分けます。
   *
   * 一度 1 つにまとめて、書いた言葉を AI に振り分けさせた。
   * だが**押す前に何が起きるか分からない**のが不便だった。
   * 分けたほうが、押す前に決まっている。
   *
   * ★分けたので、頼み文からも判定を外した（ai.js）。
   * 残したままだと「迷ったら文脈」が効いて、気分を書いても
   * ジャンルが空で返り、絞り込みが効かなくなる。
   */

  /* ── 気分から ── */
  const 印 = document.createElement("span");
  印.textContent = "🎧";
  const 欄 = document.createElement("input");
  欄.id = "aiword";
  // ★具体例は書かない（公開するので、作者の好みが出てしまう）
  欄.placeholder = "いまの気分を書く";
  欄.value = 打ちかけの言葉;
  欄.oninput = () => { 打ちかけの言葉 = 欄.value; };
  const 押す = document.createElement("button");
  押す.className = "btn"; 押す.id = "aigo"; 押す.textContent = "一本を組む";
  押す.title = "書いた気分に合うジャンルに絞って、そこから 30 曲の一本を組みます";

  /* ── 言葉から辿る ── */
  const 印2 = document.createElement("span");
  印2.textContent = "🌱";
  const 欄2 = document.createElement("input");
  欄2.id = "restree";
  欄2.placeholder = "言葉を 1 つ入れて辿る";
  欄2.value = 打ちかけの辿る言葉;
  欄2.oninput = () => { 打ちかけの辿る言葉 = 欄2.value; };
  const 辿る = document.createElement("button");
  辿る.className = "btn"; 辿る.id = "restreego"; 辿る.textContent = "辿る";
  辿る.title = "その言葉から辿れる音楽を探し、手元にあったものを響きタブに集めます（一本は組みません）";

  /* ── ジャンル名をまとめる（2026-08-30 本人の希望） ── */
  const 印3 = document.createElement("span");
  印3.textContent = "🏷";
  const まとめる押す = document.createElement("button");
  まとめる押す.className = "btn"; まとめる押す.id = "aigenre";
  まとめる押す.textContent = ジャンルのまとめ.組.length ? "ジャンル名をまとめ直す" : "ジャンル名をまとめる";
  まとめる押す.title = "散らかったジャンル名を、見て回りやすい大きさにまとめます（元の名前も mp3 のタグも変えません）";

  /*
   * ★捨てるボタン。まとめてあるときだけ出す。
   * 元のジャンル名は無傷なので、これを押せば**完全に元通り**になる。
   * 捨てられない仕掛けは「別の層」とは言えない。ここは必ず要る。
   */
  const やめる押す = document.createElement("button");
  やめる押す.className = "btn"; やめる押す.id = "aigenreoff";
  やめる押す.textContent = "まとめをやめる";
  やめる押す.title = "まとめを捨てて、元のジャンル名だけに戻します";
  やめる押す.style.display = ジャンルのまとめ.組.length ? "" : "none";

  /*
   * ★手直しを見る／捨てる（2026-08-30 本人の希望）。
   *   > そのセーブデータを削除や直すことで元通りにすることはできないでしょうか？
   *
   * 見る … 手直し.json のある場所を開く。中は読める形で書いてあるので、
   *        本人が 1 件だけ直したり消したりできる
   * 捨てる … 丸ごと消す。**これで完全に元通りになる**
   */
  const 手直し見る = document.createElement("button");
  手直し見る.className = "btn"; 手直し見る.id = "naoshishow";
  手直し見る.textContent = "手直しを見る";
  手直し見る.title = "手直し.json のある場所を開きます（中を見て、直したり消したりできます）";
  手直し見る.style.display = Object.keys(手直し.曲 || {}).length ? "" : "none";

  const 手直し捨てる = document.createElement("button");
  手直し捨てる.className = "btn"; 手直し捨てる.id = "naoshioff";
  手直し捨てる.textContent = "手直しを捨てる";
  手直し捨てる.title = "手直しを丸ごと消して、元のジャンルに戻します";
  手直し捨てる.style.display = Object.keys(手直し.曲 || {}).length ? "" : "none";

  /* ── ジャンルの付いていない曲を埋める（2026-08-30 本人の希望） ── */
  const 埋める押す = document.createElement("button");
  埋める押す.className = "btn"; 埋める押す.id = "aifill";
  埋める押す.textContent = "ジャンル名無しを埋める";
  埋める押す.title = "ジャンルの付いていない曲に、ジャンルを入れます（まず手元で決め、決まらないぶんだけ AI に訊きます。手直し.json に残るので消せば元通り）";

  /*
   * ★「整える」道具は、たたんでおく（2026-08-30 本人の希望）。
   *   > 今回追加したジャンル名をまとめ直すなどのボタンが多くて
   *   > AIの指示欄をあっぱくしてるのでべつのどこかにまとめたいです。
   *   > 一度使ったらあまり使わない機能なのでどこかにタブなど隠してる感じがいいかと
   *
   * ★毎日使うのは 🎧 と 🌱 の 2 つだけ。ここはその邪魔をしない。
   */
  const 道具箱 = document.createElement("div");
  道具箱.className = "tools"; 道具箱.id = "aitools";
  if (道具箱を開いている) 道具箱.classList.add("on");

  const 道具ボタン = document.createElement("button");
  道具ボタン.className = "btn toolsbtn"; 道具ボタン.id = "aitoolsbtn";
  道具ボタン.textContent = 道具箱を開いている ? "🛠 整える ▲" : "🛠 整える ▼";
  道具ボタン.title = "ジャンル名をまとめる・ジャンル名無しを埋める・手直しの出し入れ";
  道具ボタン.onclick = () => {
    道具箱を開いている = !道具箱を開いている;
    道具箱.classList.toggle("on", 道具箱を開いている);
    道具ボタン.textContent = 道具箱を開いている ? "🛠 整える ▲" : "🛠 整える ▼";
  };

  const 言った = document.createElement("span");
  言った.className = "said"; 言った.id = "aisaid";

  /*
   * 走っている間は、触れるところを止める。**戻すのも同じ一覧を使う。**
   *
   * ■ 実地の不具合（2026-08-30）。本人からの報告:
   *   > ジャンル名をまとめるをやったあと、ジャンル名無しを埋めると
   *   > まとめをやめるのボタンがグレーになって使えなくなりました。
   *   > 立ち上げ直したらボタンが白に戻りました。
   *
   * ★原因は、戻す側が **id を直書きした一覧**で、しかも 4 か所にあったこと。
   * ボタンを足すたびに 4 か所を直す必要があり、0.26.0 で足した 4 つが
   * どこにも入っていなかった。
   *
   * ★AI の欄は「形が変わったときだけ」作り直すので、描き直しても戻らない。
   * だから立ち上げ直すまで直らなかった。
   *
   * ★一覧はここだけ。足すときはここに足せば、止めるのも戻るのも揃う。
   */
  const 止める = (と) => {
    for (const e of [押す, 欄, 辿る, 欄2, まとめる押す, やめる押す, 埋める押す, 手直し見る, 手直し捨てる, 道具ボタン]) e.disabled = と;
    // ★組んでいる最中につまみを動かしても、いま走っているぶんには効かない。
    // 動かせるままだと「効かなかった」と見えるので、いっしょに止める
    for (const id of ["aiwide", "aimany", "aistrict"]) { const e = $(id); if (e) e.disabled = と; }
  };

  const 気分で = async () => {
    const v = 欄.value.trim();
    if (!v) return;
    止める(true);
    言った.textContent = "聞いています…";
    try {
      /*
       * ★自分で絞ってあるなら、AI にジャンルを選ばせない（2026-08-29 本人の希望）。
       * いま画面に出ている範囲から、そのまま組ませる。
       * 自分でつけたジャンル名は AI の知らない言葉のことがあるので、
       * **選び直させるほうが外れる。**
       */
      if (自分で絞っているか()) {
        言った.textContent = "いま絞っている範囲から組みます…";
      } else {
        const r = await window.mp3.気分でおすすめ({
          気分: v, ジャンル一覧: AIに渡すジャンル(), 年一覧: AIに渡す年(),
        });
        if (!r || !r.ok) {
          const 訳 = (r && r.error) || "不明";
          言った.textContent = "だめでした";
          $("status").textContent = "⚠ 絞り込めませんでした: " + 訳;
          return;
        }
        当てはめる(r.結果);
      }
      const できた = await AIに一本組ませる(v, $("aisaid") || 言った);
      /*
       * ★組めたら記入欄を空にする（2026-08-29 本人の希望）。
       *   > AI DJとResonanceでボタンを押して生成したら記入欄の文字は消えてほしい
       * ★だめだったときは消さない。書き直すのに、もう一度打たせることになる。
       * ★画面の欄と、打ちかけの控えの**両方**を消す。片方だと次の描き直しで戻る。
       */
      if (できた) {
        打ちかけの言葉 = "";
        const 欄い = $("aiword");
        if (欄い) 欄い.value = "";
      }
    } finally {
      止める(false);   // ★一覧は 止める() ひとつ（増やさない）
    }
  };

  const 辿って = async () => {
    const v = 欄2.value.trim();
    if (!v) return;
    止める(true);
    try {
      const 足りた = await 木を生やして足す(v, $("aisaid") || 言った);
      if (!足りた) return;
      カラムタブ = "resonance";
      sel = { ...sel, 言葉: new Set([小文字(v)]), 響演者: null, 響盤: null };
      /*
       * ★再生リストを開いていたら、ライブラリに戻す。
       * 一覧は「開いている再生リスト」を優先して出すので、開いたままだと
       * **辿ったのに一覧が何も変わらない**。前は新しい一本を作って
       * そちらに切り替わっていたので、この抜けが隠れていた。
       */
      開いているID = null;
      /*
       * ★辿れたら記入欄を空にする（2026-08-29 本人の希望）。
       *
       * ★控えだけ消しても消えない（2026-08-29 実地。本人からの報告:
       *   > 今resonanceで生成した記入欄に文字が残った）。
       * 気分の欄は **描き直しても作り直されない** ―― 打っている途中に
       * 欄が消えないよう、形（none/mood/key）が変わったときだけ作り直す作りだから。
       * だから**画面の欄も直に消す**。気分のほうは最初からそうしていた。
       */
      打ちかけの辿る言葉 = "";
      const 辿る欄 = $("restree");
      if (辿る欄) 辿る欄.value = "";

      /*
       * ★辿ったあと、AI に一本を組ませない（2026-08-29 本人の指示）。
       *   > resonanceを使ったらAI DJのシャッフルプレイリストも同時出来上がったので、
       *   > Resonaceの時はAI DJのプレイリストは作らないようにしてください。
       *
       * 本人が前に整理したとおりだった:
       *   > レゾナンスでタブが生成されるから「このまま一本に」はいらないし、
       *   > それをシャッフルすればいいから「混ぜて一本に」はいらない
       * ボタンは消したのに、**辿るボタンの中に同じことが残っていた。**
       * 辿った結果は響きタブそのもの。そこを 🔀 で流せばいい。
       *
       * ★これで、辿るのに通信は 1 往復だけになる（木を生やすところだけ）。
       */
      描き直す();
      /*
       * ★状態の文字は 描き直す() のあとに出す。
       * 先に出すと 一覧を描く() に上書きされて消える（前に踏んでいる）。
       */
      const 曲数 = 絞る(3).length;
      $("status").textContent = `🌐「${v}」で絞りました（${曲数.toLocaleString("ja-JP")} 曲）`
        + '　▶ で流せます。🔀 を押すとこの範囲でシャッフルします';
    } finally {
      止める(false);   // ★一覧は 止める() ひとつ（増やさない）
    }
  };

  /* ★まとめている間も、ほかの 2 つと同じように止める（二重に走らせない） */
  const まとめて = async () => {
    止める(true);
    try {
      await ジャンルをまとめる($("aisaid") || 言った);
    } finally {
      止める(false);   // ★一覧は 止める() ひとつ（増やさない）
    }
  };

  押す.onclick = 気分で;
  辿る.onclick = 辿って;
  まとめる押す.onclick = まとめて;
  手直し見る.onclick = async () => {
    const r = await window.mp3.手直しの置き場を開く();
    $('status').textContent = (r && r.ok)
      ? `手直しの置き場を開きました: ${r.置き場}`
      : `⚠ 開けませんでした: ${(r && r.error) || '不明'}`;
  };
  手直し捨てる.onclick = async () => {
    const 件 = Object.keys(手直し.曲 || {}).length;
    if (!(await 訊く(
      `手直し ${件.toLocaleString('ja-JP')} 曲ぶんを、丸ごと捨てます。` + String.fromCharCode(10)
      + '元のジャンルに戻ります。曲は消えません。',
      true,
    ))) return;
    await window.mp3.手直しを捨てる();
    手直し = { 曲: {}, 直した日: '' };
    /* ★その場でも元に戻す。走査し直さずに見えるように */
    for (let i = 0; i < tracks.length; i += 1) {
      if (tracks[i] && tracks[i].手直し) {
        const t = { ...tracks[i] };
        delete t.手直し;
        tracks[i] = t;
      }
    }
    $('status').textContent = '手直しを捨てました。次に開くと、元のジャンルに戻ります'
      + '（いま見えているぶんは、印だけ外しました）';
    描き直す();
  };

  埋める押す.onclick = async () => {
    止める(true);
    try {
      await ジャンルを埋める($("aisaid") || 言った);
    } finally {
      止める(false);   // ★一覧は 止める() ひとつ（増やさない）
    }
  };
  やめる押す.onclick = async () => {
    if (!(await 訊く(
      `ジャンルのまとめ（${ジャンルのまとめ.組.length} 組）を捨てます。` + String.fromCharCode(10)
      + '元のジャンル名はそのまま残っているので、完全に元通りになります。',
      true,
    ))) return;
    await window.mp3.ジャンルのまとめを捨てる();
    まとめを入れる({ 組: [] });
    if (カラムタブ === 'まとめ') カラムタブ = 'tag';
    sel = { ...sel, まとめ: null };
    描き直す();
    $('status').textContent = 'ジャンルのまとめを捨てました（元のジャンル名に戻っています）';
  };
  欄.onkeydown = (e) => { if (e.key === "Enter") 気分で(); };
  欄2.onkeydown = (e) => { if (e.key === "Enter") 辿って(); };

  /* ★毎日使う 2 つだけを表に出す。あとは道具箱の中へ */
  box.append(印, 欄, 押す, 印2, 欄2, 辿る, 言った, 道具ボタン);
  道具箱.append(印3, まとめる押す, 埋める押す, やめる押す, 手直し見る, 手直し捨てる);
  box.append(道具箱);
  // ★つまみは 2 段目に置く。1 行に並べると、記入欄が押しつぶされる
  const つまみ = つまみの行();
  if (つまみ) box.append(つまみ);
}

/**
 * AI の答えを 3 カラムに当てはめる。
 *
 * ★絞り込みを置き換える（足さない）。前の絞り込みが残ったままだと、
 * 掛け合わせで 0 件になりやすく、「AI が変なものを選んだ」ようにしか見えない。
 * ★手で直せる状態にして返す。カラムが選ばれた状態になるだけなので、
 * 気に入らなければ、そのまま押して外せる。
 */
function 当てはめる(結果) {
  const 小 = (v) => String(v).toLocaleLowerCase("ja");
  sel = {
    genre: 結果.ジャンル.length ? new Set(結果.ジャンル.map(小)) : null,
    artist: null, album: null,
    年: 結果.年.length ? new Set(結果.年.map(小)) : null,
    月: null, 日: null,
  };
  列の起点 = { genre: null, artist: null, album: null, 年: null, 月: null, 日: null };
  列の絞り = { genre: "", artist: "", album: "", 年: "", 月: "", 日: "" };
  カラムタブ = 結果.ジャンル.length ? "tag" : "date";
  描き直す();

  const 何曲 = 絞る(3).length;
  const 選んだ = [...結果.ジャンル, ...結果.年].join(" / ") || "（絞り込みなし）";
  // ★実在しなかったものは黙らない。AI がそう言ったことは事実なので、出す
  const 無し = 結果.無かったもの.length ? "／手元に無かったもの: " + 結果.無かったもの.join(", ") : "";
  const 言った = $("aisaid");
  if (言った) 言った.textContent = 結果.ひとこと || 選んだ;
  $("status").textContent = `AI が選んだ範囲: ${選んだ} ― ${何曲.toLocaleString("ja-JP")} 曲${無し}　この中から一本を組んでいます…`;
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
/**
 * 何か絞っているときだけ、「絞りを外す」を出す。
 * ★「どうやってリセットするんだ？」への、いちばん短い答え。
 */
function 絞りを外すボタンを直す() {
  const 置き = $('coltabs');
  if (!置き) return;
  let b = $('clearsel');
  const 数 = Object.values(sel).filter((v) => v).length;
  if (!数) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button');
    b.id = 'clearsel';
    b.className = 'btn';
    b.style.marginLeft = 'auto';
    b.title = '見えていないタブのぶんも含めて、絞り込みを全部外します';
    b.onclick = () => {
      絞りを外す();
      描き直す();
      $('status').textContent = '絞り込みを全部外しました（ライブラリ全体に戻っています）';
    };
    置き.appendChild(b);
  }
  b.textContent = `✕ 絞りを外す（${数}）`;
}

function カラムタブを描く() {
  const box = $('coltabs');
  box.innerHTML = '';
  const 札 = [
    ['tag', 'ジャンル / アーティスト / アルバム'],
    ['date', '日付（年 / 月 / 日）'],
  ];
  /*
   * ★まとめのタブは、まとめてあるときだけ出す。
   * 何もまとめていないと、ジャンルの列と同じものが並ぶだけになる。
   */
  if (ジャンルのまとめ.組.length) 札.push(['まとめ', `🏷 ジャンル（まとめ ${ジャンルのまとめ.組.length} 組）`]);
  // ★響きのタブは、辿ったものがあるときだけ出す（無いと空の列を見せるだけになる）
  if (響きの当たり && 響きの当たり.曲.size) 札.push(['resonance', `🌐 響き（${響きの当たり.当たり.length} 組）`]);
  for (const [名, 表示] of 札) {
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
    /*
     * ★タブを押したら、再生リストを閉じてライブラリに戻る（本人の希望）。
     *   > 上のカラムのタブを押したらプレイリストは閉じて
     *   > ライブラリのリストが表示されたらいいのかなと思いました。
     *
     * ★これで「カラムを触る＝ライブラリを見ている」に揃う。
     * 前は、再生リストを開いたままカラムを触れてしまい、
     * 絞ったのに一覧が変わらない（開いた一本が出ている）ことがあった。
     */
    b.onclick = () => {
      カラムタブ = 名;
      開いているID = null;
      描き直す();
    };
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
let 列の絞り = { genre: '', artist: '', album: '', 年: '', 月: '', 日: '', 言葉: '', 響演者: '', 響盤: '' };

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

/*
 * ■ ★実地の不具合（2026-08-29）。本人からの報告:
 *   > 一覧から外すの項目が狭すぎなのか一部しか表示されていない
 *
 * 本物の画面で測った（窓 1186px）:
 *   act の欄        いま  92px
 *   中の文字        「シャッフルに入れない　一覧から外す」 **187px 要る**
 *     シャッフルに入れない  88px
 *     一覧から外す          59px
 *
 * td は overflow:hidden なので、**「一覧から外す」は 1 文字も出ていなかった。**
 * 押せないのではなく、**そこにあることが分からない**のが悪い。
 *
 * ★言葉は短くしない。この 2 つは紛らわしいので、わざと言い分けてある
 * （一覧から外す＝一覧から消える／シャッフルに入れない＝一覧に残り、押せば鳴る）。
 * 短くすると、前に直した取り違えが戻ってくる。
 *
 * ★足りないぶんは、曲名とアルバムから回す。あちらは長くても「…」で切れるだけで、
 * **見えなくなる操作は無い。** どちらも取っ手を掴んで広げられる。
 *
 * ★合計は、縦棒（縦スクロール）が出たぶんも見込んで決める。
 * 最初 act を広げただけにしたら、**横棒が出た**（検査が捕まえた）。
 * 曲が並ぶと縦棒が出て、そのぶん（15px ほど）横が狭くなるため。
 *
 * ★左に再生リストの一覧を置いたので（0.21.0）、表に使える幅が 200px ほど減った。
 * そのぶんを曲名・演者・盤から回している。どれも「…」で切れるだけで、
 * 見えなくなる操作は無い。どれも取っ手で広げられる。
 */
const 既定の列幅 = {
  pick: 34, grip: 30, num: 38,
  title: 230, artist: 150, album: 150,
  dur: 58, date: 84, plays: 50, move: 68,
  /*
   * ★act は、開いているものによって要る幅が違う。
   *   ライブラリ … 「くじに入れない　一覧から外す」（0.21.0 で短くした）
   *   再生リスト … 「この曲を外す」だけ            59px で足りる
   * 同じ幅にすると、再生リスト側で 150px 遊んで、横棒が出る（並べ替えの列も増えるので）。
   */
  act: 152, actlist: 96,
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

/*
 * ★左の一覧の幅も掴んで変えられるようにする。
 * 再生リストの名前は長さがまちまちなので、固定だと切れる。
 * 3 カラムの高さと同じ置き場（列幅）に覚えておく。
 */
$('sidesizer').onmousedown = (e) => {
  e.preventDefault();
  const 始点 = e.clientX;
  const 元 = $('tabs').getBoundingClientRect().width;
  document.body.style.cursor = 'col-resize';
  const 動く = (ev) => {
    const 幅 = Math.max(120, Math.min(420, 元 + (ev.clientX - 始点)));
    $('tabs').style.width = `${幅}px`;
    列幅.__sideWidth = 幅;
  };
  const 離す = async () => {
    document.removeEventListener('mousemove', 動く);
    document.removeEventListener('mouseup', 離す);
    document.body.style.cursor = '';
    await window.mp3.列幅を覚える(列幅);
  };
  document.addEventListener('mousemove', 動く);
  document.addEventListener('mouseup', 離す);
};

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
    ['act', '', null, リスト ? 'actlist' : 'act'],
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
    // ★自分の音源。一覧には残す（押せば鳴る）が、それと分かるようにする
    if (自分のか(t)) tr.classList.add('mine');
    // ★手直しで入れたジャンル。元の値ではないと分かるようにする
    if (t.手直し) tr.classList.add('naoshi');
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
        if (!await 確かめる(`「${t.title}」を一覧から外しますか？\n\n場所: ${場所}\n\nファイルは削除されません。`)) return;
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
      sk.textContent = 外れている ? 'くじに戻す' : 'くじに入れない';
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

  /*
   * ★数が増えたので、探せるようにする（2026-08-29 本人の希望）。
   *   > プレイリストを作るのが楽しくなって大量生産してしまい、
   *   > 今の表示部分だと無理があることがわかりました。
   * ★少ないうちは出さない。3 本のために探す欄が出ても邪魔なだけ。
   * 3 カラムの探す欄と同じ考え方（件数が多い列にだけ出す）。
   */
  const 語 = (再生リストの絞り || "").trim().toLocaleLowerCase("ja");
  if (lists.length > 8 || 語) {
    const inp = document.createElement('input');
    inp.className = 'sidefind';
    inp.id = "listfind";
    inp.placeholder = `${lists.length} 本から探す`;
    inp.value = 再生リストの絞り;
    inp.autocomplete = 'off';
    inp.oninput = () => {
      再生リストの絞り = inp.value;
      描き直す();
      // ★打つたびに描き直すので、焦点を戻さないと 1 文字しか打てない
      const 次 = $("listfind");
      if (次) { 次.focus(); 次.setSelectionRange(次.value.length, 次.value.length); }
    };
    box.appendChild(inp);
  }

  const 出す = 語
    ? lists.filter((l) => l.name.toLocaleLowerCase("ja").includes(語))
    : lists;

  const 見出し = document.createElement('div');
  見出し.className = 'sidehead';
  見出し.textContent = 語
    ? `合う再生リスト（${出す.length} / ${lists.length}）`
    : `再生リスト（${lists.length}）`;
  box.appendChild(見出し);

  for (const l of 出す) タブ(`${l.name}（${l.tracks.length}）`, l.id, l.name);
  // ★絞って 0 本でも、黙って空にしない
  if (語 && !出す.length) {
    const 無 = document.createElement('div');
    無.className = 'sidehead';
    無.textContent = '合うものがありません';
    box.appendChild(無);
  }

  const 新規 = document.createElement('button');
  新規.className = 'tab sideadd';
  新規.textContent = '＋ 新しい再生リスト';
  // ★prompt() は使わない。Electron では動かない（alert / confirm は動くのに prompt だけ使えない）。
  // 実地で「押しても反応がない」となった原因。画面内の入力欄に置き換えた。
  新規.onclick = () => { 名前入力 = { mode: 'new', id: null, value: '' }; 描き直す(); };
  box.appendChild(新規);

  const 読込 = document.createElement('button');
  読込.className = 'tab sideadd';
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
      await 知らせる('選んだ曲は MP3 ではないので（m4a など）、タグを書き換えられません。\n'
        + 'ファイルは壊れていません。再生はできます。');
      return;
    }
    if (!await 確かめる(
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
    絞りを外す();   // ★一覧は 絞りを外す() ひとつ（前はここに まとめ が抜けていた）
    描き直す();

    // 黙って終わらせない。失敗があれば必ず見せる。何件読み直したかも出す
    const 但し = 読み直した < 成功 ? `\n（うち ${成功 - 読み直した} 曲は一覧に見当たらず、表示を更新できませんでした）` : '';
    if (失敗.length) {
      await 知らせる(`${成功} 曲を書き換えました。${但し}\n\n${失敗.length} 曲は失敗しました:\n${失敗.slice(0, 10).join('\n')}${覚え注意}`);
    } else {
      await 知らせる(`${成功} 曲のタグを書き換えました。${但し}\n\n絞り込みを外したので、変えた内容が一覧で確かめられます。${覚え注意}`);
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
       * ★選んだ曲の**演者ごと**、自分の音源にする（2026-08-30 本人の話）。
       *
       *   > 自分のバンド1は僕のバンドで作曲途中のデータがたくさんあって
       *   > それが読み込まれてるんです。これはシャッフルの対象にされたくない
       *
       * ★1 曲選べば、その演者ぜんぶが入る。
       * 実測では 4 バンドで 453 曲あった。1 曲ずつでは終わらない。
       *
       * ★演者名の**完全一致**で覚える。部分一致にすると
       * 「自分のバンド3」で 名前を含む別のバンド（別のバンド）まで巻き込む。
       */
      {
        const 選んだ演者 = new Set();
        for (const path of 選択中) {
          const t = tracks.find((x) => x.path === path);
          const a = 小文字(String((t && t.artist) || '').trim());
          if (a) 選んだ演者.add(a);
        }
        const 入っている = [...選んだ演者].filter((a) => 自分の音源.has(a));
        const まだ = [...選んだ演者].filter((a) => !自分の音源.has(a));

        /** その演者たちが、いま何曲あるか（数を見せてから決めてもらう） */
        const 曲数 = (演者) => tracks.filter((t) =>
          演者.includes(小文字(String(t.artist || '').trim()))).length;

        if (まだ.length) {
          const n = 曲数(まだ);
          ボタン(`${まだ.length === 1 ? `「${まだ[0]}」` : `${まだ.length} 組`}を自分の音源にする（${n.toLocaleString("ja-JP")} 曲）`, async () => {
            if (!await 確かめる(
              `${まだ.join("、")}`
              + String.fromCharCode(10) + String.fromCharCode(10)
              + `この演者の ${n.toLocaleString("ja-JP")} 曲を「自分の音源」にします。`
              + String.fromCharCode(10) + String.fromCharCode(10)
              + '・一覧には残ります。押せば鳴ります'
              + String.fromCharCode(10) + '・シャッフルのくじに入りません'
              + String.fromCharCode(10) + '・AI DJ と Resonance の候補にも入りません'
              + String.fromCharCode(10) + '・曲は消えません。あとから戻せます',
            )) return;
            自分の音源 = new Set(await window.mp3.自分の音源を変える(まだ, true));
            選択中.clear();
            描き直す();
            $('status').textContent = `${まだ.join('、')} を自分の音源にしました`
              + `（${n.toLocaleString('ja-JP')} 曲。一覧には残っています）`;
          });
        }
        if (入っている.length) {
          const n = 曲数(入っている);
          ボタン(`${入っている.length === 1 ? `「${入っている[0]}」` : `${入っている.length} 組`}を自分の音源から戻す（${n.toLocaleString("ja-JP")} 曲）`, async () => {
            自分の音源 = new Set(await window.mp3.自分の音源を変える(入っている, false));
            描き直す();
            $('status').textContent = `${入っている.join('、')} を自分の音源から戻しました`
              + `（${n.toLocaleString('ja-JP')} 曲。またくじに入ります）`;
          });
        }
      }

      /*
       * ★「一覧から外す」もまとめてできるようにする（本人の希望 2026-08-25）。
       * ファイルは消さない。一覧から外すだけ、という約束は変えない。
       */
      ボタン(`選んだ ${n0} 曲を一覧から外す`, async () => {
        if (!await 確かめる(
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

  /*
   * ★スマホへ持ち出す（2026-08-30 本人の希望）。
   *   > プレイリストに紐づいたデータだけ同期できないかな？
   *
   * ライブラリ全部は 388 GB でスマホに入らないが、一本ぶんなら 139 MB ほど。
   * **その一本に紐づいた曲だけ**を、m3u と一緒にフォルダへコピーする。
   * ★元のファイルは触らない。コピーするだけ。
   */
  ボタン('📱 スマホへ持ち出す', async () => {
    const 曲情報 = リスト.tracks
      .map((道) => tracks.find((t) => t.path === 道))
      .filter(Boolean)
      .map((t) => ({ path: t.path, artist: t.artist, title: t.title, duration: t.duration }));
    $('status').textContent = '📱 持ち出す先を選んでください…';
    const r = await window.mp3.スマホへ持ち出す(リスト.id, 曲情報);
    if (!r) return;
    if (r.canceled) { $('status').textContent = ''; return; }
    if (!r.ok) {
      $('status').textContent = '⚠ 持ち出せませんでした: ' + (r.error || '不明');
      return;
    }
    /*
     * ★黙って終わらせない。運べなかったものは必ず出す。
     * 「余り」は前に置いたぶんが残っているだけのことが多いので、
     * **消さずに数だけ知らせる**（置き場を間違えて指されたとき、消すほうが怖い）。
     */
    const mb = (r.大きさ / 1024 / 1024).toFixed(0);
    const 但し = [];
    if (r.見つからない) 但し.push(`${r.見つからない} 曲は元のファイルが見当たりませんでした`);
    if (r.運べなかった && r.運べなかった.length) 但し.push(`${r.運べなかった.length} 曲は運べませんでした`);
    if (r.余り) 但し.push(`この一本に無いファイルが ${r.余り} 個、先に残っています（消していません）`);
    $('status').textContent = `📱 ${r.運んだ} 曲（${mb} MB）を運びました: ${r.先}`
      + (但し.length ? `　※ ${但し.join(' ／ ')}` : '')
      + `　スマホに繋いで、このフォルダごとコピーしてください（${r.題ファイル || 'm3u'} を開けば並び順どおりに鳴ります）`;
  });

  ボタン('m3u で保存', async () => {
    const r = await window.mp3.m3uに書き出す(リスト.id, tracks);
    if (r?.ok) await 知らせる(`保存しました\n${r.path}`);
    else if (r && !r.canceled) await 知らせる(`保存できませんでした（${r.error ?? '不明'}）`);
  }, リスト.tracks.length === 0);

  ボタン('名前を変える', () => {
    名前入力 = { mode: 'rename', id: リスト.id, value: リスト.name };
    描き直す();
  });

  // 指示書:「再生リストを削除するとき、確認ダイアログを出す: 出す」
  ボタン('この再生リストを削除', async () => {
    if (!await 確かめる(`再生リスト「${リスト.name}」を削除しますか？\n\n曲のファイルは削除されません。`)) return;
    lists = await window.mp3.リストを消す(リスト.id);
    開いているID = null;
    描き直す();
  });
}

/**
 * API キーのボタンの文字を、いまの状態に合わせる。
 *
 * ■ 本人の指摘（2026-08-29）
 *   > 下の欄の「気分で選ぶ」ボタンですが、今となっては何のボタンか
 *   > わからないのでAPIキーを登録するボタンだとちゃんと書いたほうがいい
 *
 * ★もとは「🤖 気分で選ぶ」だった。作った当時はそれが唯一の機能だったが、
 * いまは押すと**キーを入れる／消す**だけで、選曲はしない。
 * 名前が仕事とずれていた。**押す前に何が起きるかを、そのまま書く。**
 *
 * ★入っているときは「消す」と書く。同じ文字のまま押すたび意味が変わるのが
 * いちばん分かりにくい（消すつもりが無いのに押してしまう）。
 */
function キーのボタンを直す() {
  const b = $('aikey');
  if (!b) return;
  b.textContent = AIが使える ? '🔑 APIキーを消す' : '🔑 APIキーを入れる';
  b.title = AIが使える
    ? 'この PC にしまってある Anthropic の API キーを消します（曲は何も変わりません）'
    : 'Anthropic の API キーを登録します。入れると、上に「気分を書く」欄と「言葉から辿る」欄が出ます';
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
  絞りを外すボタンを直す();   // ★何か絞っているときだけ出す
  キーのボタンを直す();
  気分の欄を描く();
  組む範囲を書く();          // ★カラムを変えるたびに書き換える
  まとめのボタンを直す();    // ★まとめの有無で、札と出し隠しが変わる
  響きの欄を描く();
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
/**
 * 裏（走査の途中経過など）からの描き直し。
 *
 * ★入力中は触らない。
 * 2026-08-29 実地、本人からの報告:
 *   > ライブラリの削除をした後に、resonanceやAIの記入欄に文字を入れようとしたら
 *   > 文字を入れられなかった（スキャン中だから重くなってるだけかも？）
 *
 * 重かったのではなかった。**走査中は 1.5 秒ごとにここが呼ばれ、
 * そのたびに欄が作り直されて、焦点も打った字も飛んでいた。**
 *
 * ★ここが守っていたのは、古い 2 つの入力だけだった。
 * あとから欄を足すたびに、ここに足さないと同じ目に遭う。
 * **だから個別に並べず、「いま文字を打っている最中か」で見る。**
 */
function 裏で描き直す() {
  if (名前入力 || タグ編集 || キー入力) return;
  // いま画面のどこかの入力欄に焦点があるなら、触らない
  const い = document.activeElement;
  if (い && (い.tagName === 'INPUT' || い.tagName === 'TEXTAREA')) return;
  描き直す();
}

/*
 * ★スマホへ持ち出すときの進み具合（2026-08-30）。
 * 139 MB のコピーは数秒かかる。黙っていると固まったように見える。
 */
window.mp3.持ち出しの進みを受ける((p) => {
  const mb = (p.大きさ / 1024 / 1024).toFixed(0);
  $('status').textContent = `📱 スマホへ運んでいます… ${p.済み} / ${p.全体} 曲（${mb} MB）`;
});

/*
 * ★スマホへ持ち出すときの進み具合（2026-08-30）。
 * 139 MB のコピーは数秒かかる。黙っていると固まったように見える。
 */
window.mp3.持ち出しの進みを受ける((p) => {
  const mb = (p.大きさ / 1024 / 1024).toFixed(0);
  $('status').textContent = `📱 スマホへ運んでいます… ${p.済み} / ${p.全体} 曲（${mb} MB）`;
});

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
  /*
   * ★AI が組んだ一本なら、その曲を選んだ理由を出す（2026-08-29）。
   * 出さないと、ただ曲が並んでいるのと見分けがつかない。
   */
  const 一言 = AIのひとこと.get(t.path);
  /*
   * ★響きで当たった曲なら、なぜおすすめかも出す（本人の指示）。
   *   > description は「なぜおすすめか」です。曲を出すとき、
   *   > なぜその曲なのかを画面に出すのに使ってください
   * AI のひとことと両方あるときは、両方出す（別のことを言っているので）。
   */
  const 響き = (響きの当たり && 響きの当たり.曲.get(t.path)) || null;
  const 印 = [一言 ? '🤖 ' + 一言 : '', 響き ? '🌐 ' + 響き.description : ''].filter(Boolean).join('　');
  $('sub').textContent = 印 ? `${t.artist} — ${t.album}　${印}` : `${t.artist} — ${t.album}`;
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
    const くじ列 = 鳴る列.filter((x) => !シャッフル除外.has(x.path) && !自分のか(x));
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
    const 候補 = 列.filter((t) => !シャッフル除外.has(t.path) && !自分のか(t)).map((t) => t.path);
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
      await 知らせる(
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
  再スキャンのボタンを直す();                   // ★「止める」に付け替える

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

    /*
     * ★フォルダが 1 つも登録されていない。
     * 走査は走っていないので、覚えている一覧がそのまま返ってくる。
     * **黙って「0 曲」と出さない。** 探す場所が無いだけで、曲は消えていない。
     */
    if (r.フォルダが無い) {
      tracks = r.tracks;
      響きを合わせ直す();
      裏で描き直す();
      $('status').textContent = tracks.length
        ? `⚠ 音楽フォルダが登録されていません。下の「＋ フォルダを足す」から入れてください`
          + `　（いま出ている ${tracks.length.toLocaleString('ja-JP')} 曲は、前に読んだ記録です）`
        : '⚠ 音楽フォルダが登録されていません。下の「＋ フォルダを足す」から入れてください';
      // ★外したものを戻すボタンは、走査しなくても出す（記録は生きているので）
      外したものボタンを直す(r.hidden);
      return;   // ★走査中の後始末は finally がやる
    }

    tracks = r.tracks;
    響きを合わせ直す();                        // ★曲が入れ替わったので当たりを取り直す
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
      await 知らせる(
        '読み込んだ結果を保存できませんでした。\n\n'
        + `理由: ${r.覚え書きの保存.error}\n\n`
        + 'このままだと、次に開いたときに**また最初から読み直し**になります。\n'
        + 'ディスクの空きを確かめてください。',
      );
    }
    if (r.hidden) 補足.push(`一覧から外した ${r.hidden} 件`);
    if (r.使い回し) 補足.push(`変わっていない ${r.使い回し} 件は読み直していません`);
    /*
     * ★途中で止めたときは、そう言う。
     * 「N 曲」とだけ出すと、全部読み終えたように見えてしまう。
     */
    const 止め = r.止めた
      ? `　■ 途中で止めました（次は続きから進みます${r.補った ? ' ／ まだ見ていない ' + r.補った.toLocaleString('ja-JP') + ' 曲は前の記録から出しています' : ''}）`
      : '';
    $('status').textContent = `${見える曲().length} 曲${補足.length ? '（' + 補足.join(' / ') + '）' : ''}${止め}`;
  } catch (e) {
    // ★黙って失敗させない
    $('status').textContent = '読み込めませんでした: ' + (e && e.message ? e.message : '不明');
  } finally {
    走査中 = false;
    再スキャンのボタンを直す();                 // ★「再スキャン」に戻す
  }
}

$('add').onclick = async () => {
  const s = await window.mp3.フォルダを足す();
  if (!s) return;
  フォルダを描く(s);
  await 走査する();
};
/*
 * ★キーの出し入れ。ここだけはキーが無くても出しておく（入れる道が要るので）。
 *
 * ★入れたキーは画面に持たない。本体へ渡してすぐ捨てる。
 * 読み返す手立ても作らない（本体側に「返す」窓口を置いていない）。
 * 画面から読めるようにすると、外から来た文字列で盗める形になりうる。
 */
/*
 * ★ボタンは封印してある（index.html）。処理と JSON の形は残す。
 * Resonance が公開されたら、あちらを戻すだけで繋がる。
 */
if ($('resload')) $('resload').onclick = async () => {
  const r = await window.mp3.響きを読み込む();
  if (!r || r.canceled) return;
  if (!r.ok) { await 知らせる("読めませんでした: " + r.error); return; }
  響きの木 = r.木;
  響きを合わせ直す();
  描き直す();
  const 当 = 響きの当たり.当たり;
  $("status").textContent = 当.length
    ? `響き ${r.木.木.length} 本を読みました ― ${当.length} 組・${響きの当たり.曲.size.toLocaleString("ja-JP")} 曲が手元にありました`
    : `響き ${r.木.木.length} 本を読みましたが、手元に当たるものがありませんでした（音楽の言葉で辿った木だと当たります）`;
};

$('aikey').onclick = async () => {
  const 状態 = await window.mp3.AIが使えるか();
  if (状態.使える) {
    if (await 確かめる("APIキーを消しますか？\n\n「気分から一本を組む」と「言葉から辿る」が使えなくなります。\n曲は何も変わりません。")) {
      await window.mp3.AIのキーを消す();
      AIが使える = false;
      キー入力 = null;
      描き直す();
      $('status').textContent = 'APIキーを消しました';
    }
    return;
  }
  if (!状態.しまえる) {
    await 知らせる("この環境では、キーを暗号化して保存できません。\n平文で保存はしないので、この機能は使えません。");
    return;
  }
  /*
   * ★prompt() は使わない。**Electron では動かない。**
   * ここで一度踏んだ（2026-08-29）。画面の中に欄を出す。
   */
  キー入力 = { value: "" };
  描き直す();
  $('status').textContent = '上の欄に API キーを貼り付けてください（console.anthropic.com で作れます）';
};

/**
 * 再スキャンのボタン。**走査中は「止める」に変わる。**
 *
 * ■ なぜ要るか（2026-08-29 本人の希望）
 *   > デカいライブラリをスキャンしたらパソコンが重くなったんですが
 *   > 止めるボタンを作ってください。
 *
 * 大きなライブラリでは読み終わるまで数十分ディスクを占め続ける
 * （作者の 86,000 曲で約 50 分）。CPU ではなくディスクが詰まるので、
 * ほかのアプリの読み書きまで遅くなる。
 * それまでは**窓を閉じるしか止める方法が無かった。**
 *
 * ★ボタンは増やさない。走査中に「再スキャン」を押せても意味が無いので
 * （二重に走らせない作り）、同じ場所を付け替える。
 */
function 再スキャンのボタンを直す() {
  const b = $('rescan');
  if (!b) return;
  b.textContent = 走査中 ? '■ 止める' : '再スキャン';
  b.classList.toggle('on', 走査中);
  b.title = 走査中
    ? '読み込みを途中で止めます。★そこまで読んだぶんは残るので、次は続きから進みます'
    : 'フォルダをもう一度読み込みます';
}

$('rescan').onclick = async () => {
  if (走査中) {
    /*
     * ★押しても、そこまで読んだぶんは捨てない。
     * 30 秒ごとに覚え書きを保存しているので、次は続きから進む。
     * 途中でやめたら全部やり直し、では押せるボタンにならない。
     */
    $('status').textContent = '止めています…';
    await window.mp3.走査を止める();
    return;
  }
  走査する(true);                              // ★押されたと伝える（動かないときに黙らないため）
};

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
  if (!await 確かめる(
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
  if (typeof 列幅.__sideWidth === 'number') $('tabs').style.width = `${列幅.__sideWidth}px`;

  // ★覚えた音量を戻す。戻さないと、開くたびに大音量から始まる
  音量 = await window.mp3.音量を取る();
  audio.volume = 音量;
  $('vol').value = String(Math.round(音量 * 100));
  $('volicon').textContent = 音量 === 0 ? '🔇' : 音量 < 0.5 ? '🔉' : '🔊';

  // ★覚えた「タグ無しを隠す」を戻す
  タグ無しを隠す = await window.mp3.タグ無しを隠すか();
  /*
   * ★手直しを読む（2026-08-30）。
   * 本体が曲に重ねてから渡してくれるので、ここでは控えを持つだけ。
   * 置き場は、本人に見せるために覚えておく。
   */
  {
    const 手 = await window.mp3.手直しを取る();
    if (手) { 手直し = 手.手直し; 手直しの置き場 = 手.置き場; }
  }
  // ★覚えた「自分の音源」を戻す
  自分の音源 = new Set(await window.mp3.自分の音源を取る());
  // ★覚えたジャンルのまとめを戻す（無ければ空のまま。タブも出ない）
  まとめを入れる(s.ジャンルのまとめ);
  /*
   * ★AI が使えるかを聞く。**キーが無くても落ちないこと。**
   * 落ちると、この行より後の起動処理が全部止まる。
   * 使えないときは、気分の欄が出ないだけにする。
   */
  try {
    const 状態 = await window.mp3.AIが使えるか();
    AIが使える = !!(状態 && 状態.使える);
  } catch { AIが使える = false; }
  // ★つまみの段を取る。取れなくても、つまみが出ないだけで動く
  await AIのつまみを取り直す();
  /*
   * ★響きも読む。**無くても壊れない。**
   * 無ければ欄が出ないだけで、ほかは今までどおり。
   */
  try { 響きの木 = await window.mp3.響きを取る(); } catch { 響きの木 = null; }
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
      await 知らせる(
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
    await 知らせる(`再生リストから ${r.落とした} 曲を取り除きました。\n\n元の MP3 ファイルが見つからなくなったためです。`);
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
        響きを合わせ直す();                    // ★覚え書きから出したぶんも突き合わせる
        描き直す();
        $('status').textContent = (引き継ぎの知らせ ? 引き継ぎの知らせ + ' ／ ' : '')
          + `${c.件数.toLocaleString('ja-JP')} 曲（前回のぶん。いま確かめています…）`;
      }
    } catch { /* 覚えていないだけ。走査すれば出る */ }
    await 走査する();
  } else {
    /*
     * ★フォルダが 1 つも登録されていないとき（2026-08-29 実地）。
     *
     * ここは 描き直す() を呼ぶだけだった。つまり:
     *   ・覚えている一覧を**出さない**（86,044 曲あっても 0 曲の画面）
     *   ・なぜ空なのかを**言わない**
     * 本人の設定を見たら、まさにこの状態だった（folders が空）。
     * 曲は消えていないのに、**消えたようにしか見えない。**
     * その状態で AI や響きを試しても、当然なにも起きない。
     *
     * ★覚えている一覧は出す。走査はしない（探す場所が無いので、
     * 走らせると「見つからない＝無くなった」になって覚え書きが消える）。
     */
    try {
      const c = await window.mp3.覚えている一覧();
      if (c.tracks.length) { tracks = c.tracks; 響きを合わせ直す(); }
    } catch { /* 覚えていないだけ。フォルダを足せば出る */ }
    描き直す();                                 // フォルダが無くてもタブは出す
    const 足してください = '⚠ 音楽フォルダが登録されていません。下の「＋ フォルダを足す」から入れてください';
    $('status').textContent = tracks.length
      ? `${足してください}　（いま出ている ${tracks.length.toLocaleString('ja-JP')} 曲は、前に読んだ記録です）`
      : 足してください;
  }
})();
