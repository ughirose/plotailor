/**
 * 文芸品格サンプル小説『星辰の残響』確定データセット＆検証フィクスチャ
 * Sample Novel Dataset & Proofreading Validation Fixtures for Plotailor Literature IDE
 */

export interface SampleChapter {
  id: string;
  chapterNumber: number;
  title: string;
  subtitle: string;
  charCount: number;
  content: string;
  summary: string;
}

export interface SampleNovelMetadata {
  id: string;
  title: string;
  titleKana: string;
  author: string;
  genre: string;
  targetAudience: string;
  createdEra: string;
  description: string;
  keywords: string[];
}

export interface SampleLoreEntity {
  id: string;
  name: string;
  aliases: string[];
  category: 'character' | 'lore' | 'location' | 'item' | 'foreshadowing';
  description: string;
  status: 'active' | 'shelved' | 'draft';
  isSecret?: boolean;
  ownerCharacterId?: string;
}

export interface ProofreadingFixtureEntry {
  id: string;
  chapterId: string;
  type: 'typo' | 'orthography_variant' | 'pov_breach' | 'zero_pronoun' | 'foreshadowing' | 'aozora_syntax';
  targetText: string;
  expectedText?: string;
  explanation: string;
}

export const SAMPLE_NOVEL_METADATA: SampleNovelMetadata = {
  id: 'seishin-no-zankyo',
  title: '星辰の残響',
  titleKana: 'せいしんのざんきょう',
  author: '有広ゼノ',
  genre: '本格ハイファンタジー',
  targetAudience: '文芸・ライト文芸・ハイファンタジー読者',
  createdEra: '帝国星辰暦 742年',
  description:
    '深藍の夜空に二つの月が巡る星辰世界。千年の古より受け継がれし秘宝と盟約を巡り、北方要塞の総督ヴァレリウスと帝都の陰謀が交錯する本格文芸ファンタジー。',
  keywords: ['星辰の盟約', '二重満月', '総督ヴァレリウス', '帝都ルミナス', '忘却の砦'],
};

