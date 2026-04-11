// middleware/auth.js
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  console.log("🔐 AUTH MIDDLEWARE");
  console.log("🔐 URL:", req.url);
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log("❌ No token provided");
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token decoded:", {
      id: decoded.id,
      tenant_id: decoded.tenant_id,
      tenantId: decoded.tenantId,
      email: decoded.email
    });
    // Get tenant_id from either field name
    const tenantId = decoded.tenant_id || decoded.tenantId;
    if (!tenantId) {
      console.error('❌ Token missing tenant_id');
      return res.status(401).json({
        success: false,
        message: 'Invalid token - missing tenant information'
      });
    }
    // Set user with BOTH field names for compatibility
    req.user = {
      id: decoded.id || decoded._id,
      _id: decoded.id || decoded._id,
      tenant_id: tenantId,
      tenantId: tenantId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      phone_number: decoded.phone_number,
      company_name: decoded.company_name
    };
    console.log("✅ Auth successful:", {
      userId: req.user.id,
      tenant_id: req.user.tenant_id
    });
    next();
  } catch (error) {
    console.error('❌ Auth error:', error.name, error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please login again.',
        expired: true
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.',
        invalid: true
      });
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed'
      });
    }
  }
};

// Export as both default and named exports
module.exports = authMiddleware;
module.exports.authenticateToken = authMiddleware;
module.exports.auth = authMiddleware;
