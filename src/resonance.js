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
 * ★新しさは 60 日で半分になる緩やかな減り方にした。
 *   実物の木は 5 月〜8 月に散らばっていて、急に切ると古いものが死ぬ。
 *
 * ★深さの向きを、つまみ（王道↔外す）に繋いだ（2026-08-31 本人の希望）。
 *
 *   > 響きを知覚を濃くするためにつまみに繋げてください。
 *
 * それまでは**固定で「深いほど重い」**（1〜4 倍）だった。
 * 遠い当たりのほうが発見として面白い、という当初の指示による。
 * だが「軸のそばを濃くしたい」ときは、これが逆に働く。
 *
 * ★既定の動きが変わる。「ふつう」は深さで差を付けない。
 * これまでどおりが良ければ、つまみを 1 つ右（やや外す）へ。
 */
const 深さの段 = [
  [4, 3, 2, 1],        // 王道     … 浅いほど重い。軸のそばを濃くする
  [3, 2.5, 2, 1.5],    // やや王道
  [1, 1, 1, 1],        // ふつう   … 深さで差を付けない
  [1, 2, 3, 4],        // やや外す … ★これまでの既定の動き
  [1, 3, 5, 7],        // 外す     … 遠くほど強く
];

/** つまみの目盛（1〜5）。範囲の外は「ふつう」に丸める */
function 深さの重み(depth, 目盛) {
  const d = Number.isFinite(depth) ? Math.max(0, Math.min(3, Math.round(depth))) : 0;
  const i = Number.isFinite(目盛) ? Math.max(1, Math.min(5, Math.round(目盛))) : 3;
  return 深さの段[i - 1][d];
}

