import { describe, it, expect } from 'vitest';
import { AozoraParser } from '../src/core/editor/AozoraParser.js';

describe('AozoraParser', () => {
  it('parses explicit and implicit ruby spans', () => {
    const text = '｜星辰《せいしん》の境界線、漢字《かんじ》の森。';
    const { spans, map } = AozoraParser.parse(text);

    const rubies = spans.filter((s) => s.type === 'ruby');
    expect(rubies.length).toBe(2);
    expect(rubies[0]).toMatchObject({
      type: 'ruby',
      parent: '星辰',
      ruby: 'せいしん',
    });
    expect(rubies[1]).toMatchObject({
      type: 'ruby',
      parent: '漢字',
      ruby: 'かんじ',
    });
  });

  it('parses bouten and ruby-sagari spans', () => {
    const text = 'これは《《重要》》な事項〔ルビ下がり〕である。';
    const { spans } = AozoraParser.parse(text);

    const bouten = spans.find((s) => s.type === 'bouten');
    expect(bouten).toMatchObject({
      type: 'bouten',
      text: '重要',
    });

    const sagari = spans.find((s) => s.type === 'ruby-sagari');
    expect(sagari).toMatchObject({
      type: 'ruby-sagari',
      text: 'ルビ下がり',
    });
  });

  it('parses TCY (縦中横) markup per B1 spec', () => {
    const text = '第［＃縦中横］12［＃縦中横終わり］話、そして［＃「34」は縦中横］の謎。';
    const { spans } = AozoraParser.parse(text);

    const tcySpans = spans.filter((s) => s.type === 'tcy');
    expect(tcySpans.length).toBe(2);
    expect(tcySpans[0]).toMatchObject({
      type: 'tcy',
      text: '12',
    });
    expect(tcySpans[1]).toMatchObject({
      type: 'tcy',
      text: '34',
    });
  });

  it('parses Warichu (割り注) markup per B1 spec', () => {
    const text = '帝国北方軍［＃「副総督を兼任」は割り注］ヴァレリウスは〔割り注：かつての英雄〕進撃した。';
    const { spans } = AozoraParser.parse(text);

    const warichuSpans = spans.filter((s) => s.type === 'warichu');
    expect(warichuSpans.length).toBe(2);
    expect(warichuSpans[0]).toMatchObject({
      type: 'warichu',
      text: '副総督を兼任',
    });
    expect(warichuSpans[1]).toMatchObject({
      type: 'warichu',
      text: 'かつての英雄',
    });
  });

  it('parses hidden comments (// and %%) and excludes them from display text', () => {
    const text = '本文の一行目。// 設定メモ：後で修正する\n本文の二行目%%内緒の伏線%%終わり。';
    const { spans, map } = AozoraParser.parse(text);

    const comments = spans.filter((s) => s.type === 'comment');
    expect(comments.length).toBe(2);
    expect(comments[0]).toMatchObject({
      type: 'comment',
      comment: ' 設定メモ：後で修正する',
    });
    expect(comments[1]).toMatchObject({
      type: 'comment',
      comment: '内緒の伏線',
    });

    // Display text calculation should skip comment text length
    const displaySpans = spans.filter((s) => s.type !== 'comment');
    const displayText = displaySpans.map((s) => ('text' in s ? s.text : s.type === 'ruby' ? s.parent : '')).join('');
    expect(displayText).not.toContain('設定メモ');
    expect(displayText).not.toContain('内緒の伏線');
  });
});
