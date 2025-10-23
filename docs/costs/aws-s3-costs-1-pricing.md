  * Storage & requests 

  * Storage pricing 

You pay for storing objects in your S3 buckets. The rate you’re charged
depends on your objects' size, how long you stored the objects during the
month, and the storage class—S3 Standard, S3 Intelligent-Tiering, S3 Standard-
Infrequent Access, S3 One Zone-Infrequent Access, S3 Express One Zone, S3
Glacier Instant Retrieval, S3 Glacier Flexible Retrieval (Formerly S3
Glacier), and S3 Glacier Deep Archive. You pay a monthly monitoring and
automation charge per object stored in the S3 Intelligent-Tiering storage
class to monitor access patterns and move objects between access tiers. In S3
Intelligent-Tiering there are no retrieval charges, and no additional tiering
charges apply when objects are moved between access tiers.

There are per-request ingest charges when using PUT, COPY, or lifecycle rules
to move data into any S3 storage class. Consider the ingest or transition cost
before moving objects into any storage class. Estimate your costs using the
[AWS Pricing Calculator](https://calculator.aws/). To find the best S3 storage
class for your workload, learn more [here](/s3/storage-classes/).

Please note that we list Storage Requests and Data Retrievals Pricing below
the Storage Pricing table.

##

* * *

Region:

US East (N. Virginia)

  
| Storage pricing  
---|---  
**S3 Standard** \- General purpose storage for any type of data, typically
used for frequently accessed data|  
  
First 50 TB / Month| $0.023 per GB  
Next 450 TB / Month| $0.022 per GB  
Over 500 TB / Month| $0.021 per GB  
**S3 Intelligent - Tiering** * - Automatic cost savings for data with unknown
or changing access patterns|  
  
Monitoring and Automation, All Storage / Month (Objects > 128 KB)| $0.0025 per
1,000 objects  
Frequent Access Tier, First 50 TB / Month| $0.023 per GB  
Frequent Access Tier, Next 450 TB / Month| $0.022 per GB  
Frequent Access Tier, Over 500 TB / Month| $0.021 per GB  
Infrequent Access Tier, All Storage / Month| $0.0125 per GB  
Archive Instant Access Tier, All Storage / Month| $0.004 per GB  
**S3 Intelligent - Tiering** * - Optional asynchronous Archive Access tiers|  
  
Archive Access Tier, All Storage / Month| $0.0036 per GB  
Deep Archive Access Tier, All Storage / Month| $0.00099 per GB  
**S3 Standard - Infrequent Access** ** - For long lived but infrequently
accessed data that needs millisecond access|  
  
All Storage / Month| $0.0125 per GB  
**S3 Express One Zone** \- High-performance storage for your most frequently
accessed data|  
  
All Storage / Month| $0.11 per GB  
**S3 Glacier Instant Retrieval** *** - For long-lived archive data accessed
once a quarter with instant retrieval in milliseconds|  
  
All Storage / Month| $0.004 per GB  
**S3 Glacier Flexible Retrieval** *** - For long-term backups and archives
with retrieval option from 1 minute to 12 hours|  
  
All Storage / Month| $0.0036 per GB  
**S3 Glacier Deep Archive** *** - For long-term data archiving that is
accessed once or twice in a year and can be restored within 12 hours|  
  
All Storage / Month| $0.00099 per GB  
**S3 One Zone - Infrequent Access** ** - For re-creatable infrequently
accessed data that needs millisecond access|  
  
All Storage / Month| $0.01 per GB  
  
* S3 Intelligent-Tiering can store objects smaller than 128 KB, but auto-tiering has a minimum eligible object size of 128 KB. These smaller objects will not be monitored and will always be charged at the Frequent Access tier rates, with no monitoring and automation charge. For each object archived to the Archive Access tier or Deep Archive Access tier in S3 Intelligent-Tiering, Amazon S3 uses 8 KB of storage for the name of the object and other metadata (billed at S3 Standard storage rates) and 32 KB of storage for index and related metadata (billed at S3 Glacier Flexible Retrieval and S3 Glacier Deep Archive storage rates).  

** S3 Standard-IA and S3 One Zone-IA storage have a minimum billable object
size of 128 KB. Smaller objects may be stored but will be charged for 128 KB
of storage at the appropriate storage class rate. S3 Standard-IA, and S3 One
Zone-IA storage are charged for a minimum storage duration of 30 days, and
objects deleted before 30 days incur a pro-rated charge equal to the storage
charge for the remaining days. Objects that are deleted, overwritten, or
transitioned to a different storage class before 30 days will incur the normal
storage usage charge plus a pro-rated charge for the remainder of the 30-day
minimum. This includes objects that are deleted as a result of file operations
performed by [File
Gateway](https://docs.aws.amazon.com/storagegateway/latest/userguide/StorageGatewayConcepts.html).
Objects stored for 30 days or longer will not incur a 30-day minimum charge.

*** For each object that is stored in the S3 Glacier Flexible Retrieval and S3
Glacier Deep Archive storage classes, AWS charges for 40 KB of additional
metadata for each archived object, with 8 KB charged at S3 Standard rates and
32 KB charged at S3 Glacier Flexible Retrieval or S3 Deep Archive rates. This
allows you to get a real-time list of all of your S3 objects using the S3 LIST
API or the S3 Inventory report. S3 Glacier Instant Retrieval has a minimum
billable object size of 128 KB. Smaller objects may be stored but will be
charged for 128 KB of storage at the appropriate storage class rate. Objects
that are archived to S3 Glacier Instant Retrieval and S3 Glacier Flexible
Retrieval are charged for a minimum storage duration of 90 days, and S3
Glacier Deep Archive has a minimum storage duration of 180 days. Objects
deleted prior to the minimum storage duration incur a pro-rated charge equal
to the storage charge for the remaining days. Objects that are deleted,
overwritten, or transitioned to a different storage class before the minimum
storage duration will incur the normal storage usage charge plus a pro-rated
storage charge for the remainder of the minimum storage duration. Objects
stored longer than the minimum storage duration will not incur a minimum
storage charge. For customers using the S3 Glacier direct API, pricing for API
can be found on the [S3 Glacier API pricing page](/s3/glacier/pricing/).

Requests & data retrievals

You pay for requests made against your S3 buckets and objects. S3 request
costs are based on the request type, and are charged on the quantity of
requests as listed in the table below. When you use the Amazon S3 console to
browse your storage, you incur charges for GET, LIST, and other requests that
are made to facilitate browsing. Charges are accrued at the same rate as
requests that are made using the API/SDK. Reference the S3 developer guide for
technical details on the following request types:
[PUT](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html),
[COPY](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html),
[POST](https://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPOST.html),
[LIST](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjects.html),
[GET](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html),
[SELECT](https://docs.aws.amazon.com/AmazonS3/latest/API/API_SelectObjectContent.html),
[Lifecycle
Transition](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-
transition-general-considerations.html), and [Data
Retrievals](https://docs.aws.amazon.com/AmazonS3/latest/dev/restoring-
objects.html). DELETE and CANCEL requests are free. LIST requests for any
storage class are charged at the same rate as S3 Standard PUT, COPY, and POST
requests. You pay for retrievals when you GET an object stored in the S3
Standard – Infrequent Access, S3 One Zone – Infrequent Access, or S3 Glacier
Instant Retrieval storage classes. When you restore an archive from the S3
Glacier Flexible Retrieval or S3 Glacier Deep Archive storage classes, you pay
for retrievals as a part of the restore request. When you restore an archive,
you are paying for both the archive (charged at the S3 Glacier Flexible
Retrieval or S3 Glacier Deep Archive rate) and a copy, accessible with GET
using the same object key, that you restored temporarily (charged at the S3
Standard storage rate for a duration of time you choose). Reference the S3
developer guide for technical details on [Data
Retrievals.](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-
objects.html)

S3 Lifecycle Transition request pricing below represents requests to that
storage class. For example, transitioning data from S3 Standard to S3
Standard-Infrequent Access will be charged $0.01 per 1,000 requests.

There are no retrieval charges in S3 Intelligent-Tiering. If an object in the
infrequent access tier is accessed later, it is automatically moved back to
the frequent access tier. No additional tiering charges apply when objects are
moved between access tiers within the S3 Intelligent-Tiering storage class.  

desktop table (1/1)

##

* * *

Region:

US East (N. Virginia)

  
| PUT, COPY, POST, LIST requests (per 1,000 requests)| GET, SELECT, and all
other requests (per 1,000 requests)| Lifecycle transition requests into (per
1,000 requests)| Data retrieval requests (per 1,000 requests)| Data uploads
(per GB)| Data retrievals (per GB)  
---|---|---|---|---|---|---  
**S3 Standard**|  $0.005| $0.0004| n/a| n/a| n/a| n/a  
**S3 Intelligent-Tiering** *| $0.005| $0.0004| $0.01| n/a| n/a| n/a  
Frequent Access| n/a| n/a| n/a| n/a| n/a| n/a  
Infrequent Access| n/a| n/a| n/a| n/a| n/a| n/a  
Archive Instant| n/a| n/a| n/a| n/a| n/a| n/a  
Archive Access, Standard| n/a| n/a| n/a| n/a| n/a| n/a  
Archive Access, Bulk| n/a| n/a| n/a| n/a| n/a| n/a  
Archive Access, Expedited| n/a| n/a| n/a| $10.00| n/a| $0.03  
Deep Archive Access, Standard| n/a| n/a| n/a| n/a| n/a| n/a  
Deep Archive Access, Bulk| n/a| n/a| n/a| n/a| n/a| n/a  
**S3 Standard-Infrequent Access** **| $0.01| $0.001| $0.01| n/a| n/a| $0.01  
**S3 Express One Zone *****|  $0.00113| $0.00003| n/a| n/a| $0.0032| $0.0006  
**S3 Glacier Instant Retrieval** ****| $0.02| $0.01| $0.02| n/a| n/a| $0.03  
**S3 Glacier Flexible Retrieval** ****| $0.03| $0.0004| $0.03| See below| n/a|
See below  
Expedited| n/a| n/a| n/a| $10.00| n/a| $0.03  
Standard| n/a| n/a| n/a| $0.05| n/a| $0.01  
Bulk ****| n/a| n/a| n/a| n/a| n/a| n/a  
Provisioned Capacity Unit *****| n/a| n/a| n/a| n/a| n/a| $100.00 per unit  
**S3 Glacier Deep Archive** ****| $0.05| $0.0004| $0.05| See below| n/a| See
below  
Standard| n/a| n/a| n/a| $0.10| n/a| $0.02  
Bulk| n/a| n/a| n/a| $0.025| n/a| $0.0025  
**S3 One Zone-Infrequent Access** **| $0.01| $0.001| $0.01| n/a| n/a| $0.01  
  
S3 Lifecycle Transition request pricing above represents requests to that
storage class.

* S3 Intelligent-Tiering standard and bulk data retrieval and restore requests are free of charge for all five access tiers: Frequent, Infrequent, Archive Instant, Archive, and Deep Archive access tiers. Subsequent restore requests called on objects already being restored will be billed as a GET request. Expedited retrievals are available for the S3 Intelligent-Tiering Archive Access Tier and are charged at the Expedited request and retrieval rate.  

** S3 Standard-IA and S3 One Zone-IA storage are charged for a minimum storage
duration of 30 days. Objects that are deleted, overwritten, or transitioned to
a different storage class before the minimum storage duration will incur the
normal storage usage charge plus a pro-rated charge for the remainder of the
minimum storage duration. Objects stored longer than the minimum storage
duration will not incur aminimum charge.

*** S3 Express One Zone is the only storage class that supports the
RenameObject API, which is priced the same as PUT, COPY, POST, LIST requests
(per 1,000 requests) in S3 Express One Zone. There are no data upload or data
retrieval changes with the RenameObject API.

**** Objects that are archived to S3 Glacier Instant Retrieval and S3 Glacier
Flexible Retrieval are charged for a minimum storage duration of 90 days, and
S3 Glacier Deep Archive has a minimum storage duration of  180 days. Objects
deleted prior to the minimum storage duration incur a pro-rated charge equal
to the storage charge for the remaining days. Objects that are deleted,
overwritten, or transitioned to a different storage class before the minimum
storage duration will incur the normal storage usage charge plus a pro-rated
charge for the remainder of the minimum storage duration. Objects stored
longer than the minimum storage duration will not incur a minimum charge.
S3Glacier Flexible Retrieval Bulk data retrievals and requests are free of
charge.

***** Provisioned Capacity Units allow you to provision capacity for expedited
retrievals from S3 Glacier for a given month. Each provisioned capacity unit
can provide at least three expedited retrievals every five minutes and up to
150 MB/s of retrieval throughput.

mobile table (1/2)

* * *

Region:

mobile table (2/2)

* * *

Region:

  * Tables 

  * S3 Tables pricing 

[Amazon S3 Tables](https://aws.amazon.com/s3/features/tables/) deliver S3
storage that is specifically optimized for analytics workloads. With S3
Tables, you pay for storage, requests, and an object monitoring fee per object
stored in table buckets. Table buckets are designed to perform continual table
maintenance to automatically optimize query efficiency and storage cost over
time, even as your data lake scales and evolves.

By default, compaction periodically combines smaller objects into fewer,
larger objects to improve query performance. When compaction is enabled, you
are charged for the number of objects and the bytes processed during
compaction.  

* * *

Region:

S3 Tables pricing example:

You use a daily ETL job to pre-process data from different structured and
unstructured sources and update an Apache Iceberg table in your table bucket
once a day. This update creates 1,000 new data files with an average object
size of 5 MB and 3 metadata files with an average object size of 10 KB. Your
table’s users frequently perform queries on your dataset and generate 500,000
GET requests per month. You do not have a sort order defined for your table.
To optimize query performance, you enable automatic compaction on S3 Tables.
At the end of the month, your table is 1 TB in size with an average object
size of 100 MB. This example uses the US-West (Oregon) AWS Region.  

Your charges would be calculated as follows:  

**Amazon S3 Tables storage charge ($/GB)**  
S3 Tables storage price is $0.0265 per GB for the first 50 TB per month  
Since you are storing 1 TB of data in your table, your charge would be:  
S3 Tables storage charge: 1 TB (1,024 GB) * $0.0265/GB = $27.14

**Amazon S3 Tables PUT request charge ($/1,000 requests)**  
S3 Tables PUT request price is $0.005 per 1,000 requests  
Since you are adding 1,000 data files and 3 metadata files per day to your
table, your charge would be:  
S3 Tables PUT request charge: 1,003 PUT requests/day * 30 days = 30,090 PUT
requests/month *  
$0.005/1,000 requests = $0.15

**Amazon S3 Tables GET request charge ($/1,000 requests)**  
S3 Tables GET request price is $0.0004 per 1,000 requests  
Since you are performing 500,000 GET requests per month, your charge would be:  
S3 Tables GET request charge: 500,000 GET requests/month * $0.0004/1,000
requests = $0.20

**Amazon S3 Tables object monitoring charge ($/1,000 objects)**  
S3 Tables object monitoring price is $0.025 per 1,000 objects  
Since you have a 1 TB table with an average object size of 100 MB, your charge
would be:  
S3 Tables object monitoring charge: 1 TB (1,048,576 MB)/100 MB = 10,486
objects * $0.025/1,000 objects = $0.26

**Amazon S3 Tables compaction charge ($/1,000 objects and $/GB processed)**  
S3 Tables compaction price is $0.002 per 1,000 objects processed and $0.005
per GB processed for default binpack compaction  
Since S3 Tables will process 30,000 new 5 MB data files added to your table,
your charge would be:  
S3 Tables compaction charge: 30,000 data files * $0.002/1,000 objects = $0.06
and 30,000 data files * 5  
MB = 150,000 MB (146.48 GB) * $0.005 per GB processed = $0.73.

**Total charges**  
S3 Tables storage charge = $27.14  
S3 Tables PUT request charge = $0.15  
S3 Tables GET request charge = $0.20  
S3 Tables object monitoring charge = $0.26  
S3 Tables compaction - objects processed charge = $0.06  
S3 Tables compaction - data processed charge = $0.73  
S3 Tables total = $28.54  

  * Vectors 

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

  * Data transfer 

  * You pay for all bandwidth into and out of Amazon S3, except for the following:  

    * Data transferred out to the internet for the first 100GB per month, aggregated across all AWS Services and Regions (except China and GovCloud)  

    * Data transferred in from the internet.
    * Data transferred between S3 buckets in the same AWS Region. 
    * Data transferred from an Amazon S3 bucket to any AWS service(s) within the same AWS Region as the S3 bucket (including to a different account in the same AWS Region).
    * Data transferred out to Amazon CloudFront (CloudFront).
    * EU customers may request reduced data transfer rates for eligible use cases under the European Data Act. Please contact [AWS Customer Support](/contact-us/) for more information.

The pricing below is based on data transferred "in" and "out" of Amazon S3
(over the public internet)†††. Learn more about [AWS Direct Connect
pricing](/directconnect/pricing/).

For Data Transfers exceeding 500 TB/Month, [please contact
us](https://pages.awscloud.com/ln_NAMER_AmazonS3-Contact-Us.html).  

* * *

Region:

US East (N. Virginia)

| Price  
---|---  
**Data Transfer IN To Amazon S3 From Internet**|  
All data transfer in| $0.00 per GB  
  
**Data Transfer OUT From Amazon S3 To Internet**

AWS customers receive 100GB of data transfer out to the internet free each
month, aggregated across all AWS Services and Regions (except China and
GovCloud). The 100 GB free tier for data transfer out to the internet is
global and does not apply separately or individually to AWS Regions.

|  
---|---  
First 10 TB / Month| $0.09 per GB  
Next 40 TB / Month| $0.085 per GB  
Next 100 TB / Month| $0.07 per GB  
Greater than 150 TB / Month| $0.05 per GB  
  
Data Transfer OUT From Amazon S3 To|  
---|---  
Amazon CloudFront| $0.00 per GB  
AWS GovCloud (US-West)| $0.02 per GB  
AWS GovCloud (US-East)| $0.02 per GB  
Africa (Cape Town)| $0.02 per GB  
Asia Pacific (Hong Kong)| $0.02 per GB  
Asia Pacific (Hyderabad)| $0.02 per GB  
Asia Pacific (Jakarta)| $0.02 per GB  
Asia Pacific (Malaysia)| $0.02 per GB  
Asia Pacific (Melbourne)| $0.02 per GB  
Asia Pacific (Mumbai)| $0.02 per GB  
Asia Pacific (New Zealand)| $0.02 per GB  
Asia Pacific (Osaka)| $0.02 per GB  
Asia Pacific (Seoul)| $0.02 per GB  
Asia Pacific (Singapore)| $0.02 per GB  
Asia Pacific (Sydney)| $0.02 per GB  
Asia Pacific (Taipei)| $0.02 per GB  
Asia Pacific (Thailand)| $0.08 per GB  
Asia Pacific (Tokyo)| $0.02 per GB  
Canada (Central)| $0.02 per GB  
Canada West (Calgary)| $0.02 per GB  
Europe (Frankfurt)| $0.02 per GB  
Europe (Ireland)| $0.02 per GB  
Europe (London)| $0.02 per GB  
Europe (Milan)| $0.02 per GB  
Europe (Paris)| $0.02 per GB  
Europe (Spain)| $0.02 per GB  
Europe (Stockholm)| $0.02 per GB  
Europe (Zurich)| $0.02 per GB  
Israel (Tel Aviv)| $0.02 per GB  
Mexico (Central)| $0.02 per GB  
Middle East (Bahrain)| $0.02 per GB  
Middle East (UAE)| $0.02 per GB  
South America (Sao Paulo)| $0.02 per GB  
US East (Ohio)| $0.01 per GB  
US West (Los Angeles)| $0.02 per GB  
US West (N. California)| $0.02 per GB  
US West (Oregon)| $0.02 per GB  
  
* * *

##  S3 Multi-Region Access Points pricing

Amazon S3 Multi-Region Access Points accelerate performance by up to 60% when
accessing data sets that are replicated across multiple AWS Regions. Based on
AWS Global Accelerator, S3 Multi-Region Access Points consider factors like
network congestion and the location of the requesting application to
dynamically route your requests over the AWS network to the lowest latency
copy of your data. This automatic routing allows you to take advantage of the
global infrastructure of AWS while maintaining a simple application
architecture.  

S3 Multi-Region Access Points data routing pricing

When you use an S3 Multi-Region Access Point to route requests within AWS, you
pay a data routing cost for each gigabyte (GB) processed, as well as standard
charges for S3 requests, storage, data transfer, and replication.  

**S3 Multi-Region Access Points data routing** | **Pricing** |    
---|---|---  
Data routing cost | $0.0033 per GB |    
  
S3 Multi-Region Access Points internet acceleration pricing

If your application runs outside of AWS and accesses S3 over the internet, S3
Multi-Region Access Points increase performance by automatically routing your
requests through an AWS edge location, over the global private AWS network, to
the closest copy of your data based on access latency. When you accelerate
requests made over the internet, you pay the data routing cost outlined above
and an internet acceleration cost.

S3 Multi-Region Access Points internet acceleration pricing varies based on
whether the source client is in the same or in a different location as the
destination AWS Region, and is in addition to standard S3 data transfer
pricing.  

For S3 Multi-Region Access Points availability in AWS Regions, please visit
the [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiRegionAccessPointRestrictions.html).

Internet acceleration pricing between locations

    * North America 

**Internet acceleration WITHIN North America  
** | **Pricing**  
---|---  
**Internet acceleration WITHIN North America  
** | **Pricing**  
---|---  
Data transfer IN to Amazon S3 from the internet | $0.0025 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0050 per GB  
  |    
**Internet acceleration BETWEEN North America AND any other location** |    
Data transfer IN to Amazon S3 from the internet | $0.0500 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0500 per GB  
  
    * Europe 

**Internet acceleration WITHIN Europe  
** | **Pricing**  
---|---  
**Internet acceleration WITHIN Europe  
** | **Pricing**  
---|---  
Data transfer IN to Amazon S3 from the internet | $0.0025 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0050 per GB  
  |    
**Internet acceleration BETWEEN Europe AND any other location** |    
Data transfer IN to Amazon S3 from the internet | $0.0500 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0500 per GB  
  
    * Asia Pacific 

**Internet acceleration WITHIN Asia Pacific  
** | **Pricing**  
---|---  
**Internet acceleration WITHIN Asia Pacific  
** | **Pricing**  
---|---  
Data transfer IN to Amazon S3 from the internet | $0.0100 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0150 per GB  
  |    
**Internet acceleration BETWEEN Asia Pacific AND any other location** |    
Data transfer IN to Amazon S3 from the internet | $0.0600 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0600 per GB  
  
    * South America 

**Internet acceleration WITHIN South America  
** | **Pricing**  
---|---  
**Internet acceleration WITHIN South America  
** | **Pricing**  
---|---  
Data transfer IN to Amazon S3 from the internet | $0.0250 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0400 per GB  
  |    
**Internet acceleration BETWEEN South America AND any other location** |    
Data transfer IN to Amazon S3 from the internet | $0.0600 per GB  
Data transfer OUT from Amazon S3 to the internet | $0.0600 per GB  
  
###  S3 Multi-Region Access Points failover controls pricing

S3 Multi-Region Access Points failover controls let you shift S3 data access
request traffic routed through an Amazon S3 Multi-Region Access Point within
minutes to an alternate AWS Region to build highly available applications for
business continuity. To use [failover
controls](https://aws.amazon.com/s3/features/multi-region-access-points/), you
are charged for S3 API costs to view the current routing control status of
each Region and submit any routing control changes for initiating a failover.

S3 Multi-Region Access Points pricing examples

#####  Example 1: Using S3 Multi-Region Access Points within an AWS Region

You have an application in US East (N. Virginia), and an S3 Multi-Region
Access Point that is configured to dynamically route requests to an S3 bucket
in either US East (N. Virginia) or US West (Oregon). Your application sends a
10 GB of data through an S3 Multi-Region Access Point. In this case, the
lowest latency bucket to your application will be the bucket in US East (N.
Virginia), so your requests will remain within that region. We calculate your
cost as follows.  

**S3 Multi-Region Access Point data routing cost:  **The S3 Multi-Region
Access Point data routing cost is $0.0033 per GB. In this example, 10 GB of
data was routed by your S3 Multi-Region Access Point.

Total S3 Multi-Region Access Point data routing cost = $0.0033 * 10 GB =
**$0.033  **  

**Total charges** :

S3 Multi-Region Access Point data routing = **$0.033**

Total = **$0.033**

###  Example 2: Using S3 Multi-Region Access Points across AWS Regions

You have an application in US East (N. Virginia) and a S3 Multi-Region Access
Point that is configured to dynamically route requests to an S3 bucket in
either US East (Ohio) or US West (Oregon). Your application sends a 10 GB of
data through an S3 Multi-Region Access Point. In this case, the lowest latency
bucket to your application will be the bucket in US East (Ohio).

Since your application is in US East (N. Virginia) and your lowest latency
bucket is in US East (Ohio), your requests will automatically traverse the
private AWS network from one AWS Region to another AWS Region. As a result,
you will incur standard AWS cross-region data transfer charges, in addition to
a S3 Multi-Region Access Point data routing cost. We calculate your cost as
follows.  

**S3 Multi-Region Access Point data routing cost**

The S3 Multi-Region Access Point data routing cost is $0.0033 per GB. In this
example, 10 GB of data was routed by your S3 Multi-Region Access Point.

Total S3 Multi-Region Access Point data routing cost = $0.0033 * 10 GB =
**$0.033**  

**Data transfer charges from Amazon EC2 in US East (N. Virginia) to Amazon S3
in US East (Ohio)**

The data transfer charge from US East (N. Virginia) to US East (Ohio) is $0.01
per GB. In this example, 10 GB of data went through your S3 Multi-Region
Access Point and was routed over the private AWS network from your application
in US East (N. Virginia), to an S3 bucket in US East (Ohio).

Total S3 data transfer cost = $0.01 * 10 GB = **$0.10  **

**Total Charges:**

S3 Multi-Region Access Point data routing cost = $0.033

S3 data transfer charges - US East (N. Virginia) to US East (Ohio) = $0.10

**Total = $0.133**  

###  Example 3: Using S3 Multi-Region Access Points over the internet

You have an application that supports customers in North America, Europe, and
Asia. These customers send and receive data over the internet to and from an
S3 bucket in either US East (N. Virginia), or Europe (Ireland). You created an
S3 Multi-Region Access Point to accelerate your application by routing
customer requests to the S3 bucket closest to them.

One of your customers sends 10 GB over the internet into S3 from a client in
North America. This request is automatically routed to the bucket in US East
(N. Virginia). A second customer downloads 10 GB of data over the internet
from S3 to a client in Europe. This request is automatically routed to the
bucket in Europe (Ireland). A third customer downloads 10 GB of data over the
internet from S3 to a client in Asia. This request is automatically routed to
the bucket in Europe (Ireland) as well.

Since two of your customers are transferring data out of S3 over the internet
you will incur standard AWS data transfer out charges, in addition to a S3
Multi-Region Access Point data routing cost. We calculate your cost as
follows.  

**S3 Multi-Region Access Point data routing cost**

The S3 Multi-Region Access Point data routing cost is $0.0033 per GB. In this
example, 30 GB of data was routed by your S3 Multi-Region Access Point to your
buckets.

Total S3 Multi-Region Access Point data routing cost = $0.0033 * 30 GB =
**$0.099  **  

**S3 Multi-Region Access Point internet acceleration cost:  
**

The 10 GB uploaded from a client in North America, through an S3 Multi-Region
Access Point, to a bucket in North America will incur a charge of $0.0025 per
GB.

The 10 GB downloaded from a bucket in Europe, through an S3 Multi-Region
Access Point, to a client in Europe will incur a charge of $0.005 per GB.

The 10 GB downloaded from a bucket in Europe, through an S3 Multi-Region
Access Point, to a client in Asia will incur a charge of $0.05 per GB.

Total S3 Multi-Region Access Point internet acceleration cost = $0.0025 * 10
GB + $0.005 * 10 GB + $0.05 * 10 GB = **$0.575**  

**S3 data transfer OUT from Amazon S3 in Europe (Ireland) to internet**

The Data Transfer out charge from Amazon S3 in Europe (Ireland) to internet is
$0.09 per GB. In this example, 20 GB were transferred out; one to a client in
Europe, and one to a client in Asia.

Total data transfer cost = $0.09 * 20 GB = **$1.80**

**Total Charges:**

S3 Multi-Region Access Point data routing cost = $0.099

S3 Multi-Region Access Point internet acceleration cost = $0.575

S3 data transfer charges - Europe (Ireland) data transfer OUT to internet =
$1.80

**Total = $2.474**

###  Example 4: Using S3 Multi-Region Access Points with cross-account buckets
across AWS Regions

You have an application in US East (N. Virginia) and a S3 Multi-Region Access
Point in AWS account 1 that is configured to dynamically route requests. You
can route to an S3 bucket belonging to a separate AWS account 2 in US East
(Ohio) or to an S3 bucket belonging to a separate AWS account 3 in US West
(Oregon). Your application sends a 10 GB of data through an S3 Multi-Region
Access Point. In this case, the lowest latency bucket to your application will
be the bucket in US East (Ohio).  

Since your application is in US East (N. Virginia) and your lowest latency
bucket is in US East (Ohio), your requests will automatically traverse the
private AWS network from one AWS Region to another AWS Region. As a result,
you will incur standard AWS cross-Region data transfer charges, in addition to
a S3 Multi-Region Access Point data routing cost. We calculate your cost as
follows.

As an account owner that owns only the Multi-Region Access Point, but not the
US East (Ohio) bucket, you incur the following charges:  

**S3 Multi-Region Access Point data routing cost:**

The S3 Multi-Region Access Point data routing cost is $0.0033 per GB. In this
example, 10 GB of data was routed by your S3 Multi-Region Access Point.  

Total S3 Multi-Region Access Point data routing cost = $0.0033 * 10 GB =
**$0.033  **

**Total Charges:**  

S3 Multi-Region Access Point data routing cost =**$0.033**

The owner of the bucket in US East (Ohio) will only incur the following
charges:  

The data transfer charge from US East (N. Virginia) to US East (Ohio) is $0.01
per GB. In this example, 10 GB of data went through your S3 Multi-Region
Access Point and was routed over the private AWS network from your application
in US East (N. Virginia) to an S3 bucket in US East (Ohio).  

Total S3 data transfer cost = $0.01 * 10 GB = **$0.10**  

**Total Charges:**  
  
S3 data transfer cost = **$0.10**

The owner of the bucket in US West (Oregon) will not incur any data transfer
costs or request costs as the current request is not being routed to their
bucket.  

**Note:  **  
  
The behavior for each request to a Multi-Region Access Point is determined by
the respective bucket where the request lands. As a bucket owner, if your
bucket is configured to be a Requester Pays bucket, the requester pays all of
the cost associated to the endpoint usage, including the cost for requests and
data transfer cost associated to both the bucket and the Multi-Region Access
Point. Typically, you want to configure your buckets as requester pays buckets
if you wish to share data but not incur charges associated with others
accessing the data. To learn more, please visit [S3 Requester
Pays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html).  

* * *

S3 Transfer Acceleration pricing

[S3 Transfer Acceleration](/s3/transfer-acceleration/) accelerates internet
transfers between the client and a single S3 bucket. Pricing is based on the
AWS [edge location](https://aws.amazon.com/cloudfront/features/) used to
accelerate your transfer. S3 Transfer Acceleration pricing is in addition to
Data Transfer pricing.

Each time you use S3 Transfer Acceleration to upload an object, we will check
whether the service is likely to be faster than a regular Amazon S3 transfer.
If we determine that it is not likely to be faster than a regular Amazon S3
transfer of the same object to the same destination AWS Region, we will not
charge for that use of S3 Transfer Acceleration for that transfer, and may
bypass the S3 Transfer Acceleration system for that upload.  

Check your performance with the Amazon S3 Transfer Acceleration [speed
comparison tool](http://s3-accelerate-
speedtest.s3-accelerate.amazonaws.com/en/accelerate-speed-comparsion.html).  

**Data Transfer IN to Amazon S3 from the Internet:** |    
---|---  
Accelerated by AWS Edge Locations in the United States, Europe, and Japan | $0.04 per GB  
Accelerated by all other AWS Edge Locations | $0.08 per GB  
  |    
**Data Transfer OUT from Amazon S3 to the Internet:** |    
Accelerated by any AWS Edge Location | $0.04 per GB  
  |    
**Data Transfer between Amazon S3 and another AWS region:** |    
Accelerated by any AWS Edge Location | $0.04 per GB  
  
For Data Transfers exceeding 500 TB/Month, please [contact
us](https://pages.awscloud.com/ln_NAMER_AmazonS3-Contact-Us.html).  

Storage and bandwidth size includes all file overhead.

Rate tiers take into account your aggregate usage for Data Transfer Out to the
Internet across all AWS services.  

††† Data Transfer Out may be different from the data received by your
application in case the connection is prematurely terminated by you, for
example, if you make a request for a 10 GB object and terminate the connection
after receiving the first 2 GB of data. Amazon S3 attempts to stop the
streaming of data, but it does not happen instantaneously. In this example,
the Data Transfer Out may be 3 GB (1 GB more than 2 GB you received). As a
result, you will be billed for 3 GB of Data Transfer Out.

  * Security & buckets 

  * S3 Encryption 

* * *

Region:

####  S3 bucket types

Amazon S3 supports four different [bucket
types](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html):
general purpose buckets, directory buckets, and table buckets, and vector
buckets. S3 general purpose buckets are available in all AWS Regions. For
Regional availability details, visit the S3 User Guide for [directory
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/endpoint-
directory-buckets-AZ.html), [table
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-
regions-quotas.html), and [vector
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-
regions-quotas.html).

####  S3 general purpose buckets

[Amazon S3 general purpose
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html)
are the original S3 bucket type, and a single general purpose bucket can
contain objects stored across all storage classes except S3 Express One Zone.  

####  S3 directory buckets

[Amazon S3 directory
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-
buckets-overview.html) only allow objects stored in the S3 Express One Zone
storage class, which provides faster data processing within a single
Availability Zone.  

####  S3 table buckets

[Amazon S3 table
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables.html)
are purpose-built for storing tabular data. They deliver up to 3x faster query
performance and up to 10x higher transactions per second, making them
specifically optimized for analytics workloads.

Table buckets       | Free  
---|---  
  
####  S3 vector buckets

[Amazon S3 vector
buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html)
are purpose-built for storing and querying vectors. Within a vector bucket,
you use dedicated vector APIs to write vector data and query it based on
semantic meaning and similarity.

Vector buckets       | Free  
---|---  
  
S3 Access Grants

[Amazon S3 Access Grants](https://aws.amazon.com/s3/features/access-grants/)
map identities in directories such as Active Directory, or AWS Identity and
Access Management (IAM) Principals, to datasets in S3. This helps you manage
data permissions at scale by automatically granting S3 access to end-users
based on their corporate identity. Additionally, S3 Access Grants log end-user
identity, as well as the application used to access S3 data, in AWS
CloudTrail. This helps to provide a detailed audit history down to the end-
user identity for all access to the data in your S3 buckets.  

* * *

Region:

  * Management & insights 

  * You pay for the storage management features and analytics (Amazon S3 Metadata, Amazon S3 Inventory, Amazon S3 Storage Class Analysis, Amazon S3 Storage Lens, and Amazon S3 Object Tagging) that are enabled on your account’s buckets. S3 storage management and analytics are priced per feature as detailed in the following table. For pricing on Amazon CloudWatch metrics, visit the [Amazon CloudWatch pricing page](https://aws.amazon.com/cloudwatch/pricing/). For pricing on S3 data events in AWS CloudTrail, visit the [AWS CloudTrail pricing page](https://aws.amazon.com/cloudtrail/pricing/).  

Storage management

S3 Metadata pricing

[Amazon S3 Metadata](https://aws.amazon.com/s3/features/metadata/) delivers
queryable object metadata in near real time to organize your data and
accelerate data discovery. This helps you to curate, identify, and use your
Amazon S3 data for business analytics, real-time inference applications, and
more.  

* * *

Region:

S3 Metadata pricing example:

You upload 1,000,000 new images every month in a general purpose S3 bucket
with an existing 200,000,000 objects that have S3 Metadata journal and live
inventory table configuration enabled. You want to determine the total price
for enabling the live inventory table, to generate your latest list of objects
and metadata, and enabling the journal table to track the changes into your
bucket. This example uses the US West (Oregon) Region.

Your charges would be calculated as follows:

**S3 Metadata journal table ($/million updates)**  
S3 Metadata price for journal tables is $0.30 per million updates  
Since you are providing 1,000,000 updates, your charges would be:  
S3 Metadata charge: 1,000,000 * $0.30/1,000,000 = $0.30

**S3 Metadata live inventory table ($/million updates) – one time backfill
charge**  
S3 Metadata price for one-time backfill of existing objects is $0.30 per
million updates  
Since you have existing 200,000,000 objects, your charges would be:  
S3 Metadata charge: 200,000,000 * $0.30/1,000,000 = $60.00

**S3 Metadata live inventory table ($/million objects) – monthly charge**  
S3 Metadata live inventory price is $0.10 per million objects per month for
buckets  with objects greater than 1 billion. For buckets with fewer than 1
billion objects, there is no monthly cost for keeping your live inventory
table up to date.  
Since your general purpose S3 bucket has fewer than 1 billion objects, there
is no monthly cost for keeping your live inventory table up to date.

**Total charges:**  
Total charges for S3 Metadata include your journal table charges, the one-time
backfill cost, and the monthly fee for live inventory tables for buckets with
more than 1 billion objects. In this example, your monthly charges are
calculated as follows:

S3 Metadata charges for the first month: $0.30 + $60.00 + $0.00 = $60.30  
S3 Metadata monthly charges, for the second month onwards: $0.30 + $0.00 +
$0.00 = $0.30

_Note that separate charges for table storage, maintenance, and requests will
apply._  

S3 Inventory & S3 Object Tagging pricing

* * *

Region:

S3 Batch Operations pricing

* * *

Region:

Compute checksum operation pricing

The compute checksum operation provides a new way to verify the content of
stored datasets. You can efficiently verify billions of objects and
automatically generate integrity reports to prove that your datasets remain
intact over time using S3 Batch Operations.

* * *

Region:

Compute checksum operation pricing example

You have 1,000,000 high-resolution images stored in the S3 Standard storage
class, each with an average size of 2 MB. You want to verify the integrity of
these images before processing them. This example uses the US East (N.
Virginia) Region.  
Your charges would be calculated as follows:

**Amazon S3 Batch Operations charges**  
Job charge: S3 Batch Operations jobs cost $0.25 per job  
Object charge: S3 Batch Operations charges $1 per million objects processed  
Since you are processing 1,000,000 objects, your charges would be:  
S3 Batch Operations Job charge: 1 job * $0.25 = $0.25  
S3 Batch Operations Object charge: 1,000,000 objects * ($1 per million objects
/ 1,000,000) = $1.00  
Total S3 Batch Operations charges: $1.25

**Compute checksum operation charges**  
Compute checksum operation cost: $0.004 per GB of data processed  
For 1,000,000 objects at 2 MB each, the total data processed is:  
Total data processed: 1,000,000 objects * 2 MB = 2,000,000 MB = 2,000 GB  
Compute checksum operation charge: 2,000 GB * $0.004 per GB = $8.00

**Total charges:  
**Amazon S3 Batch Operations charges: $1.25  
Compute checksum operation charges: $8.00  
Total = $9.25

Storage insights

S3 Storage Lens pricing

* * *

Region:

S3 Storage Class Analysis pricing

* * *

Region:

Except as otherwise noted, our prices are exclusive of applicable taxes and
duties, including VAT and applicable sales tax. For customers with a Japanese
billing address, use of AWS is subject to Japanese Consumption Tax. To learn
more, visit our [consumption tax FAQs »](https://aws.amazon.com/c-tax-faqs/)

Amazon S3 storage usage is calculated in binary gigabytes (GB), where 1 GB is
230 bytes. This unit of measurement is also known as a gibibyte (GiB), defined
by the International Electrotechnical Commission (IEC). Similarly, 1 TB is 240
bytes, i.e. 1024 GBs.

For S3 pricing examples, go to the [S3 billing
FAQs](https://aws.amazon.com/s3/faqs/#Billing) or use the [AWS Pricing
Calculator](http://aws.amazon.com/calculator/).

  * Replication 

  * S3 Cross-Region Replication, Same-Region Replication, and Replication Time Control 

S3 Batch Replication

While live replication like CRR and SRR automatically replicates newly
uploaded objects as they are written to your bucket, [S3 Batch
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html) allows you to replicate existing objects. S3 Batch
Replication is built using S3 Batch Operations to replicate objects as fully
managed Batch Operations jobs. Similar to SRR and CRR, you pay the S3 charges
for storage in the selected destination S3 storage classes, for the primary
copy, for replication PUT requests, and for applicable infrequent access
storage retrieval charges. When replicating across AWS Regions, you also pay
for inter-Region Data Transfer OUT from S3 to each destination Region. If an
object already exists in the destination bucket, we will check if the
destination object is in sync with the source object. If the metadata is not
in sync and needs to be replicated, you will incur the replication PUT request
charge but not the inter-Region Data Transfer OUT charge. If the metadata is
in sync, Batch Replication will do nothing and you incur no charge. For more
details on replication pricing, read the [pricing
FAQs](/s3/faqs/#Replication).  

In addition to these charges, you also pay the S3 Batch Operations charges for
Batch Replication jobs. See the following table for details.

Finally, when replicating existing objects, you need to indicate what objects
to replicate. You can do this by providing a list of objects to S3 yourself,
or use an AWS-generated manifest where you can specify filters such as object
creation date and replication status. If you use the manifest, there is a
charge based on the number of objects in the source bucket.

* * *

Region:

  * Transform & query 

  * S3 Object Lambda pricing 

* * *

Region:

S3 Object Lambda pricing example

You have 1,000,000 objects that contain historical log data, generated by many
applications. Confidential log entries make up 50% of the data. These logs are
stored in the S3 Standard storage class, and the average object size is 1000
KB. You are building an application that analyzes this data, but should not
have access to confidential log entries.

You can use S3 Object Lambda to filter out confidential log entries. This
filtering occurs as your logs are retrieved from S3 with standard S3 GET
requests. The Lambda function to filter your data is allocated 512MB of
memory, has a 1 second runtime, and returns filtered objects that are 500 KB
in size (on average) back to your application. This example assumes one
retrieval per month for each object. This example uses the US East (N.
Virginia) Region.  

Your charges would be calculated as follows:

**_Amazon S3 GET request charge_**

S3 GET requests from the S3 Standard storage class cost $0.0004 per 1,000
requests.  

S3 GET Request cost: 1,000,000 requests * $0.0004/1K requests = **$0.40**

**_AWS Lambda Charges_**

The Lambda compute cost is $0.0000167 per GB-second. GB-seconds are calculated
based on the number of seconds that a Lambda function runs, adjusted by the
amount of memory allocated to it.

The Lambda request price is $0.20 per 1 million requests.

Lambda compute charge: 1,000,000 requests * 1 second * 0.5 GB (512 MB/1024)
memory allocated * $0.0000167 per GB-second = $8.35  

Lambda request charge = 1,000,000 requests * $0.20 per 1 million requests =
$0.20  

Total Lambda cost = $8.35 + $0.20 = **$8.55**  

**_S3 Object Lambda Charge_**  
After the Lambda function filters the object, 500 KB is returned to the
application at a cost of $0.005/GB of data returned.  
  
Data Return Charge: 1,000,000 * 500 KB * $0.005/GB = **$2.50  
**  
**_Total Charges:  _**  

Amazon S3 GET request charges = $0.40

AWS Lambda charges = $8.55

Amazon S3 Object Lambda charges = $2.50

**_Total = $11.45  
_**

S3 Select & S3 Glacier Select pricing

* * *

Region:

