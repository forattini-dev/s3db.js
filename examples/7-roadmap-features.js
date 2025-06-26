#!/usr/bin/env node

/**
 * s3db.js Roadmap Features Example
 * 
 * This example demonstrates all the new features from the roadmap:
 * 1. Binary content storage (setContent/getContent)
 * 2. Partition support with rules
 * 3. Schema versioning and definition hashing
 * 4. Extended get method with additional metadata
 */

import { Database } from '../src/index.js';

const connectionString = process.env.BUCKET_CONNECTION_STRING || 's3://localhost:9000/test?accessKeyId=minioadmin&secretAccessKey=minioadmin&forcePathStyle=true';

async function main() {
  console.log('🗺️ s3db.js Roadmap Features Demo\n');

  const db = new Database({
    verbose: true,
    connectionString: connectionString + '/roadmap-demo'
  });

  // Listen for definition changes
  db.on('definitionChanges', (changes) => {
    console.log('📋 Definition changes detected:', changes);
  });

  await db.connect();

  // 1. Binary Content Storage
  console.log('📁 Binary Content Storage');
  console.log('=========================');

  const documents = await db.createResource({
    name: 'documents',
    attributes: {
      title: 'string',
      author: 'string',
      size: 'number|optional'
    }
  });

  const doc = await documents.insert({
    title: 'Sample Document',
    author: 'John Doe'
  });

  console.log('📄 Created document:', doc);

  // Store binary content
  const documentContent = Buffer.from('This is a sample document content with binary data!', 'utf8');
  await documents.setContent(doc.id, documentContent, 'text/plain');
  console.log('💾 Stored binary content for document');

  // Retrieve binary content
  const content = await documents.getContent(doc.id);
  console.log('📖 Retrieved content:', {
    contentLength: content.buffer.length,
    contentType: content.contentType,
    preview: content.buffer.toString('utf8').substring(0, 50) + '...'
  });

  // Check if content exists
  const hasContent = await documents.hasContent(doc.id);
  console.log('✅ Content exists:', hasContent);

  // 2. Partition Support
  console.log('\n🗂️ Partition Support');
  console.log('====================');

  const events = await db.createResource({
    name: 'events',
    attributes: {
      name: 'string',
      eventDate: 'string',
      region: 'string',
      category: 'string'
    },
    options: {
      partitionRules: {
        eventDate: 'date',
        region: 'string|maxlength:5'
      }
    }
  });

  // Insert partitioned data
  const event1 = await events.insert({
    name: 'Tech Conference 2025',
    eventDate: '2025-06-26',
    region: 'US-WEST-COAST',
    category: 'Technology'
  });

  const event2 = await events.insert({
    name: 'Music Festival',
    eventDate: '2025-07-15',
    region: 'EU-CENTRAL',
    category: 'Entertainment'
  });

  console.log('🎪 Created partitioned events:', { event1, event2 });

  // Generate partition path
  const partitionPath = events.generatePartitionPath({
    eventDate: '2025-06-26',
    region: 'US-WEST-COAST'
  });
  console.log('📍 Generated partition path:', partitionPath);

  // Retrieve with partition data
  const retrievedEvent = await events.get(event1.id, {
    eventDate: '2025-06-26',
    region: 'US-WE' // Will be truncated due to maxlength rule
  });
  console.log('🔍 Retrieved partitioned event:', retrievedEvent);

  // 3. Schema Versioning and Definition Hashing
  console.log('\n🔄 Schema Versioning');
  console.log('===================');

  // Get definition hash
  const eventsHash = events.getDefinitionHash();
  console.log('🔢 Events resource definition hash:', eventsHash);

  const documentsHash = documents.getDefinitionHash();
  console.log('🔢 Documents resource definition hash:', documentsHash);

  // Show s3db.json structure
  const s3dbExists = await db.client.exists('s3db.json');
  if (s3dbExists) {
    const s3dbResponse = await db.client.getObject('s3db.json');
    const s3dbContent = JSON.parse(await s3dbResponse.Body.transformToString());
    console.log('📋 s3db.json structure:', {
      version: s3dbContent.version,
      s3dbVersion: s3dbContent.s3dbVersion,
      resourceCount: Object.keys(s3dbContent.resources).length,
      resources: Object.keys(s3dbContent.resources)
    });
  }

  // 4. Extended get Method
  console.log('\n📊 Extended Metadata');
  console.log('====================');

  const extendedDoc = await documents.get(doc.id);
  console.log('📈 Extended document metadata:', {
    id: extendedDoc.id,
    title: extendedDoc.title,
    _contentLength: extendedDoc._contentLength,
    _lastModified: extendedDoc._lastModified,
    mimeType: extendedDoc.mimeType,
    definitionHash: extendedDoc.definitionHash.substring(0, 20) + '...',
    _versionId: extendedDoc._versionId || 'N/A'
  });

  // 5. Complete Workflow Example
  console.log('\n🚀 Complete Workflow Example');
  console.log('============================');

  const users = await db.createResource({
    name: 'users',
    attributes: {
      name: 'string',
      email: 'string',
      region: 'string',
      joinDate: 'string'
    },
    options: {
      timestamps: true,
      partitionRules: {
        region: 'string',
        joinDate: 'date'
      }
    }
  });

  // Create user with partitioning
  const user = await users.insert({
    name: 'Alice Smith',
    email: 'alice@example.com',
    region: 'US',
    joinDate: '2025-06-26'
  });

  console.log('👤 Created user:', user);

  // Store user's profile picture (binary content)
  const profilePicture = Buffer.from('fake-image-data-here', 'utf8');
  await users.setContent(user.id, profilePicture, 'image/jpeg');
  console.log('🖼️ Stored profile picture');

  // Retrieve user with full metadata
  const fullUser = await users.get(user.id, {
    region: user.region,
    joinDate: user.joinDate
  });

  console.log('👤 Full user data:', {
    ...fullUser,
    definitionHash: fullUser.definitionHash.substring(0, 20) + '...'
  });

  // Get profile picture
  const picture = await users.getContent(user.id);
  console.log('🖼️ Retrieved profile picture:', {
    size: picture.buffer.length,
    contentType: picture.contentType
  });

  // 6. Resource Statistics & Path Structure
  console.log('\n📈 Resource Statistics & Path Structure');
  console.log('======================================');

  const documentCount = await documents.count();
  const eventCount = await events.count();
  const userCount = await users.count();

  console.log('📊 Counts:', {
    documents: documentCount,
    events: eventCount,
    users: userCount
  });

  console.log('\n📁 Path Structure Examples:');
  console.log('Standard (with version):', documents.getResourceKey(doc.id));
  console.log('Partitioned (no version):', events.getResourceKey(event1.id, { eventDate: '2025-06-26', region: 'US-WE' }));
  console.log('User partitioned:', users.getResourceKey(user.id, { region: 'US', joinDate: '2025-06-26' }));

  // 7. Automatic Timestamp Partitions
  console.log('\n⏰ Automatic Timestamp Partitions');
  console.log('=================================');

  const meetings = await db.createResource({
    name: 'meetings',
    attributes: {
      title: 'string',
      description: 'string',
      category: 'string'
    },
    options: {
      timestamps: true, // Automatically adds createdAt and updatedAt partitions
      partitionRules: {
        category: 'string|maxlength:8' // Manual partition rule
        // createdAt and updatedAt partitions are automatically added as 'date|maxlength:10'
      }
    }
  });

  console.log('📋 Meeting partition rules:', meetings.options.partitionRules);
  // Should show: { category: 'string|maxlength:8', createdAt: 'date|maxlength:10', updatedAt: 'date|maxlength:10' }

  // Insert meetings with automatic timestamp partitioning
  const meeting1 = await meetings.insert({
    title: 'Technical Review',
    description: 'Quarterly technical review meeting',
    category: 'engineering-review'
  });

  await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for different timestamps

  const meeting2 = await meetings.insert({
    title: 'Budget Planning',
    description: 'Annual budget planning session',
    category: 'finance-planning'
  });

  console.log('📅 Meeting 1:', meeting1);
  console.log('📅 Meeting 2:', meeting2);

  // Demonstrate automatic partition path generation
  const today = meeting1.createdAt.split('T')[0]; // Extract date (YYYY-MM-DD)
  const meetingPartitionPath = meetings.generatePartitionPath({
    category: meeting1.category,
    createdAt: meeting1.createdAt,
    updatedAt: meeting1.updatedAt
  });

  console.log('🗂️ Generated partition path:', meetingPartitionPath);
  // Should be something like: partitions/category=engineer/createdAt=2025-06-26/updatedAt=2025-06-26/

  // List meetings by date partition (automatic)
  const todayMeetings = await meetings.listIds({ createdAt: today });
  console.log('📋 Meetings created today:', todayMeetings);

  // Filter by category and date
  const engineeringMeetingsToday = await meetings.listIds({
    category: 'engineering-review',
    createdAt: today
  });
  console.log('🔧 Engineering meetings today:', engineeringMeetingsToday);

  // Paginate with timestamp partitions
  const meetingPage = await meetings.page(0, 10, { createdAt: today });
  console.log('📄 Page of today\'s meetings:', {
    totalItems: meetingPage.totalItems,
    itemsOnPage: meetingPage.items.length,
    pageInfo: `${meetingPage.page + 1}/${meetingPage.totalPages}`
  });

  // Count meetings by date
  const todayMeetingCount = await meetings.count({ createdAt: today });
  console.log('🔢 Total meetings today:', todayMeetingCount);

  // Add meeting notes (binary content) with timestamp partitions
  const meetingPartitionData = {
    category: meeting1.category,
    createdAt: meeting1.createdAt,
    updatedAt: meeting1.updatedAt
  };

  const meetingNotes = Buffer.from('Meeting notes: Discussed Q4 objectives, performance metrics, and team structure...', 'utf8');
  await meetings.setContent(meeting1.id, meetingNotes, 'text/plain', meetingPartitionData);

  // Verify content with partitions
  const hasNotes = await meetings.hasContent(meeting1.id, meetingPartitionData);
  console.log('📝 Meeting has notes:', hasNotes);

  const notes = await meetings.getContent(meeting1.id, meetingPartitionData);
  console.log('📖 Retrieved notes preview:', notes.buffer.toString('utf8').substring(0, 50) + '...');

  // Get enhanced metadata including partition info
  const meetingWithMetadata = await meetings.get(meeting1.id, meetingPartitionData);
  console.log('📊 Meeting with full metadata:', {
    id: meetingWithMetadata.id,
    title: meetingWithMetadata.title,
    createdAt: meetingWithMetadata.createdAt,
    _hasContent: meetingWithMetadata._hasContent,
    _contentLength: meetingWithMetadata._contentLength,
    definitionHash: meetingWithMetadata.definitionHash.substring(0, 16) + '...'
  });

  console.log('\n✅ All roadmap features working! 🎉');
  console.log('Binary content, partitions, versioning, automatic timestamp partitions - everything is ready!');
}

main().catch(console.error);