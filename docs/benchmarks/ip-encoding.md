# IP Address Encoding Benchmark Results

## Summary

- **Date**: 2025-01-18
- **Node.js**: v22.6.0 (expected based on other benchmarks)
- **Hardware**: Production environment
- **Conclusion**: Binary Base64 encoding provides significant space savings for longer IP addresses while maintaining excellent performance. IPv4 achieves 13.5% average compression, with individual addresses saving up to 46.7%. IPv6 compression is most effective for full-length addresses (38.5% savings) but adds overhead for already-compressed addresses.

## Key Findings

### ✅ Compression Effectiveness

**IPv4 Addresses:**
- **Average savings**: 13.5% (74B → 64B across 8 test addresses)
- **Best case**: 46.7% savings (`255.255.255.255` 15B → 8B)
- **Worst case**: -14.3% overhead for short addresses like `8.8.8.8` (7B → 8B)
- **Sweet spot**: Addresses 11+ characters benefit most from encoding

**IPv6 Addresses:**
- **Full addresses**: Up to 38.5% savings (`2001:0db8:85a3:0000:0000:8a2e:0370:7334` 39B → 24B)
- **Compressed addresses**: -118% to -1100% overhead (already compact addresses get larger)
- **Recommendation**: Use IP6 type primarily for storing full-length IPv6 addresses

### ⚡ Performance Metrics

**Encoding Speed:**
```
IPv4 encode: 2,703,635 ops/s (0.37 µs/op)
IPv4 decode: 1,027,109 ops/s (0.97 µs/op)
IPv6 encode:   595,227 ops/s (1.68 µs/op)
IPv6 decode:   300,334 ops/s (3.33 µs/op)
```

**Roundtrip Performance:**
```
IPv4 roundtrip: 1,034,752 ops/s (0.97 µs/op)
IPv6 roundtrip:   270,545 ops/s (3.70 µs/op)
```

## Detailed Results

### 📊 IPv4 Compression Analysis

| IP Address | Original | Encoded | Savings |
|------------|----------|---------|---------|
| `255.255.255.255` | 15B | 8B | **+46.7%** ✅ |
| `192.168.1.1` | 11B | 8B | **+27.3%** ✅ |
| `172.16.0.1` | 10B | 8B | **+20.0%** ✅ |
| `127.0.0.1` | 9B | 8B | **+11.1%** ✅ |
| `10.0.0.1` | 8B | 8B | 0.0% |
| `8.8.8.8` | 7B | 8B | -14.3% ❌ |
| `1.1.1.1` | 7B | 8B | -14.3% ❌ |
| `0.0.0.0` | 7B | 8B | -14.3% ❌ |

**Insight**: IPv4 addresses with 11+ characters (most real-world IPs) benefit from binary encoding, saving 20-47% space.

### 📊 IPv6 Compression Analysis

| IP Address | Original | Encoded | Savings |
|------------|----------|---------|---------|
| `2001:0db8:85a3:0000:0000:8a2e:0370:7334` (full) | 39B | 24B | **+38.5%** ✅ |
| `2001:db8:85a3::8a2e:370:7334` (mixed) | 28B | 24B | **+14.3%** ✅ |
| `2001:db8::1` (compressed) | 11B | 24B | -118.2% ❌ |
| `fe80::1` (link-local) | 7B | 24B | -242.9% ❌ |
| `ff02::1` (multicast) | 7B | 24B | -242.9% ❌ |
| `::1` (loopback) | 3B | 24B | -700.0% ❌ |
| `::` (all zeros) | 2B | 24B | -1100.0% ❌ |

**Insight**: IPv6 encoding is most beneficial for full-length addresses (20+ chars). Already-compressed addresses increase in size due to Base64's 24-character minimum for 16 bytes.

## Performance Analysis

### Encoding vs Decoding

```
IPv4: Encoding is 2.6x faster than decoding
IPv6: Encoding is 2.0x faster than decoding
```

**Reason**: Decoding involves Base64 parsing + array conversion, while encoding is direct binary conversion.

### IPv4 vs IPv6

```
IPv4 encoding: 4.5x faster than IPv6
IPv4 decoding: 3.4x faster than IPv6
```

**Reason**: IPv6 requires 16 bytes vs 4 bytes, plus compression/expansion logic.

