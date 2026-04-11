// scripts/optimizeDatabase.js - SAFE VERSION
const mongoose = require('mongoose');
require('dotenv').config();

async function optimizeDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // ✅ STEP 1: Check existing data (safety check)
    console.log('\n📊 Current Database State:');
    const contactsCount = await db.collection('contacts').countDocuments();
    const messagesCount = await db.collection('messages').countDocuments();
    
    console.log(`Contacts: ${contactsCount}`);
    console.log(`Messages: ${messagesCount}`);
    
    if (contactsCount === 0 || messagesCount === 0) {
      console.warn('⚠️  Warning: Collections seem empty. Please verify before proceeding.');
    }

    // ✅ STEP 2: Check existing indexes
    console.log('\n🔍 Checking Existing Indexes...');
    const contactIndexes = await db.collection('contacts').indexes();
    const messageIndexes = await db.collection('messages').indexes();
    
    console.log('Contact Indexes:', contactIndexes.map(i => i.name).join(', '));
    console.log('Message Indexes:', messageIndexes.map(i => i.name).join(', '));

    // ✅ STEP 3: Ask for confirmation
    console.log('\n⚠️  This script will CREATE new indexes (no data will be deleted)');
    console.log('This is a SAFE operation but may take a few minutes on large collections.');
    
    // Auto-proceed in production, or you can add readline for manual confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const proceed = await new Promise(resolve => {
      readline.question('\nProceed with index creation? (yes/no): ', answer => {
        readline.close();
        resolve(answer.toLowerCase() === 'yes');
      });
    });

    if (!proceed) {
      console.log('❌ Operation cancelled by user');
      process.exit(0);
    }

    // ✅ STEP 4: Create CONTACTS indexes
    console.log('\n📝 Creating Contact Indexes...');
    
    const contactIndexesToCreate = [
      {
        keys: { tenantId: 1, phone_number: 1 },
        options: { name: 'tenant_phone_unique', unique: true, background: true }
      },
      {
        keys: { tenantId: 1, timestamp: -1 },
        options: { name: 'tenant_timestamp', background: true }
      },
      {
        keys: { tenantId: 1, unreadCount: -1 },
        options: { 
          name: 'tenant_unread', 
          background: true,
          partialFilterExpression: { unreadCount: { $gt: 0 } }
        }
      },
      {
        keys: { tenantId: 1, humanAgentRequested: 1 },
        options: { 
          name: 'tenant_human_agent', 
          background: true,
          partialFilterExpression: { humanAgentRequested: true }
        }
      },
      {
        keys: { tenantId: 1, tags: 1 },
        options: { name: 'tenant_tags', background: true }
      }
    ];

    for (const idx of contactIndexesToCreate) {
      try {
        await db.collection('contacts').createIndex(idx.keys, idx.options);
        console.log(`  ✅ Created: ${idx.options.name}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️  Index ${idx.options.name} already exists (skipping)`);
        } else {
          console.error(`  ❌ Failed: ${idx.options.name}`, error.message);
        }
      }
    }

    // ✅ STEP 5: Create MESSAGES indexes
    console.log('\n📝 Creating Message Indexes...');
    
    const messageIndexesToCreate = [
      {
        keys: { tenantId: 1, from: 1, timestamp: -1 },
        options: { name: 'tenant_from_time', background: true }
      },
      {
        keys: { tenantId: 1, to: 1, timestamp: -1 },
        options: { name: 'tenant_to_time', background: true }
      },
      {
        keys: { tenantId: 1, timestamp: -1, _id: -1 },
        options: { name: 'tenant_time_id', background: true }
      },
      {
        keys: { tenantId: 1, messageId: 1 },
        options: { name: 'tenant_message_id', background: true }
      }
    ];

    for (const idx of messageIndexesToCreate) {
      try {
        await db.collection('messages').createIndex(idx.keys, idx.options);
        console.log(`  ✅ Created: ${idx.options.name}`);
      } catch (error) {
        if (error.code === 85 || error.code === 86) {
          console.log(`  ⚠️  Index ${idx.options.name} already exists (skipping)`);
        } else {
          console.error(`  ❌ Failed: ${idx.options.name}`, error.message);
        }
      }
    }

    // ✅ STEP 6: Verify index creation
    console.log('\n✅ Verification:');
    const newContactIndexes = await db.collection('contacts').indexes();
    const newMessageIndexes = await db.collection('messages').indexes();
    
    console.log(`Contact Indexes: ${newContactIndexes.length} total`);
    console.log(`Message Indexes: ${newMessageIndexes.length} total`);

    // ✅ STEP 7: Show statistics
    console.log('\n📊 Collection Statistics:');
    const contactsStats = await db.collection('contacts').stats();
    const messagesStats = await db.collection('messages').stats();
    
    console.log('Contacts:', {
      count: contactsStats.count,
      size: `${Math.round(contactsStats.size / 1024 / 1024)}MB`,
      indexes: contactsStats.nindexes
    });
    
    console.log('Messages:', {
      count: messagesStats.count,
      size: `${Math.round(messagesStats.size / 1024 / 1024)}MB`,
      indexes: messagesStats.nindexes
    });

    console.log('\n✅ Database optimization complete!');
    console.log('⚠️  Note: Indexes are built in background and may take time to complete on large collections');
    
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Optimization failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run only if executed directly
if (require.main === module) {
  optimizeDatabase();
}

module.exports = optimizeDatabase;
