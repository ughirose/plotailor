import { describe, it, expect } from 'vitest';
import {
  EmotionalArcAnalyzer,
  EmotionalArcChart,
  ThreePaneWorkspace,
  DEFAULT_POSITIVE_WORDS,
  DEFAULT_NEGATIVE_WORDS,
  DEFAULT_TENSION_WORDS,
} from '../src/index.js';

describe('EmotionalArcAnalyzer', () => {
  it('returns empty result when given empty manuscript text', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const result = analyzer.analyze('');

    expect(result.scenes.length).toBe(0);
    expect(result.overallValence).toBe(0);
    expect(result.peakTensionSceneIndex).toBe(0);
    expect(result.climaxProgress).toBe(0);
    expect(result.summary.totalScenes).toBe(0);
    expect(result.summary.dominantEmotion).toBe('neutral');
    expect(result.summary.peakTensionScore).toBe(0);
  });

  it('correctly strips Aozora ruby and bouten markup before lexical analysis', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const rawAozora = '｜勝利《しょうり》の｜笑顔《えがお》と《《希望》》を胸に前進した。';
    const stripped = analyzer.stripAozoraMarkup(rawAozora);

    expect(stripped).toBe('勝利の笑顔と希望を胸に前進した。');
  });

  it('segments text by explicit scene dividers (===, ---, ***, 章/幕)', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const manuscript = `
第一章　希望の船出
平和な港町に爽やかな風が吹いていた。仲間たちの笑顔が輝く。

===

第二章　突如の暗雲
黒い雲が空を覆い、恐怖と不満が渦巻く。恐ろしい悲鳴が響き渡った。

---

第三章　決戦
激戦のなかで剣を交え、命がけの一撃で勝利を手にした。
`;

    const scenes = analyzer.segmentScenes(manuscript);
    expect(scenes.length).toBe(3);
    expect(scenes[0].text).toContain('希望の船出');
    expect(scenes[1].text).toContain('突如の暗雲');
    expect(scenes[2].text).toContain('決戦');
  });

  it('scores positive and negative emotions accurately and computes valence', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const positiveText = '仲間と共に得た勝利と喜び。愛と希望に満ちた平和な祝福の日々。';
    const resultPos = analyzer.analyze(positiveText);

    expect(resultPos.scenes.length).toBeGreaterThan(0);
    expect(resultPos.scenes[0].positiveScore).toBeGreaterThan(0);
    expect(resultPos.scenes[0].negativeScore).toBe(0);
    expect(resultPos.scenes[0].valence).toBeGreaterThan(0);
    expect(resultPos.summary.dominantEmotion).toBe('positive');

    const negativeText = '恐れと恐怖、悲しみに満ちた絶望の闇。裏切りと破滅が襲いかかる惨劇。';
    const resultNeg = analyzer.analyze(negativeText);

    expect(resultNeg.scenes[0].negativeScore).toBeGreaterThan(0);
    expect(resultNeg.scenes[0].valence).toBeLessThan(0);
    expect(resultNeg.summary.dominantEmotion).toBe('negative');
  });

  it('calculates tension scores and detects climax candidate scene', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const manuscript = `
平和な村で静かに暮らしていた。笑顔が絶えない日々。

===

突如、警報のラッパが鳴り響いた。黒い剣を構えた敵軍が襲撃してきた！

===

決戦の火蓋が切られた！剣と刃が激突し、爆発と閃光が炸裂する命がけの死闘！突撃の一撃！

===

戦いは終わり、人々は安らぎを取り戻した。祝福の歌が流れる。
`;

    const result = analyzer.analyze(manuscript);

    expect(result.scenes.length).toBe(4);
    // Scene 3 (index 2) contains high tension keywords: 決戦, 剣, 刃, 激突, 爆発, 閃光, 命がけ, 死闘, 突撃, 一撃
    expect(result.peakTensionSceneIndex).toBe(2);
    expect(result.scenes[2].isClimaxCandidate).toBe(true);
    expect(result.climaxProgress).toBe(0.75); // Scene 3 out of 4 = 3/4 = 0.75
  });

  it('supports custom lexicon words and weighted definitions', () => {
    const customAnalyzer = new EmotionalArcAnalyzer({
      positiveWords: ['超ラッキー', 'アゲアゲ'],
      negativeWords: ['バッドエンド', 'サゲサゲ'],
      tensionWords: ['ラスボス登場'],
      customWordDefs: [
        { word: '必殺技', category: 'tension', weight: 3.0 },
        { word: '神神しい', category: 'positive', weight: 2.5 },
      ],
    });

    const text = '超ラッキーな展開でアゲアゲ！神神しい光と必殺技でラスボス登場！';
    const result = customAnalyzer.analyze(text);

    expect(result.scenes[0].positiveScore).toBeGreaterThan(0);
    expect(result.scenes[0].tension).toBeGreaterThan(0);
  });
});

