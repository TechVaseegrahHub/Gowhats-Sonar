// middleware/auth.js
const jwt = require('jsonwebtoken');

const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => { if (isDev) console.log(...args); };
const logError = (...args) => { if (isDev) console.error(...args); };

const authMiddleware = (req, res, next) => {
  log('🔐 AUTH MIDDLEWARE');
  log('🔐 URL:', req.url);

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      log('❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    log('✅ Token decoded:', {
      id: decoded.id,
      tenant_id: decoded.tenant_id,
      email: decoded.email
    });

    const tenantId = decoded.tenant_id || decoded.tenantId;
    if (!tenantId) {
      logError('❌ Token missing tenant_id');
      return res.status(401).json({
        success: false,
        message: 'Invalid token - missing tenant information'
      });
    }

    req.user = {
      id: decoded.id || decoded._id,
      _id: decoded.id || decoded._id,
      tenant_id: tenantId,
      tenantId: tenantId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      phone_number: decoded.phone_number,
      company_name: decoded.company_name,
      shopify_shop: decoded.shopify_shop,
      auth_source: decoded.auth_source
    };

    log('✅ Auth successful:', { userId: req.user.id, tenant_id: req.user.tenant_id });
    next();

  } catch (error) {
    logError('❌ Auth error:', error.name, error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        expired: true
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
        invalid: true
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};


const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin role required'
    });
  }
  next();
};

module.exports = authMiddleware;
module.exports.authenticateToken = authMiddleware;
module.exports.auth = authMiddleware;
module.exports.authenticate = authMiddleware;  
module.exports.requireAdmin = requireAdmin;
