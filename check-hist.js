'use strict';

/*
 * 打った文の履歴の検査。
 *
 * ■ 本人の希望（2026-08-30）
 *   > 一回使ったら入力欄の文字は消えてほしいと思う反面、
 *   > 同じ条件でどんなのできるかな？と試そうとする自分もいて
 *   > イチイチ文字が消えるのが面倒くさいと思います。
 *   > 入力欄の履歴が残って入力欄をクリックするとしたに履歴が表示される、
 *   > みたいな機能があればいいのかな？と思ったんですが、どうですか？
 *   > ちなみに、履歴は消したいとも思うので履歴を消すなにかもほしいのですが。
 *
 * ★「消す」はそのまま残す。履歴があれば戻すのは 1 クリックなので、
 * 「消えてほしい」と「また使いたい」が両方かなう。
 *
 * ★ここで見張るのは 4 つ。
 *  1. 消せること。1 件でも、まとめてでも
 *  2. 設定とは別のファイルであること（消しても他を巻き込まない）
 *  3. 同じ文で増えないこと。上に来るだけ
 *  4. うまくいったときだけ覚えること
 */

const fs = require('node:fs');
const path = require('node:path');

let 落ちた = 0;
function 確認(題, 真, 補) {
  console.log((真 ? '  OK   ' : '  NG   ') + 題 + (真 || !補 ? '' : ' ― ' + 補));
  if (!真) 落ちた += 1;
}

const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
const 橋 = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
const 素 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

console.log('[1] 履歴を整えるところ');
{
  const 頭 = 本体.indexOf('function 履歴を整える(v) {');
  if (頭 < 0) { console.log('  NG   履歴を整える が無い'); process.exit(1); }
  const 履歴の上限 = 20;
  void 履歴の上限;
  // eslint-disable-next-line no-eval
  const 履歴を整える = eval(
    本体.slice(頭, 本体.indexOf(String.fromCharCode(10) + '}', 頭) + 2)
    + String.fromCharCode(10) + '履歴を整える',
  );

  確認('★2 種類ぶんが返る', (() => {
    const h = 履歴を整える(null);
    return Array.isArray(h.気分) && Array.isArray(h.言葉);
  })());

  const h = 履歴を整える({ 気分: ['あ', 'い', 'あ', '  あ  ', '', 5, null, 'ア'] });
  確認('★同じ文は 1 つだけ', h.気分.filter((x) => x === 'あ').length === 1,
    '実際: ' + JSON.stringify(h.気分));
  確認('★前後の空白は同じものとして扱う', !h.気分.includes('  あ  '));
  確認('空や文字でないものは落とす', !h.気分.includes('') && h.気分.every((x) => typeof x === 'string'));
  確認('★並びは変えない（新しい順のまま）', h.気分[0] === 'あ' && h.気分[1] === 'い');

  const 多い = 履歴を整える({ 気分: Array.from({ length: 50 }, (_, i) => 'x' + i) });
  確認('★20 件までに切る', 多い.気分.length === 20, '実際: ' + 多い.気分.length);

  let 落ちない = true;
  for (const v of [null, undefined, 42, 'あ', [], { 気分: 'ちがう' }, { 気分: [{}] }]) {
    try { const o = 履歴を整える(v); if (!Array.isArray(o.気分)) 落ちない = false; } catch { 落ちない = false; }
  }
  確認('★壊れた履歴ファイルでも落ちない', 落ちない);
  確認('★長すぎる文は切る', 履歴を整える({ 気分: ['ん'.repeat(500)] }).気分[0].length === 200);
}

console.log('\n[2] ★設定とは別のファイルか（消しても他を巻き込まない）');
{
  確認(
    '★履歴だけのファイルに置く',
    /履歴ファイル = \(\) => path\.join\(app\.getPath\('userData'\), '履歴\.json'\)/.test(本体),
    '設定に混ぜると、履歴を消すときに他の設定を巻き込みます',
  );
  確認(
    '★人が読める形で書く',
    /JSON\.stringify\(履歴を整える\(v\), null, 2\)/.test(本体),
  );
  確認(
    '★履歴を設定ファイルに書いていない',
    !/s\.履歴|設定を書く[\s\S]{0,60}履歴/.test(本体),
  );
}

