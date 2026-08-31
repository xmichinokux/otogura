'use strict';

/**
 * Resonance（Kokoro OS のカルチャーツリー）読み込みの検査。
 *
 * ■ ここで見たいこと
 * 1. ★name を artist だけに当てているか
 *    実測で決めた仕様（src/resonance.js の頭に根拠を書いてある）。
 *    album / title に当てると、music 以外のノードの偶然の同名を拾う。
 *
 * 2. ★重みが「深いほど強く・新しいほど強く」になっているか（本人の指示）
 *
 * 3. ★壊れた JSON でも落ちないか
 *    Resonance 側は別のアプリで、書き出しの形は今後変わりうる。
 *    version が上がったら、黙って誤読せず断ること。
 *
 * 4. ★86,044 曲を何度も走査していないか
 *    曲の側を 1 周だけにする（名前ごとに全曲を探すと 22 倍になる）。
 */

const { ならす, 読み込む, 重みを出す, 突き合わせる, 響きの一節 } = require('./src/resonance');

let 失敗 = 0;
const 確認 = (名, 条件, 補足 = '') => {
  if (条件) console.log(`  OK   ${名}`);
  else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 失敗 += 1; }
};

const いま = Date.parse('2026-08-29T12:00:00.000Z');
const 木を作る = (nodes, savedAt = '2026-08-29T00:00:00.000Z', keyword = 'test') =>
  ({ version: 1, exportedAt: いま, entries: [{ keyword, savedAt, nodes }] });

/* ── 1. 読み込み ─────────────────────────────────────── */
console.log('\n[1] 書き出しファイルを読む');

{
  const r = 読み込む(JSON.stringify(木を作る([{ name: ' Converge ', genre: 'music', description: ' 金字塔 ', depth: 3 }])));
  確認('読める', r.ok, r.error || '');
  確認('前後の空白を落とす', r.ok && r.木.木[0].nodes[0].name === 'Converge');
  確認('description も落とす', r.ok && r.木.木[0].nodes[0].description === '金字塔');
}

for (const [名, 中身] of [
  ['JSON でない', 'これは JSON ではない'],
  ['空', '{}'],
  ['entries が無い', '{"version":1}'],
  ['entries が配列でない', '{"version":1,"entries":"x"}'],
  ['中身が空の木だけ', '{"version":1,"entries":[{"keyword":"a","nodes":[]}]}'],
]) {
  let 投げた = null; let r = null;
  try { r = 読み込む(中身); } catch (e) { 投げた = e; }
  確認(`壊れた入力（${名}）で落ちない`, !投げた, 投げた ? String(投げた.message) : '');
  確認(`壊れた入力（${名}）は理由を返す`, !!(r && r.ok === false && r.error), JSON.stringify(r));
}

{
  /*
   * ★version が上がったら断る。
   * Resonance 側は別のアプリで、形は今後変わりうる。
   * 黙って誤読すると「なぜか当たらない」になる。
   */
  const r = 読み込む('{"version":2,"entries":[]}');
  確認('★知らない version は断る', r.ok === false && /version/.test(r.error), JSON.stringify(r));
}

/* ── 2. 照合先は artist だけ ─────────────────────────── */
console.log('\n[2] ★name は artist だけに当てる（実測で決めた仕様）');

const 曲たち = [
  { path: 'p1', artist: 'Converge', album: 'Jane Doe', title: 'Concubine' },
  { path: 'p2', artist: 'Converge', album: 'Jane Doe', title: 'Fault and Fracture' },
  { path: 'p3', artist: 'Someone', album: 'Jane Doe', title: 'Control' },
  { path: 'p4', artist: 'Other', album: 'X', title: 'The Wall' },
];

{
  const r = 読み込む(JSON.stringify(木を作る([{ name: 'Converge', genre: 'music', description: '金字塔', depth: 3 }])));
  const m = 突き合わせる(r.木, 曲たち, いま);
  確認('artist に当たる', m.当たり.length === 1 && m.当たり[0].artist === 'Converge');
  確認('当たった曲だけ拾う', m.曲.size === 2, `${m.曲.size} 曲`);
}

