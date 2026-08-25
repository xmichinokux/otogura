// 本物のライブラリで、走査の速さと重さを測る（画面を開かずに）
//
//   node check-scan.js "D:/Music"
//
// ★自分のパスを既定値に書かない。公開する前提のファイルなので、
//   置いたままだと他人の手元で意味の無いパスを指すし、個人の情報でもある。
const { scanLibrary } = require('./src/library');
const フォルダ = process.argv[2];
if (!フォルダ) {
  console.error('使い方: node check-scan.js "調べたいフォルダ"');
  process.exit(1);
}

(async () => {
  const MB = () => (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
  console.log(`対象: ${フォルダ}`);
  console.log(`開始時のメモリ: ${MB()} MB\n`);

  let 最後の進み = '';
  const 進み = (p) => { 最後の進み = `${p.段階} ${p.済み}${p.全体 ? '/' + p.全体 : ''}`; };
  let 途中で受け取った = 0;
  const 途中経過 = (a) => { 途中で受け取った += a.length; };

  const t = Date.now();
  const r = await scanLibrary([フォルダ], [], {}, 進み, 途中経過);
  const 秒 = (Date.now() - t) / 1000;

  console.log(`■ 1回目（覚え書きなし）`);
  console.log(`  ${r.tracks.length} 曲 / ${秒.toFixed(1)} 秒 / ${(秒 * 1000 / Math.max(1, r.tracks.length)).toFixed(2)} ms per 曲`);
  console.log(`  見つかった ${r.found} / 読めなかった ${r.unreadable} / 使い回し ${r.使い回し}`);
  console.log(`  途中で受け取った ${途中で受け取った} 曲（全部そろう前に画面へ出せる分）`);
  console.log(`  最後の進み: ${最後の進み}`);
  console.log(`  メモリ: ${MB()} MB`);
  const 絵 = r.tracks.filter((x) => x.artwork).length;
  console.log(`  ★一覧にアートワークを持っている曲: ${絵} 件（0 でなければ設計ミス）`);
  const タグなし = r.tracks.filter((x) => !x.タグあり).length;
  console.log(`  タグなしと判定: ${タグなし} 曲`);

  const t2 = Date.now();
  const r2 = await scanLibrary([フォルダ], [], r.覚え書き, null, null);
  const 秒2 = (Date.now() - t2) / 1000;
  console.log(`\n■ 2回目（覚え書きあり）`);
  console.log(`  ${r2.tracks.length} 曲 / ${秒2.toFixed(1)} 秒  → ${(秒 / Math.max(0.01, 秒2)).toFixed(1)} 倍速い`);
  console.log(`  使い回し ${r2.使い回し} / ${r2.tracks.length}`);
})();