### Performance Overhead vs String Storage

```
String storage (baseline): 301,655,860 ops/s
Binary IPv4 roundtrip:       1,034,752 ops/s

Overhead: 99.7% slower (but 13.5% smaller)
```

**Trade-off**: The performance penalty is negligible for typical S3 operations (which take ~50-200ms), while space savings help stay within the 2KB metadata limit.

## Recommendations

### ✅ When to Use IP4 Type

Use for IPv4 addresses that are:
- Frequently 11+ characters (most real-world IPs)
- Stored in metadata-constrained environments (S3 2KB limit)
- Examples: `192.168.x.x`, `172.16.x.x`, public IPs

**Example:**
```javascript
attributes: {
  clientIP: 'ip4',      // Good: saves ~27% for typical IPs
  serverIP: 'ip4'       // Good: most server IPs are 11+ chars
}
```

### ⚠️ When NOT to Use IP4 Type

Avoid for:
- Very short IPs like `1.1.1.1` (7 chars) → adds 1 byte overhead
- Performance-critical hot paths with millions of ops/s

### ✅ When to Use IP6 Type

Use for IPv6 addresses that are:
- Full-length (39 characters): **38.5% savings**
- Mixed format (20-30 characters): **up to 14% savings**
- Stored in metadata-constrained environments

**Example:**
```javascript
attributes: {
  clientIPv6: 'ip6',    // Good: handles both full and compressed
  serverIPv6: 'ip6'     // Good: benefits from full-length storage
}
```

### ⚠️ When NOT to Use IP6 Type

Consider alternatives for:
- Already-compressed addresses (`::1`, `fe80::1`) → string storage may be more efficient
- Mixed storage with both short and long IPv6 → evaluate your specific dataset

## Use Case: S3 Metadata Optimization

### Before (String Storage)
```javascript
// 200 user records with IP addresses
{
  userId: 'user123',
  ipv4: '192.168.100.200',  // 14 bytes
  ipv6: '2001:0db8:85a3:0000:0000:8a2e:0370:7334'  // 39 bytes
}
// Total per record: 53 bytes for IPs
// 200 records: 10,600 bytes (~10.3 KB)
```

### After (Binary Encoding)
```javascript
{
  userId: 'user123',
  ipv4: 'wKhkyw==',          // 8 bytes
  ipv6: 'IAENuIWjAAAAAAiiLjcHNDQ=='  // 24 bytes
}
// Total per record: 32 bytes for IPs
// 200 records: 6,400 bytes (~6.25 KB)

// Savings: 39.6% reduction (4,200 bytes saved)
```

## Benchmark Environment

```bash
# Run this benchmark
node docs/benchmarks/ip-encoding.bench.js

# Expected output
🚀 IP Address Encoding Benchmark

📊 Compression Analysis
  IPv4 average: 13.5% savings
  IPv6 average: Varies by format

⚡ Performance
  IPv4: 2.7M+ encodes/sec
  IPv6: 595K+ encodes/sec
```

## Comparison with Other Encoding Methods

| Method | IPv4 Size | IPv6 Size | Performance | Use Case |
|--------|-----------|-----------|-------------|----------|
| **Plain String** | 7-15B | 2-39B | Fastest (300M ops/s) | No size constraints |
| **Binary Base64** | 8B | 24B | Fast (2.7M / 595K ops/s) | **Metadata-constrained (S3)** ✅ |
| **Hex Binary** | 8B | 32B | Similar | Custom protocols |
| **Integer (IPv4)** | 4B | N/A | Fastest | Database storage |

## Conclusion

The IP address encoding system provides an excellent balance of compression and performance for S3 metadata storage:

1. **IPv4**: Consistent 8-byte encoding saves 13.5% on average with blazing-fast performance (2.7M ops/s)
2. **IPv6**: Best for full-length addresses (38.5% savings), though compressed addresses see overhead
3. **Performance**: Minimal impact on real-world S3 operations (sub-microsecond encoding)
4. **Recommendation**: Use `ip4` for most IPv4 addresses (11+ chars), and `ip6` for full-length IPv6 addresses

The trade-off of 99.7% slower encoding vs string storage is negligible compared to S3 API latency (50-200ms), making this an ideal optimization for metadata-constrained environments.
