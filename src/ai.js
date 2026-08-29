'use strict';

/**
 * 気分を言うと、聴くものを絞り込んでくれるところ。
 *
 * ■ 本人の希望（2026-08-29）
 *   > このプレイヤーにAIのAPIをつなげて、その時の気分を言うと
 *   > AIがおすすめして曲を選んでくれる、なんてことはできますか？
 *
 * ─────────────────────────────────────────────────────────
 * ■ ★AI に「曲」を選ばせない。「絞り込み」を選ばせる
 *
 * 曲を全部渡すことはできない。数えた（2026-08-29、本人のライブラリ）:
 *
 *   全 86,044 曲を渡すと   4,638,325 文字 ≈ **210 万トークン**
 *   → 文脈は最大 100 万トークン。**入らない。**
 *
 * 渡すのは「語彙」だけでいい:
 *
 *   ジャンル一覧（件数つき）   101 種    1,594 文字 ≈ **725 トークン**
 *   アーティスト一覧        5,861 種   72,852 文字 ≈ 33,115 トークン
 *   アルバム一覧           7,376 種  150,993 文字 ≈ 68,633 トークン
 *
 * ジャンル一覧なら毎回まるごと送れる。中身も具体的
 * （Hardcore 12,574 / Powerviolence 4,236 / Gore Grind 2,730 …）。
 *
 * ★返させるのは「3 カラムに入れる値」。曲名ではない。
 * すると:
 *   ・送るものが小さい
 *   ・**AI が何をしたか画面に見える**（カラムが選ばれた状態になる。
 *     納得できなければ手で直せる）
 *   ・**無い曲を作られる心配がない**（下の 照らし合わせる で実在を確かめる）
 *   ・そのあとは、いまのシャッフル（同じ演者を続けない・回数の重み）がそのまま働く
 *
 * ■ ★キーが無くても壊れない（本人の指示）
 *   > キーは後で用意するのでキーがなくても壊れない形で先に作ってください。
 *
 * キーが無いときは、この機能そのものが画面に出ない。
 * 例外を投げず、「使えない理由」を返すだけにする。
 *
 * ■ ★外に出るもの
 * このアプリで**唯一、外部に通信するところ**。
 * 送るのは「ジャンル名の一覧」と「打ち込んだ気分の文」だけ。
 * **曲名もファイルのパスも送らない。** 押したときだけ通信する。
 * ─────────────────────────────────────────────────────────
 */

/** 使う型。ここを変えたら README の「何を送るか」も直すこと */
const 使うモデル = 'claude-opus-5';

/**
 * ジャンルの一覧を作る（件数の多い順）。
 * ★件数を付けるのは、AI に「そのジャンルがどれくらいあるか」を伝えるため。
 * 3 曲しかないジャンルばかり選ばれても、聴くものにならない。
 */
function ジャンル一覧を作る(tracks) {
  const 数 = new Map();
  for (const t of tracks) {
    const g = (t && t.genre ? String(t.genre) : '').trim();
    if (!g) continue;
    数.set(g, (数.get(g) ?? 0) + 1);
  }
  return [...数.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([名前, 件数]) => ({ 名前, 件数 }));
}

/**
 * 頼み文（system）を作る。
 *
 * ★「無いものを出さないで」と書くだけでは足りない。
 * 書いたうえで、返ってきたものを 照らし合わせる() で必ず確かめる。
 * 言葉での指示は当てにしない ―― 確かめるのはこちらの仕事。
 */
function 頼み文(ジャンル一覧, 年一覧) {
  const ジャンル行 = ジャンル一覧.map((g) => `${g.名前}（${g.件数}曲）`).join('\n');
  const 年行 = 年一覧.length ? 年一覧.join(' / ') : '（日付の分かる曲がありません）';
  return [
    'あなたは、その人の音楽ライブラリから「いまの気分に合う範囲」を選ぶ役です。',
    '曲は選びません。**絞り込みの条件だけ**を選びます。',
    '',
    '■ このライブラリにあるジャンル（件数の多い順）',
    ジャンル行,
    '',
    '■ 曲を手に入れた年',
    年行,
    '',
    '■ 決まり',
    '・ジャンルは、**上の一覧にある名前をそのまま**使ってください。無い名前は使わない',
    '・年も、上にある年だけ。気分と関係なければ空でよい',
    '・ジャンルは 1〜5 個。多すぎると絞った意味がなくなります',
    '・曲数の少ないジャンルばかり選ばない。聴くぶんが残るようにしてください',
    '・「ひとこと」は日本語で 1 文。なぜそれを選んだかを、短く',
  ].join('\n');
}

