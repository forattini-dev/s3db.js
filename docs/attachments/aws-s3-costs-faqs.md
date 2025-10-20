## General S3 FAQs

Close all

### What is Amazon S3?

Amazon S3 is object storage built to store and retrieve any amount of data
from anywhere. S3 is a simple storage service that offers industry leading
durability, availability, performance, security, and virtually unlimited
scalability at very low costs.  

### What can I do with Amazon S3?

Amazon S3 provides a simple web service interface that you can use to store
and retrieve any amount of data, at any time, from anywhere. Using this
service, you can easily build applications that make use of cloud native
storage. Since Amazon S3 is highly scalable and you only pay for what you use,
you can start small and grow your application as you wish, with no compromise
on performance or reliability. Amazon S3 is also designed to be highly
flexible. Store any type and amount of data that you want, read the same piece
of data a million times or only for emergency disaster recovery, build a
simple FTP application or a sophisticated web application such as the
Amazon.com retail web site. Amazon S3 frees you to focus on innovation instead
of spending time figuring out how to store your data.

### How can I get started using Amazon S3?

To sign up for Amazon S3, visit the [S3
console](https://s3.console.aws.amazon.com/s3/home). You must have an Amazon
Web Services account to access this service. If you do not already have an
account, you will be prompted to create one when you begin the Amazon S3 sign-
up process. After signing up, refer to the [Amazon S3
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html),
view the [S3 getting started materials](/s3/getting-started/), and see the
additional resources in the [resource
center](http://docs.aws.amazon.com/AmazonS3/latest/API/RelatedResources.html)
to begin using Amazon S3.

### What can I do with Amazon S3 that I cannot do with an on-premises
solution?

Amazon S3 lets you leverage Amazon’s own benefits of massive scale with no up-
front investment or performance compromises. By using Amazon S3, it is
inexpensive and simple to ensure your data is quickly accessible, always
available, and secure.

### What kind of data can I store in Amazon S3?

You can store virtually any kind of data in any format. Refer to the [Amazon
Web Services Licensing Agreement](/agreement/) for details.

### How much data can I store in Amazon S3?

The total volume of data and number of objects you can store in Amazon S3 are
unlimited. Individual Amazon S3 objects can range in size from a minimum of 0
bytes to a maximum of 5 TB. The largest object that can be uploaded in a
single PUT is 5 GB. For objects larger than 100 MB, customers should consider
using the [multipart
upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
capability.

### What is an S3 general purpose bucket?

A general purpose bucket is a container for objects stored in Amazon S3, and
you can store any number of objects in a bucket. General purpose buckets are
the original S3 bucket type, and a single general purpose bucket can contain
objects stored across all storage classes except S3 Express One Zone. They are
recommended for most use cases and access patterns.  

### What is an S3 directory bucket?

A directory bucket is a container for objects stored in Amazon S3, and you can
store any number of objects in a bucket. S3 directory buckets only allow
objects stored in the S3 Express One Zone storage class, which provides faster
data processing within a single Availability Zone. They are recommended for
low-latency use cases. Each S3 directory bucket can support up to 2 million
transactions per second (TPS), independent of the number of directories within
the bucket.  

### What is an S3 table bucket?

  
A table bucket is purpose-built for storing tables using the Apache Iceberg
format. Use [Amazon S3 Tables](https://aws.amazon.com/s3/features/tables/) to
create table buckets and set up table-level permissions in just a few steps.
S3 table buckets are specifically optimized for analytics and machine learning
workloads. With built-in support for Apache Iceberg, you can query tabular
data in S3 with popular query engines including Amazon Athena, Amazon
Redshift, and Apache Spark. Use S3 table buckets to store tabular data such as
daily purchase transactions, streaming sensor data, or ad impressions as an
Iceberg table in Amazon S3, and then interact with that data using analytics
capabilities.  

### What is an S3 vector bucket?

A vector bucket is purpose-built for storing and querying vectors. Within a
vector bucket, you do not use the S3 object APIs, but rather dedicated vector
APIs to write vector data and query it based on semantic meaning and
similarity. You can control access to your vector data with the existing
access control mechanisms in Amazon S3, including bucket and IAM policies. All
writes to a vector bucket are strongly consistent, which means that you can
immediately access the most recently added vectors. As you write, update, and
delete vectors over time, S3 vector buckets automatically optimize the vector
data stored in them to achieve the optimal price-performance, even as the data
sets scale and evolve.

### What is the difference between a general purpose bucket, a directory
bucket, a table bucket, and a vector bucket?

A bucket is a container for objects and tables stored in Amazon S3, and you
can store any number of objects in a bucket. General purpose buckets are the
original S3 bucket type, and a single general purpose bucket can contain
objects stored across all storage classes except S3 Express One Zone. They are
recommended for most use cases and access patterns. S3 directory buckets only
allow objects stored in the S3 Express One Zone storage class, which provides
faster data processing within a single Availability Zone. They are recommended
for low-latency use cases. Each S3 directory bucket can support up to 2
million transactions per second (TPS), independent of the number of
directories within the bucket. S3 table buckets are purpose-built for storing
tabular data in S3 such as daily purchase transactions, streaming sensor data,
or ad impressions. When using a table bucket, your data is stored as an
Iceberg table in S3, and then you can interact with that data using analytics
capabilities such as row-level transactions, queryable table snapshots, and
more, all managed by S3. Additionally, table buckets perform continual table
maintenance to automatically optimize query efficiency over time, even as the
data lake scales and evolves. S3 vector buckets are purpose-built for storing
and querying vectors. Within a vector bucket, you use dedicated vector APIs to
write vector data and query it based on semantic meaning and similarity. You
can control access to your vector data using the existing access control
mechanisms in Amazon S3, including bucket and IAM policies. As you write,
update, and delete vectors over time, S3 vector buckets automatically optimize
the vector data stored in them to achieve the optimal price-performance, even
as the data sets scale and evolve.

### What does Amazon do with my data in Amazon S3?

Amazon stores your data and tracks its associated usage for billing purposes.
Amazon will not otherwise access your data for any purpose outside of the
Amazon S3 offering, except when required to do so by law. Refer to the [Amazon
Web Services Licensing Agreement](/agreement/) for details.

### Does Amazon store its own data in Amazon S3?

Yes. Organizations across Amazon use Amazon S3 for a wide variety of projects.
Many of these projects use Amazon S3 as their authoritative data store and
rely on it for business-critical operations.

### How is Amazon S3 data organized?

Amazon S3 is a simple key-based object store. When you store data, you assign
a unique object key that can later be used to retrieve the data. Keys can be
any string, and they can be constructed to mimic hierarchical attributes.
Alternatively, you can use S3 Object Tagging to organize your data across all
of your S3 buckets and/or prefixes.  

### How do I interface with Amazon S3?

Amazon S3 provides a simple, standards-based REST web services interface that
is designed to work with any internet-development toolkit. The operations are
intentionally made simple to make it easy to add new distribution protocols
and functional layers.  

### How reliable is Amazon S3?

Amazon S3 gives you access to the same highly scalable, highly available,
fast, inexpensive data storage infrastructure that Amazon uses to run its own
global network of web sites. The S3 Standard storage class is designed for
99.99% availability, the S3 Standard-IA storage class, S3 Intelligent-Tiering
storage class, and the S3 Glacier Instant Retrieval storage classes are
designed for 99.9% availability, the S3 One Zone-IA storage class is designed
for 99.5% availability, and the S3 Glacier Flexible Retrieval and S3 Glacier
Deep Archive class are designed for 99.99% availability and an SLA of 99.9%.
All of these storage classes are backed by the [Amazon S3 Service Level
Agreement](/s3/sla/).

### How will Amazon S3 perform if traffic from my application suddenly spikes?

Amazon S3 is designed from the ground up to handle traffic for any internet
application. Pay-as-you-go pricing and unlimited capacity ensures that your
incremental costs don’t change and that your service is not interrupted.
Amazon S3’s massive scale lets you spread the load evenly, so that no
individual application is affected by traffic spikes.

### Does Amazon S3 offer a Service Level Agreement (SLA)?

Yes. The [Amazon S3 SLA](/s3/sla/) provides for a service credit if a
customer's monthly uptime percentage is below our service commitment in any
billing cycle.  

### What is the consistency model for Amazon S3?

Amazon S3 delivers strong read-after-write consistency automatically, without
changes to performance or availability, without sacrificing regional isolation
for applications, and at no additional cost. After a successful write of a new
object or an overwrite of an existing object, any subsequent read request
immediately receives the latest version of the object. S3 also provides strong
consistency for list operations, so after a write, you can immediately perform
a listing of the objects in a bucket with any changes reflected.

### Why does strong read-after-write consistency help me?

Strong read-after-write consistency helps when you need to immediately read an
object after a write; for example, when you often read and list immediately
after writing objects. High-performance computing workloads also benefit in
that when an object is overwritten and then read many times simultaneously,
strong read-after-write consistency provides assurance that the latest write
is read across all reads. These applications automatically and immediately
benefit from strong read-after-write consistency. The strong consistency of S3
also reduces costs by removing the need for extra infrastructure to provide
strong consistency.  

## AWS Regions

Close all

### Where is my data stored?

You specify an AWS Region when you create your Amazon S3 general purpose
bucket. For S3 Standard, S3 Standard-IA, S3 Intelligent-Tiering, S3 Glacier
Instant Retrieval, S3 Glacier Flexible Retrieval, and S3 Glacier Deep Archive
storage classes, your objects are automatically stored across multiple devices
spanning a minimum of three Availability Zones (AZs). AZs are physically
separated by a meaningful distance, many kilometers, from any other AZ,
although all are within 100 km (60 miles) of each other. Objects stored in the
S3 One Zone-IA storage class are stored redundantly within a single
Availability Zone in the AWS Region you select.  You specify a single
Availability Zone or AWS Dedicated Local Zone when you create your directory
bucket. Objects in directory buckets are stored redundantly within a single
Availability Zone or single Local Zone. When using S3 storage classes for
Dedicated Local Zones, your objects stay in the Dedicated Local Zone unless
you transfer them to an AWS Region. For S3 on Outposts, your data is stored in
your Outpost on-premises environment, unless you manually choose to transfer
it to an AWS Region. Refer to [AWS regional services
list](https://aws.amazon.com/about-aws/global-infrastructure/regional-product-
services/) for details of Amazon S3 service availability by AWS Region.  

### Why should I use Amazon S3 storage classes for AWS Dedicated Local Zones?

You should use [S3 storage classes for AWS Dedicated Local
Zones](https://aws.amazon.com/s3/storage-classes/?nc=sn&loc=3#product-
faqs%23s3-storage-classes%23s3-on-
outposts:~:text=Data%20residency%20and%20isolation,-Open%20all) if you have
sensitive data and applications that need to run on physically separate
infrastructure that is dedicated to your exclusive use and placed within a
specified regulatory jurisdiction to address security and compliance
requirements. For example, some regulations require data must be stored in a
particular country or state, for regulatory, contractual, or information
security reasons common in public sector, healthcare, oil and gas, and other
highly-regulated industries. AWS works with you to configure your own private
zones with the enhanced security and governance capabilities needed to help
you meet your regulatory requirements.  

### What is an AWS Region?

An [AWS Region](/about-aws/global-infrastructure/regions_az/) is a physical
location around the world where AWS cluster data centers.  Each group of
logical data centers within a Region is know as an Availability Zone (AZ).
Each AWS Region consists of a minimum of three, isolated, and physically
separate AZs within a geographic area. Unlike other cloud providers, who often
define a Region as a single data center, the multiple AZ design of every AWS
Region offers advantages for customers. Each AZ has independent power,
cooling, and physical security and is connected via redundant, ultra-low-
latency networks.  

### What is an AWS Availability Zone (AZ)?

An [Availability Zone (AZ)](/about-aws/global-infrastructure/regions_az/) is
one or more discrete data centers with redundant power, networking, and
connectivity in an AWS Region. AZs give customers the ability to operate
production applications and databases that are more highly available, fault
tolerant, and scalable than would be possible from a single data center. All
AZs in an AWS Region are interconnected with high-bandwidth, low-latency
networking, over fully redundant, dedicated metro fiber providing high-
throughput, low-latency networking between AZs. Amazon S3 Standard, S3
Standard-Infrequent Access, S3 Intelligent-Tiering, S3 Glacier Instant
Retrieval, S3 Glacier Flexible Retrieval, and S3 Glacier Deep Archive storage
classes replicate data across a minimum of three AZs to protect against the
loss of one entire AZ. This remains true in Regions where fewer than three AZs
are publicly available. Objects stored in these storage classes are available
for access from all of the AZs in an AWS Region.  
The Amazon S3 One Zone-IA storage class replicates data within a single AZ.
The data stored in S3 One Zone-IA is not resilient to the physical loss of an
Availability Zone resulting from disasters, such as earthquakes, fires, and
floods.  

### How do I decide which AWS Region to store my data in?

There are several factors to consider based on your specific application. For
instance, you may want to store your data in a Region that is near your
customers, your data centers, or other AWS resources to reduce data access
latencies. You may also want to store your data in a Region that is remote
from your other operations for geographic redundancy and disaster recovery
purposes. You should also consider Regions that let you address specific legal
and regulatory requirements and/or reduce your storage costs—you can choose a
lower priced Region to save money. For S3 pricing information, visit the
[Amazon S3 pricing page](/s3/pricing/).

### In which parts of the world is Amazon S3 available?

Amazon S3 is available in AWS Regions worldwide, and you can use Amazon S3
regardless of your location. You just have to decide which AWS Region(s) you
want to store your Amazon S3 data. See the [AWS regional services
list](/about-aws/global-infrastructure/regional-product-services/) for a list
of AWS Regions in which S3 is available today.

## Billing

Close all

### How much does Amazon S3 cost?

With Amazon S3, you pay only for what you use. There is no minimum charge. You
can estimate your monthly bill using the [AWS Pricing
Calculator](https://calculator.aws/). AWS charges less where our costs are
less. Some prices vary across Amazon S3 Regions. Billing prices are based on
the location of your S3 bucket. There is no Data Transfer charge for data
transferred within an Amazon S3 Region via a COPY request. Data transferred
via a COPY request between AWS Regions is charged at rates specified on the
[Amazon S3 pricing page](/s3/pricing/). There is no Data Transfer charge for
data transferred between Amazon EC2 (or any AWS service) and Amazon S3 within
the same Region, for example, data transferred within the US East (Northern
Virginia) Region. However, data transferred between Amazon EC2 (or any AWS
service) and Amazon S3 across all other Regions is charged at rates specified
on the [Amazon S3 pricing page](/s3/pricing/), for example, data transferred
between Amazon EC2 US East (Northern Virginia) and Amazon S3 US West (Northern
California). Data transfer costs are billed to the source bucket owner. For S3
on Outposts pricing, visit the [Outposts pricing page](/outposts/pricing/).

### How will I be charged and billed for my use of Amazon S3?

There are no set up charges or commitments to begin using Amazon S3. At the
end of the month, you will automatically be charged for that month’s usage.
You can view your charges for the current billing period at any time by
logging into your Amazon Web Services account, and selecting the 'Billing
Dashboard' associated with your console profile. With the [AWS Free Usage
Tier*](/free/), you can get started with Amazon S3 for free in all Regions
except the AWS GovCloud Regions. Upon sign up, new AWS customers receive 5 GB
of Amazon S3 Standard storage, 20,000 Get Requests, 2,000 Put Requests, and
100 GB of data transfer out (to internet, other AWS Regions, or Amazon
CloudFront) each month for one year. Unused monthly usage will not roll over
to the next month. Amazon S3 charges you for the following types of usage.
Note that the calculations below assume there is no AWS Free Tier in place.

Starting July 15, 2025, new AWS customers will receive up to $200 in AWS Free
Tier credits, which can be applied towards eligible AWS services, including
Amazon S3. At account sign-up, you can choose between a free plan and a paid
plan. The free plan will be available for 6 months after account creation. If
you upgrade to a paid plan, any remaining Free Tier credit balance will
automatically apply to your AWS bills. All Free Tier credits must be used
within 12 months of your account creation date. To learn more about the AWS
Free Tier program, refer to [AWS Free Tier
website](https://aws.amazon.com/free/) and [AWS Free Tier
documentation](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-
tier.html).

### Why do prices vary depending on which Amazon S3 Region I choose?

AWS charges less where our costs are less. For example, our costs are lower in
the US East (Northern Virginia) Region than in the US West (Northern
California) Region.

### How am I charged for using Versioning?

Normal Amazon S3 rates apply for every version of an object stored or
requested. For example, let’s look at the following scenario to illustrate
storage costs when utilizing Versioning (let’s assume the current month is 31
days long): 1) Day 1 of the month: You perform a PUT of 4 GB (4,294,967,296
bytes) on your bucket.  
2) Day 16 of the month: You perform a PUT of 5 GB (5,368,709,120 bytes) within
the same bucket using the same key as the original PUT on Day 1.  
  
When analyzing the storage costs of the above operations, note that the 4 GB
object from Day 1 is not deleted from the bucket when the 5 GB object is
written on Day 15. Instead, the 4 GB object is preserved as an older version
and the 5 GB object becomes the most recently written version of the object
within your bucket. At the end of the month: Total Byte-Hour usage  
[4,294,967,296 bytes x 31 days x (24 hours / day)] + [5,368,709,120 bytes x 16
days x (24 hours / day)] = 5,257,039,970,304 Byte-Hours. Conversion to Total
GB-Months  
5,257,039,970,304 Byte-Hours x (1 GB / 1,073,741,824 bytes) x (1 month / 744
hours) = 6.581 GB-Month The cost is calculated based on the current rates for
your Region on the [Amazon S3 pricing page](/s3/pricing/).

### How am I charged for accessing Amazon S3 through the AWS Management
Console?

Normal Amazon S3 pricing applies when accessing the service through the [AWS
Management Console](https://s3.console.aws.amazon.com/s3/home). To provide an
optimized experience, the AWS Management Console may proactively execute
requests. Also, some interactive operations result in more than one request to
the service.

### How am I charged if my Amazon S3 buckets are accessed from another AWS
account?

Normal Amazon S3 pricing applies when your storage is accessed by another AWS
Account. Alternatively, you may choose to configure your bucket as a Requester
Pays bucket, in which case the requester will pay the cost of requests and
downloads of your Amazon S3 data. You can find more information on Requester
Pays bucket configurations in the [Amazon S3
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/RequesterPaysBuckets.html).

### Do your prices include taxes?

Except as otherwise noted, our prices are exclusive of applicable taxes and
duties, including VAT and applicable sales tax. For customers with a Japanese
billing address, use of AWS services is subject to Japanese Consumption Tax.
[Learn more about taxes on AWS services »](/c-tax-faqs/)

### Will I incur any data transfer out to the internet charges when I move my
data out of AWS?

AWS offers eligible customers free data transfer out to the internet when they
move all of their data off of AWS, in accordance with the process below.

### I want to move my data out of AWS. How do I request free data transfer out
to the internet?

Complete the following steps: 1) If you have a dedicated AWS account team,
contact them first and inform them of your plans. In some cases, if you have a
negotiated commitment with AWS, you'll want to discuss your options with your
AWS account team. 2) Review the criteria and process described on this page.
3) Contact [AWS Customer Support](/contact-us/) and indicate that your request
is for “free data transfer to move off AWS.” AWS Customer Support will ask
that you provide information, so they can review your moving plans, evaluate
whether you qualify for free data transfer out, and calculate a proper credit
amount. 4) If AWS Customer Support approves your move, you will receive a
temporary credit for the cost of data transfer out based on the volume of all
data you have stored across AWS services at the time of AWS’ calculation. AWS
Customer Support will notify you if you are approved, and you will then have
60 days to complete your move off of AWS. The credit will count against data
transfer out usage only, and it will not be applied to other service usage.
After your move away from AWS services, within the 60-day period, you must
delete all remaining data and workloads from your AWS account, or you can
close your AWS account. Free data transfers for moving IT providers are also
subject to the following criteria: a) Only customers with an active AWS
account in good standing are eligible for free data transfer out. b) If you
have less than 100 GB of data stored in your AWS account you may move this
data off of AWS for free under AWS’s existing 100 GB monthly free tier for
data transfer out. Customers with less than 100 GB of data stored in their AWS
account are not eligible for additional credits. c) AWS will provide you with
free data transfer out to the internet when you move all of your data off of
AWS. If you only want to move your total usage of a single service, but not
everything, contact AWS Customer Support. d) If your plans change, or you
cannot complete your move off of AWS within 60 days, you must notify AWS
Customer Support. e) Standard services charges for use of AWS services are not
included. Only data transfer out charges in support of your move off of AWS
are eligible for credits. However, data transfer out from specialized data
transfer services, such as Amazon CloudFront, AWS Direct Connect, AWS
Snowball, and AWS Global Accelerator, are not included. f) AWS may review your
service usage to verify compliance with these requirements. If we determine
your use of data transfer out was for a purpose other than moving off of AWS,
we may charge you for the data transfer out that had been credited. g) AWS may
make changes with respect to free data transfers out to the internet at any
time.

### Why do I have to request AWS’ pre-approval for free data transfer out to
the internet before moving my data out of AWS?

AWS customers make hundreds of millions of data transfers each day, and we
generally don’t know the reason for any given data transfer. For example,
customers may be transferring data to an end user of their application, to a
visitor of their website, or to another cloud or on-premises environment for
backup purposes. Accordingly, the only way we know that your data transfer is
to support your move off of AWS is if you tell us beforehand.

## S3 Vectors

Close all

### How do I get started with S3 Vectors?

You can get started with S3 Vectors in four simple steps, without having to
set up any infrastructure outside of Amazon S3. First, create a vector bucket
in a specific AWS Region through the CreateVectorBucket API or in the S3
Console. Second, to organize your vector data in a vector bucket, you create a
vector index with the CreateIndex API or in the S3 Console. When you create a
vector index, you specify the distance metric (Cosine or Euclidean) and the
number of dimensions a vector should have (up to 4092). For the most accurate
results, select the distance metric recommended by your embedding model.
Third, add vector data to a vector index with the PutVectors API. You can
optionally attach metadata as key value pairs to each vector to filter
queries. Fourth, perform a similarity query using the QueryVectors API,
specifying the vector to search for and the number of the most similar results
to return.

### How do I create a vector index in a vector bucket?

You can create a vector index using the S3 Console or the CreateIndex API.
During index creation, you specify the vector bucket, index, distance metric,
dimensions, and optionally a list of metadata fields that you want to exclude
from filtering during similarity queries. For example, if you want to store
data associated with vectors purely for reference, you can specify these as
non-filterable metadata fields. Upon creation, each index is assigned a unique
Amazon Resource Name (ARN). Subsequently when you make a write or query
request, you direct it to a vector index within a vector bucket.

### How do I add vector data to my vector index?

You can add vectors to a vector index using the PutVectors API. Each vector
consists of a key, which uniquely identifies each vector in a vector index
(e.g. you can programmatically generate a UUID). To maximize write throughput,
it is recommended that you insert vectors in large batches, up to the maximum
request size. Additionally, you can attach metadata (for example, year,
author, genre, and location) as key value pairs to each vector. When you
include metadata, by default all fields can be used as filters in a similarity
query unless specified as non-filterable metadata at the time of vector index
creation. To generate new vector embeddings of your unstructured data, you can
use Amazon Bedrock’s InvokeModel API, specifying the model ID of the embedding
model you want to use.

### How do I retrieve vectors and its associated metadata?

You can use the GetVectors API to look up and return vectors and associated
metadata by the vector key.

### How do I query my vector data?

You can run a similarity query with the QueryVectors API, specifying the query
vector, the number of relevant results to return (the top k nearest
neighbors), and the index ARN. When generating the query vector, you should
use the same embedding model that was used to generate the initial vectors
stored in the vector index. For example, if you use Amazon Titan Text
Embeddings v2 in Amazon Bedrock to generate embeddings of your documents, it
is recommended that you use the same model to convert a question to a vector.
Additionally, you can use metadata filters in a query, to search vectors that
match the filter. When you run the similarity query, by default the vector
keys are returned. You can optionally include the distance and metadata in the
response.

### What are the durability and availability characteristics of S3 Vectors?

S3 Vectors offers highly durable and available vector storage. Data written to
S3 Vectors is stored on S3, which is designed for 11 9s of data durability. S3
Vectors is designed to deliver 99.99% availability with an availability SLA of
99.9%.

### What query performance can I expect with S3 Vectors?

S3 Vectors delivers sub-second query latency times. It uses the elastic
throughput of Amazon S3 to handle searches across millions of vectors and is
ideal for infrequent query workloads.

### What recall can I expect when querying S3 Vectors?

For performing similarity queries for your vector embeddings, several factors
can affect average recall, including the embedding model, size of the vector
dataset (number of vectors and dimensions), and the distribution of queries.
S3 Vectors delivers over 90% average recall for most datasets. Average recall
measures the quality of query results—90% means the response contains 90% of
the ground truth closest vectors, that are stored in the index, to the query
vector. However, because actual performance may vary depending on your
specific use case, we recommend conducting your own tests with representative
data and queries to validate that S3 vector indexes meet your recall
requirements.

### How can I see a list of vectors in a vector index?

You can see a list of vectors in a vector index with the ListVectors API,
which returns up to 1,000 vectors at a time with an indicator if the response
is truncated. The response includes the last modified date, vector key, vector
data, and metadata. You can also use the ListVectors API to easily export
vector data from a specified vector index. The ListVectors operation is
strongly consistent. So, after a write you can immediately list vectors with
any changes reflected.

### How much does it cost to use S3 Vectors?

