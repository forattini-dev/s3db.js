# s3db.js

Hey guys, there is an another way to create a cheap database with an easy ORM to handle your dataset!

1. <a href="#motivation">Motivation</a>
1. <a href="#install">Install</a>
1. <a href="#usage">Usage</a>
   1. <a href="#quick-setup">Quick Setup</a>
   1. <a href="#insights">Insights</a>
   1. <a href="#client">Client</a>
   1. <a href="#resources">Resources</a>
      1. <a href="#create-resources">Create resources</a>
      1. <a href="#insert-data">Insert data</a>
      1. <a href="#bulk-insert-data">Bulk insert data</a>
      1. <a href="#get-data">Get data</a>
      1. <a href="#delete-data">Delete data</a>
      1. <a href="#resource-read-stream">Resource read stream</a>
      1. List data (coming soon)
      1. Write stream (coming soon)
   1. <a href="#events">Events</a>
   1. <a href="#s3-client">S3 Client</a>
1. <a href="#examples">Examples</a>
1. <a href="#cost-simulation">Cost Simulation</a>

## Motivation

First of all:

1. Nothing is for free, but it can be cheaper.
2. I'm not responsible for your AWS Costs strategy, use `s3db.js` at your own risk.
3. Please, do not use in production!

**Let's go!**

You might know AWS's S3 product for its high availability and its cheap pricing rules. I'll show you another clever and funny way to use S3.

AWS allows you define `metadata` to every single file you upload into your bucket. This attribute must be defined within a `2kb` limit using in `UTF-8` encoding. As this encoding [may vary the bytes width for each symbol](https://en.wikipedia.org/wiki/UTF-8) you may use [500 to 2000] chars of metadata storage. Follow the docs at [AWS S3 User Guide: Using metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html#object-metadata).

There is another management subset of data called `tags` that is used globally as [key, value] params. You can assign 10 tags with the conditions of: the key must be at most 128 unicode chars lengthy and the value up to 256 chars. With those key-values we can use more `2.5kb` of data, unicode will allow you to use up to 2500 more chars. Follow the official docs at [AWS User Guide: Object Tagging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html).

With all this set you may store objects that should be able to store up to `4.5kb` of free space **per object**.

S3's pricing deep dive:

- Data volume [1 GB x 0.023 USD]: it relates to the total volume of storage used and requests volume but, in this implementation, we just upload `0 bytes` files.
- GET Requests [1,000 GET requests in a month x 0.0000004 USD per request = 0.0004 USD]: every read requests
- PUT Requests [1,000 PUT requests for S3 Standard Storage x 0.000005 USD per request = 0.005 USD]: every write request
- Data transfer [Internet: 1 GB x 0.09 USD per GB = 0.09 USD]:

Check by yourself the pricing page details at https://aws.amazon.com/s3/pricing/ and https://calculator.aws/#/addService/S3.

Lets give it a try! :)

## Install

```bash
npm i https://github.com/forattini-dev/s3db.js
# or
yarn add https://github.com/forattini-dev/s3db.js
```

## Usage

You may check the snippets bellow or go straight to the <a href="#examples">Examples</a> section!

### Quick setup

Our S3db client use connection string params.

```javascript
import S3db from "s3db.js";

const {
  AWS_BUCKET,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
} = process.env

const s3db = new S3db({
  uri: `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/databases/mydatabase`
});

s3db
  .connect()
  .then(() => console.log('connected!')))
```

If you do use `dotenv` package:

```javascript
import * as dotenv from "dotenv";
dotenv.config();

import S3db from "s3db.js";
```

### Insights

- This implementation of Database ORM is focused on `key=value`, access like a document implementation, due to the fact that we are using S3 apis that work like that for files.
- For better use of the <a href="#cache">`cache`</a>, the best is to use sequential ids with leading zeros (eq: 000001, 000002, 000003) due to s3 sorting keys method.

### Client

Your `S3db` client can be initiated with options:

|   option    | optional |                     description                     |   type    |   default   |
| :---------: | :------: | :-------------------------------------------------: | :-------: | :---------: |
|    cache    |   true   |  (Coming soon) If your read methods can be proxied  | `boolean` | `undefined` |
| parallelism |   true   |            Number of simultaneous tasks             | `number`  |     10      |
| passphrase  |   true   |               Your encryption secret                | `string`  | `undefined` |
|     ttl     |   true   | (Coming soon) TTL to your cache duration in seconds | `number`  |    86400    |
|     uri     |  false   |         A url as your S3 connection string          | `string`  | `undefined` |

URI as a connection string:

```javascript
const {
  AWS_BUCKET = "my-bucket",
  AWS_ACCESS_KEY_ID = "secret",
  AWS_SECRET_ACCESS_KEY = "secret",
  AWS_BUCKET_PREFIX = "databases/test-" + Date.now(),
} = process.env;

const uri = `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/${AWS_BUCKET_PREFIX}`;
```

Config example:

```javascript
const options = {
  uri,
  parallelism: 25,
  passphrase: fs.readFileSync("./cert.pem"),
};
```

##### s3db.connect()

Interacts with the bucket to check:

