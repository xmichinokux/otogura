/*
 * 言葉 ―― 日本語と英語を切り替える土台。
 *
 * ■ 本人の希望（2026-08-29 に決めた 3 つ）
 *   ・AI も英語で返す
 *   ・英語版の README も作る
 *   ・OS の言語を見て自動で切り替えたうえで、手動でも切り替えられる
 *
 * ■ ★鍵は「日本語そのもの」にする
 *
 * 訳の鍵に別の ID（'ai.playlist.failed' のような）を振るやり方もあるが、
 * この企画では**日本語を鍵にする。** 理由は 2 つ。
 *
 *  1. ★検査が 15 本あり、その多くが**日本語の文字列を当てにしている。**
 *     例: /一本を組めませんでした/.test(画面)
 *     鍵を日本語にすれば 言('一本を組めませんでした') はソースにその文字列を
 *     含むので、**検査がそのまま通る。** ID を振ると 15 本ぜんぶ書き換えになる。
 *
 *  2. 訳を書き忘れても、日本語がそのまま出るだけで**壊れない。**
 *     空欄や 'undefined' が出るより、ずっとまし。
 *
 * ■ ★差し込み
 * 「${成功} 曲を書き換えました」のような文が多いので、{名前} で受ける。
 *   言('{n} 曲を書き換えました', { n: 5 })
 *
 * ■ ★訳が無いときは、日本語を返す
 * 途中まで訳した状態でも動く。少しずつ進められる。
 */

/** いまの言葉。'ja' か 'en'。既定は日本語 */
let いまの言葉 = 'ja';

/**
 * OS の言葉から決める。
 * @param locale app.getLocale() の返り（'ja' / 'en-US' など）
 */
function 言葉を選ぶ(locale) {
  const s = String(locale || '').toLowerCase();
  /* ★日本語以外は英語にする。中途半端に日本語を出すより分かりやすい */
  return s.startsWith('ja') ? 'ja' : 'en';
}

/**
 * 言葉を決める。
 * @param 設定 'auto' / 'ja' / 'en'
 * @param locale OS の言葉（設定が 'auto' のときだけ使う）
 */
function 言葉を決める(設定, locale) {
  if (設定 === 'ja' || 設定 === 'en') return 設定;
  return 言葉を選ぶ(locale);
}

/** いまの言葉を入れ替える */
function 言葉を入れる(v) {
  いまの言葉 = (v === 'en') ? 'en' : 'ja';
  return いまの言葉;
}

/** いまの言葉 */
function いまの() { return いまの言葉; }

/** 英語か */
function 英語か() { return いまの言葉 === 'en'; }

/*
 * 訳。鍵は日本語そのもの。
 * ★ここに無いものは、日本語のまま出る（壊れない）。
 */
