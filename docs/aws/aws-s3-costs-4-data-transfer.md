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