{
  /*
   * album に当たる名前でも、artist に無ければ**鳴らさない**。
   *
   * ★2026-08-29 に、ここの後半を裏返した。
   * 前は「当てない → だから外れ」だったが、本人の指示で分けた:
   *   > 持っているのに買いに行かせるのが一番困ります。
   * 鳴らさないのは今までどおり。**でも「持っていない」とも言わない。**
   * どちらでもない、が正しい（盤としては持っているので）。
   */
  const r = 読み込む(JSON.stringify(木を作る([{ name: 'Jane Doe', genre: 'music', description: '名盤', depth: 3 }])));
  const m = 突き合わせる(r.木, 曲たち, いま);
  確認(
    '★album にしか無い名前は、鳴らさない',
    m.当たり.length === 0,
    `当たり ${m.当たり.length}（鳴らすと、頼んでいない曲が流れます）`,
  );
  確認(
    '★album にしか無い名前を、「持っていない」とも言わない',
    !m.外れ.some((x) => x.name === 'Jane Doe'),
    `外れ ${JSON.stringify(m.外れ.map((x) => x.name))}（持っているのに買わせることになります）`,
  );
}

{
  // title に当たる名前でも当てない（Control / The Wall のような偶然の同名を防ぐ）
  const r = 読み込む(JSON.stringify(木を作る([
    { name: 'Control', genre: 'movie', description: '映画', depth: 3 },
    { name: 'The Wall', genre: 'movie', description: '映画', depth: 3 },
  ])));
  const m = 突き合わせる(r.木, 曲たち, いま);
  確認(
    '★title にしか無い名前は当てない',
    m.当たり.length === 0,
    `当たり ${JSON.stringify(m.当たり.map((a) => a.artist))}（Control や The Wall は偶然の同名です）`,
  );
}

{
  // music 以外のノードは、artist に当たっても拾わない
  const r = 読み込む(JSON.stringify(木を作る([{ name: 'Converge', genre: 'movie', description: '映画のほう', depth: 3 }])));
  const m = 突き合わせる(r.木, 曲たち, いま);
  確認('★genre が music でないノードは拾わない', m.当たり.length === 0, JSON.stringify(m.当たり));
}

{
  // 大文字小文字・先頭の The を無視する
  const r = 読み込む(JSON.stringify(木を作る([{ name: 'the CONVERGE', genre: 'music', description: 'x', depth: 1 }])));
  const m = 突き合わせる(r.木, [{ path: 'q', artist: 'Converge', album: '', title: '' }], いま);
  確認('大文字小文字と先頭の The を無視する', m.当たり.length === 1, JSON.stringify(m.当たり.map((a) => a.artist)));
  確認('表に出す名前は、手元のライブラリのほう', m.当たり.length === 1 && m.当たり[0].artist === 'Converge');
}

/* ── 3. 重み ─────────────────────────────────────────── */
console.log('\n[3] ★深いほど強く、新しいほど強く（本人の指示）');

{
  const 同じ日 = '2026-08-29T00:00:00.000Z';
  const 浅 = 重みを出す(0, 同じ日, いま);
  const 深 = 重みを出す(3, 同じ日, いま);
  /*
   * ★深さの向きは、つまみ（王道↔外す）で変わる（2026-08-31 本人の希望）。
   *   > 響きを知覚を濃くするためにつまみに繋げてください。
   * それまでは固定で「深いほど重い」だった。
   * ★既定（ふつう）は、深さで差を付けない。これまでの動きは「やや外す」。
   */
  確認('★王道では、浅いほど重い（軸のそばが濃くなる）',
    重みを出す(0, 同じ日, いま, 1) > 重みを出す(3, 同じ日, いま, 1),
    `深さ0=${重みを出す(0, 同じ日, いま, 1).toFixed(2)} / 深さ3=${重みを出す(3, 同じ日, いま, 1).toFixed(2)}`);
  確認('★外すでは、深いほど重い（これまでの動き）',
    重みを出す(3, 同じ日, いま, 4) > 重みを出す(0, 同じ日, いま, 4),
    `深さ0=${重みを出す(0, 同じ日, いま, 4).toFixed(2)} / 深さ3=${重みを出す(3, 同じ日, いま, 4).toFixed(2)}`);
  確認('★ふつうでは、深さで差を付けない',
    重みを出す(0, 同じ日, いま, 3) === 重みを出す(3, 同じ日, いま, 3));
  確認('★つまみを渡さなければ「ふつう」', 重みを出す(2, '', いま) === 重みを出す(2, '', いま, 3));
  確認('★目盛が変でも落ちない',
    Number.isFinite(重みを出す(1, '', いま, 0)) && Number.isFinite(重みを出す(1, '', いま, 99)));

  /* ★画面が、つまみの値を突き合わせに渡しているか */
  {
    const 素画面 = require("node:fs").readFileSync(
      require("node:path").join(__dirname, "src/renderer.js"), "utf8");
    確認("★画面が、つまみの値を突き合わせに渡している",
      素画面.includes("突き合わせる(響きの木, tracks, Date.now(), 響きの目盛())"),
      "渡さないと、つまみを動かしても響きの並びが変わりません");
    確認("★控えを持たず、つまみから直に読む",
      素画面.includes("const 響きの目盛 = () =>"),
      "控えを持つと、動かしたのに古い値のまま、という食い違いが起きます");
    確認("★つまみを動かしたら、響きも並べ直す",
      素画面.includes("if (響きの木) { 響きを合わせ直す(); 描き直す(); }"));
  }

  const 新 = 重みを出す(2, '2026-08-29T00:00:00.000Z', いま, 4);
  const 古 = 重みを出す(2, '2026-05-02T00:00:00.000Z', いま, 4);
  確認('★新しいほど強い', 新 > 古, `新=${新.toFixed(2)} / 古=${古.toFixed(2)}`);
  確認('古くても 0 にはしない', 古 > 0, `${古.toFixed(2)}（0 にすると古い木が死にます）`);

  確認('日付が無ければ深さだけで決める', 重みを出す(2, '', いま, 4) === 3, String(重みを出す(2, '', いま, 4)));
  確認('深さが変でも落ちない', Number.isFinite(重みを出す(null, '', いま)) && Number.isFinite(重みを出す(99, '', いま)));
}

