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

US East (N. Virginia)

|  
---|---  
S3 Metadata journal tables| $0.30 per million updates ††  
S3 Metadata live inventory tables| $0.10 per million objects per month
†††(one-time backfill fee applies)  
|  
  
†† Updates include new object uploads, changes to object metadata, and object
deletes for journal tables. Updates also include one-time backfill of all
objects for live inventory tables. Additional charges for Amazon S3 Tables
will apply.

††† Monthly fee applicable only for buckets with greater than 1 billion
objects.

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

