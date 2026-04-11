// middleware/tenantMiddleware.js
const Tenant = require('../models/Tenant');

const checkTenant = async (req, res, next) => {
  try {
    // Get tenant ID from multiple sources
    const tenantId = req.user?.tenant_id || 
                    req.user?.tenantId ||
                    req.headers['x-tenant-id'] || 
                    req.query.tenant_id ||
                    req.body.tenant_id;

    console.log('🔍 Tenant Check:', {
      url: req.url,
      method: req.method,
      tenantId: tenantId,
      userTenantId: req.user?.tenant_id,
      userTenantIdAlt: req.user?.tenantId,
      userId: req.user?.id
    });

    if (!tenantId) {
      console.error('❌ No tenant ID found');
      return res.status(400).json({
        success: false,
        message: 'Tenant ID is required'
      });
    }

    // Check if tenant exists
    let tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      console.log('⚠️ Tenant not found, creating:', tenantId);
      
      try {
        tenant = await Tenant.create({
          _id: tenantId,
          name: `Tenant ${tenantId.substring(0, 8)}`,
          createdAt: new Date()
        });
        
        console.log('✅ Tenant created:', tenant._id);
      } catch (createError) {
        if (createError.code === 11000) {
          tenant = await Tenant.findById(tenantId);
          console.log('✅ Tenant found after race condition');
        } else {
          throw createError;
        }
      }
    }

    if (!tenant) {
      console.error('❌ Failed to create/find tenant');
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize tenant'
      });
    }

    // Attach tenant to request
    req.tenant = tenant;
    req.tenantId = tenantId;

    console.log('✅ Tenant check passed:', {
      tenantId: tenant._id,
      hasWhatsAppConfig: !!tenant.whatsappConfig
    });

    next();
  } catch (error) {
    console.error('❌ Tenant middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify tenant',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal error'
    });
  }
};

module.exports = checkTenant;