{
  // 同じ名前が 2 本の木にあるとき、重いほうを採る
  const 生 = {
    version: 1,
    entries: [
      { keyword: '古いほう', savedAt: '2026-05-02T00:00:00.000Z', nodes: [{ name: 'Converge', genre: 'music', description: '古い理由', depth: 1 }] },
      { keyword: '新しいほう', savedAt: '2026-08-29T00:00:00.000Z', nodes: [{ name: 'Converge', genre: 'music', description: '新しい理由', depth: 3 }] },
    ],
  };
  const m = 突き合わせる(読み込む(JSON.stringify(生)).木, 曲たち, いま);
  確認(
    '★同じ名前が 2 本にあれば、重いほうの理由を採る',
    m.当たり.length === 1 && m.当たり[0].description === '新しい理由',
    JSON.stringify(m.当たり.map((a) => a.description)),
  );
}

/* ── 4. 走査の回数 ───────────────────────────────────── */
console.log('\n[4] ★曲の側を 1 周だけにしているか');

{
  let 触った = 0;
  const 多い = [];
  for (let i = 0; i < 5000; i += 1) 多い.push({ path: 'p' + i, artist: i % 100 === 0 ? 'Converge' : 'ほか' + i, album: '', title: '' });
  const 見張り = new Proxy(多い, {
    get(t, k) { if (k === Symbol.iterator) 触った += 1; return t[k]; },
  });
  const nodes = [];
  for (let i = 0; i < 22; i += 1) nodes.push({ name: 'なにか' + i, genre: 'music', description: 'x', depth: 1 });
  nodes.push({ name: 'Converge', genre: 'music', description: 'x', depth: 1 });
  const m = 突き合わせる(読み込む(JSON.stringify(木を作る(nodes))).木, 見張り, いま);
  /*
   * ★2026-08-29、上限を 1 周から 2 周に変えた。理由を書いておく。
   *
   * 外れ（確かめる候補）を緩く照合するために、**2 周目を足した**。
   *   1 周目 … 演者の完全一致（当たり）。表を引くだけなので安い
   *   2 周目 … 1 周目で当たらなかった名前だけを、盤名・曲名にも当てる
   *            全部見つかったら、そこで抜ける
   *
   * ★守りたいのは「1 周」そのものではなく、**名前の数に比例して増えないこと。**
   * 名前ごとに探すと 23 周になる。そこが止めたいところ。
   * だから下で、**名前を倍にしても周が増えない**ことも確かめる。
   * 数字だけ緩めて終わりにしない。
   */
  確認('★曲を回るのは 2 周まで', 触った <= 2, `${触った} 周（名前ごとに探すと 23 周になります）`);
  確認('それでも正しく当たる', m.当たり.length === 1 && m.曲.size === 50, `${m.当たり.length} 組 / ${m.曲.size} 曲`);
}

