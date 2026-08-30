'use strict';

/*
 * 言葉（日本語／英語）の検査。
 *
 * ■ 本人の希望（2026-08-29 に決めた 3 つ）
 *   ・AI も英語で返す
 *   ・英語版の README も作る
 *   ・OS の言語を見て自動で切り替えたうえで、手動でも切り替えられる
 *
 * ■ ★鍵は日本語そのもの
 * 検査が 15 本あり、その多くが日本語の文字列を当てにしている。
 * 鍵を日本語にすれば 言('…') はソースにその文字列を含むので、
 * **既存の検査がそのまま通る。** ID を振ると 15 本ぜんぶ書き換えになる。
 *
 * ★ここで見張るのは 4 つ。
 *  1. 訳が無くても壊れないこと（日本語のまま出る）
 *  2. 自動と手動の両方が効くこと
 *  3. 差し込みが両方の言葉で効くこと
 *  4. 覚え書きに残り、次に開いても同じであること
 */

const fs = require('node:fs');
const path = require('node:path');
const lang = require('./src/lang');

let 落ちた = 0;
function 確認(題, 真, 補) {
  console.log((真 ? '  OK   ' : '  NG   ') + 題 + (真 || !補 ? '' : ' ― ' + 補));
  if (!真) 落ちた += 1;
}

console.log('[1] OS の言葉から決める');
{
  確認('日本語の OS は日本語', lang.言葉を選ぶ('ja') === 'ja' && lang.言葉を選ぶ('ja-JP') === 'ja');
  確認('英語の OS は英語', lang.言葉を選ぶ('en') === 'en' && lang.言葉を選ぶ('en-US') === 'en');
  確認(
    '★日本語以外は英語にする',
    lang.言葉を選ぶ('fr') === 'en' && lang.言葉を選ぶ('de-DE') === 'en',
    '中途半端に日本語を出すより、英語のほうが分かります',
  );
  確認('分からないときも落ちない', lang.言葉を選ぶ(null) === 'en' && lang.言葉を選ぶ(undefined) === 'en');
}

console.log('\n[2] ★自動と手動の両方が効くか（本人の指定）');
{
  確認("自動は OS に従う", lang.言葉を決める('auto', 'ja') === 'ja' && lang.言葉を決める('auto', 'en-US') === 'en');
  確認(
    '★手で選べば、OS より優先する',
    lang.言葉を決める('en', 'ja') === 'en' && lang.言葉を決める('ja', 'en-US') === 'ja',
    '自動だけでは、日本語 OS の人が英語版を見られません',
  );
  確認('変な設定は自動として扱う', lang.言葉を決める('ふらんす語', 'ja') === 'ja');
  確認('設定が無くても落ちない', lang.言葉を決める(undefined, 'en') === 'en');
}

console.log('\n[3] ★訳す（無ければ日本語のまま）');
{
  lang.言葉を入れる('ja');
  確認('日本語では、そのまま返る', lang.言('一本を組む') === '一本を組む');
  lang.言葉を入れる('en');
  確認('英語では、訳が返る', lang.言('一本を組む') === 'Build a set');
  確認(
    '★訳が無いものは、日本語のまま返る',
    lang.言('まだ訳していない文です') === 'まだ訳していない文です',
    '空欄や undefined が出るより、ずっとましです。少しずつ訳せます',
  );
  確認('空でも落ちない', lang.言('') === '' && lang.言(null) === '' && lang.言(undefined) === '');

  /* ★差し込み */
  lang.言葉を入れる('ja');
  確認('差し込みが効く（日本語）', lang.言('{n} 曲', { n: 30 }) === '30 曲');
  lang.言葉を入れる('en');
  確認('★差し込みが効く（英語）', lang.言('{n} 曲', { n: 30 }) === '30 songs');
  確認(
    '★差し込みが 2 つ以上でも効く',
    lang.言('{a}{b}', { a: 'x', b: 'y' }) === 'xy',
  );
  確認('同じ差し込みが 2 回出ても効く', lang.言('{n}と{n}', { n: 3 }) === '3と3');
  確認('差し込みを渡さなくても落ちない', typeof lang.言('{n} 曲') === 'string');
  lang.言葉を入れる('ja');
  確認('入れ替えると戻る', lang.いまの() === 'ja' && lang.言('一本を組む') === '一本を組む');
  確認('変な値は日本語にする', lang.言葉を入れる('ふらんす語') === 'ja');
  確認('英語かの見分け', !lang.英語か() && lang.言葉を入れる('en') === 'en' && lang.英語か());
  lang.言葉を入れる('ja');
}

