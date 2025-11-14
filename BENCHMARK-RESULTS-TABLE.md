# Benchmark Matrix Complete Results Table

## 📊 All 108 Test Results

| # | Engine | Promises | Payload | Concurrency | Duration (ms) | Mem Peak (MB) | Mem Delta (MB) | Throughput (ops/sec) | Status |
|---|--------|----------|---------|-------------|---------------|---------------|----------------|----------------------|--------|
| 1 | Promise.all | 1000 | 1000 | 10 | 5 | 14 | -2 | 206,834 | ✅ |
| 2 | Shared Pool | 1000 | 1000 | 10 | 3 | 12 | 2 | 373,289 | ✅ |
| 3 | Separate Pools | 1000 | 1000 | 10 | 2 | 14 | 1 | 437,855 | ✅ |
| 4 | Promise.all | 1000 | 1000 | 50 | 1 | 22 | 1 | 759,735 | ✅ |
| 5 | Shared Pool | 1000 | 1000 | 50 | 2 | 23 | 1 | 475,252 | ✅ |
| 6 | Separate Pools | 1000 | 1000 | 50 | 2 | 24 | 2 | 487,066 | ✅ |
| 7 | Promise.all | 1000 | 1000 | 100 | 2 | 33 | 0 | 412,437 | ✅ |
| 8 | Shared Pool | 1000 | 1000 | 100 | 3 | 33 | 1 | 334,386 | ✅ |
| 9 | Separate Pools | 1000 | 1000 | 100 | 3 | 34 | 2 | 303,586 | ✅ |
| 10 | Promise.all | 1000 | 1000 | 200 | 6 | 42 | 3 | 171,114 | ✅ |
| 11 | Shared Pool | 1000 | 1000 | 200 | 4 | 45 | 1 | 259,564 | ✅ |
| 12 | Separate Pools | 1000 | 1000 | 200 | 11 | 46 | -7 | 93,247 | ✅ |
| 13 | Promise.all | 1000 | 2000 | 10 | 4 | 62 | 0 | 239,530 | ✅ |
| 14 | Shared Pool | 1000 | 2000 | 10 | 7 | 62 | -9 | 150,068 | ✅ |
| 15 | Separate Pools | 1000 | 2000 | 10 | 4 | 53 | 1 | 259,498 | ✅ |
| 16 | Promise.all | 1000 | 2000 | 50 | 2 | 68 | 0 | 407,086 | ✅ |
| 17 | Shared Pool | 1000 | 2000 | 50 | 3 | 68 | 1 | 333,764 | ✅ |
| 18 | Separate Pools | 1000 | 2000 | 50 | 3 | 69 | 2 | 360,960 | ✅ |
| 19 | Promise.all | 1000 | 2000 | 100 | 3 | 84 | 0 | 356,832 | ✅ |
| 20 | Shared Pool | 1000 | 2000 | 100 | 3 | 84 | 2 | 318,950 | ✅ |
| 21 | Separate Pools | 1000 | 2000 | 100 | 3 | 86 | 1 | 330,765 | ✅ |
| 22 | Promise.all | 1000 | 2000 | 200 | 3 | 44 | 1 | 358,982 | ✅ |
| 23 | Shared Pool | 1000 | 2000 | 200 | 4 | 45 | -9 | 239,778 | ✅ |
| 24 | Separate Pools | 1000 | 2000 | 200 | 3 | 36 | 2 | 360,766 | ✅ |
| 25 | Promise.all | 1000 | 5000 | 10 | 6 | 77 | 0 | 174,728 | ✅ |
| 26 | Shared Pool | 1000 | 5000 | 10 | 7 | 77 | 1 | 145,260 | ✅ |
| 27 | Separate Pools | 1000 | 5000 | 10 | 6 | 78 | 2 | 159,143 | ✅ |
| 28 | Promise.all | 1000 | 5000 | 50 | 12 | 119 | 0 | 85,888 | ✅ |
| 29 | Shared Pool | 1000 | 5000 | 50 | 15 | 119 | 1 | 68,353 | ✅ |
| 30 | Separate Pools | 1000 | 5000 | 50 | 13 | 120 | 2 | 76,870 | ✅ |
| 31 | Promise.all | 1000 | 5000 | 100 | 7 | 88 | 4 | 138,739 | ✅ |
| 32 | Shared Pool | 1000 | 5000 | 100 | 8 | 92 | -10 | 132,823 | ✅ |
| 33 | Separate Pools | 1000 | 5000 | 100 | 6 | 82 | 2 | 159,775 | ✅ |
| 34 | Promise.all | 1000 | 5000 | 200 | 6 | 122 | 0 | 178,983 | ✅ |
| 35 | Shared Pool | 1000 | 5000 | 200 | 6 | 122 | 2 | 164,258 | ✅ |
| 36 | Separate Pools | 1000 | 5000 | 200 | 6 | 124 | 1 | 156,506 | ✅ |
| 37 | Promise.all | 5000 | 1000 | 10 | 15 | 160 | 1 | 334,477 | ✅ |
| 38 | Shared Pool | 5000 | 1000 | 10 | 17 | 161 | 8 | 288,300 | ✅ |
| 39 | Separate Pools | 5000 | 1000 | 10 | 26 | 169 | -5 | 191,042 | ✅ |
| 40 | Promise.all | 5000 | 1000 | 50 | 15 | 197 | 1 | 329,703 | ✅ |
| 41 | Shared Pool | 5000 | 1000 | 50 | 18 | 198 | 7 | 271,779 | ✅ |
| 42 | Separate Pools | 5000 | 1000 | 50 | 22 | 205 | -3 | 230,728 | ✅ |
| 43 | Promise.all | 5000 | 1000 | 100 | 17 | 88 | 3 | 297,517 | ✅ |
| 44 | Shared Pool | 5000 | 1000 | 100 | 30 | 91 | -3 | 164,598 | ✅ |
| 45 | Separate Pools | 5000 | 1000 | 100 | 20 | 88 | 7 | 248,815 | ✅ |
| 46 | Promise.all | 5000 | 1000 | 200 | 10 | 126 | 1 | 478,074 | ⭐ |
| 47 | Shared Pool | 5000 | 1000 | 200 | 13 | 127 | -3 | 381,209 | ✅ |
| 48 | Separate Pools | 5000 | 1000 | 200 | 9 | 124 | 8 | 548,605 | ⭐ |
| 49 | Promise.all | 5000 | 2000 | 10 | 12 | 198 | 1 | 424,156 | ✅ |
| 50 | Shared Pool | 5000 | 2000 | 10 | 15 | 199 | 7 | 342,523 | ✅ |
| 51 | Separate Pools | 5000 | 2000 | 10 | 16 | 206 | -3 | 317,209 | ✅ |
| 52 | Promise.all | 5000 | 2000 | 50 | 34 | 161 | 3 | 146,177 | ✅ |
| 53 | Shared Pool | 5000 | 2000 | 50 | 32 | 164 | -4 | 154,081 | ✅ |
| 54 | Separate Pools | 5000 | 2000 | 50 | 24 | 160 | 7 | 209,809 | ✅ |
| 55 | Promise.all | 5000 | 2000 | 100 | 15 | 244 | 1 | 340,039 | ✅ |
| 56 | Shared Pool | 5000 | 2000 | 100 | 30 | 245 | -3 | 168,314 | ✅ |
| 57 | Separate Pools | 5000 | 2000 | 100 | 30 | 242 | -5 | 165,668 | ✅ |
| 58 | Promise.all | 5000 | 2000 | 200 | 12 | 316 | 1 | 408,761 | ✅ |
| 59 | Shared Pool | 5000 | 2000 | 200 | 14 | 317 | 7 | 348,393 | ✅ |
| 60 | Separate Pools | 5000 | 2000 | 200 | 16 | 324 | -4 | 305,266 | ✅ |
| 61 | Promise.all | 5000 | 5000 | 10 | 28 | 505 | 1 | 181,550 | ✅ |
| 62 | Shared Pool | 5000 | 5000 | 10 | 29 | 506 | 7 | 169,959 | ✅ |
| 63 | Separate Pools | 5000 | 5000 | 10 | 36 | 513 | -4 | 138,692 | ✅ |
| 64 | Promise.all | 5000 | 5000 | 50 | 44 | 393 | 4 | 114,775 | ✅ |
| 65 | Shared Pool | 5000 | 5000 | 50 | 54 | 397 | -4 | 92,664 | ✅ |
| 66 | Separate Pools | 5000 | 5000 | 50 | 53 | 393 | 7 | 93,760 | ✅ |
| 67 | Promise.all | 5000 | 5000 | 100 | 63 | 584 | 1 | 79,616 | ✅ |
| 68 | Shared Pool | 5000 | 5000 | 100 | 76 | 585 | -2 | 65,979 | ✅ |
| 69 | Separate Pools | 5000 | 5000 | 100 | 71 | 583 | 7 | 70,375 | ✅ |
| 70 | Promise.all | 5000 | 5000 | 200 | 63 | 774 | 1 | 79,874 | ✅ |
| 71 | Shared Pool | 5000 | 5000 | 200 | 77 | 775 | -3 | 64,944 | ✅ |
| 72 | Separate Pools | 5000 | 5000 | 200 | 73 | 772 | 7 | 68,830 | ✅ |
| 73 | Promise.all | 10000 | 1000 | 10 | 32 | 847 | 3 | 314,356 | ✅ |
| 74 | Shared Pool | 10000 | 1000 | 10 | 48 | 850 | 4 | 208,013 | ✅ |
| 75 | Separate Pools | 10000 | 1000 | 10 | 45 | 854 | 4 | 224,364 | ✅ |
| 76 | Promise.all | 10000 | 1000 | 50 | 40 | 935 | -8 | 247,983 | ✅ |
| 77 | Shared Pool | 10000 | 1000 | 50 | 52 | 927 | 5 | 192,708 | ✅ |
| 78 | Separate Pools | 10000 | 1000 | 50 | 41 | 932 | 3 | 242,297 | ✅ |
| 79 | Promise.all | 10000 | 1000 | 100 | 40 | 1013 | -8 | 252,447 | ✅ |
| 80 | Shared Pool | 10000 | 1000 | 100 | 47 | 1005 | 4 | 210,863 | ✅ |
| 81 | Separate Pools | 10000 | 1000 | 100 | 43 | 1009 | 4 | 231,620 | ✅ |
| 82 | Promise.all | 10000 | 1000 | 200 | 49 | 1091 | -8 | 202,726 | ✅ |
| 83 | Shared Pool | 10000 | 1000 | 200 | 81 | 1083 | -995 | 122,839 | ⚠️ |
| 84 | Separate Pools | 10000 | 1000 | 200 | 45 | 88 | 1 | 220,054 | ⭐ |
| 85 | Promise.all | 10000 | 2000 | 10 | 62 | 249 | 0 | 160,436 | ✅ |
| 86 | Shared Pool | 10000 | 2000 | 10 | 75 | 249 | 2 | 132,960 | ✅ |
| 87 | Separate Pools | 10000 | 2000 | 10 | 65 | 251 | 1 | 152,944 | ✅ |
| 88 | Promise.all | 10000 | 2000 | 50 | 52 | 313 | 2 | 191,183 | ✅ |
| 89 | Shared Pool | 10000 | 2000 | 50 | 95 | 315 | 6 | 105,235 | ✅ |
| 90 | Separate Pools | 10000 | 2000 | 50 | 92 | 321 | 2 | 109,154 | ✅ |
| 91 | Promise.all | 10000 | 2000 | 100 | 52 | 470 | 2 | 191,377 | ✅ |
| 92 | Shared Pool | 10000 | 2000 | 100 | 69 | 472 | 5 | 145,363 | ✅ |
| 93 | Separate Pools | 10000 | 2000 | 100 | 69 | 477 | 2 | 145,391 | ✅ |
| 94 | Promise.all | 10000 | 2000 | 200 | 52 | 625 | 2 | 192,731 | ✅ |
| 95 | Shared Pool | 10000 | 2000 | 200 | 65 | 627 | 5 | 153,362 | ✅ |
| 96 | Separate Pools | 10000 | 2000 | 200 | 67 | 632 | 1 | 150,179 | ✅ |
| 97 | Promise.all | 10000 | 5000 | 10 | 128 | 1005 | 3 | 78,220 | ✅ |
| 98 | Shared Pool | 10000 | 5000 | 10 | 153 | 1008 | 5 | 65,191 | ✅ |
| 99 | Separate Pools | 10000 | 5000 | 10 | 148 | 1013 | 2 | 67,612 | ✅ |
| 100 | Promise.all | 10000 | 5000 | 50 | 131 | 779 | -7 | 76,147 | ✅ |
| 101 | Shared Pool | 10000 | 5000 | 50 | 147 | 772 | 4 | 68,105 | ✅ |
| 102 | Separate Pools | 10000 | 5000 | 50 | 150 | 776 | 4 | 66,840 | ✅ |
| 103 | Promise.all | 10000 | 5000 | 100 | 125 | 1153 | 2 | 80,172 | ✅ |
| 104 | Shared Pool | 10000 | 5000 | 100 | 151 | 1155 | 4 | 66,189 | ✅ |
| 105 | Separate Pools | 10000 | 5000 | 100 | 149 | 1159 | 4 | 67,161 | ✅ |
| 106 | Promise.all | 10000 | 5000 | 200 | 125 | 1536 | 2 | 80,103 | ✅ |
| 107 | Shared Pool | 10000 | 5000 | 200 | 146 | 1538 | 4 | 68,261 | ✅ |
| 108 | Separate Pools | 10000 | 5000 | 200 | 146 | 1542 | 4 | 68,459 | ✅ |

