import type { PoPAuditEngine } from './PoPAuditEngine.js';
import type { ThreePaneView } from './types.js';

/**
 * ThreePaneAuditView provides 3-Pane IDE integrated layout state and rendering
 * strictly complying with the 3-Pane IDE Constitution:
 * 1. Integrated 3-pane view (Left: Navigation/Stream, Middle: Process Canvas, Right: Certificate Inspector)
 * 2. Zero single-use blocking modal dialogs (modalCount = 0)
 * 3. File orthogonality and separation of concerns
 */
export class ThreePaneAuditView {
  private engine: PoPAuditEngine;
  private selectedSequence: number | null = null;
  private activePaneId: string = 'middlePane';

  constructor(engine: PoPAuditEngine) {
    this.engine = engine;
  }

  /**
   * Sets the currently inspected event sequence number in the UI panes.
   */
  selectSequence(sequence: number | null): void {
    const chain = this.engine.getChain();
    if (sequence !== null && (sequence < 0 || sequence >= chain.length)) {
      throw new Error(`Sequence ${sequence} out of bounds`);
    }
    this.selectedSequence = sequence;
  }

  /**
   * Sets active pane ID without opening any standalone modals.
   */
  setActivePane(paneId: 'leftPane' | 'middlePane' | 'rightPane'): void {
    this.activePaneId = paneId;
  }

  /**
   * Renders and returns the constitution-compliant 3-pane view layout state.
   */
  render(): ThreePaneView {
    const chain = this.engine.getChain();
    const events = chain.getEvents();
    const auditResult = this.engine.verifyIntegrity();
    const selectedEvent = this.selectedSequence !== null ? events[this.selectedSequence] : null;
    const selectedProof = this.selectedSequence !== null ? chain.getInclusionProof(this.selectedSequence) : null;

    return {
      leftPane: {
        id: 'leftPane',
        title: 'Audit Stream & Merkle Explorer',
        type: 'event_stream_list',
        data: {
          totalEvents: events.length,
          eventsSummary: events.map((e) => ({
            sequence: e.sequence,
            id: e.id,
            eventType: e.eventType,
            hash: e.hash,
            timestamp: e.timestamp,
          })),
          selectedSequence: this.selectedSequence,
          merkleRoot: auditResult.merkleRoot,
        },
      },
      middlePane: {
        id: 'middlePane',
        title: 'Creation Process Canvas & Timeline',
        type: 'creation_timeline',
        data: {
          activeSequence: this.selectedSequence,
          activeEvent: selectedEvent,
          timelineProgress: events.length > 0 ? ((this.selectedSequence ?? events.length - 1) + 1) / events.length : 0,
          genesisHash: auditResult.genesisHash,
          latestHash: auditResult.latestHash,
        },
      },
      rightPane: {
        id: 'rightPane',
        title: 'PoP Certificate & Verification Inspector',
        type: 'pop_certificate_inspector',
        data: {
          valid: auditResult.valid,
          auditTimestamp: auditResult.auditTimestamp,
          timestampChecks: auditResult.timestampChecks,
          failedSequence: auditResult.failedSequence,
          failureReason: auditResult.failureReason,
          selectedProof,
          logs: auditResult.logs,
          inlineExportAvailable: true,
          inlineImportAvailable: true,
        },
      },
      activePaneId: this.activePaneId,
      modalCount: 0, // Explicitly guaranteed 0 per constitution rule
    };
  }
}
