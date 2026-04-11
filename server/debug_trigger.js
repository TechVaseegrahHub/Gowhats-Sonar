const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Settings = require('./src/models/settings');
  const Tenant = require('./src/models/Tenant');

  const setting = await Settings.findOne({}).lean();
  const tenantId = setting.tenant_id;

  console.log('tenantId:', tenantId);
  console.log('enabled:', setting?.automationConfig?.dailySalesAlert?.enabled);
  console.log('contacts:', setting?.automationConfig?.dailySalesAlert?.contacts?.length);

  const tenant = await Tenant.findById(tenantId).lean();
  console.log('tenant found:', !!tenant);
  console.log('accessToken exists:', !!tenant?.whatsappConfig?.accessToken);

  process.exit();
});
