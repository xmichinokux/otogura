/*
 * 言葉 ―― 日本語と英語を切り替える土台。
 *
 * ■ 本人の希望（2026-08-29 に決めた 3 つ）
 *   ・AI も英語で返す
 *   ・英語版の README も作る
 *   ・OS の言語を見て自動で切り替えたうえで、手動でも切り替えられる
 *
 * ■ ★鍵は「日本語そのもの」にする
 *
 * 訳の鍵に別の ID（'ai.playlist.failed' のような）を振るやり方もあるが、
 * この企画では**日本語を鍵にする。** 理由は 2 つ。
 *
 *  1. ★検査が 15 本あり、その多くが**日本語の文字列を当てにしている。**
 *     例: /一本を組めませんでした/.test(画面)
 *     鍵を日本語にすれば 言('一本を組めませんでした') はソースにその文字列を
 *     含むので、**検査がそのまま通る。** ID を振ると 15 本ぜんぶ書き換えになる。
 *
 *  2. 訳を書き忘れても、日本語がそのまま出るだけで**壊れない。**
 *     空欄や 'undefined' が出るより、ずっとまし。
 *
 * ■ ★差し込み
 * 「${成功} 曲を書き換えました」のような文が多いので、{名前} で受ける。
 *   言('{n} 曲を書き換えました', { n: 5 })
 *
 * ■ ★訳が無いときは、日本語を返す
 * 途中まで訳した状態でも動く。少しずつ進められる。
 */

/** いまの言葉。'ja' か 'en'。既定は日本語 */
let いまの言葉 = 'ja';

/**
 * OS の言葉から決める。
 * @param locale app.getLocale() の返り（'ja' / 'en-US' など）
 */
function 言葉を選ぶ(locale) {
  const s = String(locale || '').toLowerCase();
  /* ★日本語以外は英語にする。中途半端に日本語を出すより分かりやすい */
  return s.startsWith('ja') ? 'ja' : 'en';
}

/**
 * 言葉を決める。
 * @param 設定 'auto' / 'ja' / 'en'
 * @param locale OS の言葉（設定が 'auto' のときだけ使う）
 */
function 言葉を決める(設定, locale) {
  if (設定 === 'ja' || 設定 === 'en') return 設定;
  return 言葉を選ぶ(locale);
}

/** いまの言葉を入れ替える */
function 言葉を入れる(v) {
  いまの言葉 = (v === 'en') ? 'en' : 'ja';
  return いまの言葉;
}

/** いまの言葉 */
function いまの() { return いまの言葉; }

/** 英語か */
function 英語か() { return いまの言葉 === 'en'; }

/*
 * 訳。鍵は日本語そのもの。
 * ★ここに無いものは、日本語のまま出る（壊れない）。
 */
const 訳 = {
  en: {
    /* ── AI の欄 ── */
    '一本を組む': 'Build a set',
    '辿る': 'Trace',
    'いまの気分を書く': 'How are you feeling?',
    '言葉を 1 つ入れて辿る': 'Enter one word to trace',
    '🛠 整える ▼': '🛠 Tidy up ▼',
    '🛠 整える ▲': '🛠 Tidy up ▲',
    '⏹ 止める': '⏹ Stop',
    '止めています…': 'Stopping…',
    '止めました（何も作っていません）': 'Stopped. Nothing was created.',
    'だめでした': 'Failed',
    '聞いています…': 'Asking…',
    '🌀 拡大解釈 入': '🌀 Wide reading: on',
    '🌀 拡大解釈 切': '🌀 Wide reading: off',
    'ジャンル名をまとめる': 'Group genre names',
    'ジャンル名をまとめ直す': 'Re-group genre names',
    'まとめをやめる': 'Undo grouping',
    'ジャンル名無しを埋める': 'Fill in missing genres',
    '手直しを見る': 'Show my edits',
    '手直しを捨てる': 'Discard my edits',
    'しまう': 'Save',
    'やめる': 'Cancel',
    'はい': 'Yes',
    '閉じる': 'Close',
    'これでまとめる': 'Group them',
    'これで入れる': 'Fill them in',

    /* ── つまみ ── */
    '狭い': 'Narrow',
    '広い': 'Wide',
    '王道': 'Classic',
    '外す': 'Off-centre',
    'やや狭い': 'Somewhat narrow',
    'やや広い': 'Somewhat wide',
    'ふつう': 'Middle',
    'やや王道': 'Somewhat classic',
    'やや外す': 'Somewhat off-centre',
    '少なめ': 'Few',
    'やや少なめ': 'Somewhat few',
    'やや多め': 'Somewhat many',
    '多め': 'Many',
    '対象の幅 ― どれだけ広い範囲から選ぶか': 'Range — how wide a pool to choose from',
    '選出の量 ― 何曲の一本にするか': 'Amount — how many songs in the set',
    '文脈の強度 ― 王道を守るか、外すか': 'Context — stay classic, or go off-centre',

    /* ── よく出る短いもの ── */
    '不明': 'unknown',
    'ジャンル': 'Genre',
    'アーティスト': 'Artist',
    'アルバム': 'Album',
    '言葉': 'Word',
    '演者': 'Artist',
    '盤': 'Album',
    '年': 'Year',
    '月': 'Month',
    '日': 'Day',
    'ジャンル（まとめ）': 'Genre (grouped)',
    'すべて': 'All',
    'ライブラリ': 'Library',

    /* ── 差し込みのあるもの ── */
    'APIキーが設定されていません': 'No API key has been set',
    '{n} 曲から組んでいます…': 'Building from {n} songs…',
    '組む範囲: ': 'Building from: ',
    '（ライブラリ全部）': '(the whole library)',
    '絞り込みを全部外しました（ライブラリ全体に戻っています）':
      'Cleared every filter. You are back to the whole library.',
    '✕ 絞りを外す（{n}）': '✕ Clear filters ({n})',
    '{n} 曲': '{n} songs',
    '手直しを捨てる（{n} 曲）': 'Discard my edits ({n})',
  },
};

/**
 * 訳す。
 *
 * @param 日本語   鍵。そのまま日本語としても使える
 * @param 差し込み { 名前: 値 }。文の {名前} を置き換える
 */
function 言(日本語, 差し込み) {
  const 元 = String(日本語 ?? '');
  const 表 = 訳[いまの言葉];
  let 文 = (表 && Object.prototype.hasOwnProperty.call(表, 元)) ? 表[元] : 元;
  if (差し込み && typeof 差し込み === 'object') {
    for (const [k, v] of Object.entries(差し込み)) {
      文 = 文.split('{' + k + '}').join(String(v));
    }
  }
  return 文;
}

/** ★訳がまだ無いものを数える（どこまで進んだかを知るため） */
function 訳の進み(候補) {
  const 表 = 訳.en || {};
  const 並び = Array.isArray(候補) ? candidatesOf(候補) : [];
  const ある = 並び.filter((v) => Object.prototype.hasOwnProperty.call(表, v)).length;
  return { 全部: 並び.length, 訳した: ある, まだ: 並び.length - ある };
}
function candidatesOf(a) { return a.filter((v) => typeof v === 'string' && v); }

// Node（本体・検査）と画面（<script> 読み込み）の両方で使えるようにしておく。
// 同じ処理を 2 か所に書くと、片方だけ直す事故になる。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 言, 言葉を選ぶ, 言葉を決める, 言葉を入れる, いまの, 英語か, 訳, 訳の進み };
}
