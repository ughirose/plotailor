import { describe, it, expect, vi } from 'vitest';
import { ThreePaneWorkspace, WorkerInstance } from '../src/index.js';

describe('ThreePaneWorkspace - 3-Pane Integrated IDE Orchestrator', () => {
  const regulations = [
    {
      canonical: '魔導石',
      forbidden: ['魔道石'],
      category: '魔法',
    },
  ];

  it('initializes with default docked panes adhering to Constitution', () => {
    const workspace = new ThreePaneWorkspace({ regulations });
    const model = workspace.renderWorkspaceModel();

    expect(model.leftPane.activeTab).toBe('world-tree');
    expect(model.rightPane.activeTab).toBe('consistency-inspector');
    expect(model.centerPane.classes).toContain('cm-vertical');
  });

  it('handles text updates, runs Aho-Corasick linter, and formats Aozora ruby', () => {
    const workspace = new ThreePaneWorkspace({ regulations });
    const input = '彼は｜青空《あおぞら》の下で魔道石を拾った。';

    workspace.onTextChange(input, false);

    const state = workspace.getState();
    expect(state.rawText).toBe(input);
    expect(state.diagnostics.length).toBe(1);
    expect(state.diagnostics[0].canonical).toBe('魔導石');

    const model = workspace.renderWorkspaceModel();
    expect(model.centerPane.html).toContain('<ruby>青空<rt>あおぞら</rt></ruby>');
  });

  it('bypasses linter during Japanese IME composition to protect typing flow', () => {
    const workspace = new ThreePaneWorkspace({ regulations });
    const input = '彼は魔道石を';

    // Typing with IME active
    workspace.onTextChange(input, true);
    expect(workspace.getState().isComposing).toBe(true);
    expect(workspace.getState().diagnostics.length).toBe(0);

    // Composition finished
    workspace.onTextChange(input, false);
    expect(workspace.getState().isComposing).toBe(false);
    expect(workspace.getState().diagnostics.length).toBe(1);
  });

  it('performs atomic autoSave to OPFS storage', async () => {
    const workspace = new ThreePaneWorkspace({ initialText: '第１話 原稿テキスト' });
    const saved = await workspace.autoSave();

    expect(saved).toBe(true);
    expect(workspace.getState().lastSavedTimestamp).toBeGreaterThan(0);
  });

  it('switches docked tabs inline without invoking modal dialogs', () => {
    const workspace = new ThreePaneWorkspace();

    workspace.setLeftTab('character-dock');
    workspace.setRightTab('pop-audit');

    const model = workspace.renderWorkspaceModel();
    expect(model.leftPane.activeTab).toBe('character-dock');
    expect(model.rightPane.activeTab).toBe('pop-audit');
    expect(model.rightPane.contentHtml).toContain('監査イベント数');
  });
});