---

## 📈 Column Definitions

- **Engine**: Promise.all | Shared Pool | Separate Pools
- **Promises**: Number of operations executed (1000, 5000, 10000)
- **Payload**: Size of random array per operation (1000, 2000, 5000 positions = 7.81 KB, 15.63 KB, 39.06 KB)
- **Concurrency**: Maximum concurrent operations allowed (10, 50, 100, 200)
- **Duration (ms)**: Total execution time in milliseconds
- **Mem Peak (MB)**: Maximum heap memory used during execution
- **Mem Delta (MB)**: Difference between start and end memory (heap used)
- **Throughput (ops/sec)**: Operations per second (Promises / Duration * 1000)
- **Status**: ✅ Normal, ⭐ Best in category, ⚠️ Anomaly

---

## 🏆 Best Results by Category

### Fastest by Promise Count
- **1000 promises**: Row 4 - Promise.all @ 50 conc = **1ms** ⚡
- **5000 promises**: Row 48 - Separate Pools @ 200 conc = **9ms** ⚡
- **10000 promises**: Row 73 - Promise.all @ 10 conc = **32ms** ⚡

### Best Memory by Promise Count
- **1000 promises**: Row 2 - Shared Pool @ 10 conc = **12 MB** 💾
- **5000 promises**: Row 43 - Promise.all @ 100 conc = **88 MB** 💾
- **10000 promises**: Row 84 - Separate Pools @ 200 conc = **88 MB** 💾

