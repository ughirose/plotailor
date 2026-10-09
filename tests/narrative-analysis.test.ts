import { describe, it, expect } from 'vitest';
import { PlotailorIDE } from '../src/index.js';

describe('PlotailorIDE Narrative Context Analysis Integration', () => {
  it('dispatches analyzeText through NarrativeBridge and discriminates dialogue, monologue, and citations', async () => {
    const ide = new PlotailorIDE();

    // 1. Standard Dialogue
    const diaRes = await ide.analyzeText('「そんなことはないさ」と彼は微笑んだ。');
    expect(diaRes.success).toBe(true);
    expect(diaRes.result).toBeDefined();
    expect(diaRes.result!.dialogueRatio).toBeGreaterThan(0.4);
    expect(diaRes.result!.hasCitations).toBe(false);

    // 2. Citation in Brackets (Zero False Positive Dialogue)
    const citRes = await ide.analyzeText('彼は夏目漱石の「坊っちゃん」を読みふけっていた。');
    expect(citRes.success).toBe(true);
    expect(citRes.result).toBeDefined();
    expect(citRes.result!.hasCitations).toBe(true);
    expect(citRes.result!.dialogueRatio).toBe(0.0); // Dialogue ratio must be 0 for citation!

    // 3. Inner Monologue
    const monRes = await ide.analyzeText('（これで本当によかったのだろうか）と彼女は自問した。');
    expect(monRes.success).toBe(true);
    expect(monRes.result).toBeDefined();
    expect(monRes.result!.hasMonologues).toBe(true);
    expect(monRes.result!.dialogueRatio).toBe(0.0);

    // 4. Pure Narrative
    const narRes = await ide.analyzeText('下人は羅生門の下で雨やみを待っていた。');
    expect(narRes.success).toBe(true);
    expect(narRes.result).toBeDefined();
    expect(narRes.result!.dialogueRatio).toBe(0.0);
    expect(narRes.result!.hasCitations).toBe(false);
    expect(narRes.result!.hasMonologues).toBe(false);
  });
});
