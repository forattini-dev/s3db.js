import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BaseOutputDriver,
  S3OutputDriver,
  FilesystemOutputDriver,
  OutputDriverFactory
} from '#src/plugins/concerns/output-drivers.js';
import { PluginStorage } from '#src/concerns/plugin-storage.js';
import { Client } from '#src/client.class.js';

describe('Output Drivers', () => {
  describe('BaseOutputDriver', () => {
    test('throws on unimplemented methods', async () => {
      const driver = new BaseOutputDriver();

      await expect(driver.write('test.txt', 'data')).rejects.toThrow('write() must be implemented');
      await expect(driver.append('test.txt', 'data')).rejects.toThrow('append() must be implemented');
      await expect(driver.read('test.txt')).rejects.toThrow('read() must be implemented');
      await expect(driver.exists('test.txt')).rejects.toThrow('exists() must be implemented');
      await expect(driver.delete('test.txt')).rejects.toThrow('delete() must be implemented');
      await expect(driver.list()).rejects.toThrow('list() must be implemented');
      await expect(driver.size('test.txt')).rejects.toThrow('size() must be implemented');
    });
  });

  describe('FilesystemOutputDriver', () => {
    let tempDir;
    let driver;

    beforeEach(() => {
      tempDir = path.join(os.tmpdir(), `s3db-test-${Date.now()}`);
      driver = new FilesystemOutputDriver({ basePath: tempDir });
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    test('requires basePath in config', () => {
      expect(() => new FilesystemOutputDriver({})).toThrow('FilesystemOutputDriver requires basePath');
    });

    test('writes file', async () => {
      await driver.write('test.txt', 'hello world');

      const filePath = path.join(tempDir, 'test.txt');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('hello world');
    });

    test('appends to file', async () => {
      await driver.write('test.txt', 'hello');
      await driver.append('test.txt', ' world');

      const content = await driver.read('test.txt');
      expect(content).toBe('hello world');
    });

    test('reads file', async () => {
      await driver.write('test.txt', 'hello world');
      const content = await driver.read('test.txt');
      expect(content).toBe('hello world');
    });

    test('returns null for non-existent file', async () => {
      const content = await driver.read('nonexistent.txt');
      expect(content).toBeNull();
    });

    test('checks if file exists', async () => {
      await driver.write('test.txt', 'hello');
      expect(await driver.exists('test.txt')).toBe(true);
      expect(await driver.exists('nonexistent.txt')).toBe(false);
    });

    test('deletes file', async () => {
      await driver.write('test.txt', 'hello');
      expect(await driver.exists('test.txt')).toBe(true);

      await driver.delete('test.txt');
      expect(await driver.exists('test.txt')).toBe(false);
    });

    test('lists files', async () => {
      await driver.write('file1.txt', 'content1');
      await driver.write('file2.txt', 'content2');

      const files = await driver.list('');
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    test('gets file size', async () => {
      const content = 'hello world';
      await driver.write('test.txt', content);

      const size = await driver.size('test.txt');
      expect(size).toBe(Buffer.byteLength(content));
    });

    test('returns 0 size for non-existent file', async () => {
      const size = await driver.size('nonexistent.txt');
      expect(size).toBe(0);
    });

    test('creates nested directories', async () => {
      await driver.write('dir1/dir2/test.txt', 'nested');

      const content = await driver.read('dir1/dir2/test.txt');
      expect(content).toBe('nested');
    });

    test('handles binary data', async () => {
      const buffer = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
      await driver.write('binary.bin', buffer);

      const size = await driver.size('binary.bin');
      expect(size).toBe(5);
    });
  });

  describe('S3OutputDriver', () => {
    test('requires pluginStorage or client', () => {
      expect(() => new S3OutputDriver({})).toThrow('S3OutputDriver requires either pluginStorage or client');
    });

    test('accepts pluginStorage', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = new S3OutputDriver({ pluginStorage });
      expect(driver.pluginStorage).toBe(pluginStorage);
    });

    test('accepts client', () => {
      const client = new Client({ connectionString: 's3://key:secret@bucket' });
      const driver = new S3OutputDriver({ client });
      expect(driver.client).toBe(client);
    });

    test('generates correct full path with basePath', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = new S3OutputDriver({ pluginStorage, basePath: 'exports' });

      const fullPath = driver._getFullPath('test.txt');
      expect(fullPath).toBe('exports/test.txt');
    });

    test('generates correct full path without basePath', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = new S3OutputDriver({ pluginStorage });

      const fullPath = driver._getFullPath('test.txt');
      expect(fullPath).toBe('test.txt');
    });
  });

  describe('OutputDriverFactory', () => {
    test('creates FilesystemOutputDriver', () => {
      const driver = OutputDriverFactory.create({
        driver: 'filesystem',
        path: '/tmp/test'
      });

      expect(driver).toBeInstanceOf(FilesystemOutputDriver);
    });

    test('creates S3OutputDriver with pluginStorage', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = OutputDriverFactory.create({
        driver: 's3',
        pluginStorage
      });

      expect(driver).toBeInstanceOf(S3OutputDriver);
      expect(driver.pluginStorage).toBe(pluginStorage);
    });

    test('creates S3OutputDriver with connectionString', () => {
      const driver = OutputDriverFactory.create({
        driver: 's3',
        connectionString: 's3://key:secret@bucket'
      });

      expect(driver).toBeInstanceOf(S3OutputDriver);
      expect(driver.client).toBeDefined();
    });

    test('throws for S3 without pluginStorage or connectionString', () => {
      expect(() => OutputDriverFactory.create({ driver: 's3' }))
        .toThrow('S3 driver requires either connectionString or pluginStorage');
    });

    test('throws for filesystem without path', () => {
      expect(() => OutputDriverFactory.create({ driver: 'filesystem' }))
        .toThrow('Filesystem driver requires path');
    });

    test('throws for unknown driver', () => {
      expect(() => OutputDriverFactory.create({ driver: 'unknown' }))
        .toThrow('Unknown output driver: unknown');
    });

    test('defaults to s3 driver', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = OutputDriverFactory.create({ pluginStorage });

      expect(driver).toBeInstanceOf(S3OutputDriver);
    });

    test('passes basePath to driver', () => {
      const pluginStorage = { getPluginKey: () => 'key' };
      const driver = OutputDriverFactory.create({
        driver: 's3',
        path: 'exports',
        pluginStorage
      });

      expect(driver.basePath).toBe('exports');
    });
  });
});
