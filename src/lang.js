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
