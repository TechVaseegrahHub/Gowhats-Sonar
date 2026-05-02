const { MongoClient } = require("mongodb");

const MONGODB_URI =
  "mongodb+srv://techvaseegrah:gowhats$tech2k25@gowhats.toqv1xm.mongodb.net/gowhats?retryWrites=true&w=majority&appName=Gowhats";

async function fixVisitWebsiteUrl() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("gowhats");
    const collection = db.collection("botconfigurations");

    // 1. Show BEFORE state
    const before = await collection.find({}).toArray();
    console.log("\n📋 BEFORE FIX:");
    before.forEach((doc) => {
      console.log(`  tenant_id: ${doc.tenant_id}`);
      doc.workflowMessages?.forEach((msg) => {
        if (msg.workflow === "Visit Website") {
          console.log(`    workflowMessages[Visit Website].message: ${msg.message}`);
          console.log(`    workflowMessages[Visit Website].url:     ${msg.url}`);
        }
      });
      doc.workflows?.forEach((wf) => {
        if (wf.workflow === "Visit Website") {
          console.log(`    workflows[Visit Website].url: ${wf.url}`);
        }
      });
    });

    // 2. Fix workflowMessages — clear srfoodproducts from message text and url field
    const result1 = await collection.updateMany(
      { "workflowMessages.workflow": "Visit Website" },
      {
        $set: {
          "workflowMessages.$[elem].message":
            "Click the link below to visit our website! 🙏",
          "workflowMessages.$[elem].url": null,
          "workflowMessages.$[elem].isCustomized": false,
        },
      },
      {
        arrayFilters: [{ "elem.workflow": "Visit Website" }],
      }
    );
    console.log(`\n✅ workflowMessages fixed: ${result1.modifiedCount} document(s)`);

    // 3. Fix workflows array url field too
    const result2 = await collection.updateMany(
      { "workflows.workflow": "Visit Website" },
      {
        $set: {
          "workflows.$[elem].url": null,
        },
      },
      {
        arrayFilters: [{ "elem.workflow": "Visit Website" }],
      }
    );
    console.log(`✅ workflows[].url cleared: ${result2.modifiedCount} document(s)`);

    // 4. Show AFTER state
    const after = await collection.find({}).toArray();
    console.log("\n📋 AFTER FIX:");
    after.forEach((doc) => {
      console.log(`  tenant_id: ${doc.tenant_id}`);
      doc.workflowMessages?.forEach((msg) => {
        if (msg.workflow === "Visit Website") {
          console.log(`    workflowMessages[Visit Website].message: ${msg.message}`);
          console.log(`    workflowMessages[Visit Website].url:     ${msg.url}`);
        }
      });
      doc.workflows?.forEach((wf) => {
        if (wf.workflow === "Visit Website") {
          console.log(`    workflows[Visit Website].url: ${wf.url}`);
        }
      });
    });

    console.log("\n🎉 Done! srfoodproducts URL has been removed from all documents.");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await client.close();
    console.log("🔌 Connection closed.");
  }
}

fixVisitWebsiteUrl();
