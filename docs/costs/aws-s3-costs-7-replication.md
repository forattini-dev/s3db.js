* S3 Cross-Region Replication, Same-Region Replication, and Replication Time Control 

####

For Cross-Region Replication (CRR) and Same-Region Replication (SRR), you pay
the S3 charges for storage in the selected destination S3 storage classes, for
the primary copy, for replication PUT requests, and for applicable infrequent
access storage retrieval charges. For CRR, you also pay for inter-region Data
Transfer OUT from S3 to each destination region. When you use S3 Replication
Time Control, you also pay a Replication Time Control Data Transfer charge and
S3 Replication Metrics charges that are billed at the same rate as [Amazon
CloudWatch custom metrics](https://aws.amazon.com/cloudwatch/pricing/).

Storage and PUT request pricing for the replicated copy is based on the
selected destination AWS Regions, while pricing for inter-region data
transfers is based on the source AWS Region. For more details on replication
pricing, read the [pricing FAQs](https://aws.amazon.com/s3/faqs/#Replication).

|  
---|---  
S3 Replication Time Control data transfer†| $0.015 per GB  
  
† Amazon S3 Replication Time Control Data Transfer pricing is the same in all
AWS Regions. Replication Time Control is available in all commercial AWS
Regions, including the AWS China (Beijing) Region and the AWS China (Ningxia)
Region, but not in the AWS GovCloud (US) Regions.

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

####

* * *

Region:

US East (N. Virginia)

|  
---|---  
Batch Operations – Jobs| $0.25 per job  
Batch Operations – Objects| $1.00 per million objects processed  
Batch Operations – Manifest (optional)| $0.015 per 1 million objects in the
source bucket

