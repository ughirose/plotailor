# wif_storyboard_exporter.ts

/**
 * Story-to-Storyboard Production Pipeline (WIF: Webtoon/Illustration Interchange Format)
 * Exports narrative events, character state vectors, and staging directions to Figma and Clip Studio Paint.
 */

export interface CharacterSchema {
  id: string;
  name: string;
  bodyStatus: {
    leftArm: "healthy" | "injured" | "broken" | "lost";
    rightArm: "healthy" | "injured" | "broken" | "lost";
    mobility: "normal" | "impaired" | "incapacitated";
  };
  heldItems: string[];
}

export interface StagingCutSpec {
  cutIndex: number;
  sceneId: string;
  povCharacterId: string;
  characters: Array<{
    characterId: string;
    actionDescription: string;
    heldItems: string[];
    facialExpression: string;
    facingDirection: "left" | "right" | "front" | "back";
  }>;
  continuityAlerts: string[];
  dialogueSnippet: string;
}

export interface WIFExportPayload {
  version: "1.0.0";
  title: string;
  generatedAt: string;
  scenes: Array<{
    sceneIndex: number;
    locationName: string;
    timeOfDay: string;
    cuts: StagingCutSpec[];
  }>;
}

export class StoryboardPipeline {
  public static exportToClipStudio(payload: WIFExportPayload): string {
    const lines: string[] = [];
    lines.push(`# STORYBOARD EXPORT: ${payload.title}`);
    lines.push(`// Generated at: ${payload.generatedAt}`);
    lines.push("");

    for (const scene of payload.scenes) {
      lines.push(`## SCENE ${scene.sceneIndex}: ${scene.locationName} (${scene.timeOfDay})`);
      for (const cut of scene.cuts) {
        lines.push(`[CUT ${cut.cutIndex}] POV: ${cut.povCharacterId}`);
        lines.push(`- 台詞: "${cut.dialogueSnippet}"`);
        for (const c of cut.characters) {
          lines.push(`  * ${c.characterId} (${c.facingDirection}, 表情:${c.facialExpression}): ${c.actionDescription}`);
          if (c.heldItems.length > 0) {
            lines.push(`    所持品: ${c.heldItems.join(", ")}`);
          }
        }
        if (cut.continuityAlerts.length > 0) {
          lines.push(`  ! 連続性警告: ${cut.continuityAlerts.join(" / ")}`);
        }
        lines.push("");
      }
    }
    return lines.join("\n");
  }
}