{
  /*
   * ★名前を倍にしても、周は増えないこと。
   * ここが増えるなら「名前ごとに探す」形に戻っている。
   */
  const 数える = (名前の数) => {
    let 触った = 0;
    const 多い = [];
    for (let i = 0; i < 3000; i += 1) 多い.push({ path: 'p' + i, artist: 'ほか' + i, album: 'X', title: 'Y' });
    const 見張り = new Proxy(多い, {
      get(t, k) { if (k === Symbol.iterator) 触った += 1; return t[k]; },
    });
    const nodes = [];
    // ★どれも手元に無い名前にする（2 周目が最後まで回るように）
    for (let i = 0; i < 名前の数; i += 1) nodes.push({ name: 'Zzz 無い' + i, genre: 'music', description: 'x', depth: 1 });
    突き合わせる(読み込む(JSON.stringify(木を作る(nodes))).木, 見張り, いま);
    return 触った;
  };
  const 少 = 数える(10);
  const 多 = 数える(200);
  確認(
    '★名前を 20 倍にしても、周が増えない',
    多 === 少 && 多 <= 2,
    `名前 10 個で ${少} 周 / 200 個で ${多} 周`,
  );
}

/* ── 5. AI に渡す一節 ────────────────────────────────── */
console.log('\n[4-b] ★外れ（確かめる候補）は、緩く照合してから決めるか');
/*
 * ■ 本人の指示（2026-08-29）
 *   > 当たり（曲を鳴らす側）… いまのまま。演者の完全一致。厳しく。
 *   > 外れ（持っていないと言う側）… もっと緩く照合して、
 *   >   それでも当たらなかったものだけを外れにする
 *   > 理由: いまの判定をそのまま裏返すと、アルバム名や曲名としてしか
 *   > 持っていないものが、全部「持っていない」に化けます。
 *   > 持っているのに買いに行かせるのが一番困ります。
 *
 * ★厳しさが 2 つあることが要。片方だけ直すと、
 * 「鳴らすほうが緩くなる」（違う曲が鳴る）か
 * 「言うほうが厳しくなる」（持っているのに買わせる）になる。両方見る。
 */
{
  const 木 = { 木: [{ keyword: 'ためし', savedAt: '2026-08-29T00:00:00.000Z', nodes: [
    { name: 'Converge', genre: 'music', description: '演者として持っている', depth: 1 },
    { name: 'Jane Doe', genre: 'music', description: '盤としてだけ持っている', depth: 2 },
    { name: 'Concubine', genre: 'music', description: '曲名としてだけ持っている', depth: 3 },
    { name: 'Zzz Nonexistent Band', genre: 'music', description: '本当に持っていない', depth: 2 },
  ] }] };
  const 曲 = [
    { path: 'p1', artist: 'Converge', album: 'Jane Doe', title: 'Concubine' },
    { path: 'p2', artist: 'ほかの人', album: 'べつの盤', title: 'べつの曲' },
  ];
  const m = 突き合わせる(木, 曲, Date.parse('2026-08-29T00:00:00.000Z'));
  const 外れ名 = m.外れ.map((x) => x.name);

  確認(
    '★当たりは厳しいまま（演者の完全一致だけ）',
    m.当たり.length === 1 && m.当たり[0].artist === 'Converge',
    '緩くすると、頼んでいない曲が鳴りはじめます',
  );
  確認(
    '★盤としてだけ持っているものは、外れにしない',
    !外れ名.includes('Jane Doe'),
    `外れ: ${JSON.stringify(外れ名)}`,
  );
  確認(
    '★曲名としてだけ持っているものは、外れにしない',
    !外れ名.includes('Concubine'),
    `外れ: ${JSON.stringify(外れ名)}`,
  );
  確認(
    '★本当に持っていないものだけが外れになる',
    外れ名.length === 1 && 外れ名[0] === 'Zzz Nonexistent Band',
    `外れ: ${JSON.stringify(外れ名)}`,
  );

  /* 画面で出すのに要るものが、そろっているか */
  const 一 = m.外れ[0];
  確認(
    '★depth が付いてくる（意味が変わるので）',
    一 && 一.depth === 2,
    '深さ 1 は入口の穴、深さ 3 以上は探索の先端。数が無いと区別できません',
  );
  確認(
    '★どの言葉から辿ったかが付いてくる',
    一 && 一.keyword === 'ためし',
  );
  確認(
    '★なぜ繋がるかの説明が付いてくる',
    一 && 一.description === '本当に持っていない',
  );

  /* 重い順に並んでいるか（当たりと同じ規則） */
  const 木2 = { 木: [{ keyword: 'あ', savedAt: '2026-08-29T00:00:00.000Z', nodes: [
    { name: 'Qqq Aaa', genre: 'music', description: '', depth: 1 },
    { name: 'Qqq Bbb', genre: 'music', description: '', depth: 3 },
    { name: 'Qqq Ccc', genre: 'music', description: '', depth: 2 },
  ] }] };
  const m2 = 突き合わせる(木2, [], Date.parse('2026-08-29T00:00:00.000Z'));
  確認(
    '★重い順（深いほど上）に並んでいる',
    m2.外れ.map((x) => x.depth).join(',') === '3,2,1',
    m2.外れ.map((x) => `${x.name}(${x.depth})`).join(' / '),
  );

  /* 曲が 1 つも無いとき、全部が外れになるか（落ちないか） */
  const m3 = 突き合わせる(木, [], Date.parse('2026-08-29T00:00:00.000Z'));
  確認('曲が無ければ、全部が確かめる候補になる', m3.外れ.length === 4 && m3.当たり.length === 0);

  /*
   * ★間違えるなら「持っている」側に間違える。
   * 短い名前は盤名や曲名に紛れて当たりやすいが、それでよい。
   * 持っていないものを見落とすより、持っているのに買わせるほうが困る。
   */
  const 木4 = { 木: [{ keyword: 'あ', savedAt: '2026-08-29T00:00:00.000Z', nodes: [
    { name: 'Jane', genre: 'music', description: '', depth: 1 },
  ] }] };
  const m4 = 突き合わせる(木4, [{ path: 'p', artist: 'ほか', album: 'Jane Doe', title: 'x' }], Date.now());
  確認(
    '★紛らわしいときは「持っている」側に倒す',
    m4.外れ.length === 0,
    '買わせてしまうより、見落とすほうがまし（本人の優先）',
  );
}

