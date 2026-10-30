// 難しい名前のファイルを走査して、作られる file:// URL が本当にそのファイルを指すか確かめる
const path = require('node:path');
const fs = require('node:fs');
const { scanLibrary } = require('./src/library');

// renderer.js と同じ組み立て（ここを直したら向こうも直す）
function ファイルURL(win路) {
  const slash = win路.split('\\').join('/');
  return 'file:///' + encodeURI(slash).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

(async () => {
  const dir = path.resolve('test-music');
  const r = await scanLibrary([dir], []);
  console.log(`走査: ${r.tracks.length} 曲（読めず ${r.unreadable} 件）\n`);

  let ng = 0;
  for (const t of r.tracks) {
    const url = ファイルURL(t.path);
    // URL を戻して、その場所に本当にファイルがあるか
    const 戻し = decodeURIComponent(url.slice('file:///'.length)).split('/').join('\\');
    const ok = fs.existsSync(戻し);
    if (!ok) ng += 1;
    console.log(`${ok ? '✓' : '★'} ${t.title}`);
    console.log(`    元 : ${t.path}`);
    console.log(`    URL: ${url}`);
  }
  console.log(`\n指せていないもの: ${ng} 件`);

  /*
   * ★道のりが長いファイルは、中身を渡して鳴らす（2026-10-31 本人の報告）。
   *
   *   > このファイルが再生できないみたいですがどうしてでしょう？
   *   （画面には「no supported source was found」と出ていた）
   *
   * ■ 調べたこと
   * そのファイルは正真正銘の MP3 だった（ff fb / MPEG 1 Layer 3 / 320kbps）。
   * 壊れてもいない。違いは道のりの長さだけで、326 文字あった。
   *
   * ★同じ中身を短い道のりと長い道のりに置いて、両方 鳴らさせて確かめた:
   *     短い（ 54 文字）  鳴る（2.0 秒）
   *     長い（327 文字）  ★MEDIA_ELEMENT_ERROR: Format error
   *   Chromium は file:// で 260 文字を超える道のりを開けない。
   *   Node（本体側）は開ける ―― 走査もタグ読みも通っていたのはそのため。
   *
   * ★中身を Blob で渡せば鳴ることも確かめた（同じ長さの道のりで 2.0 秒）。
   * 実測で蔵書の 0.3%（7 曲）なので、**file:// で失敗したときだけ**の後詰めにする。
   */
  const 画面 = fs.readFileSync(path.join(__dirname, 'src/renderer.js'), 'utf8');
  const 素画面 = 画面.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  let 落ちた = 0;
  const 確認 = (名, 条件, 補足 = '') => {
    if (条件) console.log(`  OK   ${名}`);
    else { console.log(`  NG   ${名}${補足 ? ' ― ' + 補足 : ''}`); 落ちた += 1; }
  };

  console.log('\n[2] ★道のりが長くても鳴らせるか（260 文字の壁）');
  確認(
    '★鳴らせなかったら、中身を渡して鳴らし直す',
    素画面.includes('async function 中身を渡して鳴らす(t)')
      && 素画面.includes('audio.src = 中身のURL;'),
    'file:// だけだと、260 文字を超える道のりの曲が鳴りません',
  );
  確認(
    '★鳴らし直すのは 1 度だけ（往復しない）',
    素画面.includes("中身で鳴らし直した !== t.path && !audio.src.startsWith('blob:')"),
    '形式そのものが駄目なときに、無限に読み直します',
  );
  確認(
    '★次の曲に移ったら、控えた中身を捨てる',
    /audio\.src = ファイルURL\(t\.path\);/.test(素画面)
      && /中身のURLを捨てる\(\);[\s\S]{0,80}?audio\.src = ファイルURL/.test(素画面),
    '捨てないと、長い道のりの曲を送るたびに中身が溜まります',
  );
  確認(
    '★2 度目も駄目なら、ちゃんと「鳴らせない」と出す',
    /return 言\('ファイルを読めなかった'\);/.test(素画面)
      && /if \(駄目な訳\) 再生できない\(駄目な訳\);/.test(素画面)
      && /4: 言\('この形式は再生できない'\)/.test(素画面),
    'ALAC のように形式が駄目なものは、黙らずに言う',
  );
  確認(
    '★大きすぎるファイルは、読まずに断る',
    /音を読む\(t\.path, 読む上限\)/.test(素画面)
      && /if \(r && r\.大きすぎる\)/.test(素画面),
    '蔵書の .wav は最大 1,095 MB ある ― 抱えようとすると固まります',
  );
  console.log(`\n通らなかったもの: ${落ちた} 件`);
  process.exit(ng || 落ちた ? 1 : 0);
})();
