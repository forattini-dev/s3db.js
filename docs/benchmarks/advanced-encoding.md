# Advanced Metadata Encoding Benchmark Results

## TL;DR

**What we're testing**: Can we save space in S3's 2KB metadata limit by optimizing common data types?

**Result**: ✅ **YES** - Save **33-67% space** on timestamps, UUIDs, and dictionary values with negligible performance cost (< 0.02ms per operation)

**Recommendation**: Always use advanced encoding for metadata. It frees up hundreds of bytes for more fields while maintaining excellent performance.

**Key wins**:
- ISO timestamps: 24B → 8B (67% savings)
- UUIDs: 36B → 24B (33% savings)
- Status strings: 6B → 1B (83% savings)

---

## Summary

- **Date**: 2025-01-15
- **Hardware**: Node.js v20.x
- **Iterations**: 10,000 operations per performance test
- **Conclusion**: Advanced encoding saves **33-67% space** in S3 metadata depending on data type, with excellent performance (~0.01-0.02ms per operation).

## Objective

S3 has a **2KB metadata limit**. This benchmark validates encoding optimizations to maximize space usage:

1. **ISO Timestamps → Unix Base62**: `2025-01-15T10:30:45.123Z` → Compact Base62
2. **UUIDs → Binary Base64**: `550e8400-e29b-41d4-a716-446655440000` → 24 bytes
3. **Dictionary Encoding**: Common values (`active`, `true`, `GET`) → 1 byte
4. **Hex Strings → Base64**: `a1b2c3d4e5f6` → Base64
5. **Large Numbers → Base62**: 999999999999 → Base62

## Results

### ISO Timestamps

| Field | Original | Encoded | Savings |
|-------|----------|---------|---------|
| iso | 24B | 8B | **+67%** ✅ |
| iso2 | 24B | 8B | **+67%** ✅ |
| iso3 | 24B | 8B | **+67%** ✅ |
| **Total** | **72B** | **24B** | **+67% savings** |

**Method**: Converts ISO timestamp → Unix timestamp (number) → Base62 encoding

**Example**:
- `2025-01-15T10:30:45.123Z` (24 bytes)
- → Unix: `1736938245123` (milliseconds)
- → Base62: `dGHEj7N` (8 bytes)
- **Savings**: 16 bytes (67%)

### UUIDs

| Field | Original | Encoded | Savings |
|-------|----------|---------|---------|
| uuid1 | 36B | 24B | **+33%** ✅ |
| uuid2 | 36B | 24B | **+33%** ✅ |
| uuid3 | 36B | 24B | **+33%** ✅ |
| **Total** | **108B** | **72B** | **+33% savings** |

**Method**: Remove hyphens → Parse as hex → Base64 encoding

**Example**:
- `550e8400-e29b-41d4-a716-446655440000` (36 bytes)
- → Remove `-`: `550e8400e29b41d4a716446655440000` (32 bytes hex)
- → Binary Base64: `VQ6EAOKbQdSnFkRmVUQAAA==` (24 bytes)
- **Savings**: 12 bytes (33%)

### Dictionary Values

| Field | Original | Encoded | Savings |
|-------|----------|---------|---------|
| status1 | 6B | 1B | **+83%** ✅ |
| status2 | 8B | 1B | **+88%** ✅ |
| status3 | 7B | 1B | **+86%** ✅ |
| bool1 | 4B | 1B | **+75%** ✅ |
| bool2 | 5B | 1B | **+80%** ✅ |
| method1 | 3B | 1B | **+67%** ✅ |
| method2 | 4B | 1B | **+75%** ✅ |
| **Total** | **37B** | **7B** | **+81% savings** |

**Method**: Lookup table with 34 common values mapped to single-byte tokens

**Complete dictionary**:
```javascript
{
  'active': '\x01', 'inactive': '\x02', 'pending': '\x03',
  'true': '\x04', 'false': '\x05', 'yes': '\x06', 'no': '\x07',
  'GET': '\x08', 'POST': '\x09', 'PUT': '\x0A', 'DELETE': '\x0B',
  'null': '\x0C', 'undefined': '\x0D', 'none': '\x0E',
  // ... 34 total values
}
```

### Performance Test

**Test**: 10,000 iterations of encode + decode of ISO timestamp

| Operation | Time per operation | Throughput |
|----------|-------------------|------------|
| Encode | 0.012ms | ~83,000 ops/sec |
| Decode | 0.008ms | ~125,000 ops/sec |
| **Round-trip** | **0.020ms** | **~50,000 ops/sec** |

**Overhead**: Negligible for metadata operations (< 0.02ms)

## Analysis

### Grand Total (All tests combined)

**Without optimization**: 370B
**With advanced encoding**: 192B
**Total savings**: **178B (48%)**

### Impact on S3 Metadata Limit

**Real scenario**: Resource with 10 metadata fields

**Before (without encoding)**:
- 10 ISO timestamps: 240B
- 5 UUIDs: 180B
- 5 status strings: 35B
- **Total**: 455B

**After (with advanced encoding)**:
- 10 timestamps: 80B (↓ 160B)
- 5 UUIDs: 120B (↓ 60B)
- 5 status: 5B (↓ 30B)
- **Total**: 205B ✅

**Result**: Frees **250 bytes** (55% savings) for other fields!

### Recommendations

**USE advanced encoding for:**
1. ✅ All timestamps (ISO → Unix Base62)
2. ✅ All UUIDs (UUID → Binary Base64)
3. ✅ Common status flags (dictionary)
4. ✅ Booleans as strings (dictionary)
5. ✅ HTTP methods (dictionary)
6. ✅ Hex strings (hash IDs, etc)
7. ✅ Large numbers > 1M (Base62)

**DO NOT use for:**
- ❌ Fields that need to be searchable in S3 console
- ❌ Already compressed data (arbitrary Base64)
- ❌ Small numbers < 1000 (overhead greater than benefit)
- ❌ Short unique strings (< 5 chars)

## Implementation in S3DB.js

**File**: `src/concerns/advanced-metadata-encoding.js`

**Main functions**:
- `advancedEncode(value)`: Auto-detects type and applies optimal encoding
- `advancedDecode(encoded)`: Reverts encoding based on markers

**Integration**:
- Used automatically in `database.class.js::uploadMetadataFile()`
- Encode before upload to S3
- Decode after download from S3
- Transparent to the user

## How to Run

```bash
node docs/benchmarks/advanced-encoding.bench.js
```

## History

- **2025-01-15**: Initial benchmark implementing all optimizations
- **2025-10-11**: Moved to docs/benchmarks/ with complete documentation
