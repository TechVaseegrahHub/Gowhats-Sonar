const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Referral authentication required'
      });
    }

    const decoded = jwt.verify(token, process.env.REFERRAL_JWT_SECRET || process.env.JWT_SECRET);
    req.referralPartner = {
      id: decoded.id,
      email: decoded.email,
      businessName: decoded.businessName,
      phoneNumber: decoded.phoneNumber,
      referralCode: decoded.referralCode
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired referral session'
    });
  }
};