console.log('\n[4-c] ★確かめる候補を、画面が出しているか');
/*
 * ■ この依頼のきっかけ（2026-08-29 本人）
 *   > resonance.js の 突き合わせる が { 当たり, 曲, 外れ } を返していますが、
 *   > renderer.js は 外れ を一度も読んでいません。
 *
 * ★計算してあるのに読んでいない、は気づけない。**動くし、落ちないから。**
 * 出し忘れを機械に見張らせる。
 *
 * ■ ★買い物リストにしない（本人の指示）
 *   > 見た目では見分けられないので、「買い物リスト」として出さないでください。
 *   > 「確かめる候補」として出してください。見出しもそう書いてください。
 *   > 外れの名前で自動的に何かを買う・ダウンロードする処理は入れない。
 */
{
  const 画面 = require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/renderer.js'), 'utf8');
  const 素 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

  確認(
    '★画面が 外れ を読んでいる',
    /響きの当たり\.外れ/.test(素),
    '計算してあるのに読まないと、いつまでも出てきません',
  );
  確認(
    '★見出しは「確かめる候補」（買い物リストではない）',
    /確かめる候補 ― 手元で見つからなかった名前です/.test(素),
  );
  確認(
    '★3 種類が混ざることを、そのまま書いてある',
    /書かれ方が違う/.test(素) && /思い違い/.test(素),
    '「持っていない」と言い切ると、持っているのに買わせます',
  );
  確認(
    '★depth を画面に出している',
    /深さ.\)? \+ m\.depth|深さ\${m\.depth}/.test(素),
    '深さ 1 は入口の穴、深さ 3 以上は探索の先端。数が無いと区別できません',
  );
  確認(
    '★どの言葉から辿ったかも出している',
    /m\.keyword/.test(素),
  );
  確認(
    '★0 個のときは出さない',
    /if \(外れ\.length\)/.test(素),
    '「0」を出しても押す用がありません',
  );

  /*
   * ★買う・落とす仕掛けが無いこと。
   * 出すのは一覧まで、が約束。ここに外への口を作らない。
   */
  const 頭 = 素.indexOf('function 確かめる候補を描く');
  const 尾 = 素.indexOf(String.fromCharCode(10) + String.fromCharCode(125), 頭);
  const 描く所 = 頭 >= 0 ? 素.slice(頭, 尾) : '';
  確認('確かめる候補を描くところが見つかる', 頭 >= 0 && 尾 > 頭);
  確認(
    '★買う・落とす仕掛けが無い',
    !/(https?:|createElement\(.a.\)|window\.open|shell\.|openExternal|購入|買う処理|ダウンロード)/.test(描く所),
    '出すのは一覧まで、が約束です',
  );
  確認(
    '★曲を消す・並べ替える処理が無い',
    !/(一覧から外す|リストを消す|tracks =|並び =)/.test(描く所),
  );
}

