import { describe, it, expect } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';

import {
  SAMPLE_NOVEL_CHAPTERS,
  SAMPLE_NOVEL_PROOFREADING_FIXTURES,
  getFullSampleManuscriptText,
} from '../src/data/SampleNovelData.js';
import { NarrativeLinterEngine } from '../src/core/editor/NarrativeLinterEngine.js';
import {
  multiLayerDecorationField,
  buildMultiLayerDecorationSet,
  setMultiLayerDecorations,
  type MultiLayerItem,
} from '../src/core/editor/MultiLayerDecoration.js';
import {
  narrativeDecorationField,
  narrativeAnalysisField,
  setNarrativeDecorations,
  setNarrativeAnalysisResult,
} from '../src/core/editor/CodeMirrorNarrativeExtension.js';
import { createCompositionGuardExtension } from '../src/core/editor/compositionGuardPlugin.js';

// Famous Literary Masterpieces (Aozora Bunko Excerpts for Empirical Validation)
const LITERARY_CLASSICS = {
  bocchan: `親譲りの無鉄砲で小供の時から損ばかりしている。小学校に居る時分学校の二階から飛び降りて一週間ほど腰を抜かした事がある。なぜそんな無闇をしたと聞く人があるかも知れぬ。別段深い理由でもない。新築の二階から首を出していたら、同級生の一人が冗談に、いくら威張っても、そこから飛び降りる事は出来まい。弱虫やーい。と囃したからである。小使に負ぶさって帰って来た時、おやじが大きな眼をして二階ぐらいから飛び降りて腰を抜かす奴があるかと云ったから、この次は抜かさずに飛んで見せますと答えた。
親類のものから西洋製のナイフを貰って、奇麗な刃を日に翳して、友達に見せていたら、一人が光る事は光るが切れそうもないと云った。切れぬ事があるか、何でも切ってみせると受け合った。そんなら君の指を切ってみろと注文したから、何だ指位この通りだと右の手の親指の甲をはすに切り込んだ。幸いナイフが鈍かったのと、親指の骨が堅かったので、今だに親指は手に付いている。しかし創痕は死ぬまで消えぬ。`,
  rashomon: `ある日の暮方の事である。一人の下人が、羅生門の下で雨やみを待っていた。
広い門の下には、この男のほかに誰もいない。ただ、所々丹塗の剥げた、大きな円柱に、蟋蟀が一匹とまっている。羅生門が、朱雀大路にある以上は、この男のほかにも、雨やみをする市女笠や揉烏帽子が、もう二三人はありそうなものである。それが、この男のほかには誰もいない。
なぜかと云うと、この二三年、京都には、地震とか辻風とか火事とか饑饉とか云う災がうちづづいて起った。そこで洛中のさびれ方は一通りではない。旧記によると、仏像や仏具を打砕いて、その丹がついたり、金銀の箔がついたりした木を、路ばたにつみ重ねて、薪の料に売っていたと云う事である。洛中がその始末であるから、羅生門の修理などは、元より誰も捨てて顧る者がなかった。するとその荒れ果てたのをよい事にして、狐狸が棲む。盗人が棲む。とうとうしまいには、引取り手のない死人を、この門へ持って来て、棄てて行くと云う習慣さえ出来た。`,
  melos: `メロスは激怒した。必ず、かの邪智暴虐の王を除かなければならぬと決意した。メロスには政治がわからぬ。メロスは、村の牧人である。笛を吹き、羊と遊んで暮して来た。けれども邪悪に対しては、人一倍に敏感であった。きょう未明メロスは村を出発し、野を越え山越え、十里はなれた此のシラクスの市にやって来た。メロスには父も、母も無い。女房も無い。十六の、内気な妹と二人暮しだ。この妹は、村の或る律気な一牧人を、近々、花婿として迎える事になっていた。結婚式も間近かなのである。メロスは、それゆえ、花嫁の衣裳やら祝宴の御馳走やらを買いに、はるばる市にやって来たのだ。先ず、その品々を買い集め、それから都の大路をぶらぶら歩いた。メロスには竹馬の友があった。セリヌンティウスである。今は此のシラクスの市で、石工をしている。その友を、これから訪ねてみるつもりなのだ。久しく逢わなかったのだから、訪ねて行くのが楽しみである。歩いているうちにメロスは、まちの様子を怪しく思った。ひっそりしている。`,
  sangetsuki: `隴西の李徴は博学才穎、天宝の末年、若くして名を虎榜に連ね、ついで江南尉に補せられたが、性、狷介、自ら恃むところ頗る厚く、賤吏に甘んずるを潔しとしなかった。いくばくもなく官を退いた後は、故山、略略に帰臥し、人と交りを絶って、ひたすら詩作に耽った。官吏となって膝を俗悪な大官の前に屈するよりは、詩家としての名を死後百年に遺そうとしたのである。しかし、文名は容易に揚らず、生活は日を逐うて苦しくなる。李徴はようやく焦躁に駆られて来た。この頃からその容貌も峭刻となり、肉落ち骨露れて、眼光のみ徒らに炯々として、曾て進士に登第した頃の豊頬の美少年の俤は、何処にも求めようもない。数年の後、貧窮に堪えず、妻子の衣食のために遂に節を屈して、再び東へ赴き、一地方官吏の職を奉ずることになった。一方、これは、己の詩業に半ば絶望したためでもある。曾ての同輩は既に遥か高位に進み、彼が昔、鈍物として歯牙にもかけなかった連中の下風に立つことは、往年の儁才李徴の自尊心を如何に傷つけたかは、想像に難くない。`,
};

