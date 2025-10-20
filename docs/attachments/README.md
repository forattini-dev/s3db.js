# AWS S3 Pricing Documentation

This directory contains AWS S3 pricing documentation in both HTML (original) and Markdown (converted) formats.

## 📁 Files

### Converted Markdown Files (Recommended)

All HTML files have been converted to Markdown for better readability and version control:

| File | Size | Description |
|------|------|-------------|
| `aws-s3-costs-1-pricing.md` | 52K | Main S3 pricing (storage, requests) |
| `aws-s3-costs-2-tables-pricing.md` | 4.5K | S3 Tables pricing |
| `aws-s3-costs-3-vectors.md` | 6.0K | Vector storage pricing |
| `aws-s3-costs-4-data-transfer.md` | 18K | Data transfer pricing |
| `aws-s3-costs-5-encrypt.md` | 3.8K | Encryption pricing |
| `aws-s3-costs-6-management.md` | 6.0K | Management & analytics pricing |
| `aws-s3-costs-7-replication.md` | 3.3K | Replication pricing |
| `aws-s3-costs-8-transform.md` | 3.8K | Object Lambda pricing |
| `aws-s3-costs-details.md` | 724B | General cost details |
| `aws-s3-costs-faqs.md` | 245K | Pricing FAQs |

**Total Markdown:** 360 KB (~70% smaller than original HTML)

### Original HTML Files

The original HTML files are preserved for reference:

- Total size: 1.2 MB
- Can be safely deleted if you only need the Markdown versions

## 💡 Why Markdown?

- **70% smaller file size** (1.2 MB → 360 KB)
- **Better for Git** - easier to diff and version control
- **More readable** - can be viewed in any text editor
- **Portable** - works with documentation tools (MkDocs, Docusaurus, etc.)
- **Faster to load** - less bandwidth and storage

## 🗑️ Removing HTML Files (Optional)

If you want to keep only the Markdown versions, you can delete the HTML files:

```bash
cd docs/attachments
rm *.html
```

This will save approximately 840 KB of disk space.

## 📝 Conversion Details

- **Tool used:** `html2text`
- **Date:** 2025-10-19
- **Format:** CommonMark Markdown
- **Encoding:** UTF-8

## 📚 Usage

These files are referenced in the CostsPlugin documentation (`docs/plugins/costs.md`) and provide official AWS S3 pricing information used to implement accurate cost tracking in s3db.js.