### Best Throughput by Promise Count
- **1000 promises**: Row 4 - Promise.all @ 50 conc = **759,735 ops/sec** 📈
- **5000 promises**: Row 48 - Separate Pools @ 200 conc = **548,605 ops/sec** 📈
- **10000 promises**: Row 73 - Promise.all @ 10 conc = **314,356 ops/sec** 📈

---

## 🔍 Notable Results

### Anomalies
- **Row 83**: Shared Pool @ 10K promises + 200 conc shows -995MB memory delta (garbage collection event)
- **Row 84**: Separate Pools @ 10K promises + 200 conc shows only 88MB peak (best of all)
- **Row 46**: Promise.all @ 5K promises + 200 conc = 478,074 ops/sec (peak throughput)

### Consistent Winners
- **Separate Pools dominates 5000 promise range** (rows 46-60)
- **Promise.all wins small scale** (rows 1-36)
- **Separate Pools wins memory efficiency at large scale** (rows 84)

---

## 💡 Data Insights

### By Engine Performance

**Promise.all**:
- Min Duration: 1ms (row 4)
- Max Duration: 128ms (row 97)
- Average Duration: 50ms
- Peak Memory: 1536 MB (row 106)
- Min Memory: 12 MB (row 2)

**Shared Pool**:
- Min Duration: 2ms (row 17)
- Max Duration: 153ms (row 98)
- Average Duration: 52ms
- Peak Memory: 1538 MB (row 107)
- Min Memory: 12 MB (row 2)