const 訳 = {
  en: {
    /* ── AI の欄 ── */
    '一本を組む': 'Build a set',
    '辿る': 'Trace',
    'いまの気分を書く': 'How are you feeling?',
    '言葉を 1 つ入れて辿る': 'Enter one word to trace',
    '🛠 整える ▼': '🛠 Tidy up ▼',
    '🛠 整える ▲': '🛠 Tidy up ▲',
    '⏹ 止める': '⏹ Stop',
    '止めています…': 'Stopping…',
    '止めました（何も作っていません）': 'Stopped. Nothing was created.',
    'だめでした': 'Failed',
    '聞いています…': 'Asking…',
    '🌀 拡大解釈 入': '🌀 Wide reading: on',
    '🌀 拡大解釈 切': '🌀 Wide reading: off',
    'ジャンル名をまとめる': 'Group genre names',
    'ジャンル名をまとめ直す': 'Re-group genre names',
    'まとめをやめる': 'Undo grouping',
    'ジャンル名無しを埋める': 'Fill in missing genres',
    '手直しを見る': 'Show my edits',
    '手直しを捨てる': 'Discard my edits',
    'しまう': 'Save',
    'やめる': 'Cancel',
    'はい': 'Yes',
    '閉じる': 'Close',
    'これでまとめる': 'Group them',
    'これで入れる': 'Fill them in',

    /* ── つまみ ── */
    '狭い': 'Narrow',
    '広い': 'Wide',
    '王道': 'Classic',
    '外す': 'Off-centre',
    'やや狭い': 'Somewhat narrow',
    'やや広い': 'Somewhat wide',
    'ふつう': 'Middle',
    'やや王道': 'Somewhat classic',
    'やや外す': 'Somewhat off-centre',
    '少なめ': 'Few',
    'やや少なめ': 'Somewhat few',
    'やや多め': 'Somewhat many',
    '多め': 'Many',
    '対象の幅 ― どれだけ広い範囲から選ぶか': 'Range — how wide a pool to choose from',
    '選出の量 ― 何曲の一本にするか': 'Amount — how many songs in the set',
    '文脈の強度 ― 王道を守るか、外すか': 'Context — stay classic, or go off-centre',

    /* ── よく出る短いもの ── */
    '不明': 'unknown',
    'ジャンル': 'Genre',
    'アーティスト': 'Artist',
    'アルバム': 'Album',
    '言葉': 'Word',
    '演者': 'Artist',
    '盤': 'Album',
    '年': 'Year',
    '月': 'Month',
    '日': 'Day',
    'ジャンル（まとめ）': 'Genre (grouped)',
    'すべて': 'All',
    'ライブラリ': 'Library',

    /* ── 差し込みのあるもの ── */
    'APIキーが設定されていません': 'No API key has been set',
    '{n} 曲から組んでいます…': 'Building from {n} song…|Building from {n} songs…',
    '組む範囲: ': 'Building from: ',
    '（ライブラリ全部）': '(the whole library)',
    '絞り込みを全部外しました（ライブラリ全体に戻っています）':
      'Cleared every filter. You are back to the whole library.',
    '✕ 絞りを外す（{n}）': '✕ Clear filters ({n})',
    '{n} 曲': '{n} song|{n} songs',
    '手直しを捨てる（{n} 曲）': 'Discard my edits ({n})',

    /* ★残っていたぶん */
    '・★その気分の**ど真ん中は避けて**、意外な角度から選んでください':
      "- ★**Avoid the dead centre** of that mood. Choose from an unexpected angle",
    '　まず思いつくものは、この人はもう知っています': "  Whatever comes to mind first, they already know",
    '　★**1〜2 枚しか持っていない演者を積極的に**選んでください。': "  ★Actively pick **artists they own only one or two albums by**.",
    '　枚数を多く持っている演者は、もう聴いています': "  The ones with many albums, they have already heard",
    '　（曲数は見ないでください。1 枚しか無くても曲数が多いことがあります）': "  (ignore song count: a single disc can still hold many tracks)",
    '・★次の {n} 個は**もう挙げています。二度と挙げないでください**:': "- ★These {n} have **already been named. Never name them again**:",

    /* ★画面の文言（0.33.0） */
    '辿った言葉 {n} 本': "{n} words followed",
    '🔀 一本を組む': "🔀 Build a set",
    'この言葉で辿ったものだけから、AI が厳選して並べます（勝手には流れません）':
      "Builds only from what this word found — the AI picks and orders (nothing starts playing on its own)",
    '・★**数より近さが先です。** 少なくて構いません': "- ★**Closeness comes before quantity.** A short list is fine",
    '　上の一覧にある名前でも、無い名前でも構いません。**近さだけで選んでください**':
      "  On the list above or not, it does not matter. **Choose on closeness alone**",
    '　★一覧はこの人の蔵書です。**そこに寄せて選ぶと、軸から外れます**': "  ★That list is what they own. **Leaning on it pulls you off the axis**",
    '・★**近さを優先**してください。数は二の次です': "- ★**Put closeness first.** Quantity is secondary",
    '　上の一覧にある名前を選んで構いませんが、近くないなら入れないでください':
      "  You may pick from the list above, but leave out anything that is not close",
    '　※ AI は {挙げた} 組挙げましたが、手元にあったのは {あった} 組でした': "　* The AI named {挙げた} artists; you own {あった} of them",
    '（{名前} などは持っていません）': "({名前} and others are not in your library)",
    '（この気分で手元にあったのが {n} 組なので、{n} 曲にしました）': "(you own {n} artists that fit, so the set is {n} songs)",
    '・★挙げる演者は、**その音そのもののど真ん中**に留めてください': "- ★Keep the artists you name **right at the centre of that sound**",
    '　「〇〇といえばこれ」と並べられる、同じ棚に置ける演者だけです':
      "  Only artists that belong on the same shelf — the ones anyone would name first",
    '・★**近い界隈へ広げないでください。** 影響元・影響先・共演者は、まだ遠い':
      "- ★**Do not reach into neighbouring scenes.** Influences, descendants and tourmates are still too far",
    '・挙げる演者は、**その音の中心**から選んでください': "- Name artists from **the centre of that sound**",
    '・近い界隈へは、ほんの少しだけ': "- Reach into neighbouring scenes only a little",
    '・挙げる演者は、その音を軸に、**近い界隈まで**でよい': "- Work out from that sound, **as far as the neighbouring scenes**",
    '・挙げる演者は、**近い界隈から少し外れたところ**まで広げてよい': "- You may reach **a little past the neighbouring scenes**",
    '　同じ気配を別のやり方でやっている演者を入れてください': "  Include artists chasing the same feeling by other means",
    '・挙げる演者は、**思い切って外して**構いません': "- **Go well off-centre** with the artists you name",
    '　ジャンルも時代も跨いで、気配だけが通じるものを': "  Across genres and eras — only the feeling has to carry over",
    '演者 {n} 組: {名前} ほか': "{n} artists: {名前} and others",
    '・★**「Rock」「Alternative」のような大まかな名前は避けてください。**': "- ★**Avoid catch-all names like \"Rock\" or \"Alternative\".**",
    '　もっと具体的な名前が一覧にあるなら、そちらを選んでください': "  If the list has something more specific, choose that instead",
    '■ 演者について': "■ About artists",
    '・その気分に**近い演者を 80 組**挙げてください。あなたの知識から': "- Name **80 artists close to that mood**, from your own knowledge",
    '・手元にあるかどうかは気にしないでください。こちらで突き合わせます': "- Do not worry about whether they own them. We check that on our side",
    '・★気分の文に**バンド名が入っていたら、そこを最優先**にしてください。': "- ★If they named a band, **make that the first thing you go on.**",
    '　その演者そのものと、鳴りの近い演者を挙げます': "  Name that artist and others that sound close to them",
    '・ジャンル名では言い表せないもの（音の質感、時代、界隈）は、ここで効きます':
      "- What a genre name cannot carry — the texture, the era, the scene — belongs here",
    '（同じ演者・同じ盤が {n} 曲重なっていたので落としました）': "({n} repeated the same artist or album, so they were dropped)",
    '・★候補は**演者ごとにまとまっています**（同じ演者の曲が続けて並んでいます）':
      "- ★The list is **grouped by artist** — an artist's songs run together",
    '　★**1 組から選ぶのは 1 曲だけ。** どの曲にするかを選んでください':
      "  ★**Take only one song from each group.** Your job is to choose which one",
    '・★候補には**同じ演者の曲が何曲か**並んでいます。その中から 1 曲選んでください':
      "- ★The list holds **several songs by the same artist.** Pick one of them",
    '　★**その演者の核となる曲**を選んでください。よく知られた曲、代表曲です': "  ★Choose **that artist's core song** — the one they are known for",
    '　深いところの曲は、**ときどき味付けに**。全部が深い曲だと、通して聴けません':
      "  Deep cuts belong there **now and then, as spice**. All deep cuts and no one can sit through it",
    '／手元に無かったもの: ': "／ not in your library: ",
    '画面': "the screen",
    '処理': "a background job",
    '要らない組はチェックを外してください。外したものは元の名前のまま残ります。':
      "Uncheck any group you do not want. Whatever you uncheck keeps its original name.",
    '要らない組はチェックを外してください。': "Uncheck any group you do not want.",
    '。手直し.json に残してあるので、消せば元通りになります': ". It is kept in 手直し.json, so deleting that puts everything back",
    '同じ演者の別の曲に付いているジャンルです。推測ではありません': "Taken from another song by the same artist. This is not a guess",
    '手元に手がかりが無かったぶんです。多少の外れはあります': "Nothing in your library pointed the way, so some of these will be off",
    '入れたぶんは 手直し.json に残ります。消せば元通りになります': "What was filled in is kept in 手直し.json. Delete it to put everything back",
    '画面と AI の言葉。いまは OS に合わせています（押すと 自動→日本語→English）':
      "The language of the screen and of the AI. Right now it follows your OS (press to cycle Auto→Japanese→English)",
    '画面と AI の言葉（押すと 自動→日本語→English）':
      "The language of the screen and of the AI (press to cycle Auto→Japanese→English)",
    '後半は遠くの文脈まで飛びます。飛んだ先で何を選ぶかは、文脈の強度が決めます':
      "Later in the set it jumps to distant contexts. What it picks once it lands is decided by the context strength",
    '最後まで同じ文脈を保ちます': "It stays in the same context all the way through",
    '（この範囲はこれで全部です）': "(that is everything in this range)",
    '（すべて別の演者です）': "(every one a different artist)",
    '　※ 同じ言葉でもう一度「辿る」と、演者を増やせます': "　* Follow the same word again to turn up more artists",
    '別々の言葉が同じ名前を指すのは偶然ではありません。': "When separate words point at the same name, that is not a coincidence.",
    'その人の中で、いくつもの筋がそこへ通じているということです。': "It means several threads inside that person lead there.",
    '★言葉を辿るほど増えます（1 本目では起きません）。選ばれやすさも上がります。':
      "The more words you follow, the more of these appear (never on the first). They are also picked more readily.",
    '演者名だけでなく、盤名・曲名にも当ててみて、それでも見つからなかったものだけ出しています。':
      "Matched against album and song titles as well as artist names, and only what still could not be found is shown.",
    'それでも「持っているのに書かれ方が違う」「AI の思い違い」は残ります。':
      "Even so, some are spelled differently in your library, and some are simply the AI being wrong.",
    '買う前に確かめてください。': "Check before you buy.",
    '入口を持っていません（意外な穴）': "You have no way in (an unexpected gap)",
    'まだ辿り着いていない場所（探索の先端）': "Not reached yet (the far edge)",
    '辿った日: ': "Followed on: ",
    '交差 {n}': "Crossings {n}",
    '確かめる候補 {n}': "Worth checking {n}",
    'それでも無かったものだけ出しています（買い物リストではありません）': "Only what still could not be found is shown (this is not a shopping list)",
    '響き': "Resonance",
    '{n} 本': "{n} words",
    '{n} つの言葉から辿り着きました': "Reached from {n} words",
    '　▶ で流せます。🔀 を押すとこの範囲でシャッフルします': "　▶ plays them. Press 🔀 to shuffle within this range",
    '元のジャンルに戻ります。曲は消えません。': "The original genres come back. No songs are deleted.",
    '（いま見えているぶんは、印だけ外しました）': "(for what is on screen, only the marks were cleared)",
    '元のジャンル名はそのまま残っているので、完全に元通りになります。':
      "The original genre names were never touched, so everything goes back exactly as it was.",
    '（絞り込みなし）': "(no filter)",
    'ジャンル / アーティスト / アルバム': "Genre / Artist / Album",
    '日付（年 / 月 / 日）': "Date (Year / Month / Day)",
    'くじに戻す': "Back into the draw",
    'くじに入れない': "Out of the draw",
    'くじで選ばれるように戻します': "Puts it back into the shuffle draw",
    '一覧には残り、押せば鳴ります。くじで選ばれなくなるだけです':
      "It stays in the list and still plays when you click it. It just stops being drawn by shuffle",
    '上のジャンル・アーティスト・アルバムで絞ると、全部見えます。': "Narrow with Genre, Artist or Album above to see them all.",
    '作る': "Create",
    '変える': "Rename",
    '書き込む': "Write",
    '　途中でやめられません。曲数が多すぎるときは、上の3カラムで絞ってからにしてください。':
      "　There is no stopping partway. If there are too many songs, narrow with the three columns above first.",
    'タグを書き換えられません。飛ばします。': "their tags cannot be rewritten, so they are skipped.",
    'ファイルは壊れていません。再生はできます。': "The files are not damaged. They still play.",
    '・AI DJ と Resonance の候補にも入りません': "- They are also left out of the AI DJ and Resonance pools",
    '・曲は消えません。あとから戻せます': "- No songs are deleted. You can undo this later",
    '🔑 APIキーを消す': "🔑 Delete the API key",
    'この PC にしまってある Anthropic の API キーを消します（曲は何も変わりません）':
      "Deletes the Anthropic API key kept on this PC (nothing about your songs changes)",
    '流せる曲がありません（この範囲は鳴らせない曲だけです）': "There is nothing to play (this range holds only songs that cannot be played)",
    '流せる曲がありません': "There is nothing to play",
    '最後まで再生しました': "Played to the end",
    '読み込みが中断された': "the load was interrupted",
    'ファイルを読めなかった': "the file could not be read",
    'ファイルが壊れている': "the file is damaged",
    'この形式は再生できない': "this format cannot be played",
    '🔁 1曲': "🔁 One song",
    '🔁 全体': "🔁 All",
    '🏷 タグ無しも出す': "🏷 Show untagged",
    '🔊 そのまま': "🔊 As recorded",
    '🔀 オン': "🔀 On",
    ' ／ 途中で閉じても、次に開いたとき続きから進みます': " ／ you can close partway; it picks up from here next time",
    '読み込み中…': "Loading…",
    '■ 止める': "■ Stop",
    '読み込みを途中で止めます。★そこまで読んだぶんは残るので、次は続きから進みます':
      "Stops the scan partway. What it has read so far is kept, so next time it picks up from there",
    'フォルダをもう一度読み込みます': "Reads the folders again",
    '数えています': "Counting",
    '数えました': "Counted",
    'はじめて見るものを先に読みます': "Reading the new ones first",
    '読んでいます': "Reading",
    '止めました': "Stopped",
    '読み終えました': "Finished reading",
    '曲でないものを {n} 件はずしました': "Dropped {n} items that are not songs",
    '{欄}を書き込む': "Write {欄}",
    '　※ {n} 曲だと、おおよそ {秒} 秒かかります。': "　* {n} songs will take roughly {秒} seconds.",
    '　※ このうち {n} 曲は MP3 ではないので（m4a など）、': "　* Of these, {n} are not MP3s (m4a and the like), so",
    '{n} 曲の MP3 ファイルを書き換えます。': "This rewrites the MP3 files of {n} songs.",
    'ファイルそのものが書き換わります（音のデータは変わりません）。': "The files themselves are rewritten (the audio data is untouched).",
    'よろしいですか？': "Go ahead?",
    '（うまくいかなかったもの {n}）': "({n} failed)",
    '　⚠ ただし、覚え書きに残せませんでした（{理由}）。': "　⚠ But it could not be written to the cache ({理由}).",
    'このまま閉じると、次に開いたとき古い内容に戻って見えます。': "If you close now, the old contents will be back next time you open it.",
    '「再スキャン」を最後まで走らせると直ります。': "Running \"Rescan\" to the end fixes it.",
    '（うち {n} 曲は一覧に見当たらず、表示を更新できませんでした）': "({n} of them were not in the list, so the display could not be updated)",
    'まとめて解除': "Deselect all",
    'まとめて選択（{n}）': "Select all ({n})",
    '（うち {n} 曲は、いまの絞り込みでは見えていません）': "({n} of them are not visible under the current filter)",
    '選んだ {n} 曲のタグを直す{但し}': "Edit tags on the {n} selected{但し}",
    '選んだ {n} 曲をシャッフルに入れない': "Keep the {n} selected out of shuffle",
    '選んだ {n} 曲をシャッフルに戻す': "Put the {n} selected back into shuffle",
    '「{名}」': "\"{名}\"",
    '{n} 組': "{n} artists",
    '{名前}を自分の音源にする（{n} 曲）': "Mark {名前} as your own music ({n} songs)",
    '{名前}を自分の音源から戻す（{n} 曲）': "Unmark {名前} as your own music ({n} songs)",
    'この演者の {n} 曲を「自分の音源」にします。': "Marks the {n} songs by this artist as your own music.",
    '・一覧には残ります。押せば鳴ります': "- They stay in the list. They still play when you click them",
    '・シャッフルのくじに入りません': "- They are left out of the shuffle draw",
    '（{n} 曲。一覧には残っています）': "({n} songs. They stay in the list)",
    '（{n} 曲。またくじに入ります）': "({n} songs. They are back in the draw)",
    '選んだ {n} 曲を一覧から外す': "Remove the {n} selected from the list",
    '{n} 曲を一覧から外します。': "This removes {n} songs from the list.",
    'ファイルは削除されません。一覧に出なくなるだけです。': "The files are not deleted. They simply stop appearing in the list.",
    '（「外したものを戻す」で戻せます）': "(you can undo this with \"Put back what you removed\")",
    '選んだ {n} 曲を追加': "Add the {n} selected",
    '{n} 曲は元のファイルが見当たりませんでした': "the original files of {n} songs were missing",
    '{n} 曲は運べませんでした': "{n} songs could not be copied",
    'この一本に無いファイルが {n} 個、先に残っています（消していません）': "{n} files not in this set are still there (they were not deleted)",
    '　※ {但し}': "　* {但し}",
    '　スマホに繋いで、このフォルダごとコピーしてください（{題} を開けば並び順どおりに鳴ります）':
      "　Connect your phone and copy this whole folder (opening {題} plays them in order)",
    '再生リスト「{名}」を削除しますか？': "Delete the playlist \"{名}\"?",
    '曲のファイルは削除されません。': "The song files are not deleted.",
    'この形式': "this format",
    '{形式} は音蔵では鳴らせません': "Otogura cannot play {形式}",
    '（鳴らせない {n} 曲を飛ばしました）': "(skipped {n} songs that could not be played)",
    '鳴らせない曲が {n} 曲続いたので止まりました': "Stopped after {n} songs in a row could not be played",
    'コード {code}': "code {code}",
    '{n} 曲（タグが無く非表示 {隠れる} 件）': "{n} songs ({隠れる} hidden for having no tags)",
    '{n} 曲（タグの無い {隠れる} 件も出しています）': "{n} songs (including {隠れる} with no tags)",
    '（あと {n} 秒ほど）': "(about {n} seconds left)",
    '（あと {n} 分ほど）': "(about {n} minutes left)",
    '（あと {n} 時間ほど）': "(about {n} hours left)",
    '{n} 分前': "{n} minutes ago",
    '{n} 秒前': "{n} seconds ago",
    '{何分}に始まり、まだ終わっていません。': "It started {何分} and has not finished.",
    '終わるまで、もう一度は始められません（一覧が二重になるため）。': "You cannot start it again until it finishes (the list would be doubled).",
    '進み具合は画面の下端に出ています。': "The progress is shown at the bottom of the screen.",
    '足したファイルは、この確認が終わったときに一覧へ入ります。': "Files you added join the list when this check finishes.",
    '{n} 曲（確かめています…）': "{n} songs (checking…)",
    '⚠ 音楽フォルダが登録されていません。下の「＋ フォルダを足す」から入れてください':
      "⚠ No music folder is registered. Add one with \"＋ Add a folder\" below",
    '　（いま出ている {n} 曲は、前に読んだ記録です）': "　(the {n} songs shown are from an earlier scan)",
    'タグが無く非表示 {n} 件': "{n} hidden for having no tags",
    '読めなかった {n} 件': "{n} could not be read",
    '理由: {理由}': "Reason: {理由}",
    'このままだと、次に開いたときに**また最初から読み直し**になります。':
      "As it stands, the next time you open it **everything is read from scratch again**.",
    'ディスクの空きを確かめてください。': "Check that you have free disk space.",
    '一覧から外した {n} 件': "{n} removed from the list",
    '変わっていない {n} 件は読み直していません': "{n} unchanged were not read again",
    '　■ 途中で止めました（次は続きから進みます{補い}）': "　■ Stopped partway (it picks up from here next time{補い})",
    ' ／ まだ見ていない {n} 曲は前の記録から出しています': " ／ the {n} not yet seen are shown from the earlier scan",
    '響き {n} 本を読みました ― {組} 組・{曲} 曲が手元にありました': "Read {n} resonance trees — {組} matches, {曲} songs you own",
    '響き {n} 本を読みましたが、手元に当たるものがありませんでした（音楽の言葉で辿った木だと当たります）':
      "Read {n} resonance trees, but nothing matched your library (trees followed with musical words do match)",
    '一覧から外した {n} 曲を、すべて戻します。': "This puts back all {n} songs you removed from the list.",
    '　ほか {n} 曲': "　and {n} more",
    '（{n} 曲は読めませんでした）': "({n} could not be read)",
    '言葉を OS に合わせます（いまは {言葉}）': "The language follows your OS (currently {言葉})",
    '言葉を {言葉} にしました': "Language set to {言葉}",
    '日本語': "Japanese",
    '元の場所: {場所}': "Where it was: {場所}",
    'データは消えていません。上の場所に残っています。': "Your data is not gone. It is still in the place named above.",
    'このまま使うと、フォルダの登録からやり直しになります。': "If you carry on, you will have to register your folders again.",
    '以前のデータを引き継ぎました（{n} 件）': "Carried over your earlier data ({n} items)",
    '{n} 曲（前回のぶん。いま確かめています…）': "{n} songs (from last time. Checking now…)",
    '手直しの置き場を開きました: {場所}': "Opened the folder holding your edits: {場所}",
    '⚠ 開けませんでした: {理由}': "⚠ Could not open it: {理由}",
    '手直し {n} 曲ぶんを、丸ごと捨てます。': "This throws away all your edits, covering {n} songs.",
    'ジャンルのまとめ（{n} 組）を捨てます。': "This throws away the grouping ({n} groups).",
    '🏷 ジャンル（まとめ {n} 組）': "🏷 Genre (grouped into {n})",
    '🌐 響き（{n} 組）': "🌐 Resonance ({n})",
    '合うもの（{n}）': "Matches ({n})",
    'すべて（{n}）': "All ({n})",
    '　― {n} 個を選択中': "　— {n} selected",
    '「{名}」を一覧から外しますか？': "Remove \"{名}\" from the list?",
    '場所: {場所}': "Where: {場所}",
    'ファイルは削除されません。': "The file itself is not deleted.",
    '（上から {n} 曲を表示中）': "(showing the first {n})",
    '{曲数}（再生リスト「{名}」）': "{曲数} (playlist \"{名}\")",
    '合う再生リスト（{n} / {全体}）': "Matching playlists ({n} / {全体})",
    '再生リスト（{n}）': "Playlists ({n})",
    "いま確かめている最中です。\n\n": "Still checking.\n\n",
    "読み込んだ結果を保存できませんでした。\n\n": "The scan results could not be saved.\n\n",
    '上の欄に API キーを貼り付けてください（console.anthropic.com で作れます）':
      "Paste your API key in the box above (you can make one at console.anthropic.com)",
    "以前のデータを引き継げませんでした。\n\n": "Your earlier data could not be carried over.\n\n",
    "辿ったものを全部忘れますか？\n\n曲は何も変わりません。": "Forget everything you have followed?\n\nNothing about your songs changes.",
    'Anthropic の API キーを貼り付けて Enter': "Paste your Anthropic API key and press Enter",
    '手直し.json のある場所を開きます（中を見て、直したり消したりできます）':
      "Opens the folder holding 手直し.json — you can look inside, edit it or delete it",
    'ジャンルの付いていない曲に、ジャンルを入れます（まず手元で決め、決まらないぶんだけ AI に訊きます。手直し.json に残るので消せば元通り）':
      "Fills in a genre for songs that have none. It decides from your library first and asks the AI only for the rest. It is kept in 手直し.json, so deleting that puts everything back",
    "選んだ曲は MP3 ではないので（m4a など）、タグを書き換えられません。\n":
      "The songs you chose are not MP3s (m4a and the like), so their tags cannot be rewritten.\n",
    "APIキーを消しますか？\n\n「気分から一本を組む」と「言葉から辿る」が使えなくなります。\n曲は何も変わりません。":
      "Delete the API key?\n\nBuilding a set from how you feel, and following a word, will stop working.\nNothing about your songs changes.",
    "この環境では、キーを暗号化して保存できません。\n平文で保存はしないので、この機能は使えません。":
      "This machine cannot store the key encrypted.\nIt will not be stored in plain text, so this feature is unavailable.",
    'まとめなかった名前 {n} 個は、そのまま残ります': "{n} names were not grouped and stay as they are",
    'AI が挙げた {n} 個は手元に無い名前だったので外しました': "{n} names the AI gave are not in your library, so they were dropped",
    '{n} 個は二重だったので先の組に入れました': "{n} were duplicates and went into the earlier group",
    '（{n} 曲ぶん）。元のジャンル名はそのまま残っています': "(covering {n} songs). The original genre names are untouched",
    '（手元で {手元} 曲、AI で {AI} 曲）': "({手元} from your library, {AI} from the AI)",
    '◆ 手元で決まったもの（{n} 曲）': "◆ Decided from your library ({n} songs)",
    '◆ AI が当てたもの（{n} 曲）': "◆ Guessed by the AI ({n} songs)",
    'AI が挙げた {n} 個は手元に無いジャンル名だったので外しました': "{n} genre names the AI gave are not in your library, so they were dropped",
    '{n} 組は AI も見当が付きませんでした（そのままです）': "The AI had no idea about {n} of them (left as they are)",
    '　文脈は「{札}」': "　context: \"{札}\"",
    '　→ {n} 曲の一本（目安 {円} 円）': "　→ a {n}-song set (about ¥{円})",
    'ほか{n}': "+{n} more",
    '　※ いま「{名}」を聴いていますが、組む元はライブラリです': "　* You are listening to \"{名}\", but the set is built from the library",
    '（{n} 件は候補に無くて落としました）': "({n} were not among the candidates and were dropped)",
    '（候補が {候補} 曲しかないので {頼んだ} 曲にしました。対象の幅を広げると増やせます）':
      "(only {候補} candidates, so it was cut to {頼んだ}. Widen the range to get more)",
    '（{重なり} 組が 2 曲以上 ― この範囲には {n} 組しかいません）':
      "({重なり} artists appear twice or more — there are only {n} in this range)",
    '　※ この範囲は {n} 曲で全部なので、対象の幅を広げても増えません': "　* This range holds only {n} songs, so widening it will not add more",
    '（{すでに} 個に足して、いま {全部で} 個）': "(added to {すでに}, now {全部で})",
    '　手元にあった {n} 個: {名前}': "　{n} you own: {名前}",
    '　／ 手元に無い {n} 個（発見）: {名前}': "　／ {n} you do not own (discoveries): {名前}",
    '［{n} 本の言葉から: {言葉たち}］': "[from {n} words: {言葉たち}]",
    '［「{言葉}」から］': "[from \"{言葉}\"]",
    '「{言葉}」で辿ったものを消しますか？': "Forget what \"{言葉}\" found?",
    '曲は何も変わりません。': "Nothing about your songs changes.",
    '⚠ まとめられませんでした: ': "⚠ Could not group them: ",
    '⚠ まとめを覚えられませんでした': "⚠ Could not save the grouping",
    '⚠ 振り分けられませんでした: ': "⚠ Could not fill them in: ",
    '⚠ 手直しを覚えられませんでした': "⚠ Could not save your edits",
    '⚠ 一本を組めませんでした: ': "⚠ Could not build a set: ",
    '⚠ 辿れませんでした: ': "⚠ Could not follow that: ",
    '⚠ 絞り込めませんでした: ': "⚠ Could not narrow it down: ",
    '⚠ 持ち出せませんでした: ': "⚠ Could not copy them out: ",
    '⚠ 先に APIキーを入れてください': "⚠ Enter your API key first",
    '読み込めませんでした: ': "Could not load it: ",
    '読めませんでした: ': "Could not read it: ",
    '名前を変えられませんでした（': "Could not rename it (",
    '消せませんでした（': "Could not delete it (",
    'しまえませんでした（': "Could not save it (",
    'AI が曲を選べませんでした': "The AI could not choose any songs",
    'ジャンルのまとめはやめました（何も変わっていません）': "Grouping cancelled (nothing changed)",
    'ジャンルの振り分けはやめました（何も変わっていません）': "Filling in cancelled (nothing changed)",
    'この範囲には、組める曲がありません': "There are no songs to build from in this range",
    'この範囲は、全部シャッフルから外してあります': "Everything in this range is kept out of shuffle",
    '響きから組んでいます…': "Building from these…",
    '響きを外しています…': "Clearing…",
    '響きを全部外しました': "Cleared everything you had followed",
    'いま絞っている範囲から組みます…': "Building from the range you have narrowed to…",
    '手直しを捨てました。次に開くと、元のジャンルに戻ります': "Your edits are gone. Next time you open it, the original genres are back",
    'ジャンルのまとめを捨てました（元のジャンル名に戻っています）': "The grouping is gone (the original genre names are back)",
    'APIキーをしまいました。上の欄に気分を書けます': "API key saved. You can write how you feel in the box above",
    'APIキーを消しました': "API key deleted",
    '読み直しています…': "Reloading…",
    '外しています…': "Removing…",
    '戻しています…': "Putting them back…",
    '📱 持ち出す先を選んでください…': "📱 Choose where to copy them…",
    'まとめられるジャンル名がありません。先にフォルダを走査してください。': "There are no genre names to group. Scan a folder first.",
    'まとめられる組が見つかりませんでした。いまのままで十分ばらけていないようです。':
      "No groups worth making were found. They do not look scattered enough as they are.",
    'ジャンルの付いていない曲はありません。': "There are no songs without a genre.",
    '合うものがありません': "Nothing matches",
    '🔀 オフ': "🔀 Off",
    '🔀 この響きで一本を組む': "🔀 Build a set from these",
    '× 全部外す': "× Clear all",
    '深さ': "Depth",
    '＋ 新しい再生リスト': "＋ New playlist",
    'm3u を読み込む': "Load an m3u",
    'm3u で保存': "Save as m3u",
    '📱 スマホへ持ち出す': "📱 Copy to a phone",
    '名前を変える': "Rename",
    'この再生リストを削除': "Delete this playlist",
    '選択を解除': "Clear the selection",
    'この曲を外す': "Remove this song",
    '一覧から外す': "Remove from the list",
    '再生リストの名前': "Playlist name",
    '（変えない）': "(leave as is)",
    '上へ': "Up",
    '下へ': "Down",
    '交差 ― いくつもの言葉から辿り着いた名前です。': "Crossings — names reached from several words.",
    '確かめる候補 ― 手元で見つからなかった名前です。': "Worth checking — names not found in your library.",
    '※ MP3 ファイルそのものを書き換えます（空欄は変えません）': "* This rewrites the MP3 files themselves (blank fields are left alone)",
    '辿った言葉': "Word followed",
    '曲名': "Title",
    '長さ': "Length",
    '日付': "Date",
    '再生': "Plays",
    '並べ替え': "Reorder",
    'この 1 件を履歴から消す': "Remove this one from the history",
    '何を見渡すか。AI に渡す候補の曲数・辿る名前の数・選ばせるジャンル数が、いっしょに変わります':
      "How wide to look. The number of candidate songs, names followed and genres offered all move together",
    '一本を何曲にするか': "How many songs in the set",
    'その言葉・気分の王道を守るか、外すか。外すほど深く考えさせるので、少し高くなります':
      "Stay with the classics of that mood, or step away. Stepping away makes it think harder, so it costs a little more",
    'この言葉の名前を変える': "Rename this word",
    'この言葉で辿ったものを消す（音楽ファイルには触りません）': "Forget what this word found (your music files are untouched)",
    'いくつもの言葉から辿り着いた名前です。言葉を辿るほど増えます':
      "Names reached from several words. The more words you follow, the more of these appear",
    '手元で見つからなかった名前です。演者名だけでなく盤名・曲名にも当てて、':
      "Names not found in your library. Matched against album and song titles as well as artists, ",
    'いま響きで選ばれている曲から、AI が厳選して並べます（勝手には流れません）':
      "The AI picks and orders from the songs found this way (nothing starts playing on its own)",
    '辿ったものを全部忘れます（音楽ファイルには触りません）': "Forget everything you have followed (your music files are untouched)",
    '書いた気分に合うジャンルに絞って、そこから 30 曲の一本を組みます':
      "Narrows to the genres that fit what you wrote, then builds a 30-song set from them",
    'その言葉から辿れる音楽を探し、手元にあったものを響きタブに集めます（一本は組みません）':
      "Looks for music that word leads to and gathers what you own into the Resonance tab (it does not build a set)",
    '散らかったジャンル名を、見て回りやすい大きさにまとめます（元の名前も mp3 のタグも変えません）':
      "Groups scattered genre names into a size you can browse (neither the original names nor the mp3 tags are changed)",
    'まとめを捨てて、元のジャンル名だけに戻します': "Drops the grouping and goes back to the original genre names",
    '手直しを丸ごと消して、元のジャンルに戻します': "Deletes all your edits and goes back to the original genres",
    'ジャンル名をまとめる・ジャンル名無しを埋める・手直しの出し入れ': "Group genre names, fill in the blank ones, and manage your edits",
    '走っている生成を途中で切ります（そこまでに使ったぶんは請求されます）': "Cuts off the run in progress (you are still billed for what it used)",
    '見えていないタブのぶんも含めて、絞り込みを全部外します': "Clears every filter, including the tabs you cannot see",
    'ドラッグで幅を変える': "Drag to change the width",
    'ドラッグして並べ替え': "Drag to reorder",
    'クリックで再生': "Click to play",
    'スキャン対象から外す': "Stop scanning this folder",
    '暗号化してこの PC の中だけに保存します。送るのはジャンル名と気分の文だけです':
      "Encrypted and kept on this PC only. Only genre names and what you write are sent",
    '⚠ {何が}でエラー: {文}': "⚠ Error in {何が}: {文}",
    'AI が {組} 組にまとめました（{曲} 曲ぶん）。': "The AI made {組} groups (covering {曲} songs).",
    '（{名前} 個 / {曲} 曲）': "({名前} names / {曲} songs)",
    '{n} 種類のジャンル名をまとめています…': "Grouping {n} genre names…",
    'ジャンルを {n} 組にまとめました': "Grouped the genres into {n}",
    '{n} 組を AI に訊いています…': "Asking the AI about {n} groups…",
    '{n} 曲にジャンルを入れました': "Filled in the genre for {n} song|Filled in the genre for {n} songs",
    'ジャンルの付いていない {n} 曲に、ジャンルを入れます。': "Filling in a genre for {n} songs that have none.",
    '（{n} 曲）': "({n} song)|({n} songs)",
    'この履歴を全部消す（{n} 件）': "Clear this history ({n})",
    '{種}の履歴を全部消しました': "Cleared the {種} history",
    '気分': "mood",
    '候補 {候補} 曲 ／ 辿る名前 {名前} 個 ／ ジャンル {ジャンル} まで': "{候補} candidate songs ／ {名前} names followed ／ up to {ジャンル} genres",
    'AI が {n} 曲の一本を組みました: 「{名}」{添え}　▶ で頭から流れます': "The AI built a {n}-song set: \"{名}\"{添え}　▶ plays it from the top",
    '「{言葉}」から辿っています…': "Following \"{言葉}\"…",
    '「{言葉}」から {n} 個{積み} ― 手元に {あった} 個': "\"{言葉}\" led to {n}{積み} — you own {あった}",
    '🌐「{言葉}」から {n} 個辿りました{積み}': "🌐 \"{言葉}\" led to {n}{積み}",
    '{n} 曲　［{言葉たち}］': "{n} songs　[{言葉たち}]",
    '{組} 組・{曲} 曲': "{組} matches・{曲} songs",
    '「{言葉}」を消しました': "Deleted \"{言葉}\"",
    '🌐「{言葉}」で絞りました（{n} 曲）': "🌐 Narrowed by \"{言葉}\" ({n} songs)",
    'AI が選んだ範囲: {選んだ} ― {n} 曲{無し}　この中から一本を組んでいます…': "The AI chose: {選んだ} — {n} songs{無し}　building a set from these…",
    'このタブで {n} 個選んだままです（絞り込みは効いています）': "{n} still selected on this tab (the filter is active)",
    'ほかに {n} 件（上の欄で絞り込んでください）': "{n} more (narrow it down in the box above)",
    '{n} 件から探す': "Search {n} items",
    '{label}で並べ替え': "Sort by {label}",
    'ほかに {n} 曲あります。': "{n} more song.|{n} more songs.",
    '{n} 本から探す': "Search {n} playlists",
    '{n} 曲のタグを直す:': "Edit tags on {n} song:|Edit tags on {n} songs:",
    'タグを書いています {済み} / {全体}': "Writing tags {済み} / {全体}",
    '{n} 曲をシャッフルから外しました（一覧には残ります）': "Kept {n} songs out of shuffle (they stay in the list)",
    '{n} 曲をシャッフルに戻しました': "Put {n} songs back into shuffle",
    '{名前} を自分の音源にしました': "Marked {名前} as your own music",
    '{名前} を自分の音源から戻しました': "{名前} is no longer marked as your own music",
    '{n} 曲を一覧から外しました（ファイルは残っています）': "Removed {n} songs from the list (the files are still there)",
    '📱 {n} 曲（{mb} MB）を運びました: {先}': "📱 Copied {n} songs ({mb} MB) to: {先}",
    '📱 スマホへ運んでいます… {済み} / {全体} 曲（{mb} MB）': "📱 Copying to your phone… {済み} / {全体} songs ({mb} MB)",
    '再生できませんでした（{理由}）': "Could not play it ({理由})",
    '{mb} MB あるので、音量そろえは測っていません': "It is {mb} MB, so loudness was not measured",
    '{n} 曲{補足}{止め}': "{n} song{補足}{止め}|{n} songs{補足}{止め}",
    '↩ 外した {n} 曲を戻す': "↩ Put back {n} removed songs",
    '{n} 曲を一覧に戻しました': "Put {n} songs back in the list",
    '{n} 曲を書き換えました。{但し}': "Rewrote {n} songs. {但し}",
    '{n} 曲のタグを書き換えました。{但し}': "Rewrote the tags on {n} songs. {但し}",
    '{n} 曲は失敗しました:': "{n} songs failed:",
    '絞り込みを外したので、変えた内容が一覧で確かめられます。': "The filters were cleared so you can check what changed in the list.",
    '保存しました': "Saved",
    '保存できませんでした（{理由}）': "Could not save it ({理由})",
    '再生リストから {n} 曲を取り除きました。': "Removed {n} songs from the playlist.",
    '元の MP3 ファイルが見つからなくなったためです。': "The original MP3 files could not be found any more.",
    '曲を選んでください': "Choose a song",
    '🔁 しない': "🔁 No repeat",
    '🔊 音量そろえる': "🔊 Even out loudness",
    '下の「フォルダを追加」から、MP3 の入ったフォルダを選んでください。': "Use \"Add a folder\" below to choose a folder with MP3s in it.",
    'フォルダを追加': "Add a folder",
    '再スキャン': "Rescan",
    '🔑 APIキーを入れる': "🔑 Enter an API key",
    '🏷 タグ無しを隠す': "🏷 Hide untagged",
    '前の曲': "Previous",
    '次の曲': "Next",
    '繰り返し': "Repeat",
    'シャッフル': "Shuffle",
    '曲ごとの音量差をならす': "Even out the loudness between songs",
    '音量': "Volume",
    '上下にドラッグして、3カラムの高さを変える': "Drag up and down to change the height of the three columns",
    '左右にドラッグして、一覧の幅を変える': "Drag left and right to change the width of the list",
    '画面と AI の言葉を切り替えます': "Switches the language of the screen and of the AI",
    'Anthropic の API キーを登録します。入れると、上に「気分を書く」欄と「言葉から辿る」欄が出ます':
      "Registers an Anthropic API key. Once it is in, a box for how you feel and a box for following a word appear above",
    '曲名やアーティストの入っていない曲を、一覧にも出さず再生もしない': "Keeps songs with no title or artist out of the list, and does not play them",
    '「一覧から外す」で外した曲を、すべて一覧に戻す': "Puts every song you removed from the list back into it",

    /* ★表の組み立て（区切りや単位も言葉で変わる） */
    '{名}（{n}曲）': '{名} ({n} song)|{名} ({n} songs)',
    '{n}曲': '{n} song|{n} songs',
    '、': ', ',

    /* ★木の枝の数（値そのものが日本語なので、これも訳す） */
    '　深さ1 … 起点から直接つながるもの {n}': "  Level 1 … {n} that connect directly from the start",
    '　深さ2 … 各深さ1 から {n}': "  Level 2 … {n} from each level-1 name",
    '　深さ3 … 各深さ2 から {n}': "  Level 3 … {n} from each level-2 name",
    '3 個': "3",
    '4 個': "4",
    '5 個': "5",
    '6 個': "6",
    '8 個': "8",
    '1 個ずつ': "1 each",
    '2 個ずつ': "2 each",
    '3 個ずつ': "3 each",
    '1〜2 個ずつ': "1–2 each",
    '2〜3 個ずつ': "2–3 each",
    '3〜4 個ずつ': "3–4 each",

    /* ★差し込みのある行（{名前} で受ける） */
    '・ジャンルは 1〜{n} 個。多すぎると絞った意味がなくなります': "- Between 1 and {n} genres. Too many and the filter stops meaning anything",
    '・候補から **{n} 曲**選び、**流す順に**並べてください': "- Choose **{n} songs** from the list and put them **in playing order**",
    '　（候補には {組} 組いるので、{n} 曲すべて別の組にできます）': "  (there are {組} artists in the list, so all {n} can be different)",
    '　候補には {組} 組しかいないので、どうしても重なります。': "  There are only {組} artists in the list, so some must repeat.",
    'この人は **{組} 組・{曲} 曲**持っています。下に出したのはごく一部です。':
      "They own **{組} artists and {曲} songs**. What follows is only a small part.",
    '　全部で {n} 個ほどになります': "  That comes to about {n} names in total",
    '　深さ1 … 起点から直接つながるもの {n} 個': "  Level 1 … {n} that connect directly from the start",
    '　深さ2 … 各深さ1 から {n} 個ずつ': "  Level 2 … {n} from each level-1 name",
    '　深さ3 … 各深さ2 から {n} 個ずつ': "  Level 3 … {n} from each level-2 name",

    /*
     * ── AI への頼み文（2026-08-30）──
     *
     * ★英語のときは、AI にも**英語で返させる。**
     * 「ひとこと」は日本語で → in English に変えてあるのがその要。
     * ここを訳し忘れると、画面だけ英語で返事は日本語、という形になる。
     */
    'あなたは、その人の音楽ライブラリから「いまの気分に合う範囲」を選ぶ役です。':
      "Your job is to pick the part of this person's music library that fits how they feel right now.",
    '曲は選びません。**絞り込みの条件だけ**を選びます。': "You do not pick songs. You pick **the filter only**.",
    '■ このライブラリにあるジャンル（件数の多い順）': "■ Genres in this library (most songs first)",
    '■ 曲を手に入れた年': "■ Years the songs were added",
    '（日付の分かる曲がありません）': "(no songs have a known date)",
    '■ 決まり': "■ Rules",
    '・ジャンルは、**上の一覧にある名前をそのまま**使ってください。無い名前は使わない':
      "- Use genre names **exactly as they appear above**. Do not invent names",
    '・年も、上にある年だけ。気分と関係なければ空でよい':
      "- Same for years: only those listed. Leave empty if the mood has nothing to do with a year",
    '・曲数の少ないジャンルばかり選ばない。聴くぶんが残るようにしてください': "- Do not pick only tiny genres. Leave enough to actually listen to",
    '・「ひとこと」は日本語で 1 文。なぜそれを選んだかを、短く': "- Write the note in English, one sentence: briefly, why you chose this",
    'あなたは DJ です。その人の手元にある曲から、**流す順番に並べた一本**を組みます。':
      "You are a DJ. From the songs this person owns, build **one set, in playing order**.",
    '■ その人が言った気分': "■ What they said they wanted",
    '・番号は候補に**実際にある番号**だけ。無い番号は返さない。同じ番号を 2 回使わない':
      "- Use only numbers that **actually appear** in the list. Never invent one, never repeat one",
    '・★**同じアーティストは 1 曲まで。** 同じアルバムも 1 曲まで': "- ★**One song per artist.** One song per album as well",
    '・★**同じアーティストに寄せない。**': "- ★**Do not lean on one artist.**",
    '　**なるべく散らして**、同じ組が固まらないように。続けて 2 曲は並べない':
      "  **Spread them out** so no artist clumps together. Never two in a row",
    '・★イントロ・アウトロ・つなぎの小品は選ばないでください。': "- ★Do not pick intros, outros or interludes.",
    '　単独で聴いて 1 曲として成り立つものだけにしてください': "  Only pick things that stand on their own as a song",
    '・「ひとこと」は日本語で 1 文、20 字程度。**なぜその位置にその曲を置いたか**':
      "- Write the note in English, one short sentence: **why this song, in this position**",
    '・「題」は、この一本につける短い名前（日本語 15 字程度）': "- The title is a short name for this set, in English (a few words)",
    'あなたは音楽に詳しい人です。ある言葉を起点に、**そこから辿れる音楽**を木の形で並べます。':
      "You know music deeply. Starting from one word, lay out **the music you can trace from it** as a tree.",
    '■ この人の蔵書の大きさ': "■ How large this collection is",
    '■ この人がよく持っているアーティスト（曲数の多い順・一部）': "■ Artists they own a lot of (most songs first, a sample)",
    '（分かりません）': "(unknown)",
    '■ ★そのほか（薄く広く持っているところ。全体から等間隔で拾いました）': "■ ★Others (the thin, wide part of the collection, sampled evenly)",
    '★この深さまで踏み込んで持っている人です。**入門の代表格を出す相手ではありません。**':
      "★This person already digs this deep. **They are not someone to hand the beginner classics to.**",
    '★この一覧から選ぶと、そのまま鳴らせます。**数を稼ぐならここから。**':
      "★Anything from this list can be played immediately. **If you want numbers, start here.**",
    '・起点の言葉から、**3 段の木**を作ってください': "- From the starting word, build **a tree three levels deep**",
    '・**実在するアーティスト／バンド名だけ**を挙げてください。アルバム名や曲名は挙げない':
      "- Name **real artists and bands only**. No album titles, no song titles",
    '　（この名前は、その人の手元のアーティスト名と突き合わせます）': "  (these names get matched against the artists they own)",
    '・★**できるだけ多くの、別々のバンド**を挙げてください。数がほしいところです':
      "- ★Name **as many different bands as you can**. Quantity matters here",
    '　上の一覧にある名前を選んで構いません。**むしろ歓迎します**': "  Names from the list above are fine. **In fact they are welcome**",
    '　（一覧はこの人がすでに持っているものです。持っているなら、すぐ鳴らせます）': "  (that list is what they already own, so it can play right away)",
    '・一覧に無い名前も、思いついたら混ぜてください。ただし**数を削ってまで混ぜない**':
      "- Mix in names not on the list if they come to mind, but **not at the cost of quantity**",
    '　これは「もっと辿ってほしい」という合図です。**さらに外側・さらに細いところ**へ':
      "  That is a signal to trace further. Go **further out, and finer**",
    '・「description」は日本語で 20 字ほど。**なぜそこから繋がるのか**を書く':
      "- Write \"description\" in English, a short phrase: **why it connects from there**",
    '・同じ名前を 2 回出さない': "- Never list the same name twice",
    '・★**曲数の多い少ないは考えなくてよい。** 1 曲しか出していないバンドでも構いません':
      "- ★**Ignore how many songs a band has.** A band with a single track is fine",
    '・★**最後まで同じ文脈を保ってください。**': "- ★**Hold the same context all the way through.**",
    '　後半になっても遠くへ広げない。1 曲目と最後の曲が地続きであること':
      "  Do not reach far in the later half. The first and last song should feel continuous",
    '・★飛んだ先でも、**その界隈の王道**を選んでください。': "- ★Wherever you land, pick **that scene's classics**.",
    '　遠くへは行くが、行った先では代表格を選ぶ ―― という広げ方です': "  Travel far, but choose the well-known names once you arrive",
    '・飛んだ先では、王道と端のものを混ぜてください': "- Wherever you land, mix the classics with the fringe",
    '・★飛んだ先でも、**端のほう**を選んでください。': "- ★Wherever you land, pick **the fringe**.",
    '　遠くへ行ったうえで、そこでも意外なものを選ぶ ―― という広げ方です': "  Travel far, and pick the unexpected once you arrive",
    '・★**後半は、遠くの文脈まで広げてください。**': "- ★**In the later half, reach into distant contexts.**",
    '　前半でその気分の足場を作り、後半は思い切って飛んでよい。': "  Build the footing in the first half, then leap boldly in the second.",
    '　聴き手が「そう来たか」と思うところまで行って構いません': "  Go as far as making the listener think \"I did not see that coming\"",
    '・ただし飛び方に筋を通すこと。なぜそこへ行ったかを「ひとこと」で言えること':
      "- But the leap must hold together. You should be able to say in the note why you went there",
    'あなたは音楽ライブラリの整理を手伝います。': "You are helping tidy up a music library.",
    '下は、この人の手元にあるジャンル名と、その曲数です。': "Below are the genre names in this collection, with song counts.",
    '長いあいだに付け足されてきたので、**粒の大きさがばらばら**です。':
      "They were added over many years, so **they sit at wildly different scales**.",
    '大きな系統の名前と、その中の細かい呼び名が、同じ高さに並んでいます。': "Broad family names and fine sub-labels are listed side by side.",
    '■ してほしいこと': "■ What to do",
    'これらを、**見て回りやすい大きさの親**にまとめてください。': "Group them into **parents at a size that is comfortable to browse**.",
    '・親の名前は、その集まりを最もよく言い表すものにする': "- Name each parent whatever best describes the group",
    '　手元にある名前をそのまま親に使ってよい（曲数の多いものが親に向く）':
      "  An existing name may be used as the parent (ones with many songs suit this)",
    '・大文字小文字だけが違うものは、必ず同じ親にする': "- Names differing only in capitalisation must always share a parent",
    '・1 つの欄に複数の名前が詰め込まれているものは、主なものの親に入れる':
      "- Where several names are crammed into one field, file it under the main one",
    '・打ち間違いや略号は、元の名前の親に入れる': "- Typos and abbreviations go under the parent of the name they meant",
    '・ジャンルではないもの（レーベル名、媒体の種類、意味の取れない短い符号、':
      "- Things that are not genres (label names, media types, short meaningless codes,",
    '　「ジャンル名が無い」という意味の文字列など）は、音楽の系統に混ぜず、':
      "  strings that just mean \"no genre\") must not be mixed into musical families;",
    '　それとわかる親にまとめる': "  put them under a parent that says so plainly",
    '■ 守ること': "■ Rules you must keep",
    '・★子の名前は、下の一覧にある文字列を**そのまま**書き写すこと。': "- ★Copy child names **exactly** as they appear in the list below.",
    '　一覧に無い名前を作らないでください': "  Do not invent a name that is not in the list",
    '・同じ名前を 2 つの親に入れないでください': "- Never put the same name under two parents",
    '・迷うものは、無理に大きな親へ入れず、そのままにしておいてください':
      "- If you are unsure, leave it alone rather than forcing it into a big parent",
    '　（親を作らなければ、その名前はそのまま残ります）': "  (with no parent, the name simply stays as it is)",
    '・★大きな系統をひとつに潰しすぎないでください。': "- ★Do not flatten broad families into one.",
    '　この人はその区別を使って聴いています。**探しやすさが目的**であって、':
      "  This person listens by those distinctions. **The goal is finding things**,",
    '　名前を減らすことが目的ではありません': "  not reducing the number of names",
    '■ 親ごとに、なぜそうまとめたかを一行で添えてください': "■ For each parent, add one line in English saying why you grouped it that way",
    'この人が見て、要らない親を外せるようにするためです。': "That is so they can look and drop the parents they do not want.",
    '■ 手元のジャンル名（名前／曲数）': "■ Genre names in this collection (name / song count)",
    'ジャンルが付いていない演者の一覧です。': "Here are artists with no genre set.",
    'それぞれに、いちばん合うジャンルを 1 つ選んでください。': "For each one, pick the single genre that fits best.",
    '・★ジャンルは、**下の「使えるジャンル」から選んでください。**': "- ★Pick the genre **from the \"genres you may use\" list below.**",
    '　新しい名前を作らないでください。この人の蔵書で使われている名前です': "  Do not invent new names. These are the names used in this collection",
    '・番号は、渡した番号をそのまま返してください': "- Return the number exactly as it was given",
    '・★迷ったら、近いものを選んで構いません。': "- ★If unsure, a near miss is fine.",
    '　**選ばないより、多少外れても選んだほうが役に立ちます**': "  **A slightly wrong answer is more use than no answer**",
    '・どうしても見当が付かない演者だけ、飛ばしてください': "- Skip only the artists you genuinely cannot place",
    '■ 演者ごとに、なぜそのジャンルかを一行で添えてください': "■ For each artist, add one line in English saying why that genre",
    'この人が見て、要らないものを外せるようにするためです。': "That is so they can look and drop the ones they do not want.",
    '■ 使えるジャンル（この人の蔵書にあるもの）': "■ Genres you may use (the ones in this collection)",
    '■ ジャンルが付いていない演者（番号／演者／盤／曲数）': "■ Artists with no genre (number / artist / albums / song count)",
    '・★**その言葉のど真ん中**を選んでください。代表格で構いません': "- ★Pick **the dead centre of that word**. The obvious names are fine",
    '　「〇〇といえばこれ」と言われるものを、堂々と挙げてください': "  Name the ones people cite first, without hesitation",
    '・深さが増しても、よく知られたものの中で辿ってください': "- Even as the tree deepens, stay among the well known",
    '・並びは、似たものを寄せて聴きやすくする程度でよい': "- Ordering: just group similar things so it flows",
    '・★**その気分の王道**を、素直に選んでください。ひねらなくてよい': "- ★Pick **the classics for that mood**, plainly. No need to be clever",
    '・★候補の（）は、**この範囲でその演者の盤を何枚／何曲持っているか**です。':
      "- ★The brackets show **how many albums / songs they own by that artist, in this range**.",
    '　★**枚数の多い演者**を軸にしてください。長く作ってきた演者で、':
      "  ★Build around **artists with many albums**. Those have made work for years,",
    '　その人にとっての王道です。曲数は、同じ枚数どうしを比べるときだけ見てください':
      "  and are this person's own classics. Use song count only to compare equal album counts",
    '　（1 枚に何十曲も入った編集盤があるので、曲数だけで測ると外れます）':
      "  (some single discs hold dozens of tracks, so song count alone misleads)",
    '・★**ど真ん中を軸に**してください。代表格を入れて構いません': "- ★Build **around the centre**. Including the obvious names is fine",
    '・深さ3 だけ、少し外れたものを混ぜてください': "- At level 3 only, mix in something slightly off-centre",
    '・並びに、軽い起伏をつけてよい': "- A gentle rise and fall in the ordering is fine",
    '・★その気分の**王道を軸に**選んでください。少しだけ意外なものを混ぜる':
      "- ★Build **around the classics** for that mood, with a little of the unexpected",
    '・候補の（）は、この範囲で持っている盤の数／曲数です。**枚数の多いもの**を軸に':
      "- The brackets are albums / songs owned in this range. Build around **high album counts**",
    '・★素直なところと、少し外れたところを**半々**で': "- ★**Half and half**: the straightforward, and the slightly off-centre",
    '　深さ1 … よく知られたものでよい': "  Level 1 … the well known is fine",
    '　深さ2 … 一段外。同じ話をする人が減るあたり': "  Level 2 … one step out, where fewer people are talking",
    '　深さ3 … さらに外。名前が挙がりにくいもの': "  Level 3 … further out, names that rarely come up",
    '・並びに起伏をつけてください。中盤で上げて、終わりは落ち着かせる': "- Give the ordering a shape: lift through the middle, settle at the end",
    '・★王道と、少し外したものを**半々**で選んでください': "- ★Pick **half classics, half slightly off-centre**",
    '・候補の（）は、この範囲で持っている盤の数／曲数です。枚数の多いものと少ないものを混ぜて':
      "- The brackets are albums / songs owned in this range. Mix high and low album counts",
    '・★**代表格は控えめに。** 入門記事で紹介されるものは、この人はもう知っています':
      "- ★**Go easy on the obvious names.** Anything a beginner's guide lists, they already know",
    '・深さが増すほど遠くへ。深さ3 は、その筋の人が挙げるあたりまで':
      "- Go further out as the tree deepens. Level 3 should reach what the devoted would name",
    '・★その気分の**ど真ん中は控えめに。** 少し外した角度から選んでください':
      "- ★**Go easy on the dead centre** for that mood. Choose from a slightly turned angle",
    '・候補の（）の**枚数が少ない演者を多めに**。その人の端のほうです':
      "- Favour **artists with few albums** in the brackets. That is this person's fringe",
    '・★**まず名前が挙がる代表格は出さないでください。**': "- ★**Do not give the names that come up first.**",
    '　入門記事・ベスト盤・「〇〇といえばこれ」で紹介されるものは、この人はもう知っています':
      "  Beginner guides, best-of compilations, the \"if you like X, start here\" names: they know them",
    '・★深さで踏み込みを変えてください': "- ★Dig further as the level increases",
    '　深さ1 … 起点から素直に繋がるもの。ここは知られたものでよい': "  Level 1 … what connects plainly from the start. Well known is fine here",
    '　深さ3 … ★その筋の人しか挙げないもの。少数の作品しか出していない、': "  Level 3 … ★what only the devoted would name. Very few releases,",
    '　　　　　地域が偏っている、短命だった ―― そういうものを歓迎します': "        regionally narrow, short-lived — those are welcome",
    '・迷ったら、**有名なほうではなく、遠いほうを選んでください**': "- When unsure, **choose the far one, not the famous one**",
    '・並びに、はっきりした起伏をつけてください': "- Give the ordering a clear rise and fall",
  },
};

