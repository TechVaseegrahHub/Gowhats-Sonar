const auth = require('./auth');
const apiKeyAuth = require('./apiKeyAuth');

const authOrApiKey = (requiredPermissions = []) => {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const isApiKey = authHeader && authHeader.startsWith('Bearer gw_');

    if (isApiKey) {
      // Use API key auth
      return apiKeyAuth(requiredPermissions)(req, res, next);
    } else {
      // Use JWT auth
      return auth(req, res, next);
    }
  };
};

module.exports = authOrApiKey;
