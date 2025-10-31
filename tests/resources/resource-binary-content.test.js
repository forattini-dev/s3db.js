/**
 * Binary Content Management Tests
 * Tests setContent, content, hasContent, and deleteContent methods
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createDatabaseForTest } from '../config.js';

describe('Resource - Binary Content Management', () => {
  let database;
  let users;

  beforeEach(async () => {
    database = await createDatabaseForTest('binary-content-test');

    users = await database.createResource({
      name: 'users',
      attributes: {
        id: 'string|optional',
        name: 'string|required',
        email: 'string|required'
      }
    });
  });

  afterEach(async () => {
    if (database?.connected) {
      await database.disconnect();
    }
  });

  describe('setContent()', () => {
    it('should store binary content (Buffer)', async () => {
      // Create user first
      await users.insert({
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com'
      });

      // Store binary content
      const imageBuffer = Buffer.from('fake-image-data');
      const result = await users.setContent({
        id: 'user-1',
        buffer: imageBuffer,
        contentType: 'image/jpeg'
      });

      expect(result._hasContent).toBe(true);
      expect(result._contentLength).toBe(imageBuffer.length);
      expect(result._mimeType).toBe('image/jpeg');
    });

    it('should store text content (string as buffer)', async () => {
      await users.insert({
        id: 'user-2',
        name: 'Jane Doe',
        email: 'jane@example.com'
      });

      const textBuffer = Buffer.from('Hello World');
      await users.setContent({
        id: 'user-2',
        buffer: textBuffer,
        contentType: 'text/plain'
      });

      const content = await users.content('user-2');
      expect(content.buffer.toString()).toBe('Hello World');
      expect(content.contentType).toBe('text/plain');
    });

    it('should throw error if resource does not exist', async () => {
      const buffer = Buffer.from('test');

      await expect(
        users.setContent({
          id: 'non-existent',
          buffer,
          contentType: 'application/octet-stream'
        })
      ).rejects.toThrow("Resource with id 'non-existent' not found");
    });

    it('should use default contentType if not provided', async () => {
      await users.insert({
        id: 'user-3',
        name: 'Test User',
        email: 'test@example.com'
      });

      const buffer = Buffer.from('test data');
      const result = await users.setContent({
        id: 'user-3',
        buffer
        // contentType omitted - should default to 'application/octet-stream'
      });

      expect(result._mimeType).toBe('application/octet-stream');
    });
  });

  describe('content()', () => {
    it('should retrieve binary content', async () => {
      await users.insert({
        id: 'user-4',
        name: 'Content Test',
        email: 'content@example.com'
      });

      const originalBuffer = Buffer.from('binary-data-here');
      await users.setContent({
        id: 'user-4',
        buffer: originalBuffer,
        contentType: 'application/pdf'
      });

      const retrieved = await users.content('user-4');

      expect(retrieved.buffer).toBeInstanceOf(Buffer);
      expect(retrieved.buffer.toString()).toBe('binary-data-here');
      expect(retrieved.contentType).toBe('application/pdf');
    });

    it('should return null buffer if no content exists', async () => {
      const content = await users.content('non-existent-id');

      expect(content.buffer).toBeNull();
      expect(content.contentType).toBeNull();
    });
  });

  describe('hasContent()', () => {
    it('should return true if content exists', async () => {
      await users.insert({
        id: 'user-5',
        name: 'Has Content',
        email: 'has@example.com'
      });

      await users.setContent({
        id: 'user-5',
        buffer: Buffer.from('content'),
        contentType: 'text/plain'
      });

      const hasContent = await users.hasContent('user-5');
      expect(hasContent).toBe(true);
    });

    it('should return false if content does not exist', async () => {
      const hasContent = await users.hasContent('non-existent');
      expect(hasContent).toBe(false);
    });
  });

  describe('deleteContent()', () => {
    it('should delete binary content but preserve metadata', async () => {
      await users.insert({
        id: 'user-6',
        name: 'Delete Test',
        email: 'delete@example.com'
      });

      // Set content
      await users.setContent({
        id: 'user-6',
        buffer: Buffer.from('to-be-deleted'),
        contentType: 'text/plain'
      });

      // Verify content exists
      const beforeDelete = await users.content('user-6');
      expect(beforeDelete.buffer).not.toBeNull();

      // Delete content
      await users.deleteContent('user-6');

      // Verify content is gone but record still exists
      const user = await users.get('user-6');
      expect(user).toBeDefined();
      expect(user.name).toBe('Delete Test');

      const afterDelete = await users.content('user-6');
      expect(afterDelete.buffer.length).toBe(0); // Empty buffer
    });
  });

  describe('Integration - Full workflow', () => {
    it('should handle complete binary content lifecycle', async () => {
      // 1. Create user
      const user = await users.insert({
        id: 'user-7',
        name: 'Lifecycle Test',
        email: 'lifecycle@example.com'
      });

      expect(user.name).toBe('Lifecycle Test');

      // 2. Initially has no content
      let hasContent = await users.hasContent('user-7');
      expect(hasContent).toBe(false);

      // 3. Set content
      const pdfBuffer = Buffer.from('fake-pdf-content');
      await users.setContent({
        id: 'user-7',
        buffer: pdfBuffer,
        contentType: 'application/pdf'
      });

      // 4. Verify content exists
      hasContent = await users.hasContent('user-7');
      expect(hasContent).toBe(true);

      // 5. Retrieve and verify content
      const content = await users.content('user-7');
      expect(content.buffer.toString()).toBe('fake-pdf-content');
      expect(content.contentType).toBe('application/pdf');

      // 6. Delete content
      await users.deleteContent('user-7');

      // 7. Verify content is gone
      const deletedContent = await users.content('user-7');
      expect(deletedContent.buffer.length).toBe(0);

      // 8. Verify user metadata still exists
      const finalUser = await users.get('user-7');
      expect(finalUser.name).toBe('Lifecycle Test');
    });
  });
});
