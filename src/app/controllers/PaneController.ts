import { NarrativeTermLocalizer } from '../../core/editor/NarrativeTermLocalizer.js';

export interface PaneControllerDependencies {
  isLeftPaneOpen: () => boolean;
  setLeftPaneOpen: (open: boolean) => void;
  isRightPaneOpen: () => boolean;
  setRightPaneOpen: (open: boolean) => void;
  openSettingsModal: () => void;
  exportFullAozora: (action: 'copy' | 'download') => void;
  openExportModal: () => void;
  exportPoPCertificate: () => void;
  toggleRuby: () => void;
  getRubyMode: () => string;
  toggleWrap: () => void;
  isLineWrapping: () => boolean;
  setActiveRightTab: (tab: string) => void;
  renderRightPane: () => void;
}

export type PaneToggleListener = (pane: 'left' | 'right', open: boolean) => void;

export class PaneController {
  private deps: PaneControllerDependencies;
  private toggleListeners: PaneToggleListener[] = [];
  private localizer = new NarrativeTermLocalizer();

  constructor(deps: PaneControllerDependencies) {
    this.deps = deps;
  }

  public getLocalizer(): NarrativeTermLocalizer {
    return this.localizer;
  }

  public localizeTerm(keyOrTerm: string): string {
    return this.localizer.translateTerm(keyOrTerm);
  }

  public registerPaneToggleListener(listener: PaneToggleListener): void {
    this.toggleListeners.push(listener);
  }

  private notifyToggle(pane: 'left' | 'right', open: boolean): void {
    for (const listener of this.toggleListeners) {
      listener(pane, open);
    }
  }

  public toggleLeftPane(): void {
    const nextOpen = !this.deps.isLeftPaneOpen();
    this.deps.setLeftPaneOpen(nextOpen);
    const pane = document.getElementById('paneLeft');
    const btn = document.getElementById('btnToggleLeftPane');
    const btnCollapse = document.getElementById('btnCollapseLeft');
    if (pane) {
      pane.style.display = '';
      pane.classList.toggle('collapsed', !nextOpen);
    }
    if (btn) btn.classList.toggle('active', nextOpen);
    if (btnCollapse) {
      btnCollapse.textContent = nextOpen ? '◀' : '▶';
      btnCollapse.title = nextOpen ? '左ペインを折りたたむ (◀)' : '左ペインを展開 (▶)';
    }
    this.notifyToggle('left', nextOpen);
  }

  public toggleRightPane(): void {
    const nextOpen = !this.deps.isRightPaneOpen();
    this.deps.setRightPaneOpen(nextOpen);
    const pane = document.getElementById('paneRight');
    const btn = document.getElementById('btnToggleRightPane');
    const btnCollapse = document.getElementById('btnCollapseRight');
    if (pane) {
      pane.style.display = '';
      pane.classList.toggle('collapsed', !nextOpen);
    }
    if (btn) btn.classList.toggle('active', nextOpen);
    if (btnCollapse) {
      btnCollapse.textContent = nextOpen ? '▶' : '◀';
      btnCollapse.title = nextOpen ? '右ペインを折りたたむ (▶)' : '右ペインを展開 (◀)';
    }
    this.notifyToggle('right', nextOpen);
  }

  public initHamburgerMenu(): void {
    const btnMenu = document.getElementById('btnHamburgerMenu');
    const dropdown = document.getElementById('hamburgerDropdown');
    if (!btnMenu || !dropdown) return;

    btnMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = dropdown.style.display !== 'none';
      dropdown.style.display = isVisible ? 'none' : 'flex';
      btnMenu.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
    });

    document.addEventListener('click', (e) => {
      if (!btnMenu.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
        dropdown.style.display = 'none';
        btnMenu.setAttribute('aria-expanded', 'false');
      }
    });

    document.getElementById('menuOpenSettings')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.deps.openSettingsModal();
    });

    document.getElementById('menuExportAozora')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.deps.exportFullAozora('copy');
      this.deps.openExportModal();
    });

    document.getElementById('menuExportPoP')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.deps.exportPoPCertificate();
    });

    document.getElementById('menuToggleRuby')?.addEventListener('click', () => {
      this.deps.toggleRuby();
      const menuStatus = document.getElementById('menuRubyStatus');
      if (menuStatus) {
        const mode = this.deps.getRubyMode();
        menuStatus.textContent = `現在: ${mode === 'normal' ? '通常ルビ' : mode === 'raw' ? '青空記法' : 'ルビ非表示'}`;
      }
    });

    document.getElementById('menuToggleWrap')?.addEventListener('click', () => {
      this.deps.toggleWrap();
      const menuStatus = document.getElementById('menuWrapStatus');
      if (menuStatus) {
        menuStatus.textContent = `現在: ${this.deps.isLineWrapping() ? 'ON' : 'OFF'}`;
      }
    });

    document.getElementById('menuOpenHelp')?.addEventListener('click', () => {
      dropdown.style.display = 'none';
      this.deps.setActiveRightTab('help');
      if (!this.deps.isRightPaneOpen()) {
        this.toggleRightPane();
      }
      this.deps.renderRightPane();
    });
  }

  public initPaneCollapseButtons(): void {
    const btnCollapseLeft = document.getElementById('btnCollapseLeft');
    const btnCollapseRight = document.getElementById('btnCollapseRight');
    const paneLeft = document.getElementById('paneLeft');
    const paneRight = document.getElementById('paneRight');

    btnCollapseLeft?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLeftPane();
    });

    btnCollapseRight?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleRightPane();
    });

    paneLeft?.addEventListener('click', () => {
      if (!this.deps.isLeftPaneOpen()) {
        this.toggleLeftPane();
      }
    });

    paneRight?.addEventListener('click', () => {
      if (!this.deps.isRightPaneOpen()) {
        this.toggleRightPane();
      }
    });
  }

  public initPaneResizers(): void {
    const paneLeft = document.getElementById('paneLeft');
    const paneRight = document.getElementById('paneRight');
    const resizerLeft = document.getElementById('resizerLeft');
    const resizerRight = document.getElementById('resizerRight');

    if (resizerLeft && paneLeft) {
      let isDragging = false;
      resizerLeft.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizerLeft.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging) return;
          const newWidth = Math.max(160, Math.min(500, ev.clientX));
          paneLeft.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          resizerLeft.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    if (resizerRight && paneRight) {
      let isDragging = false;
      resizerRight.addEventListener('mousedown', (e) => {
        isDragging = true;
        resizerRight.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev: MouseEvent) => {
          if (!isDragging) return;
          const newWidth = Math.max(200, Math.min(600, window.innerWidth - ev.clientX));
          paneRight.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          isDragging = false;
          resizerRight.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
  }
}
