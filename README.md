# s3db.js

Another way to create a cheap document-base database with an easy ORM to handle your dataset!

1. <a href="#motivation">Motivation</a>
1. <a href="#install">Install</a>
1. <a href="#usage">Usage</a>
   1. <a href="#quick-setup">Quick Setup</a>
   1. <a href="#insights">Insights</a>
   1. <a href="#database">Database</a>
   1. <a href="#create-a-resource">Create a resource</a>
1. <a href="#resource-methods">Resource methods</a>
   1. <a href="#insert">Insert</a>
   1. <a href="#bulk-insert">Bulk insert</a>
   1. <a href="#get">Get</a>
   1. <a href="#update">Update</a>
   1. <a href="#delete">Delete</a>
   1. <a href="#count">Count</a>
   1. <a href="#bulk-delete">Bulk delete</a>
   1. <a href="#get-all-ids">Get all ids</a>
   1. <a href="#delete-all">Delete all</a>
   1. <a href="#get-all">Get all</a>
1. <a href="#resource-streams">Resource streams</a>
   1. <a href="#readable-stream">Readable stream</a>
   1. <a href="#writable-stream">Writable stream</a>
1. <a href="#events">Events</a>
1. <a href="#s3-client">S3 Client</a>
1. <a href="#examples">Examples</a>
1. <a href="#cost-simulation">Cost Simulation</a>
   1. <a href="#big-example">Big Example</a>
   1. <a href="#small-example">Small example</a>

## Motivation

First of all:

1. Nothing is for free, but it can be cheaper.
2. I'm not responsible for your AWS Costs strategy, use `s3db.js` at your own risk.
3. Please, do not use in production!

**Let's go!**

You might know AWS's S3 product for its high availability and its cheap pricing rules. I'll show you another clever and funny way to use S3.

