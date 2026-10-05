import { VirtualFileSystem } from '../fs/VirtualFileSystem.js';
import type { ProjectMeta, ChapterMeta } from './ProjectManager.js';
import type { LoreEntity } from '../lore/LoreEntityManager.js';

export interface DuplicateProjectOptions {
  /**
   * Custom title for the duplicated project.
   * If omitted, default behavior appends "（コピー）" to the source title.
   */
  title?: string;
  /**
   * Custom target project ID.
   * If omitted, a unique ID is automatically generated.
   */
  targetProjectId?: string;
}

export interface DuplicateResult {
  sourceProjectId: string;
  targetProjectId: string;
  targetMeta: ProjectMeta;
  idMap: Map<string, string>;
}

export class ProjectDuplicateEngine {
  private vfs: VirtualFileSystem;
  private readonly rootPath = '/projects';

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs;
  }

  /**
   * Generates a pseudo-random unique ID.
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Deeply duplicates a project, remapping all internal entity IDs and foreign key references.
   *
   * @param sourceProjectId ID of the project to duplicate
   * @param options Customization options (title, target ID)
   * @returns DuplicateResult containing target project metadata and ID remapping dictionary
   */
  async duplicateProject(
    sourceProjectId: string,
    options: DuplicateProjectOptions = {}
  ): Promise<DuplicateResult> {
    const sourceDir = `${this.rootPath}/${sourceProjectId}`;
    const sourceMetaPath = `${sourceDir}/project.json`;

    if (!(await this.vfs.exists(sourceMetaPath))) {
      throw new Error(`Source project ${sourceProjectId} not found`);
    }

    const sourceMeta = await this.vfs.readJson<ProjectMeta>(sourceMetaPath);
    const targetProjectId = options.targetProjectId || this.generateId('proj');
    const targetDir = `${this.rootPath}/${targetProjectId}`;

    if (await this.vfs.exists(targetDir)) {
      throw new Error(`Target project directory ${targetDir} already exists`);
    }

    const idMap = new Map<string, string>();
    idMap.set(sourceProjectId, targetProjectId);

    // Prepare target directory structure
    await this.vfs.mkdir(targetDir, true);
    await this.vfs.mkdir(`${targetDir}/manuscript`, true);
    await this.vfs.mkdir(`${targetDir}/lore`, true);
    await this.vfs.mkdir(`${targetDir}/plot`, true);
    await this.vfs.mkdir(`${targetDir}/.pop`, true);

    // 1. Process Lore Entities
    const sourceLorePath = `${sourceDir}/lore/entities.json`;
    let targetLoreEntities: LoreEntity[] = [];

    if (await this.vfs.exists(sourceLorePath)) {
      try {
        const sourceLore = await this.vfs.readJson<LoreEntity[]>(sourceLorePath);
        if (Array.isArray(sourceLore)) {
          // Pass 1: Assign new IDs to all lore entities
          for (const entity of sourceLore) {
            const newEntityId = this.generateId('lore');
            idMap.set(entity.id, newEntityId);
          }

          // Pass 2: Clone entities and remap relation foreign keys
          targetLoreEntities = sourceLore.map((entity) => {
            const newId = idMap.get(entity.id)!;
            const remappedRelations = entity.relations?.map((rel) => ({
              ...rel,
              targetId: idMap.get(rel.targetId) || rel.targetId,
            }));

            return {
              ...entity,
              id: newId,
              updatedAt: Date.now(),
              relations: remappedRelations,
            };
          });
        }
      } catch (err) {
        console.warn(`Failed to process lore entities during duplication:`, err);
      }
    }

    await this.vfs.writeJson(`${targetDir}/lore/entities.json`, targetLoreEntities);

    // 2. Process Chapters & Manuscripts
    const sourceOrderPath = `${sourceDir}/manuscript/order.json`;
    let targetChapters: ChapterMeta[] = [];

    if (await this.vfs.exists(sourceOrderPath)) {
      try {
        const sourceChapters = await this.vfs.readJson<ChapterMeta[]>(sourceOrderPath);
        if (Array.isArray(sourceChapters)) {
          // Pass 1: Assign new IDs to all chapters
          for (const ch of sourceChapters) {
            const newChapterId = this.generateId('ch');
            idMap.set(ch.id, newChapterId);
          }

          // Pass 2: Copy chapter contents and update chapter metadata
          for (const ch of sourceChapters) {
            const newChapterId = idMap.get(ch.id)!;
            const sourceChapterFile = `${sourceDir}/manuscript/${ch.fileName}`;
            const targetFileName = `${newChapterId}.aozora`;
            const targetChapterFile = `${targetDir}/manuscript/${targetFileName}`;

            if (await this.vfs.exists(sourceChapterFile)) {
              let content = await this.vfs.readText(sourceChapterFile);
              // In case chapter content references lore/chapter IDs in text or tags, replace mapped IDs
              idMap.forEach((newId, oldId) => {
                if (oldId !== sourceProjectId && oldId !== targetProjectId) {
                  content = content.replaceAll(oldId, newId);
                }
              });
              await this.vfs.writeText(targetChapterFile, content);
            }

            targetChapters.push({
              ...ch,
              id: newChapterId,
              fileName: targetFileName,
            });
          }
        }
      } catch (err) {
        console.warn(`Failed to process chapters during duplication:`, err);
      }
    }

    await this.vfs.writeJson(`${targetDir}/manuscript/order.json`, targetChapters);

    // 3. Process Plot / Timeline / History assets if present
    const plotEntries = (await this.vfs.exists(`${sourceDir}/plot`))
      ? await this.vfs.readdir(`${sourceDir}/plot`)
      : [];

    for (const entry of plotEntries) {
      if (entry.type === 'file') {
        const sourcePath = entry.path;
        const targetPath = `${targetDir}/plot/${entry.name}`;
        try {
          const content = await this.vfs.readText(sourcePath);
          let remappedContent = content;
          idMap.forEach((newId, oldId) => {
            remappedContent = remappedContent.replaceAll(oldId, newId);
          });
          await this.vfs.writeText(targetPath, remappedContent);
        } catch {
          await this.vfs.copy(sourcePath, targetPath);
        }
      }
    }

    // Process .pop audit logs if present
    const popEntries = (await this.vfs.exists(`${sourceDir}/.pop`))
      ? await this.vfs.readdir(`${sourceDir}/.pop`)
      : [];

    for (const entry of popEntries) {
      if (entry.type === 'file') {
        await this.vfs.copy(entry.path, `${targetDir}/.pop/${entry.name}`);
      }
    }

    // 4. Construct Target Project Metadata
    const now = Date.now();
    const activeChapterId = sourceMeta.activeChapterId
      ? idMap.get(sourceMeta.activeChapterId) || sourceMeta.activeChapterId
      : undefined;

    const targetMeta: ProjectMeta = {
      ...sourceMeta,
      id: targetProjectId,
      title: options.title || `${sourceMeta.title}（コピー）`,
      createdAt: now,
      updatedAt: now,
      activeChapterId,
    };

    await this.vfs.writeJson(`${targetDir}/project.json`, targetMeta);

    return {
      sourceProjectId,
      targetProjectId,
      targetMeta,
      idMap,
    };
  }
}
