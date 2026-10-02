import type { SceneFrontmatter, TimelineSyncEvent } from '../../types/frontmatter-scene.js';

function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey = '';
  let isCurrentArray = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for malformed bracket/array syntax
    if (trimmed.includes('[') && !trimmed.includes(']')) {
      throw new Error(`Malformed YAML: unclosed array bracket at line ${i + 1}`);
    }

    if (trimmed.startsWith('-') && isCurrentArray && currentKey) {
      let val = trimmed.replace(/^-\s*/, '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      (result[currentKey] as unknown[]).push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();

      if (!val) {
        // Likely start of list or object
        currentKey = key;
        isCurrentArray = true;
        result[key] = [];
      } else {
        isCurrentArray = false;
        currentKey = '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          result[key] = val.slice(1, -1);
        } else if (!isNaN(Number(val)) && val !== '') {
          result[key] = Number(val);
        } else if (val === 'true') {
          result[key] = true;
        } else if (val === 'false') {
          result[key] = false;
        } else {
          result[key] = val;
        }
      }
    }
  }

  return result;
}

/**
 * Parses YAML frontmatter from scene markdown or prose text.
 */
export function parseFrontmatter(text: string): { frontmatter: SceneFrontmatter | null; content: string } {
  const frontmatterRegex = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;
  const match = text.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: null, content: text };
  }

  const yamlString = match[1];
  const content = text.slice(match[0].length);

  try {
    const parsed = parseSimpleYaml(yamlString);
    return { frontmatter: parsed as SceneFrontmatter, content };
  } catch (e) {
    console.warn('Failed to parse YAML frontmatter:', e);
    return { frontmatter: null, content };
  }
}

/**
 * Calculates continuous ticks (milliseconds) from frontmatter date or scalarTime.
 * Provides a fallback for fictional calendars or relative time expressions.
 */
export function calculateObjectiveTicks(frontmatter: SceneFrontmatter | null): number {
  if (!frontmatter) {
    return 0;
  }

  if (frontmatter.scalarTime !== undefined) {
    return frontmatter.scalarTime;
  }

  if (frontmatter.date) {
    const dateParsed = Date.parse(frontmatter.date);
    if (!isNaN(dateParsed)) {
      return dateParsed;
    }

    // Fallback for fictional calendar: deterministic hash
    let hash = 0;
    for (let i = 0; i < frontmatter.date.length; i++) {
      hash = (hash << 5) - hash + frontmatter.date.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) * 1000 * 60 * 60 * 24;
  }

  return 0;
}

/**
 * Generates a synchronization event for the dual-axis timeline based on frontmatter data.
 */
export function generateTimelineSyncEvent(sceneId: string, frontmatter: SceneFrontmatter | null): TimelineSyncEvent {
  const scalarTime = calculateObjectiveTicks(frontmatter);
  return {
    type: 'timeline_sync',
    sceneId,
    scalarTime,
  };
}

/**
 * Strips the YAML frontmatter from the manuscript text for export purposes.
 */
export function stripFrontmatterForExport(text: string): string {
  const frontmatterRegex = /^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/;
  return text.replace(frontmatterRegex, '');
}