export const SAMPLE_NOVEL_CHAPTERS: SampleChapter[] = [
  {
    id: 'ch-1',
    chapterNumber: 1,
    title: '第一章　双月の巡る夜に',
    subtitle: '双月の巡る夜に',
    charCount: 0, // Calculated below
    summary: '二重満月の夜、北方の砦に迫る帝国軍先遣隊。総督ヴァレリウスは古の盟約を賭けて決断を下す。',
    content: `［＃大見出し］第一章　双月の巡る夜に［＃大見出し終わり］

　深藍の夜空を二つの月が静かに照らし出していた。
　第一衛星《セレネ》が蒼き冷光を投げかけ、第二衛星《フォボス》の琥珀色が地平の端を仄かに染める。
　二重満月《コンジャンクション》の夜、北方の砦に集う兵たちの息は白く凍りついていた。不穏な凶兆が重く立ち込めている。

「総督《ヴァレリウス》閣下、帝国軍の先遣隊が峡谷を越えたとの急報にございます」

　斥候の震える声に、男は静かに外套を翻した。
　その胸元には、皇帝ルシアンより下賜された金箔の紋章が鈍く輝いている。
　彼は剣の柄に手を掛け、夜の帳を見据えた。
　この戦いは、ただの領土紛争ではない。千年の古より受け継がれし<<<<星辰の盟約>>>>を巡る、運命の分岐点であった。

「心配はいらん。バレリウス卿はすでに西方の防衛線を固めているはずだ……」

　副官が呟いた言葉に、兵らは一瞬の安堵を見せた。
　しかし、斥候の胸中では恐ろしい疑念が渦巻いていた。総督を陥れんとする裏切り者の影を、彼は確かに見たからである。

「そんなわけがにいでしょう。我々の防衛陣形は完璧です」

　若い兵士が強気に言い返した。
　ヴァレリウスは黙して語らず、静かに城壁の欄干へ歩み寄った。――遠く峡谷の闇の奥から、無数の松明の火がうごめき始めていた。`,
  },
  {
    id: 'ch-2',
    chapterNumber: 2,
    title: '第二章　帝都の影と密書',
    subtitle: '帝都の影と密書',
    charCount: 0,
    summary: '賑わう帝都ルミナスの陰で密かに行われる陰謀。元老院の奥深くで一通の密書が交わされる。',
    content: `［＃大見出し］第二章　帝都の影と密書［＃大見出し終わり］

　帝都ルミナスの夜は、地上に降りた星屑のように喧噪を極めていた。
　だが、元老院の奥深く、石造りの暗い回廊に届くのは靴音の不気味な反響のみである。

「北方からの報告は届いているか」

　黒衣の影が問う。その声には氷のような冷徹さが宿っていた。

「はっ。ヴァレリウス総督は依然として砦を死守しております。しかし……」

　従者は言葉を濁し、懐から羊皮紙の密書を取り出した。
　密印には<<<<星辰の結晶>>>>を象った赤い蝋が押されている。
　宰相の胸中では密かに反逆を企んでいたが、表向きは恭順の姿勢を崩さなかった。

「ふん、バレリウスめ。古臭い盟約に縛られおって。あの砦が堕ちれば、秘宝《《アルカディア》》は我らの手に入る」

　影は密書を蝋燭の炎にかざした。青い炎が羊皮紙を舐め、文字が黒く煤けて消えていく。

「急ぎ刺客を放て。あの男の命を絶つには、この二重満月《コンジャンクション》の夜こそが最善の機だ――」`,
  },
  {
    id: 'ch-3',
    chapterNumber: 3,
    title: '第三章　忘却の砦',
    subtitle: '忘却の砦',
    charCount: 0,
    summary: '氷雪に閉ざされた極北の砦で始まる決戦。ヴァレリウスは秘宝の封印を解き、運命と対峙する。',
    content: `［＃大見出し］第三章　忘却の砦［＃大見出し終わり］

　極北の風が氷壁を削る音が、夜を徹して凄まじく響き渡っていた。
　忘却の砦――かつて神話の時代に<<<<古の鍵>>>>が封印されたと伝えられる絶壁の城塞である。

「敵影、砦の門前に到達！　その数、およそ三千！」

　見張り兵の叫びが吹雪の音にかき消されそうになる。
　総督《ヴァレリウス》は重厚な兜を締め直し、大剣を力強く握りしめた。

「全兵、持ち場につけ！　我らが退けば、帝都ルミナスまで途中の民が踏みにじられるぞ！」

　凄まじい歓声が凍てつく空気を震わせた。
　不敵に微笑んだ。
　ヴァレリウスは城門を開かせ、自ら先頭に立って吹雪の荒野へ躍り出た。

「千年の時を超え、今こそ<<<<星辰の盟約>>>>の真価を示そう……！」

　彼の掲げた剣から放たれた蒼き光柱は、夜空の二重満月《コンジャンクション》へと貫き伸びていった――。`,
  },
];

// Calculate char counts
for (const ch of SAMPLE_NOVEL_CHAPTERS) {
  ch.charCount = ch.content.replace(/\s+/g, '').length;
}

export const SAMPLE_NOVEL_LORE: SampleLoreEntity[] = [
  {
    id: 'char-valerius',
    name: 'ヴァレリウス',
    aliases: ['バレリウス', 'ヴァレリウス総督', 'ヴァレリウス閣下'],
    category: 'character',
    description: '北方要塞『忘却の砦』を守護する寡黙なる総督。星辰の盟約を代々受け継ぐ一族の末裔。',
    status: 'active',
  },
  {
    id: 'char-lucien',
    name: '皇帝ルシアン',
    aliases: ['ルシアン皇帝', '陛下'],
    category: 'character',
    description: '帝都ルミナスを統治する若き皇帝。',
    status: 'active',
  },
  {
    id: 'lore-seishin-covenant',
    name: '星辰の盟約',
    aliases: ['古の盟約'],
    category: 'foreshadowing',
    description: '千年前の神聖戦争において神々と人間が交わした不滅の契約。',
    status: 'active',
  },
  {
    id: 'item-ancient-key',
    name: '古の鍵',
    aliases: ['アルカディアの鍵'],
    category: 'item',
    description: '忘却の砦の地下深く眠る神話時代の秘宝を解放するための鍵。',
    status: 'active',
    isSecret: true,
    ownerCharacterId: 'char-valerius',
  },
  {
    id: 'loc-luminas',
    name: '帝都ルミナス',
    aliases: ['ルミナス'],
    category: 'location',
    description: '大陸の中央に位置する輝かしい光の都。',
    status: 'active',
  },
];