describe('EmotionalArcChart', () => {
  it('renders safe SVG fallback string when scene list is empty', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const emptyResult = analyzer.analyze('');
    const chart = new EmotionalArcChart(emptyResult);
    const svg = chart.renderSvgString();

    expect(svg).toContain('<svg');
    expect(svg).toContain('原稿データなし');
    expect(svg).not.toContain('NaN');
  });

  it('renders complete SVG chart with paths, circles, and climax markers', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const manuscript = `
第1幕: 平和な序幕。仲間と平和に微笑む。

===

第2幕: 悲劇の予兆。絶望と裏切り、恐怖が迫る！

===

第3幕: 怒号と激突！決戦の爆発と閃光！命がけのクライマックス突破！
`;

    const result = analyzer.analyze(manuscript);
    const chart = new EmotionalArcChart(result);
    const svg = chart.renderSvgString({ width: 400, height: 200, showClimaxMarker: true });

    expect(svg).toContain('<svg');
    expect(svg).toContain('class="emotional-arc-svg"');
    expect(svg).toContain('stroke="#10b981"'); // Valence line
    expect(svg).toContain('stroke="#f59e0b"'); // Tension line
    expect(svg).toContain('Climax'); // Climax marker label
    expect(svg).not.toContain('NaN');
  });

  it('renders HTML container card for 3-pane right dock integration', () => {
    const analyzer = new EmotionalArcAnalyzer();
    const manuscript = '勝利と笑顔に包まれた幸福な結末。';
    const result = analyzer.analyze(manuscript);
    const chart = new EmotionalArcChart(result);

    const htmlCard = chart.renderHtmlContainer();

    expect(htmlCard).toContain('emotional-arc-card');
    expect(htmlCard).toContain('登場人物感情曲線');
    expect(htmlCard).toContain('ポジティブ優勢');
    expect(htmlCard).toContain('総シーン数');
  });
});

describe('ThreePaneWorkspace Integration', () => {
  it('updates emotional arc result in workspace state on text edit', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: '静かな夜の始まり。',
    });

    const initialState = workspace.getState();
    expect(initialState.emotionalArc).toBeDefined();

    // Edit text with battle and climax
    workspace.onTextChange('決戦の時が来た！剣を構え、爆発と激突の中で勝利を掴め！');

    const updatedState = workspace.getState();
    expect(updatedState.emotionalArc!.scenes.length).toBeGreaterThan(0);
    expect(updatedState.emotionalArc!.summary.peakTensionScore).toBeGreaterThan(0);
  });

  it('renders right pane content with emotional arc chart without modal dialogs', () => {
    const workspace = new ThreePaneWorkspace({
      initialText: '第一章: 絶望からの立ち上がり。笑顔で仲間と未来へ突撃！',
    });

    workspace.setRightTab('emotional-arc');
    const model = workspace.renderWorkspaceModel();

    expect(model.rightPane.activeTab).toBe('emotional-arc');
    expect(model.rightPane.contentHtml).toContain('emotional-arc-card');
    expect(model.rightPane.contentHtml).toContain('svg');
  });
});
