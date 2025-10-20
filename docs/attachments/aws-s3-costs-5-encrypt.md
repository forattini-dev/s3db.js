* S3 Encryption 

* * *

Region:

US East (N. Virginia)

|  
---|---  
Server-side encryption with Amazon S3 managed keys (SSE-S3)| Free  
Server-side encryption with customer provided keys (SSE-C)| Free  
Server-side encryption with keys stored in AWS Key Management Service (SSE-
KMS)| Free†  
Dual-layer server-side encryption with keys stored in AWS Key Management
Service (DSSE-KMS)| $0.003 per gigabyte ††  
  
Amazon S3 automatically applies server-side encryption with Amazon S3 managed
keys (SSE-S3) as a base layer of encryption to all new objects added to S3, at
no additional cost and with no impact on performance. SSE-C also does not
incur any additional S3 charges.

† For SSE-KMS, you pay AWS KMS charges to generate or retrieve the data key
used for encryption and decryption. For pricing on AWS KMS, visit the [AWS KMS
pricing page](https://aws.amazon.com/kms/pricing/). You can also optimize your
SSE-KMS costs with [Amazon S3 Bucket
Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html).

†† For DSSE-KMS, in addition to the charges for AWS KMS mentioned above, you
pay an additional per gigabyte encryption fee for the second layer of
encryption and decryption of data.

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