console.log('\n[3] 受け口と橋');
{
  for (const k of ['hist:get', 'hist:add', 'hist:remove', 'hist:clear']) {
    確認(`本体に ${k} がある`, 本体.includes(`ipcMain.handle('${k}'`));
    確認(`橋に ${k} が通してある`, 橋.includes(k));
  }
  確認(
    '★1 件だけ消せる',
    /ipcMain\.handle\('hist:remove'[\s\S]{0,300}?filter\(\(x\) => x !== String/.test(本体),
  );
  確認(
    '★まとめて消せる（種類ごと／ファイルごと）',
    /ipcMain\.handle\('hist:clear'[\s\S]{0,400}?fs\.unlink\(履歴ファイル\(\)\)/.test(本体),
  );
  確認(
    '★足すとき、同じ文は上に来るだけ（増えない）',
    /\[t, \.\.\.h\[種\]\.filter\(\(x\) => x\.toLocaleLowerCase\('ja'\) !== t\.toLocaleLowerCase\('ja'\)\)\]/.test(本体),
    '同じ気分を何度も試すので、そのたびに増えると使いものになりません',
  );
  確認(
    '★知らない種類は受け付けない',
    /if \(種 !== '気分' && 種 !== '言葉'\) return/.test(本体),
  );
}

console.log('\n[4] 画面');
{
  確認('★履歴を出すところがある', /function 履歴を出す\(欄, 種, 決める\)/.test(素));
  確認('★欄に付けるところがある', /function 履歴をつける\(欄, 種\)/.test(素));
  確認(
    '★2 つの欄それぞれに付けている',
    /履歴をつける\(欄, "気分"\)/.test(素) && /履歴をつける\(欄2, "言葉"\)/.test(素),
  );
  確認(
    '★クリックで出す（本人の言葉どおり）',
    /欄\.addEventListener\("mousedown"/.test(素),
  );
  確認(
    '★打っている最中は邪魔しない',
    /欄\.addEventListener\("input", 履歴を閉じる\)/.test(素),
  );
  確認(
    '★選んだら欄に入る',
    /決める\(文\);/.test(素) && /欄\.value = 文;/.test(素),
  );
  確認(
    '★選んだら控えにも入れる（描き直しで消えないように）',
    /打ちかけの言葉 = 文; else 打ちかけの辿る言葉 = 文;/.test(素),
    '控えに入れないと、次の描き直しで戻ってしまいます',
  );
  確認('★1 件ずつ消せる', /window\.mp3\.履歴から消す\(種, 文\)/.test(素));
  確認('★消したら、その場で出し直す', /履歴を出す\(欄, 種, 決める\);/.test(素));
  確認('★まとめて消すところがある', /window\.mp3\.履歴を全部消す\(種\)/.test(素));
  確認('★何件あるかを出す',
    /この履歴を全部消す（\{n} 件）., \{ n: 並び\.length \}/.test(素));
  確認('★よそを押したら閉じる', /出ている履歴\.contains\(e\.target\)/.test(素));
  確認('★Escape でも閉じる', /e\.key === 'Escape' && 出ている履歴/.test(素));
  確認('★履歴が無ければ出さない', /if \(!並び\.length\) return;/.test(素));
  確認('★起動時に読み戻す', /打った履歴 = await window\.mp3\.履歴を取る\(\)/.test(素));
  確認('★見た目が入っている', /\.histbox \{/.test(頁));

  /* ★うまくいったときだけ覚える */
  確認(
    '★気分は、組めたときだけ覚える',
    /if \(できた\) \{[\s\S]{0,200}?履歴に足す\("気分", v\)/.test(素),
    'だめだった文を残しても仕方がありません',
  );
  確認(
    '★言葉は、辿れたときだけ覚える',
    /履歴に足す\("言葉", v\)/.test(素)
      && 素.indexOf('履歴に足す("言葉"') > 素.indexOf('const 足りた = await 木を生やして足す'),
  );
  /* ★消すのはやめていないこと（本人は「消えてほしい」とも言っている） */
  確認(
    '★組めたら欄は空にする（履歴があるので、戻すのは 1 クリック）',
    /打ちかけの言葉 = "";/.test(素) && /打ちかけの辿る言葉 = "";/.test(素),
  );
}

console.log('\n[5] ★設定が書けたかを確かめているか');
{
  確認(
    '★書いたあとに読み返す',
    /async function 設定を書く\(v\)[\s\S]{0,600}?読み返し = await fs\.readFile\(設定ファイル\(\)/.test(本体),
    'settings.json が 5 日間更新されない状態が実地で見つかりました。黙らせないためです',
  );
  確認(
    '★中身が合わなければ投げる',
    /if \(読み返し !== 文\) \{[\s\S]{0,160}?throw new Error/.test(本体),
  );
}

console.log('');
if (落ちた) { console.log(`★${落ちた} 個 落ちました`); process.exit(1); }
console.log('すべて通りました');
