# s3db.js

[![license: unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](http://unlicense.org/) [![npm version](https://img.shields.io/npm/v/s3db.js.svg?style=flat)](https://www.npmjs.com/package/s3db.js) [![Maintainability](https://api.codeclimate.com/v1/badges/26e3dc46c42367d44f18/maintainability)](https://codeclimate.com/github/forattini-dev/s3db.js/maintainability) [![Coverage Status](https://coveralls.io/repos/github/forattini-dev/s3db.js/badge.svg?branch=main)](https://coveralls.io/github/forattini-dev/s3db.js?branch=main)

Another way to create a cheap document-base database with an easy ORM to handle your dataset!

<table width="100%">
<tr>
<td>

1. <a href="#motivation">Motivation</a>
1. <a href="#usage">Usage</a>
   1. <a href="#install">Install</a>
   1. <a href="#quick-setup">Quick Setup</a>
   1. <a href="#insights">Insights</a>
   1. <a href="#database">Database</a>
   1. <a href="#create-a-resource">Create a resource</a>
1. <a href="#resource-methods">Resource methods</a>
   1. <a href="#insert-one">Insert one</a>
   1. <a href="#get-one">Get one</a>
   1. <a href="#update-one">Update one</a>
   1. <a href="#delete-one">Delete one</a>
   1. <a href="#count">Count</a>
   1. <a href="#insert-many">Insert many</a>
   1. <a href="#get-many">Get many</a>
   1. <a href="#get-all">Get all</a>
   1. <a href="#delete-many">Delete many</a>
   1. <a href="#delete-all">Delete all</a>
   1. <a href="#list-ids">List ids</a>
1. <a href="#resource-streams">Resource streams</a>
   1. <a href="#readable-stream">Readable stream</a>
   1. <a href="#writable-stream">Writable stream</a>
1. <a href="#s3-client">S3 Client</a>
1. <a href="#events">Events</a>
1. <a href="#examples">Examples</a>
1. <a href="#cost-simulation">Cost Simulation</a>
   1. <a href="#big-example">Big Example</a>
   1. <a href="#small-example">Small example</a>
1. <a href="#roadmap">Roadmap</a>

</td>
</tr>
</table>

---

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

---

## Usage

You may check the snippets bellow or go straight to the <a href="#examples">Examples</a> section!

### Install

```bash
npm i s3db.js

# or

yarn add s3db.js
```

### Quick setup

Our S3db client use connection string params.

```javascript
import { S3db } from "s3db.js";

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

import { S3db } from "s3db.js";
```

### Insights

- This implementation of ORM simulates a document repository. Due to the fact that `s3db.js` uses `aws-sdk`'s' S3 api; all requests are GET/PUT as `key=value` resources. So the best case scenario is to access like a document implementation.

- For better use of the <a href="#cache">cache</a> and listing, the best ID format is to use sequential ids with leading zeros (eq: 00001, 00002, 00003) due to S3 internal keys sorting method. But you will need to manage this incremental ID by your own.

### Database

Your `s3db.js` client can be initiated with options:

|   option    | optional |                     description                     |   type    |   default   |
| :---------: | :------: | :-------------------------------------------------: | :-------: | :---------: |
|    cache    |   true   |  Persist searched data to reduce repeated requests  | `boolean` | `undefined` |
| parallelism |   true   |            Number of simultaneous tasks             | `number`  |     10      |
| passphrase  |   true   |               Your encryption secret                | `string`  | `undefined` |
|     ttl     |   true   | (Coming soon) TTL to your cache duration in seconds | `number`  |    86400    |
|     uri     |  false   |         A url as your S3 connection string          | `string`  | `undefined` |

Config example:

```javascript
const {
  AWS_BUCKET = "my-bucket",
  AWS_ACCESS_KEY_ID = "secret",
  AWS_SECRET_ACCESS_KEY = "secret",
  AWS_BUCKET_PREFIX = "databases/test-" + Date.now(),
} = process.env;

const uri = `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/${AWS_BUCKET_PREFIX}`;

const options = {
  uri,
  parallelism: 25,
  passphrase: fs.readFileSync("./cert.pem"),
};
```

#### s3db.connect()

This method must always be invoked before any operation take place. This will interact with AWS' S3 api and check the itens below:

1. With current credentials:
   - Check if client has access to the S3 bucket.
   - Check if client has access to bucket life-cycle policies.
1. With defined database:
   - Check if there is already a database in this connection string.
     - If any database is found, downloads it's medatada and loads each `Resource` definition.
     - Else, it will generate an empty <a href="#metadata-file">`metadata`</a> file into this prefix and mark that this is a new database from scratch.

#### Metadata file

`s3db.js` will generate a file `/s3db.json` at the pre-defined prefix with this structure:

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

### Create a resource

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

const resource = await s3db.createResource({
  name: "leads",
  attributes,
});
```

Resources' names **cannot** prefix each other, like: `leads` and `leads-copy`! S3's api lists keys using prefix notation, so every time you list `leads`, all keys of `leads-copy` will appear as well.

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
##### Reference:

You may just use the reference:

```javascript
const Leads = s3db.resource("leads");
```

##### Limitations:

As we need to store the resource definition within a JSON file, to keep your definitions intact the best way is to use the [string-based shorthand definitions](https://github.com/icebob/fastest-validator#shorthand-definitions) in your resource definition.

By design, the resource definition **will will strip all functions** in attributes to avoid `eval()` calls.

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


---

## Resources methods

Consider `resource` as:

```javascript
const resource = s3db.resource("leads");
```

### Insert one

```javascript
// data
const insertedData = await resource.insert({
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
});

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
//   invalidAttr: "this attribute will disappear",
// }
```

If not defined an id attribute, `s3db.js` will use [`nanoid`](https://github.com/ai/nanoid) to generate a random unique id!

### Get one

```javascript
const obj = await resource.get("mypersonal@email.com");

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

### Update one

```javascript
const obj = await resource.update("mypersonal@email.com", {
  lead: {
    fullName: "My New Name",
    mobileNumber: "+5511999999999",
  },
});

// {
//   id: "mypersonal@email.com",
//   utm: {
//     source: "abc",
//   },
//   lead: {
//     fullName: "My New Name",
//     personalEmail: "mypersonal@email.com",
//     mobileNumber: "+5511999999999",
//   },
// }
```

### Delete one

```javascript
await resource.delete(id);
```

### Count

```javascript
await resource.count();

// 101
```

### Insert many

You may bulk insert data with a friendly method that receives a list of objects.

```javascript
const objects = new Array(100).fill(0).map((v, k) => ({
  id: `bulk-${k}@mymail.com`,
  lead: {
    fullName: "My Test Name",
    personalEmail: `bulk-${k}@mymail.com`,
    mobileNumber: "+55 11 1234567890",
  },
}));

await resource.insertMany(objects);
```

Keep in mind that we need to send a request to each object to be created. There is an option to change the amount of simultaneos connections that your client will handle.

```javascript
const s3db = new S3db({
  parallelism: 100, // default = 10
});
```

This method uses [`supercharge/promise-pool`](https://github.com/supercharge/promise-pool) to organize the parallel promises.

### Get many

```javascript
await resource.getMany(["id1", "id2", "id3 "]);

// [
//   obj1,
//   obj2,
//   obj3,
// ]
```

### Get all

```javascript
const data = await resource.getAll();

// [
//   obj1,
//   obj2,
//   ...
// ]
```

### Delete many

```javascript
await resource.deleteMany(["id1", "id2", "id3 "]);
```

### Delete all

```javascript
await resource.deleteAll();
```

### List ids

```javascript
const ids = await resource.listIds();

// [
//   'id1',
//   'id2',
//   'id3',
// ]
```

---

## Resource streams

As we need to request the metadata for each id to return it's attributes, a better way to handle a huge amount off data might be using streams.

### Readable stream

```javascript
const readableStream = await resource.readable();

readableStream.on("id", (id) => console.log("id =", id));
readableStream.on("data", (lead) => console.log("lead.id =", lead.id));
readableStream.on("end", console.log("end"));
```

### Writable stream

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

---

## S3 Client

`s3db.js` has a S3 proxied client named [`S3Client`](https://github.com/forattini-dev/s3db.js/blob/main/src/s3-client.class.ts). It brings a few handy and less verbose functions to deal with AWS S3's api.

```javascript
import { S3Client } from "s3db.js";

const client = new S3Client({ connectionString });
```

Each method has a **[:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html) link** to the official `aws-sdk` docs.



##### getObject [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property)

```javascript
const { Body, Metadata } = await client.getObject({
  key: `my-prefixed-file.csv`,
});

// AWS.Response
```

##### putObject [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property)

```javascript
const response = await client.putObject({
  key: `my-prefixed-file.csv`,
  contentType: "text/csv",
  metadata: { a: "1", b: "2", c: "3" },
  body: "a;b;c\n1;2;3\n4;5;6",
});

// AWS.Response
```

##### headObject [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#headObject-property)

```javascript
const { Metadata } = await client.headObject({
  key: `my-prefixed-file.csv`,
});

// AWS.Response
```

##### deleteObject [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObject-property)

```javascript
const response = await client.deleteObject({
  key: `my-prefixed-file.csv`,
});

// AWS.Response
```

##### deleteObjects [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#deleteObjects-property)

```javascript
const response = await client.deleteObjects({
  keys: [`my-prefixed-file.csv`, `my-other-prefixed-file.csv`],
});

// AWS.Response
```

##### listObjects [:link:](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjects-property)

```javascript
const response = await client.listObjects({
  prefix: `my-subdir`,
});

// AWS.Response
```

##### count

Custom made method to make it easier to count keys within a listObjects loop.

```javascript
const count = await client.count({
  prefix: `my-subdir`,
});

// 10
```

##### getAllKeys

Custom made method to make it easier to return all keys in a subpath within a listObjects loop.

All returned keys will have the it's fullpath replaced with the current "scope" path.

```javascript
const keys = await client.getAllKeys({
  prefix: `my-subdir`,
});

// [
//   key1,
//   key2,
//   ...
// ]
```

---

## Events

The 3 main classes `S3db`, `Resource` and `S3Client` are extensions of Javascript's `EventEmitter`.

| S3Database | S3Client      | S3Resource | S3Resource Readable Stream |
| ---------- | ------------- | ---------- | -------------------------- |
| error      | error         | error      | error                      |
| connected  | request       | insert     | id                         |
|            | response      | get        | data                       |
|            | response      | update     |                            |
|            | getObject     | delete     |                            |
|            | putObject     | count      |                            |
|            | headObject    | insertMany |                            |
|            | deleteObject  | deleteAll  |                            |
|            | deleteObjects | listIds    |                            |
|            | listObjects   | getMany    |                            |
|            | count         | getAll     |                            |
|            | getAllKeys    |            |                            |

### S3Database

#### error

```javascript
s3db.on("error", (error) => console.error(error));
```

#### connected

```javascript
s3db.on("connected", () => {});
```

### S3Client

Using this reference for the events:

```javascript
const client = s3db.client;
```

#### error

```javascript
client.on("error", (error) => console.error(error));
```

#### request

Emitted when a request is generated to AWS.

```javascript
client.on("request", (action, params) => {});
```

#### response

Emitted when a response is received from AWS.

```javascript
client.on("response", (action, params, response) => {});
```

#### getObject

```javascript
client.on("getObject", (options, response) => {});
```

#### putObject

```javascript
client.on("putObject", (options, response) => {});
```

#### headObject

```javascript
client.on("headObject", (options, response) => {});
```

#### deleteObject

```javascript
client.on("deleteObject", (options, response) => {});
```

#### deleteObjects

```javascript
client.on("deleteObjects", (options, response) => {});
```

#### listObjects

```javascript
client.on("listObjects", (options, response) => {});
```

#### count

```javascript
client.on("count", (options, response) => {});
```

#### getAllKeys

```javascript
client.on("getAllKeys", (options, response) => {});
```

### S3Resource

Using this reference for the events:

```javascript
const resource = s3db.resource("leads");
```

#### error

```javascript
resource.on("error", (err) => console.error(err));
```

#### insert

```javascript
resource.on("insert", (data) => {});
```

#### get

```javascript
resource.on("get", (data) => {});
```

#### update

```javascript
resource.on("update", (attrs, data) => {});
```

#### delete

```javascript
resource.on("delete", (id) => {});
```

#### count

```javascript
resource.on("count", (count) => {});
```

#### insertMany

```javascript
resource.on("insertMany", (count) => {});
```

#### getMany

```javascript
resource.on("getMany", (count) => {});
```

#### getAll

```javascript
resource.on("getAll", (count) => {});
```

#### deleteAll

```javascript
resource.on("deleteAll", (count) => {});
```

#### listIds

```javascript
resource.on("listIds", (count) => {});
```

---

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
  name: "tokens",
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

## Roadmap

Tasks board can be found at [this link](https://github.com/orgs/forattini-dev/projects/5/views/1)!

Feel free to interact and PRs are welcome! :)
