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
})();
