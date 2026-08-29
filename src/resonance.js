'use strict';

/**
 * Resonance（Kokoro OS のカルチャーツリー）を読んで、手元の曲と突き合わせるところ。
 *
 * ■ 本人の依頼（2026-08-29）
 *   > 「この人が響いた言葉の周りにある名前」から曲を出します。
 *
 * Resonance は、言葉を 1 つ入れるとジャンルを超えた木を生やす Kokoro OS のアプリ。
 * その木を JSON で書き出したものを読む。
 *
 * ─────────────────────────────────────────────────────────
 * ■ ★name を何に当てるか ―― artist だけ（実測で決めた）
 *
 * 「title / artist / album のどれに当てるか決めて仕様に書いてください」と
 * 頼まれたので、実物（resonance-trees-2026-08-29.json、7 本 147 ノード）と
 * 本人のライブラリ 86,044 曲で数えた:
 *
 *   music ノード 43 個が、どれに当たるか
 *     artist だけ      22 個
 *     album だけ        0 個
 *     title だけ        6 個
 *     artist + album   22 個  ← **album を足しても 1 個も増えない**
 *     3 つ全部         22 個  ← **title を足しても 1 個も増えない**
 *
 * ★album も title も、music ノードには 1 個も足さなかった。
 * 足すと増えるのは music **以外**のノードの、偶然の同名だけだった:
 *
 *     Straight Edge [other] 曲名として 2 曲   ← 思想の名前
 *     Andy Warhol   [art]   曲名として 1 曲   ← 芸術家の名前
 *     Factory       [place] 曲名として 1 曲   ← 場所の名前
 *     The Wall      [movie] 曲名として 5 曲   ← 映画の名前
 *     Control       [movie] 盤として  10 曲   ← 映画の名前
 *
 * 曲名は短い普通の言葉が多く（Control / Revenge / Time / Heroin）、
 * **当たっても何の意味も無い。** だから artist だけに当てる。
 *
 * ★genre === 'music' のノードだけ拾う。
 * 実測で、音楽以外の言葉で引いた木（人工知能・量子力学・エマニュエル・トッド）は
 * music ノードがほぼ無く、当たりも 0 だった。
 * ─────────────────────────────────────────────────────────
 *
 * ■ ★86,044 曲を何度も走査しない（本人の指示）
 * 突き合わせは**曲の側を 1 周するだけ**にする。
 * 木の名前を集合にしておいて、曲を 1 回なめながら引く。
 * 名前ごとに全曲を探すと 22 × 86,044 回になる。
 */

/**
 * 突き合わせ用に名前をならす。
 * ★3 カラムのまとめ方（小文字にして比べる）と同じ考え方。
 * 加えて先頭の The と記号を落とす。「The Smiths」と「Smiths」を同じに見る。
 */
