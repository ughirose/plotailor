import { describe, it, expect } from 'vitest';
import {
  SAMPLE_NOVEL_METADATA,
  SAMPLE_NOVEL_CHAPTERS,
  SAMPLE_NOVEL_LORE,
  SAMPLE_NOVEL_PROOFREADING_FIXTURES,
  getSampleChapterById,
  getFullSampleManuscriptText,
  getSampleLoreEntities,
  getProofreadingFixtures,
} from '../src/data/SampleNovelData.js';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import { PovBreachDetector } from '../src/core/editor/MultiLayerDecoration.js';
import { parseRubySyntax } from '../src/core/editor/RubySyntaxParser.js';
import { parseAozoraMarkup } from '../src/core/editor/AozoraParser.js';

describe('SampleNovelData - 『星辰の残響』確定データセット＆検証フィクスチャ', () => {
  it('メタデータが正しい規格を満たしていること', () => {
    expect(SAMPLE_NOVEL_METADATA.title).toBe('星辰の残響');
    expect(SAMPLE_NOVEL_METADATA.author).toBe('有広ゼノ');
    expect(SAMPLE_NOVEL_METADATA.genre).toBe('本格ハイファンタジー');
    expect(SAMPLE_NOVEL_METADATA.keywords).toContain('星辰の盟約');
    expect(SAMPLE_NOVEL_METADATA.keywords).toContain('二重満月');
  });

  it('全3章の本文データが正常に定義され、文字数が正しく計算されていること', () => {
    expect(SAMPLE_NOVEL_CHAPTERS).toHaveLength(3);

    const [ch1, ch2, ch3] = SAMPLE_NOVEL_CHAPTERS;

    expect(ch1.id).toBe('ch-1');
    expect(ch1.title).toContain('第一章');
    expect(ch1.charCount).toBeGreaterThan(100);

    expect(ch2.id).toBe('ch-2');
    expect(ch2.title).toContain('第二章');
    expect(ch2.charCount).toBeGreaterThan(100);

    expect(ch3.id).toBe('ch-3');
    expect(ch3.title).toContain('第三章');
    expect(ch3.charCount).toBeGreaterThan(100);
  });

  it('青空文庫形式の正式構文（ルビ《》、傍点、見出し、ダッシュ――、三点リーダー……）が含まれていること', () => {
    const fullText = getFullSampleManuscriptText();

    // 1. ルビ記法《》
    expect(fullText).toMatch(/《[^》]+》/);
    expect(fullText).toContain('第一衛星《セレネ》');

    // 2. 傍点記法 《《》》 または <<<<>>>>
    expect(fullText).toMatch(/《《[^》]+》》/);
    expect(fullText).toContain('二重満月《《コンジャンクション》》');
    expect(fullText).toContain('<<<<星辰の盟約>>>>');

    // 3. 大見出し記法［＃大見出し］...［＃大見出し終わり］
    expect(fullText).toContain('［＃大見出し］第一章　双月の巡る夜に［＃大見出し終わり］');
    expect(fullText).toContain('［＃大見出し］第二章　帝都の影と密書［＃大見出し終わり］');
    expect(fullText).toContain('［＃大見出し］第三章　忘却の砦［＃大見出し終わり］');

    // 4. 2-emダッシュ――
    expect(fullText).toContain('――');

    // 5. 2-em三点リーダー……
    expect(fullText).toContain('……');
  });

  it('人名表記ゆれ（ヴァレリウス / バレリウス）が意図的に埋め込まれていること', () => {
    const fullText = getFullSampleManuscriptText();

    expect(fullText).toContain('ヴァレリウス');
    expect(fullText).toContain('バレリウス');

    const valeriusMatches = fullText.match(/ヴァレリウス/g) || [];
    const balleriusMatches = fullText.match(/バレリウス/g) || [];

    expect(valeriusMatches.length).toBeGreaterThan(0);
    expect(balleriusMatches.length).toBeGreaterThan(0);
  });

  it('会話文でのタイポ候補（音韻反転・誤打鍵）が含まれていること', () => {
    const ch1 = getSampleChapterById('ch-1');
    expect(ch1).toBeDefined();
    expect(ch1?.content).toContain('そんなわけがにいでしょう');
  });

  it('三人称客観POVブレ（他者の内面描写）がPovBreachDetectorで検知されること', () => {
    const fullText = getFullSampleManuscriptText();
    const detector = new PovBreachDetector();

    const breaches = detector.detect(
      fullText,
      {
        currentPovCharacterId: 'char-valerius',
        currentPovCharacterName: 'ヴァレリウス',
      },
      SAMPLE_NOVEL_LORE
    );

    expect(breaches.length).toBeGreaterThan(0);
    const breachTexts = breaches.map((b) => b.offendingText);
    expect(breachTexts.some((t) => t.includes('胸中では'))).toBe(true);
  });

  it('主語省略（ガ格抜け）がNarrativeLinterEngineで検出されること', () => {
    const ch3 = getSampleChapterById('ch-3');
    expect(ch3).toBeDefined();

    const linter = new NarrativeLinterEngine();
    const result = linter.analyzeDocument(ch3!.content, {
      entities: [
        { id: 'ent-valerius', text: 'ヴァレリウス', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.5 },
      ],
    });

    expect(result.zeroPronounItems.length).toBeGreaterThan(0);
    const predicateTexts = result.zeroPronounItems.map((zp) => zp.predicateText);
    expect(predicateTexts.some((p) => p.includes('微笑んだ'))).toBe(true);
  });

  it('青空文法パーサー（AozoraParser & RubySyntaxParser）で正しく解析できること', () => {
    const ch1 = getSampleChapterById('ch-1');
    expect(ch1).toBeDefined();

    // 1. AozoraParser
    const parsedAozora = parseAozoraMarkup(ch1!.content);
    expect(parsedAozora.length).toBeGreaterThan(0);
    expect(parsedAozora.some((node) => node.type === 'ruby' && node.parent === '第一衛星')).toBe(true);

    // 2. RubySyntaxParser
    const rubyMatches = parseRubySyntax(ch1!.content);
    expect(rubyMatches.length).toBeGreaterThan(0);
    expect(rubyMatches.some((m) => m.type === 'bouten')).toBe(true);
  });

  it('Loreデータおよび検証用フィクスチャデータが正しくアクセスできること', () => {
    const lores = getSampleLoreEntities();
    expect(lores).toHaveLength(SAMPLE_NOVEL_LORE.length);
    expect(lores.some((l) => l.name === 'ヴァレリウス')).toBe(true);
    expect(lores.some((l) => l.name === '星辰の盟約')).toBe(true);

    const fixtures = getProofreadingFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.some((f) => f.type === 'typo')).toBe(true);
    expect(fixtures.some((f) => f.type === 'orthography_variant')).toBe(true);
    expect(fixtures.some((f) => f.type === 'pov_breach')).toBe(true);
    expect(fixtures.some((f) => f.type === 'zero_pronoun')).toBe(true);
  });
});