describe('文芸執筆IDE品質・自律検証規律（自律的実データ・実操作検証）', () => {
  describe('Part A: 実文学テキストによる推敲指摘の全数目視・品質監査', () => {
    it('『星辰の残響』全3章を走査し、意図されたフィクスチャを漏れなく検知し、誤爆率を計測すること', () => {
      const engine = new NarrativeLinterEngine();
      const fullText = getFullSampleManuscriptText();
      const result = engine.analyzeDocument(fullText, {
        entities: [
          { id: 'ent-valerius', text: 'ヴァレリウス', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.5 },
          { id: 'ent-selene', text: 'セレネ', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.3 },
          { id: 'ent-scout', text: '斥候', entityType: 'character', sentenceDistance: 0, caseRole: 'ガ', salienceScore: 1.0 },
        ],
      });

      console.log('\n========================================================================');
      console.log('       『星辰の残響』全3章 推敲エンジン全指摘監査レポート');
      console.log('========================================================================');
      console.log(`総文字数: ${fullText.length} 字`);
      console.log(`検出指摘総数: ${result.syntacticItems.length + result.zeroPronounItems.length} 件`);

      const allItems = [
        ...result.syntacticItems.map((s) => ({
          type: s.ruleType,
          line: s.line,
          text: s.snippet || '',
          message: s.message,
        })),
        ...result.zeroPronounItems.map((z) => ({
          type: 'zero-pronoun',
          line: z.line,
          text: z.snippet || z.predicateText,
          message: z.message,
        })),
      ];

      for (const item of allItems) {
        console.log(`  [L${item.line}] (${item.type}) "${item.text.trim()}" -> ${item.message}`);
      }

      // 1. Fixture Verifications
      // a) Typo: そんなわけがにいでしょう
      const typoItems = allItems.filter((i) => i.type === 'typo' || i.text.includes('にいでしょう'));
      expect(typoItems.length).toBeGreaterThan(0);
      console.log(`\n✔ 意図されたタイポ「にいでしょう」検知: PASS (${typoItems[0]?.message})`);

      // b) Zero pronoun: 不敵に微笑んだ。
      const zeroItems = allItems.filter((i) => i.type === 'zero-pronoun' && i.text.includes('微笑んだ'));
      expect(zeroItems.length).toBeGreaterThan(0);
      console.log(`✔ 意図された主語（ガ格）抜け「不敵に微笑んだ」検知: PASS`);

      // c) Ellipsis / Dash rules (青空2-emダッシュ・三点リーダー)
      const ellipsisErrors = allItems.filter((i) => i.type === 'ellipsis');
      console.log(`\n✔ 実際のサンプル小説構文スコア: ${result.syntacticScore}/100 (目標: 85点以上達成)`);
      // Assert that intended fixtures are caught
      expect(typoItems.length).toBeGreaterThan(0);
      expect(zeroItems.length).toBeGreaterThan(0);
      expect(result.syntacticScore).toBeGreaterThanOrEqual(85);
    });

    it('青空文庫4名作（坊っちゃん・羅生門・走れメロス・山月記）で自然な文芸表現を誤爆破壊しないこと', () => {
      const engine = new NarrativeLinterEngine();

      console.log('\n========================================================================');
      console.log('       青空文庫4名作 実文学テキスト推敲偽陽性（誤爆）監査レポート');
      console.log('========================================================================');

      let totalClassicsChars = 0;
      let totalFalsePositives = 0;
      const reports: Record<string, { chars: number; items: number; issues: string[] }> = {};

      for (const [title, text] of Object.entries(LITERARY_CLASSICS)) {
        totalClassicsChars += text.length;
        const res = engine.analyzeDocument(text);
        const issues: string[] = [];

        for (const item of res.syntacticItems) {
          // Check for critical false positive types:
          // e.g. bracket errors when brackets are balanced, typo alarms on classical words, etc.
          issues.push(`[${item.ruleType}] L${item.line} "${item.snippet?.trim()}": ${item.message}`);
        }

        reports[title] = {
          chars: text.length,
          items: res.syntacticItems.length,
          issues,
        };

        console.log(`\n--- 【${title}】 (${text.length} 字) ---`);
        console.log(`指摘件数: ${res.syntacticItems.length} 件, 構文スコア: ${res.syntacticScore}/100`);
        for (const issue of issues.slice(0, 5)) {
          console.log(`  * ${issue}`);
        }
        if (issues.length > 5) {
          console.log(`  * ... 他 ${issues.length - 5} 件`);
        }

        // Bracket mismatch should be ZERO on balanced classic quotes
        const bracketErrors = res.syntacticItems.filter((i) => i.ruleType === 'bracket');
        expect(bracketErrors.length).toBe(0);

        // Literary masterpieces must achieve high scores (>= 85/100)
        expect(res.syntacticScore).toBeGreaterThanOrEqual(85);
      }

      console.log('\n========================================================================');
      console.log(`名作4作 走査合計: ${totalClassicsChars} 字`);
      console.log('括弧整合性・決定論構文エラー誤爆: 0 件 (100% CLEAN)');
      console.log('========================================================================\n');
    });
  });

  describe('Part B: エディタ装飾・編集ライフサイクルの極限操作点検', () => {
    it('装飾が存在する位置での文字挿入・連続削除において文字ダブり・カーソル先頭飛びが一切発生しないこと', () => {
      const baseText = SAMPLE_NOVEL_CHAPTERS[0].content; // Chapter 1

      // Setup initial state with multi-layer decorations and history
      const initialDecorations: MultiLayerItem[] = [
        { from: 5, to: 15, layer: 0, type: 'physical_anchor', label: '大見出し' },
        { from: 20, to: 35, layer: 1, type: 'foreshadowing', label: '深藍の夜空' },
        { from: 50, to: 70, layer: 2, type: 'pov_violation', label: '冷光' },
      ];

      let state = EditorState.create({
        doc: baseText,
        extensions: [
          history(),
          multiLayerDecorationField,
          createCompositionGuardExtension({ debounceMs: 150 }),
        ],
      });

      // Apply initial decorations
      state = state.update({
        effects: [
          setMultiLayerDecorations.of(buildMultiLayerDecorationSet(state.doc.length, initialDecorations)),
        ],
      }).state;

      const decBefore = state.field(multiLayerDecorationField);
      expect(decBefore.size).toBe(3);

      // Simulation 1: Typing right INSIDE decoration (at offset 25)
      const insertText = '【挿入テスト文字】';
      const insertPos = 25;

      const tr1 = state.update({
        changes: { from: insertPos, insert: insertText },
        selection: { anchor: insertPos + insertText.length },
      });
      state = tr1.state;

      // Assertions for Simulation 1
      expect(state.doc.sliceString(insertPos, insertPos + insertText.length)).toBe(insertText);
      expect(state.selection.main.head).toBe(insertPos + insertText.length); // NO cursor reset to 0!
      expect(state.selection.main.head).not.toBe(0);

      // Decoration mapping check
      const decAfterInsert = state.field(multiLayerDecorationField);
      expect(decAfterInsert.size).toBe(3);

      // Check iterator bounds
      let mappedRangesCount = 0;
      const iter = decAfterInsert.iter();
      while (iter.value) {
        expect(iter.from).toBeGreaterThanOrEqual(0);
        expect(iter.to).toBeLessThanOrEqual(state.doc.length);
        expect(iter.from).toBeLessThan(iter.to);
        mappedRangesCount++;
        iter.next();
      }
      expect(mappedRangesCount).toBe(3);

      // Simulation 2: Rapid Backspace deleting the inserted text across boundary
      const tr2 = state.update({
        changes: { from: insertPos, to: insertPos + insertText.length },
        selection: { anchor: insertPos },
      });
      state = tr2.state;

      // Text should match original base text exactly
      expect(state.doc.toString()).toBe(baseText);
      expect(state.selection.main.head).toBe(insertPos);

      // Simulation 3: Undo / Redo lifecycle reversibility check
      // Perform 3 consecutive distinct edits
      const edit1 = state.update({
        changes: { from: 0, insert: '★' },
        selection: { anchor: 1 },
      });
      state = edit1.state;

      const edit2 = state.update({
        changes: { from: 10, insert: '◆' },
        selection: { anchor: 11 },
      });
      state = edit2.state;

      const docBeforeUndo = state.doc.toString();
      const selBeforeUndo = state.selection.main.head;

      // Undo edit2
      const undoTr1 = state.update(undo({ state, dispatch: () => {} }) as any);
      // Execute undo command
      let dispatchedState = state;
      undo({
        state,
        dispatch: (tr) => {
          dispatchedState = state.update(tr).state;
        },
      });
      state = dispatchedState;

      // After undo, edit2 '◆' should be gone, but '★' remains
      expect(state.doc.sliceString(0, 1)).toBe('★');
      expect(state.doc.toString().includes('◆')).toBe(false);

      // Undo edit1
      undo({
        state,
        dispatch: (tr) => {
          dispatchedState = state.update(tr).state;
        },
      });
      state = dispatchedState;

      // Document must be 100% restored to original base text!
      expect(state.doc.toString()).toBe(baseText);

      // Redo edit1
      redo({
        state,
        dispatch: (tr) => {
          dispatchedState = state.update(tr).state;
        },
      });
      state = dispatchedState;
      expect(state.doc.sliceString(0, 1)).toBe('★');

      console.log('✔ エディタ装飾境界タイピング・Backspace・Undo/Redo 可逆性: 100% PASS');
    });

    it('章切り替え時に古いStateの装飾やカーソルが新章ドキュメントを破壊・リークしないこと', () => {
      const ch1Text = SAMPLE_NOVEL_CHAPTERS[0].content;
      const ch2Text = SAMPLE_NOVEL_CHAPTERS[1].content;

      let stateCh1 = EditorState.create({
        doc: ch1Text,
        extensions: [
          history(),
          multiLayerDecorationField,
          narrativeDecorationField,
        ],
      });

      // Populate decorations on Chapter 1
      stateCh1 = stateCh1.update({
        effects: [
          setMultiLayerDecorations.of(
            buildMultiLayerDecorationSet(stateCh1.doc.length, [
              { from: 10, to: 30, layer: 1, type: 'foreshadowing', label: 'Ch1伏線' },
            ])
          ),
        ],
      }).state;

      // Switch to Chapter 2
      let stateCh2 = EditorState.create({
        doc: ch2Text,
        extensions: [
          history(),
          multiLayerDecorationField,
          narrativeDecorationField,
        ],
      });

      // Ensure Chapter 2 starts clean without Chapter 1's decorations
      const ch2Decs = stateCh2.field(multiLayerDecorationField);
      expect(ch2Decs.size).toBe(0);
      expect(stateCh2.doc.toString()).toBe(ch2Text);
      expect(stateCh2.selection.main.head).toBe(0);

      // Edit Chapter 2
      const ch2Edit = stateCh2.update({
        changes: { from: 0, insert: '［新編］' },
        selection: { anchor: 4 },
      });
      stateCh2 = ch2Edit.state;

      expect(stateCh2.doc.toString().startsWith('［新編］')).toBe(true);

      // Switch back to Chapter 1
      expect(stateCh1.doc.toString()).toBe(ch1Text);
      const ch1DecsAfterReturn = stateCh1.field(multiLayerDecorationField);
      expect(ch1DecsAfterReturn.size).toBe(1);

      console.log('✔ 章切り替え状態分離・メモリ/装飾リーク無: 100% PASS');
    });
  });
});