console.log('\n[4-d] ★交差 ― いくつの言葉から辿り着いたか');
/*
 * ■ 本人の問い（2026-08-29）
 *   > たくさん使えば何かいいことがある機能ってありますか？
 *
 * ★あった。しかも**捨てていた。**
 * 前は同じ名前が複数の木に出たとき「重いほうを採る」だけで、
 * **何本の言葉から辿り着いたかを数えていなかった。**
 *
 * 別々の言葉が同じ名前を指すのは偶然ではない。
 * そして **1 本目では絶対に起きない。** 言葉を辿るほど出てくる ――
 * まさに「たくさん使うと効く」性質がここにある。
 *
 * ★実測できないもの（本当に良い曲が出るか）は検査しない。
 * ここで見るのは「数えているか・強くしているか・見せているか」まで。
 */
{
  const 木 = (words) => ({ 木: words });
  const 節 = (name, depth, description) => ({ name, genre: 'music', description, depth });
  const いま2 = Date.parse('2026-08-29T00:00:00.000Z');
  const 日 = '2026-08-29T00:00:00.000Z';

  const 三本 = 木([
    { keyword: 'あ', savedAt: 日, nodes: [節('Both', 1, '一本目'), 節('Only', 3, '片方だけ')] },
    { keyword: 'い', savedAt: 日, nodes: [節('Both', 2, '二本目')] },
    { keyword: 'う', savedAt: 日, nodes: [節('Both', 1, '三本目')] },
  ]);
  const 曲 = [
    { path: 'a', artist: 'Both', album: 'x', title: 'y' },
    { path: 'b', artist: 'Only', album: 'x', title: 'y' },
  ];
  const m = 突き合わせる(三本, 曲, いま2);
  const 引く = (n) => m.当たり.find((a) => a.artist === n);

  確認(
    '★何本の言葉から辿り着いたかを数えている',
    引く('Both') && 引く('Both').言葉数 === 3,
    `Both の交差 ${引く('Both') ? 引く('Both').言葉数 : '?'}（3 のはず）`,
  );
  確認(
    '★どの言葉から来たかも残している',
    引く('Both') && 引く('Both').言葉たち.join(',') === 'あ,い,う',
    引く('Both') ? 引く('Both').言葉たち.join(',') : '',
  );
  確認(
    '同じ言葉を二重に数えない',
    突き合わせる(木([{ keyword: 'あ', savedAt: 日, nodes: [節('X', 1, 'p'), 節('x', 2, 'q')] }]),
      [{ path: 'c', artist: 'X', album: '', title: '' }], いま2).当たり[0].言葉数 === 1,
  );
  確認(
    '★交差した名前のほうが強くなる',
    引く('Both').重み > 引く('Only').重み,
    `Both ${引く('Both').重み.toFixed(2)} / Only ${引く('Only').重み.toFixed(2)}`,
  );
  確認(
    '★交差した名前が上に来る',
    m.当たり[0].artist === 'Both',
    m.当たり.map((a) => a.artist).join(' > '),
  );
  /*
   * ★頭打ちがあること。言葉が増えたときに、
   * よくある名前だけが上に居座らないようにするため。
   */
  {
    const 多い = [];
    for (let i = 0; i < 8; i += 1) 多い.push({ keyword: 'k' + i, savedAt: 日, nodes: [節('Many', 1, 'x')] });
    const r = 突き合わせる(木(多い), [{ path: 'd', artist: 'Many', album: '', title: '' }], いま2);
    const 素 = 突き合わせる(
      木([{ keyword: 'k0', savedAt: 日, nodes: [節('Many', 1, 'x')] }]),
      [{ path: 'd', artist: 'Many', album: '', title: '' }], いま2).当たり[0].重み;
    確認(
      '★交差の効きは 3 倍で頭打ち',
      Math.abs(r.当たり[0].重み - 素 * 3) < 0.001,
      `8 本でも ${(r.当たり[0].重み / 素).toFixed(1)} 倍（3 倍のはず）`,
    );
    確認('それでも本数は正しく数える', r.当たり[0].言葉数 === 8, String(r.当たり[0].言葉数));
  }
  /* 手元に無い名前でも、交差は数える（確かめる候補で使う） */
  {
    const r = 突き合わせる(木([
      { keyword: 'あ', savedAt: 日, nodes: [節('Zzz Nowhere', 1, 'p')] },
      { keyword: 'い', savedAt: 日, nodes: [節('Zzz Nowhere', 2, 'q')] },
    ]), [], いま2);
    確認(
      '★手元に無い名前の交差も数える',
      r.外れ.length === 1 && r.外れ[0].言葉数 === 2,
      '確かめる候補の中でも、交差しているものが一番あやしい（＝確かめる値打ちがある）',
  );
  }

  /* AI にも伝えているか */
  const 節文 = 響きの一節(m.当たり);
  確認(
    '★AI にも交差を伝えている',
    /3 つの言葉から辿り着きました/.test(節文) && /あ・い・う/.test(節文),
  );

  /* 画面に出しているか */
  const 画面 = require('node:fs').readFileSync(require('node:path').join(__dirname, 'src/renderer.js'), 'utf8');
  const 素画面 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  確認(
    '★画面に交差を出している',
    /交差を描く\(box, 交差\);/.test(素画面) && /言葉数 \?\? 1\) > 1/.test(素画面),
    '関数を作っても、呼んでいなければ出ません（前にも同じ形で見落とした）',
  );
  確認(
    '★0 本のときは出さない',
    /if \(交差\.length\) \{/.test(素画面),
  );
  確認(
    '★どうすれば増えるかを書いてある',
    new RegExp('function 交差を描く[\\s\\S]{0,900}?言葉を辿るほど増えます').test(素画面),
    '増やし方が分からないと、育てようがありません',
  );
}

