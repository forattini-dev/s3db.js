# s3db.js

Hey guys, there is an another way to create the cheapest database possible with an easy ORM to handle your dataset!

_Please, do not use in production._

## Motivation

You might know AWS's S3 product for its high availability and its cheap pricing rules. I'll show you another clever and funny way to use S3.

First of all, you need to know that AWS allows you define `metadata` to every single file you upload into your bucket. This attribute must be defined within a `2kb` limit using in `UTF-8` encoding. As this encoding [may vary the bytes width for each symbol](https://en.wikipedia.org/wiki/UTF-8) you may use [500 to 2000] chars of metadata storage. Follow the docs at [AWS S3 User Guide: Using metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html#object-metadata).

There is another management subset of data called `tags` that is used globally as [key, value] params. You can assign 10 tags with the conditions of: the key must be at most 128 unicode chars lengthy and the value up to 256 chars. With those key-values we can use more `2.5kb` of data, unicode will allow you to use up to 2500 more chars. Follow the official docs at [AWS User Guide: Object Tagging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html).

Investigating S3's pricing, it relates to the total volume of storage used and requests volume. In this implementation we just upload 0 bytes files so all your costs might be a funcion over the number of GET and POST/PUT requests. Check by yourself the pricing page details at https://aws.amazon.com/s3/pricing/

With all this set you may store objects that should be able to store up to `4.5kb` of free space **per object**.

This implementation of Database ORM is focused on `key=value`, access like a document implementation, due to the fact that we are using S3 apis that work like that for files.

Lets git it a try! :)

## Install

```bash
npm i https://github.com/forattini-dev/s3db.js
# or
yarn add https://github.com/forattini-dev/s3db.js
```

## Usage

You may check the snippets bellow or go straight to the <a href="#Examples">Examples</a> section!

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

s3db.connect()
  .then(() => console.log('connected!')))
```

If you do use `dotenv` package:

```javascript
import * as dotenv from "dotenv";
dotenv.config();

import S3db from "s3db.js";
```

### Client

Your `S3db` client can be initiated with options:

|   option    | optional |            description             |       type        |   default   |
| :---------: | :------: | :--------------------------------: | :---------------: | :---------: |
| parallelism |  false   |    Number of simultaneous tasks    |     `number`      |     10      |
| passphrase  |  false   |       Your encryption secret       |     `string`      | `undefined` |
|     uri     |  false   | A url as your S3 connection string |     `string`      | `undefined` |

#### Uri

```javascript
const {
  AWS_BUCKET = "my-bucket",
  AWS_ACCESS_KEY_ID = "secret",
  AWS_SECRET_ACCESS_KEY = "secret",
  AWS_BUCKET_PREFIX = "databases/test-" + Date.now(),
} = process.env;

const uri = `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/${AWS_BUCKET_PREFIX}`;
```

#### Config example

```javascript
const options = {
  uri,
  parallelism: 5,
  passphrase: fs.readFileSync("./cert.pem"),
};
```

#### s3db.connect()

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
      "reversed": {
        "0": "name",
        "1": "token"
      }
    }
  }
}
```

### Creating resources

We use the [fastest-validator](https://www.npmjs.com/package/fastest-validator) package to define and validate your resource.

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

Create a new resource:

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

await s3db.newResource({
  resourceName: "leads",
  attributes,
});

// or chained method
await s3db.resource("leads").define(attributes);
```

### Inserting data

```javascript
// data
const attributes = {
  id: "mypersonal@email.com",
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

const insertedData = await s3db.insert({
  resourceName,
  attributes,
});

// or chained method
const insertedData = await s3db.resource("leads").insert(attributes);
```

### Bulk inserting data

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

await s3db.bulkInsert(resourceName, objects);

// or chained method
await s3db.resource(resourceName).bulkInsert(objects);
```

### Get data

```javascript
// data
const id = "1234567890";

const obj = await s3db.getById({ resourceName, id });

// or chained method
const obj = await s3db.resource(resourceName).get(id);
```

### Resource read stream

```javascript
const readStream = await s3db.stream({ resourceName });

// or chained method
const readStream = await s3db.resource(resourceName).stream();

readStream.on("data", (data) => console.log("id =", data.id));
readStream.on("end", console.log("end"));
```

### List data (coming soon)

```javascript
await s3db.list({ resourceName, id });

// or chained method
await s3db.resource(resourceName).list();
```

### Write stream (coming soon)

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

#### on: data

```javascript
const stream = s3db.resource("leads").stream();

stream.on("data", (object) => console.log("id = ", object.id));
```

## Examples

Check the `./examples` dir.

[Bulk insert](https://github.com/forattini-dev/s3db.js/blob/main/examples/bulk-insert.js)

```bash
npm run ex-1

> s3db.js@1.0.0 ex-1
> cd examples; node bulk-insert.js

creating 10000 leads.
parallelism of 100 requests.

bulk-writing  10000/10000 (100%)  [==============================]  294/bps  0.0s (34.0s)
bulk-writing: 34.731s
```

[Resource read stream](https://github.com/forattini-dev/s3db.js/blob/main/examples/read-stream.js)

```bash
$ npm run ex-2

> s3db.js@1.0.0 ex-2
> cd examples; node read-stream.js

reading 10000 leads.
parallelism of 100 requests.

reading-ids   10000/10000 (100%)  [==============================]  121/bps  0.0s (82.6s)
reading-data  10000/10000 (100%)  [==============================]  124/bps  0.0s (80.9s)
reading: 1:24.008 (m:ss.mmm)
```

[Resource read stream writing into file](https://github.com/forattini-dev/s3db.js/blob/main/examples/read-stream.js)

```bash
$ npm run ex-3

> s3db.js@1.0.0 ex-3
> cd examples; node read-stream-to-file.js

reading 10000 leads.
parallelism of 100 requests.

reading data  10000/10000 (100%)  [==============================]  129/bps  0.0s
reading: 1:20.765 (m:ss.mmm)
```