/**
 * 返ってきたものを、実際のライブラリと照らし合わせる。
 *
 * ★ここが要。**AI の言うことをそのまま信じない。**
 * 一覧に無いジャンル名が返ることはある（言い換えたり、それらしい名前を作ったり）。
 * そのまま絞り込みに入れると **0 件になって「壊れた」ようにしか見えない。**
 * 実在するものだけ通し、落としたものは呼んだ側に返して画面に出す。
 *
 * ★大文字小文字は、3 カラムのまとめ方と同じ規則で見る（小文字にして比べる）。
 */
function 照らし合わせる(返事, 実在ジャンル, 実在年) {
  const 小 = (v) => String(v).toLocaleLowerCase('ja');
  const ジャンル表 = new Map(実在ジャンル.map((g) => [小(g), g]));
  const 年集合 = new Set(実在年.map(String));

  const 通す = (並び, 引く) => {
    const 通った = []; const 落ちた = [];
    for (const v of (Array.isArray(並び) ? 並び : [])) {
      if (typeof v !== 'string') continue;
      const 実物 = 引く(v.trim());
      if (実物 === null || 実物 === undefined) 落ちた.push(v);
      else if (!通った.includes(実物)) 通った.push(実物);
    }
    return { 通った, 落ちた };
  };

  const g = 通す(返事 && 返事.ジャンル, (v) => ジャンル表.get(小(v)) ?? null);
  const y = 通す(返事 && 返事.年, (v) => (年集合.has(v) ? v : null));

  return {
    ジャンル: g.通った,
    年: y.通った,
    ひとこと: (返事 && typeof 返事.ひとこと === 'string') ? 返事.ひとこと.trim() : '',
    // ★落としたものを黙らない。「AI はこう言ったが、手元に無かった」を出す
    無かったもの: [...g.落ちた, ...y.落ちた],
  };
}

/**
 * 実際に聞く。キーが無ければ聞かずに理由を返す。
 *
 * ★例外を外に投げない。**キーが無いだけでアプリが壊れてはいけない。**
 * @returns { ok: true, 結果 } | { ok: false, error }
 */
async function おすすめを聞く({ キー, 気分, ジャンル一覧, 年一覧 }) {
  if (!キー) return { ok: false, error: 'APIキーが設定されていません' };
  if (typeof 気分 !== 'string' || !気分.trim()) return { ok: false, error: '気分が空です' };
  if (!ジャンル一覧 || !ジャンル一覧.length) return { ok: false, error: 'ライブラリが読み込まれていません' };

  let Anthropic; let z; let zodOutputFormat;
  try {
    Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk');
    ({ z } = require('zod'));
    ({ zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod'));
  } catch (e) {
    return { ok: false, error: 'AI の部品が読み込めません（' + (e && e.message ? e.message : '不明') + '）' };
  }

  const かたち = z.object({
    ジャンル: z.array(z.string()),
    年: z.array(z.string()),
    ひとこと: z.string(),
  });

  try {
    const client = new Anthropic({ apiKey: キー });
    const 返り = await client.messages.parse({
      model: 使うモデル,
      max_tokens: 2000,
      system: 頼み文(ジャンル一覧, 年一覧),
      messages: [{ role: 'user', content: 気分.trim() }],
      /*
       * ★effort は low。
       * 一覧から選ぶだけの仕事なので、深く考えさせる必要がない。
       * 高くすると待ち時間と費用が増えるだけ。
       */
      output_config: { effort: 'low', format: zodOutputFormat(かたち) },
    });

    if (返り.stop_reason === 'refusal') {
      return { ok: false, error: 'AI が答えを断りました（' + (返り.stop_details && 返り.stop_details.category ? 返り.stop_details.category : '理由不明') + '）' };
    }
    if (!返り.parsed_output) return { ok: false, error: 'AI の返事を読み取れませんでした' };

    const 実在ジャンル = ジャンル一覧.map((g) => g.名前);
    return { ok: true, 結果: 照らし合わせる(返り.parsed_output, 実在ジャンル, 年一覧) };
  } catch (e) {
    /*
     * ★理由をそのまま返す。黙って「使えません」にしない。
     * キーが違うのか、繋がらないのか、上限に当たったのかで、直し方が全然違う。
     */
    const 名 = e && e.constructor ? e.constructor.name : '';
    if (名 === 'AuthenticationError') return { ok: false, error: 'APIキーが正しくないようです' };
    if (名 === 'RateLimitError') return { ok: false, error: '短い間に呼びすぎました。少し待ってからもう一度' };
    if (名 === 'APIConnectionError') return { ok: false, error: 'つながりませんでした（ネットワークを確認してください）' };
    return { ok: false, error: (e && e.message) ? e.message : '不明な失敗' };
  }
}

module.exports = { 使うモデル, ジャンル一覧を作る, 頼み文, 照らし合わせる, おすすめを聞く };