/**
 * 訳す。
 *
 * @param 日本語   鍵。そのまま日本語としても使える
 * @param 差し込み { 名前: 値 }。文の {名前} を置き換える
 */
function 言(日本語, 差し込み) {
  const 元 = String(日本語 ?? '');
  const 表 = 訳[いまの言葉];
  let 文 = (表 && Object.prototype.hasOwnProperty.call(表, 元)) ? 表[元] : 元;

  /*
   * ★単数・複数（2026-08-30）。
   * 日本語には要らないが、英語では「1 songs」が目に痛い。
   * 訳の値に | を書いたら、前が単数・後ろが複数。差し込みの n で選ぶ。
   *   '{n}曲': '{n} song|{n} songs'
   */
  if (文.includes('|')) {
    const [単, 複] = 文.split('|');
    const n = 差し込み && 差し込み.n;
    文 = (Number(String(n).replace(/,/g, '')) === 1) ? 単 : 複;
  }
  if (差し込み && typeof 差し込み === 'object') {
    for (const [k, v] of Object.entries(差し込み)) {
      文 = 文.split('{' + k + '}').join(String(v));
    }
  }
  return 文;
}

/** ★訳がまだ無いものを数える（どこまで進んだかを知るため） */
function 訳の進み(候補) {
  const 表 = 訳.en || {};
  const 並び = Array.isArray(候補) ? candidatesOf(候補) : [];
  const ある = 並び.filter((v) => Object.prototype.hasOwnProperty.call(表, v)).length;
  return { 全部: 並び.length, 訳した: ある, まだ: 並び.length - ある };
}
function candidatesOf(a) { return a.filter((v) => typeof v === 'string' && v); }

// Node（本体・検査）と画面（<script> 読み込み）の両方で使えるようにしておく。
// 同じ処理を 2 か所に書くと、片方だけ直す事故になる。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 言, 言葉を選ぶ, 言葉を決める, 言葉を入れる, いまの, 英語か, 訳, 訳の進み };
}