AWS allows you define `Metadata` to every single file you upload into your bucket. This attribute must be defined within a **2kb** limit using in `UTF-8` encoding. As this encoding [may vary the bytes width for each symbol](https://en.wikipedia.org/wiki/UTF-8) you may use [500 to 2000] chars of metadata storage. Follow the docs at [AWS S3 User Guide: Using metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html#object-metadata).

There is another management subset of data called `tags` that is used globally as [key, value] params. You can assign 10 tags with the conditions of: the key must be at most 128 unicode chars lengthy and the value up to 256 chars. With those key-values we can use more `2.5kb` of data, unicode will allow you to use up to 2500 more chars. Follow the official docs at [AWS User Guide: Object Tagging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html).

With all this set you may store objects that should be able to store up to `4.5kb` of free space **per object**.

Check the <a href="#cost-simulation">cost simulation</a> section below for a deep cost dive!

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

- This implementation of ORM simulates a document repository. Due to the fact that `s3db.js` uses `aws-sdk`'s' S3 api; all requests are GET/PUT as `key=value` resources. So the best case scenario is to access like a document implementation.

- For better use of the <a href="#cache">`cache`</a> (and listing), the best ID format is to use sequential ids with leading zeros (eq: 00001, 00002, 00003) due to S3 internal keys sorting method.

### Database

Your `s3db.js` client can be initiated with options:

|   option    | optional |                     description                     |   type    |   default   |
| :---------: | :------: | :-------------------------------------------------: | :-------: | :---------: |
|    cache    |   true   |  Persist searched data to reduce repeated requests  | `boolean` | `undefined` |
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

`s3db.js` will generate a file `s3db.json` at the defined prefix.

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

#### Create a resource

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
```

Resources' names **cannot** prefix each other, like: `leads` and `leads-copy`! S3's api will consider both one single resource.

##### Attributes

`s3db.js` use the [fastest-validator](https://www.npmjs.com/package/fastest-validator) package to define and validate your resource. Some few examples:

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

  // may have multiple definitions.
  address_number: ["string", "number"],
};
```

##### Limitations:

As we need to store the resource definition within a JSON file, to keep your definitions intact the best way is to use the [string-based shorthand definitions](https://github.com/icebob/fastest-validator#shorthand-definitions) in your resource definition.

By design, in your resource definition, `s3db.js` **will not handle functions** on your attributes like default value generators, etc.

The `fastest-validator` starts with the params below:

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

##### Reference:

You may just use the reference:

```javascript
const Leads = s3db.resource("leads");
```

### Resources methods

Consider `resource` as:

```javascript
const resource = s3db.resource("leads");
```

#### Insert

```javascript
// data
const data = {
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

const insertedData = await resource.insert(data);
```

If not defined an id attribute, `s3db.js` will use [`nanoid`](https://github.com/ai/nanoid) to generate a random unique id!

#### Bulk insert

You may bulk insert data with a friendly method.

This method uses [`supercharge/promise-pool`](https://github.com/supercharge/promise-pool) to organize the parallelism of your promises.

```javascript
const s3db = new S3db({
  parallelism: 10, // default
});
```

Bulk insert:

```javascript
const objects = new Array(100).fill(0).map((v, k) => ({
  id: `bulk-${k}@mymail.com`,
  lead: {
    fullName: "My Test Name",
    personalEmail: `bulk-${k}@mymail.com`,
    mobileNumber: "+55 11 1234567890",
  },
}));

await resource.bulkInsert(objects);
```

#### Get

```javascript
const obj = await resource.getById("mypersonal@email.com");

// {
//   id: "mypersonal@email.com",
//   utm: {
//     source: "abc",
//   },
//   lead: {
//     fullName: "My Complex Name",
//     personalEmail: "mypersonal@email.com",
//     mobileNumber: "+5511234567890",
//   },
// }
```

#### Update

```javascript
const obj = await resource.updateById("mypersonal@email.com", {
  lead: {
    mobileNumber: "+5511999999999",
  },
});

// {
//   id: "mypersonal@email.com",
//   utm: {
//     source: "abc",
//   },
//   lead: {
//     fullName: "My Complex Name",
//     personalEmail: "mypersonal@email.com",
//     mobileNumber: "+5511999999999",
//   },
// }
```

#### Delete

```javascript
await resource.deleteById(id);
```

#### Count

```javascript
await resource.count();

// 101
```

#### Bulk Delete

```javascript
await resource.bulkDelete(["id1", "id2", "id3 "]);
```

#### Get all Ids

```javascript
const ids = await resource.getAllIds();
// [
//   'id1',
//   'id2',
//   'id3',
// ]
```

#### Delete all

```javascript
await resource.deleteAll();
```

#### Get all

```javascript
const data = await resource.getAll();
```

### Resource streams

#### Readable stream

```javascript
const readableStream = await resource.readable();

readableStream.on("id", (id) => console.log("id =", id));
readableStream.on("data", (lead) => console.log("lead.id =", lead.id));
readableStream.on("end", console.log("end"));
```

#### Writable stream

```javascript
const writableStream = await resource.writable();

writableStream.write({
  lead: {
    fullName: "My Test Name",
    personalEmail: `bulk-${k}@mymail.com`,
    mobileNumber: "+55 11 1234567890",
  },
});
```

### Events

1. s3db
   - connected
   - resource.created
   - resource.inserted
   - resource.deleted
   - error
1. client
   - action
   - error
1. resource
   - id
   - inserted
   - deleted
   - error
1. stream
   - resource.id
   - resource.data
   - error

#### s3db

##### connected

```javascript
s3db.on("connected", () => console.log("s3db connected"));
```

##### resource.created

```javascript
s3db.on("resource.created", (resourceName) =>
  console.log(`resource ${resourceName} created`)
);
```

##### resource.inserted

```javascript
s3db.on("resource.inserted", (resourceName, data) =>
  console.log(`inserted ${resourceName}.id=${data.id}`)
);
```

##### resource.deleted

```javascript
s3db.on("resource.deleted", (resourceName, data) =>
  console.log(`deleted ${resourceName}.id=${data.id}`)
);
```

##### error

```javascript
s3db.on("error", (error) => console.error(error));
```

#### s3Client

##### action

```javascript
s3db.client.on("action", (action) =>
  console.log(`resource ${resourceName} created`)
);
```

##### error

```javascript
s3db.client.on("error", (error) => console.error(error));
```

#### resource

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

`s3db.js` has a S3 proxied client named [`S3Client`](https://github.com/forattini-dev/s3db.js/blob/main/src/s3-client.class.ts). It brings a few handy and less verbose functions to deal with AWS S3's api.

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
const response = await client.deleteObjects({
  keys: [`my-prefixed-file.csv`, `my-other-prefixed-file.csv`],
});
```

##### s3client.listObjects()

```javascript
const response = await client.listObjects({
  prefix: `my-subdir`,
});
```

##### s3client.count()

```javascript
const count = await client.count({
  prefix: `my-subdir`,
});
```

##### s3client.getAllKeys()

All keys have the fullpath replaced into the current "scope" path.

```javascript
const keys = await client.getAllKeys({
  prefix: `my-subdir`,
});
```

## Examples

The processing power here was not the priority, just used my little nodebook Dell XPS. Check the `./examples` directory to get some ideas on how to use this package and the code of the examples below.

Examples' random data uses [`fakerator`](https://github.com/icebob/fakerator), git it a try!

#### [Bulk insert](https://github.com/forattini-dev/s3db.js/blob/main/examples/1-bulk-insert.js)

```bash
$ npm run example:1

> s3db.js@1.0.0 example:1
> cd examples; node 1-bulk-insert.js

creating 10000 leads.
parallelism of 250 requests.

bulk-writing  10000/10000 (100%)  [==============================]  255/bps  0.0s (39.2s) [10001 requests]
bulk-writing: 40.404s

Total cost: 0.0500 USD
```

#### [Resource read stream](https://github.com/forattini-dev/s3db.js/blob/main/examples/2-read-stream.js)

```bash
$ npm run example:2

> s3db.js@1.0.0 example:2
> cd examples; node 2-read-stream.js

reading 10000 leads.
parallelism of 250 requests.

reading-pages   40/1 (100%)  [==============================]  1/bps  0.0s (64.4s)
reading-ids     10000/10000 (100%)  [==============================]  155/bps  0.0s (64.5s)
reading-data    10000/10000 (100%)  [==============================]  153/bps  0.0s (65.3s)
reading: 1:07.246 (m:ss.mmm)

Total cost: 0.0041 USD
```

#### [Resource read stream writing into a csv](https://github.com/forattini-dev/s3db.js/blob/main/examples/3-read-stream-to-csv.js)

```bash
$ npm run example:3

> s3db.js@1.0.0 example:3
> cd examples; node 3-read-stream-to-csv.js

reading 10000 leads.
parallelism of 250 requests.

reading-data  10000/10000 (100%)  [==============================]  123/bps  0.0s (81.3s)
reading-data: 1:23.852 (m:ss.mmm)

Total size: 1.31 Mb
```

#### [Resource read stream writing into a zipped csv](https://github.com/forattini-dev/s3db.js/blob/main/examples/4-read-stream-to-zip.js)

```bash
$ npm run example:4

> s3db.js@1.0.0 example:4
> cd examples; node 4-read-stream-to-zip.js

reading 10000 leads.
parallelism of 250 requests.

reading-data  10000/10000 (100%)  [==============================]  141/bps  0.0s (71.0s)
reading-data: 1:13.078 (m:ss.mmm)

Total zip size: 0.68 Mb
```

#### [Write Stream](https://github.com/forattini-dev/s3db.js/blob/main/examples/5-write-stream.js)

```bash
$ npm run example:5

> s3db.js@1.0.0 example:6
> cd examples; node 5-write-stream.js

reading 10000 leads.
parallelism of 250 requests.

requests        20010/1 (100%)  [==============================]  49/bps  0.0s (410.0s)
reading-pages   40/1 (100%)  [==============================]  0/bps  0.0s (395.6s)
reading-ids     10000/10000 (100%)  [==============================]  25/bps  0.0s (395.6s)
reading-data    10000/10000 (100%)  [==============================]  25/bps  0.0s (401.5s)
writing-ids     10000/10000 (100%)  [==============================]  25/bps  0.0s (395.7s)
writing-data    10000/10000 (100%)  [==============================]  25/bps  0.0s (395.7s)
copying-data: 6:51.352 (m:ss.mmm)

Total cost: 0.0541 USD
```

#### [JWT Token validator](https://github.com/forattini-dev/s3db.js/blob/main/examples/6-jwt-tokens.js)

```bash
$ npm run example:6

> s3db.js@1.0.0 example:6
> cd examples; node jwt-tokens.js

Created tokens: .....
Validated tokens: .....
```

## Cost simulation

S3's pricing deep dive:

- Data volume [1 GB x 0.023 USD]: it relates to the total volume of storage used and requests volume but, in this implementation, we just upload `0 bytes` files.
- GET Requests [1,000 GET requests in a month x 0.0000004 USD per request = 0.0004 USD]: every read requests
- PUT Requests [1,000 PUT requests for S3 Standard Storage x 0.000005 USD per request = 0.005 USD]: every write request
- Data transfer [Internet: 1 GB x 0.09 USD per GB = 0.09 USD]:

Check by yourself the pricing page details at https://aws.amazon.com/s3/pricing/ and https://calculator.aws/#/addService/S3.

### Big example

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

### Small example

Lets save some JWT tokens using the [RFC:7519](https://www.rfc-editor.org/rfc/rfc7519.html).

```javascript
await s3db.createResource({
  resourceName: "tokens",
  attributes: {
    iss: 'url|max:256',
    sub: 'string',
    aud: 'string',
    exp: 'number',
    email: 'email',
    name: 'string',
    scope: 'string',
    email_verified: 'boolean',
  })

function generateToken () {
  const token = createTokenLib(...)

  await resource.insert({
    id: token.jti || md5(token)
    ...token,
  })

  return token
}

function validateToken (token) {
  const id = token.jti || md5(token)

  if (!validateTokenSignature(token, ...)) {
    await resource.deleteById(id)
    throw new Error('invalid-token')
  }

  return resource.getById(id)
}
```