function 重みを出す(depth, savedAt, いま, 目盛 = 3) {
  const 深さぶん = 深さの重み(depth, 目盛);
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
 * ★当たりと外れで、照合の厳しさを変える（2026-08-29 本人の指示）。
 *
 *   当たり（曲を鳴らす側）… 演者の完全一致。**厳しく。**
 *                            違う曲を鳴らすほうが困るので
 *   外れ（持っていないと言う側）… **もっと緩く。** 演者だけでなく
 *                            盤名・曲名にも部分一致で当ててみて、
 *                            どれにも無いものだけを外れにする
 *
 * ★本人の言葉:
 *   > いまの判定をそのまま裏返すと、アルバム名や曲名としてしか
 *   > 持っていないもの、コンピレーションで持っているものが、
 *   > 全部「持っていない」に化けます。
 *   > 持っているのに買いに行かせるのが一番困ります。
 *
 * ★実測（本人の 86,044 曲。名前の 4 分の 3 は何らかの形で持っている作り）:
 *
 *   名前  22 個 … 厳しいと外れ 15 個 → 緩くすると **5 個**（10 個は持っていた）
 *   名前 150 個 … 厳しいと外れ 110 個 → 緩くすると **37 個**
 *
 *   かかる時間  名前 22 個で 96 ms ／ 150 個で 339 ms（曲を 1 周するだけ）
 *
 * ★短い名前は、盤名や曲名に紛れて「持っている」側に倒れやすい。
 * それでよい。**間違えるなら「持っている」側に間違える。**
 * 持っていないものを見落とすより、持っているのに買わせるほうが困る。
 *
 * @returns {
 *   当たり: [{ artist, description, keyword, depth, savedAt, 重み, 曲数, 言葉数, 言葉たち }],  // 重い順
 *   曲: Map<パス, { artist, description, keyword, 重み }>,                  // 当たった曲
 *   外れ: [{ name, description, keyword, depth, savedAt, 重み }],           // 緩く探しても無かった。重い順
 * }
 */
function 突き合わせる(木, tracks, いま = Date.now(), 目盛 = 3) {
  const 空 = { 当たり: [], 曲: new Map(), 外れ: [] };
  if (!木 || !Array.isArray(木.木) || !Array.isArray(tracks)) return 空;

  /*
   * ★music のノードだけ拾う。
   * 同じ名前が複数の木に出ることがある（Minor Threat が 2 本に出ていた）。
   * 理由（description）は**重いほうを採る**（深く・新しいほうが残る）。
   *
   * ■ ★「交差」＝ いくつの言葉から辿り着いたか（2026-08-29）
   *
   * 本人の問い:
   *   > たくさん使えば何かいいことがある機能ってありますか？
   *
   * ★ここに 1 つあった。しかも**捨てていた。**
   * 前は「重いほうを採る」だけで、**何本の言葉から辿り着いたかを数えていなかった。**
   *
   * 別々の言葉から同じ名前に行き着くのは、偶然ではない。
   * 「その人の中で、いくつもの筋がそこへ通じている」ということ。
   * ★そして**言葉を辿るほど増える。** 1 本目では絶対に起きない。
   * 使うほど出てくる、という性質がここにある。
   *
   * ★強さは 言葉の数ぶん掛ける（3 倍で頭打ち）。
   * 深さの差が 1〜4 倍なので、同じくらいの効き方になる。
   * 頭打ちにするのは、言葉が増えたときに**よくある名前だけが上に居座る**のを
   * 防ぐため。交差は「見つける」ためのものであって、順位を独占させない。
   */
  const 候補 = new Map();                                // ならした名前 → 情報
  for (const e of 木.木) {
    for (const n of e.nodes) {
      if (n.genre !== 'music') continue;
      const k = ならす(n.name);
      if (!k) continue;
      const 重み = 重みを出す(n.depth, e.savedAt, いま, 目盛);
      const 前 = 候補.get(k);
      if (!前) {
        候補.set(k, {
          name: n.name, description: n.description, keyword: e.keyword,
          depth: n.depth, savedAt: e.savedAt, 素の重み: 重み,
          // ★どの言葉から辿り着いたか。同じ言葉は数えない
          言葉たち: [e.keyword],
        });
      } else {
        if (!前.言葉たち.includes(e.keyword)) 前.言葉たち.push(e.keyword);
        if (重み > 前.素の重み) {
          前.name = n.name; 前.description = n.description; 前.keyword = e.keyword;
          前.depth = n.depth; 前.savedAt = e.savedAt; 前.素の重み = 重み;
        }
      }
    }
  }
  // 交差のぶんを掛ける（3 倍で頭打ち）
  for (const c of 候補.values()) {
    c.言葉数 = c.言葉たち.length;
    c.重み = c.素の重み * Math.min(3, c.言葉数);
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

  // ★重い順。同じなら交差の多い順、それも同じなら曲数の多い順
  const 当たり = [...当たり表.values()]
    .sort((a, b) => b.重み - a.重み || (b.言葉数 ?? 1) - (a.言葉数 ?? 1) || b.曲数 - a.曲数);

  /*
   * ★「持っていない」と言う前に、もう一度ゆるく探す。
   * 演者で当たらなかったものだけを見るので、ここを通るのは少数。
   */
  const 外れ = 緩く探す([...候補.entries()].filter(([k]) => !当たり表.has(k)), tracks)
    .sort((a, b) => b.重み - a.重み || (b.言葉数 ?? 1) - (a.言葉数 ?? 1) || b.depth - a.depth);

  return { 当たり, 曲, 外れ };
}

/**
 * 演者で当たらなかった名前を、盤名・曲名にも部分一致で当ててみる。
 * それでも見つからなかったものだけを返す。
 *
 * ★曲を 1 周するだけ（本人の指示）。名前ごとに全曲を探すと
 * 名前の数 × 86,044 回になる。ここは 1 × 86,044 回。
 * ★全部見つかったら、そこで抜ける。最後まで回さない。
 */
function 緩く探す(残り, tracks) {
  if (!残り.length || !Array.isArray(tracks)) return 残り.map(([, c]) => ({ ...c }));
  const 鍵 = 残り.map(([k]) => k).filter((k) => k);
  const 見つかった = new Set();
  for (const t of tracks) {
    if (見つかった.size >= 鍵.length) break;
    if (!t) continue;
    /*
     * ★3 つをつないで 1 本の文字列にして、部分一致を 1 回で見る。
     * 区切りに \u0000 を挟むのは、盤の終わりと曲名の頭がつながって
     * **無い名前ができてしまう**のを防ぐため。
     */
    const 場 = ならす(t.artist) + '\u0000' + ならす(t.album) + '\u0000' + ならす(t.title);
    for (const k of 鍵) {
      if (見つかった.has(k)) continue;
      if (場.includes(k)) 見つかった.add(k);
    }
  }
  return 残り.filter(([k]) => !見つかった.has(k)).map(([, c]) => ({ ...c }));
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
    .map((a) => {
      /*
       * ★交差（いくつの言葉から辿り着いたか）も書く。
       * 別々の言葉が同じ名前を指すのは偶然ではない。AI にもそう伝える。
       */
      const 交差 = (a.言葉数 > 1)
        ? `　★${a.言葉数} つの言葉から辿り着きました（${a.言葉たち.join('・')}）`
        : '';
      return `・${a.artist}（${a.曲数}曲）… ${a.description}　［「${a.keyword}」から深さ${a.depth}］${交差}`;
    });
  return [
    '■ この人が最近「響いた」言葉と、その周りにあった名前',
    '（Kokoro OS の Resonance で辿ったもの。手元にある演者だけ載せています）',
    ...行,
    '',
    '★ここに挙がった演者は、**いま気になっている場所**です。気分に合うなら優先してください。',
    '★とくに「★N つの言葉から辿り着きました」が付いているものは、',
    '　いくつもの筋がそこへ通じている、いま特に強い場所です。',
    '★ただし気分が違う方を向いていれば、無理に入れないこと。',
  ].join('\n');
}

// Node（本体・検査）と画面（<script> 読み込み）の両方で使えるようにしておく。
// 同じ処理を 2 か所に書くと、片方だけ直す事故になる（shuffle.js と同じ形）。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ならす, 読み込む, 重みを出す, 深さの重み, 深さの段, 突き合わせる, 緩く探す, 響きの一節 };
}
