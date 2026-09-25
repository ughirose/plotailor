/**
 * Web Application Entry Point for Plotailor & WorldCraft IDE
 */

import './styles.css';
import { LandingPageView } from './LandingPageView.js';
import { EditorView } from './EditorView.js';
import { NarrativeNanoDebugView } from './NarrativeNanoDebugView.js';

class App {
  private currentTab: string = 'landing';
  private views: Map<string, any> = new Map();

  constructor() {
    this.initViews();
    this.bindNavigation();
  }

  private initViews(): void {
    const landingContainer = document.getElementById('view-landing');
    const editorContainer = document.getElementById('view-editor');
    const debugContainer = document.getElementById('view-debug');

    if (landingContainer) {
      const landingView = new LandingPageView(landingContainer, (tab) => this.switchTab(tab));
      landingView.render();
      this.views.set('landing', landingView);
    }

    if (editorContainer) {
      const editorView = new EditorView(editorContainer);
      editorView.render();
      this.views.set('editor', editorView);
    }

    if (debugContainer) {
      const debugView = new NarrativeNanoDebugView(debugContainer);
      debugView.render();
      this.views.set('debug', debugView);
    }
  }

  private bindNavigation(): void {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).dataset.tab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });
  }

  public switchTab(tabId: string): void {
    if (this.currentTab === tabId) return;
    this.currentTab = tabId;

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const btnTab = (btn as HTMLElement).dataset.tab;
      if (btnTab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update views
    document.querySelectorAll('.view-container').forEach((el) => {
      el.classList.remove('active');
    });

    const activeContainer = document.getElementById(`view-${tabId}`);
    if (activeContainer) {
      activeContainer.classList.add('active');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Start app once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
