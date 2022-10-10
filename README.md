# s3db.js

Hey guys!
There is away to create the cheapest database possible with an easy ORM to handle the data!

## Motivation

We all know that `AWS S3` is one amazing product with high availability and cheap.

You can define metadata to every single file you upload into your bucket within the limits of `2kb` using `UTF-8`. As this encoding may vary the bytes width for each symbol you may use [500 to 2000] letters of metadata storage.

S3 pricing relates to file storage used and requests volume. In this implementation we just upload 0 bytes files so all your costs might be a funcion over the number of GET and POST/PUT requests.

Check by yourself the pricing page: https://aws.amazon.com/s3/pricing/

## Install

```bash
npm i github:filipeforattini/s3db.js
# or
yarn add github:filipeforattini/s3db.js
```

## How to use

```javascript
import * as dotenv from "dotenv";
import S3db from "s3db.js";

dotenv.config();

const {
  AWS_BUCKET,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
} = process.env

async function main () {
  const uri = `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/databases/mydatabase`
  
  s3 = return new S3db({ uri });
  await s3.connect()

  await client.resource("pageviews")
    .define({
      hostname: "string",
      path: "string",
      params: "string",
      userAgent: "string|optional",
    })
    .bulkInsert(new Array(10).fill({
      hostname: 'google.com',
      path: '/',
      params: '?time='+Date.now(),
    }))
}

main()
```
