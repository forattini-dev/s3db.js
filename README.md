# s3db.js

Hey guys, there is an another way to create the cheapest database possible with an easy ORM to handle your dataset!

## Motivation

We all know that AWS's S3 product is amazing! Probably your perception comes from its service's high availability and its cheap pricing rules.

AWS lets you define `metadata` to every single file you upload into your bucket within a `2kb` limit using `UTF-8`. As this encoding may vary the bytes width for each symbol you may use [500 to 2000] chars of metadata storage. Follow the docs at [User Guide: Using metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html#object-metadata).

There is another management subset of data called `tags` that is used globally as [key, value] params. You can assign 10 tags with the conditions of: the key must be at most 128 unicode chars lengthy and the value up to 256 chars. With those key-values we can use more `2.5kb` of data, unicode will allow you to use up to 2500 more chars. Follow the official docs at [User Guide: Object Tagging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html).

S3 pricing relates to file storage used and requests volume. In this implementation we just upload 0 bytes files so all your costs might be a funcion over the number of GET and POST/PUT requests. Check by yourself the pricing page details at https://aws.amazon.com/s3/pricing/

With all this set you may store objects that should be able to store up to `4.5kb` of free space **per object**. Lets git it a try! :)

## Install

```bash
npm i github:filipeforattini/s3db.js
# or
yarn add github:filipeforattini/s3db.js
```

## How to use


### Setup

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
    source: 'string|optional',
    medium: 'string|optional',
    campaign: 'string|optional',
    term: 'string|optional',
  },
  lead: {
    fullName: "string",
    mobileNumber: "string",
    personalEmail: "email",
  },
} 

// method 1
await s3db.newResource({
  resourceName: 'leads',
  attributes,
});

// or method 2
await s3db
  .resource('leads')
  .define(attributes);
```

### Inserting data

```javascript
// data
const attributes = {
  id: "mypersonal@email.com",
  utm: {
    source: 'abc'
  },
  lead: {
    fullName: "My Complex Name",
    personalEmail: "mypersonal@email.com",
    mobileNumber: "+5511234567890",
  },
  invalidAttr: 'this attribute will disappear',
}

// method 1
await s3db.insert({
  resourceName,
  attributes,
});

// or method 2
await s3db
  .resource('leads')
  .insert(attributes);
```

### Bulk inserting data

You may bulk insert data with a friendly method.

This method uses [`supercharge/promise-pool`](https://github.com/supercharge/promise-pool) to organize the parallelism of your promises.

```javascript
const s3db = new S3db({ 
  parallelism: 10 
});
```

Bulk insert:

```javascript
// data
const objects = new Array(100)
  .fill(0)
  .map((v, k) => ({
    id: `bulk-${k}@mymail.com`,
    lead: {
      fullName: "My Test Name",
      personalEmail: `bulk-${k}@mymail.com`,
      mobileNumber: "+55 34 234567890",
    },
  }))

// method 1
await s3db.bulkInsert(resourceName, objects)

// or method 2
await s3db
  .resource(resourceName)
  .bulkInsert(objects)
```
### Get data

```javascript
// data
const id = '1234567890'

// method 1
await s3db.getById({ resourceName, id })

// or method 2
await s3db
  .resource(resourceName)
  .get(id)
```

### List data (coming soon)

```javascript
// method 1
await s3db.list({ resourceName, id })

// or method 2
await s3db
  .resource(resourceName)
  .list()
```

### Read stream list (coming soon)

```javascript
// method 1
const readStream = await s3db.stream({ resourceName })

// or method 2
const readStream = await s3db
  .resource(resourceName)
  .stream()
```

### Write stream (coming soon)

```javascript
// code
```

### Events

#### on: connected
```javascript
s3db.on('connected', () => console.log('connected'))

s3db.connect()
```

#### on: data
```javascript
s3db.on('data', (data) => console.log('created: ', data))

s3db.resource('leads').insert(attributes);
s3db.resource('leads').bulkInsert(objects);
```

#### on: error
```javascript
s3db.on('error', (error, resourceName, originalData) => 
  console.error(error, resourceName, originalData))
```

## Examples

