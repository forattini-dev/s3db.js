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

US East (N. Virginia)

#### **S3 Tables storage pricing**

  
|  
  
---|---  
**S3 Tables** \- Storage specifically optimized for analytics workloads with
improved query performance  
Monitoring, All Storage / Month| $0.025 per 1,000 objects  
First 50 TB / Month| $0.0265 per GB  
Next 450 TB / Month| $0.0253 per GB  
Over 500 TB / Month| $0.0242 per GB  
  
#### **S3 Tables requests pricing**

  
|  PUT, POST, LIST requests (per 1,000 requests)| GET, and all other requests
(per 1,000 requests)  
---|---|---  
**S3 Tables**|  $0.005| $0.0004  
  
#### S3 Tables maintenance pricing

|  
---|---  
Compaction - Objects†| $0.002 per 1,000 objects processed  
Compaction - Data Processed with Binpack (Default)| $0.005 per GB processed  
Compaction - Data Processed with Sort or Z-order| $0.01 per GB processed  
  
† Compaction charges are incurred when objects stored in your table buckets
are processed for automatic compaction. These charges will not be incurred if
you disable automatic compaction in a specified table in your S3 table bucket.

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