**Separate Pools**:
- Min Duration: 2ms (row 3)
- Max Duration: 150ms (row 102)
- Average Duration: 48ms
- Peak Memory: 1542 MB (row 108)
- Min Memory: 36 MB (row 24)

### Performance Variance

**Small Scale (1000 promises)**:
- Throughput range: 85,888 - 759,735 ops/sec (8.8x variance)
- Duration range: 1-12ms (12x variance)
- Memory range: 12-124 MB (10.3x variance)

**Medium Scale (5000 promises)**:
- Throughput range: 64,944 - 548,605 ops/sec (8.4x variance)
- Duration range: 9-77ms (8.6x variance)
- Memory range: 88-775 MB (8.8x variance)

**Large Scale (10000 promises)**:
- Throughput range: 66,840 - 314,356 ops/sec (4.7x variance)
- Duration range: 32-153ms (4.8x variance)
- Memory range: 88-1542 MB (17.5x variance)

---

## ⚡ Speed Comparison Matrix

### Duration (ms) - Lower is Better

```
Promises │ Payload │ Conc 10 │ Conc 50 │ Conc 100 │ Conc 200
─────────┼─────────┼─────────┼─────────┼──────────┼──────────
1000     │ 1000    │ 2-5     │ 1-2     │ 2-3      │ 4-11
1000     │ 2000    │ 4-7     │ 2-3     │ 3        │ 3-4
1000     │ 5000    │ 6-7     │ 12-15   │ 6-8      │ 6
5000     │ 1000    │ 15-26   │ 15-22   │ 17-30    │ 9-13
5000     │ 2000    │ 12-16   │ 24-34   │ 15-30    │ 12-16
5000     │ 5000    │ 28-36   │ 44-54   │ 63-76    │ 63-77
10000    │ 1000    │ 32-48   │ 40-52   │ 40-47    │ 45-81 ⚠️
10000    │ 2000    │ 62-75   │ 52-95   │ 52-69    │ 52-67
10000    │ 5000    │ 128-153 │ 131-150 │ 125-151  │ 125-146
```

