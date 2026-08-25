// シャッフルが本当に「再生回数の少ない曲」を選びやすいか、実際に引いて数える
const { 次を選ぶ, 巡が終わったか } = require('./src/shuffle');

const 曲 = {
  'よく聴く曲（50回）': 50,
  'たまに聴く曲（10回）': 10,
  '数回聴いた曲（2回）': 2,
  '一度だけ聴いた（1回）': 1,
  '忘れている曲A（0回）': 0,
  '忘れている曲B（0回）': 0,
};
const 候補 = Object.keys(曲);
const 回数表 = 曲;

/* 1. 1万回引いて、どれが何回出たか（巡は使わず、重みだけ見る） */
const 出た = Object.fromEntries(候補.map((p) => [p, 0]));
const N = 10000;
for (let i = 0; i < N; i += 1) {
  const p = 次を選ぶ(候補, 回数表, new Set());
  出た[p] += 1;
}

console.log(`■ ${N} 回引いた結果（均等なら各 ${(100 / 候補.length).toFixed(1)}%）\n`);
for (const p of 候補) {
  const 率 = (出た[p] / N) * 100;
  const 棒 = '█'.repeat(Math.round(率));
  console.log(`  ${p.padEnd(22)} ${率.toFixed(1).padStart(5)}%  ${棒}`);
}

const 忘れ = (出た['忘れている曲A（0回）'] + 出た['忘れている曲B（0回）']) / N;
const よく = 出た['よく聴く曲（50回）'] / N;
console.log(`\n  忘れている曲（0回）の合計 : ${(忘れ * 100).toFixed(1)}%`);
console.log(`  よく聴く曲（50回）        : ${(よく * 100).toFixed(1)}%`);
console.log(`  → 0回の曲は 50回の曲の約 ${Math.round((忘れ / 2) / よく)} 倍 出やすい`);

/* 2. 同じ曲が続けて出ないか（巡を使う） */
console.log('\n■ 巡を使うと、同じ曲が続けて出ないか');
let 済み = new Set();
const 並び = [];
for (let i = 0; i < 候補.length; i += 1) {
  const p = 次を選ぶ(候補, 回数表, 済み);
  並び.push(p);
  済み.add(p);
}
const 重複 = 並び.length - new Set(並び).size;
console.log(`  1巡で出た曲: ${並び.length} 曲 / 重複 ${重複} 件 ${重複 === 0 ? '✓' : '★'}`);
console.log(`  巡が終わったと判定できるか: ${巡が終わったか(候補, 済み) ? '✓' : '★'}`);

/* 3. 締め出していないか（よく聴く曲も、たまには出る） */
console.log('\n■ よく聴く曲も締め出していないか');
console.log(`  50回の曲が 1万回中に出た回数: ${出た['よく聴く曲（50回）']} 回 ${出た['よく聴く曲（50回）'] > 0 ? '✓ 出る' : '★ 出ない'}`);