With S3 Vectors, you pay for storage and any applicable write and read
requests (e.g., inserting vectors and performing query operations on vectors
in a vector index). To see pricing details, see the [S3 pricing
page](https://aws.amazon.com/s3/pricing/).

### Can I use S3 Vectors as my vector store in Amazon Bedrock Knowledge Bases?

Yes. While creating a Bedrock Knowledge Base through the Bedrock Console or
API, you can configure an existing S3 vector index as your vector store to
save on vector storage costs for RAG use cases. If you prefer to let Bedrock
create and manage the vector index for you, use the Quick Create workflow in
the Bedrock console. Additionally, you can configure a new S3 vector index as
your vector store for RAG workflows in Amazon SageMaker Unified Studio.

### Can I use S3 Vectors with Amazon OpenSearch Service?

Yes. There are two ways you can use S3 Vectors with Amazon OpenSearch Service.
First, S3 customers can export all vectors from an S3 vector index to
OpenSearch Serverless as a new serverless collection using either the S3 or
OpenSearch console. If you build natively on S3 Vectors, you will benefit from
being able to use OpenSearch Serverless selectively for workloads with real-
time query needs. Second, if you are a managed OpenSearch customer, you can
now choose S3 Vectors as your engine for vector data that can be queried with
sub-second latency. OpenSearch will then automatically use S3 Vectors as the
underlying engine for vectors and you can update and search your vector data
using the OpenSearch APIs. You gain the cost benefits of S3 Vectors, with no
changes to your applications.

## Amazon S3 and IPv6

Close all

### What is IPv6?

Every server and device connected to the internet must have a unique address.
Internet Protocol Version 4 (IPv4) was the original 32-bit addressing scheme.
However, the continued growth of the internet means that all available IPv4
addresses will be utilized over time. Internet Protocol Version 6 (IPv6) is an
addressing mechanism designed to overcome the global address limitation on
IPv4.

### What can I do with IPv6?

Using IPv6 support for Amazon S3, applications can connect to Amazon S3
without the need for any IPv6 to IPv4 translation software or systems. You can
meet compliance requirements, more easily integrate with existing IPv6-based
on-premises applications, and remove the need for expensive networking
equipment to handle the address translation. You can also now utilize the
existing source address filtering features in IAM policies and bucket policies
with IPv6 addresses, expanding your options to secure applications interacting
with Amazon S3.  

### How do I get started with IPv6 on Amazon S3?

You can get started by pointing your application to [Amazon S3’s “dual-stack”
endpoint](https://docs.aws.amazon.com/AmazonS3/latest/userguide/dual-stack-
endpoints.html), which supports access over both IPv4 and IPv6. In most cases,
no further configuration is required for access over IPv6, because most
network clients prefer IPv6 addresses by default. Applications that are
impacted by using IPv6 can switch back to the standard IPv4-only endpoints at
any time. IPv6 with Amazon S3 is supported in all commercial AWS Regions,
including AWS GovCloud (US) Regions, the Amazon Web Services China (Beijing)
Region, operated by Sinnet, and the Amazon Web Services China (Ningxia)
Region, operated by NWCD.  

### Should I expect a change in Amazon S3 performance when using IPv6?

No, you will see the same performance when using either IPv4 or IPv6 with
Amazon S3.  

## S3 Event Notifications

Close all

### What are Amazon S3 Event Notifications?

You can use the [Amazon S3 Event
Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html)
feature to receive notifications when certain events happen in your S3 bucket,
such as PUT, POST, COPY, and DELETE events. You can publish notifications to
[Amazon EventBridge](/eventbridge/), [Amazon SNS](/sns/), [Amazon SQS](/sqs/),
or directly to [AWS Lambda](/lambda/).  

### What can I do with Amazon S3 Event Notifications?

Amazon S3 Event Notifications let you run workflows, send alerts, or perform
other actions in response to changes in your objects stored in S3. You can use
S3 Event Notifications to set up triggers to perform actions including
transcoding media files when they are uploaded, processing data files when
they become available, and synchronizing S3 objects with other data stores.
You can also set up event notifications based on object name prefixes and
suffixes. For example, you can choose to receive notifications on object names
that start with “images/."  

### What is included in Amazon S3 Event Notifications?

For a detailed description of the information included in Amazon S3 Event
Notification messages, refer to the configuring [Amazon S3 Event Notifications
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html).  

### How do I set up Amazon S3 Event Notifications?

For a detailed description of how to configure event notifications, refer to
the [configuring Amazon S3 Event Notifications
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html).
You can learn more about AWS messaging services in the [Amazon SNS
documentation](http://docs.aws.amazon.com/sns/latest/dg/welcome.html) and the
[Amazon SQS
documentation](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html).  

### What does it cost to use Amazon S3 Event Notifications?

There are no additional charges for using Amazon S3 for event notifications.
You pay only for use of Amazon SNS or Amazon SQS to deliver event
notifications, or for the cost of running an AWS Lambda function. Visit the
[Amazon SNS](/sns/pricing/), [Amazon SQS](/sqs/pricing/), or [AWS
Lambda](/lambda/pricing/) pricing pages to view the pricing details for these
services.

## Amazon S3 Transfer Acceleration

Close all

### What is S3 Transfer Acceleration?

[Amazon S3 Transfer Acceleration](/s3/transfer-acceleration/) creates fast,
easy, and secure transfers of files over long distances between your client
and your Amazon S3 bucket. S3 Transfer Acceleration leverages Amazon
CloudFront’s globally distributed [AWS Edge locations](/hybrid/). As data
arrives at an AWS Edge Location, data is routed to your Amazon S3 bucket over
an optimized network path.

### How do I get started with S3 Transfer Acceleration?

To get started with S3 Transfer Acceleration [enable S3 Transfer
Acceleration](http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-
acceleration.html#transfer-acceleration-getting-started) on an S3 bucket using
the [Amazon S3 console](https://s3.console.aws.amazon.com/s3/home), the Amazon
S3 API, or the AWS CLI. After S3 Transfer Acceleration is enabled, you can
point your Amazon S3 PUT and GET requests to the s3-accelerate endpoint domain
name. Your data transfer application must use one of the following two types
of endpoints to access the bucket for faster data transfer:
.s3-accelerate.amazonaws.com or .s3-accelerate.dualstack.amazonaws.com for the
“dual-stack” endpoint. If you want to use standard data transfer, you can
continue to use the regular endpoints. There are certain restrictions on which
buckets will support S3 Transfer Acceleration. For details, refer to the
[Amazon S3
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-
acceleration.html#transfer-acceleration-requirements).

### How fast is S3 Transfer Acceleration?

S3 Transfer Acceleration helps you fully use your bandwidth, minimize the
effect of distance on throughput, and is designed to ensure consistently fast
data transfer to Amazon S3 regardless of your client’s location. The amount of
acceleration primarily depends on your available bandwidth, the distance
between the source and destination, and packet loss rates on the network path.
Generally, you will see more acceleration when the source is farther from the
destination, when there is more available bandwidth, and/or when the object
size is bigger. One customer measured a 50% reduction in their average time to
ingest 300 MB files from a global user base spread across the US, Europe, and
parts of Asia to a bucket in the Asia Pacific (Sydney) Region. Another
customer observed cases where performance improved in excess of 500% for users
in South East Asia and Australia uploading 250 MB files (in parts of 50 MB) to
an S3 bucket in the US East (N. Virginia) Region. Access the [S3 Transfer
Acceleration speed comparison tool](http://s3-accelerate-
speedtest.s3-accelerate.amazonaws.com/en/accelerate-speed-comparsion.html) to
get a preview of the performance benefit from your location.

### Who should use S3 Transfer Acceleration?

S3 Transfer Acceleration is designed to optimize transfer speeds from across
the world into S3 buckets. If you are uploading to a centralized bucket from
geographically dispersed locations or if you regularly transfer GBs or TBs of
data across continents, you may save hours or days of data transfer time with
S3 Transfer Acceleration.

### How secure is S3 Transfer Acceleration?

S3 Transfer Acceleration provides the same security as regular transfers to
Amazon S3. All Amazon S3 security features, such as access restriction based
on a client’s IP address, are supported as well. S3 Transfer Acceleration
communicates with clients over standard TCP and does not require firewall
changes. No data is ever saved at [AWS Edge locations](/hybrid/).

### What if S3 Transfer Acceleration is not faster than a regular Amazon S3
transfer?

Each time you use S3 Transfer Acceleration to upload an object, we will check
whether S3 Transfer Acceleration is likely to be faster than a regular Amazon
S3 transfer. If we determine that S3 Transfer Acceleration is not likely to be
faster than a regular Amazon S3 transfer of the same object to the same
destination AWS Region, we will not charge for the use of S3 Transfer
Acceleration for that transfer, and we may bypass the S3 Transfer Acceleration
system for that upload.

### Can I use S3 Transfer Acceleration with multipart uploads?

Yes, S3 Transfer Acceleration supports all bucket level features including
multipart uploads.  

### How should I choose between S3 Transfer Acceleration and Amazon
CloudFront’s PUT/POST?

S3 Transfer Acceleration optimizes the TCP protocol and adds additional
intelligence between the client and the S3 bucket, making S3 Transfer
Acceleration a better choice if a higher throughput is desired. If you have
objects that are smaller than 1 GB or if the data set is less than 1 GB in
size, you should consider using Amazon CloudFront's PUT/POST commands for
optimal performance.

### Can S3 Transfer Acceleration complement AWS Direct Connect?

[AWS Direct Connect](/directconnect/) is a good choice for customers who have
a private networking requirement or who have access to AWS Direct Connect
exchanges. S3 Transfer Acceleration is best for submitting data from
distributed client locations over the public internet, or where variable
network conditions make throughput poor. Some AWS Direct Connect customers use
S3 Transfer Acceleration to help with remote office transfers where they may
suffer from poor internet performance.

### Can S3 Transfer Acceleration complement AWS Storage Gateway or a third-
party gateway?

You can benefit from configuring the bucket destination in your third-party
gateway to use an S3 Transfer Acceleration endpoint domain.  
Visit this [File section of the Storage Gateway
FAQ](/storagegateway/faqs/#file) to learn more about the AWS implementation.  

### Can S3 Transfer Acceleration complement third-party integrated software?

Yes. Software packages that connect directly into Amazon S3 can take advantage
of S3 Transfer Acceleration when they send their jobs to Amazon S3. [Learn
more about Storage Partner Solutions »](/backup-recovery/partner-solutions/)

### Is S3 Transfer Acceleration HIPAA eligible?

Yes, AWS has expanded its [HIPAA compliance program](/compliance/hipaa-
compliance/) to include S3 Transfer Acceleration as a HIPAA eligible service.
If you have an executed Business Associate Agreement (BAA) with AWS, you can
use S3 Transfer Acceleration to make fast, easy, and secure transfers of
files, including protected health information (PHI) over long distances
between your client and your Amazon S3 bucket.

## Security

Close all

### How secure is my data in Amazon S3?

     Amazon S3 is secure by default. Upon creation, only you have access to Amazon S3 buckets that you create, and you have complete control over who has access to your data. Amazon S3 supports user authentication to control access to data. You can use access control mechanisms, such as bucket policies, to selectively grant permissions to users and groups of users. The Amazon S3 console highlights your publicly accessible buckets, indicates the source of public accessibility, and also warns you if changes to your bucket policies or bucket ACLs would make your bucket publicly accessible. You should enable [Amazon S3 Block Public Access](/s3/features/block-public-access/) for all accounts and buckets that you do not want publicly accessible. All new buckets have Block Public Access turned on by default. You can securely upload/download your data to Amazon S3 via SSL endpoints using the HTTPS protocol. [Amazon S3 automatically encrypts all object uploads to your bucket (as of January 5, 2023)](https://aws.amazon.com/blogs/aws/amazon-s3-encrypts-new-objects-by-default/). Alternatively, you can use your own encryption libraries to encrypt data before storing it in Amazon S3.  
For more information on security in AWS, refer to the [AWS security
page](/security/), and for S3 security information, visit the [S3 security
page](/s3/security/) and the [S3 security best practices
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-
practices.html).  

### How can I control access to my data stored on Amazon S3?

Customers can use a number of mechanisms for controlling access to Amazon S3
resources, including AWS Identity and Access Management (IAM) policies, bucket
policies, access point policies, access control lists (ACLs), Query String
Authentication, Amazon Virtual Private Cloud (Amazon VPC) endpoint policies,
service control policies (SCPs) in AWS Organizations, and Amazon S3 Block
Public Access.  

### Does Amazon S3 support data access auditing?

Yes, customers can optionally configure an Amazon S3 bucket to create access
log records for all requests made against it. Alternatively, customers who
need to capture IAM/user identity information in their logs can configure [AWS
CloudTrail Data
Events](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/logging-
management-and-data-events-with-cloudtrail.html). These access log records can
be used for audit purposes and contain details about the request, such as the
request type, the resources specified in the request, and the time and date
the request was processed.

### What options do I have for encrypting data stored on Amazon S3?

Amazon S3 encrypts all new data uploads to any bucket. [Amazon S3 applies
S3-managed server-side encryption (SSE-S3) as the base level of encryption to
all object uploads (as of January 5,
2023)](https://aws.amazon.com/blogs/aws/amazon-s3-encrypts-new-objects-by-
default/). SSE-S3 provides a fully-managed solution where Amazon handles key
management and key protection using multiple layers of security. You should
continue to use SSE-S3 if you prefer to have Amazon manage your keys.
Additionally, you can choose to encrypt data using SSE-C, SSE-KMS, DSSE-KMS,
or a client library such as the [Amazon S3 Encryption
Client.](http://docs.amazonwebservices.com/AWSJavaSDK/latest/javadoc/com/amazonaws/services/s3/AmazonS3EncryptionClient.html)
Each option allows you to store sensitive data encrypted at rest in Amazon S3.
SSE-C allows Amazon S3 to perform encryption and decryption of objects, while
you retain control of the encryption keys. With SSE-C, you don’t need to
implement or use a client-side library to perform the encryption and
decryption of objects you store in Amazon S3, but you do need to manage the
keys that you send to Amazon S3 to encrypt and decrypt objects. Use SSE-C if
you want to maintain your own encryption keys, but don’t want to implement or
leverage a client-side encryption library. SSE-KMS lets [AWS Key Management
Service](/kms/) (AWS KMS) manage your encryption keys. Using AWS KMS to manage
your keys provides several additional benefits. With AWS KMS, there are
separate permissions for the use of the KMS key, providing an additional layer
of control and protection against unauthorized access to your objects stored
in Amazon S3. AWS KMS provides an audit trail so you can see who used your key
to access which object and when, as well as view failed attempts to access
data from users without permission to decrypt the data. Also, AWS KMS provides
additional security controls to support customer efforts to comply with PCI-
DSS, HIPAA/HITECH, and FedRAMP industry requirements. DSSE-KMS simplifies the
process of applying two layers of encryption to your data, without having to
invest in infrastructure required for client-side encryption. Each layer of
encryption uses a different implementation of the 256-bit Advanced Encryption
Standard with Galois Counter Mode (AES-GCM) algorithm and is vetted and
accepted for use on top-secret workloads. DSSE-KMS uses AWS KMS to generate
data keys, and lets AWS KMS manage your encryption keys. With AWS KMS, there
are separate permissions for the use of the KMS key, providing an additional
layer of control and protection against unauthorized access to your objects
stored in Amazon S3. AWS KMS provides an audit trail so you can see who used
your key to access which object and when, as well as view failed attempts to
access data from users without permission to decrypt the data. Also, AWS KMS
provides additional security controls to support customer efforts to comply
with PCI-DSS, HIPAA/HITECH, and FedRAMP industry requirements. Using an
encryption client library, you retain control of the keys and complete the
encryption and decryption of objects client-side using an encryption library
of your choice. Some customers prefer full end-to-end control of the
encryption and decryption of objects; that way, only encrypted objects are
transmitted over the internet to Amazon S3. Use a client-side library if you
want to maintain control of your encryption keys, are able to implement or use
a client-side encryption library, and need to have your objects encrypted
before they are sent to Amazon S3 for storage. For more information on using
Amazon S3 SSE-S3, SSE-C, or SSE-KMS, refer to [protecting data using
encryption
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html).

### Can I comply with European data privacy regulations using Amazon S3?

Customers can choose to store all data in Europe by using the Europe
(Frankfurt), Europe (Ireland), Europe (Paris), Europe (Stockholm), Europe
(Milan), Europe (Spain), Europe (London), or Europe (Zurich) Region. You can
also use [Amazon S3 on Outposts](/s3/outposts/) to keep all of your data on
premises on the AWS Outpost, and you may choose to transfer data between AWS
Outposts or to an AWS Region. It is your responsibility to ensure that you
comply with European privacy laws. View the [AWS General Data Protection
Regulation (GDPR) Center](/compliance/gdpr-center/) and [AWS Data Privacy
Center](/compliance/data-privacy/) for more information. If you have more
specific location requirements or other data privacy regulations that require
you to keep data in a location where there is not an AWS Region, you can use
S3 storage classes for AWS Dedicated Local Zones or S3 on Outposts.  

### Where is my object and object metadata stored in AWS Dedicated Local
Zones?

  
By default, your object data and object metadata stay within the single
Dedicated Local Zone you put the object. Bucket management and telemetry data,
including bucket names, capacity metrics, CloudTrail logs, CloudWatch metrics,
customer managed keys from AWS Key Management Service (KMS), and Identity and
Access Management (IAM) policies, are stored back in the parent AWS Region.
Optionally, other bucket management features, like S3 Batch Operations, store
management metadata with bucket name and object name in the parent AWS Region.  

### What is an Amazon VPC Endpoint for Amazon S3?

An Amazon VPC Endpoint for Amazon S3 is a logical entity within a VPC that
allows connectivity to S3 over the [AWS global network](/about-aws/global-
infrastructure/global_network/). There are two types of VPC endpoints for S3:
gateway VPC endpoints and interface VPC endpoints. Gateway endpoints are a
gateway that you specify in your route table to access S3 from your VPC over
the AWS network. Interface endpoints extend the functionality of gateway
endpoints by using private IPs to route requests to S3 from within your VPC,
on-premises, or from a different AWS Region. For more information, visit the
[AWS PrivateLink for Amazon S3
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-
interface-endpoints.html).  

### Can I allow a specific Amazon VPC Endpoint access to my Amazon S3 bucket?

You can limit access to your bucket from a specific Amazon VPC Endpoint or a
set of endpoints using Amazon S3 bucket policies. S3 bucket policies now
support a condition, aws:sourceVpce, that you can use to restrict access. For
more details and example policies, read the [gateway endpoints for S3
documentation](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-
endpoints-s3.html).  

### What is AWS PrivateLink for Amazon S3?

AWS PrivateLink for S3 provides private connectivity between Amazon S3 and on-
premises. You can provision interface VPC endpoints for S3 in your VPC to
connect your on-premises applications directly to S3 over AWS Direct Connect
or AWS VPN. You no longer need to use public IPs, change firewall rules, or
configure an internet gateway to access S3 from on-premises. To learn more
visit the [AWS PrivateLink for S3
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-
interface-endpoints.html).

### How do I get started with interface VPC endpoints for S3?

  
You can create an interface VPC endpoint using the AWS VPC Management Console,
AWS Command Line Interface (AWS CLI), AWS SDK, or API. To learn more, visit
the
[documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-
interface-endpoints.html).

### When should I choose gateway VPC endpoints versus AWS PrivateLink-based
interface VPC endpoints?

AWS recommends that you use interface VPC endpoints to access S3 from on-
premises or from a VPC in another AWS Region. For resources that are accessing
S3 from VPC in the same AWS Region as S3, we recommend using gateway VPC
endpoints as they are not billed. To learn more, visit the
[documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-
interface-endpoints.html).

### Can I use both Interface Endpoints and Gateway Endpoints for S3 in the
same VPC?

Yes. If you have an existing gateway VPC endpoint, create an interface VPC
endpoint in your VPC and update your client applications with the VPC endpoint
specific endpoint names. For example, if your VPC endpoint id of the interface
endpoint is vpce-0fe5b17a0707d6abc-29p5708s in the us-east-1 Region, then your
endpoint specific DNS name will be vpce-0fe5b17a0707d6abc-29p5708s.s3.us-
east-1.vpce.amazonaws.com. In this case, only the requests to the VPC endpoint
specific names will route through Interface VPC endpoints to S3 while all
other requests would continue to route through the gateway VPC endpoint. To
learn more, visit the
[documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-
interface-endpoints.html).

### What is Amazon Macie and how can I use it to secure my data?

[Amazon Macie](/macie/) is an AI-powered security service that helps you
prevent data loss by automatically discovering, classifying, and protecting
sensitive data stored in Amazon S3. Amazon Macie uses machine learning to
recognize sensitive data such as personally identifiable information (PII) or
intellectual property, assigns a business value, and provides visibility into
where this data is stored and how it is being used in your organization.
Amazon Macie continuously monitors data access activity for anomalies, and
delivers alerts when it detects risk of unauthorized access or inadvertent
data leaks. You can use Amazon Macie to protect against security threats by
continuously monitoring your data and account credentials. Amazon Macie gives
you an automated and low-touch way to discover and classify your business
data. It provides controls via templated Lambda functions to revoke access or
trigger password reset policies upon the discovery of suspicious behavior,
unauthorized data access to entities, or third-party applications. When alerts
are generated, you can use Amazon Macie for incident response, using Amazon
CloudWatch Events to swiftly take action to protect your data. For more
information, visit the [Amazon Macie
documentation](https://docs.aws.amazon.com/macie/latest/user/what-is-
macie.html).  

### What is IAM Access Analyzer for Amazon S3 and how does it work?

[Access Analyzer for
S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-
analyzer.html) is a feature that helps you simplify permissions management as
you set, verify, and refine policies for your S3 buckets and access points.
Access Analyzer for S3 monitors your existing access policies to verify that
they provide only the required access to your S3 resources. Access Analyzer
for S3 evaluates your bucket access policies and helps you discover and
swiftly make changes to buckets that do not require access. Access Analyzer
for S3 alerts you when you have a bucket that is configured to allow access to
anyone on the internet or that is shared with other AWS accounts. You receive
_findings_ about the source and level of public or shared access. For example,
Access Analyzer for S3 will proactively inform you if unrequired read or write
access was provided through an access control list or bucket policy. With
these findings, you can immediately set or restore the required access policy.
When reviewing results that show potentially shared access to a bucket, you
can [Block Public
Access](https://docs.aws.amazon.com/AmazonS3/latest/dev/access-control-block-
public-access.html) to the bucket with a single click in the S3 console. You
also can drill down into bucket-level permissions settings to configure
granular levels of access. For auditing purposes, you can download Access
Analyzer for S3 findings as a CSV report.  Additionally, the S3 console
reports security warnings, errors, and suggestions from IAM Access Analyzer as
you author your S3 policies. The console automatically runs more than 100
policy checks to validate your policies. These checks save you time, guide you
to resolve errors, and help you apply security best practices.  
For more information, visit the [IAM Access Analyzer
documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/what-is-
access-analyzer.html).

## S3 Access Grants

Close all

### What are Amazon S3 Access Grants?

[Amazon S3 Access Grants](https://aws.amazon.com/s3/features/access-grants/)
map identities in directories such as Active Directory, or AWS Identity and
Access Management (IAM) principals, to datasets in S3. This helps you manage
data permissions at scale by automatically granting S3 access to end-users
based on their corporate identity. Additionally, S3 Access Grants log end-user
identity and the application used to access S3 data in AWS CloudTrail. This
helps to provide a detailed audit history down to the end-user identity for
all access to the data in your S3 buckets.  

### Why should I use S3 Access Grants?

You should use S3 Access Grants if your S3 data is shared and accessed by many
users and applications, where some of their identities are in your corporate
directory such as Okta or Entra ID, and you need a scalable, simple, and
auditable way to grant access to these S3 datasets at scale.  

### How do I get started with S3 Access Grants?

You can get started with S3 Access Grants in four steps. First, configure an
S3 Access Grants instance. In this step, if you want to use S3 Access Grants
with users and groups in your corporate directory, enable AWS Identity Center
and connect S3 Access Grants to your Identity Center instance. Second,
register a location with S3 Access Grants. During this process, you give S3
Access Grants an IAM role that is used to create temporary S3 credentials that
users and applications can use to access S3. Third, define permission grants
that specify who can access what. Finally, at the time of access, have your
application request temporary credentials from S3 Access Grants and use Access
Grants-vended credentials to access S3.  

### What types of identity are supported for S3 Access Grants permission
grants?

S3 Access Grants supports two kinds of identities: enterprise user or group
identities from AWS Identity Center, and AWS IAM principals including IAM
users and roles. When you use S3 Access Grants with AWS Identity Center, you
can define data permissions on the basis of directory group memberships. AWS
Identity Center is an AWS service that connects to commonly-used identity
providers, including Entra ID, Okta, Ping, and others. In addition to
supporting directory identities via AWS Identity Center, S3 Access Grants also
supports permission rules for AWS IAM principal including IAM users and roles.
This is for use cases where you either manage a custom identity federation not
through AWS Identity Center but via IAM and SAML assertion (example
implementation), or manage application identities based on IAM principals, and
still would like to use S3 Access Grants due to its scalability and
auditability.  

### What are the different access levels that S3 Access Grants offers?

S3 Access Grants offers three access levels: READ, WRITE, and READWRITE. READ
allows you to view and retrieve objects from S3. WRITE allows you to write to
and delete from S3. READWRITE allows you to do both READ and WRITE.  

### Can I customize my access levels?

No. You can only use the three pre-defined access levels
(READ/WRITE/READWRITE) that S3 Access Grants offers.  

### Are there any quotas for S3 Access Grants?

Yes. You can create up to 100,000 grants per S3 Access Grants instance, and up
to 1,000 locations per S3 Access Grants instance.  

### Is there any performance impact for data access when I use S3 Access
Grants?

No. The latency for obtaining temporary credentials from S3 Access Grants is
similar to obtaining temporary credentials from AWS STS today. Once you have
obtained the credentials from S3 Access Grants, you can reuse unexpired
credentials for subsequent requests. For these subsequent requests, there is
no additional latency for requests authenticated via S3 Access Grants
credentials compared to other methods.  

### What other AWS services are required to use S3 Access Grants?

If you intend to use S3 Access Grants for directory identities, you will need
to set up AWS IAM Identity Center first. AWS IAM Identity Center helps you
create or connect your workforce identities, whether the identities are
created and stored in Identity Center, or in an external third-party Identity
Provider. Refer to the [Identity Center
documentation](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-
is.html) for the setup process. Once you have set up the Identity Center
instance, you can connect the instance to S3 Access Grants. Thereafter, S3
Access Grants relies on Identity Center to retrieve user attributes such as
group membership to evaluate requests and make authorization decisions.  

### Does S3 Access Grants require client-side modifications?

Yes. Whereas today, you initialize your S3 client with IAM credentials
associated with your application (for example, IAM role credentials for EC2 or
IAM Roles Anywhere; or using long-term IAM user credentials), your application
will need to instead obtain S3 Access Grants credentials first before
initializing the S3 client. These S3 Access Grants credentials will be
specific to the authenticated user in your application. Once the S3 client is
initialized with these S3 Access Grants credentials, it can make requests for
S3 data as usual using the credentials.  

### Since client-side modifications are necessary, what AWS services and
third-party applications are integrated with S3 Access Grants out-of-box
today?

S3 Access Grants today already integrates with EMR and open-source Spark via
the S3A connector. In addition, S3 Access Grants integrates with third-party
software including Immuta and Informatica so that you can centralize
permission management. And finally, S3 Access Grants supports Terraform and
CloudFormation for you to programmatically provision S3 Access Grants.  

### Is S3 Access Grants a replacement for AWS IAM?

No. S3 Access Grants does not replace IAM and in fact works well with your
existing IAM-based data protection strategies (encryption, network, data-
perimeter rules). S3 Access Grants is built on IAM primitives and enables you
to express finer-grained S3 permissions at scale.  

### Does S3 Access Grants work with KMS?

Yes. To utilize S3 Access Grants for objects encrypted with KMS, bucket owners
include the necessary KMS permissions in the IAM role that they grant to S3
Access Grants as part of the location registration. S3 Access Grants can then
subsequently utilize that IAM role to access the KMS-encrypted objects in the
buckets.  

### How do I view and manage my S3 Access Grants permission grants?

You can use either the S3 Access Grants console experience in the AWS
Management Console or SDK and CLI APIs for you to view and manage your S3
Access Grants permissions.  

### Can you grant public access to data with S3 Access Grants?

No, you cannot grant public access to data with S3 Access Grants.  

### How can I audit requests that were authorized via S3 Access Grants?

The request by the application to initiate a data access session with S3
Access Grants will be recorded in CloudTrail. CloudTrail will distinguish the
identity of the user making the request and the application identity accessing
the data on the user’s behalf. This helps you audit end-user identity of who
accessed what data at what time.  

### How is S3 Access Grants priced?

S3 Access Grants is charged based on the number of requests to S3 Access
Grants. See the pricing page for details.  

### What is the relationship between S3 Access Grants and Lake Formation?

AWS Lake Formation is for use cases where you need to manage access for
tabular data (e.g., Glue tables), where you might want to enforce row- and
column-level access. S3 Access Grants is for managing access for direct S3
permissions such as unstructured data including videos, images, logs, etc.  

### Is S3 Access Grants integrated with IAM Access Analyzer?

No. S3 Access Grants is not integrated with IAM Access Analyzer at this time.
You can’t yet use IAM Access Analyzer to analyze S3 Access Grants permission
grants. Customers can audit S3 Access Grants directly by going to the S3
Access Grants page in the S3 console, or programmatically using the
ListAccessGrants API.  

## S3 Access Points

Close all

### What are Amazon S3 Access Points?

Amazon S3 Access Points are endpoints that simplify managing data access for
any application or AWS service that works with S3. S3 Access Points work with
S3 buckets and Amazon FSx for OpenZFS file systems. You can control and
simplify how different applications or users can access data by creating
access points with names and permissions tailored to each application or user.

Using S3 Access Points with S3 buckets, you no longer have to manage a single,
complex bucket policy with hundreds of different permission rules that need to
be written, read, tracked, and audited. Instead, you can create hundreds of
access points per bucket that each provide a customized path into a bucket,
with a unique hostname and access policy that enforces the specific
permissions and network controls for any request made through the access
point.

Using S3 Access Points with FSx for OpenZFS, you can access your FSx data
using the S3 API as if the data were in S3. With this capability, your file
data in FSx for OpenZFS is accessible for use with the broad range of
artificial intelligence, machine learning, and analytics services and
applications that work with S3 while your file data continues to reside on the
FSx for OpenZFS file system.

### Why should I use an access point?

S3 Access Points simplify how you manage data access to your shared datasets
on S3. You no longer have to manage a single, complex bucket policy with
hundreds of different permission rules that need to be written, read, tracked,
and audited. With S3 Access Points, you can create access points or delegate
permissions to trusted accounts to create cross-account access points on your
bucket. This permits access to shared data sets with policies tailored to the
specific application. Using Access Points, you can decompose one large bucket
policy into separate, discrete access point policies for each application that
needs to access the shared data set. This makes it simpler to focus on
building the right access policy for an application, while not having to worry
about disrupting what any other application is doing within the shared data
set. You can also create a Service Control Policy (SCP) and require that all
access points be restricted to a Virtual Private Cloud (VPC), firewalling your
data to within your private networks.

### How do S3 Access Points attached to FSx for OpenZFS file systems work?

With S3 Access Points, you can access file data in Amazon FSx for OpenZFS
using S3 APIs and without moving data to S3. S3 Access Points attached to FSx
for OpenZFS file systems work similarly to how S3 Access Points attached to S3
buckets work, providing data access via S3 with access controlled by access
policies, while data continues to be stored in either FSx for OpenZFS file
systems or S3 buckets. For example, once an S3 Access Point is attached to an
FSx for OpenZFS file system, customers can use the access point with
generative AI, machine learning, and analytics services and applications that
work with S3 to access their FSx for OpenZFS data.

### How do S3 Access Points work?

Each S3 Access Point is configured with an access policy specific to a use
case or application, and a bucket can have thousands of access points. For
example, you can create an access point for your S3 bucket that grants access
for groups of users or applications for your data lake. An Access Point can
support a single user or application, or groups of users or applications
within and across accounts, allowing separate management of each access point.
Additionally, you can delegate permissions to trusted accounts to create
cross-account access points on your bucket. The cross-account access points
don’t grant access to data until you are granted permissions from the bucket
owner.  The bucket owner always retains ultimate control on the data and must
update the bucket policy to authorize requests from the cross-account access
point. Visit the [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-
policies.html) for a sample bucket policy. Each access point is associated
with a single bucket and contains a network origin control, and a Block Public
Access control. You can create an access point with a network origin control
that only permits storage access from your Virtual Private Cloud, a logically
isolated section of the AWS cloud. You can also create an access point with
the access point policy configured to only allow access to objects with
defined prefixes or to objects with specific tags. You can access data in
shared buckets through an access point in one of two ways. For S3 object
operations, you can use the access point
[ARN](https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-
namespaces.html) in place of a bucket name. For requests requiring a bucket
name in the standard S3 bucket name format, you can use an access point alias
instead. Aliases for S3 Access Points are automatically generated and are
interchangeable with S3 bucket names anywhere you use a bucket name for data
access. Every time you create an access point for a bucket, S3 automatically
generates a new Access Point Alias. For the full set of compatible operations
and AWS services, visit the [S3
documentation.](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-
points-usage-examples.html)  

### Is there a quota on how many S3 Access Points I can create?

By default, you can create 10,000 S3 Access Points per Region per account on
buckets in your account and cross-account. There is no hard limit on the
number of S3 Access Points per AWS account. Visit [Service
Quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/intro.html)
to request an increase in this quota.  

### When using an access point, how are requests authorized?

S3 access points have their own IAM access point policy. You write access
point policies like you would a bucket policy, using the access point ARN as
the resource. Access point policies can grant or restrict access to the S3
data requested through the access point. Amazon S3 evaluates all the relevant
policies, including those on the user, bucket, access point, VPC Endpoint, and
service control policies as well as Access Control Lists, to decide whether to
authorize the request.

### How do I write access point policies?

You can write an access point policy just like a bucket policy, using IAM
rules to govern permissions and the access point ARN in the policy document.

### How is restricting access to specific VPCs using network origin controls
on access points different from restricting access to VPCs using the bucket
policy?

You can continue to use bucket policies to limit bucket access to specified
VPCs. Access points provide an easier, auditable way to lock down all or a
subset of data in a shared data set to VPC-only traffic for all applications
in your organization using API controls. You can use an AWS Organizations
Service Control Policy (SCP) to mandate that any access point created in your
organization set the “network origin control” API parameter value to “vpc”.
Then, any new access point created automatically restricts data access to VPC-
only traffic. No additional access policy is required to make sure that data
requests are processed only from specified VPCs.

### Can I enforce a “No internet data access” policy for all access points in
my organization?

Yes. To enforce a “No internet data access” policy for access points in your
organization, you would want to make sure all access points enforce VPC only
access. To do so, you will write an AWS SCP that only supports the value “vpc”
for the “network origin control” parameter in the create_access_point() API.
If you had any internet-facing access points that you created previously, they
can be removed. You will also need to modify the bucket policy in each of your
buckets to further restrict internet access directly to your bucket through
the bucket hostname. Since other AWS services may be directly accessing your
bucket, make sure you set up access to allow the AWS services you want by
modifying the policy to permit these AWS services. Refer to the [S3
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-
points-vpc.html) for examples of how to do this.

### Can I completely disable direct access to a bucket using the bucket
hostname?

Not currently, but you can attach a bucket policy that rejects requests not
made using an access point. Refer to the [S3
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-
points-policies.html) for more details.

### Can I replace or remove an access point from a bucket?

Yes. When you remove an access point, any access to the associated bucket
through other access points, and through the bucket hostname, will not be
disrupted.

### What is the cost of Amazon S3 Access Points?

There is no additional charge for access points or buckets that use access
points. Usual Amazon S3 request rates apply.

### How do I get started with S3 Access Points?

You can start creating S3 Access Points on new buckets as well as existing
buckets through the AWS Management Console, the AWS Command Line Interface
(CLI), the Application Programming Interface (API), and the AWS Software
Development Kit (SDK) client. To learn more about S3 Access Points, visit the
[user guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-
points.html).  

## Durability & Data Protection

Close all

### How durable is Amazon S3?

Amazon S3 provides the most durable storage in the cloud. Based on its unique
architecture, S3 is designed to provide 99.999999999% (11 nines) data
durability. Additionally, S3 stores data redundantly across a minimum of 3
Availability Zones (AZ) by default, providing built-in resilience against
widespread disaster. Customers can store data in a single AZ to minimize
storage cost or latency, in multiple AZs for resilience against the permanent
loss of an entire data center, or in multiple AWS Regions to meet geographic
resilience requirements.  

### How is Amazon S3 designed for 99.999999999% durability?

Amazon S3’s design for durability is a function of storage device failure
rates and the rate at which S3 can detect failure and then re-replicate data
on those devices. S3 has end-to-end integrity checking on every object upload
and verifies that all data is correctly and redundantly stored across multiple
storage devices before it considers your upload to be successful. Once your
data is stored in S3, S3 continuously monitors data durability over time with
periodic integrity checks of all data at rest. S3 also actively monitors the
redundancy of your data to help verify that your objects are able to tolerate
the concurrent failure of multiple storage devices.

### Is data stored in a One Zone storage class protected against damage or
loss of the Availability Zone?

In the unlikely case of the loss or damage to all or part of an AWS
Availability Zone, data in a One Zone storage class may be lost. For example,
events like fire and water damage could result in data loss. Apart from these
types of events, One Zone storage classes use similar engineering designs as
Regional storage classes to protect objects from independent disk, host, and
rack-level failures, and each are designed to deliver 99.999999999% data
durability.

### How does Amazon S3 go beyond 99.999999999% durability?

Amazon S3 has a strong durability culture, and durability best practices are
designed into our systems and software from the ground up. AWS has more
experience operating high-durability storage than any other cloud provider,
and we use this experience to mitigate durability risk and to incorporate
durability safeguards into everything we do.

### With such high durability, do I still need to back up my critical data?

Yes. Amazon S3’s durability system does not protect against accidental or
malicious deletes. S3 relies on customers to decide what data they want to
keep, what data they want to get rid of, and what optional controls they need
to protect against deletes that are incorrect, either due to accidents or
malice. When you tell Amazon S3 to delete data, that data is immediately
deleted, and it cannot be recovered by AWS. Honoring a delete request in this
way is an important characteristic of the service.

### What capabilities does Amazon S3 provide to protect my data against
accidental or malicious deletes?

S3 Object Versioning, S3 Replication, and S3 Object Lock are all optional
features that you can use to add additional data protection, beyond the
durability that S3 automatically provides. In addition, you can use a backup
application to back up all or part of the data in your S3 buckets.

### What checksum algorithms does Amazon S3 support for data integrity
checking?

  
Amazon S3 uses a combination of Content-MD5 checksums, secure hash algorithms
(SHAs), and cyclic redundancy checks (CRCs) to verify data integrity. Amazon
S3 performs these checksums on data at rest and repairs any disparity using
redundant data. In addition, the latest AWS SDKs automatically calculate
efficient CRC-based checksums for all uploads. S3 independently verifies that
checksum and only accepts objects after confirming that data integrity was
maintained in transit over the public internet. If a version of the SDK that
does not provide pre-calculated checksums is used to upload an object, S3
calculates a CRC-based checksum of the whole object, even for multipart
uploads. Checksums are stored in object metadata and are therefore available
to verify data integrity at any time. You can choose from five supported
checksum algorithms for data integrity checking on your upload and download
requests. You can choose a SHA-1, SHA-256, CRC32, CRC32C, or CRC64NVME
checksum algorithm, depending on your application needs. You can automatically
calculate and verify checksums as you store or retrieve data from S3, and can
access the checksum information at any time using the HeadObject S3 API, the
GetObjectAttributes S3 API or an S3 Inventory report. Calculating a checksum
as you stream data into S3 saves you time as you’re able to both verify and
transmit your data in a single pass, instead of as two sequential operations.
Using checksums for data validation is a best practice for data durability,
and these capabilities increase the performance and reduce the cost to do so.  

### What is Versioning?

Versioning allows you to preserve, retrieve, and restore every version of
every object stored in an Amazon S3 bucket. Once you enable Versioning for a
bucket, Amazon S3 preserves existing objects anytime you perform a PUT, POST,
COPY, or DELETE operation on them. By default, GET requests will retrieve the
most recently written version. Older versions of an overwritten or deleted
object can be retrieved by specifying a version in the request.

### Why should I use Versioning?

Amazon S3 provides customers with a highly durable storage infrastructure.
Versioning offers an additional level of protection by providing a means of
recovery when customers accidentally overwrite or delete objects. This allows
you to easily recover from unintended user actions and application failures.
You can also use Versioning for data retention and archiving.

### How do I start using Versioning?

You can start using Versioning by enabling a setting on your Amazon S3 bucket.
For more information on how to enable Versioning, refer to the [Amazon S3
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/ObjectVersioning.html).  

### How does Versioning protect me from accidental deletion of my objects?

When a user performs a DELETE operation on an object, subsequent simple (un-
versioned) requests will no longer retrieve the object. However, all versions
of that object will continue to be preserved in your Amazon S3 bucket and can
be retrieved or restored. Only the owner of an Amazon S3 bucket can
permanently delete a version. You can set [Lifecycle
rules](http://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-
mgmt.html) to manage the lifetime and the cost of storing multiple versions of
your objects.

### Can I set up a trash, recycle bin, or rollback window on my Amazon S3
objects to recover from deletes and overwrites?

You can use [Amazon S3 Lifecycle
rules](https://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-
mgmt.html) along with [S3
Versioning](https://docs.aws.amazon.com/AmazonS3/latest/dev/ObjectVersioning.html)
to implement a rollback window for your S3 objects. For example, with your
versioning-enabled bucket, you can set up a rule that archives all of your
previous versions to the lower-cost S3 Glacier Flexible Retrieval storage
class and deletes them after 100 days, giving you a 100-day window to roll
back any changes on your data while lowering your storage costs. Additionally,
you can save costs by deleting old (noncurrent) versions of an object after
five days and when there are at least two newer versions of the object. You
can change the number of days or the number of newer versions based on your
cost optimization needs. This allows you to retain additional versions of your
objects when needed, but saves you cost by transitioning or removing them
after a period of time.  

### How can I ensure maximum protection of my preserved versions?

Versioning’s [Multi-Factor Authentication (MFA)](/mfa/) Delete capability can
be used to provide an additional layer of security. By default, all requests
to your Amazon S3 bucket require your AWS account credentials. If you enable
Versioning with MFA Delete on your Amazon S3 bucket, two forms of
authentication are required to permanently delete a version of an object: your
AWS account credentials and a valid six-digit code and serial number from an
authentication device in your physical possession. To learn more about
enabling Versioning with MFA Delete, including how to purchase and activate an
authentication device, refer to the [Amazon S3
documentation](http://docs.amazonwebservices.com/AmazonS3/latest/dev/Versioning.html).

### How am I charged for using Versioning?

Normal Amazon S3 rates apply for every version of an object stored or
requested. For example, let’s look at the following scenario to illustrate
storage costs when utilizing Versioning (let’s assume the current month is 31
days long): 1) Day 1 of the month: You perform a PUT of 4 GB (4,294,967,296
bytes) on your bucket.  
2) Day 16 of the month: You perform a PUT of 5 GB (5,368,709,120 bytes) within
the same bucket using the same key as the original PUT on Day 1.  
  
When analyzing the storage costs of the above operations, note that the 4 GB
object from Day 1 is not deleted from the bucket when the 5 GB object is
written on Day 15. Instead, the 4 GB object is preserved as an older version
and the 5 GB object becomes the most recently written version of the object
within your bucket. At the end of the month: Total Byte-Hour usage  
[4,294,967,296 bytes x 31 days x (24 hours / day)] + [5,368,709,120 bytes x 16
days x (24 hours / day)] = 5,257,039,970,304 Byte-Hours. Conversion to Total
GB-Months  
5,257,039,970,304 Byte-Hours x (1 GB / 1,073,741,824 bytes) x (1 month / 744
hours) = 6.581 GB-Month The cost is calculated based on the current rates for
your region on the [Amazon S3 pricing page](/s3/pricing/).

### What is Amazon S3 Object Lock?

Amazon S3 Object Lock is an Amazon S3 feature that prevents an object version
from being deleted or overwritten for a fixed amount of time or indefinitely,
so that you can enforce retention policies as an added layer of data
protection or for regulatory compliance. You can migrate workloads from
existing write-once-read-many (WORM) systems into Amazon S3, and configure S3
Object Lock at the object- and bucket-level to prevent object version
deletions prior to pre-defined Retain Until Dates or indefinitely (Legal Hold
Dates). S3 Object Lock protection is maintained regardless of which storage
class the object version resides in and throughout S3 Lifecycle transitions
between storage classes.  You should use S3 Object Lock if you have regulatory
requirements that specify that data must be WORM protected, or if you want to
add an additional layer of protection to data in Amazon S3. S3 Object Lock can
help you to meet regulatory requirements that specify that data should be
stored in an immutable format, and also can protect against accidental or
malicious deletion for data in Amazon S3.  
Learn more by visiting the [S3 Object Lock user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-
lock.html).  

### How does Amazon S3 Object Lock work?

Amazon S3 Object Lock prevents deletion of an object version for the duration
of a specified retention period or indefinitely until a legal hold is removed.
With S3 Object Lock, you’re able to ensure that an object version remains
immutable for as long as WORM protection is applied. You can apply WORM
protection by either assigning a Retain Until Date or a Legal Hold to an
object version using the AWS SDK, CLI, REST API, or the S3 Management Console.
You can apply retention settings within a PUT request, or apply them to an
existing object after it has been created. The Retain Until Date defines the
length of time for which an object version will remain immutable. Once a
Retain Until Date has been assigned to an object, that object version cannot
be modified or deleted until the Retain Until Date has passed. If a user
attempts to delete an object before the Retain Until Date, the operation will
be denied. Alternatively, you can make an object immutable by applying a Legal
Hold. A Legal Hold prevents an object version from being modified or deleted
indefinitely until it is explicitly removed. In order to place and remove
Legal Holds, your AWS account must have write permission for the
PutObjectLegalHold action. Legal Hold can be applied to any object in an S3
Object Lock enabled bucket, whether or not that object is currently WORM-
protected by a retention period.  
S3 Object Lock can be configured in one of two Modes. When deployed in
Governance Mode, AWS accounts with specific IAM permissions are able to remove
WORM protection from an object version. If you require stronger immutability
in order to comply with regulations, you can use Compliance Mode. In
Compliance Mode, WORM protection cannot be removed by any user, including the
root account.

### How does enabling S3 Object Lock for existing buckets impact the objects
already existing in the buckets?

  

### Can I disable S3 Object Lock after I have enabled it?

  
No, you cannot disable S3 Object Lock or S3 Versioning for buckets once S3
Object Lock is enabled.  

### How do I get started with replicating objects from buckets with S3 Object
Lock enabled?

  
To start replicating objects with S3 Replication from buckets with S3 Object
Lock enabled , you can add a replication configuration on your source bucket
by specifying a destination bucket in the same or different AWS Region and in
the same or different AWS account. You can choose to replicate all objects at
the S3 bucket level, or filter objects on a shared prefix level, or an object
level using S3 object tags. You will also need to specify an AWS Identity and
Access Management (IAM) role with the required permissions to perform the
replication operation. You can use the S3 console, AWS API, AWS CLI, AWS SDKs,
or AWS CloudFormation to enable replication and must have S3 Versioning
enabled for both the source and destination buckets. Additionally, to
replicate objects from S3 Object Lock enabled buckets, your destination bucket
must also have S3 Object Lock enabled. For more information see the
documentation on [setting up S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-how-
setup.html) and [using S3 Object Lock with S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-
lock-
managing.html#:~:text=storage%20lifecycle.-,Using%20S3%20Object%20Lock%20with%20replication,-You%20can%20use).

### Do I need additional permissions to replicate objects from buckets with S3
Object Lock enabled?

  
Yes, to replicate objects from S3 Object Lock enabled buckets you need to
grant two new permissions, s3:GetObjectRetention and s3:GetObjectLegalHold, on
the source bucket in the IAM role that you use to set up replication.
Alternatively, if the IAM role has an s3:Get* permission, it satisfies the
requirement. For more information see [the documentation on using S3 Object
Lock with S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-
lock-managing.html#object-lock-managing-
replication:~:text=You%20must%20grant%20two%20new%20permissions%20on%20the%20source%20S3%20bucket%20in%20the%20AWS%20Identity%20and%20Access%20Management%20\(IAM\)%20role%20that%20you%20use%20to%20set%20up%20replication.%20The%20two%20new%20permissions%20are%20s3%3AGetObjectRetention%20and%20s3%3AGetObjectLegalHold.).

### Are there any limitations for using S3 Replication while replicating from
S3 Object Lock buckets?

  
No, all features of [S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html),
such as S3 Same-Region Replication (S3 SRR), S3 Cross-Region Replication (S3
CRR), [S3 Replication metrics to track
progress](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-
metrics.html), [S3 Replication Time Control (S3
RTC)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-time-
control.html), and [S3 Batch
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html), are supported while replicating from S3 Object Lock
buckets.

### How can I replicate existing objects from S3 Object Lock enabled buckets?

  
You can use S3 Batch Replication to replicate existing objects from S3 Object
Lock enabled buckets. For more information on replicating existing objects,
see the documentation on [S3 Batch
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html).

### What is the retention status of the replicas of source objects protected
with S3 Object Lock?

  

## Storage Classes

Close all

### What are the Amazon S3 storage classes?

Amazon S3 offers a range of storage classes that you can choose from based on
the data access, resiliency, and cost requirements of your workloads. S3
storage classes are purpose-built to provide the lowest cost storage for
different access patterns. S3 storage classes are ideal for virtually any use
case, including those with demanding performance needs, data residency
requirements, unknown or changing access patterns, or archival storage. Each
S3 storage class charges a fee to store data and fees to access data. In
deciding which S3 storage class best fits your workload, consider the access
patterns and retention time of your data to optimize for the lowest total cost
over the lifetime of your data.

### How do I decide which S3 storage class to use?

  
In deciding which [S3 storage class](https://aws.amazon.com/s3/storage-
classes/express-one-zone/integrations/) best fits your workload, consider the
access patterns and retention time of your data to optimize for the lowest
total cost over the lifetime of your data. Many workloads have changing (user-
generated content), unpredictable (analytics, data lakes), or unknown (new
applications) access patterns, and that is why S3 Intelligent-Tiering should
be the default storage class to automatically save on storage costs. If you
know the access patterns of your data, you can follow this guidance. The S3
Standard storage class is ideal for frequently accessed data; this is the best
choice if you access data more than once a month. S3 Standard-Infrequent
Access is ideal for data retained for at least a month and accessed once every
month or two. The Amazon S3 Glacier storage classes are purpose-built for data
archiving, providing you with the highest performance, most retrieval
flexibility, and the lowest cost archive storage in the cloud. You can now
choose from three archive storage classes optimized for different access
patterns and storage duration. For archive data that needs immediate access,
such as medical images, news media assets, or genomics data, choose the S3
Glacier Instant Retrieval storage class, an archive storage class that
delivers the lowest cost storage with milliseconds retrieval. For archive data
that does not require immediate access but needs the flexibility to retrieve
large sets of data at no cost, such as backup or disaster recovery use cases,
choose S3 Glacier Flexible Retrieval, with retrieval in minutes or free bulk
retrievals in 5—12 hours. To save even more on long-lived archive storage such
as compliance archives and digital media preservation, choose S3 Glacier Deep
Archive, the lowest cost storage in the cloud with data retrieval within 12
hours. All these storage classes provide multi-Availability Zone (AZ)
resiliency by redundantly storing data on multiple devices and physically
separated AWS Availability Zones in an AWS Region.  
  
For data that has a lower resiliency requirement, you can reduce costs by
selecting a single-AZ storage class, like S3 One Zone-Infrequent Access. If
you have data residency or isolation requirements that can’t be met by an
existing AWS Region, you can use S3 storage classes for AWS Dedicated Local
Zones or S3 on Outposts racks to store your data in a specific perimeter.  

## S3 Intelligent-Tiering

Close all

### What is S3 Intelligent-Tiering?

S3 Intelligent-Tiering is the first cloud storage that automatically reduces
your storage costs on a granular object level by automatically moving data to
the most cost-effective access tier based on access frequency, without
performance impact, retrieval fees, or operational overhead. S3 Intelligent-
Tiering delivers milliseconds latency and high throughput performance for
frequently, infrequently, and rarely accessed data in the Frequent,
Infrequent, and Archive Instant Access tiers. For a small monthly object
monitoring and automation charge, S3 Intelligent-Tiering monitors the access
patterns and moves the objects automatically from one tier to another. There
are no retrieval charges in S3 Intelligent-Tiering, so you won’t see
unexpected increases in storage bills when access patterns change. You can use
S3 Intelligent-Tiering as the default storage class for virtually any
workload, especially data lakes, data analytics, machine learning, new
applications, and user-generated content.  

### How does S3 Intelligent-Tiering work?

The Amazon S3 Intelligent-Tiering storage class is designed to optimize
storage costs by automatically moving data to the most cost-effective access
tier when access patterns change. For a low monthly object monitoring and
automation charge, S3 Intelligent-Tiering monitors access patterns and
automatically moves objects that have not been accessed for 30 consecutive
days to the Infrequent Access tier to save up to 40% on storage costs. After
90 days consecutive days of no access, objects are moved to the Archive
Instant Access tier to save up to 68% on storage costs. There is no impact on
performance and there are no retrieval charges in S3 Intelligent-Tiering. If
an object in the Infrequent Access tier or Archive Instant Access tier is
accessed later, it is automatically moved back to the Frequent Access tier. To
get the lowest storage cost on data that can be accessed asynchronously, you
can choose to activate additional archiving capabilities. Once you enable one
or both of the asynchronous archive access tiers, S3 Intelligent-Tiering will
move objects that have not been accessed for a minimum of 90 days to the
Archive Access tier to save up to 71% and after 180 days of no access to the
Deep Archive Access tier to save up to 95% for rarely accessed objects. If an
object in the optional Archive or Deep Access tiers is restored later, it is
moved back to the Frequent Access tier, and before you can retrieve the object
you must first restore the object using RestoreObject. For information about
restoring archived objects, see [Restoring Archived
Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-
objects.html). There are no retrieval charges in S3 Intelligent-Tiering. No
additional tiering or lifecycle charges apply when objects are moved between
access tiers within the S3 Intelligent-Tiering storage class.  
  
There is no minimum object size for S3 Intelligent-Tiering, but objects
smaller than 128KB are not eligible for auto-tiering. These smaller objects
may be stored in S3 Intelligent-Tiering, but will always be charged at the
Frequent Access tier rates, and are not charged the monitoring and automation
charge. If you would like to standardize on S3 Intelligent-Tiering as the
default storage class for newly created data, you can modify your applications
by specifying INTELLIGENT-TIERING on your [S3 PUT API request
header](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/s3api/put-
object.html). S3 Intelligent-Tiering is designed for 99.9% availability and
99.999999999% durability, and automatically offers the same low latency and
high throughput performance of S3 Standard. You can use AWS Cost Explorer to
measure the additional savings from the Archive Instant Access tier.  

### Why would I choose to use S3 Intelligent-Tiering?

You can use S3 Intelligent-Tiering as the default storage class for virtually
any workload, especially data lakes, data analytics, machine learning, new
applications, and user-generated content. S3 Intelligent-Tiering is the first
cloud storage that automatically reduces your storage costs on a granular
object level by automatically moving data to the most cost-effective access
tier based on access frequency, without performance impact, retrieval fees, or
operational overhead. If you have data with unknown or changing access
patterns, including data lakes, data analytics, and new applications, we
recommend using S3 Intelligent-Tiering. If you have data that does not require
immediate retrieval, we recommend activating the Deep Archive Access tier
where you pay as little as $1 per TB per month for data that may become rarely
accessed over long periods of time. S3 Intelligent-Tiering is for data with
unknown or changing access patterns. There are no retrieval fees when using
the S3 Intelligent-Tiering storage class.  

### What performance does S3 Intelligent-Tiering offer?

S3 Intelligent-Tiering automatically optimizes your storage costs without an
impact to your performance. The S3 Intelligent-Tiering Frequent, Infrequent,
and Archive Instant Access tiers provide milliseconds latency and high
throughput performance.

### What performance do the optional Archive Access and Deep Archive Access
tiers provide?

For data that can be accessed asynchronously, the optional Archive Access tier
has the same performance as S3 Glacier Flexible Retrieval, and the Deep
Archive Access tier has the same performance as the S3 Glacier Deep Archive
storage class. You should only activate the asynchronous archive capabilities
if your application can wait minutes to hours. If the object you are
retrieving is stored in the Archive or Deep Archive Access tiers, before you
can retrieve the object you must first restore an object using RestoreObject.
For information about restoring archived objects, see [Restoring Archived
Objects](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-
objects.html). Objects in the Archive Access tier are moved to the Frequent
Access tier in 3—5 hours and within 12 hours if they are in the Deep Archive
Access tier. If you need faster access to an object in the Archive Access
tier, you can pay for faster retrieval by using the console to select the
expedited retrieval speed option.

### How durable and available is S3 Intelligent-Tiering?

S3 Intelligent-Tiering is designed for the same 99.999999999% durability as
the S3 Standard storage class. S3 Intelligent-Tiering is designed for 99.9%
availability, and carries a [service level agreement](/s3/sla/) providing
service credits if availability is less than our service commitment in any
billing cycle.

### How do I get my data into S3 Intelligent-Tiering?

There are two ways to get data into S3 Intelligent-Tiering. You can directly
PUT into S3 Intelligent-Tiering by specifying INTELLIGENT_TIERING in the
x-amz-storage-class header or set lifecycle policies to transition objects
from S3 Standard or S3 Standard-IA to S3 INTELLIGENT_TIERING.  

### How am I charged for S3 Intelligent-Tiering?

S3 Intelligent-Tiering charges you for monthly storage, requests, and data
transfer, and charges a small monthly charge for monitoring and automation per
object. The S3 Intelligent-Tiering storage class automatically stores objects
in three access tiers: a Frequent Access tier priced at S3 Standard storage
rates, an Infrequent Access tier priced at S3 Standard-Infrequent Access
storage rates, and an Archive Instant Access tier priced at the S3 Glacier
Instant Retrieval storage rates. S3 Intelligent-Tiering also has two optional
archive tiers designed for asynchronous access, an Archive Access tier priced
at S3 Glacier Flexible Retrieval storage rates, and a Deep Archive Access tier
priced at S3 Glacier Deep Archive storage rates.  
  
For a small monitoring and automation fee, S3 Intelligent-Tiering monitors
access patterns and automatically moves objects through low latency and high
throughput access tiers, as well as two opt in asynchronous archive access
tiers where customers get the lowest storage costs in the cloud for data that
can be accessed asynchronously.  
  
There is no minimum billable object size in S3 Intelligent-Tiering, but
objects smaller than 128KB are not eligible for auto-tiering. These small
objects will not be monitored and will always be charged at the Frequent
Access tier rates, with no monitoring and automation charge. For each object
archived to the Archive Access tier or Deep Archive Access tier in S3
Intelligent-Tiering, Amazon S3 uses 8 KB of storage for the name of the object
and other metadata (billed at S3 Standard storage rates) and 32 KB of storage
for index and related metadata (billed at S3 Glacier Flexible Retrieval and S3
Glacier Deep Archive storage rates).  

### Is there a charge to retrieve data from S3 Intelligent-Tiering?

No. There are no retrieval fees for S3 Intelligent-Tiering. S3 Intelligent-
Tiering monitors the access patterns of your data and if you access an object
in the Infrequent Access, Archive Instant Access, or the asynchronous archive
tiers, S3 Intelligent-Tiering automatically moves that object to the Frequent
Access tier.

### How do I activate S3 Intelligent-Tiering archive access tiers?

  
****

### How do I access an object from the Archive Access or Deep Archive Access
tiers in the S3 Intelligent-Tiering storage class?

To access an object in the Archive or Deep Archive Access tiers, you need to
issue a Restore request and the object will begin moving back to the Frequent
Access tier, all within the S3 Intelligent-Tiering storage class. Objects in
the Archive Access Tier are moved to the Frequent Access tier in 3-5 hours,
objects in the Deep Archive Access tier are moved to the Frequent Access tier
within 12 hours. Once the object is in the Frequent Access tier, you can issue
a GET request to retrieve the object.

### How do I know in which S3 Intelligent-Tiering access tier my objects are
stored in?

You can use Amazon S3 Inventory to report the access tier of objects stored in
the S3 Intelligent-Tiering storage class. Amazon S3 Inventory provides CSV,
ORC, or Parquet output files that list your objects and their corresponding
metadata on a daily or weekly basis for an S3 bucket or a shared prefix. You
can also make a HEAD request on your objects to report the S3 Intelligent-
Tiering archive access tiers.  

### Can I lifecycle objects from S3 Intelligent-Tiering to another storage
class?

Yes. You can lifecycle objects from S3 Intelligent-Tiering Frequent Access,
Infrequent, and Archive Instant Access tiers to S3 One-Zone Infrequent Access,
S3 Glacier Flexible Retrieval, and S3 Glacier Deep Archive. In addition, you
can lifecycle objects from the S3 Intelligent-Tiering optional archive access
tiers to S3 Glacier Flexible Retrieval, and S3 Glacier Deep Archive, and from
the S3 Intelligent-Tiering Deep Archive Access tier to S3 Glacier Deep
Archive.  

### Is there a minimum duration for S3 Intelligent-Tiering?

No. The S3 Intelligent-Tiering storage class has no minimum storage duration.  

### Is there a minimum billable object size for S3 Intelligent-Tiering?

No. The S3 Intelligent-Tiering storage class has no minimum billable object
size, but objects smaller than 128KB are not eligible for auto-tiering. These
smaller objects will always be charged at the Frequent Access tier rates, with
no monitoring and automation charge. For each object archived to the opt-in
Archive Access tier or Deep Archive Access tier in S3 Intelligent-Tiering,
Amazon S3 uses 8 KB of storage for the name of the object and other metadata
(billed at S3 Standard storage rates) and 32 KB of storage for index and
related metadata (billed at S3 Glacier Flexible Retrieval and S3 Glacier Deep
Archive storage rates). For more details, visit the [Amazon S3 pricing
page](/s3/pricing/).  

## S3 Standard

Close all

### What is S3 Standard?

Amazon S3 Standard delivers durable storage with millisecond access latency
and high throughput performance for frequently accessed data, typically more
than once per month. S3 Standard is designed for performance-sensitive uses
cases, such as data lakes, cloud-native applications, dynamic websites,
content distribution, mobile and gaming applications, analytics, and machine
learning models. S3 Standard is designed for 99.99% data availability and
durability of 99.999999999% of objects across multiple Availability Zones in a
given year. You can use S3 Lifecycle policies to control exactly when data is
transitioned between S3 Standard and lower costs storage classes without any
application changes.

### Why would I choose to use S3 Standard?

S3 Standard is ideal for your most frequently accessed or modified data that
requires access in milliseconds and high throughput performance. S3 Standard
is ideal for data that is read or written very often, as there are no
retrieval charges. S3 Standard is optimized for a wide variety of use cases,
including data lakes, cloud native applications, dynamic websites, content
distribution, mobile and gaming applications, and analytics.

## S3 Express One Zone

Close all

### What is the Amazon S3 Express One Zone storage class?

Amazon S3 Express One Zone is a high-performance, single-Availability Zone
Amazon S3 storage class purpose-built to deliver consistent single-digit
millisecond data access for customers’ most latency-sensitive applications.
Amazon S3 Express One Zone is the lowest latency cloud object storage class
available today, with data access speed up to 10x faster and with request
costs up to 80% lower than Amazon S3 Standard. With S3 Express One Zone, you
can select a specific AWS Availability Zone within an AWS Region to store your
data. You can choose to co-locate your storage and compute resources in the
same Availability Zone to further optimize performance.

### Why would I choose to use the Amazon S3 Express One Zone storage class?

S3 Express One Zone is the ideal storage class for applications that need the
fastest data access speed and highest performance for latency-sensitive
applications. S3 Express One Zone is the best storage class for request-
intensive operations such as machine learning (ML) training and inference,
interactive analytics, and media content creation.

### How do I get started with the Amazon S3 Express One Zone storage class?

You can get started by creating an S3 directory bucket in an AWS Availability
Zone (AZ) of your choosing. You can choose to co-locate your storage and
compute resources in the same AZ to further optimize performance. Directory
buckets have S3 Block Public Access on by default. After creating the
directory bucket, you can directly upload objects to the S3 Express One Zone
storage class or copy objects from existing S3 storage classes into S3 Express
One Zone. You can also import data with a single click in the AWS Management
Console into S3 Express One Zone or use S3 Batch Operations to copy an entire
bucket, prefix, or subsets of data from an existing S3 storage class into S3
Express One Zone.

### How can I import data into the Amazon S3 Express One Zone storage class?

You can import data from within the same AWS Region into the S3 Express One
Zone storage class via the S3 console by using the Import option after you
create a directory bucket. Import simplifies copying data into S3 directory
buckets by letting you choose a prefix or bucket to import data from without
having to specify all of the objects to copy individually. S3 Batch Operations
copies the objects in the selected prefix or general purpose bucket and you
can monitor the progress of the import copy job through the S3 Batch
Operations job details page.

### How many Availability Zones are Amazon S3 Express One Zone objects stored
in?

S3 Express One Zone objects are stored in a single AWS Availability Zone (AZ)
that you choose. Storing objects in one zone gives you the ability to store
your data local to your compute to minimize latency. You can access data from
across Availability Zones, although latency will increase.

### What performance does the Amazon S3 Express One Zone storage class
provide?

S3 Express One Zone provides similar performance elasticity as other S3
storage classes, but with consistent single-digit millisecond first-byte read
and write latency request latencies—up to 10x faster than existing S3 storage
classes. With S3 Express One Zone, customers don’t need to plan or provision
capacity or throughput requirements in advance, and benefit immediately from
requests completing up to an order of magnitude faster. S3 Express One Zone is
ideal for analytics jobs where storage latency speeds job completion times and
reduces overall TCO. It’s also ideal for interactive workloads, like video
editing, where creative professionals need the most responsive possible access
to their S3 data.

### How does the Amazon S3 Express One Zone storage class achieve high
performance?

S3 Express One Zone uses a unique architecture to optimize for performance and
deliver consistently low request latency. S3 Express One Zone stores data on
high-performance hardware and its object protocol has been enhanced to
streamline authentication and metadata overheads. Additionally, to further
increase access speed and support up to 2 million requests per second, data is
stored in a new bucket type—an Amazon S3 directory bucket. With S3 Express One
Zone, you can select a specific AWS Availability Zone within an AWS Region to
store your data. You can choose to co-locate your storage and compute
resources in the same Availability Zone to further optimize performance.

### How many transactions per second (TPS) does an S3 directory bucket
support?

Each S3 directory bucket can support up to 2 million reads and up to 200,000
writes per second per S3 directory bucket, independent of the number of
directories within the bucket. By default, each S3 directory bucket supports
up to 200,000 reads and up to 100,000 writes per second. If your workload
requires higher than the default TPS limits, you can request an increase
through [AWS
Support](https://support.console.aws.amazon.com/support/home#/case/create?issueType=service-
limit-increase).

### What happens to an S3 directory bucket with no request activity for an
extended period of time?

S3 directory buckets that have no request activity for a period of at least 3
months will transition to an inactive state. While in an inactive state, a
directory bucket is temporarily inaccessible for reads and writes. Inactive
buckets retain all storage, object metadata, and bucket metadata. Existing
storage charges will apply to inactive buckets. On an access request to an
inactive bucket, the bucket will transition to an active state, typically
within a few minutes. During this transition period, reads and writes will
return a 503 SlowDown error code.

### How should I plan for my application’s throughput needs with the S3
Express One Zone storage class?

S3 Express One Zone provides similar high, elastic throughput as other Amazon
S3 storage classes. S3 Express One Zone is designed from the ground up to
allow individual customers to burst throughput to very high aggregate levels.
For example, machine learning model training applications can train against
millions of objects and petabytes of data. You can achieve the highest
performance by spreading these requests over separate connections to maximize
the accessible bandwidth.

### How is request authorization different with Amazon S3 Express One Zone
compared to other S3 storage classes?

With S3 Express One Zone, you authenticate and authorize requests through a
new session-based mechanism, S3 CreateSession, which is optimized to provide
the lowest latency. You can use CreateSession to request temporary credentials
that provide low latency access to your bucket. These temporary credentials
are scoped to a specific S3 directory bucket. For more information on this
session-based model, refer to [S3 Create
Session](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-
create-session.html) in the developer guide.

### How reliable is the Amazon S3 Express One Zone storage class?

S3 Express One Zone is designed to deliver 99.95% availability within a single
Availability Zone, with an [availability SLA](https://aws.amazon.com/s3/sla/)
of 99.9%.  

### How is the Amazon S3 Express One Zones storage class designed to provide
99.95% availability?

With S3 Express One Zone, your data is redundantly stored on multiple devices
within a single AZ. S3 Express One Zone is designed to sustain concurrent
device failures by quickly detecting and repairing any lost redundancy. This
means that S3 Express One Zone automatically shifts requests to new devices
within an AZ if the existing device encounters a failure. This redundancy
gives you uninterrupted access to your data within an AZ.

### How am I charged for Amazon S3 Express One Zone?

There are no set up charges or commitments to begin using S3 Express One Zone.
S3 Express One Zone charges you for storage and requests. The volume of
storage billed in a month is accrued based on total storage used per hour,
measured in gigabyte per month (GB-Month). You are also charged a per request
fee for access based on the request type—such as PUTs and GETs. You will pay
an additional per-GB fee for data upload and retrieval. Example 1:  
Assume you store 10 GB of data in S3 Express One Zone for 30 days, making a
total of 1,000,000 writes and 9,000,000 reads, accessing with Athena with a
request size of 10 KB. Then, you delete 1,000,000 files by the end of 30 days.
Assuming your bucket is in the US East (Northern Virginia) Region, the storage
and request charges are calculated below: Storage Charges  
Total Byte-Hour usage = 10 GB-Month  
Total Storage cost = 10 GB-Month x $0.11 = $1.10 Request Charges  
1,000,000 PUT Requests: 1,000,000 requests x $0.00113/1,000 = $1.13  
9,000,000 GET Requests: 9,000,000 requests x $0.00003/1,000 = $0.27  
1,000,000 DELETE requests = 1,000,000 requests x $0.00 (no charge) = $0 Data
upload charge: 10 KB / 1,048,576 x 1,000,000 x $0.0032 = $0.03  
Data retrieval charge: 10 KB / 1,048,576 x 9,000,000 x $0.0006 = $0.05  
Total Charges = $1.10 + $1.13 + $0.27 + $0.03 + $0.05= $2.58 Example 2:  
Assume you store 10 TB of data for machine learning training for an 8-hour
workload every day, and then delete it. During the 8-hour workload you make
5,242,880 writes and 10,485,760 reads for a 2 MB request size. Assume you do
this for 30 days (a month). Storage Charges  
Total Byte-Hour usage = [10,995,116,277,760 bytes x 30 days x (8 hours / day)]
= 2,638,827,906,662,400 Byte-Hours = 3303.77 GB-Month  
Total Storage cost = 3303.77 GB x $0.11 = $363.41 Request Charges  
5,242,880 PUT Requests/day: 5,242,880 requests x 30 x $0.00113/1,000 = $177.73  
10,485,760 GET Requests/day: 10,485,760 requests x 30 x $0.00003/1,000 = $9.44  
5,242,880 DELETE requests/day: 5,242,880 requests x $0.00 (no charge) = $0
Data upload charge: 2MB/1024 x 5,242,880 x 30 x $0.0032 = $983.04  
Data retrieval charge: 2MB/1024 x 10,485,760 x 30 x $0.0006 = $368.64  
Total Charges = $363.41 + $177.73 + $9.44 + $983.04 + $368.64 = $1,902.26

### Are there any additional Data Transfer charges for using the Amazon S3
Express One Zone storage class within the same Region?

The request charges to access data in S3 Express One Zone includes costs to
transfer data within the AWS network in a Region, and there is no additional
Data Transfer charge for data transferred between Amazon EC2 (or any AWS
service) and S3 Express One Zone within the same Region, for example, data
transferred within the US East (Northern Virginia) Region.

### Are there any additional networking charges for using Gateway VPC
endpoints with the Amazon S3 Express One Zone storage class?

The request charges to access data in S3 Express One Zone includes costs to
use Gateway VPC endpoints, and there is no additional charge for using Gateway
endpoints with S3 Express One Zone.

## S3 Standard-Infrequent Access (S3 Standard-IA)

Close all

### What is S3 Standard-Infrequent Access?

Amazon S3 Standard-Infrequent Access (S3 Standard-IA) is an Amazon S3 storage
class for data that is accessed less frequently but requires rapid access when
needed. S3 Standard-IA offers the high durability, throughput, and low latency
of the Amazon S3 Standard storage class, with a low per-GB storage price and
per-GB retrieval charge. This combination of low cost and high performance
make S3 Standard-IA ideal for long-term storage, backups, and as a data store
for disaster recovery. The S3 Standard-IA storage class is set at the object
level and can exist in the same bucket as the S3 Standard or S3 One Zone-IA
storage classes, allowing you to use S3 Lifecycle policies to automatically
transition objects between storage classes without any application changes.

### Why would I choose to use S3 Standard-IA?

S3 Standard-IA is ideal for data that is accessed less frequently, but
requires rapid access when needed. S3 Standard-IA is ideally suited for long-
term file storage, older sync and share storage, and other aging data.

### What performance does S3 Standard-IA offer?

S3 Standard-IA provides the same milliseconds latency and high throughput
performance as the S3 Standard storage class.

### How do I get my data into S3 Standard-IA?

There are two ways to get data into S3 Standard-IA. You can directly PUT into
S3 Standard-IA by specifying STANDARD_IA in the x-amz-storage-class header.
You can also set Lifecycle policies to transition objects from the S3 Standard
to the S3 Standard-IA storage class.

### What charges will I incur if I change the storage class of an object from
S3 Standard-IA to S3 Standard with a COPY request?

You will incur charges for an S3 Standard (destination storage class) COPY
request and an S3 Standard-IA (source storage class) data retrieval. For more
information, visit the [Amazon S3 pricing page](/s3/pricing/).  

### Is there a minimum storage duration charge for S3 Standard-IA?

S3 Standard-IA is designed for long-lived, infrequently accessed data that is
retained for months or years. Data that is deleted from S3 Standard-IA within
30 days will be charged for a full 30 days. See the [Amazon S3 pricing
page](/s3/pricing/) for information about S3 Standard-IA pricing.

### Is there a minimum object storage charge for S3 Standard-IA?

S3 Standard-IA is designed for larger objects and has a minimum object storage
charge of 128KB. Objects smaller than 128KB in size will incur storage charges
as if the object were 128KB. For example, a 6KB object in S3 Standard-IA will
incur S3 Standard-IA storage charges for 6KB and an additional minimum object
size charge equivalent to 122KB at the S3 Standard-IA storage price. See the
[Amazon S3 pricing page](/s3/pricing/) for information about S3 Standard-IA
pricing.

### Can I tier objects from S3 Standard-IA to S3 One Zone-IA or to the S3
Glacier Flexible Retrieval storage class?

Yes. In addition to using Lifecycle policies to migrate objects from S3
Standard to S3 Standard-IA, you can also set up Lifecycle policies to tier
objects from S3 Standard-IA to S3 One Zone-IA, S3 Glacier Instant Retrieval,
S3 Glacier Flexible Retrieval, and the S3 Glacier Deep Archive storage class.  

## S3 One Zone-Infrequent Access (S3 One Zone-IA)

Close all

### What is S3 One Zone-IA storage class?

S3 One Zone-IA storage class is an Amazon S3 storage class that customers can
choose to store objects in a single availability zone. S3 One Zone-IA storage
redundantly stores data within that single Availability Zone to deliver
storage at 20% less cost than geographically redundant S3 Standard-IA storage,
which stores data redundantly across multiple geographically separate
Availability Zones. S3 One Zone-IA offers a 99% available SLA and is also
designed for eleven 9’s of durability within the Availability Zone. However,
the data in the S3 One Zone-IA storage class is not resilient to the physical
loss of an entire Availability Zone. S3 One Zone-IA storage offers the same
Amazon S3 features as S3 Standard and S3 Standard-IA and is used through the
Amazon S3 API, CLI and console. S3 One Zone-IA storage class is set at the
object level and can exist in the same bucket as S3 Standard and S3 Standard-
IA storage classes. You can use S3 Lifecycle policies to automatically
transition objects between storage classes without any application changes.

### What use cases are best suited for S3 One Zone-IA storage class?

Customers can use S3 One Zone-IA for infrequently-accessed storage, like
backup copies, disaster recovery copies, or other easily re-creatable data.

### What performance does S3 One Zone-IA storage offer?

S3 One Zone-IA storage class offers the same latency and throughput
performance as the S3 Standard and S3 Standard-Infrequent Access storage
classes.  

### How durable is the S3 One Zone-IA storage class?

S3 One Zone-IA storage class is designed for 99.999999999% of durability
within an Availability Zone. However, data in the S3 One Zone-IA storage class
is not resilient to the loss of availability or physical loss of an
Availability Zone. In contrast, S3 Standard, S3 Intelligent-Tiering, S3
Standard-Infrequent Access, and the S3 Glacier storage classes are designed to
withstand loss of availability or the destruction of an Availability Zone. S3
One Zone-IA can deliver the same or better durability and availability than
most modern, physical data centers, while providing the added benefit of
elasticity of storage and the Amazon S3 feature set.

### Is an S3 One Zone-IA “Zone” the same thing as an AWS Availability Zone?

Yes. Each AWS Region is a separate geographic area. Each Region has multiple,
isolated locations known as Availability Zones. The Amazon S3 One Zone-IA
storage class uses an individual AWS Availability Zone within the Region.

### How much disaster recovery protection do I forgo by using S3 One Zone-IA?

Each Availability Zone uses redundant power and networking. Within an AWS
Region, Availability Zones are on different flood plains, earthquake fault
zones, and geographically separated for fire protection. S3 Standard and S3
Standard-IA storage classes offer protection against these sorts of disasters
by storing your data redundantly in multiple Availability Zones. S3 One Zone-
IA offers protection against equipment failure within an Availability Zone,
but the data is not resilient to the physical loss of the Availability Zone
resulting from disasters, such as earthquakes and floods. Using S3 One Zone-
IA, S3 Standard, and S3 Standard-IA options, you can choose the storage class
that best fits the durability and availability needs of your storage.

## Amazon S3 Glacier Instant Retrieval storage class

Close all

### What is the S3 Glacier Instant Retrieval storage class?

The S3 Glacier Instant Retrieval storage class delivers the lowest cost
storage for long-lived data that is rarely accessed and requires milliseconds
retrieval. S3 Glacier Instant Retrieval delivers the fastest access to archive
storage, with the same throughput and milliseconds access as S3 Standard and
S3 Standard-IA storage classes. S3 Glacier Instant Retrieval is designed for
99.999999999% (11 9s) of data durability and 99.9% availability by redundantly
storing data across a minimum of three physically separated AWS Availability
Zones.

### Why would I choose to use S3 Glacier Instant Retrieval?

S3 Glacier Instant Retrieval is ideal if you have data that is rarely accessed
(once a quarter) and requires milliseconds retrieval times. It’s the ideal
storage class if you want the same low latency and high throughput performance
as S3 Standard-IA, but store data that is accessed less frequently than S3
Standard-IA, with a lower storage price and slightly higher data access costs.

### How available and durable is S3 Glacier Instant Retrieval?

S3 Glacier Instant Retrieval is designed for 99.999999999% (11 9s) of
durability and 99.9% availability, the same as S3 Standard-IA, and carries a
service level agreement providing service credits if availability is less than
99% in any billing cycle.

### What performance does S3 Glacier Instant Retrieval offer?

S3 Glacier Instant Retrieval provides the same milliseconds latency and high
throughput performance as the S3 Standard and S3 Standard-IA storage classes.
Unlike the S3 Glacier Flexible Retrieval and S3 Glacier Deep Archive storage
classes, which are designed for asynchronous access, you do not need to issue
a Restore request before accessing an object stored in S3 Glacier Instant
Retrieval.

### How do I get my data into S3 Glacier Instant Retrieval?

There are two ways to get data into S3 Glacier Instant Retrieval. You can
directly PUT into S3 Glacier Instant retrieval by specifying GLACIER_IR in the
x-amz-storage-class header or set S3 Lifecycle policies to transition objects
from S3 Standard or S3 Standard-IA to S3 Glacier Instant Retrieval.

### Is there a minimum storage duration charge for Amazon S3 Glacier Instant
Retrieval?

S3 Glacier Instant Retrieval is designed for long-lived, rarely accessed data
that is retained for months or years. Objects that are archived to S3 Glacier
Instant Retrieval have a minimum of 90 days of storage, and objects deleted,
overwritten, or transitioned before 90 days incur a pro-rated charge equal to
the storage charge for the remaining days. View the [Amazon S3 pricing
page](/s3/pricing/) for information about Amazon S3 Glacier Instant Retrieval
pricing.

### Is there a minimum object size charge for Amazon S3 Glacier Instant
Retrieval?

S3 Glacier Instant Retrieval is designed for larger objects and has a minimum
object storage charge of 128KB. Objects smaller than 128KB in size will incur
storage charges as if the object were 128KB. For example, a 6KB object in S3
Glacier Instant Retrieval will incur S3 Glacier Instant Retrieval storage
charges for 6KB and an additional minimum object size charge equivalent to
122KB at the S3 Glacier Instant Retrieval storage price. View the [Amazon S3
pricing page](/s3/pricing/) for information about Amazon S3 Glacier Instant
Retrieval pricing.

### How am I charged for S3 Glacier Instant Retrieval?

S3 Glacier Instant Retrieval charges you for monthly storage, requests based
on the request type, and data retrievals. The volume of storage billed in a
month is based on average storage used throughout the month, measured in
gigabyte per month (GB-Month). You are charged for requests based on the
request type—such as PUTs, COPYs, and GETs. You also pay a per GB fee for
every gigabyte of data returned to you.

## Amazon S3 Glacier Flexible Retrieval storage class

Close all

### What is the S3 Glacier Flexible Retrieval storage class?

The S3 Glacier Flexible Retrieval storage class delivers low-cost storage, up
to 10% lower cost (than S3 Glacier Instant Retrieval), for archive data that
is accessed 1-2 times per year and is retrieved asynchronously, with free bulk
retrievals. For archive data that does not require immediate access but needs
the flexibility to retrieve large sets of data at no cost, such as backup or
disaster recovery use cases, S3 Glacier Flexible Retrieval is the ideal
storage class. S3 Glacier Flexible Retrieval delivers the most flexible
retrieval options that balance cost with access times ranging from minutes to
hours and with free bulk retrievals. It is an ideal solution for backup,
disaster recovery, offsite data storage needs, and for when some data needs to
occasionally retrieved in minutes, and you don’t want to worry about costs. S3
Glacier Flexible Retrieval is designed for 99.999999999% (11 9s) of data
durability and 99.99% availability by redundantly storing data across multiple
physically separated AWS Availability Zones in a given year.  

### Why would I choose to use S3 Glacier Flexible Retrieval storage class?

For archive data that does not require immediate access but needs the
flexibility to retrieve large sets of data at no cost, such as backup or
disaster recovery use cases, S3 Glacier Flexible Retrieval is the ideal
storage class. S3 Glacier Flexible Retrieval delivers the most flexible
retrieval options that balance cost with access times ranging from minutes to
hours and with free bulk retrievals. It is an ideal solution for backup,
disaster recovery, offsite data storage needs, and for when some data needs to
occasionally retrieved in minutes, and you don’t want to worry about costs to
retrieve the data.

### How do I get my into S3 Glacier Flexible Retrieval?

There are two ways to get data into S3 Glacier Flexible Retrieval. You can
directly PUT into S3 Glacier Flexible Retrieval by specifying GLACIER in the
x-amz-storage-class header. You can also use [S3
Lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/dev/object-lifecycle-
mgmt.html) rules to transition objects from any of the S3 storage classes for
active data (S3 Standard, S3 Intelligent-Tiering, S3 Standard-IA, S3 One Zone-
IA, and S3 Glacier Instant Retrieval) to Amazon S3 Glacier Flexible Retrieval
based on object age. Use the Amazon S3 Management Console, the AWS SDKs, or
the Amazon S3 APIs to directly PUT into Amazon S3 Glacier or define rules for
archival.  
  
Note: S3 Glacier Flexible Retrieval is also available through the original
direct Glacier APIs and through the Amazon S3 Glacier Management Console. For
an enhanced experience complete with access to the full S3 feature set
including lifecycle management, S3 Replication, S3 Storage Lens, and more, we
recommend using S3 APIs and the S3 Management Console to use S3 Glacier
features.

### How can I retrieve my objects that are archived in S3 Glacier Flexible
Retrieval and will I be notified when the object is restored?

Objects that are archived in S3 Glacier Flexible Retrieval are accessed
asynchronously. To retrieve data stored in S3 Glacier Flexible Retrieval,
initiate a retrieval request using the Amazon S3 APIs or the Amazon S3
console. The retrieval request creates a temporary copy of your data in the S3
Standard storage class while leaving the archived data intact in S3 Glacier
Flexible Retrieval. You can specify the amount of time in days for which the
temporary copy is stored in Amazon S3. You can then access your temporary copy
from S3 through an Amazon S3 GET request on the archived object. In AWS
Regions where Reduced Redundancy Storage is a lower price than S3 Standard,
temporarily available data is billed as Reduced Redundancy Storage. However,
the Reduced Redundancy billing storage class doesn’t reflect how the data is
stored. With restore notifications, you can now be notified with an [S3 Event
Notification](https://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html)
when an object has successfully restored from S3 Glacier Flexible Retrieval
and the temporary copy is made available to you. The bucket owner (or others,
as permitted by an [IAM](/iam/) policy) can arrange for notifications to be
issued to [Amazon Simple Queue Service (SQS)](/sqs/) or [Amazon Simple
Notification Service (SNS)](/sns/). Notifications can also be delivered to
[AWS Lambda](/lambda/) for processing by a Lambda function.  

### How long will it take to restore my objects archived in Amazon S3 Glacier
Flexible Retrieval?

When processing a retrieval job, Amazon S3 first retrieves the requested data
from S3 Glacier Flexible Retrieval, and then creates a temporary copy of the
requested data in Amazon S3. This typically takes a few minutes. The access
time of your request depends on the retrieval option you choose: Expedited,
Standard, or Bulk retrievals. For all but the largest objects (250MB+), data
accessed using Expedited retrievals are typically made available within 1-5
minutes. Objects retrieved using Standard retrievals typically complete
between 3-5 hours. Standard retrievals typically start in minutes when
initiated using S3 Batch Operations. Bulk retrievals typically complete within
5—12 hours, and are free of charge. For more information about the S3 Glacier
Flexible Retrieval options, refer to [restoring an archived
object](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-
objects.html) in the S3 user guide.  
With S3 Glacier storage class provisioned capacity units, you can pay a fixed
upfront fee for a given month to ensure the availability of retrieval capacity
for expedited retrievals from S3 Glacier Flexible Retrieval. You can purchase
two provisioned capacity units per month to increase the amount of data you
can retrieve. Each unit of capacity ensures that at least three expedited
retrievals can be performed every five minutes, and it provides up to 150 MB/s
of retrieval throughput. If your workload requires highly reliable and
predictable access to a subset of your data in minutes, you should purchase
provisioned retrieval capacity. Without provisioned capacity, expedited
retrievals might not be accepted during periods of high demand. If you require
access to expedited retrievals under any circumstance, we recommend that you
purchase provisioned retrieval capacity.  
You can purchase provisioned capacity using the Amazon S3 console, the
[purchase provisioned
capacity](https://docs.aws.amazon.com/amazonglacier/latest/dev/api-
PurchaseProvisionedCapacity.html) REST API, the AWS SDKs, or the AWS CLI. A
provisioned capacity unit lasts for one month starting at the date and time of
purchase, which is the start date. The unit expires on the expiration date,
which is exactly one month after the start date to the nearest second. For
provisioned capacity pricing information, see [Amazon S3
pricing](https://aws.amazon.com/s3/pricing/).  

### How is my storage charge calculated for Amazon S3 objects archived to S3
Glacier Flexible Retrieval?

The volume of storage billed in a month is based on average storage used
throughout the month, measured in gigabyte-months (GB-Months). Amazon S3
calculates the object size as the amount of data you stored, plus an
additional 32 KB of S3 Glacier data, plus an additional 8 KB of Amazon S3
Standard storage class data. S3 Glacier Flexible Retrieval requires an
additional 32 KB of data per object for S3 Glacier’s index and metadata so you
can identify and retrieve your data. Amazon S3 requires 8 KB to store and
maintain the user-defined name and metadata for objects archived to S3 Glacier
Flexible Retrieval. This enables you to get a real-time list of all of your
Amazon S3 objects, including those stored using S3 Glacier Flexible Retrieval,
using the Amazon S3 LIST API, or the S3 inventory report. For example, if you
have archived 100,000 objects that are 1 GB each, your billable storage would
be:  
1.000032 gigabytes for each object x 100,000 objects = 100,003.2 gigabytes of
S3 Glacier storage.  
0.000008 gigabytes for each object x 100,000 objects = 0.8 gigabytes of S3
Standard storage.  
The fee is calculated based on the current rates for your AWS Region on the
[Amazon S3 pricing page](/s3/pricing/). For additional Amazon S3 pricing
examples, go to the [S3 billing FAQs](https://aws.amazon.com/s3/faqs/#Billing)
or use the [AWS pricing calculator](/calculator/).  

### Are there minimum storage duration and minimum object storage charges for
Amazon S3 Glacier Flexible Retrieval?

Objects archived to S3 Glacier Flexible Retrieval have a minimum of 90 days of
storage. If an object is deleted, overwritten, or transitioned before 90 days,
a pro-rated charge equal to the storage charge for the remaining days will be
incurred.  
  
S3 Glacier Flexible Retrieval also requires 40 KB of additional metadata for
each archived object. This includes 32 KB of metadata charged at the S3
Glacier Flexible Retrieval rate required to identify and retrieve your data.
And, an additional 8 KB data charged at the S3 Standard rate which is required
to maintain the user-defined name and metadata for objects archived to S3
Glacier Flexible Retrieval. This allows you to get a real-time list of all of
your S3 objects using the S3 LIST API or the S3 Inventory report. View the
[Amazon S3 pricing page](/s3/pricing/) for information about Amazon S3 Glacier
Flexible Retrieval pricing.

### How much does it cost to retrieve data from Amazon S3 Glacier Flexible
Retrieval?

There are three ways to retrieve data from S3 Glacier Flexible Retrieval:
Expedited, Standard, and Bulk Retrievals. Expedited and Standard have a per-GB
retrieval fee and per-request fee (i.e., you pay for requests made against
your Amazon S3 objects). Bulk Retrievals from S3 Glacier Flexible Retrieval
are free. For detailed S3 Glacier pricing by AWS Region, visit the [Amazon S3
pricing page](/s3/pricing/).  

### Does Amazon S3 provide capabilities for archiving objects to lower cost
storage classes?

The Amazon S3 Glacier storage classes are purpose-built for data archiving,
providing you with the highest performance, most retrieval flexibility, and
the lowest cost archive storage in the cloud. You can now choose from three
archive storage classes optimized for different access patterns and storage
duration. For archive data that needs immediate access, such as medical
images, news media assets, or genomics data, choose the S3 Glacier Instant
Retrieval storage class, an archive storage class that delivers the lowest
cost storage with milliseconds retrieval. For archive data that does not
require immediate access but needs the flexibility to retrieve large sets of
data at no cost, such as backup or disaster recovery use cases, choose S3
Glacier Flexible Retrieval, with retrieval in minutes or free bulk retrievals
in 5—12 hours. To save even more on long-lived archive storage such as
compliance archives and digital media preservation, choose S3 Glacier Deep
Archive, the lowest cost storage in the cloud with data retrieval within 12
hours.  

### What is the backend infrastructure supporting the S3 Glacier Flexible
Retrieval and S3 Glacier Deep Archive storage class?

We prefer to focus on the customer outcomes of performance, durability,
availability, and security. However, this question is often asked by our
customers. We use a number of different technologies which allow us to offer
the prices we do to our customers. Our services are built using common data
storage technologies specifically assembled into purpose-built, cost-optimized
systems using AWS-developed software. The S3 Glacier storage classes benefit
from our ability to optimize the sequence of inputs and outputs to maximize
efficiency accessing the underlying storage.  

## Amazon S3 Glacier Deep Archive

Close all

### What is the Amazon S3 Glacier Deep Archive storage class?

S3 Glacier Deep Archive is an [Amazon S3 storage class](/s3/storage-classes/)
that provides secure and durable object storage for long-term retention of
data that is accessed once or twice in a year. From just $0.00099 per GB-month
(less than one-tenth of one cent, or about $1 per TB-month), S3 Glacier Deep
Archive offers the lowest cost storage in the cloud, at prices significantly
lower than storing and maintaining data in on-premises magnetic tape libraries
or archiving data off-site.  

### What use cases are best suited for the S3 Glacier Deep Archive storage
class?

S3 Glacier Deep Archive is an ideal storage class to provide offline
protection of your company’s most important data assets, or when long-term
data retention is required for corporate policy, contractual, or regulatory
compliance requirements. Customers find S3 Glacier Deep Archive to be a
compelling choice to protect core intellectual property, financial and medical
records, research results, legal documents, seismic exploration studies, and
long-term backups, especially in highly regulated industries, such as
Financial Services, Healthcare, Oil & Gas, and Public Sectors. In addition,
there are organizations, such as media and entertainment companies, that want
to keep a backup copy of core intellectual property. Frequently, customers
using S3 Glacier Deep Archive can reduce or discontinue the use of on-premises
magnetic tape libraries and off-premises tape archival services.  

### How does the S3 Glacier Deep Archive storage class differ from the S3
Glacier Instant Retrieval, and S3 Glacier Flexible Retrieval storage classes?

S3 Glacier Deep Archive expands our data archiving offerings, enabling you to
select the optimal storage class based on storage and retrieval costs, and
retrieval times. Choose the S3 Glacier Instant Retrieval storage class when
you need milliseconds access to low cost archive data. For archive data that
does not require immediate access but needs the flexibility to retrieve large
sets of data at no cost, such as backup or disaster recovery use cases, choose
S3 Glacier Flexible Retrieval, with retrieval in minutes or free bulk
retrievals in 5-12 hours. S3 Glacier Deep Archive, in contrast, is designed
for colder data that is very unlikely to be accessed, but still requires long-
term, durable storage. S3 Glacier Deep Archive is up to 75% less expensive
than S3 Glacier Flexible Retrieval and provides retrieval within 12 hours
using the Standard retrieval tier. Standard retrievals typically start within
9 hours when initiated using S3 Batch Operations. You may also reduce
retrieval costs by selecting Bulk retrieval, which will return data within 48
hours.  

### How do I get started using S3 Glacier Deep Archive?

The easiest way to store data in S3 Glacier Deep Archive is to use the S3 API
to upload data directly. Just specify “S3 Glacier Deep Archive” as the storage
class. You can accomplish this using the AWS Management Console, S3 REST API,
AWS SDKs, or AWS Command Line Interface. You can also begin using S3 Glacier
Deep Archive by creating policies to migrate data using S3 Lifecycle, which
provides the ability to define the lifecycle of your object and reduce your
cost of storage. These policies can be set to migrate objects to S3 Glacier
Deep Archive based on the age of the object. You can specify the policy for an
S3 bucket, or for specific prefixes. Lifecycle transitions are billed at the
S3 Glacier Deep Archive Upload price. Tape Gateway, a cloud-based virtual tape
library feature of AWS Storage Gateway, now integrates with S3 Glacier Deep
Archive, enabling you to store your virtual tape-based, long-term backups and
archives in S3 Glacier Deep Archive, thereby providing the lowest cost storage
for this data in the cloud. To get started, create a new virtual tape using
AWS Storage Gateway Console or API, and set the archival storage target either
to S3 Glacier Flexible Retrieval or S3 Glacier Deep Archive. When your backup
application ejects the tape, the tape will be archived to your selected
storage target.  

### How do you recommend migrating data from my existing tape archives to S3
Glacier Deep Archive?

There are multiple ways to migrate data from existing tape archives to S3
Glacier Deep Archive. You can use the AWS Tape Gateway to integrate with
existing backup applications using a virtual tape library (VTL) interface.
This interface presents virtual tapes to the backup application. These can be
immediately used to store data in Amazon S3, S3 Glacier Instant Retrieval, S3
Glacier Flexible Retrieval, and S3 Glacier Deep Archive.  
You can also use AWS Snowball to migrate data. Snowball accelerates moving
terabytes to petabytes of data into and out of AWS using physical storage
devices designed to be secure for transport. Using Snowball helps to eliminate
challenges that can be encountered with large-scale data transfers including
high network costs, long transfer times, and security concerns. Finally, you
can use AWS Direct Connect to establish dedicated network connections from
your premises to AWS. In many cases, Direct Connect can reduce your network
costs, increase bandwidth throughput, and provide a more consistent network
experience than internet-based connections.  

### How can I retrieve my objects stored in S3 Glacier Deep Archive?

To retrieve data stored in S3 Glacier Deep Archive, initiate a “Restore”
request using the Amazon S3 APIs or the Amazon S3 Management Console. The
Restore creates a temporary copy of your data in the S3 Standard storage class
while leaving the archived data intact in S3 Glacier Deep Archive. You can
specify the amount of time in days for which the temporary copy is stored in
S3. You can then access your temporary copy from S3 through an Amazon S3 GET
request on the archived object. When restoring an archived object, you can
specify one of the following options in the Tier element of the request body:
Standard is the default tier and lets you access any of your archived objects
within 12 hours, with retrievals typically starting within 9 hours when
initiated using S3 Batch Operations. Bulk lets you retrieve large amounts of
data, even petabytes of data, inexpensively and typically completes within 48
hours.  

### How am I charged for using S3 Glacier Deep Archive?

S3 Glacier Deep Archive storage is priced based on the amount of data you
store in GBs, the number of PUT/lifecycle transition requests, retrievals in
GBs, and number of restore requests. This pricing model is similar to S3
Glacier Flexible Retrieval. See the [Amazon S3 pricing page](/s3/pricing/) for
information about S3 Glacier Deep Archive pricing.  

### How will S3 Glacier Deep Archive usage show up on my AWS bill and in the
AWS Cost Management tool?

S3 Glacier Deep Archive usage and cost will show up as an independent service
line item on your monthly AWS bill, separate from your Amazon S3 usage and
costs. However, if you are using the AWS Cost Management tool, S3 Glacier Deep
Archive usage and cost will be included under the Amazon S3 usage and cost in
your detailed monthly spend reports, and not broken out as a separate service
line item.

### Are there minimum storage duration and minimum object storage charges for
S3 Glacier Deep Archive?

Objects that are archived to S3 Glacier Deep Archive have a minimum of 180
days of storage. If an object is deleted, overwritten, or transitioned before
180 days, a pro-rated charge equal to the storage charge for the remaining
days will be incurred. S3 Glacier Deep Archive also requires 40 KB of
additional metadata for each archived object. This includes 32 KB of metadata
charged at the S3 Glacier Deep Archive rate required to identify and retrieve
your data. And, an additional 8 KB data charged at the S3 Standard rate which
is required to maintain the user-defined name and metadata for objects
archived to S3 Glacier Deep Archive. This allows you to get a real-time list
of all of your S3 objects using the S3 LIST API or the S3 Inventory report.
View the [Amazon S3 pricing page](/s3/pricing/) for information about S3
Glacier Deep Archive pricing.

### How does S3 Glacier Deep Archive integrate with other AWS Services?

S3 Glacier Deep Archive is integrated with Amazon S3 features, including S3
Object Tagging, S3 Lifecycle policies, S3 Object Lock, and S3 Replication.
With S3 storage management features, you can use a single Amazon S3 bucket to
store a mixture of S3 Glacier Deep Archive, S3 Standard, S3 Standard-IA, S3
One Zone-IA, and S3 Glacier Flexible Retrieval data. This allows storage
administrators to make decisions based on the nature of the data and data
access patterns. Customers can use Amazon S3 Lifecycle policies to
automatically migrate data to lower-cost storage classes as the data ages, or
S3 Cross-Region Replication or Same-Region Replication policies to replicate
data to the same or a different region. AWS Storage Gateway service integrates
Tape Gateway with S3 Glacier Deep Archive storage class, allowing you to store
virtual tapes in the lowest-cost Amazon S3 storage class, reducing the monthly
cost to store your long-term data in the cloud by 75%. With this feature, Tape
Gateway supports archiving your new virtual tapes directly to S3 Glacier
Flexible Retrieval and S3 Glacier Deep Archive, helping you meet your backup,
archive, and recovery requirements. Tape Gateway helps you move tape-based
backups to AWS without making any changes to your existing backup workflows.
Tape Gateway supports most of the leading backup applications such as Veritas,
Veeam, Commvault, Dell EMC NetWorker, IBM Spectrum Protect (on Windows OS),
and Microsoft Data Protection Manager.  

## S3 on Outposts

Open all

### What is Amazon S3 on Outposts?

Amazon S3 on Outposts delivers object storage in your on-premises environment,
using the S3 APIs and capabilities that you use in AWS today. AWS Outposts is
a fully managed service that extends AWS infrastructure, AWS services, APIs,
and tools to virtually any datacenter, co-location space, or on-premises
facility. Using S3 on Outposts, you can securely process and store customer
data generated on-premises before moving it to an AWS Region, access data
locally for applications that run on-premises, or store data on your Outpost
for companies in locations with data residency requirements, and or those in
regulated industries. To learn more about S3 on Outposts, visit the [overview
page](/s3/outposts/).  


## Storage Management

Close all

### What are S3 object tags?

S3 object tags are key-value pairs applied to S3 objects that can be created,
updated, or deleted at any time during the lifetime of the object. With these,
you have the ability to create AWS Identity and Access Management (IAM)
policies, set up Amazon S3 Lifecycle policies, and customize storage metrics.
These object-level tags can then manage transitions between storage classes
and expire objects in the background. You can add tags to new objects when you
upload them or add them to existing objects. Up to ten tags can be added to
each S3 object, and you can use either the AWS Management Console, REST API,
AWS CLI, or AWS SDKs to add object tags.  
Learn more by visiting the [S3 object tags user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-
tagging.html).

### Why should I use object tags?

Object tags are a tool you can use to enable simple management of your S3
storage. With the ability to create, update, and delete tags at any time
during the lifetime of your object, your storage can adapt to the needs of
your business. These tags allow you to control access to objects tagged with
specific key-value pairs, allowing you to further secure confidential data for
only a select group or user. Object tags can also be used to label objects
that belong to a specific project or business unit, which could be used in
conjunction with S3 Lifecycle policies to manage transitions to other storage
classes (S3 Standard-IA, S3 One Zone-IA, Amazon S3 Glacier Instant Retrieval,
Amazon S3 Glacier Flexible Retrieval, and Amazon S3 Glacier Deep Archive) or
with S3 Replication to selectively replicate data between AWS Regions.  

### How can I update the object tags on my objects?

Object tags can be changed at any time during the lifetime of your S3 object,
you can use either the AWS Management Console, REST API, AWS CLI, or AWS SDKs
to change your object tags. Note that all changes to tags outside of the AWS
Management Console are made to the full tag set. If you have five tags
attached to a particular object and want to add a sixth, you need to include
the original five tags in that request.  

### How much do object tags cost?

Object tags are priced based on the quantity of tags and a request cost for
adding tags. The requests associated with adding and updating object tags are
priced the same as existing request prices. See the [Amazon S3 pricing
page](https://aws.amazon.com/s3/pricing/) for more information.  

### How do I get started with Storage Class Analysis?

You can use the AWS Management Console or the S3 PUT Bucket Analytics API to
configure a Storage Class Analysis policy to identify infrequently accessed
storage that can be transitioned to the S3 Standard-IA or S3 One Zone-IA
storage class or archived to the S3 Glacier storage classes. You can navigate
to the Management tab in the S3 console to manage Storage Class Analysis, S3
Inventory, and CloudWatch metrics.  

### Why should I use Amazon S3 Metadata?

You should use [Amazon S3
Metadata](https://aws.amazon.com/s3/features/metadata/) if you want to use SQL
to query the information about your S3 objects to quickly identify specific
datasets for your generative AI, analytics, and other use cases. S3 Metadata
keeps metadata up to date in near real time, so you can use any Iceberg-
compatible client to run SQL queries to find objects by the object metadata.
For example, you can use a SQL query to return a list of objects that match
certain filters such as objects added in the last 30 days across any bucket.

### How does S3 Metadata work?

S3 Metadata is designed to automatically generate metadata that provides
additional information about objects that are uploaded into a bucket and to
make that metadata queryable in a read-only table. These metadata tables are
stored in Amazon S3 Tables, which are built on Apache Iceberg and provide a
managed way to store and query tabular data within S3. S3 Metadata creates and
maintains system-level metadata such as object size, custom metadata such as
tags and user-defined metadata during object upload, and event metadata such
as the IP address that sent the request. As data in your bucket changes, S3
Metadata updates in near real time to reflect the latest changes. You can then
query your metadata tables using various AWS analytics services and open
source tools that are Iceberg-compatible, including Amazon Athena, Amazon
QuickSight, and Apache Spark.  

### How do I get started with S3 Metadata?

You can get started with S3 Metadata with just a few clicks in the S3 console.
Just select the general purpose S3 bucket on which you would like to enable S3
Metadata, and S3 will analyze the data in your bucket and build a fully
managed Apache Iceberg table that contains metadata for all of your objects.
Within minutes, you can begin to query your metadata using any query engine or
tooling that supports Apache Iceberg.

### Where are my S3 Metadata tables stored?

Your S3 Metadata tables are stored in an AWS managed table bucket in your AWS
Account called _aws-s3_. Your tables will be read-only, and only S3 will have
permission to write, update, or delete metadata.

### What are the different types of S3 Metadata tables?

S3 Metadata stores metadata in two managed tables in your account: journal
tables and live inventory tables.

The S3 Metadata journal table provides a view of changes made within your
bucket. As objects are added to, updated, and removed from your general
purpose S3 buckets, the corresponding changes are reflected in the journal
tables in near real time. Journal tables are useful for understanding the
behavior of your applications, and for identifying any change made to your
datasets. For example, you can write SQL queries for journal tables to find S3
objects that match a filter such as objects added in the last 30 days, objects
that were added by active requesters, or objects that have metadata changes
across the last week.

The S3 Metadata live inventory table contains a complete list of all the
objects in your bucket. Live inventory tables are updated hourly and contain
all the information that S3 knows about your objects. Live inventory tables
are useful for discovering or identifying datasets in your bucket, based on
the characteristics generated in object metadata. For example, you can use
live inventory tables to identify training datasets for machine learning, to
use in storage cost optimization exercises, or to help enforce governance
controls.

### How soon are changes from my bucket reflected in S3 Metadata?

When you add new objects to your bucket, you will see entries in the journal
table within minutes, and you will see entries in the live inventory table on
the next hourly refresh. When you enable S3 Metadata on an existing bucket, S3
will automatically start a backfill operation to generate metadata for all
your existing objects. This backfill typically finishes in minutes but can
take several hours if your existing datasets contain millions or billions of
S3 objects.

### Can I combine S3 Metadata tables with my own metadata?

Yes. You can create your own Iceberg tables in table buckets containing custom
metadata, and then join them with the tables that S3 Metadata generates using
simple SQL queries.  

### What is S3 Inventory?

The S3 Inventory report provides a scheduled alternative to Amazon S3’s
synchronous List API. You can configure S3 Inventory to provide a CSV, ORC, or
Parquet file output of your objects and their corresponding metadata on a
daily or weekly basis for an S3 bucket or prefix. You can simplify and speed
up business workflows and big data jobs with S3 Inventory. You can also use S3
inventory to verify encryption and replication status of your objects to meet
business, compliance, and regulatory needs. [Learn more at the Amazon S3
Inventory user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-
inventory.html).

### How do I get started with S3 Inventory?

You can use the AWS Management Console or the PUT Bucket Inventory
Configuration API to configure a daily or weekly inventory report for all the
objects within your S3 bucket or a subset of the objects under a shared
prefix. As part of the configuration, you can specify a destination S3 bucket
for your S3 Inventory report, the output file format (CSV, ORC, or Parquet),
and specific object metadata necessary for your business application, such as
object name, size, last modified date, storage class, version ID, delete
marker, non-current version flag, multipart upload flag, replication status,
or encryption status. You can use S3 Inventory as a direct input into your
application workflows or Big Data jobs. You can also query S3 Inventory using
Standard SQL language with Amazon Athena, Amazon Redshift Spectrum, and other
tools such as Presto, Hive, and Spark. Learn more at the [Amazon S3 Inventory
user guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-
inventory.html).

### How am I charged for using S3 Inventory?

See the [Amazon S3 pricing page](/s3/pricing/) for S3 Inventory pricing. Once
you configure encryption using SSE-KMS, you will incur KMS charges for
encryption, refer to the [KMS pricing page](/kms/pricing/) for detail.

### What are Amazon S3 Tables?

[Amazon S3 Tables](https://aws.amazon.com/s3/features/tables/) deliver S3
storage that is specifically optimized for analytics workloads, improving
query performance while also reducing costs. You can access advanced Iceberg
analytics capabilities and query data using familiar AWS services like Amazon
Athena, Redshift, and EMR through the S3 Tables integration with Amazon
SageMaker Lakehouse. Additionally, you can use Iceberg REST compatible third-
party applications like Apache Spark, Apache Flink, Trino, DuckDB, and
PyIceberg, to read and write data into S3 Tables. You can use table buckets to
store tabular data such as daily purchase transactions, streaming sensor data,
or ad impressions as an Iceberg table in Amazon S3, and then interact with
that data using analytics capabilities such as row-level transactions,
queryable table snapshots, and more, all managed by Amazon S3. Additionally,
table buckets perform continual table maintenance to automatically optimize
query efficiency over time, even as the data lake scales and evolves.

### Why should I use S3 Tables?

You should use S3 Tables for a simple, performant, and cost-effective way to
store tabular data in Amazon S3. S3 Tables give you the ability to organize
your structured data into tables, and then to query that data using standard
SQL statements, with virtually no setup. Additionally, S3 Tables deliver the
same durability, availability, scalability, and performance characteristics as
S3 itself, and automatically optimize your storage to maximize query
performance and to minimize cost.

### How do table buckets work?

S3 Tables provide purpose-built S3 storage for storing structured data in the
Apache Parquet, Avro, and ORC formats. Within a table bucket, you can create
tables as first-class resources directly in S3. These tables can be secured
with table-level permissions defined in either identity- or resource-based
policies, and are accessible by applications or tooling that supports the
Apache Iceberg standard. When you create a table in your table bucket, the
underlying data in S3 is stored as Parquet, Avro, or ORC files. Then, S3 uses
the Apache Iceberg standard to store the metadata necessary to make that data
queryable by your applications. S3 Tables include a client library that is
used by query engines to navigate and update the Iceberg metadata of tables in
your table bucket. This library, in conjunction with updated S3 APIs for table
operations, allows multiple clients to safely read and write data to your
tables. Over time, S3 automatically optimizes the underlying Parquet, Avro, or
ORC data by rewriting, or "compacting” your objects. Compaction optimizes your
data on S3 to improve query performance.

### How do I get started with S3 Tables?

You can get started with S3 Tables in just three steps, and without having to
stand up any infrastructure outside of Amazon S3. First, create a table bucket
in the S3 Management Console or using the S3 CreateTableBucket API. Second,
update your application such as Apache Spark to use the S3 Tables Catalog for
Apache Iceberg. Third, configure the application to use your table bucket ARN
as your table storage location. You can then start creating tables in your
table bucket. You can also integrate with AWS Analytics services using the S3
Management Console to automatically populate all table buckets and tables in
your account and Region through Glue Data Catalog. You do this when you create
your first table bucket or by clicking on “Integrate with AWS Analytics
Services” on the table buckets list page.

### How do I create and delete tables in my table bucket?

You can create a table in your table bucket using the CreateTable API in S3.
Alternatively, you can use your query engine to also create a table. You can
delete a table from your table bucket with the DeleteTable API in S3.
Alternatively, you can use your query engine to delete a table. When you do
this, your table will no longer be accessible by your query engine.

### How do I query my tables?

S3 Tables support the Apache Iceberg standard, and query engines such as
Amazon Athena, Amazon Redshift, and Apache Spark can be used to query Iceberg
tables can be used to query the tables in your table buckets using standard
SQL.

### What performance can I expect from S3 Tables?

You can expect up to 3x faster query performance and up to 10x higher
transactions per second (TPS) compared to storing Iceberg tables in general
purpose Amazon S3 buckets. This is because table buckets automatically compact
the underlying Parquet, Avro, or ORC data for your tables to optimize query
performance, and the purpose-built storage supports up to 10x the TPS by
default.

### Can I manually overwrite or delete an object in my table bucket?

No. To prevent accidentally compromising the integrity of your tables or
breaking downstream applications, table buckets do not allow manual object
overwrites or deletes. Table buckets only support the subset of S3 APIs
necessary to access and update Iceberg tables. Instead, you can configure
unreferenced file removal and snapshot expiration on your tables to delete
data.

### How do table bucket permissions work?

Table buckets give you the ability to apply resource policies to the entire
bucket, or to individual tables. Table bucket policies can be applied using
the PutTablePolicy and PutTableBucketPolicy APIs. Table-level policies allow
you to manage permissions to tables in your table buckets based on the logical
table that it is associated with, without having to understand the physical
location of individual Parquet, Avro, or ORC files. Additionally, S3 Block
Public Access is always applied to your table buckets.

### Do table buckets support concurrent writes to a single table?

Yes. Table buckets rely on Iceberg’s snapshot functionality to keep your
tables consistent when there are multiple concurrent writers.

### What table and data formats do table buckets support?

Table buckets support the Apache Iceberg table format with Parquet, Avro, or
ORC data.

### What table maintenance operations are offered by table buckets?

Table buckets offer three maintenance operations: compaction, snapshot
management, and unreferenced file removal. Compaction periodically combines
smaller objects into fewer, larger objects to improve query performance.
Snapshot management expires and removes table snapshots according to your
snapshot retention configuration. Unreferenced file removal deletes objects
that are not referenced by any table snapshots according to your unreferenced
file removal policy, optimizing storage cost.

### Can I track and audit changes made to my tables?

Yes, S3 Tables support AWS CloudTrail. You can set up CloudTrail data and
management events CloudTrail for your table buckets, similar to how you would
with a general purpose S3 bucket. CloudTrail logs for your table buckets
include both table and data object information.

### Do table buckets support encryption at rest for my table data?

Yes, data in table buckets are encrypted by default using server-side
encryption, ensuring baseline protection for your data at rest. For enhanced
security, you have the option to encrypt your data in S3 Tables using your own
encryption keys. These keys are created and managed within your AWS account
via AWS Key Management Service (AWS KMS). With KMS, there are separate
permissions for the use of the KMS key, adding an extra layer of control and
protection against unauthorized access to your tables stored in table buckets.
Additionally, KMS generates a detailed audit trail, allowing you to track who
accessed which table and when, using your key. KMS also offers additional
security controls to support your efforts in complying with industry
requirements such as PCI-DSS, HIPAA/HITECH, and FedRAMP. This comprehensive
approach to encryption and key management delivers the security and
flexibility needed to protect your sensitive data effectively.

### How much does it cost to use S3 Tables?

With S3 Tables, you pay for storage, requests, and an object monitoring fee
per object stored in table buckets. There are also additional fees for table
maintenance. To see pricing details, read the [S3 pricing
page.](https://aws.amazon.com/s3/pricing/)

### How does compaction work for S3 Tables?

Compaction combines smaller objects into fewer, larger objects to improve
Iceberg query performance. Amazon S3 compacts tables based on a target file
size optimal for your data access pattern, or a value you specify. The
compacted files are written as the most recent snapshot of your table.
Compaction is supported by default for all S3 Tables, with a default target
file size of 512MB. You can change the target file size from 64MB to 512MB
using the PutTableMaintenanceConfiguration API.

### How does snapshot management work for S3 Tables?

Snapshot management expires and removes table snapshots as per the snapshot
retention configuration. Snapshot management determines the number of active
snapshots for your tables based on the MinimumSnapshots (1 by default) and
MaximumSnapshotAge (120 hours by default). When a snapshot expires, Amazon S3
creates delete markers for the data and metadata files uniquely referenced by
that snapshot, and marks these files as noncurrent. These noncurrent files are
deleted after the number of days specified by the NoncurrentDays property in
your unreferenced file removal policy. You can change the default values for
snapshot using the PutTableMaintenanceConfiguration API. Snapshot management
does not support retention values you configure on the Iceberg metadata.json
file, including branch or tag-based retention. Snapshot management for S3
Tables is disabled when you configure a branch or tag-based retention policy,
or configure a retention policy on the metadata.json file that is longer than
the values configured through the PutTableMaintenanceConfiguration API.

### How does unreferenced file removal work for S3 Tables?

Unreferenced file removal identifies and deletes all objects that are not
referenced by any table snapshots. As part of your unreferenced file removal
policy, you can configure two properties: ExpireDays (3 days by default) and
NoncurrentDays (10 days by default). For any object not referenced by your
table and older than the ExpireDays property, S3 permanently deletes the
objects after the number of days specified by the NoncurrentDays property. You
can configure unreferenced file removal at a table bucket level. You can
change the default values for snapshot retention using the
PutTableBucketMaintenanceConfiguration API.  

### What is S3 Batch Operations?

S3 Batch Operations is a feature that you can use to automate the execution of
a single operation (like copying an object, or executing an AWS Lambda
function) across many objects. With S3 Batch Operations, you can, with a few
clicks in the S3 console or a single API request, make a change to billions of
objects without having to write custom application code or run compute
clusters for storage management applications. Not only does S3 Batch
Operations administer your storage operation across many objects, S3 Batch
Operations manages retries, displays progress, delivers notifications,
provides a completion report, and sends events to AWS CloudTrail for all
operations performed on your target objects. S3 Batch Operations can be used
from the S3 console, or through the AWS CLI and SDK.  To learn more, visit the
[S3 Batch Operations page](/s3/features/batch-operations/), or the [user
guide.](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops.html)

### How do I get started with S3 Batch Operations?

You can get started with S3 Batch Operations by going into the Amazon S3
console or using the AWS CLI or SDK to create your first S3 Batch Operations
job. A S3 Batch Operations job consists of the list of objects to act upon and
the type of operation to be performed (see the [full list of available
operations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops-
operations.html)). Start by selecting an S3 Inventory report or providing your
own custom list of objects for S3 Batch Operations to act upon. An S3
Inventory report is a file listing all objects stored in an S3 bucket or
prefix. Next, you choose from a set of S3 operations supported by S3 Batch
Operations, such as replacing tag sets, changing ACLs, copying storage from
one bucket to another, or initiating a restore from S3 Glacier Flexible
Retrieval to S3 Standard storage class. You can then customize your S3 Batch
Operations jobs with specific parameters such as tag values, ACL grantees, and
restoration duration. To further customize your storage actions, you can write
your own Lambda function and invoke that code through S3 Batch Operations.
Once you create your S3 Batch Operations job, S3 Batch Operations will process
your list of objects and send the job to the “awaiting confirmation” state if
required. After you confirm the job details, S3 Batch Operations will begin
executing the operation you specified. You can view your job’s progress
programmatically or through the S3 console, receive notifications on
completion, and review a completion report that itemizes the changes made to
your storage.  
If you are interested in learning more about S3 Batch Operations [watch the
tutorials videos](/s3/s3batchoperations-videos/) and [visit the
documentation](https://docs.aws.amazon.com/AmazonS3/latest/user-guide/batch-
ops.html).

### What AWS electronic storage services have been assessed based on financial
services regulations?

For customers in the financial services industry, S3 Object Lock provides
added support for broker-dealers who must retain records in a non-erasable and
non-rewritable format to satisfy regulatory requirements of SEC Rule 17a-4(f),
FINRA Rule 4511, or CFTC Regulation 1.31. You can easily designate the records
retention time frame to retain regulatory archives in the original form for
the required duration, and also place legal holds to retain data indefinitely
until the hold is removed.  

### What AWS documentation supports the SEC 17a-4(f)(2)(i) and CFTC 1.31(c)
requirement for notifying my regulator?

Provide notification to your regulator or “Designated Examining Authority
(DEA)” of your choice to use Amazon S3 for electronic storage along with a
copy of the [Cohasset Assessment](https://d1.awsstatic.com/r2018/b/S3-Object-
Lock/Amazon-S3-Compliance-Assessment.pdf). For the purposes of these
requirements, AWS is not a designated third party (D3P). Be sure to select a
D3P and include this information in your notification to your DEA.  

### How do I get started with S3 CloudWatch Metrics?

You can use the AWS Management Console to enable the generation of one-minute
CloudWatch request metrics for your S3 bucket or configure filters for the
metrics using a prefix or object tag, or access point. Alternatively, you can
call the S3 PUT Bucket Metrics API to enable and configure publication of S3
storage metrics. CloudWatch Request Metrics will be available in CloudWatch
within 15 minutes after they are enabled. CloudWatch Storage Metrics are
enabled by default for all buckets, and reported once per day. Learn more
about [CloudWatch metrics for Amazon
S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudwatch-
monitoring.html).

### What alarms can I set on my storage metrics?

You can use CloudWatch to set thresholds on any of the storage metrics counts,
timers, or rates and trigger an action when the threshold is breached. For
example, you can set a threshold on the percentage of 4xx Error Responses and
when at least three data points are above the threshold trigger a CloudWatch
alarm to alert a DevOps engineer.

### How am I charged for using  S3 CloudWatch Metrics?

CloudWatch storage metrics are provided free. Cloudwatch request metrics are
priced as custom metrics for Amazon CloudWatch. See the [Amazon CloudWatch
pricing page](/cloudwatch/pricing/) for general information about S3
CloudWatch metrics pricing.

### What is S3 Lifecycle management?

S3 Lifecycle management provides the ability to define the lifecycle of your
object with a predefined policy and reduce your cost of storage. You can set a
lifecycle transition policy to automatically migrate objects stored in the S3
Standard storage class to the S3 Standard-IA, S3 One Zone-IA, and/or S3
Glacier storage classes based on the age of the data. You can also set
lifecycle expiration policies to automatically remove objects based on the age
of the object. You can set a policy for multipart upload expiration, which
expires incomplete multipart uploads based on the age of the upload. Learn
more by visiting the [S3 Lifecycle user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-
mgmt.html).

### How do I set up an S3 Lifecycle management policy?

You can set up and manage Lifecycle policies in the AWS Management Console, S3
REST API, AWS SDKs, or AWS Command Line Interface (CLI). You can specify the
policy at the prefix or at the bucket level.  

### How can I use Amazon S3 Lifecycle management to help lower my Amazon S3
storage costs?

With Amazon S3 Lifecycle policies, you can configure your objects to be
migrated from the S3 Standard storage class to S3 Standard-IA or S3 One Zone-
IA and/or archived to S3 Glacier Instant Retrieval, S3 Glacier Flexible
Retrieval, or S3 Glacier Deep Archive storage classes.  
  
You can also specify an S3 Lifecycle policy to delete objects after a specific
period of time. You can use this policy-driven automation to quickly and
easily reduce storage costs as well as save time. In each rule you can specify
a prefix, a time period, a transition to S3 Standard-IA, S3 One Zone-IA, S3
Glacier Instant Retrieval, S3 Glacier Flexible Retrieval, S3 Glacier Deep
Archive, and/or an expiration. For example, you could create a rule that
archives into S3 Glacier Flexible Retrieval all objects with the common prefix
“logs/” 30 days from creation and expires these objects after 365 days from
creation.  
  
You can also create a separate rule that only expires all objects with the
prefix “backups/” 90 days from creation. S3 Lifecycle policies apply to both
existing and new S3 objects, helping you optimize storage and maximize cost
savings for all current data and any new data placed in S3 without time-
consuming manual data review and migration.  
  
Within a lifecycle rule, the prefix field identifies the objects subject to
the rule. To apply the rule to an individual object, specify the key name. To
apply the rule to a set of objects, specify their common prefix (e.g.
“logs/”). You can specify a transition action to have your objects archived
and an expiration action to have your objects removed. For time period,
provide the creation date (e.g. January 31, 2015) or the number of days from
creation date (e.g. 30 days) after which you want your objects to be archived
or removed. You may create multiple rules for different prefixes.  

### How much does it cost to use S3 Lifecycle management?

There is no additional cost to set up and apply Lifecycle policies. A
transition request is charged per object when an object becomes eligible for
transition according to the Lifecycle rule. Refer to the [Amazon S3 pricing
page](/s3/pricing/) for pricing information.  

### Why would I use an S3 Lifecycle policy to expire incomplete multipart
uploads?

The S3 Lifecycle policy that expires incomplete multipart uploads allows you
to save on costs by limiting the time non-completed multipart uploads are
stored. For example, if your application uploads several multipart object
parts, but never commits them, you will still be charged for that storage.
This policy can lower your S3 storage bill by automatically removing
incomplete multipart uploads and the associated storage after a predefined
number of days. [Learn more about using S3 Lifecycle to expire incomplete
multipart uploads
»](http://docs.aws.amazon.com/AmazonS3/latest/dev/mpuoverview.html#mpu-abort-
incomplete-mpu-lifecycle-config)

### Can I set up Amazon S3 Event Notifications to send notifications when S3
Lifecycle transitions or expires objects?

Yes, you can set up [Amazon S3 Event
Notifications](https://docs.aws.amazon.com/AmazonS3/latest/userguide/NotificationHowTo.html)
to notify you when S3 Lifecycle transitions or expires objects. For example,
you can send S3 Event Notifications to an Amazon SNS topic, Amazon SQS queue,
or AWS Lambda function when S3 Lifecycle moves objects to a different S3
storage class or expires objects.  

## Storage Analytics & Insights

Close all

### What features are available to analyze my storage usage on Amazon S3?

S3 Storage Lens delivers organization-wide visibility into object storage
usage, activity trends, and makes actionable recommendations to optimize costs
and apply data protection best practices. S3 Storage Class Analysis enables
you to monitor access patterns across objects to help you decide when to
transition data to the right storage class to optimize costs. You can then use
this information to configure an S3 Lifecycle policy that makes the data
transfer. Amazon S3 Inventory provides a report of your objects and their
corresponding metadata on a daily or weekly basis for an S3 bucket or prefix.
This report can be used to help meet business, compliance, and regulatory
needs by verifying the encryption, and replication status of your objects.

### What is Amazon S3 Storage Lens?

Amazon S3 Storage Lens provides organization-wide visibility into object
storage usage and activity trends, as well as actionable recommendations to
optimize costs and apply data protection best practices. Storage Lens offers
an interactive dashboard containing a single view of your object storage usage
and activity across tens or hundreds of accounts in your organization, with
drill-downs to generate insights at multiple aggregation levels. This includes
metrics like bytes, object counts, and requests, as well as metrics detailing
S3 feature utilization, such as encrypted object counts and S3 Lifecycle rule
counts. S3 Storage Lens also delivers contextual recommendations to find ways
for you to reduce storage costs and apply best practices on data protection
across tens or hundreds of accounts and buckets. S3 Storage Lens free metrics
are enabled by default for all Amazon S3 users. If you want to get more out of
S3 Storage Lens, you can activate advanced metrics and recommendations. Learn
more by visiting the [S3 Storage Lens user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage_lens.html).

### How does S3 Storage Lens work?

S3 Storage Lens aggregates your storage usage and activity metrics on a daily
basis to be visualized in the S3 Storage Lens interactive dashboard, or
available as a metrics export in CSV or Parquet file format. A default
dashboard is created for you automatically at the account level, and you have
the option to create additional custom dashboards. S3 Storage Lens dashboards
can be scoped to your AWS organization or specific accounts, Regions, buckets,
or even prefix level (available with S3 Storage Lens advanced metrics). You
can also use S3 Storage Lens groups to aggregate metrics using custom filters
based on object metadata like object tag, size, and age. While configuring
your dashboard you can use the default metrics selection, or upgrade to
receive 35 additional metrics and prefix-level aggregations for an additional
cost. Also, S3 Storage Lens provides recommendations contextually with storage
metrics in the dashboard, so you can take action to optimize your storage
based on the metrics.  

### What are the key questions that can be answered using S3 Storage Lens
metrics?

  
The S3 Storage Lens dashboard is organized around four main types of questions
that can be answered about your storage. With the Summary filter, top-level
questions related to overall storage usage and activity trends can be
explored. For example, “How rapidly is my overall byte count and request count
increasing over time?” With the Cost Optimization filter, you can explore
questions related to storage cost reduction, for example, “Is it possible for
me to save money by retaining fewer non-current versions?” With the Data
Protection and Access Management filters you can answer questions about
securing your data, for example, “Is my storage protected from accidental or
intentional deletion?” Finally, with the Performance and Events filters you
can explore ways to improve performance of workflows. Each of these questions
represent a first layer of inquiry that would likely lead to drill-down
analysis.  

### What metrics are available in S3 Storage Lens?

S3 Storage Lens contains more than 60 metrics, grouped into free metrics and
advanced metrics (available for an additional cost). Within free metrics, you
receive metrics to analyze usage (based on a daily snapshot of your objects),
which are organized into the categories of cost optimization, data protection,
access management, performance, and events. Within advanced metrics, you
receive metrics related to activity (such as request counts), deeper cost
optimization (such as S3 Lifecycle rule counts), additional data protection
(such as S3 Replication rule counts), and detailed status codes (such as 403
authorization errors). In addition, derived metrics are also provided by
combining any base metrics. For example, “Retrieval Rate" is a metric
calculated by dividing the "Bytes Downloaded Count" by the "Total Storage.” To
view the complete list of metrics, visit the [S3 Storage Lens
documentation](https://docs.aws.amazon.com/AmazonS3/latest/dev/storage_lens.html).  

### What are my dashboard configuration options?

  
A default dashboard is configured automatically provided for your entire
account, and you have the option to create additional custom dashboards that
can be scoped to your AWS organization, specific regions, or buckets within an
account. You can set up multiple custom dashboards, which can be useful if you
require some logical separation in your storage analysis, such as segmenting
on buckets to represent various internal teams. By default, your dashboard
will receive the S3 Storage Lens free metrics, but you have the option to
upgrade to receive S3 Storage Lens advanced metrics and recommendations (for
an additional cost). S3 Storage Lens advanced metrics have 7 distinct options:
Activity metrics, Advanced Cost Optimization metrics, Advanced Data Protection
metrics, Detailed Status Code metrics, Prefix aggregation, CloudWatch
publishing, and Storage Lens groups aggregation. Additionally, for each
dashboard you can enable metrics export, with additional options to specify
destination bucket and encryption type.  

### How much historical data is available in S3 Storage Lens?

For metrics displayed in the interactive dashboard, Storage Lens free metrics
retains 14 days of historical data, and Storage Lens advanced metrics (for an
additional cost) retains 15 months of historical data. For the optional
metrics export, you can configure any retention period you wish, and standard
S3 storage charges will apply.  

### How will I be charged for S3 Storage Lens?

  
S3 Storage Lens is available in two tiers of metrics. The free metrics are
enabled by default and available at no additional charge to all S3 customers.
The S3 Storage Lens advanced metrics and recommendations pricing details are
available on the S3 pricing page. With S3 Storage Lens free metrics you
receive 28 metrics at the bucket level, and can access 14 days of historical
data in the dashboard. With S3 Storage Lens advanced metrics and
recommendations you receive 35 additional metrics, prefix-level aggregation,
CloudWatch metrics support, custom object metadata filtering with S3 Storage
Lens groups, and can access 15 months of historical data in the dashboard.  

### What is the difference between S3 Storage Lens and S3 Inventory?

S3 Inventory provides a list of your objects and their corresponding metadata
for an S3 bucket or a shared prefix, which can be used to perform object-level
analysis of your storage. S3 Storage Lens provides metrics that can be
aggregated by organization, account, region, storage class, bucket, prefix,
and S3 Storage Lens group levels, which improve organization-wide visibility
of your storage.

### What is the difference between S3 Storage Lens and S3 Storage Class
Analysis (SCA)?

S3 Storage Class Analysis provides recommendations for an optimal storage
class by creating object age groups based on object-level access patterns
within an individual bucket/prefix/tag for the previous 30-90 days. S3 Storage
Lens provides daily organization level recommendations on ways to improve cost
efficiency and apply data protection best practices, with additional granular
recommendations by account, region, storage class, bucket, S3 Storage Lens
group, or prefix (available with S3 Storage Lens advanced metrics). You can
also use custom filters with S3 Storage Lens groups to visualize your storage
based on object age and inform your storage archival strategy.  

### What is Storage Class Analysis?

With Storage Class Analysis, you can analyze storage access patterns to
determine the optimal storage class for your storage. This S3 feature
automatically identifies infrequent access patterns to help you transition
storage to S3 Standard-IA. You can configure a Storage Class Analysis policy
to monitor an entire bucket, prefix, or object tag. Once an infrequent access
pattern is observed, you can easily create a new S3 Lifecycle age policy based
on the results. Storage Class Analysis also provides daily visualizations of
your storage usage on the AWS Management Console and you can also enable an
export report to an S3 bucket to analyze using business intelligence tools of
your choice such as Amazon QuickSight. Learn more and get started by visiting
the [S3 Storage Class Analysis user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/analytics-
storage-class.html).

### How often is the Storage Class Analysis updated?

Storage Class Analysis is updated on a daily basis in the S3 Management
Console, but initial recommendations for storage class transitions are
provided after 30 days.  

## Query in Place

Close all

### What is "Query in Place" functionality?

Amazon S3 allows customers to run sophisticated queries against data stored
without the need to move data into a separate analytics platform. The ability
to query this data in place on Amazon S3 can significantly increase
performance and reduce cost for analytics solutions leveraging S3 as a data
lake. S3 offers multiple query in place options, including Amazon Athena and
Amazon Redshift Spectrum, allowing you to choose one that best fits your use
case.

### How do I query my data in Amazon S3?

There are multiple ways to query your data in S3 that you can choose from
depending on your specific use case. Use client-side filtering to download an
Amazon S3 object to your AWS compute and filter the contents using data
analysis libraries on your client application. For example, in a Python
application that queries Parquet objects in Amazon S3, you can use the Amazon
S3 GET API to download the object and filter the contents using the ‘Pandas’
library. Use Amazon Athena to process multiple S3 objects in a single query or
even use join operations and window functions to query your S3 objects. Use S3
Object Lambda by adding your own code to S3 GET requests to filter data as it
is returned to an application. You should use S3 Object Lambda if you want to
add transformations while filtering data. Read the [blog
post](https://aws.amazon.com/blogs/storage/how-to-optimize-querying-your-data-
in-amazon-s3/) to learn more about these methods for querying your data in
Amazon S3.  

### What is Amazon Athena?

Amazon Athena is an interactive query service that makes it easy to [analyze
data in Amazon S3 using standard SQL queries](/athena/). Athena is serverless,
so there is no infrastructure to set up or manage, and you can start analyzing
data immediately. You don’t even need to load your data into Athena; it works
directly with data stored in any S3 storage class. To get started, just log
into the Athena Management Console, define your schema, and start querying.
Amazon Athena uses Presto with full standard SQL support and works with a
variety of standard data formats, including CSV, JSON, ORC, Apache Parquet and
Avro. While Athena is ideal for quick, ad-hoc querying and integrates with
Amazon QuickSight for easy visualization, it can also handle complex analysis,
including large joins, window functions, and arrays.  

### What is Amazon Redshift Spectrum?

Amazon Redshift Spectrum is a feature of Amazon Redshift that lets you [run
queries against exabytes of unstructured data in Amazon
S3](/redshift/features/) with no loading or ETL required. When you issue a
query, it goes to the Amazon Redshift SQL endpoint, which generates and
optimizes a query plan. Amazon Redshift determines what data is local and what
is in Amazon S3, generates a plan to minimize the amount of Amazon S3 data
that needs to be read, and requests Redshift Spectrum workers out of a shared
resource pool to read and process data from Amazon S3. Redshift Spectrum
scales out to thousands of instances if needed, so queries run quickly
regardless of data size. And, you can use the exact same SQL for Amazon S3
data as you do for your Amazon Redshift queries today and connect to the same
Amazon Redshift endpoint using the same business intelligence tools. Redshift
Spectrum lets you separate storage and compute, allowing you to scale each
independently. You can set up as many Amazon Redshift clusters as you need to
query your Amazon S3 data lake, providing high availability and limitless
concurrency. Redshift Spectrum gives you the freedom to store your data where
you want, in the format you want, and have it available for processing when
you need it.

## Replication

Close all

### What is Amazon S3 Replication?

[Amazon S3 Replication](/s3/features/replication/) enables automatic,
asynchronous copying of objects across Amazon S3 buckets. Buckets that are
configured for object replication can be owned by the same AWS account or by
different accounts. You can replicate new objects written to the bucket to one
or more destination buckets between different AWS Regions (S3 Cross-Region
Replication), or within the same AWS Region (S3 Same-Region Replication). You
can also replicate existing bucket contents (S3 Batch Replication), including
existing objects, objects that previously failed to replicate, and objects
replicated from another source. Learn more by visiting the [S3 Replication
user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html).  

### What is Amazon S3 Cross-Region Replication (CRR)?

CRR is an Amazon S3 feature that automatically replicates data between buckets
across different AWS Regions. With CRR, you can set up replication at a bucket
level, a shared prefix level, or an object level using S3 object tags. You can
use CRR to provide lower-latency data access in different geographic regions.
CRR can also help if you have a compliance requirement to store copies of data
hundreds of miles apart. You can use CRR to change account ownership for the
replicated objects to protect data from accidental deletion. To learn more
visit the [S3 CRR user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html#crr-
scenario).  

### What is Amazon S3 Same-Region Replication (SRR)?

SRR is an Amazon S3 feature that automatically replicates data between buckets
within the same AWS Region. With SRR, you can set up replication at a bucket
level, a shared prefix level, or an object level using S3 object tags. You can
use SRR to create one or more copies of your data in the same AWS Region. SRR
helps you address data sovereignty and compliance requirements by keeping a
copy of your data in a separate AWS account in the same region as the
original. You can use SRR to change account ownership for the replicated
objects to protect data from accidental deletion. You can also use SRR to
easily aggregate logs from different S3 buckets for in-region processing, or
to configure live replication between test and development environments. To
learn more visit the [S3 SRR user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html#srr-
scenario).  

### What is Amazon S3 Batch Replication?

[Amazon S3 Batch
Replication](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html) replicates existing objects between buckets. You can
use S3 Batch Replication to backfill a newly created bucket with existing
objects, retry objects that were previously unable to replicate, migrate data
across accounts, or add new buckets to your data lake. You can get started
with S3 Batch Replication with just a few clicks in the [S3
console](https://s3.console.aws.amazon.com/s3/) or a single API request. To
learn more visit the S3 Batch Replication [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html).  

### How do I enable Amazon S3 Replication (Cross-Region Replication and Same-
Region Replication)?

Amazon S3 Replication (CRR and SRR) is configured at the S3 bucket level, a
shared prefix level, or an object level using S3 object tags. You add a
replication configuration on your source bucket by specifying a destination
bucket in the same or different AWS Region for replication. You can use the S3
console, API, the AWS CLI, AWS SDKs, or AWS CloudFormation to enable
replication. Versioning must be enabled for both the source and destination
buckets to enable replication. To learn more, visit [overview of setting up S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-how-
setup.html) in the Amazon S3 documentation.  

### How do I use S3 Batch Replication?

You would first need to enable S3 Replication at the bucket level. See the
previous question for how you can do so. You may then initiate an S3 Batch
Replication job in the S3 console after creating a new replication
configuration, changing a replication destination in a replication rule from
the replication configuration page, or from the S3 Batch Operations Create Job
page. Alternatively, you can initiate an S3 Batch Replication jobs via the AWS
CLI or SDKs. To learn more, visit [S3
Replication](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-how-
setup.html) in the Amazon S3 documentation.  

### Can I use S3 Replication with S3 Lifecycle rules?

With S3 Replication, you can establish replication rules to make copies of
your objects into another storage class, in the same or a different region.
Lifecycle actions are not replicated, and if you want the same lifecycle
configuration applied to both source and destination buckets, enable the same
lifecycle configuration on both.  For example, you can configure a lifecycle
rule to migrate data from the S3 Standard storage class to the S3 Standard-IA
or S3 One Zone-IA storage class or archive data to a S3 Glacier storage class
on the destination bucket. If you have S3 Lifecycle configured for your
destination bucket, we recommend disabling Lifecycle rules while the Batch
Replication job is active to maintain parity between noncurrent and current
versions of objects in the source and destination buckets.  
  
You can find more information about lifecycle configuration and replication in
the [S3 Replication
documentation.](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-
and-other-bucket-configs.html)  

### Can I use S3 Replication to replicate to more than one destination bucket?

  
Yes. S3 Replication allows customers to replicate their data to multiple
destination buckets in the same, or different AWS Regions. When setting up,
you simply specify the new destination bucket in your existing replication
configuration or create a new replication configuration with multiple
destination buckets. For each new destination you specify, you have the
flexibility to choose storage class of destination bucket, encryption type,
replication metrics and notifications, Replication Time Control (RTC), and
other properties.  
  
**Q: Can I use S3 Replication to set up two-way replication between S3
buckets?  
**

### Can I use replication across AWS accounts to protect against malicious or
accidental deletion?

Yes, for CRR and SRR, you can set up replication across AWS accounts to store
your replicated data in a different account in the target region. You can use
Ownership Overwrite in your replication configuration to maintain a distinct
ownership stack between source and destination, and grant destination account
ownership to the replicated storage.

### Will my object tags be replicated if I use Cross-Region Replication?

Object tags can be replicated across AWS Regions using Cross-Region
Replication. For customers with Cross-Region Replication already enabled, new
permissions are required in order for tags to replicate. For more information
about setting up Cross-Region Replication, visit [How to Set Up Cross-Region
Replication](http://docs.aws.amazon.com/AmazonS3/latest/dev/crr-how-
setup.html) in the [Amazon S3
documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/crr.html).

### Can I replicate delete markers from one bucket to another?

Yes, you can replicate delete markers from source to destination if you have
delete marker replication enabled in your replication configuration. When you
replicate delete markers, Amazon S3 will behave as if the object was deleted
in both buckets. You can enable delete marker replication for a new or
existing replication rule. You can apply delete marker replication to the
entire bucket or to Amazon S3 objects that have a specific prefix, with prefix
based replication rules. Amazon S3 Replication does not support delete marker
replication for object tag based replication rules. To learn more about
enabling delete marker replication see [Replicating delete markers from one
bucket to another](https://docs.aws.amazon.com/AmazonS3/latest/dev/delete-
marker-replication.html).

### Can I replicate data from other AWS Regions to China? Can a customer
replicate from one China Region bucket outside of China Regions?

No, Amazon S3 Replication is not available between AWS China Regions and AWS
Regions outside of China. You are only able to replicate within the China
regions.

### Can I replicate existing objects?

Yes. You can use S3 Batch Replication to replicate existing objects between
buckets. To learn more, visit the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html).

### Can I re-try replication if object fail to replicate initially?

Yes. You can use S3 Batch Replication to re-replicate objects that fail to
replicate initially. To learn more, visit the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-batch-
replication-batch.html).  

### What encryption types does S3 Replication support?

S3 Replication supports all encryption types that S3 offers. S3 offers both
server-side encryption and client-side encryption – the former requests S3 to
encrypt the objects for you, and the latter is for you to encrypt data on the
client-side before uploading it to S3. For server-side encryption, S3 offers
server-side encryption with Amazon S3-managed keys (SSE-S3), server-side
encryption with KMS keys stored in AWS Key Management Service (SSE-KMS), and
server-side encryption with customer-provided keys (SSE-C). For further
details on these encryption types and how they work, visit the [S3
documentation on using
encryption.](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)  

### What is the pricing for cross account data replication?

With S3 Replication, you can configure cross account replication where the
source and destination buckets are owned by different AWS accounts. Excluding
S3 storage and applicable retrieval charges, customers pay for replication PUT
requests and inter-region Data Transfer OUT from S3 to your destination region
when using S3 Replication. If you have S3 Replication Time Control (S3 RTC)
enabled on your replication rules, you will see a different Data Transfer OUT
and replication PUT request charges specific to S3 RTC. For cross account
replication, the source account pays for all data transfer (S3 RTC and S3 CRR)
and the destination account pays for the replication PUT requests. Data
transfer charges only apply for S3 Cross Region Replication (S3 CRR) and S3
Replication Time Control (S3 RTC), there are no data transfer charges for S3
Same Region Replication (S3 SRR).  If you are using S3 Batch Replication to
replicate objects across accounts, you will incur the S3 Batch Operations
charges, in addition to the replication PUT requests and Data Transfer OUT
charges (note that S3 RTC is not applicable to Batch Replication). The Batch
Operations charges include the Job and Object charges, which are respectively
based on the number of jobs and number of objects processed. Additionally, if
you opt in for the Amazon S3 generated manifest, you will incur a manifest
charge based on the number of objects in the source bucket.  
  
Visit the [Amazon S3 pricing page](/s3/pricing/) for more details on S3
Replication pricing.  

### What is Amazon S3 Replication Time Control?

Amazon S3 Replication Time Control provides predictable replication
performance and helps you meet compliance or business requirements. S3
Replication Time Control is designed to replicate most objects in seconds, and
99.99% of objects within 15 minutes. S3 Replication Time Control is backed by
a [Service Level Agreement](/s3/sla-rtc/) (SLA) commitment that 99.9% of
objects will be replicated in 15 minutes for each replication region pair
during any billing month. Replication Time works with all S3 Replication
features. To learn more, visit the [replication
documentation](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication.html).

### How do I enable Amazon S3 Replication Time Control?

Amazon S3 Replication Time Control is enabled as an option for each
replication rule. You can create a new S3 Replication policy with S3
Replication Time Control, or enable the feature on an existing policy. You can
use either the S3 console, API, AWS CLI, AWS SDKs, or AWS CloudFormation to
configure replication. To learn more, please visit [overview of setting up
Replication](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-how-
setup.html) in the Amazon S3 developer guide.

### Can I use S3 Replication Time Control to replicate data within and between
China Regions?

Yes, you can enable Amazon S3 Replication Time Control to replicate data
within and between the AWS China (Ningxia) and China (Beijing) Regions.  

### What are Amazon S3 Replication metrics and events?

Amazon S3 Replication provides four detailed metrics in the Amazon S3 console
and in Amazon CloudWatch: operations pending, bytes pending, replication
latency, and operations failed replication. You can use these metrics to
monitor the total number of operations and size of objects that are pending to
replicate, the replication latency between source and destination buckets, and
the number of operations that did not replicate successfully for each
replication rule. Additionally, you can set up Amazon S3 Event Notifications
of _s3:Replication_ type to get more information about objects that failed to
replicate and the reason behind the failures. We recommend using [Amazon S3
replication failure
reasons](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-
failure-codes.html) to diagnose the errors quickly and fix them before re-
replicating the failed objects with S3 Batch Replication. Finally, if you have
S3 Replication Time Control (S3 RTC) enabled you will receive an S3 Event
Notification when an object takes more than 15 minutes to replicate, and
another when that object replicates successfully to the destination.  

### How do I enable Amazon S3 Replication metrics and events?

Amazon S3 Replication metrics and events can be enabled for each new or
existing replication rules, and are enabled by default for S3 Replication Time
Control enabled rules. You can access S3 Replication metrics through the
Amazon S3 console and Amazon CloudWatch. Like other Amazon S3 events, S3
Replication events are available through Amazon Simple Queue Service (Amazon
SQS), Amazon Simple Notification Service (Amazon SNS), or AWS Lambda. To learn
more, please visit [Monitoring progress with replication metrics and Amazon S3
Event
Notifications](https://docs.aws.amazon.com/AmazonS3/latest/dev/replication-
metrics.html) in the Amazon S3 developer guide.  

### Can I use Amazon S3 Replication metrics and events to track S3 Batch
Replication?

You cannot use metrics like bytes pending, operations pending, and replication
latency to track S3 Batch Replication progress. However, you can use the
operations failed replication metric to monitor existing objects that do not
replicate successfully with S3 Batch Replication. Additionally, you can also
use S3 Batch Operations completion reports to keep track of objects
replicating with S3 Batch Replication.

### What is the Amazon S3 Replication Time Control Service Level Agreement
(SLA)?

Amazon S3 Replication Time Control is designed to replicate 99.99% of your
objects within 15 minutes, and is backed by a service level agreement. If
fewer than 99.9% of your objects are replicated in 15 minutes for each
replication region pair during a monthly billing cycle, the S3 RTC SLA
provides a service credit on any object that takes longer than 15 minutes to
replicate. The service credit covers a percentage of all replication-related
charges associated with the objects that did not meet the SLA, including the
RTC charge, replication bandwidth and request charges, and the cost associated
with storing your replica in the destination region in the monthly billing
cycle affected. To learn more, read the [S3 Replication Time Control
SLA](/s3/sla-rtc/).

### What is the pricing for S3 Replication and S3 Replication Time Control?

For S3 Replication (Cross-Region Replication and Same Region Replication), you
pay the S3 charges for storage in the selected destination S3 storage classes,
the storage charges for the primary copy, replication PUT requests, and
applicable infrequent access storage retrieval charges. For CRR, you also pay
for inter-region Data Transfer OUT From S3 to your destination region. S3
Replication Metrics are billed at the same rate as Amazon CloudWatch custom
metrics. Additionally, when you use S3 Replication Time Control, you also pay
a Replication Time Control Data Transfer charge. For more information, visit
the [Amazon S3 pricing page](/s3/pricing/). If the source object is uploaded
using the multipart upload feature, then it is replicated using the same
number of parts and part size. For example, a 100 GB object uploaded using the
multipart upload feature (800 parts of 128 MB each) will incur request cost
associated with 802 requests (800 Upload Part requests + 1 Initiate Multipart
Upload request + 1 Complete Multipart Upload request) when replicated. You
will incur a request charge of $0.00401 (802 requests x $0.005 per 1,000
requests) and (if the replication was between different AWS Regions) a charge
of $2.00 ($0.020 per GB transferred x 100 GB) for inter-region data transfer.
After replication, the 100 GB will incur storage charges based on the
destination region.

### What are S3 Multi-Region Access Points?

[Amazon S3 Multi-Region Access Points](/s3/features/multi-region-access-
points/) accelerate performance by up to 60% when accessing data sets that are
replicated across multiple AWS Regions. Based on AWS Global Accelerator, S3
Multi-Region Access Points consider factors like network congestion and the
location of the requesting application to dynamically route your requests over
the AWS network to the lowest latency copy of your data. This automatic
routing allows you to take advantage of the global infrastructure of AWS while
maintaining a simple application architecture.

### Why should I use S3 Multi-Region Access Points?

S3 Multi-Region Access Points accelerate and simplify storage for your multi-
region applications. By dynamically routing S3 requests made to a replicated
data set, S3 Multi-Region Access Points reduce request latency, so that
applications run up to 60% faster. S3 Multi-Region Access Points can also help
you build resilient, multi-region and multi-account applications that are more
protected against accidental or unauthorized data deletion. With S3 Multi-
Region Access Points, you are able to take advantage of the global
infrastructure of AWS while maintaining a simple region-agnostic architecture
for your applications.  

### How do S3 Multi-Region Access Points work?

Multi-Region Access Points dynamically route client requests to one or more
underlying S3 buckets. You can configure your Multi-Region Access Point to
route across one bucket per AWS Region, in up to 17 AWS Regions. When you
create a Multi-Region Access Point, S3 automatically generates a DNS-
compatible name. This name is used as a global endpoint that can be used by
your clients. When your clients make requests to this endpoint, S3 will
dynamically route those requests to one of the underlying buckets that are
specified in the configuration of your Multi-Region Access Point. Internet-
based requests are onboarded to the AWS global network to avoid congested
network segments on the internet, which reduces network latency and jitter
while improving performance. Based on AWS Global Accelerator, applications
that access S3 over the internet can see performance further improved up to
60% by S3 Multi-Region Access Points. To directly control this routing, you
can operate S3 Multi-Region Access Points in an active-active or active-
passive configuration. In an active-passive configuration, you can use S3
Multi-Region Access Points failover controls to initiate a failover to shift
S3 data access request traffic to the chosen alternate AWS Region and account
within minutes.  
In an active-active configuration, S3 Multi-Region Access Points consider
factors like network congestion and the location of the requesting application
to dynamically route your requests over the AWS network to the closest copy of
your data. S3 Multi-Region Access Points route your requests through the
closest AWS location to your client, and then over the global private AWS
network to S3. In either configuration, S3 Multi-Region Access Points allow
you to take advantage of the global infrastructure of AWS while maintaining a
simple application architecture.  

### What is the difference between S3 Cross-Region Replication (S3 CRR) and S3
Multi-Region Access Points?

  
S3 CRR and S3 Multi-Region Access Points are complementary features that work
together to replicate data across AWS Regions and then to automatically route
requests to the replicated copy with the lowest latency. S3 Multi-Region
Access Points help you to manage requests across AWS Regions, while CRR allows
you to move data across AWS Regions to create isolated replicas. You use S3
Multi-Region Access Points and CRR together to create a replicated multi-
Region dataset that is addressable by a single global endpoint.

### How much do S3 Multi-Region Access Points cost?

  
When you use an S3 Multi-Region Access Point to route requests within AWS, you
pay a low per-GB data routing charge for each GB processed, as well as
standard charges for S3 requests, storage, data transfer, and replication. If
your application runs outside of AWS and accesses S3 over the internet, S3
Multi-Region Access Points increase performance by automatically routing your
requests through an AWS edge location, over the global private AWS network, to
the closest copy of your data based on access latency. When you accelerate
requests made over the internet, you pay the data routing charge and an
internet acceleration charge. S3 Multi-Region Access Points internet
acceleration pricing varies based on whether the source client is in the same
or in a different location as the destination AWS Region, and is in addition
to standard S3 data transfer pricing. To use S3 Multi-Region Access Points
failover controls, you are only charged for standard S3 API costs to view the
current routing control status of each Region and submit any routing control
changes for initiating a failover. See the [Amazon S3 pricing
page](/s3/pricing/) and the data transfer tab for more pricing information.

### Can I use Requester Pays with S3 Multi-Region Access Points?

  
  
Yes, you can configure the underlying buckets of the S3 Multi-Region Access
Point to be Requester Pays buckets. With Requester Pays, the requester pays
all of the cost associated to the endpoint usage, including the cost for
requests and data transfer cost associated with both the bucket and the Multi-
Region Access Point. Typically, you want to configure your buckets as
Requester Pays buckets if you wish to share data but not incur charges
associated with others accessing the data. In general, bucket owners pay for
all Amazon S3 storage associated with their bucket. To learn more, please
visit [S3 Requester
Pays](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html).  

### How is S3 Transfer Acceleration different than S3 Multi-Region Access
Points?

S3 Multi-Region Access Points and S3 Transfer Acceleration provide similar
performance benefits. You can use S3 Transfer Acceleration to speed up content
transfers to and from Amazon S3 using the AWS global network. S3 Transfer
Accelerator can help accelerate long-distance transfers of larger objects to
and from a single Amazon S3 bucket. With S3 Multi-Region Access Points, you
can perform similar accelerated transfers using the AWS global network, but
across many S3 buckets in multiple AWS Regions for internet-based, VPC-based,
and on-premises requests to and from S3. When you combine S3 Multi-Region
Access Points with S3 Cross Replication, you provide the capability for S3
Multi-Region Access Points to dynamically route your requests to the lowest
latency copy of your data for applications from clients in multiple locations.

### How do I get started with S3 Multi-Region Access Points and failover
controls?

  
The S3 console provides a simple guided workflow to quickly set up everything
you need to run multi-Region storage on S3 in just three simple steps. First,
create an Amazon S3 Multi-Region Access Point endpoint and specify the AWS
Regions you want to replicate and failover between. You can add buckets in
multiple AWS accounts to a new S3 Multi-Region Access Point by entering the
account IDs that own the buckets at the time of creation. Second, for each AWS
Region and S3 bucket behind your S3 Multi-Region Access Point endpoint,
specify whether their routing status is active or passive, where active AWS
Regions accept S3 data request traffic, and passive Regions are not be routed
to until you initiate a failover. Third, configure your S3 Cross-Region
Replication rules to synchronize your data in S3 between the Regions and/or
accounts. You can then initiate a failover at any time between the AWS Regions
within minutes to shift your S3 data requests and monitor the shift of your S3
traffic to your new active AWS Region in Amazon CloudWatch. Alternatively, you
can use AWS CloudFormation to automate your multi-Region storage
configuration. All of the building blocks required to set up multi-Region
storage on S3, including S3 Multi-Region Access Points, are supported by
CloudFormation, allowing you to automate a repeatable setup process outside of
the S3 console.  

## Data processing

Close all

### What is S3 Object Lambda?

S3 Object Lambda allows you to add your own code to S3 GET, LIST, and HEAD
requests to modify and process data as it is returned to an application. You
can use custom code to modify the data returned by S3 GET requests to filter
rows, dynamically resize images, redact confidential data, and much more. You
can also use S3 Object Lambda to modify the output of S3 LIST requests to
create a custom view of objects in a bucket and S3 HEAD requests to modify
object metadata like object name and size. S3 Object Lambda helps you to
easily meet the unique data format requirements of any application without
having to build and operate additional infrastructure, such as a proxy layer,
or having to create and maintain multiple derivative copies of your data. S3
Object Lambda uses AWS Lambda functions to automatically process the output of
a standard S3 GET, LIST, or HEAD request. AWS Lambda is a serverless compute
service that runs customer-defined code without requiring management of
underlying compute resources.  With just a few clicks in the AWS Management
Console, you can configure a Lambda function and attach it to an S3 Object
Lambda service Access Point. From that point forward, S3 will automatically
call your Lambda function to process any data retrieved through the S3 Object
Lambda endpoint, returning a transformed result back to the application. You
can author and execute your own custom Lambda functions, tailoring S3 Object
Lambda’s data transformation to your specific use case. To get started with S3
Object Lambda, you can use the S3 Management Console, SDK, or API. Learn more
on the [S3 Object Lambda page,](http://aws.amazon.com/s3/features/object-
lambda) or the S3 Object Lambda [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html).  

### Why should I use S3 Object Lambda?

You should use S3 Object Lambda if you want to process data inline with an S3
GET, LIST, or HEAD request. You can use S3 Object Lambda to share a single
copy of your data across many applications, avoiding the need to build and
operate custom processing infrastructure or to store derivative copies of your
data. For example, by using S3 Object Lambda to process S3 GET requests, you
can mask sensitive data for compliance purposes, restructure raw data for the
purpose of making it compatible with machine learning applications, filter
data to restrict access to specific content within an S3 object, or to address
a wide range of additional use cases. You can use S3 Object Lambda to enrich
your object lists by querying an external index that contains additional
object metadata, filter and mask your object lists to only include objects
with a specific object tag, or add a file extension to all the object names in
your object lists. For example, if you have an S3 bucket with multiple
discrete data sets, you can use S3 Object Lambda to filter an S3 LIST response
depending on the requester.  S3 Object Lambda can be set up with just a few
clicks in the Amazon S3 Management Console. Read the [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html) to learn more.

### How does S3 Object Lambda work?

S3 Object Lambda uses Lambda functions specified by you to process the output
of GET, LIST, and HEAD requests. Once you have defined a Lambda function to
process requested data, you can attach that function to an S3 Object Lambda
Access Point. GET, LIST, and HEAD requests made through an S3 Object Lambda
Access Point will now invoke the specified Lambda function. Lambda will then
fetch the S3 object requested by the client and process that object. Once
processing has completed, Lambda will stream the processed object back to the
calling client. Read the S3 Object Lambda [user guide to learn
more](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html).

### How do I get started with S3 Object Lambda?

S3 Object Lambda can be set up in multiple ways. You can set up S3 Object
Lambda in the S3 console by navigating to the Object Lambda Access Point tab.
Next, create an S3 Object Lambda Access Point, the Lambda function that you
would like S3 to execute against your GET, LIST, and HEAD requests, and a
supporting S3 Access Point. Grant permissions to all resources to interact
with Object Lambda. Lastly, update your SDK and application to use the new S3
Object Lambda Access Point to retrieve data from S3 using the language SDK of
your choice. You can use an S3 Object Lambda Access Point alias when making
requests. Aliases for S3 Object Lambda Access Points are automatically
generated and are interchangeable with S3 bucket names for data accessed
through S3 Object Lambda. For existing S3 Object Lambda Access Points, aliases
are automatically assigned and ready for use. There are example Lambda
function implementations in the [AWS
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/olap-
writing-lambda.html) to help you get started. You can also use AWS
CloudFormation to automate your S3 Object Lambda configuration. When you use
the AWS CloudFormation template, the Lambda function that is deployed in your
account will pass S3 objects back to your requesting client or application
without any changes. You can add custom code to modify and process data as it
is returned to an application. To learn more, visit the S3 Object Lambda [User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html).  

### What kinds of operations can I perform with S3 Object Lambda?

Any operation supported in a Lambda function is supported with S3 Object
Lambda. This gives you a wide range of available options for processing your
requests. You supply your own Lambda function to run custom computations
against GET, LIST, and HEAD requests, giving you the flexibility to process
data according to the needs of your application. Lambda processing time is
limited to a maximum of 60 seconds. For more details, see the [S3 Object
Lambda
documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html).

### Which S3 request types does S3 Object Lambda support?

S3 Object Lambda supports GET, LIST and HEAD requests. Any other S3 API calls
made to an S3 Object Lambda Access Point will return the standard S3 API
response. Learn more about S3 Object Lambda in the [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transforming-
objects.html).

### What will happen when a S3 Object Lambda function fails?

When a S3 Object Lambda function fails, you will receive a request response
detailing the failure. Like other invocations of Lambda functions, AWS also
automatically monitors functions on your behalf, reporting metrics through
Amazon CloudWatch. To help you troubleshoot failures, Lambda logs all requests
processed by your function and automatically stores logs generated by your
code with Amazon CloudWatch Logs. For more information about accessing
CloudWatch logs for AWS Lambda, visit [CloudWatch
documentation.](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-
functions-logs.html)

### Does S3 Object Lambda affect the S3 availability SLA or S3 durability?

S3 Object Lambda connects Amazon S3, AWS Lambda, and optionally, other AWS
services of your choosing to deliver objects relevant to requesting
applications. All AWS services used in connection with S3 Object Lambda will
continue to be governed by their respective Service Level Agreements (SLA).
For example, in the event that any AWS Service does not meet its Service
Commitment, you will be eligible to receive a Service Credit as documented in
that service’s SLA. Creating an S3 Object Lambda Access Point does not impact
the durability of your objects. However, S3 Object Lambda invokes your
specified AWS Lambda function and you must ensure your specified Lambda
function is intended and correct. See the latest [Amazon S3 SLA
here](https://aws.amazon.com/s3/sla/).

### How much does S3 Object Lambda cost?

When you use S3 Object Lambda, you pay a per GB charge for every gigabyte of
data returned to you through S3 Object Lambda. You are also charged for
requests based on the request type (GET, LIST, and HEAD requests) and AWS
Lambda compute charges for the time your specified function is running to
process the requested data. To see pricing details and an example, read the
[S3 pricing page](/s3/pricing/).

## Data Access

Close all

### What is Mountpoint for Amazon S3?

Mountpoint for Amazon S3 is an open source file client that you can use to
mount an S3 bucket on your compute instance and access it as a local file
system. Mountpoint for Amazon S3 translates local file system operations to
REST API calls on objects stored in Amazon S3. With Mountpoint for Amazon S3,
you can achieve high single-instance throughput to finish jobs faster.
Mountpoint for Amazon S3 is backed by AWS Support. Customers with access to
AWS Enterprise Support get 24x7 technical support from Amazon support
engineers and architectural guidance delivered in the context of their use
cases. Mountpoint for Amazon S3 works with the Linux operating system and AWS
compute services such as Amazon Elastic Compute Cloud (EC2). Learn more on the
[Mountpoint for Amazon S3 page](/s3/features/mountpoint/) or the [user
guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint.html).

### When should I use Mountpoint for Amazon S3?

Mountpoint for Amazon S3 is ideal for read-heavy data lake workloads that
process petabytes of data using random and sequential read operations on
existing files and sequential write operations for creating new files. These
workloads write from a single node and do not modify existing data in Amazon
S3. Common use cases include petabyte-scale autonomous vehicle simulation,
machine learning training, genomics analysis, and image rendering. These
workloads scale up and down quickly, and rely on Amazon S3's elasticity to
minimize underutilized capacity and avoid the cost of over-provisioning
throughput. You can save on compute costs with Mountpoint for Amazon S3 by
efficiently utilizing the network bandwidth use of your compute instances, and
reliably scale to thousands of compute instances for petabyte-scale data lake
workloads.

### What file system operations does Mountpoint for Amazon S3 support?

Mountpoint for Amazon S3 supports basic file system operations such as reading
files up to 5TB in size, writing new files, listing existing files, and
creating and listing directories. Mountpoint for Amazon S3 does not support
modifying existing files or deleting existing directories. With these
operations, Mountpoint for Amazon S3 is ideal for applications that read and
write data at high throughput in Amazon S3 data lakes. It is not suitable for
applications that need collaboration and coordination across multiple compute
instances or users. These applications typically need shared file system
features like appending to existing files and file locking. You can use Amazon
FSx for Lustre for data lake applications that need POSIX semantics and shared
file system features.  

### How do I get started with Mountpoint for Amazon S3?

You can get started with Mountpoint for Amazon S3 by mounting an S3 bucket at
a local directory on your compute instance using the instructions provided in
the
[documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint.html).
Once you mount the S3 bucket at a local directory, your applications can
access S3 objects as files available locally on their compute instance.
Mountpoint for Amazon S3 supports sequential and random read operations on
existing Amazon S3 objects, and supports sequential writes for new objects.
You should read the [semantics
documentation](https://github.com/awslabs/mountpoint-s3/blob/main/doc/SEMANTICS.md)
for Mountpoint for Amazon S3 for more details on supported file system
operations. You can use Mountpoint for Amazon S3 to access objects in all S3
storage classes, excluding objects in S3 Glacier Flexible Retrieval, S3
Glacier Deep Archive, and objects in the Archive Access tier and Deep Archive
Access tier in S3 Intelligent-Tiering.

### How am I charged for Mountpoint for Amazon S3?

There is no additional charge for using Mountpoint for Amazon S3. You pay for
S3 API requests such as GET, PUT, and LIST requests made by Mountpoint for
Amazon S3 when you run file system operations such as file-read, file-write,
and directory-listing operations. For S3 request pricing, please visit the
[pricing page](https://aws.amazon.com/s3/pricing/).  

### What performance can I expect from Mountpoint for Amazon S3?

Mountpoint for Amazon S3 delivers the same performance as the AWS SDKs. This
means data lake applications achieve high single-instance transfer rates,
efficiently utilizing the available network bandwidth on their Amazon EC2
instance. To achieve even higher throughput, these applications can aggregate
throughput across multiple instances to get multiple Tb/s.  

### How can I control access to my data when using Mountpoint for Amazon S3?

When using Mountpoint for Amazon S3, you can control access to your data using
Amazon S3’s existing access control mechanisms, including bucket policies and
AWS Identity and Access Management (IAM) policies. Mountpoint for Amazon S3
translates file system operations like read and write into object API requests
made to your S3 bucket. Afterwards, Amazon S3 evaluates all the relevant
policies, such as those on the user and bucket, to decide whether to authorize
the request. Mountpoint for Amazon S3 does not introduce new access control
mechanisms.  

### Does Mountpoint for Amazon S3 support POSIX-style metadata, such as user
ID, group ID, and permission fields?

Mountpoint for Amazon S3 does not support reading or writing POSIX-style
metadata, such as user ID, group ID, and permission fields. You can use Amazon
FSx for Lustre with Amazon S3 or AWS DataSync to store POSIX-style metadata
for S3 objects.  

### Does Mountpoint for Amazon S3 support access over AWS PrivateLink?

Yes, Mountpoint for Amazon S3 supports access over AWS PrivateLink. AWS
PrivateLink for S3 provides private connectivity between Amazon S3 and on-
premises. You can provision interface VPC endpoints for S3 in your VPC to
connect your on-premises applications directly to S3 over AWS Direct Connect
or AWS VPN.

### Does Mountpoint for Amazon S3 support access over gateway VPC endpoints?

Yes, Mountpoint for Amazon S3 supports access over gateway VPC endpoints. We
recommend that you use AWS PrivateLink-based interface VPC endpoints to access
S3 from on-premises or from a VPC in another AWS Region. For resources that
access S3 from a VPC in the same AWS Region as your S3 bucket, we recommend
using gateway VPC endpoints as they are not billed.

### Can I access Amazon S3 from Amazon Elastic Kubernetes Service (Amazon EKS)
pods?

Yes, you can access Amazon S3 from Amazon EKS using the AWS SDK and the AWS
CLI. For applications that use a file system interface to read and write data,
you can use the Mountpoint for Amazon S3 Container Storage Interface (CSI)
driver. With the Mountpoint for Amazon S3 CSI driver you can achieve high
levels of aggregate throughput ─ up to terabits per second ─ without changing
a single line of application code or your permission model. Like [Mountpoint
for Amazon S3](/s3/features/mountpoint/), the S3 CSI driver supports
sequential and random read operations on existing files and sequential write
operations for creating new files. For details on supported file system
operations, read the [Mountpoint for Amazon S3 file system
behavior](https://github.com/awslabs/mountpoint-s3/blob/main/doc/SEMANTICS.md).
You can install, configure, and update the Mountpoint for Amazon S3 CSI driver
with just a few clicks in the EKS Console, AWS CLI, EKS API, or AWS
CloudFormation. To learn more, visit the [Mountpoint for Amazon S3 CSI driver
GitHub page](https://github.com/awslabs/mountpoint-s3-csi-driver).  

### What is Storage Browser for Amazon S3?

Storage Browser for Amazon S3 is an open source component that you can add to
your web applications to provide your end users, such as customers, partners,
and employees, with a simple interface for data stored in S3. With Storage
Browser for S3, you can provide authorized end users access to easily browse,
download, upload, copy, and delete data in S3 directly from your own
applications.  

### Why should I use Storage Browser for S3?

You should use Storage Browser if you want to add a simple UI purpose built
for browsing, downloading, and uploading S3 data to your applications without
having to write your own code to support this user experience. Storage Browser
makes API calls to S3 on your behalf, and you can customize the interface to
match your existing application’s design and branding.

### How do I get started with Storage Browser for S3?

You can add Storage Browser to your application in just three steps. First,
add a reference in your web application to call Storage Browser when a
specific page is loaded. You do this by importing the [NPM package of Storage
Browser](https://www.npmjs.com/package/@aws-amplify/ui-react) and adding code
to your application as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/installing-
storagebrowser.html). Second, set up authorization by configuring Storage
Browser to work with IAM Identity Center, Amazon Cognito, or your own custom
authorization service. Third, configure cross-origin resource sharing rules
and content security policies on the buckets you want to present to users
within Storage Browser, as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3config-
storagebrowser.html). At this point, authenticated end users that visit the
page in your application that you chose to initialize Storage Browser will be
able to work with data in S3 they have access to.

### How do I use AWS managed authorization with Storage Browser for S3?

To use AWS managed authorization, you first have to configure an IAM Identity
Center and set up permission grants for your users and groups in S3 Access
Grants as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/setup-
storagebrowser.html) for setting up Storage Browser. Then, you connect your
application to Identity Center and configure your application to exchange an
identity token from your external Identity Provider with one from Identity
Center. Finally, you configure your application to provide the Identity Center
token to Storage Browser when a user opens the page in your application to
access your data in S3. As an alternative to Identity Center, you can use
Amazon Cognito to provide access credentials to Storage Browser when an end
user opens the page you choose to present an interface to your S3 data. To use
Cognito, you set up an identity store in Cognito, associate it with an auth
resource in Amplify, deploy the resource in Amplify, and then connect your
application code to your auth resource as defined in the [AWS Amplify
documentation](https://docs.amplify.aws/react/build-a-backend/auth/set-up-
auth/). Then, once you add Storage Browser to your application, it will
authorize end-users’ data access on your behalf based on the authorization
method you chose.

### How do I apply custom authorization with Storage Browser for S3?

To apply custom authorization, you configure your application to provide
Storage Browser with STS tokens authorizing the user to work with S3 datasets
they are permitted to access. In the session policy for each STS token, you
must include the end-user’s access levels for each S3 dataset they are
authorized to access.

### How can I audit access to data through Storage Browser for S3?

You can log any access to your data made through Storage Browser using AWS
CloudTrail logs. You can enable these logs for buckets used by Storage Browser
with just a few clicks in the AWS Management Console. When you use S3 Access
Grants, S3 logs identities of end users that access your data to CloudTrail
logs.

### What can my end users do with Storage Browser for S3?

With Storage Browser, your end users can browse buckets and prefixes, sort by
object metadata, and search for prefixes and objects by name. End users can
also upload, download, copy, and delete objects in S3. Visit the [Storage
Browser roadmap](https://github.com/orgs/aws-amplify/projects/137) for the
list of features we are evaluating.

### Does Storage Browser for S3 support prefix or object renaming?

No. Storage Browser does not support prefix or object renaming.

### Can I customize the look and feel of Storage Browser for S3?

Yes. You can add a custom logo and customize primary colors, padding,
alignment, language and other aspects of the Storage Browser interface to
match your application’s design and branding. Visit the [AWS Amplify User
Guide](https://ui.docs.amplify.aws/react/connected-components/storage/storage-
browser) for the full list of elements you can customize.  

## Storage Browser for Amazon S3

Close all

### What is Storage Browser for Amazon S3?

Storage Browser for Amazon S3 is an open source component that you can add to
your web applications to provide your end users, such as customers, partners,
and employees, with a simple interface for data stored in S3. With Storage
Browser for S3, you can provide authorized end users access to easily browse,
download, upload, copy, and delete data in S3 directly from your own
applications.  

### Why should I use Storage Browser for S3?

You should use Storage Browser if you want to add a simple UI purpose built
for browsing, downloading, and uploading S3 data to your applications without
having to write your own code to support this user experience. Storage Browser
makes API calls to S3 on your behalf, and you can customize the interface to
match your existing application’s design and branding.

### How do I get started with Storage Browser for S3?

You can add Storage Browser to your application in just three steps. First,
add a reference in your web application to call Storage Browser when a
specific page is loaded. You do this by importing the [NPM package of Storage
Browser](https://www.npmjs.com/package/@aws-amplify/ui-react) and adding code
to your application as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/installing-
storagebrowser.html). Second, set up authorization by configuring Storage
Browser to work with IAM Identity Center, Amazon Cognito, or your own custom
authorization service. Third, configure cross-origin resource sharing rules
and content security policies on the buckets you want to present to users
within Storage Browser, as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3config-
storagebrowser.html). At this point, authenticated end users that visit the
page in your application that you chose to initialize Storage Browser will be
able to work with data in S3 they have access to.

### How do I use AWS managed authorization with Storage Browser for S3?

To use AWS managed authorization, you first have to configure an IAM Identity
Center and set up permission grants for your users and groups in S3 Access
Grants as defined in the [S3 User
Guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/setup-
storagebrowser.html) for setting up Storage Browser. Then, you connect your
application to Identity Center and configure your application to exchange an
identity token from your external Identity Provider with one from Identity
Center. Finally, you configure your application to provide the Identity Center
token to Storage Browser when a user opens the page in your application to
access your data in S3. As an alternative to Identity Center, you can use
Amazon Cognito to provide access credentials to Storage Browser when an end
user opens the page you choose to present an interface to your S3 data. To use
Cognito, you set up an identity store in Cognito, associate it with an auth
resource in Amplify, deploy the resource in Amplify, and then connect your
application code to your auth resource as defined in the [AWS Amplify
documentation](https://docs.amplify.aws/react/build-a-backend/auth/set-up-
auth/). Then, once you add Storage Browser to your application, it will
authorize end-users’ data access on your behalf based on the authorization
method you chose.

### How do I apply custom authorization with Storage Browser for S3?

To apply custom authorization, you configure your application to provide
Storage Browser with STS tokens authorizing the user to work with S3 datasets
they are permitted to access. In the session policy for each STS token, you
must include the end-user’s access levels for each S3 dataset they are
authorized to access.

### How can I audit access to data through Storage Browser for S3?

You can log any access to your data made through Storage Browser using AWS
CloudTrail logs. You can enable these logs for buckets used by Storage Browser
with just a few clicks in the AWS Management Console. When you use S3 Access
Grants, S3 logs identities of end users that access your data to CloudTrail
logs.

### What can my end users do with Storage Browser for S3?

With Storage Browser, your end users can browse buckets and prefixes, sort by
object metadata, and search for prefixes and objects by name. End users can
also upload, download, copy, and delete objects in S3. Visit the [Storage
Browser roadmap](https://github.com/orgs/aws-amplify/projects/137) for the
list of features we are evaluating.

### Does Storage Browser for S3 support prefix or object renaming?

No. Storage Browser does not support prefix or object renaming.

### Can I customize the look and feel of Storage Browser for S3?

Yes. You can add a custom logo and customize primary colors, padding,
alignment, language and other aspects of the Storage Browser interface to
match your application’s design and branding. Visit the [AWS Amplify User
Guide](https://ui.docs.amplify.aws/react/connected-components/storage/storage-
browser) for the full list of elements you can customize.  

