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
  // album に当たる名前でも、artist に無ければ当てない
  const r = 読み込む(JSON.stringify(木を作る([{ name: 'Jane Doe', genre: 'music', description: '名盤', depth: 3 }])));
  const m = 突き合わせる(r.木, 曲たち, いま);
  確認(
    '★album にしか無い名前は当てない',
    m.当たり.length === 0 && m.外れ.includes('Jane Doe'),
    `当たり ${m.当たり.length} / 外れ ${JSON.stringify(m.外れ)}`,
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
  確認('★深いほど強い', 深 > 浅, `深さ0=${浅.toFixed(2)} / 深さ3=${深.toFixed(2)}`);

  const 新 = 重みを出す(2, '2026-08-29T00:00:00.000Z', いま);
  const 古 = 重みを出す(2, '2026-05-02T00:00:00.000Z', いま);
  確認('★新しいほど強い', 新 > 古, `新=${新.toFixed(2)} / 古=${古.toFixed(2)}`);
  確認('古くても 0 にはしない', 古 > 0, `${古.toFixed(2)}（0 にすると古い木が死にます）`);

  確認('日付が無ければ深さだけで決める', 重みを出す(2, '', いま) === 3, String(重みを出す(2, '', いま)));
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
  確認('★曲を 1 周しか回っていない', 触った === 1, `${触った} 周（名前ごとに探すと 23 周になります）`);
  確認('それでも正しく当たる', m.当たり.length === 1 && m.曲.size === 50, `${m.当たり.length} 組 / ${m.曲.size} 曲`);
}

/* ── 5. AI に渡す一節 ────────────────────────────────── */
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
const 実物 = 'C:/Users/（自分）/Downloads/resonance-trees-2026-08-29.json';
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