export const SAMPLE_NOVEL_PROOFREADING_FIXTURES: ProofreadingFixtureEntry[] = [
  {
    id: 'fix-typo-1',
    chapterId: 'ch-1',
    type: 'typo',
    targetText: 'そんなわけがにいでしょう',
    expectedText: 'そんなわけがないでしょう',
    explanation: '会話文における誤打鍵・誤字候補（「ない」→「にい」）',
  },
  {
    id: 'fix-orthography-1',
    chapterId: 'ch-1',
    type: 'orthography_variant',
    targetText: 'バレリウス卿',
    expectedText: 'ヴァレリウス卿',
    explanation: '主要人物名における表記揺れ（「ヴァレリウス」と「バレリウス」）',
  },
  {
    id: 'fix-pov-1',
    chapterId: 'ch-1',
    type: 'pov_breach',
    targetText: '斥候の胸中では恐ろしい疑念が渦巻いていた',
    explanation: '三人称客観POVにおける他者の直接不可知な内面描写（「～の胸中では～」）',
  },
  {
    id: 'fix-pov-2',
    chapterId: 'ch-2',
    type: 'pov_breach',
    targetText: '宰相の胸中では密かに皇帝を見下していた',
    explanation: '三人称客観POVにおける他者（宰相）の内面思考の直接暴露',
  },
  {
    id: 'fix-zero-pronoun-1',
    chapterId: 'ch-3',
    type: 'zero_pronoun',
    targetText: '不敵に微笑んだ。',
    expectedText: 'ヴァレリウスは不敵に微笑んだ。',
    explanation: '行動述語節における主語（ガ格）の省略・抜け検出のフィクスチャ',
  },
  {
    id: 'fix-aozora-1',
    chapterId: 'ch-1',
    type: 'aozora_syntax',
    targetText: '第一衛星《セレネ》',
    explanation: '青空文庫ルビ記法（《セレネ》）',
  },
  {
    id: 'fix-aozora-2',
    chapterId: 'ch-1',
    type: 'aozora_syntax',
    targetText: '二重満月《《コンジャンクション》》',
    explanation: '青空文庫傍点記法（《《コンジャンクション》》）',
  },
  {
    id: 'fix-aozora-3',
    chapterId: 'ch-1',
    type: 'aozora_syntax',
    targetText: '<<<<星辰の盟約>>>>',
    explanation: 'Plotailor固有4角括弧傍点記法（<<<<星辰の盟約>>>>）',
  },
];

/**
 * Utility: Returns chapter by ID
 */
export function getSampleChapterById(chapterId: string): SampleChapter | undefined {
  return SAMPLE_NOVEL_CHAPTERS.find((c) => c.id === chapterId);
}

/**
 * Utility: Returns full manuscript concatenated text across all 3 chapters
 */
export function getFullSampleManuscriptText(): string {
  return SAMPLE_NOVEL_CHAPTERS.map((c) => c.content).join('\n\n');
}

/**
 * Utility: Returns all sample lore entities
 */
export function getSampleLoreEntities(): SampleLoreEntity[] {
  return [...SAMPLE_NOVEL_LORE];
}

/**
 * Utility: Returns proofreading validation fixtures
 */
export function getProofreadingFixtures(): ProofreadingFixtureEntry[] {
  return [...SAMPLE_NOVEL_PROOFREADING_FIXTURES];
}
