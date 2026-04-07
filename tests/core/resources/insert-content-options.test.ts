/**
 * Tests for insert() with content options (Buffer/string content + contentType).
 *
 * When insert() receives { content, contentType } as a second argument and the
 * behavior returns an empty body, the binary content replaces the body in the
 * PUT call and _hasContent, _mimeType, _contentLength are set in metadata.
 */

import { createDatabaseForTest } from '../../config.js';

describe('insert() with content options', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Basic content insertion
  // ──────────────────────────────────────────────────────────────────────────

  describe('basic content insertion', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-basic');

      resource = await database.createResource({
        name: 'assets',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
          tags: 'string|optional',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should store Buffer content alongside metadata in a single insert', async () => {
      const buffer = Buffer.from('fake-image-data');
      const item = await resource.insert(
        { id: 'img-1', title: 'photo.jpg', tags: 'vacation' },
        { content: buffer, contentType: 'image/jpeg' },
      );

      expect(item).toBeDefined();
      expect(item.id).toBe('img-1');
      expect(item.title).toBe('photo.jpg');

      const content = await resource.content('img-1');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.toString()).toBe('fake-image-data');
      expect(content.contentType).toBe('image/jpeg');
    });

    it('should store string content alongside metadata in a single insert', async () => {
      const text = 'Hello, this is plain-text content.';
      const item = await resource.insert(
        { id: 'txt-1', title: 'readme.txt' },
        { content: text, contentType: 'text/plain' },
      );

      expect(item).toBeDefined();
      expect(item.id).toBe('txt-1');

      const content = await resource.content('txt-1');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.toString()).toBe(text);
      expect(content.contentType).toBe('text/plain');
    });

    it('should set _hasContent, _mimeType, _contentLength in persisted metadata', async () => {
      const buffer = Buffer.from('binary-payload');
      await resource.insert(
        { id: 'meta-1', title: 'file.bin' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const record = await resource.get('meta-1');
      expect(record).toBeDefined();
      expect(record.title).toBe('file.bin');

      const content = await resource.content('meta-1');
      expect(content.buffer.length).toBe(buffer.length);
      expect(content.contentType).toBe('application/octet-stream');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Content retrieval
  // ──────────────────────────────────────────────────────────────────────────

  describe('content retrieval', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-retrieval');

      resource = await database.createResource({
        name: 'docs',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should return the buffer and contentType via resource.content() after insert with content', async () => {
      const pdfData = Buffer.from('%PDF-1.4 fake pdf content');
      await resource.insert(
        { id: 'doc-1', name: 'report.pdf' },
        { content: pdfData, contentType: 'application/pdf' },
      );

      const result = await resource.content('doc-1');
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.toString()).toBe('%PDF-1.4 fake pdf content');
      expect(result.contentType).toBe('application/pdf');
    });

    it('should return metadata fields normally via resource.get() after insert with content', async () => {
      const buffer = Buffer.from('some binary');
      await resource.insert(
        { id: 'doc-2', name: 'data.bin' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const record = await resource.get('doc-2');
      expect(record.id).toBe('doc-2');
      expect(record.name).toBe('data.bin');
    });

    it('should confirm content existence via hasContent after insert with content', async () => {
      const buffer = Buffer.from('content-here');
      await resource.insert(
        { id: 'doc-3', name: 'check.bin' },
        { content: buffer, contentType: 'image/png' },
      );

      const has = await resource.hasContent('doc-3');
      expect(has).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Backward compatibility (no content options)
  // ──────────────────────────────────────────────────────────────────────────

  describe('backward compatibility', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-compat');

      resource = await database.createResource({
        name: 'users',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
          email: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should work exactly as before when no options are provided', async () => {
      const item = await resource.insert({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
      });

      expect(item.id).toBe('user-1');
      expect(item.name).toBe('Alice');
      expect(item.email).toBe('alice@example.com');

      const fetched = await resource.get('user-1');
      expect(fetched.name).toBe('Alice');
    });

    it('should work exactly as before when undefined options are provided', async () => {
      const item = await resource.insert(
        { id: 'user-2', name: 'Bob', email: 'bob@example.com' },
        undefined,
      );

      expect(item.id).toBe('user-2');
      expect(item.name).toBe('Bob');

      const fetched = await resource.get('user-2');
      expect(fetched.name).toBe('Bob');
    });

    it('should work exactly as before when empty options {} are provided', async () => {
      const item = await resource.insert(
        { id: 'user-3', name: 'Charlie', email: 'charlie@example.com' },
        {},
      );

      expect(item.id).toBe('user-3');
      expect(item.name).toBe('Charlie');

      const fetched = await resource.get('user-3');
      expect(fetched.name).toBe('Charlie');
    });

    it('should not set _hasContent when inserting without content', async () => {
      await resource.insert({
        id: 'user-4',
        name: 'Diana',
        email: 'diana@example.com',
      });

      const content = await resource.content('user-4');
      // enforce-limits puts empty body, so content buffer should be empty or minimal
      expect(content.buffer.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Behavior compatibility
  // ──────────────────────────────────────────────────────────────────────────

  describe('behavior compatibility', () => {

    describe('enforce-limits + content', () => {
      let database;
      let resource;

      beforeEach(async () => {
        database = createDatabaseForTest('suite=insert-content-enforce');

        resource = await database.createResource({
          name: 'images',
          behavior: 'enforce-limits',
          attributes: {
            id: 'string|optional',
            label: 'string|required',
          },
        });
      });

      afterEach(async () => {
        if (database?.connected) {
          await database.disconnect();
        }
      });

      it('should store content because enforce-limits always returns empty body', async () => {
        const buffer = Buffer.from('enforce-limits-image-bytes');
        await resource.insert(
          { id: 'el-1', label: 'test-image' },
          { content: buffer, contentType: 'image/jpeg' },
        );

        const content = await resource.content('el-1');
        expect(content.buffer.toString()).toBe('enforce-limits-image-bytes');
        expect(content.contentType).toBe('image/jpeg');
      });
    });

    describe('body-overflow + content (data fits in metadata)', () => {
      let database;
      let resource;

      beforeEach(async () => {
        database = createDatabaseForTest('suite=insert-content-overflow-fit');

        resource = await database.createResource({
          name: 'small-assets',
          behavior: 'body-overflow',
          attributes: {
            id: 'string|optional',
            tag: 'string|optional',
          },
        });
      });

      afterEach(async () => {
        if (database?.connected) {
          await database.disconnect();
        }
      });

      it('should store content when data fits in metadata (body is empty)', async () => {
        const buffer = Buffer.from('overflow-fit-data');
        await resource.insert(
          { id: 'of-1', tag: 'small' },
          { content: buffer, contentType: 'image/png' },
        );

        const content = await resource.content('of-1');
        expect(content.buffer.toString()).toBe('overflow-fit-data');
        expect(content.contentType).toBe('image/png');
      });
    });

    describe('body-only + content', () => {
      let database;
      let resource;

      beforeEach(async () => {
        database = createDatabaseForTest('suite=insert-content-body-only');

        resource = await database.createResource({
          name: 'documents',
          behavior: 'body-only',
          attributes: {
            id: 'string|optional',
            title: 'string|required',
          },
        });
      });

      afterEach(async () => {
        if (database?.connected) {
          await database.disconnect();
        }
      });

      it('should NOT use content because body-only always fills the body with JSON', async () => {
        const buffer = Buffer.from('should-be-ignored');
        await resource.insert(
          { id: 'bo-1', title: 'my-doc' },
          { content: buffer, contentType: 'image/jpeg' },
        );

        // body-only stores JSON in the body, so content() will return the JSON, not the image buffer
        const content = await resource.content('bo-1');
        const bodyStr = content.buffer.toString();

        // The body should be the JSON-serialized mapped data (with schema-mapped keys), not the image buffer
        expect(bodyStr).not.toBe('should-be-ignored');
        // Verify it is valid JSON (mapped field data)
        const parsed = JSON.parse(bodyStr);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      });
    });

    describe('body-overflow + content (data overflows to body)', () => {
      let database;
      let resource;

      beforeEach(async () => {
        database = createDatabaseForTest('suite=insert-content-overflow-full');

        // Create resource with many fields to force overflow
        resource = await database.createResource({
          name: 'big-assets',
          behavior: 'body-overflow',
          attributes: {
            id: 'string|optional',
            field1: 'string|optional',
            field2: 'string|optional',
            field3: 'string|optional',
            field4: 'string|optional',
            field5: 'string|optional',
            field6: 'string|optional',
            field7: 'string|optional',
            field8: 'string|optional',
            field9: 'string|optional',
            field10: 'string|optional',
          },
        });
      });

      afterEach(async () => {
        if (database?.connected) {
          await database.disconnect();
        }
      });

      it('should NOT use content when data overflows to body (body is non-empty)', async () => {
        const longValue = 'x'.repeat(300);
        const buffer = Buffer.from('should-be-ignored-when-overflow');

        await resource.insert(
          {
            id: 'ov-1',
            field1: longValue,
            field2: longValue,
            field3: longValue,
            field4: longValue,
            field5: longValue,
            field6: longValue,
            field7: longValue,
            field8: longValue,
            field9: longValue,
            field10: longValue,
          },
          { content: buffer, contentType: 'image/jpeg' },
        );

        // When body-overflow has overflow, the body contains JSON of overflow fields
        // The content option is ignored because body is non-empty
        const content = await resource.content('ov-1');
        const bodyStr = content.buffer.toString();
        expect(bodyStr).not.toBe('should-be-ignored-when-overflow');
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Content types
  // ──────────────────────────────────────────────────────────────────────────

  describe('content types', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-types');

      resource = await database.createResource({
        name: 'typed-files',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          filename: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should store image/jpeg content type', async () => {
      const buffer = Buffer.from('jpeg-bytes');
      await resource.insert(
        { id: 'ct-jpeg', filename: 'photo.jpg' },
        { content: buffer, contentType: 'image/jpeg' },
      );

      const content = await resource.content('ct-jpeg');
      expect(content.contentType).toBe('image/jpeg');
    });

    it('should store image/png content type', async () => {
      const buffer = Buffer.from('png-bytes');
      await resource.insert(
        { id: 'ct-png', filename: 'icon.png' },
        { content: buffer, contentType: 'image/png' },
      );

      const content = await resource.content('ct-png');
      expect(content.contentType).toBe('image/png');
    });

    it('should store application/pdf content type', async () => {
      const buffer = Buffer.from('pdf-bytes');
      await resource.insert(
        { id: 'ct-pdf', filename: 'doc.pdf' },
        { content: buffer, contentType: 'application/pdf' },
      );

      const content = await resource.content('ct-pdf');
      expect(content.contentType).toBe('application/pdf');
    });

    it('should store application/octet-stream content type', async () => {
      const buffer = Buffer.from('raw-bytes');
      await resource.insert(
        { id: 'ct-bin', filename: 'data.bin' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const content = await resource.content('ct-bin');
      expect(content.contentType).toBe('application/octet-stream');
    });

    it('should default to application/octet-stream when no contentType is provided', async () => {
      const buffer = Buffer.from('no-type-specified');
      await resource.insert(
        { id: 'ct-default', filename: 'mystery.dat' },
        { content: buffer },
      );

      const content = await resource.content('ct-default');
      // The code defaults to 'application/octet-stream' when contentType is omitted
      expect(content.contentType).toBe('application/octet-stream');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Various binary content sizes
  // ──────────────────────────────────────────────────────────────────────────

  describe('various binary content sizes', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-sizes');

      resource = await database.createResource({
        name: 'blobs',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          label: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should handle small buffer (10 bytes)', async () => {
      const buffer = Buffer.alloc(10, 0xAB);
      await resource.insert(
        { id: 'size-10', label: 'tiny' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const content = await resource.content('size-10');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.length).toBe(10);
      expect(content.buffer[0]).toBe(0xAB);
      expect(content.buffer[9]).toBe(0xAB);
    });

    it('should handle larger buffer (10KB)', async () => {
      const buffer = Buffer.alloc(10 * 1024, 0xCD);
      await resource.insert(
        { id: 'size-10k', label: 'medium' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const content = await resource.content('size-10k');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.length).toBe(10 * 1024);
      expect(content.buffer[0]).toBe(0xCD);
      expect(content.buffer[10239]).toBe(0xCD);
    });

    it('should handle Buffer.from() with text content', async () => {
      const text = 'This is text content stored as a buffer in the body.';
      const buffer = Buffer.from(text);
      await resource.insert(
        { id: 'size-text', label: 'text-as-buffer' },
        { content: buffer, contentType: 'text/plain' },
      );

      const content = await resource.content('size-text');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.toString()).toBe(text);
      expect(content.buffer.length).toBe(Buffer.byteLength(text));
    });

    it('should handle a single-byte buffer', async () => {
      const buffer = Buffer.from([0xFF]);
      await resource.insert(
        { id: 'size-1', label: 'one-byte' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const content = await resource.content('size-1');
      expect(content.buffer.length).toBe(1);
      expect(content.buffer[0]).toBe(0xFF);
    });

    it('should handle binary content with null bytes', async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x00, 0x02, 0x00]);
      await resource.insert(
        { id: 'size-null', label: 'null-bytes' },
        { content: buffer, contentType: 'application/octet-stream' },
      );

      const content = await resource.content('size-null');
      expect(content.buffer.length).toBe(5);
      expect(content.buffer[0]).toBe(0x00);
      expect(content.buffer[1]).toBe(0x01);
      expect(content.buffer[2]).toBe(0x00);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Edge cases and integration
  // ──────────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-edge');

      resource = await database.createResource({
        name: 'edge-items',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          name: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should allow inserting content with auto-generated id', async () => {
      const buffer = Buffer.from('auto-id-content');
      const item = await resource.insert(
        { name: 'no-explicit-id' },
        { content: buffer, contentType: 'image/jpeg' },
      );

      expect(item.id).toBeDefined();
      expect(item.id).not.toBe('');

      const content = await resource.content(item.id);
      expect(content.buffer.toString()).toBe('auto-id-content');
      expect(content.contentType).toBe('image/jpeg');
    });

    it('should reject duplicate id even when content is provided', async () => {
      const buffer = Buffer.from('first-insert');
      await resource.insert(
        { id: 'dup-1', name: 'first' },
        { content: buffer, contentType: 'image/png' },
      );

      await expect(
        resource.insert(
          { id: 'dup-1', name: 'second' },
          { content: Buffer.from('second-insert'), contentType: 'image/png' },
        ),
      ).rejects.toThrow(/already exists/);
    });

    it('should still validate data attributes when content is provided', async () => {
      const buffer = Buffer.from('valid-content');

      // 'name' is required, omitting it should fail validation
      await expect(
        resource.insert(
          { id: 'invalid-1' } as any,
          { content: buffer, contentType: 'image/png' },
        ),
      ).rejects.toThrow();
    });

    it('should handle content option with only content (no contentType)', async () => {
      const buffer = Buffer.from('content-without-explicit-type');
      await resource.insert(
        { id: 'no-ct', name: 'no-content-type' },
        { content: buffer },
      );

      const content = await resource.content('no-ct');
      expect(content.buffer.toString()).toBe('content-without-explicit-type');
      expect(content.contentType).toBe('application/octet-stream');
    });

    it('should handle string content (not Buffer)', async () => {
      const text = 'raw string content, not wrapped in Buffer';
      await resource.insert(
        { id: 'str-content', name: 'string-body' },
        { content: text, contentType: 'text/plain' },
      );

      const content = await resource.content('str-content');
      expect(content.buffer).toBeInstanceOf(Buffer);
      expect(content.buffer.toString()).toBe(text);
      expect(content.contentType).toBe('text/plain');
    });

    it('should allow subsequent setContent to overwrite insert content', async () => {
      const originalBuffer = Buffer.from('original-content');
      await resource.insert(
        { id: 'overwrite-1', name: 'overwrite-test' },
        { content: originalBuffer, contentType: 'image/jpeg' },
      );

      // Verify original content
      let content = await resource.content('overwrite-1');
      expect(content.buffer.toString()).toBe('original-content');

      // Overwrite via setContent
      const newBuffer = Buffer.from('new-content');
      await resource.setContent({
        id: 'overwrite-1',
        buffer: newBuffer,
        contentType: 'image/png',
      });

      // Verify new content
      content = await resource.content('overwrite-1');
      expect(content.buffer.toString()).toBe('new-content');
      expect(content.contentType).toBe('image/png');
    });

    it('should allow deleteContent after insert with content', async () => {
      const buffer = Buffer.from('to-be-deleted');
      await resource.insert(
        { id: 'del-1', name: 'delete-me' },
        { content: buffer, contentType: 'application/pdf' },
      );

      // Verify content exists
      const contentBefore = await resource.content('del-1');
      expect(contentBefore.buffer.toString()).toBe('to-be-deleted');

      // Delete content
      await resource.deleteContent('del-1');

      // Verify content is cleared but record still exists
      const record = await resource.get('del-1');
      expect(record.name).toBe('delete-me');

      const contentAfter = await resource.content('del-1');
      expect(contentAfter.buffer.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Multiple inserts with content
  // ──────────────────────────────────────────────────────────────────────────

  describe('multiple inserts with content', () => {
    let database;
    let resource;

    beforeEach(async () => {
      database = createDatabaseForTest('suite=insert-content-multi');

      resource = await database.createResource({
        name: 'gallery',
        behavior: 'enforce-limits',
        attributes: {
          id: 'string|optional',
          title: 'string|required',
        },
      });
    });

    afterEach(async () => {
      if (database?.connected) {
        await database.disconnect();
      }
    });

    it('should handle multiple sequential inserts with different content', async () => {
      const items = [
        { id: 'g-1', title: 'Photo 1', data: 'jpeg-bytes-1', type: 'image/jpeg' },
        { id: 'g-2', title: 'Photo 2', data: 'png-bytes-2', type: 'image/png' },
        { id: 'g-3', title: 'Doc 1', data: 'pdf-bytes-3', type: 'application/pdf' },
      ];

      for (const item of items) {
        await resource.insert(
          { id: item.id, title: item.title },
          { content: Buffer.from(item.data), contentType: item.type },
        );
      }

      for (const item of items) {
        const content = await resource.content(item.id);
        expect(content.buffer.toString()).toBe(item.data);
        expect(content.contentType).toBe(item.type);
      }
    });

    it('should handle mix of inserts with and without content', async () => {
      // Insert with content
      await resource.insert(
        { id: 'mix-1', title: 'with content' },
        { content: Buffer.from('has-binary'), contentType: 'image/jpeg' },
      );

      // Insert without content
      await resource.insert({ id: 'mix-2', title: 'no content' });

      // Verify first has content
      const content1 = await resource.content('mix-1');
      expect(content1.buffer.toString()).toBe('has-binary');
      expect(content1.contentType).toBe('image/jpeg');

      // Verify second has empty body
      const content2 = await resource.content('mix-2');
      expect(content2.buffer.length).toBe(0);

      // Both records are retrievable
      const rec1 = await resource.get('mix-1');
      expect(rec1.title).toBe('with content');

      const rec2 = await resource.get('mix-2');
      expect(rec2.title).toBe('no content');
    });
  });
});
