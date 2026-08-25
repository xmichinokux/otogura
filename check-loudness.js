// 音量そろえの計算を、作った波形で確かめる
const { 倍率を決める, 測る, 基準dB } = require('./src/loudness');

const dB = (比) => (比 > 0 ? 20 * Math.log10(比) : -Infinity);

/** 指定した大きさのサイン波を作る（1秒ぶん） */
function 波(振幅, 長さ = 44100) {
  const a = new Float32Array(長さ);
  for (let i = 0; i < 長さ; i += 1) a[i] = 振幅 * Math.sin((2 * Math.PI * 440 * i) / 44100);
  return [a];
}

const 曲 = [
  ['とても小さい録音', 0.02],
  ['小さめの録音', 0.08],
  ['ふつうの録音', 0.22],
  ['大きい録音', 0.5],
  ['やたら大きい録音', 0.9],
];

console.log(`基準 ${基準dB} dB に寄せる\n`);
console.log('  曲                    元の大きさ   かける倍率   そろえた後   頭打ち');

const 後の並び = [];
for (const [名, 振幅] of 曲) {
  const { rms, ピーク } = 測る(波(振幅));
  const { 倍率, 頭打ち } = 倍率を決める(rms, ピーク);
  const 後 = dB(rms * 倍率);
  後の並び.push(後);
  console.log(
    `  ${名.padEnd(20)} ${dB(rms).toFixed(1).padStart(6)}dB  ${倍率.toFixed(2).padStart(7)}倍  ${後.toFixed(1).padStart(7)}dB  ${頭打ち ? '★あり' : ''}`,
  );
}

const 幅 = Math.max(...後の並び) - Math.min(...後の並び);
const 元幅 = dB(測る(波(0.9)).rms) - dB(測る(波(0.02)).rms);
console.log(`\n  そろえる前のばらつき: ${元幅.toFixed(1)} dB`);
console.log(`  そろえた後のばらつき: ${幅.toFixed(1)} dB`);
console.log(`  → ${(元幅 - 幅).toFixed(1)} dB ぶん縮まった`);

/* 音が割れないか（ピーク × 倍率 が 1.0 を超えないか） */
console.log('\n■ 音が割れないか');
let 割れ = 0;
for (const [名, 振幅] of 曲) {
  const { rms, ピーク } = 測る(波(振幅));
  const { 倍率 } = 倍率を決める(rms, ピーク);
  const 後ピーク = ピーク * 倍率;
  const ok = 後ピーク <= 1.0001;
  if (!ok) 割れ += 1;
  console.log(`  ${ok ? '✓' : '★'} ${名.padEnd(20)} 後のピーク ${後ピーク.toFixed(3)}`);
}

/* 無音のときに壊れないか */
const 無音 = 倍率を決める(0, 0);
console.log(`\n■ 無音でも壊れないか: 倍率 ${無音.倍率} ${無音.倍率 === 1 ? '✓' : '★'}`);
console.log(`\n音割れした曲: ${割れ} 件`);
