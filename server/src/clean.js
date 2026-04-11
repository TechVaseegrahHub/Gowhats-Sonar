const mongoose = require('mongoose');

const uri = "mongodb+srv://techvaseegrah:gowhats$tech2k25@gowhats.toqv1xm.mongodb.net/gowhats?retryWrites=true&w=majority&appName=Gowhats";

mongoose.connect(uri).then(async () => {
  console.log('Connected to MongoDB');
  
  // Delete pending carts
  const result1 = await mongoose.connection.db.collection('abandonedcarts').deleteMany({ status: 'pending' });
  console.log(`Deleted ${result1.deletedCount} pending carts`);
  
  // Enable abandoned cart
  const result2 = await mongoose.connection.db.collection('integrations').updateOne(
    { storeType: 'shopify' },
    { $set: { isAbandonedCartEnabled: true } }
  );
  console.log('Updated integration:', result2.modifiedCount);
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