console.log('\n[5] AI に渡す一節');

{
  確認('当たりが無ければ、何も足さない', 響きの一節([]) === '' && 響きの一節(null) === '');
  const 文 = 響きの一節([{ artist: 'Converge', 曲数: 110, description: '金字塔', keyword: 'unbroken band', depth: 3 }]);
  確認('演者・曲数・理由が入る', /Converge/.test(文) && /110曲/.test(文) && /金字塔/.test(文));
  確認('どの言葉から辿ったかも入る', /unbroken band/.test(文) && /深さ3/.test(文));
  確認(
    '★「気分が違えば入れなくてよい」と書いてある',
    /無理に入れない/.test(文),
    '書かないと、気分を無視して響きだけで選ばれます',
  );
  const 長い = 響きの一節(Array.from({ length: 50 }, (_, i) => ({ artist: 'A' + i, 曲数: 1, description: 'x', keyword: 'k', depth: 1 })));
  確認('★長くなりすぎない（上位だけ渡す）', 長い.split('\n').length < 20, `${長い.split('\n').length} 行`);
}

/* ── 6. 実物のファイルがあれば、それでも通す ─────────── */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
/*
 * ★人の家の道を書かない（2026-08-31、公開前の棚卸しで見つけた）。
 * もとは作者の Downloads を直に書いていた。
 * 他人の PC では意味が無いうえ、Windows の利用者名まで載ってしまう。
 * 置き場は環境変数で差せるようにして、既定は自分の Downloads を見る。
 */
const 実物 = process.env.OTOGURA_RESONANCE_JSON
  || path.join(os.homedir(), 'Downloads', 'resonance-trees-2026-08-29.json');
if (fs.existsSync(実物)) {
  console.log('\n[6] 実物の書き出しで通す');
  const r = 読み込む(fs.readFileSync(実物, 'utf8'));
  確認('実物が読める', r.ok, r.error || '');
  if (r.ok) {
    const 音 = r.木.木.reduce((n, e) => n + e.nodes.filter((x) => x.genre === 'music').length, 0);
    console.log(`  --   木 ${r.木.木.length} 本 / music ノード ${音} 個`);
    確認('木が 1 本以上ある', r.木.木.length > 0);
    確認('music ノードがある', 音 > 0);
  }
} else {
  console.log('\n[6] 実物の書き出しが無いので飛ばしました');
}

console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
process.exit(失敗 ? 1 : 0);
