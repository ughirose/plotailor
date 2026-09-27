import { describe, it, expect, beforeEach } from 'vitest';
import { SceneOutliner } from '../src/core/editor/SceneOutliner.js';
import { ThreePaneWorkspace } from '../src/core/workspace/ThreePaneWorkspace.js';

describe('SceneOutliner Engine', () => {
  let outliner: SceneOutliner;

  beforeEach(() => {
    outliner = new SceneOutliner({
      knownCharacters: ['ヴァレリウス将軍', 'アーサー', 'エレナ'],
      knownLocations: ['王都', '北の砦'],
    });
  });

  describe('Scene transition marker detection', () => {
    it('should parse text with default explicit markers like *** and ◆◆◆', () => {
      const text = `第一章の開始。王都にて朝を迎えた。
***
第二章の開始。ヴァレリウス将軍が立ち上がった。
◆◆◆
第三章の開始。アーサーが駆け込んできた。`;

      const scenes = outliner.parse(text);

      expect(scenes).toHaveLength(3);
      expect(scenes[0].index).toBe(1);
      expect(scenes[0].marker).toBe('開始');
      expect(scenes[0].rawContent).toContain('第一章の開始');

      expect(scenes[1].index).toBe(2);
      expect(scenes[1].marker).toBe('***');
      expect(scenes[1].rawContent).toContain('第二章の開始');

      expect(scenes[2].index).toBe(3);
      expect(scenes[2].marker).toBe('◆◆◆');
      expect(scenes[2].rawContent).toContain('第三章の開始');
    });

    it('should detect 3+ consecutive blank lines as scene transitions', () => {
      const text = `シーン１のテキスト。
王都の広場にて。



シーン２のテキスト。3行空きで遷移。




シーン３のテキスト。4行空きで遷移。`;

      const scenes = outliner.parse(text);

      expect(scenes).toHaveLength(3);
      expect(scenes[0].marker).toBe('開始');
      expect(scenes[1].marker).toBe('3行空き');
      expect(scenes[1].rawContent).toContain('シーン２のテキスト');
      expect(scenes[2].marker).toBe('4行空き');
      expect(scenes[2].rawContent).toContain('シーン３のテキスト');
    });

    it('should support custom scene transition markers', () => {
      const customOutliner = new SceneOutliner({
        customMarkers: ['[SCENE_BREAK]', '///'],
      });

      const text = `最初の場面。
[SCENE_BREAK]
二番目の場面。
///
三番目の場面。`;

      const scenes = customOutliner.parse(text);

      expect(scenes).toHaveLength(3);
      expect(scenes[1].marker).toBe('[SCENE_BREAK]');
      expect(scenes[2].marker).toBe('///');
    });

    it('should handle custom blank line threshold', () => {
      const thresholdOutliner = new SceneOutliner({
        blankLineThreshold: 2,
      });

      const text = `場面１。


場面２。`;

      const scenes = thresholdOutliner.parse(text);

      expect(scenes).toHaveLength(2);
      expect(scenes[1].marker).toBe('2行空き');
    });
  });

  describe('Leading sentence extraction & line offset metrics', () => {
    it('should extract clean leading sentence stripped of Aozora ruby & bouten', () => {
      const text = `　｜ヴァレリウス将軍《ばれりうすしょうぐん》は《《予言の夜》》に王都へ向かった。
***
　アーサーは「大変だ！」と叫んだ。`;

      const scenes = outliner.parse(text);

      expect(scenes[0].leadingSentence).toBe('ヴァレリウス将軍は予言の夜に王都へ向かった。');
      expect(scenes[1].leadingSentence).toBe('アーサーは「大変だ！」と叫んだ。');
    });

    it('should calculate accurate start/end line numbers, offsets, and character counts', () => {
      const text = `行１
行２
***
行４
行５`;

      const scenes = outliner.parse(text);

      expect(scenes[0].startLine).toBe(1);
      expect(scenes[0].endLine).toBe(2);
      expect(scenes[0].characterCount).toBe(4); // "行１\n行２" -> 4 non-whitespace chars

      expect(scenes[1].startLine).toBe(4);
      expect(scenes[1].endLine).toBe(5);
      expect(scenes[1].characterCount).toBe(4);
    });

    it('should handle empty or whitespace-only input gracefully', () => {
      expect(outliner.parse('')).toEqual([]);
      expect(outliner.parse('   \n\n  ')).toEqual([]);
    });

    it('should truncate leading sentences longer than 60 characters with ellipsis', () => {
      const longSentence = 'あ'.repeat(70) + '。';
      const scenes = outliner.parse(longSentence);
      expect(scenes[0].leadingSentence.endsWith('...')).toBe(true);
      expect(scenes[0].leadingSentence.length).toBe(60);
    });
  });

  describe('Estimated Location & Character extraction NLP heuristics', () => {
    it('should detect explicit location tags and known locations', () => {
      const text = `【場所：執務室】
エレナは静かに本を開いた。
***
北の砦にて軍議が行われた。`;

      const scenes = outliner.parse(text);

      expect(scenes[0].estimatedLocation).toBe('執務室');
      expect(scenes[1].estimatedLocation).toBe('北の砦');
    });

    it('should detect location by particle heuristic (〜にて, 〜へ到着) and suffix heuristic', () => {
      const text = `王都広場にて集会が開かれた。
***
一行は妖精の森へ到着した。
***
地下洞窟の奥へと進む。`;

      const scenes = outliner.parse(text);

      expect(scenes[0].estimatedLocation).toBe('王都広場');
      expect(scenes[1].estimatedLocation).toBe('妖精の森');
      expect(scenes[2].estimatedLocation).toBe('地下洞窟');
    });

    it('should extract known characters and speaker/honorific/katakana patterns', () => {
      const text = `「準備は出来たか」とヴァレリウス将軍が問う。
「はい」とアーサー隊長が答えた。
エレナ皇女は窓の外を眺めていた。`;

      outliner.setKnowledgeBase(['ヴァレリウス将軍', 'アーサー', 'エレナ'], ['王都']);
      const scenes = outliner.parse(text);

      expect(scenes[0].estimatedCharacters).toContain('ヴァレリウス将軍');
      expect(scenes[0].estimatedCharacters).toContain('アーサー');
      expect(scenes[0].estimatedCharacters).toContain('エレナ');
    });

    it('should ignore common pronoun words like 私, 僕, 彼 from character estimation', () => {
      const text = `「私と僕で行こう」と彼が言った。`;
      const scenes = outliner.parse(text);

      expect(scenes[0].estimatedCharacters).not.toContain('私');
      expect(scenes[0].estimatedCharacters).not.toContain('僕');
      expect(scenes[0].estimatedCharacters).not.toContain('彼');
    });
  });

  describe('Right Dock Tree HTML View Renderer', () => {
    it('should render structured right dock HTML tree items for non-modal IDE integration', () => {
      const text = `【場所：王都】
ヴァレリウス将軍は剣を抜いた。
***
【場所：北の砦】
アーサーとエレナが合流した。`;

      const scenes = outliner.parse(text);
      const html = outliner.renderRightDockTree(scenes);

      expect(html).toContain('class="scene-outliner-dock"');
      expect(html).toContain('全 2 シーン');
      expect(html).toContain('#1');
      expect(html).toContain('📍 王都');
      expect(html).toContain('#2');
      expect(html).toContain('📍 北の砦');
      expect(html).toContain('data-scene-id="scene-1"');
    });

    it('should render empty view when no scenes are present', () => {
      const html = outliner.renderRightDockTree([]);
      expect(html).toContain('scene-outliner-dock empty');
      expect(html).toContain('0 シーン');
    });
  });

  describe('ThreePaneWorkspace Integration', () => {
    it('should integrate scene outliner into workspace state and right dock pane rendering', () => {
      const workspace = new ThreePaneWorkspace({
        initialText: `王都にて物語が始まる。
***
北の砦にて激戦が繰り広げられる。`,
      });

      workspace.setRightTab('scene-outliner');
      const state = workspace.getState();
      expect(state.activeRightTab).toBe('scene-outliner');
      expect(state.scenes).toHaveLength(2);

      const model = workspace.renderWorkspaceModel();
      expect(model.rightPane.activeTab).toBe('scene-outliner');
      expect(model.rightPane.contentHtml).toContain('全 2 シーン');

      // On text change
      workspace.onTextChange(`王都にて物語が始まる。
***
北の砦にて激戦。
◆◆◆
王都城内での決戦。`);

      const updatedState = workspace.getState();
      expect(updatedState.scenes).toHaveLength(3);

      const updatedModel = workspace.renderWorkspaceModel();
      expect(updatedModel.rightPane.contentHtml).toContain('全 3 シーン');
    });
  });
});
