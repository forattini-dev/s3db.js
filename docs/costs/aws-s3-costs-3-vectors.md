* S3 Vectors 

Amazon S3 Vectors provides cost-effective, elastic, and durable vector storage
at up to 90% lower costs for uploading, storing, and querying vectors. With S3
Vectors, you can power RAG and other semantic search workloads at scale, at a
fraction of the cost for storage, requests, data uploaded, and data queried.

**PUT cost**  
PUT pricing is based on logical GB of the vectors you upload, where each
vector is the sum of its logical vector data, metadata, and key. You can
upload multiple vectors in a single PUT request, maximizing upload throughput
and minimizing upload costs.

**Storage cost**  
Total storage is the sum of logical storage across your indexes, where the
size of your storage is determined by the number of vectors you store and
their size.  Vector size is determined by:

1) Vector data: Each vector has a size determined by number of dimensions.
Each dimension equals 4 bytes of storage per vector, so for example, a
1024-dimensional vector requires 4 KB of logical vector data.

2) Metadata: You can store both filterable and non-filterable metadata with
your vector. Non-filterable metadata is used to return information as a part
of query results while filterable metadata can also be used to filter query
results.

3) Key: Each vector is associated with a key. Keys require 1 byte of storage
per character.

**Query cost**  
Query charges include a per API charge in addition to a $/TB charge based on
the average vector size, including vector data, key, and filterable metadata,
multiplied by the number of vectors in the index you’re querying. As your
vector index grows, data processing charges for query increase proportionally;
however, at larger scale, you benefit from lower $/TB pricing above 100K  in
your vector index.

Vector pricing

* * *

Region:

US East (N. Virginia)

#### **S3 Vectors storage pricing**

|  
---|---  
**S3 Vector Storage /Month** \- monthly logical storage of vector data, key,
and metadata| $0.06 per GB  
  
Pricing example 1:

You are building a RAG workflow to provide accurate and relevant text
responses to customers. You have 10 million vectors, each consisting of 4 KB
vector data, 1 KB of filterable metadata, 1 KB of non-filterable metadata, and
a key (0.17 KB each), totaling 6.17KB per vector. The 10 million vectors are
split into 40 indexes for each of your customers, consisting of 250,000
vectors each. You update the vectors in your vector index every six months,
removing old vectors and uploading new ones. This results in PUT of ~16.7% of
your data per month. This example uses pricing for the US East (N. Virginia)
AWS Region.

With the S3 Vectors query API, you can perform similarity search against a
vector you send with your API call; you also have the option to filter the
results inline using filterable metadata. Queries are charged at $2.5/MM API
calls, in addition to a $/TB charge for data processed. Data processed is
calculated by multiplying your average vector size by the number of vectors in
your index. Average vector size for query includes vector data, key, and
filterable metadata per vector. Non-filterable metadata is not included in
data processed for query; you can return non-filterable metadata in your query
results at no additional cost. In this example, for each query you will be
charged $0.004/TB based on the first 100K vectors processed, and then
$0.002/TB for the next 150K records, both at an average vector size of 5.17
KB.

**S3 Vectors storage charge  
**((4 bytes * 1024 dimensions) vector data/vector + 1 KB filterable
metadata/vector + 1 KB non-filterable metadata/vector + 0.17 KB key/vector) =
6.17 KB logical storage per average vector  
6.17 KB/average vector * 250,000 vectors * 40 vector indexes = 59 GB logical
storage  
Total monthly storage cost = 59 GB * $0.06/GB per month = $3.54

**S3 Vectors PUT charge  
**Total monthly PUT cost = 1 full upload/6 months * 59 GB total storage *
$0.20/GB = $1.97

**S3 Vectors Query charge  **

((4 bytes * 1024 dimensions) vector data/vector + 1 KB filterable
metadata/vector + 0.17 KB key/vector) = 5.17 KB/average vector processed  
Tier 1 query processing cost = 100 thousand vectors * 5.17 KB/average vector *
$0.004/TB * 1 million queries = $1.93  
Tier 2 query processing cost = 150 thousand vectors * 5.17 KB/average vector *
$0.002/TB * 1 million queries = $1.44  
Query API cost = 1 million queries * $2.5/million queries = $2.50  
Total query cost for 1M queries across all vector indexes = $5.87 per month

**Total cost**  = $11.38 per month

Pricing example 2:

Your customers have expanded their underlying indexes supporting their RAG
workflow, resulting in larger indexes of 10 million vectors each, with the
same 6.17 KB per vector.  In total, you have 40 vector indexes and 400 million
vectors stored in S3 Vectors. You have the same PUT rate of 16.7% of data per
month; however, your query volume has also increased to 10 million queries per
month. This example uses pricing for the US East (N. Virginia) AWS Region.

**S3 Vectors storage charge  
**((4 bytes * 1024 dimensions) vector data/vector + 1 KB filterable
metadata/vector + 1 KB non-filterable metadata/vector + 0.17 KB key/vector) =
6.17 KB logical storage per average vector  
6.17 KB/average vector * 10 million vectors* 40 indexes = 2,354 GB logical
storage  
Total monthly storage cost = 2,354 GB * $0.06/GB per month = $141.22

**S3 Vectors PUT charge  
**Total monthly PUT cost = 1 full upload/6 months * 2,354 GB total storage *
$0.20/GB = $78.46

**S3 Vectors Query charge  
**((4 bytes * 1024 dimensions) vector data/vector + 1 KB filterable
metadata/vector + 0.17 KB key/vector) = 5.17 KB/average vector processed  
Tier 1 query processing cost = 100 thousand vectors * 5.17 KB/average vector *
$0.004/TB * 10 million queries = $19.26  
Tier 2 query processing cost = 9.9 million vectors * 5.17 KB/average vector *
$0.002/TB * 10 million queries = $953.36  
Query API cost = 10 million queries * $2.5/million queries = $25.00  
Total query cost = $997.62 per month

**Total cost**  = $1,217.29 per month

