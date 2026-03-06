# 🧠 Behaviors: Handling the S3 Metadata Limit

> **Strategies for managing data that exceeds the 2KB S3 User Metadata limit.**
>
> **Related:** [Resources](./resource.md) | [S3 Constraints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html)

---

AWS S3 objects have a **hard limit of 2KB** for user-defined metadata. Since s3db.js uses metadata for high-performance reads (avoiding full object downloads), managing this limit is critical.

The `behavior` configuration on your Resource determines how s3db.js handles data that exceeds this limit.

## 📋 Summary of Strategies

| Behavior | Safety | Performance | Data Integrity | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **`user-managed`** | ⚠️ Low | ⚡ Fastest | ❌ Possible Loss | Dev/Test, tiny data |
| **`enforce-limits`** | 🛡️ High | ⚡ Fastest | ✅ Guaranteed | Strict schema, IDs/Tags |
| **`truncate-data`** | ⚠️ Medium | ⚡ Fastest | ⚠️ Partial | Logs, descriptions, search index |
| **`body-overflow`** | 🛡️ High | 🚀 Fast | ✅ Guaranteed | **Recommended Default** |
| **`body-only`** | 🛡️ High | 🐢 Slower | ✅ Guaranteed | Large Docs, BLObs, JSON dumps |

---

## 🛠️ Strategy Details

### 1. `body-overflow` (Recommended)
**"Best of both worlds"**

Attempts to store data in metadata. If it fits, great! If it exceeds 2KB, it seamlessly "spills over" the entire object into the S3 body.

*   **Read Logic**: Tries `HEAD`. If metadata indicates overflow, performs `GET` to retrieve full body.
*   **Pros**: Fast for small records, infinite capacity for large ones.
*   **Cons**: Large records require 2 requests (`HEAD` + `GET`) or just `GET` if you skip `HEAD` optimization.

```javascript
const users = await db.createResource({
  name: 'users',
  behavior: 'body-overflow', // 👈
  attributes: { bio: 'string' }
});
```

### 2. `enforce-limits` (Strict)
**"Fail fast"**

Calculates byte size before writing. If >2KB, throws a validation error.

*   **Pros**: Guarantees all data is always in metadata (fastest reads).
*   **Cons**: Writes fail if data is too big.
*   **Use Case**: IDs, reference tables, strict schemas where you know size < 2KB.

### 3. `body-only` (Unlimited)
**"Traditional Object Storage"**

Ignores metadata completely. Stores the entire JSON object in the S3 Body.

*   **Pros**: No size limits (up to 5TB). Simple.
*   **Cons**: `HEAD` requests return empty data. `list()` operations are slower because they cannot peek at data without downloading.
*   **Use Case**: Storing large JSON documents, configurations, or files where metadata indexing isn't needed.

### 4. `truncate-data` (Lossy)
**"Keep what fits"**

Stores as much as possible in metadata, then truncates the rest. Adds a `_truncated: true` flag.

*   **Pros**: Always fast (metadata only). No write errors.
*   **Cons**: **DATA LOSS**. You lose the end of your strings/objects.
*   **Use Case**: Search indexes, audit logs, or preview text where partial data is acceptable.

### 5. `user-managed` (Default/Unsafe)
**"You're on your own"**

Does no checking. Sends data to S3. If S3 rejects it (400 Bad Request), the write fails.

*   **Use Case**: Development, or when you are 100% sure your `calculator.js` logic handles it elsewhere.

---

## 💡 How to Choose?

1.  **Is your data < 2KB?** (e.g., just IDs, names, emails)
    *   👉 Use **`enforce-limits`** for max speed.

2.  **Is your data mixed size?** (some small, some huge bios/articles)
    *   👉 Use **`body-overflow`** (Safe default).

3.  **Is your data huge?** (MBs of JSON, images, long text)
    *   👉 Use **`body-only`**.

4.  **Is your data for "preview" only?**
    *   👉 Use **`truncate-data`**.

---

## ⚡ Performance Implications

| Operation | Metadata-Based (`enforce`, `truncate`) | Hybrid (`overflow`) | Body-Based (`body-only`) |
| :--- | :--- | :--- | :--- |
| **Insert/Update** | ⚡ `PUT` (empty body) | ⚡ `PUT` (empty or json body) | 🐢 `PUT` (json body) |
| **Get (Small)** | ⚡ `HEAD` | ⚡ `HEAD` | 🐢 `GET` |
| **Get (Large)** | N/A | 🐢 `GET` | 🐢 `GET` |
| **List/Scan** | ⚡ Only lists keys+meta | ⚡ Mixed (fast for small) | 🐢 Must download bodies |

**Note on Costs**: Metadata-only operations are cheaper and faster because they transfer less data. `body-only` incurs data transfer costs for every read.
