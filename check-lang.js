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
const cp = require('node:child_process');
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
  const Q = String.fromCharCode(34);
  const 通した = new Set();
  for (const f of ['src/renderer.js', 'src/main.js', 'src/ai.js']) {
    const src = 素にする(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    /*
     * ★ソースの "\\n" は、走るときには本物の改行になる。
     * 訳の鍵は走るときの形なので、ここで解いておかないと当たらない。
     */
    const 解く = (囲, 中) => JSON.parse(囲 === Q
      ? Q + 中 + Q
      : Q + 中.split(String.fromCharCode(92) + Q).join(Q)
          .split(String.fromCharCode(92) + "'").join("'")
          .split(Q).join(String.fromCharCode(92) + Q) + Q);
    for (const m of src.matchAll(/言\(\s*(['"])((?:[^'"\\]|\\.)*)\1/g)) {
      if (!日本語.test(m[2])) continue;
      let 文; try { 文 = 解く(m[1], m[2]); } catch { 文 = m[2]; }
      通した.add(文);
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

console.log('\n[6] ★英語のとき、AI への頼み文が英語になっているか');
/*
 * ■ 本人が決めた 3 つのうちの 1 つ
 *   ・AI も英語で返す
 *
 * ★画面だけ英語で、頼み文が日本語のままだと、返事も日本語で返ってくる。
 * ここが「AI も英語で返す」の要。
 *
 * ★組み立てた頼み文そのものを見る。行ごとに数えるより確か。
 * 訳し忘れが 1 行でもあれば、そこに日本語が残るので分かる。
 */
{
  const ai = require('./src/ai');
  const genre = require('./src/genre');
  const naoshi = require('./src/naoshi');

  /* ★記号（■ ★ ―― ／）は日本語ではないので、かな漢字だけを見る */
  /*
   * ★かな・漢字に加えて、日本語の句読点も見る。
   * 「、」を見落として、区切り文字が日本語のまま残る ―― を一度逃した。
   * ■ ★ … ／ ― は、どちらの言葉でも使う印なので、ここには入れない。
   */
  const かな漢字 = /[぀-ゟ゠-ヿ一-龯、。「」]/;
  const 日本語の行 = (文) => 文.split('\n').filter((l) => かな漢字.test(l));

  lang.言葉を入れる('en');

  const 頼み文たち = [
    ['気分 → 絞り込み', ai.頼み文(
      [{ 名前: 'Hardcore', 件数: 100 }, { 名前: 'Punk', 件数: 50 }], ['2019'], ai.幅を読む(3),
    )],
    ['一本を組む（王道・切）', ai.プレイリストの頼み文(
      'x', 30, '', 200, ai.強度を読む(1), ai.拡大解釈の文(1, false),
    )],
    ['一本を組む（外す・入）', ai.プレイリストの頼み文(
      'x', 30, '', 5, ai.強度を読む(5), ai.拡大解釈の文(5, true),
    )],
    ['言葉から辿る（王道）', ai.木の頼み文(
      [{ 名前: 'a', 曲数: 1 }], ai.幅を読む(1), { 曲数: 100, 演者数: 10 }, [], ai.強度を読む(1),
    )],
    ['言葉から辿る（外す）', ai.木の頼み文(
      [{ 名前: 'a', 曲数: 1 }], ai.幅を読む(5), { 曲数: 100, 演者数: 10 }, ['b'], ai.強度を読む(5),
    )],
    ['ジャンルをまとめる', genre.ジャンルの頼み文([{ 名: 'Hardcore', 曲数: 1 }])],
    ['ジャンルを埋める', naoshi.埋める頼み文(
      [{ artist: 'a', 盤: new Set(['b']), 曲: [{ path: 'p' }] }], ['Hardcore', 'Punk'],
    )],
  ];

  for (const [名, 文] of 頼み文たち) {
    const 残り = 日本語の行(文);
    確認(
      `★「${名}」の頼み文に、日本語が残っていない`,
      残り.length === 0,
      残り.slice(0, 2).map((l) => l.trim().slice(0, 44)).join(' ／ '),
    );
  }

  /* ★AI に「英語で返せ」と言っているか */
  const 一本 = ai.プレイリストの頼み文('x', 30, '', 200, ai.強度を読む(3), ai.拡大解釈の文(3, false));
  確認(
    '★一本を組むとき、英語で返せと言っている',
    /note in English/.test(一本) && /in English/.test(一本),
    '言わないと、画面だけ英語で返事は日本語になります',
  );
  確認('★題も英語でと言っている', /short name for this set, in English/.test(一本));
  const 木 = ai.木の頼み文([{ 名前: 'a', 曲数: 1 }], ai.幅を読む(3), null, [], ai.強度を読む(3));
  確認('★辿るときも、英語で返せと言っている', /"description" in English/.test(木));
  確認(
    '★まとめるときも、英語で一行と言っている',
    /one line in English/.test(genre.ジャンルの頼み文([{ 名: 'a', 曲数: 1 }])),
  );
  確認(
    '★埋めるときも、英語で一行と言っている',
    /one line in English/.test(naoshi.埋める頼み文(
      [{ artist: 'a', 盤: new Set(), 曲: [{ path: 'p' }] }], ['Hardcore'],
    )),
  );

  /* ★単数・複数 */
  確認('★1 のときは単数', lang.言('{n}曲', { n: 1 }) === '1 song');
  確認('★2 以上は複数', lang.言('{n}曲', { n: 12 }) === '12 songs');
  確認('★桁区切りが入っていても単複が効く', lang.言('{n}曲', { n: '1' }) === '1 song');
  lang.言葉を入れる('ja');
  確認('★日本語では単複を分けない', lang.言('{n}曲', { n: 1 }) === '1曲');

  /* ★日本語に戻したとき、日本語の頼み文に戻るか */
  const 日 = ai.プレイリストの頼み文('x', 30, '', 200, ai.強度を読む(3), ai.拡大解釈の文(3, false));
  確認(
    '★日本語に戻せば、頼み文も日本語に戻る',
    /あなたは DJ です/.test(日) && !/You are a DJ/.test(日),
  );
}


console.log('\n[7] ★画面に並べて読み込む台本が、名前をぶつけていないか');
/*
 * ★2026-08-30、実地で見つけた。
 * genre.js と naoshi.js が、どちらも大域に const 言う を作っていた。
 * 画面では <script> として並ぶので、**2 本目が丸ごと読み込まれない。**
 * node からは別々に読むため、ほかのどの検査にも掛からなかった。
 * 開いて見て初めて分かる類なので、ここで文面から捕まえる。
 */
{
  const 頁 = fs.readFileSync(path.join(__dirname, 'src/index.html'), 'utf8');
  const 並び = [...頁.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const 持ち主 = new Map();
  const ぶつかり = [];
  for (const 名 of 並び) {
    let 中; try { 中 = fs.readFileSync(path.join(__dirname, 'src', 名), 'utf8'); } catch { continue; }
    const 素 = 中.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    /* ★桁 0 から始まるものだけを大域と見なす（この作りではそう書いてある） */
    const 出た = new Set();
    for (const m of 素.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$\u3040-\u30ff\u4e00-\u9faf][\w$\u3040-\u30ff\u4e00-\u9faf]*)/gm)) {
      出た.add(m[1]);
    }
    for (const 名前 of 出た) {
      if (持ち主.has(名前)) ぶつかり.push(`${名前}（${持ち主.get(名前)} と ${名}）`);
      else 持ち主.set(名前, 名);
    }
  }
  console.log(`  画面に並べる台本 ${並び.length} 本 ／ 大域の名前 ${持ち主.size} 個`);
  確認('★大域の名前がぶつかっていない', ぶつかり.length === 0,
    ぶつかり.join('／') || '同じ名前を 2 本が作ると、2 本目が丸ごと読み込まれません');
}


console.log('\n[8] ★2 つの README が、ずれていないか');
/*
 * ★2026-08-31、英語版を作ったときに足した。
 * README が 2 つになると、片方だけ古くなる。
 * 実際、日本語版の検査一覧は「12 本」のまま 18 本に増えていた。
 * 版・ハッシュ・検査の一覧は、機械が見れば必ず気づける。
 */
{
  const 版 = require(path.join(__dirname, 'package.json')).version;
  const 検査 = require(path.join(__dirname, 'package.json')).scripts.check
    .split('&&').map((v) => (v.trim().match(/check-[a-z]+\.js/) || [''])[0]).filter(Boolean);

  const 英あり = fs.existsSync(path.join(__dirname, 'README.en.md'));
  確認('★英語版の README がある', 英あり);

  if (英あり) {
    const 日 = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    const 英 = fs.readFileSync(path.join(__dirname, 'README.en.md'), 'utf8');

    確認('★互いに行き来できる', 日.includes('README.en.md') && 英.includes('](README.md)'));

    for (const [名, 文] of [['日本語', 日], ['英語', 英]]) {
      確認(`★${名}版が、いまの版を指している（${版}）`,
        文.includes(`Otogura-Setup-${版}.exe`) && 文.includes(`Otogura-Portable-${版}.exe`),
        '版を上げたら、両方の README を直してください');
      const 抜け = 検査.filter((v) => !文.includes(v));
      確認(`★${名}版が、検査 ${検査.length} 本を全部並べている`, 抜け.length === 0,
        抜け.join('／'));
    }

    /* ★ハッシュは、両方に同じものが載っていること */
    const 拾う = (文) => [...文.matchAll(/`([0-9a-f]{64})`/g)].map((m) => m[1]).sort();
    const 日ハ = 拾う(日); const 英ハ = 拾う(英);
    確認('★どちらの README も、同じ SHA256 を載せている',
      日ハ.length === 2 && 日ハ.join(',') === 英ハ.join(','),
      `日本語 ${日ハ.length} 個 ／ 英語 ${英ハ.length} 個`);
  }
}


console.log('\n[9] ★公開して困るものが、入っていないか');
/*
 * ★2026-08-31 本人の指示: 「僕のバンドの名前は書かないようにしてください」
 *
 * なぜ機能があるかの記録は残し、**名前だけ**を外した。
 * ただ、また書いてしまえば入る。だから機械に見張らせる。
 *
 * ★禁じる語は、この台本の中でも**繋がった形にしない**（足し算で組む）。
 * そのまま書くと、この検査自身が引っかかってしまう。
 */
{
  const 禁じる = [
    ['バンド名', 'still i ' + 'regret'],
    ['バンド名', 'blue ' + 'sketch'],
    ['バンド名', 'pen' + 'ance'],
    ['バンド名', 'michi' + 'noku'],
    ['家の道', 'C:/Users/' + 'xmich/'],
    ['家の道', 'C:' + String.fromCharCode(92) + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + String.fromCharCode(92) + 'xmich' + String.fromCharCode(92) + String.fromCharCode(92)],
  ];
  /* ★GitHub の口座名（xmichinokux）は別物。README の URL に要る */
  const 見逃す = /xmichinokux/g;

  const 一覧 = String(cp.execSync('git ls-files', { cwd: __dirname })).split('\n')
    .map((v) => v.trim()).filter(Boolean);
  const 見つけた = [];
  for (const f of 一覧) {
    let 中; try { 中 = fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch { continue; }
    const 素 = 中.replace(見逃す, '');
    for (const [種, 語] of 禁じる) {
      if (素.toLowerCase().includes(語.toLowerCase())) 見つけた.push(`${f}（${種}）`);
    }
  }
  console.log(`  追いかけているファイル ${一覧.length} 個を見ました`);
  確認('★本人のバンド名も、家の道も、入っていない', 見つけた.length === 0,
    [...new Set(見つけた)].slice(0, 6).join('／'));

  /* ★鍵らしきものが混ざっていないか（AppData に置く決まりだが、念のため） */
  const 鍵の形 = /sk-ant-[A-Za-z0-9_-]{20,}/;
  const 鍵 = 一覧.filter((f) => {
    try { return 鍵の形.test(fs.readFileSync(path.join(__dirname, f), 'utf8')); } catch { return false; }
  });
  確認('★API キーらしきものが入っていない', 鍵.length === 0, 鍵.join('／'));
}

console.log('');
if (落ちた) { console.log(`★${落ちた} 個 落ちました`); process.exit(1); }
console.log('すべて通りました');
