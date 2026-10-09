import { describe, it, expect, beforeEach } from 'vitest';
import { FileSystemAccessAdapter } from '../src/core/fs/adapters/FileSystemAccessAdapter.js';
import { MockFileSystemDirectoryHandle } from './mocks/MockFileSystemAccess.js';

describe('FileSystemAccessAdapter', () => {
  let rootMock: MockFileSystemDirectoryHandle;
  let adapter: FileSystemAccessAdapter;

  beforeEach(() => {
    rootMock = new MockFileSystemDirectoryHandle('my-project-root');
    adapter = new FileSystemAccessAdapter({ rootHandle: rootMock as unknown as FileSystemDirectoryHandle });
  });

  it('correctly reports existence of root and nested files/directories', async () => {
    expect(await adapter.exists('/')).toBe(true);
    expect(await adapter.exists('/manuscript')).toBe(false);

    await adapter.mkdir('/manuscript', true);
    expect(await adapter.exists('/manuscript')).toBe(true);

    await adapter.writeText('/manuscript/ch1.aozora', '第一行の文章。');
    expect(await adapter.exists('/manuscript/ch1.aozora')).toBe(true);
    expect(await adapter.exists('/manuscript/ch2.aozora')).toBe(false);
  });

  it('reads and writes UTF-8 text and binary data', async () => {
    const textContent = '吾輩は猫である。名前はまだ無い。\nどこで生れたかとんと見当がつかぬ。';
    await adapter.writeText('/novel.txt', textContent);

    const readBack = await adapter.readText('/novel.txt');
    expect(readBack).toBe(textContent);

    const stat = await adapter.stat('/novel.txt');
    expect(stat.type).toBe('file');
    expect(stat.size).toBeGreaterThan(0);

    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    await adapter.writeFile('/bin/data.bin', binaryData);
    const readBinary = await adapter.readFile('/bin/data.bin');
    expect(readBinary).toEqual(binaryData);
  });

  it('lists directory entries and supports subdirectories', async () => {
    await adapter.writeText('/order.json', '[]');
    await adapter.writeText('/lore/world.json', '{}');
    await adapter.writeText('/lore/characters.json', '[]');

    const rootEntries = await adapter.readdir('/');
    expect(rootEntries.some((e) => e.name === 'order.json' && e.type === 'file')).toBe(true);
    expect(rootEntries.some((e) => e.name === 'lore' && e.type === 'directory')).toBe(true);

    const loreEntries = await adapter.readdir('/lore');
    expect(loreEntries.length).toBe(2);
    expect(loreEntries.map((e) => e.name)).toContain('world.json');
    expect(loreEntries.map((e) => e.name)).toContain('characters.json');
  });

  it('unlinks files and removes directories', async () => {
    await adapter.writeText('/temp.txt', 'to be deleted');
    expect(await adapter.exists('/temp.txt')).toBe(true);

    await adapter.unlink('/temp.txt');
    expect(await adapter.exists('/temp.txt')).toBe(false);

    await adapter.mkdir('/empty_dir', true);
    expect(await adapter.exists('/empty_dir')).toBe(true);

    await adapter.rmdir('/empty_dir');
    expect(await adapter.exists('/empty_dir')).toBe(false);
  });

  it('defensively normalizes complex paths with slashes and separators', async () => {
    await adapter.writeText('\\windows\\style\\path.txt', 'windows path');
    expect(await adapter.exists('/windows/style/path.txt')).toBe(true);
    expect(await adapter.readText('windows/style/path.txt')).toBe('windows path');
  });
});