1. If the client has access to the S3 bucket with current keys
1. If there is already a defined database at this prefix. If there is, it downloads the medatada and loads each Resource definition.
1. If there isnt any database defined in this prefix, it will generate an empty metadata file into this prefix.

#### Metadata file

`S3db` will generate a file `s3db.json` at the defined prefix.

It has this structure:

```javascript
{
  // file version
  "version": "1",

  // previously defined resources
  "resources": {
    // definition example
    "leads": {
      "name": "leads",

      // resource options
      "options": {},

      // resource defined schema
      "schema": {
        "name": "string",
        "token": "secret"
      },

      // rules to simplify metadata usage
      "mapper": {
        "name": "0",
        "token": "1"
      },
    }
  }
}
```

### Resources

#### Create resource

Resources are definitions of data collections.

```javascript
// resource
const attributes = {
  utm: {
    source: "string|optional",
    medium: "string|optional",
    campaign: "string|optional",
    term: "string|optional",
  },
  lead: {
    fullName: "string",
    mobileNumber: "string",
    personalEmail: "email",
  },
};

await s3db.createResource({
  resourceName: "leads",
  attributes,
});

// or
await s3db.resource("leads").define(attributes);
```

##### Attributes

`s3db.js` use the [fastest-validator](https://www.npmjs.com/package/fastest-validator) package to define and validate your resource.

As we need to store the resource definition within a JSON file, today you must use the [string-based shorthand definitions](https://github.com/icebob/fastest-validator#shorthand-definitions) to define your resource.

By default, we start the validator with the params below to clean missing attributes definition.

```javascript
// fastest-validator params
{
  useNewCustomCheckerFunction: true,
  defaults: {
    object: {
      strict: "remove",
    },
  },
}
```

Some few examples:

```javascript
const attributes = {
  // few simple examples
  name: "string|min:4|max:64|trim",
  email: "email|nullable",
  mobile: "string|optional",
  count: "number|integer|positive",
  corrency: "corrency|symbol:R$",
  createdAt: "date",
  website: "url",
  id: "uuid",
  ids: "array|items:uuid|unique",

  // s3db defines a custom type "secret" that is encrypted
  token: "secret",

  // nested data works aswell
  geo: {
    lat: "number",
    long: "number",
    city: "string",
  },
};
```

#### Insert data

```javascript
// data
const attributes = {
  id: "mypersonal@email.com", // if not defined a id will be generated!
  utm: {
    source: "abc",
  },
  lead: {
    fullName: "My Complex Name",
    personalEmail: "mypersonal@email.com",
    mobileNumber: "+5511234567890",
  },
  invalidAttr: "this attribute will disappear",
};

const insertedData = await s3db.resource("leads").insert(attributes);
```

If not defined an id attribute, `s3db` will use [`nanoid`](https://github.com/ai/nanoid) to generate a random unique id.

#### Bulk insert data

You may bulk insert data with a friendly method.

This method uses [`supercharge/promise-pool`](https://github.com/supercharge/promise-pool) to organize the parallelism of your promises.

```javascript
const s3db = new S3db({
  parallelism: 10,
});
```

Bulk insert:

```javascript
// data
const objects = new Array(100).fill(0).map((v, k) => ({
  id: `bulk-${k}@mymail.com`,
  lead: {
    fullName: "My Test Name",
    personalEmail: `bulk-${k}@mymail.com`,
    mobileNumber: "+55 34 234567890",
  },
}));

await s3db.resource("leads").bulkInsert(objects);
```

#### Get data

```javascript
// data
const id = "1234567890";

const obj = await s3db.resource("leads").get(id);
```

#### Resource read stream

```javascript
// or chained method
const readStream = await s3db.resource("leads").stream();

readStream.on("id", (id) => console.log("id =", id));
readStream.on("data", (lead) => console.log("lead.id =", lead.id));
readStream.on("end", console.log("end"));
```

#### Delete data (coming soon)

```javascript
await s3db.resource("leads").delete(id);
```

#### List data (coming soon)

```javascript
await s3db.resource("leads").list();
```

#### Write stream (coming soon)

```javascript
// code
```

### Events

#### on: connected

```javascript
s3db.on("connected", () => console.log("connected"));

// from
// s3db.connect();
```

#### on: inserted

```javascript
s3db.on("inserted", (data) => console.log("created: ", data));

// from
// s3db.resource("leads").insert(attributes);
// s3db.resource("leads").bulkInsert(objects);
```

#### on: error

```javascript
s3db.on("error", (error, resourceName, originalData) =>
  console.error(error, resourceName, originalData)
);

// from
// s3db.resource("leads").insert(attributes);
// s3db.resource("leads").bulkInsert(objects);
```

#### on: id

```javascript
const stream = s3db.resource("leads").stream();

stream.on("data", (id) => console.log("id = ", id));
```

#### on: data

```javascript
const stream = s3db.resource("leads").stream();

stream.on("data", (obj) => console.log("id = ", obj.id));
```

### S3 Client

`s3db` uses a proxied s3client that brings few handy and less verbose functions.

```javascript
import { S3Client } from "s3db.js/src/client";

const client = new S3Client({ connectionString });
```

##### s3client.getObject()

```javascript
const { Body, Metadata } = await client.getObject({
  key: `my-prefixed-file.csv`,
});
```

##### s3client.putObject()

```javascript
const response = await client.putObject({
  key: `my-prefixed-file.csv`,
  contentType: "text/csv",
  metadata: { a: "1", b: "2", c: "3" },
  body: "a;b;c\n1;2;3\n4;5;6",
});
```

##### s3client.headObject()

```javascript
const { Metadata } = await client.headObject({
  key: `my-prefixed-file.csv`,
});
```

##### s3client.deleteObject()

```javascript
const response = await client.deleteObject({
  key: `my-prefixed-file.csv`,
});
```

##### s3client.deleteObjects()

```javascript
const response = await client.deleteObject({
  keys: [`my-prefixed-file.csv`, `my-other-prefixed-file.csv`],
});
```

##### s3client.listObjects()

```javascript
const response = await client.listObjects({
  prefix: `my-subdir.csv`,
});
```

## Examples

The processing power here was not the priority, just used my little nodebook Dell XPS. Check the `./examples` directory to get some ideas on how to use this package and the code of the examples below.

Examples' random data uses [`fakerator`](https://github.com/icebob/fakerator), git it a try!

#### [Bulk insert](https://github.com/forattini-dev/s3db.js/blob/main/examples/bulk-insert.js)

```bash
npm run ex-1

> s3db.js@1.0.0 ex-1
> cd examples; node bulk-insert.js

creating 10000 leads.
parallelism of 100 requests.

bulk-writing  10000/10000 (100%)  [==============================]  235/bps  0.0s (42.6s)
bulk-writing: 43.602s
```

#### [Resource read stream](https://github.com/forattini-dev/s3db.js/blob/main/examples/read-stream.js)

```bash
$ npm run ex-2

> s3db.js@1.0.0 ex-2
> cd examples; node read-stream.js

reading 10000 leads.
parallelism of 100 requests.

reading-ids   10000/10000 (100%)  [==============================]  42/bps  0.0s (235.8s)
reading-data  10000/10000 (100%)  [==============================]  40/bps  0.0s (250.0s)
reading: 4:15.908 (m:ss.mmm)
```

#### [Resource read stream writing into a csv](https://github.com/forattini-dev/s3db.js/blob/main/examples/read-stream-to-csv.js)

```bash
$ npm run ex-3

> s3db.js@1.0.0 ex-3
> cd examples; node read-stream-to-csv.js

parallelism of 100 requests.

reading-data  10000/10000 (100%)  [==============================]  44/bps  0.0s (225.9s)
reading-data: 3:49.192 (m:ss.mmm)

resource leads total size: 1.29 Mb
```

#### [Resource read stream writing into a zipped csv](https://github.com/forattini-dev/s3db.js/blob/main/examples/read-stream-to-zip.js)

```bash
$ npm run ex-4

> s3db.js@1.0.0 ex-4
> cd examples; node read-stream-to-zip.js

parallelism of 100 requests.

reading-data  10000/10000 (100%)  [==============================]  58/bps  0.0s (172.7s)
reading-data: 3:04.934 (m:ss.mmm)

resource leads zip size: 0.68 Mb
```

## Cost simulation

Lets try to simulate a big project where you have a database with a few tables:

- pageviews: 100,000,000 lines of 100 bytes each
- leads: 1,000,000 lines of 200 bytes each

```javascript
const Fakerator = require("fakerator");
const fake = Fakerator("pt-BR");

const pageview = {
  ip: this.faker.internet.ip(),
  domain: this.faker.internet.url(),
  path: this.faker.internet.url(),
  query: `?q=${this.faker.lorem.word()}`,
};

const lead = {
  name: fake.names.name(),
  mobile: fake.phone.number(),
  email: fake.internet.email(),
  country: "Brazil",
  city: fake.address.city(),
  state: fake.address.countryCode(),
  address: fake.address.street(),
};
```

If you write the whole database of:

- pageviews:
  - 100,000,000 PUT requests for S3 Standard Storage x 0.000005 USD per request = 500.00 USD (S3 Standard PUT requests cost)
- leads:
  - 1,000,000 PUT requests for S3 Standard Storage x 0.000005 USD per request = 5.00 USD (S3 Standard PUT requests cost)

It will cost 505.00 USD, once.

If you want to read the whole database:

- pageviews:
  - 100,000,000 GET requests in a month x 0.0000004 USD per request = 40.00 USD (S3 Standard GET requests cost)
  - (100,000,000 × 100 bytes)÷(1024×1000×1000) ≅ 10 Gb
    Internet: 10 GB x 0.09 USD per GB = 0.90 USD
- leads:
  - 1,000,000 GET requests in a month x 0.0000004 USD per request = 0.40 USD (S3 Standard GET requests cost)
  - (1,000,000 × 200 bytes)÷(1024×1000×1000) ≅ 0.19 Gb
    Internet: 1 GB x 0.09 USD per GB = 0.09 USD

It will cost 41.39 USD, once.
