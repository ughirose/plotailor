import { describe, it, expect } from 'vitest';
import {
  ManuscriptSpecSheetGenerator,
  type ManuscriptSpecChapter,
} from '../src/core/export/ManuscriptSpecSheetGenerator.js';
import {
  CommercialManuscriptPackager,
  type CommercialPackageOptions,
} from '../src/core/export/CommercialManuscriptPackager.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('ManuscriptSpecSheetGenerator', () => {
  const sampleChapters: ManuscriptSpecChapter[] = [
    {
      title: '第一章 星の胎動',
      content: '彼は静かに立ち上がった。空には二つの月が輝いている。\n「急がねばならない」\n少女は頷いた。彼の名は｜夜天《やてん》の守護者。絶対に《《負けられない》》。',
    },
    {
      title: '第二章 帝都の夜明け',
      content: '帝都の門が開かれた。12頭の軍馬が疾走する。\n「誰何する！」と兵士が叫ぶ。',
    },
  ];

  it('accurately computes character counts, dialogue ratio, and manuscript sheets', () => {
    const metrics = ManuscriptSpecSheetGenerator.analyzeMetrics(sampleChapters);

    expect(metrics.totalCharsNoSpaces).toBeGreaterThan(50);
    expect(metrics.dialogueRatioPercent).toBeGreaterThan(0);
    expect(metrics.manuscriptSheetCount).toBeGreaterThanOrEqual(1);

    // Verify Ruby extraction
    expect(metrics.rubyTotalCount).toBe(1);
    expect(metrics.rubyItems[0].base).toBe('夜天');
    expect(metrics.rubyItems[0].ruby).toBe('やてん');

    // Verify Bouten extraction
    expect(metrics.boutenTotalCount).toBe(1);
    expect(metrics.boutenItems[0].text).toBe('負けられない');
  });

  it('generates a well-formatted specification sheet string', () => {
    const sheet = ManuscriptSpecSheetGenerator.generateSpecSheet({
      title: '双月の年代記',
      author: 'テスト作家',
      chapters: sampleChapters,
    });

    expect(sheet).toContain('商業原稿仕様書・割付指示書');
    expect(sheet).toContain('作品名: 『双月の年代記』');
    expect(sheet).toContain('著　者: テスト作家');
    expect(sheet).toContain('【1. 原稿総量および分量集計】');
    expect(sheet).toContain('【2. 推奨DTP基本版面設計（四六判 / A5判 標準縦書き）】');
    expect(sheet).toContain('【3. 章構成・分量内訳】');
    expect(sheet).toContain('【4. ルビ指定対照一覧（親文字 ➔ 読み）】');
    expect(sheet).toContain('夜天 ➔ 《やてん》');
    expect(sheet).toContain('【5. 圏点・傍点指定一覧】');
    expect(sheet).toContain('「負けられない」');
  });
});

describe('CommercialManuscriptPackager', () => {
  it('bundles all production assets into a single ZIP archive', () => {
    const lore: LoreEntity[] = [
      {
        id: 'char-1',
        name: '夜天',
        category: 'character',
        role: '主人公',
        description: '星見の騎士。',
      },
    ];

    const options: CommercialPackageOptions = {
      title: '双月の年代記',
      author: 'テスト作家',
      publisher: '電書協文庫',
      chapters: [
        {
          title: '第一章 星の胎動',
          content: '彼は静かに立ち上がった。',
        },
      ],
      loreEntities: lore,
      popAuditCount: 500,
    };

    const zipBytes = CommercialManuscriptPackager.createPackage(options);
    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(1000);

    const decoder = new TextDecoder();
    const rawArchive = decoder.decode(zipBytes);

    // Verify all 6 folders and files exist in the package
    expect(rawArchive).toContain('01_電子書籍_EPUB3/双月の年代記_電書協EPUB3.epub');
    expect(rawArchive).toContain('02_DTP組版_InDesign/双月の年代記_InDesignタグ付きテキスト_全章結合.txt');
    expect(rawArchive).toContain('02_DTP組版_InDesign/各章別/ch01_第一章 星の胎動.txt');
    expect(rawArchive).toContain('03_プレーンテキスト_青空記法/双月の年代記_青空文庫形式.txt');
    expect(rawArchive).toContain('04_世界観・設定資料集/双月の年代記_世界観設定資料集.md');
    expect(rawArchive).toContain('05_入稿仕様・割付指示書/双月の年代記_原稿割付指示書.txt');
    expect(rawArchive).toContain('06_創作プロセス証明/双月の年代記_PoP_創作証明書.json');
  });
});
