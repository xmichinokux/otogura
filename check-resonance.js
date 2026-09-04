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
  /*
   * ★持ち主は、つまみで動かない（2026-08-31 本人の報告）。
   *   > スライダーを動かすだけでバンドの数が変わったのですが、どうしてですか？
   * 同じ名前が何本かの木に出たとき、持ち主を「重いほう」に決めていた。
   * その重みがつまみで変わるので、動かすたびに持ち主が入れ替わっていた。
   */
  {
    const 木 = { 木: [
      { keyword: "a", savedAt: "2026-08-30T00:00:00Z",
        nodes: [{ name: "X", genre: "music", description: "1", depth: 3 }] },
      { keyword: "b", savedAt: "2026-08-30T00:00:00Z",
        nodes: [{ name: "X", genre: "music", description: "2", depth: 0 }] },
    ] };
    const 曲 = [{ path: "p", artist: "X", album: "al", title: "t", 鳴らせる: true }];
    const 主 = (目盛) => 突き合わせる(木, 曲, いま, 目盛).当たり.map((a) => a.keyword).join(",");
    確認("★持ち主は、つまみを動かしても変わらない",
      主(1) === 主(3) && 主(3) === 主(5),
      "変わると、同じ言葉を選んでいるのに演者の数が増減します");
  }
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
    素.includes("この外れ.length"),
    '「0」を出しても押す用がありません',
  );
  /* ★確かめる候補は、言葉ごとに分ける（2026-08-31 本人の希望） */
  確認(
    "★確かめる候補を、辿った言葉ごとに分けている",
    素.includes("const この外れ = 全外れ.filter(")
      && /x.keyword === e.keyword/.test(素),
    "何本も辿ると、どの言葉から出た名前か分からなくなります",
  );
  確認(
    "★言葉の一覧は、たためる（増えると煩雑になるので）",
    /言葉の一覧を開く/.test(素),
  );
  確認(
    "★一本を組むのも、言葉ごと",
    素.includes("sel = { ...sel, 言葉: new Set("),
    "何から組んだのかが画面に残ります",
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

/*
 * [7] 編集欄が、言葉の数だけ伸びないこと（2026-08-31 本人の指摘）。
 *
 *   > 響きをたくさんやると編集欄がたくさん並んで下の画面を圧迫するので
 *   > それを回避したい。目的は画面の圧迫の回避と並びの美しさでした。
 *
 * ★並べていた一覧は、下の「辿った言葉」の列と同じものだった。
 * 列で選び、板で押す ―― に分けたので、普段の高さは 1 行。
 */
{
  console.log('\n[7] 編集欄が、言葉の数だけ伸びないか');
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 素 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  確認(
    '★ふだんは、辿った言葉の一覧を閉じておく',
    /let 言葉の一覧を開く = false;/.test(素),
    'true だと、言葉の数だけ行が並んで下の一覧を押し下げます',
  );
  確認(
    '★出す行は、列で選んでいる言葉のぶんだけ',
    素.includes('const 出す木 = 言葉の一覧を開く ? 木たち : 選んだ木;')
      && 素.includes('for (const e of 出す木) {'),
    '木たち を直接まわすと、また全部並びます',
  );
  確認(
    '★何も選ばず閉じていれば、板そのものを出さない',
    素.includes('if (!出す木.length) return;'),
    '空の板が残ると、それも場所を取ります',
  );
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  確認(
    '★開いたときも、高さに上限がある',
    /#resbar \.resboard \{[\s\S]{0,220}?max-height: 132px;/.test(頁),
    '40vh だと、下の一覧を半分近く押し下げていました',
  );
}

/*
 * [8] 消した響きを、捨てないこと（2026-09-02 本人の希望）。
 *
 * ■ 起きたこと
 * 辿った木 4 本が消えていて、押したかどうか本人にも記憶が無かった。
 * `fs.unlink` で消していたので、**記録が何も残らず、後から判別できなかった。**
 *
 * ■ なぜ直したか
 * 本人が最初に立てた決まりが、ここにだけ効いていなかった。
 *   > 音楽ファイルを消さないでください。一覧から外すだけにしてください
 * 曲と違って、辿った木は**元から作り直せない**（AI に何度も問い合わせて作る）。
 */
{
  console.log('\n[8] 消した響きを、捨てずに残すか');
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 素本体 = 本体.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  確認(
    '★捨てた置き場がある',
    素本体.includes("path.join(app.getPath('userData'), 'resonance-捨てた.json')"),
    '消す先が無ければ、戻しようがありません',
  );
  確認(
    '★「全部外す」は unlink せず、退避する',
    /resonance:clear'[\s\S]{0,400}?響きを退避する\(\)/.test(素本体)
      && !/resonance:clear'[\s\S]{0,400}?unlink\(響きファイル/.test(素本体),
    'unlink すると、押し間違い 1 回で永久に失われます',
  );
  確認(
    '★最後の 1 本を消したときも、退避する',
    /使える木がありません[\s\S]{0,300}?響きを退避する\(\)/.test(素本体),
    'ここだけ unlink が残ると、1 本ずつ消した人だけ戻せません',
  );
  確認(
    '★戻す窓口がある（有無を調べる／戻す）',
    素本体.includes("ipcMain.handle('resonance:trashed'")
      && 素本体.includes("ipcMain.handle('resonance:restore'"),
    '退避しても、戻す道が無ければ意味がありません',
  );
  const 橋 = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
  確認(
    '★画面へ渡してある',
    橋.includes("resonance:trashed") && 橋.includes("resonance:restore"),
    '橋を通さないと、画面からは呼べません',
  );
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 素画面 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  確認(
    '★戻すボタンを、開いたときに出す',
    素画面.includes('async function 捨てた響きボタンを直す()')
      && 素画面.includes('await 捨てた響きボタンを直す();'),
    '出さないと、戻せることに気づけません',
  );
  確認(
    '★戻せるものが無いときは、ボタンを出さない',
    /捨てた響きボタンを直す\(\)[\s\S]{0,400}?if \(!捨てた\) \{ b\.style\.display = 'none'; return; \}/.test(素画面),
    '0 件のボタンが並んでいるのは邪魔なだけです',
  );
}

/*
 * [9] いま鳴っている曲から、押すだけで辿れること（2026-09-04 本人の希望）。
 *
 *   > 友人で音楽を探すのが苦手な人がいて…「今聴いてるので他にオススメある？」
 *   > って聞けると、その友人も困らないのかな？って思いました。
 *
 * ★足したのは入口だけ。辿る仕組みは既存のものをそのまま押す。
 * 2 か所で辿る作りにすると、片方だけ直す事故になる。**そこも見張る。**
 */
{
  console.log('\n[9] いま鳴っている曲から、押すだけで辿れるか');
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 素画面 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  確認(
    '★札が置いてある',
    /<button class="btn" id="nowtrace"/.test(頁),
    '置き場が無ければ、押しようがありません',
  );
  確認(
    '★曲を変えるたびに書き直す',
    /function 再生する\([\s\S]{0,1400}?この曲から辿るボタンを直す\(t\)/.test(素画面),
    '書き直さないと、前の曲の演者のまま残ります',
  );
  確認(
    '★演者名を札に出す',
    素画面.includes("b.textContent = 言('🌱 {名前} から辿る', { 名前: 演者 });"),
    '何が起きるか読めないボタンは、押し間違えたときに困ります',
  );
  確認(
    '★AI が使えないとき・演者名が無いときは出さない',
    素画面.includes("if (!AIが使える || !演者) { b.style.display = 'none'; return; }"),
    '押せないものを見せない',
  );
  確認(
    '★辿る道は 1 本（既存の「辿る」を押すだけ）',
    素画面.includes("const 押す = $('restreego');")
      && !/この曲から辿るボタンを直す[\s\S]{0,900}?木を生やして足す/.test(素画面),
    '2 か所で辿ると、片方だけ直す事故になります',
  );
}

/*
 * [10] 手元に無い名前が、一手で見られて、残ること（2026-09-04 本人の希望）。
 *
 *   > 僕が求めるのは一手で持っていないバンドのリストを知る（見る）ことです。
 *   > 響きでまとまる必要はない（人によってはむしろ迷惑かも）
 *   > お金を払って操作をする以上、持っていないバンドのリストは残ってほしい
 *
 * ★前は 響きタブ → バンド選択 → 確かめる候補 の三手で、しかも
 * 「響きとは何か」「確かめる候補とは何か」を知っている必要があった。
 */
{
  console.log('\n[10] 手元に無い名前が、一手で見られて、残るか');
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 素本体 = 本体.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 素画面 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  const 橋 = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');

  確認(
    '★響きとは別の置き場に貯める',
    素本体.includes("path.join(app.getPath('userData'), '手元に無い名前.json')"),
    '響きの中に置くと、木を消したときに一緒に消えます',
  );
  /*
   * ★響きを消す道の**中身だけ**を見る。
   * 近くに置いてあるだけで引っかかると、直しようのない見張りになる（1 回そうなった）。
   */
  const handleの中 = (名) => {
    const 頭 = 素本体.indexOf(`ipcMain.handle('${名}'`);
    if (頭 < 0) return '';
    const 尾 = 素本体.indexOf('});', 頭);
    return 尾 < 0 ? 素本体.slice(頭) : 素本体.slice(頭, 尾);
  };
  確認(
    '★響きを消しても、この一覧は消えない',
    !handleの中('resonance:clear').includes('無い名前')
      && !handleの中('resonance:remove').includes('無い名前')
      && !/function 響きを退避する\(\)[\s\S]{0,600}?無い名前/.test(素本体),
    'お金を払って出した名前です。響きの操作で巻き込まない',
  );
  確認(
    '★辿るたびに貯める',
    素画面.includes('await 無い名前を貯める();')
      && 素画面.includes('const 外れ = (響きの当たり && Array.isArray(響きの当たり.外れ))'),
    '貯めないと、辿り直すたびに前の名前が消えます',
  );
  確認(
    '★一手で見られる（札が再生バーにある）',
    /<button class="btn" id="nailist"/.test(頁)
      && 素画面.includes("b.textContent = 言('📋 手元に無いバンド（{n}）', { n: 出す.length });"),
    '三手かかると、響きを知っている人しか辿り着けません',
  );
  確認(
    '★もう手に入れたものは出さない',
    /function まだ無い名前\(\)[\s\S]{0,320}?ある\.has\(小文字\(x\.name\)\)/.test(素画面),
    '買ったのに「無い」と出続けると、一覧が信用できなくなります',
  );
  確認(
    '★全部消すときは、捨てずに退避する',
    /nai:clear'[\s\S]{0,400}?無い名前の捨てた\(\)/.test(素本体)
      && 素本体.includes("ipcMain.handle('nai:restore'"),
    '押し間違い 1 回で、払ったぶんが消えないように',
  );
  /*
   * ★閉じられること（2026-09-04 本人の報告）。
   *   > 別ウインドウで表示されてめちゃくちゃ良かったのですが、
   *   > ウインドウを閉じることができませんでした。
   * 原因は置き場所。absolute のまま浮いて、押すはずの札を覆っていた。
   * 見た目は残し、閉じる道を 3 通り用意した。
   */
  確認(
    '★画面に対して置く（札を覆わない）',
    /\.naibox \{[^}]*position: fixed/.test(頁)
      && 素画面.includes('document.body.appendChild(面);'),
    'absolute のままだと、押すはずの札の上に乗ります',
  );
  確認(
    '★閉じ方が 3 通りある（✕・Esc・外側）',
    素画面.includes("閉.onclick = () => { 無い名前を開く = false; 無い名前の欄を描く(); };")
      && /ev\.key === 'Escape' && 無い名前を開く/.test(素画面)
      && /箱 && !箱\.contains\(ev\.target\)/.test(素画面),
    '1 つしか用意しないと、見落とした人は閉じられません',
  );
  /*
   * ★書き写せること（2026-09-04 本人の希望）。
   *   > コピペするためのコピーボタンが欲しい
   * 探しに行くための名前なので、外へ持ち出せないと使えない。
   */
  確認(
    '★名前だけを書き写せる（説明は混ぜない）',
    素画面.includes('const 文 = 出す.map((x) => x.name).join')
      && 素本体.includes("ipcMain.handle('clip:write'"),
    '説明が混ざると、そのまま検索窓に貼れません',
  );
  /*
   * ★1 つずつ消す道は置かない（2026-09-04 本人の判断）。
   *   > リスト内のバンドを削除する機能は必要ないかも、です
   * 手に入れれば出さなくなるので、手で消す用が無い。
   */
  確認(
    '★1 つずつ消す道は置かない',
    !素本体.includes("ipcMain.handle('nai:remove'") && !橋.includes('無い名前をひとつ消す'),
    '押すものが 1 行ごとに並ぶのは、押し間違いの元です',
  );
  /*
   * ★ジャンルごとにまとめて出す（2026-09-04 本人の希望）。
   *   > リストが溜まるで思ったのは、ジャンル別でまとまらないかな
   *   > 溜まれば溜まるほど嬉しいけど、煩雑になるのは嫌
   * 溜めるほうに上限は置かない。煩雑さは出し方で解く。
   */
  確認(
    '★起点のジャンルでまとめる（持っていない名前からは引けないので）',
    /function 起点のジャンル\(起点\)/.test(素画面)
      && 素画面.includes('const 見出し = 起点のジャンル(x.keyword) || x.keyword ||'),
    '持っていない名前にはタグがありません。起点なら手元にあるので引けます',
  );
  確認(
    '★まとめてあれば、まとめた名前でまとめる',
    /function 起点のジャンル[\s\S]{0,600}?まとめてあるか\(\) \? \(まとめた名\(まとめ索引, t\.genre\)/.test(素画面),
    '散らかった元の名前でまとめると、組がいくつもできて読めません',
  );
  確認(
    '★組が多いときは、開いているのを 1 つだけにする',
    素画面.includes('const 開いている = 並び.length === 1 || 無い名前の開いた組 === 見出し;'),
    '全部 開いていると、まとめた意味がありません',
  );
  確認(
    '★溜める数に上限を置かない',
    !/名前たち\.(slice|splice)\(/.test(素本体),
    '1,000 件でも 120 KB ほど。切り捨てる理由がありません',
  );
  /*
   * ★🌱 で辿っても、聴いているものを動かさない（2026-09-04 本人の報告）。
   *
   *   > プレイリストで quicksand を聞きながら「このバンドで辿る」を押す
   *   > → quicksand で響きが生成されて quicksand が指定されているので
   *   >   次の曲で bold が再生になった
   *
   * ★開いているID を null にすると、流す列が「響きで当たった曲」に
   * 入れ替わる（いまの列() は開いている再生リストを優先するので）。
   * 聴きながら調べただけなのに、次に流れるものが変わってしまう。
   */
  確認(
    '★🌱 で辿ったときは、タブも絞りも再生リストも触らない',
    素画面.includes('if (!いまの曲から辿った) {')
      && /if \(!いまの曲から辿った\) \{[\s\S]{0,700}?開いているID = null;/.test(素画面),
    '聴きながら調べただけで、次に流れる曲が変わってしまいます',
  );
  確認(
    '★🌱 の印は、次の「辿る」に持ち越さない',
    素画面.includes('いまの曲から辿った = false;   // ★次の「辿る」に持ち越さない'),
    '持ち越すと、打ち込んで辿ったのに響きタブが開かなくなります',
  );
  確認(
    '★🌱 のときは、絞った件数を言わない',
    /if \(いまの曲から辿った\) \{[\s\S]{0,200}?手元に無いバンドは、上の 📋 に入っています/.test(素画面),
    '絞っていないのに件数を言うと、嘘になります',
  );
}

console.log(失敗 ? `\n★ ${失敗} 件だめでした\n` : '\nすべて通りました\n');
process.exit(失敗 ? 1 : 0);
