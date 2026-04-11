const express = require('express');
const router = express.Router();
const googleCalendarController = require('../controllers/googleCalendarController');
const auth = require('../middleware/auth');

// OAuth Endpoints
router.get('/auth-url', auth, googleCalendarController.getAuthUrl);
router.get('/oauth/callback', googleCalendarController.oauthCallback); // No auth here, Google redirection back

// Event & Status Endpoints 
router.get('/status', auth, googleCalendarController.getStatus);
router.get('/events', auth, googleCalendarController.getEvents);
router.post('/disconnect', auth, googleCalendarController.disconnect);
router.post('/create-event', auth, googleCalendarController.createEvent);

module.exports = router;
