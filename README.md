# s3db.js

Just wanted to create the cheapest database possible and git it an easy ORM to handle the data.

## Install

```bash
npm i @forattini-dev/s3db.js
```

## How to use

```javascript
import * as dotenv from "dotenv";
import S3db from "@forattini-dev/s3db.js";

dotenv.config();

const {
  AWS_BUCKET,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
} = process.env

async function main () {
  const uri = `s3://${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}@${AWS_BUCKET}/databases/mydatabase`
  
  s3 = return new S3db({ uri });
  await s3.setup()

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