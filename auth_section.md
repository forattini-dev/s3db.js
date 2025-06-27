### 🔐 Authentication & Connectivity

`s3db.js` supports multiple authentication methods and can connect to various S3-compatible services. The connection string format is flexible and supports different authentication scenarios:

#### Connection String Format

```
s3://[ACCESS_KEY:SECRET_KEY@]BUCKET_NAME[/PREFIX]
```

#### 1. AWS S3 with Access Keys

```javascript
// Traditional access key authentication
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp"
});
```

#### 2. AWS S3 with IAM Roles (EC2/EKS)

```javascript
// No credentials needed - uses IAM role permissions
const s3db = new S3db({
  uri: "s3://BUCKET_NAME/databases/myapp"
});

// The AWS SDK will automatically use:
// - EC2 instance profile (if running on EC2)
// - EKS service account (if running on EKS)
// - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
// - AWS credentials file (~/.aws/credentials)
```

#### 3. MinIO or S3-Compatible Services

```javascript
// Connect to MinIO with custom endpoint
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  endpoint: "http://localhost:9000" // MinIO default endpoint
});

// Connect to other S3-compatible services
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  endpoint: "https://storage.googleapis.com" // Google Cloud Storage
});
```

#### 4. Environment-Based Configuration

```javascript
// Using environment variables for credentials
const s3db = new S3db({
  uri: `s3://${process.env.AWS_ACCESS_KEY_ID}:${process.env.AWS_SECRET_ACCESS_KEY}@${process.env.AWS_BUCKET}/databases/${process.env.DATABASE_NAME}`,
  endpoint: process.env.S3_ENDPOINT // Optional for custom endpoints
});
```

#### 5. Advanced Authentication Scenarios

```javascript
// AWS S3 with session tokens (temporary credentials)
const s3db = new S3db({
  uri: "s3://BUCKET_NAME/databases/myapp",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  }
});

// Custom S3-compatible service with specific region
const s3db = new S3db({
  uri: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  endpoint: "https://custom-s3-service.com",
  region: "us-east-1"
});
```

#### Security Best Practices

- **IAM Roles**: Use IAM roles instead of access keys when possible (EC2, EKS, Lambda)
- **Environment Variables**: Store credentials in environment variables, not in code
- **Temporary Credentials**: Use session tokens for temporary access
- **Bucket Permissions**: Ensure your IAM role/user has the necessary S3 permissions:
  - `s3:GetObject`
  - `s3:PutObject`
  - `s3:DeleteObject`
  - `s3:ListBucket`
  - `s3:GetBucketLocation`

#### Supported Services

`s3db.js` can connect to any service that implements the S3 API:

- **AWS S3** (default)
- **MinIO** (self-hosted S3-compatible)
- **Google Cloud Storage**
- **DigitalOcean Spaces**
- **Wasabi**
- **Backblaze B2**
- **Any S3-compatible service**

The connection string automatically passes the `endpoint` parameter to the AWS SDK's Credentials configuration, allowing seamless connectivity to different S3-compatible services. 