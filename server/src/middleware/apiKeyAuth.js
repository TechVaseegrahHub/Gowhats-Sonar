const ApiKey = require('../models/ApiKey');
const ApiKeyUsage = require('../models/ApiKeyUsage');

/**
 * Middleware to authenticate API key requests
 */
const apiKeyAuth = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      // Extract API key from header
      const authHeader = req.headers['authorization'];
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Please provide an API key in the Authorization header as "Bearer YOUR_API_KEY"'
        });
      }
      
      const key = authHeader.substring(7); // Remove "Bearer " prefix
      
      // Verify API key
      const apiKey = await ApiKey.verifyKey(key);
      
      if (!apiKey) {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid, expired, or has been revoked'
        });
      }
      
      // Check IP whitelist if configured
      if (apiKey.ipWhitelist && apiKey.ipWhitelist.length > 0) {
        const clientIp = req.ip || req.connection.remoteAddress;
        if (!apiKey.ipWhitelist.includes(clientIp)) {
          return res.status(403).json({
            error: 'IP not whitelisted',
            message: 'Your IP address is not authorized to use this API key'
          });
        }
      }
      
      // Check rate limits
      const rateLimitCheck = await apiKey.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: rateLimitCheck.reason
        });
      }
      
      // Check permissions
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission => 
          apiKey.hasPermission(permission)
        );
        
        if (!hasAllPermissions) {
          return res.status(403).json({
            error: 'Insufficient permissions',
            message: `This API key does not have the required permissions: ${requiredPermissions.join(', ')}`
          });
        }
      }
      
      // Attach tenant and API key info to request
      req.apiKey = apiKey;
      req.user = { tenant_id: apiKey.tenantId };
      
      // Log usage (async, don't wait)
      const startTime = Date.now();
      
      res.on('finish', async () => {
        try {
          await ApiKeyUsage.create({
            apiKeyId: apiKey._id,
            tenantId: apiKey.tenantId,
            endpoint: req.path,
            method: req.method,
            statusCode: res.statusCode,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'],
            responseTime: Date.now() - startTime
          });
        } catch (error) {
          console.error('Error logging API key usage:', error);
        }
      });
      
      next();
      
    } catch (error) {
      console.error('API key authentication error:', error);
      res.status(500).json({
        error: 'Authentication error',
        message: 'An error occurred while authenticating your request'
      });
    }
  };
};

module.exports = apiKeyAuth;
