# Schema Custom Types

This guide documents the s3db.js field types that go beyond plain fastest-validator behavior. These types exist because the storage model rewards compact encodings, explicit security behavior, and predictable transforms at the schema layer.

**Navigation:** [← Schema & Validation](/core/schema.md) | [Encryption](/core/encryption.md) | [Vector Plugin](/plugins/vector/README.md)

## TLDR

- `password` is one-way hashing.
- `secret` is reversible encryption.
- `embedding`, `ip4`, `ip6`, `geoLat`, and `geoLon` exist to save space and stay friendly to S3 metadata constraints.
- `json` is useful when you want explicit JSON serialization instead of deeper schema modeling.

## Table of Contents

- [Quick Comparison](#quick-comparison)
- [`password`](#password)
- [`secret`, `secretNumber`, `secretAny`](#secret-secretnumber-secretany)
- [`embedding`](#embedding)
- [`json`](#json)
- [`ip4` and `ip6`](#ip4-and-ip6)
- [`geoLat` and `geoLon`](#geolat-and-geolon)

## Quick Comparison

| Type | Use It For | Core Behavior |
| --- | --- | --- |
| `password` | user passwords and login secrets | one-way hashing |
| `secret` | API keys, tokens, SSNs | reversible encryption |
| `secretNumber` | sensitive numeric values | reversible encryption |
| `secretAny` | sensitive structured payloads | reversible encryption |
| `datetime` | timestamps with ms precision | base62 ms encoding (~70% compression) |
| `dateonly` | dates without time | base62 days encoding (~70% compression) |
| `timeonly` | time without date | base62 ms-of-day encoding (~58% compression) |
| `uuid` | unique identifiers | base62 4×32-bit encoding (33% compression) |
| `embedding:N` | vectors and embeddings | fixed-point compact encoding |
| `json` | arbitrary JSON payloads | stringify/parse |
| `ip4`, `ip6` | IP addresses | compact binary encoding |
| `geoLat`, `geoLon` | coordinates | normalized compact encoding |

## `password`

Use `password` for secrets that must never be returned in plaintext.

```javascript
attributes: {
  password: 'password|required|min:12',
  backupPassword: 'password:argon2id|required|min:12'
}
```

### Notes

- defaults to bcrypt unless you request `argon2id`
- hashes automatically on write
- should be verified with `verifyPassword()`
- is the correct choice for authentication credentials

```javascript
import { verifyPassword } from 's3db.js';

const user = await users.get(id);
const ok = await verifyPassword(inputPassword, user.password);
```

## `secret`, `secretNumber`, `secretAny`

Use `secret` when the application needs the original value later.

```javascript
attributes: {
  apiKey: 'secret|required',
  pin: 'secretNumber',
  providerConfig: 'secretAny'
}
```

### Notes

- encrypted automatically with AES-256-GCM
- decrypted automatically on read unless auto-decrypt is disabled
- requires `security.passphrase`
- should not be used for login passwords

Read [Encryption](/core/encryption.md) for the operational and security model.

## `embedding`

Use `embedding:N` for vector fields that would otherwise be large numeric arrays.

```javascript
attributes: {
  embedding: 'embedding:1536'
}
```

### Typical dimensions

| Model Family | Example |
| --- | --- |
| OpenAI small/large embeddings | `embedding:1536`, `embedding:3072` |
| BERT-style embeddings | `embedding:768` |
| Sentence-transformers | `embedding:384` |

### Why it matters

- large JSON arrays are expensive to store and parse
- compact encoding keeps vectors more practical in S3-backed storage
- this is the right schema choice before adding search features on top

## `json`

Use `json` when you want explicit JSON serialization for a field.

```javascript
attributes: {
  metadata: 'json',
  settings: 'json|optional'
}
```

This is useful for flexible payloads, but if the structure is stable and queryable, a real nested schema is usually better.

## `ip4` and `ip6`

Use these for IP address fields instead of generic strings when you want compact storage and explicit validation.

```javascript
attributes: {
  clientIp: 'ip4',
  gatewayIp: 'ip6|optional'
}
```

### Best fit

- access logs
- request tracing
- analytics
- network inventory

## `geoLat` and `geoLon`

Use these when you store coordinates and want compact normalized encoding.

```javascript
attributes: {
  latitude: 'geoLat',
  longitude: 'geoLon'
}
```

They pair naturally with geospatial plugins and with resources where location is part of the record model rather than raw JSON.
