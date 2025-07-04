import { Database } from '../src/index.js';
import { setupDatabase, teardownDatabase } from './database.js';

// Example demonstrating partition reference updates when partition fields change
async function testPartitionReferenceUpdate() {
  console.log('🚀 Testing partition reference updates...\n');

  const db = new Database({
    bucket: 'test-bucket',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    }
  });

  // Create a resource with multiple partitions
  await db.createResource({
    name: 'clicks',
    behavior: 'body-overflow',
    timestamps: true,
    attributes: {
      sessionId: 'string',
      urlId: 'string',
      ip: 'string',
      utm: 'object',
      queryParams: 'string|optional',
      userAgent: 'string|optional',
      userAgentData: 'object|optional',
    },
    partitions: {
      byUrlId: {
        fields: { urlId: 'string' }
      },
      bySessionId: {
        fields: { sessionId: 'string' }
      },
      byUtmSource: {
        fields: { 'utm.source': 'string' }
      },
      byUtmCampaign: {
        fields: { 'utm.campaign': 'string' }
      },
      byUtmMedium: {
        fields: { 'utm.medium': 'string' }
      },
      byUtmContent: {
        fields: { 'utm.content': 'string' }
      },
      byUtmTerm: {
        fields: { 'utm.term': 'string' }
      }
    }
  });

  const clicks = db.resources.clicks;

  console.log('📝 Step 1: Insert initial click with UTM source "email"');
  
  const initialClick = await clicks.insert({
    id: 'click-1',
    sessionId: 'session-123',
    urlId: 'url-456',
    ip: '192.168.1.1',
    utm: {
      source: 'email',
      campaign: 'welcome',
      medium: 'email',
      content: 'header',
      term: 'newsletter'
    },
    userAgent: 'Mozilla/5.0...'
  });

  console.log('✅ Inserted click:', {
    id: initialClick.id,
    utmSource: initialClick.utm.source,
    utmCampaign: initialClick.utm.campaign
  });

  // Verify partition references exist
  console.log('\n🔍 Step 2: Verify partition references exist');
  
  try {
    const fromUtmSourcePartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmSource',
      partitionValues: { 'utm.source': 'email' }
    });
    console.log('✅ Found in byUtmSource partition:', fromUtmSourcePartition.utm.source);
  } catch (error) {
    console.log('❌ Not found in byUtmSource partition:', error.message);
  }

  try {
    const fromUtmCampaignPartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'welcome' }  } finally {
    await teardownDatabase();
  }
    });
    console.log('✅ Found in byUtmCampaign partition:', fromUtmCampaignPartition.utm.campaign);
  } catch (error) {
    console.log('❌ Not found in byUtmCampaign partition:', error.message);
  }

  console.log('\n🔄 Step 3: Update UTM source from "email" to "hsm"');
  
  const updatedClick = await clicks.update('click-1', {
    utm: {
      source: 'hsm',
      campaign: 'retargeting', // Also changing campaign
      medium: 'social',
      content: 'sidebar',
      term: 'ads'
    }
  });

  console.log('✅ Updated click:', {
    id: updatedClick.id,
    utmSource: updatedClick.utm.source,
    utmCampaign: updatedClick.utm.campaign
  });

  console.log('\n🔍 Step 4: Verify old partition references are removed');
  
  try {
    const oldUtmSourcePartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmSource',
      partitionValues: { 'utm.source': 'email' }
    });
    console.log('❌ Old reference still exists (should not happen):', oldUtmSourcePartition.utm.source);
  } catch (error) {
    console.log('✅ Old byUtmSource reference correctly removed:', error.message);
  }

  try {
    const oldUtmCampaignPartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'welcome' }
    });
    console.log('❌ Old reference still exists (should not happen):', oldUtmCampaignPartition.utm.campaign);
  } catch (error) {
    console.log('✅ Old byUtmCampaign reference correctly removed:', error.message);
  }

  console.log('\n🔍 Step 5: Verify new partition references are created');
  
  try {
    const newUtmSourcePartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmSource',
      partitionValues: { 'utm.source': 'hsm' }
    });
    console.log('✅ Found in new byUtmSource partition:', newUtmSourcePartition.utm.source);
  } catch (error) {
    console.log('❌ Not found in new byUtmSource partition:', error.message);
  }

  try {
    const newUtmCampaignPartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUtmCampaign',
      partitionValues: { 'utm.campaign': 'retargeting' }
    });
    console.log('✅ Found in new byUtmCampaign partition:', newUtmCampaignPartition.utm.campaign);
  } catch (error) {
    console.log('❌ Not found in new byUtmCampaign partition:', error.message);
  }

  console.log('\n🔍 Step 6: Verify unchanged partition references still exist');
  
  try {
    const urlIdPartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'byUrlId',
      partitionValues: { urlId: 'url-456' }
    });
    console.log('✅ byUrlId partition reference unchanged:', urlIdPartition.urlId);
  } catch (error) {
    console.log('❌ byUrlId partition reference lost:', error.message);
  }

  try {
    const sessionIdPartition = await clicks.getFromPartition({
      id: 'click-1',
      partitionName: 'bySessionId',
      partitionValues: { sessionId: 'session-123' }
    });
    console.log('✅ bySessionId partition reference unchanged:', sessionIdPartition.sessionId);
  } catch (error) {
    console.log('❌ bySessionId partition reference lost:', error.message);
  }

  console.log('\n🎉 Partition reference update test completed!');
}

// Run the test
testPartitionReferenceUpdate().catch(console.error); 