#!/usr/bin/env node

/**
 * Example: Backup and Restore CLI Usage
 * 
 * This example demonstrates how to use the S3DB CLI restore command
 * to recover data from backups created by the BackupPlugin.
 */

import { S3db } from '../src/index.js';
import { BackupPlugin } from '../src/plugins/backup.plugin.js';

async function example() {
  console.log('=== S3DB Backup & Restore CLI Example ===\n');

  // Create database instance
  const db = new S3db({
    connectionString: 'http://test:test@localhost:4566/test-bucket'
  });

  try {
    await db.connect();
    console.log('✓ Connected to S3DB');

    // Install backup plugin
    const backupPlugin = new BackupPlugin({
      destinations: [
        {
          type: 'filesystem',
          path: './tmp/backups/{date}/'
        }
      ],
      compression: 'gzip',
      verbose: true
    });

    await db.installPlugin(backupPlugin);
    console.log('✓ BackupPlugin installed');

    // Create test resource
    const users = await db.createResource({
      name: 'users',
      attributes: {
        name: 'string|required',
        email: 'string|required',
        department: 'string|required'
      }
    });

    // Insert test data
    await users.insert({ name: 'Alice', email: 'alice@example.com', department: 'Engineering' });
    await users.insert({ name: 'Bob', email: 'bob@example.com', department: 'Marketing' });
    console.log('✓ Test data inserted');

    // Create backup
    console.log('\n--- Creating Backup ---');
    const backup = await backupPlugin.backup('full');
    console.log(`✓ Backup created: ${backup.id}`);

    // List available backups
    console.log('\n--- Available Backups ---');
    const backups = await backupPlugin.listBackups({ limit: 5 });
    backups.forEach(b => {
      console.log(`  ${b.id} (${b.type}) - ${new Date(b.timestamp).toLocaleString()}`);
    });

    console.log('\n--- CLI Usage Examples ---');
    
    console.log('🔄 BACKUP COMMANDS:');
    console.log('Create full backup:');
    console.log(`  s3db backup full --connection "http://test:test@localhost:4566/test-bucket"`);
    
    console.log('\nCreate incremental backup:');
    console.log(`  s3db backup incremental --connection "..."`);
    
    console.log('\nBackup specific resources:');
    console.log(`  s3db backup --resources "users,orders" --connection "..."`);
    
    console.log('\nList available backups:');
    console.log(`  s3db backup --list --connection "..."`);
    
    console.log('\nGet backup status:');
    console.log(`  s3db backup --status "${backup.id}" --connection "..."`);

    console.log('\n📥 RESTORE COMMANDS:');
    console.log('List available backups:');
    console.log(`  s3db restore --list-backups --connection "..."`);
    
    console.log('\nRestore from backup:');
    console.log(`  s3db restore "${backup.id}" --connection "..."`);
    
    console.log('\nRestore specific resources only:');
    console.log(`  s3db restore "${backup.id}" --resources "users,orders" --connection "..."`);
    
    console.log('\nRestore with overwrite:');
    console.log(`  s3db restore "${backup.id}" --overwrite --connection "..."`);

    console.log('\n--- CLI Command Reference ---');
    console.log('📦 BACKUP:');
    console.log('  s3db backup [full|incremental]    # Create backup');
    console.log('  s3db backup --list                # List all backups');
    console.log('  s3db backup --status <id>         # Get backup status');
    console.log('  s3db backup -r users,orders       # Backup specific resources');
    
    console.log('\n📥 RESTORE:');
    console.log('  s3db restore <backupId>           # Restore from backup');
    console.log('  s3db restore --list-backups       # List available backups');
    console.log('  s3db restore <id> --overwrite     # Overwrite existing records');
    console.log('  s3db restore <id> -r users,orders # Restore specific resources');

    // Test restore functionality
    console.log('\n--- Testing Restore ---');
    const result = await backupPlugin.restore(backup.id, { overwrite: true });
    console.log(`✓ Restore completed: ${result.restored.join(', ')}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.disconnect();
    console.log('\n✓ Disconnected from S3DB');
  }
}

example().catch(console.error);