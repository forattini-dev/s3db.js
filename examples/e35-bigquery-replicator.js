/**
 * BigQuery Replicator Example
 * 
 * This example demonstrates the new BigQuery replicator configuration structure
 * that supports per-resource table mapping and action filtering.
 * 
 * ⚠️  REQUIRED DEPENDENCY: You must install the Google Cloud BigQuery SDK:
 * npm install @google-cloud/bigquery
 * 
 * Features demonstrated:
 * - Multiple tables per resource
 * - Action filtering (insert, update, delete)
 * - Short form configuration
 * - Operation logging
 */

import S3db from '../src/index.js';
import { ReplicationPlugin } from '../src/plugins/index.js';

// Example configuration - replace with your actual BigQuery credentials
const BIGQUERY_CONFIG = {
  projectId: 'your-gcp-project-id',
  datasetId: 'your-dataset-id',
  location: 'US',
  logTable: 's3db_replication_log',
  credentials: {
    // Your Google Cloud service account credentials
    client_email: 'service-account@your-project.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\n...'
  }
};

async function main() {
  console.log('🚀 BigQuery Replicator Example\n');

  // Create database with BigQuery replication
  const s3db = new S3db({
    connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/bigquery-demo",
    plugins: [new ReplicationPlugin({
      enabled: true,
      replicators: [
        {
          driver: 'bigquery',
          config: BIGQUERY_CONFIG,
          resources: {
            // Users: replicate all operations to users table
            users: [
              { actions: ['insert', 'update', 'delete'], table: 'mrt-shortner__users' },
            ],
            
            // URLs: replicate only inserts to two different tables
            urls: [
              { actions: ['insert'], table: 'mrt-shortner__urls' },
              { actions: ['insert'], table: 'mrt-shortner__urls_v2' },
            ],
            
            // Clicks: short form - just the table name (insert only)
            clicks: 'mrt-shortner__clicks',
            
            // Views: short form
            views: 'mrt-shortner__views',
            
            // Shares: short form
            shares: 'mrt-shortner__shares',
            
            // Scans: short form
            scans: 'mrt-shortner__scans',
          }
        }
      ],
      syncMode: 'async',
      retryAttempts: 3,
      retryDelay: 1000
    })]
  });

  await s3db.connect();
  console.log('✅ Connected to S3DB with BigQuery replication\n');

  // Create resources
  const users = await s3db.createResource({
    name: 'users',
    attributes: {
      id: 'string|required',
      name: 'string|required',
      email: 'string|required',
      createdAt: 'string|required'
    }
  });

  const urls = await s3db.createResource({
    name: 'urls',
    attributes: {
      id: 'string|required',
      originalUrl: 'string|required',
      shortCode: 'string|required',
      userId: 'string|required',
      createdAt: 'string|required'
    }
  });

  const clicks = await s3db.createResource({
    name: 'clicks',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',
      userId: 'string',
      ipAddress: 'string',
      userAgent: 'string',
      timestamp: 'string|required'
    }
  });

  const views = await s3db.createResource({
    name: 'views',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',
      timestamp: 'string|required'
    }
  });

  const shares = await s3db.createResource({
    name: 'shares',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',
      platform: 'string|required',
      timestamp: 'string|required'
    }
  });

  const scans = await s3db.createResource({
    name: 'scans',
    attributes: {
      id: 'string|required',
      urlId: 'string|required',
      qrCode: 'boolean|required',
      timestamp: 'string|required'
    }
  });

  console.log('✅ Created resources: users, urls, clicks, views, shares, scans\n');

  // Listen to replication events
  const replicationPlugin = s3db.plugins.find(p => p.constructor.name === 'ReplicationPlugin');
  
  replicationPlugin.on('replication.success', (data) => {
    console.log(`✅ Replication succeeded: ${data.item.resourceName} ${data.item.operation}`);
  });

  replicationPlugin.on('replication.failed', (data) => {
    console.log(`❌ Replication failed: ${data.item.resourceName} ${data.item.operation} - ${data.lastError}`);
  });

  // Listen to BigQuery replicator events
  replicationPlugin.on('replicator.replicated', (data) => {
    if (data.replicator === 'BigqueryReplicator') {
      console.log(`📊 BigQuery replicated: ${data.resourceName} ${data.operation} to ${data.tables.length} tables`);
      if (data.results) {
        data.results.forEach(result => {
          console.log(`  - Table ${result.table}: ${result.success ? '✅' : '❌'}`);
        });
      }
    }
  });

  // Insert test data
  console.log('📝 Inserting test data...\n');

  const user1 = await users.insert({
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: new Date().toISOString()
  });
  console.log('👤 Created user:', user1.id);

  const url1 = await urls.insert({
    id: 'url-1',
    originalUrl: 'https://example.com/very-long-url-that-needs-shortening',
    shortCode: 'abc123',
    userId: 'user-1',
    createdAt: new Date().toISOString()
  });
  console.log('🔗 Created URL:', url1.id);

  const click1 = await clicks.insert({
    id: 'click-1',
    urlId: 'url-1',
    userId: 'user-1',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    timestamp: new Date().toISOString()
  });
  console.log('🖱️  Created click:', click1.id);

  const view1 = await views.insert({
    id: 'view-1',
    urlId: 'url-1',
    timestamp: new Date().toISOString()
  });
  console.log('👁️  Created view:', view1.id);

  const share1 = await shares.insert({
    id: 'share-1',
    urlId: 'url-1',
    platform: 'twitter',
    timestamp: new Date().toISOString()
  });
  console.log('📤 Created share:', share1.id);

  const scan1 = await scans.insert({
    id: 'scan-1',
    urlId: 'url-1',
    qrCode: true,
    timestamp: new Date().toISOString()
  });
  console.log('📱 Created scan:', scan1.id);

  // Test update operation (only users table supports updates)
  console.log('\n🔄 Testing update operation...');
  await users.update('user-1', {
    name: 'John Smith',
    email: 'johnsmith@example.com'
  });
  console.log('✅ Updated user');

  // Test delete operation (only users table supports deletes)
  console.log('\n🗑️  Testing delete operation...');
  await users.delete('user-1');
  console.log('✅ Deleted user');

  // Wait for async replications to process
  console.log('\n⏳ Waiting for replications to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Get replication statistics
  const stats = await replicationPlugin.getReplicationStats();
  console.log('\n📊 Replication Statistics:');
  console.log(JSON.stringify(stats, null, 2));

  // Test BigQuery connection
  console.log('\n🔍 Testing BigQuery connection...');
  const bigqueryReplicator = replicationPlugin.replicators.find(r => r.driver === 'bigquery');
  if (bigqueryReplicator) {
    try {
      const isConnected = await bigqueryReplicator.instance.testConnection();
      console.log(`- BigQuery: ${isConnected ? '✅ Connected' : '❌ Failed'}`);
    } catch (error) {
      console.log(`- BigQuery: ❌ Error - ${error.message}`);
    }
  }

  console.log('\n🎉 BigQuery Replicator Example Completed!');
  console.log('\n📋 Summary of what was replicated:');
  console.log('- users: insert, update, delete → mrt-shortner__users');
  console.log('- urls: insert → mrt-shortner__urls AND mrt-shortner__urls_v2');
  console.log('- clicks: insert → mrt-shortner__clicks');
  console.log('- views: insert → mrt-shortner__views');
  console.log('- shares: insert → mrt-shortner__shares');
  console.log('- scans: insert → mrt-shortner__scans');
  console.log('- All operations logged to: mrt-shortner__replication_log');
}

// Error handling
main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
}); 