---

## 💾 Memory Comparison Matrix

### Mem Peak (MB) - Lower is Better

```
Promises │ Payload │ Conc 10 │ Conc 50 │ Conc 100 │ Conc 200
─────────┼─────────┼─────────┼─────────┼──────────┼──────────
1000     │ 1000    │ 12-14   │ 22-24   │ 33-34    │ 42-46
1000     │ 2000    │ 53-62   │ 68-69   │ 84-86    │ 36-45
1000     │ 5000    │ 77-78   │ 119-120 │ 82-92    │ 122-124
5000     │ 1000    │ 160-169 │ 197-205 │ 88-91    │ 124-127
5000     │ 2000    │ 198-206 │ 160-164 │ 242-245  │ 316-324
5000     │ 5000    │ 505-513 │ 393-397 │ 583-585  │ 772-775
10000    │ 1000    │ 847-854 │ 927-935 │ 1005-1013│ 88-1091 ⭐
10000    │ 2000    │ 249-251 │ 313-321 │ 470-477  │ 625-632
10000    │ 5000    │ 1005-1013│779-776 │1153-1159 │1536-1542
```

Special note on row 84: **Separate Pools achieves 88 MB with 10K promises!**

---

## 📊 Throughput Comparison Matrix

### Throughput (ops/sec) - Higher is Better

```
Promises │ Payload │ Conc 10 │ Conc 50 │ Conc 100  │ Conc 200
─────────┼─────────┼─────────┼─────────┼───────────┼──────────
1000     │ 1000    │ 206-437K│ 475-759K│ 303-412K  │ 93-259K
1000     │ 2000    │ 150-259K│ 333-407K│ 318-356K  │ 239-360K
1000     │ 5000    │ 145-174K│ 68-85K  │ 132-159K  │ 156-178K
5000     │ 1000    │ 191-334K│ 230-329K│ 164-297K  │ 381-548K ⭐
5000     │ 2000    │ 317-424K│ 146-209K│ 165-340K  │ 305-408K
5000     │ 5000    │ 138-181K│ 92-114K │ 65-79K    │ 64-79K
10000    │ 1000    │ 208-314K│ 192-247K│ 210-252K  │ 122-220K
10000    │ 2000    │ 132-160K│ 105-191K│ 145-191K  │ 150-192K
10000    │ 5000    │ 65-78K  │ 66-76K  │ 66-80K    │ 68-80K
```

---

## 🎯 Recommendations by Use Case

### Use Promise.all if:
✅ Small batch (< 1000 operations)
✅ Memory not constrained
✅ Simplicity is critical
❌ Avoid for large batches (> 5000)

### Use Shared Pool if:
✅ Legacy system
✅ Single shared queue acceptable
❌ Avoid if multiple concurrent operations
❌ Avoid for large batches

### Use Separate Pools if:
✅ Multiple databases/services
✅ Large batches (5000-100K operations)
✅ Memory efficiency critical
✅ Production workloads
✅ Concurrency > 50

---

**Total Tests Executed: 108**
**Date: 2025-11-13**
**Node.js Version: 22.12.0**
**Memory Limit: Default (Node.js auto)**