function ならす(v) {
  return String(v == null ? '' : v).toLocaleLowerCase('ja')
    .replace(/[「」『』()（）[\]]/g, ' ')
    .replace(/^the\s+/, '')
    .replace(/[.,!?・_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 書き出しファイルの中身を読む。
 *
 * ★壊れていても例外を投げない。読めないだけで、ほかの機能は動き続ける。
 * ★知らない欄は捨てる。増えても壊れないように。
 */
function 読み込む(文) {
  let 生;
  try {
    生 = typeof 文 === 'string' ? JSON.parse(文) : 文;
  } catch {
    return { ok: false, error: 'JSON として読めませんでした' };
  }
  if (!生 || typeof 生 !== 'object') return { ok: false, error: '中身が空です' };
  if (生.version !== 1) return { ok: false, error: `知らない version です（${生.version}）。Resonance 側の書き出しを確かめてください` };
  if (!Array.isArray(生.entries)) return { ok: false, error: 'entries がありません' };

  const 木 = [];
  for (const e of 生.entries) {
    if (!e || typeof e.keyword !== 'string' || !Array.isArray(e.nodes)) continue;
    const 節 = [];
    for (const n of e.nodes) {
      if (!n || typeof n.name !== 'string' || !n.name.trim()) continue;
      節.push({
        name: n.name.trim(),
        genre: typeof n.genre === 'string' ? n.genre : 'other',
        description: typeof n.description === 'string' ? n.description.trim() : '',
        depth: Number.isFinite(n.depth) ? n.depth : 0,
      });
    }
    if (節.length) 木.push({ keyword: e.keyword.trim(), savedAt: typeof e.savedAt === 'string' ? e.savedAt : '', nodes: 節 });
  }
  if (!木.length) return { ok: false, error: '使える木がありませんでした' };
  return { ok: true, 木: { exportedAt: typeof 生.exportedAt === 'string' ? 生.exportedAt : '', 木 } };
}

/**
 * 重み。**深いほど強く、新しいほど強く**（本人の指示）。
 *
 *   > depth が深いほど強く。遠いところの当たりのほうが発見として面白いので
 *   > savedAt が新しいほど強く
 *
 * ★深さは 0〜3 なので (1 + depth) で 1〜4 倍。
 * ★新しさは 60 日で半分になる緩やかな減り方にした。
 *   実物の木は 5 月〜8 月に散らばっていて、急に切ると古いものが死ぬ。
 */
function 重みを出す(depth, savedAt, いま) {
  const 深さぶん = 1 + (Number.isFinite(depth) ? Math.max(0, Math.min(3, depth)) : 0);
  const t = Date.parse(savedAt || '');
  if (!Number.isFinite(t)) return 深さぶん;              // 日付が無ければ深さだけ
  const 経過日 = Math.max(0, (いま - t) / 86400000);
  return 深さぶん * (1 / (1 + 経過日 / 60));
}

/**
 * 木と、手元の曲を突き合わせる。
 *
 * @param 木     読み込む() の返り値の 木
 * @param tracks 画面が持っている曲（ここで 1 周だけする）
 * @param いま   時刻（ミリ秒）。試験で差し替えられるように引数にする
 * @returns {
 *   当たり: [{ artist, description, keyword, depth, savedAt, 重み, 曲数 }],  // 重い順
 *   曲: Map<パス, { artist, description, keyword, 重み }>,                  // 当たった曲
 *   外れ: [名前]                                                            // music なのに手元に無かった
 * }
 */
function 突き合わせる(木, tracks, いま = Date.now()) {
  const 空 = { 当たり: [], 曲: new Map(), 外れ: [] };
  if (!木 || !Array.isArray(木.木) || !Array.isArray(tracks)) return 空;

  /*
   * ★music のノードだけ拾う。
   * 同じ名前が複数の木に出ることがある（Minor Threat が 2 本に出ていた）。
   * そのときは**重いほうを採る**（深く・新しいほうの理由が残る）。
   */
  const 候補 = new Map();                                // ならした名前 → 情報
  for (const e of 木.木) {
    for (const n of e.nodes) {
      if (n.genre !== 'music') continue;
      const k = ならす(n.name);
      if (!k) continue;
      const 重み = 重みを出す(n.depth, e.savedAt, いま);
      const 前 = 候補.get(k);
      if (!前 || 重み > 前.重み) {
        候補.set(k, { name: n.name, description: n.description, keyword: e.keyword, depth: n.depth, savedAt: e.savedAt, 重み });
      }
    }
  }
  if (!候補.size) return 空;

  /*
   * ★曲の側を 1 周だけする（86,044 曲）。
   * 名前ごとに全曲を探すと 22 × 86,044 回になる。ここは 1 × 86,044 回。
   */
  const 当たり表 = new Map();                            // ならした名前 → { 情報, 曲数, 表示名 }
  const 曲 = new Map();
  for (const t of tracks) {
    if (!t || typeof t.artist !== 'string') continue;
    const k = ならす(t.artist);
    const c = 候補.get(k);
    if (!c) continue;
    let e = 当たり表.get(k);
    if (!e) { e = { ...c, artist: t.artist, 曲数: 0 }; 当たり表.set(k, e); }
    e.曲数 += 1;
    曲.set(t.path, { artist: t.artist, description: c.description, keyword: c.keyword, 重み: c.重み });
  }

  const 当たり = [...当たり表.values()].sort((a, b) => b.重み - a.重み || b.曲数 - a.曲数);
  const 外れ = [...候補.entries()].filter(([k]) => !当たり表.has(k)).map(([, c]) => c.name);
  return { 当たり, 曲, 外れ };
}

/**
 * AI の頼み文に足す一節。
 *
 * ★description をそのまま渡す（本人の指示: 「なぜおすすめか」）。
 * これがあると、AI が「なぜその曲を置いたか」を、こちらの文脈に沿って書ける。
 * ★長くしない。上位だけ渡す。全部渡すと候補一覧を圧迫する。
 */
function 響きの一節(当たり, 上限 = 12) {
  if (!当たり || !当たり.length) return '';
  const 行 = 当たり.slice(0, 上限)
    .map((a) => `・${a.artist}（${a.曲数}曲）… ${a.description}　［「${a.keyword}」から深さ${a.depth}］`);
  return [
    '■ この人が最近「響いた」言葉と、その周りにあった名前',
    '（Kokoro OS の Resonance で辿ったもの。手元にある演者だけ載せています）',
    ...行,
    '',
    '★ここに挙がった演者は、**いま気になっている場所**です。気分に合うなら優先してください。',
    '★ただし気分が違う方を向いていれば、無理に入れないこと。',
  ].join('\n');
}

// Node（本体・検査）と画面（<script> 読み込み）の両方で使えるようにしておく。
// 同じ処理を 2 か所に書くと、片方だけ直す事故になる（shuffle.js と同じ形）。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ならす, 読み込む, 重みを出す, 突き合わせる, 響きの一節 };
}
