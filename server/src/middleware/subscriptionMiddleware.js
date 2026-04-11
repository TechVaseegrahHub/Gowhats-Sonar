const Tenant = require('../models/Tenant');
const { canAccessModule, TRIAL_DAYS } = require('../services/subscriptionService');

const FEATURE_LABELS = {
  broadcast: 'Broadcast Manager',
  packing: 'Packing module',
  tracking: 'Tracking module',
  holding: 'Holding module'
};

const requireProModule = (moduleKey) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user?.tenant_id || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      }

      let tenant = req.tenant || await Tenant.findById(tenantId);
      if (!tenant) {
       const now = new Date();
        const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
        tenant = await Tenant.create({
          _id: tenantId,
          name: `Tenant ${String(tenantId).slice(0, 8)}`,
          subscription: {
            plan: 'free_trial',
            trialStartedAt: now,
            trialEndsAt
          }
        });
      }

      const access = canAccessModule(tenant, moduleKey);
      req.subscription = access.subscription;

      if (access.allowed) {
        return next();
      }

      const label = FEATURE_LABELS[moduleKey] || 'This feature';
      return res.status(403).json({
        success: false,
        code: 'PRO_PLAN_REQUIRED',
        feature: moduleKey,
        plan: access.subscription.plan,
        message: `${label} is available only on Pro plan.`,
        upgradeMessage: 'Unlock this feature by upgrading to Pro plan.'
      });
    } catch (error) {
      console.error('Subscription middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to validate subscription'
      });
    }
  };
};

module.exports = {
  requireProModule
};