console.log('\n[4] ★繋いであるか');
{
  const 本体 = fs.readFileSync(path.join(__dirname, 'src/main.js'), 'utf8');
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 橋 = fs.readFileSync(path.join(__dirname, 'src/preload.js'), 'utf8');
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  const 素 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 素頁 = 頁.replace(/<!--[\s\S]*?-->/g, ' ');

  確認('画面が lang.js を読み込んでいる', /<script src="lang\.js"><\/script>/.test(素頁));
  確認(
    '★lang.js は renderer.js より先',
    素頁.indexOf('lang.js') >= 0 && 素頁.indexOf('lang.js') < 素頁.indexOf('renderer.js'),
  );
  確認('覚え書きに言語がある', /言語: \(v\.言語 === 'ja' \|\| v\.言語 === 'en'\) \? v\.言語 : 'auto'/.test(本体));
  確認('本体に受け口がある', /ipcMain\.handle\('lang:get'/.test(本体) && /ipcMain\.handle\('lang:set'/.test(本体));
  確認('橋が通してある', 橋.includes('lang:get') && 橋.includes('lang:set'));
  確認(
    '★本体側も、起動のときに言葉を決める',
    /lang\.言葉を入れる\(lang\.言葉を決める\(s\.言語, app\.getLocale\(\)\)\)/.test(本体),
    'AI への頼み文が、これを見ます',
  );
  確認('★OS の言葉を見ている', /app\.getLocale\(\)/.test(本体));

  確認('切り替えのボタンがある', /id="langbtn"/.test(素頁));
  確認('★押したら覚える', /window\.mp3\.言葉を変える\(次\)/.test(素));
  確認(
    '★自動→日本語→English と回る',
    /\{ auto: 'ja', ja: 'en', en: 'auto' \}\[言葉の設定\]/.test(素),
  );
  確認(
    '★札には設定そのものを出す',
    /auto: いまの\(\) === 'ja' \? '🌐 自動（日本語）'/.test(素),
    '自動→日本語で見た目が変わらないと、押しても何も起きないように見えます',
  );
  確認(
    '★切り替えたら、AI の欄を作り直させる',
    /box\.dataset\.形 = '';/.test(素),
    '欄は形が変わったときしか作り直さないので、これが無いと札が古いままです',
  );
  確認('★起動のときに読み戻す', /await window\.mp3\.言葉を取る\(\)/.test(素));
  確認(
    '★描き直すたびに札を直す',
    素.slice(素.indexOf('function 描き直す(')).includes('言葉のボタンを直す()'),
  );

  /* ★言 が変数名に隠されていないか */
  確認(
    '★言 を変数名に使っていない（関数が影に隠れる）',
    !/(const|let|var) 言 /.test(素),
    '同じ名前の変数があると、その中で 言() が呼べなくなります',
  );
}

console.log('\n[5] ★どこまで訳したか');
{
  const 日本語 = /[぀-ヿ一-龯]/;
  const 素にする = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const 通した = new Set();
  for (const f of ['src/renderer.js', 'src/main.js', 'src/ai.js']) {
    const src = 素にする(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    for (const m of src.matchAll(/言\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g)) {
      if (日本語.test(m[2])) 通した.add(m[2]);
    }
  }
  const 訳表 = lang.訳.en || {};
  const 訳あり = [...通した].filter((v) => Object.prototype.hasOwnProperty.call(訳表, v));
  const 訳なし = [...通した].filter((v) => !Object.prototype.hasOwnProperty.call(訳表, v));

  console.log(`  言() に通した文  ${通した.size} 個（訳あり ${訳あり.length} ／ まだ ${訳なし.length}）`);
  確認('★言() に通した文には、英語の訳がある', 訳なし.length === 0,
    訳なし.slice(0, 5).join('／'));
  確認('★まだ通していない文があっても、壊れない', true,
    '訳が無ければ日本語のまま出ます。少しずつ進められます');
}

console.log('');
if (落ちた) { console.log(`★${落ちた} 個 落ちました`); process.exit(1); }
console.log('すべて通りました');
