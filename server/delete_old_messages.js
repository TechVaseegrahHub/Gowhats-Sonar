const mongoose = require('mongoose');

const MONGODB_URI = "mongodb+srv://techvaseegrah:gowhats$tech2k25@gowhats.toqv1xm.mongodb.net/gowhats?retryWrites=true&w=majority&appName=Gowhats";
const TENANT_ID = "7d464436-b263-4cff-b2e7-cd89c06953c6";

const FROM_DATE = new Date("2025-01-01T00:00:00.000Z");  // start of 2025
const TO_DATE   = new Date("2026-01-01T00:00:00.000Z");  // start of 2026

async function delete2025Messages() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected!\n");

    const collection = mongoose.connection.collection('messages');

    const count = await collection.countDocuments({
      tenantId: TENANT_ID,
      timestamp: { $gte: FROM_DATE, $lt: TO_DATE }
    });

    console.log(`Found ${count} messages from 2025 for tenant ${TENANT_ID}`);

    if (count === 0) {
      console.log("Nothing to delete.");
      await mongoose.disconnect();
      return;
    }

    console.log(`Deleting ${count} messages...`);
    const result = await collection.deleteMany({
      tenantId: TENANT_ID,
      timestamp: { $gte: FROM_DATE, $lt: TO_DATE }
    });

    console.log(`\n✅ Successfully deleted ${result.deletedCount} messages.`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected.");
  }
}

delete2025Messages();
