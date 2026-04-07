# Storing Files and Images

Store images, PDFs, and other binary files as s3db.js resources with searchable metadata. Each file is a single S3 object with metadata in headers and the binary in the body, ready to serve via presigned URLs.

## Quick Start

```javascript
import fs from 'fs';
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://KEY:SECRET@my-bucket?region=us-east-1'
});

await db.connect();

const images = await db.createResource({
  name: 'images',
  behavior: 'enforce-limits',
  attributes: {
    title: 'string|required',
    alt: 'string',
    tags: 'string',
    uploadedBy: 'email|required',
    folder: 'string',
    width: 'number',
    height: 'number',
  },
});

// Single PUT — metadata + binary in one request
const image = await images.insert({
  title: 'product-hero.jpg',
  alt: 'Product hero shot',
  tags: 'product,hero,landing',
  uploadedBy: 'daniel@tetis.io',
  folder: 'marketing',
  width: 1920,
  height: 1080,
}, {
  content: fs.readFileSync('./product-hero.jpg'),
  contentType: 'image/jpeg',
});
```

## How It Works

When you pass `content` and `contentType` in the options, `insert()` stores everything in a single S3 PUT:

| S3 Object Part | Contains |
|----------------|----------|
| **Metadata headers** | Your fields (title, tags, etc.) + `_hasContent`, `_mimeType`, `_contentLength` |
| **Body** | The raw binary file |
| **ContentType** | The MIME type (`image/jpeg`, `application/pdf`, etc.) |

This means the S3 object IS the file. A presigned URL will serve it directly with the correct `Content-Type` header.

## Behavior: `enforce-limits`

You **must** use `enforce-limits` (or `truncate-data`) for file resources. Here's why:

| Behavior | Body used for | Compatible? |
|----------|---------------|-------------|
| `enforce-limits` | Empty (free for binary) | Yes |
| `truncate-data` | Empty (free for binary) | Yes |
| `body-overflow` | JSON overflow data | No - would corrupt the file |
| `body-only` | Full JSON record | No - body is JSON, not binary |

The `enforce-limits` behavior keeps all field data in S3 metadata (max 2KB) and leaves the body free for your file. It throws an error if your metadata exceeds 2KB, so keep field values short.

## Querying

Queries use metadata only (S3 HEAD), so they're fast and never download the binary:

```javascript
// Find by tag
const heroImages = await images.query({ tags: 'hero' });

// Find by uploader
const myImages = await images.query({ uploadedBy: 'daniel@tetis.io' });

// List by folder (partition for O(1))
const marketingImages = await images.list({ prefix: 'marketing' });
```

## Retrieving the Binary

```javascript
// Get metadata only (no binary download)
const record = await images.get(image.id);
// record.title → 'product-hero.jpg'
// record._hasContent → true
// record._mimeType → 'image/jpeg'
// record._contentLength → 245760

// Get the binary
const { buffer, contentType } = await images.content(image.id);
// buffer → <Buffer ff d8 ff e0 ...>
// contentType → 'image/jpeg'
```

## Serving Files

### Presigned URLs (recommended)

Generate a temporary signed URL that the browser fetches directly from S3:

```javascript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const key = images.getResourceKey(image.id);

const url = await getSignedUrl(s3Client, new GetObjectCommand({
  Bucket: 'my-bucket',
  Key: key,
}), { expiresIn: 3600 }); // 1 hour

// url → https://my-bucket.s3.amazonaws.com/resource=images/data/id=abc123?X-Amz-...
// Browser downloads with correct Content-Type: image/jpeg
```

### API Plugin Static Handler

If you use the ApiPlugin, the built-in static handler streams files directly:

```javascript
import { createS3Handler } from 's3db.js/plugins/api/utils/static-s3';

app.use('/files/images', createS3Handler({
  s3Client,
  bucket: 'my-bucket',
  prefix: 'resource=images/data',
  streaming: true,
  maxAge: 86400,
  etag: true,
  cors: true,
}));

// GET /files/images/id=abc123 → streams the JPEG with correct headers
```

### Streaming Through Your API

```javascript
app.get('/api/images/:id', async (req, res) => {
  const { buffer, contentType } = await images.content(req.params.id);
  if (!buffer) return res.status(404).end();

  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});
```

## Document Storage

The same pattern works for PDFs, spreadsheets, and any file type:

```javascript
const documents = await db.createResource({
  name: 'documents',
  behavior: 'enforce-limits',
  attributes: {
    filename: 'string|required',
    category: 'string',
    owner: 'email|required',
    sizeBytes: 'number',
    pageCount: 'number',
  },
});

// PDF
await documents.insert({
  filename: 'invoice-2024-001.pdf',
  category: 'invoices',
  owner: 'finance@tetis.io',
  sizeBytes: 142500,
  pageCount: 3,
}, {
  content: fs.readFileSync('./invoice.pdf'),
  contentType: 'application/pdf',
});

// Excel
await documents.insert({
  filename: 'report-q1.xlsx',
  category: 'reports',
  owner: 'analytics@tetis.io',
  sizeBytes: 89200,
}, {
  content: fs.readFileSync('./report.xlsx'),
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
```

## Updating Content

Replace the binary while keeping metadata:

```javascript
// Update metadata only
await images.update(image.id, { tags: 'product,hero,homepage' });

// Replace the binary
await images.setContent({
  id: image.id,
  buffer: newImageBuffer,
  contentType: 'image/jpeg',
});
```

## Partitions for Efficient Listing

Use partitions to list files by folder, category, or owner without scanning:

```javascript
const assets = await db.createResource({
  name: 'assets',
  behavior: 'enforce-limits',
  attributes: {
    filename: 'string|required',
    folder: 'string|required',
    mimeType: 'string|required',
    uploadedBy: 'email|required',
  },
  partitions: {
    byFolder: { fields: { folder: 'string' } },
    byUploader: { fields: { uploadedBy: 'string' } },
  },
});

// List all assets in a folder (O(1) partition scan)
const marketingAssets = await assets.query({ folder: 'marketing' });
```

## Metadata Size Budget

S3 metadata has a 2KB limit. With `enforce-limits`, the system fields (`_v`, `_hasContent`, `_mimeType`, `_contentLength`, id, timestamps) take ~200-300 bytes, leaving ~1.7KB for your fields.

**Rules of thumb:**
- Short strings (title, tags, category): ~50-100 bytes each
- Email: ~30-50 bytes
- Numbers: ~5-15 bytes
- You can comfortably fit 10-15 short text fields

If you need more metadata, consider splitting: keep the searchable fields in the resource and store extended metadata (like EXIF data) as a separate JSON file or a companion resource.

## Common MIME Types

| Extension | MIME Type |
|-----------|-----------|
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.pdf` | `application/pdf` |
| `.doc` | `application/msword` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xls` | `application/vnd.ms-excel` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.csv` | `text/csv` |
| `.json` | `application/json` |
| `.zip` | `application/zip` |
| `.mp4` | `video/mp4` |
| `.mp3` | `audio/mpeg` |
