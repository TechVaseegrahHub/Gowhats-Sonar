const Tenant = require('./src/models/Tenant');
require('dotenv').config();
const mongoose = require('mongoose');

async function debugKeys() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://techvaseegrah:I6KMVhe5Ru6OsJ7N@gowhats.u2mth.mongodb.net/GoWhats_test?retryWrites=true&w=majority&appName=gowhats');
  
  const tenant = await Tenant.findById('e1c69d55-5073-4f08-91bf-633648ad06b0');
  
  console.log('Keys in database:');
  console.log('Public key starts with:', tenant.flowConfig.publicKey.substring(0, 50));
  console.log('Private key starts with:', tenant.flowConfig.privateKey.substring(0, 50));
  console.log('Passphrase:', tenant.flowConfig.passphrase);
  console.log('App Secret:', tenant.flowConfig.appSecret);
  
  process.exit(0);
}

debugKeys();
