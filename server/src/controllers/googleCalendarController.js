const { google } = require('googleapis');
const User = require('../models/User');

const getOauth2Client = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        'https://bot.gowhats.in/api/calendar/oauth/callback' // PRODUCTION CALLBACK URL
    );
};

// Initiate Google Login
exports.getAuthUrl = (req, res) => {
    const oauth2Client = getOauth2Client();
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for getting the refresh_token
        prompt: 'consent select_account', // Forces consent screen & forces account chooser every time
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        state: req.user._id.toString() // Pass user ID as state to grab it on callback
    });
    res.json({ url: authUrl });
};

// Handle OAuth Callback
exports.oauthCallback = async (req, res) => {
    try {
        const { code, state: userId } = req.query;

        if (!code || !userId) {
            return res.status(400).send('Missing code or state parameter.');
        }

        const oauth2Client = getOauth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        // Save tokens to User model
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send('User not found.');
        }

        user.googleCalendarTokens = tokens;
        await user.save();

        // Redirect back to frontend Settings page with success parameter
        res.redirect(`https://bot.gowhats.in/settings?calendarConnected=true`);
    } catch (error) {
        console.error('Error in OAuth callback:', error);
        res.redirect(`https://bot.gowhats.in/settings?calendarConnected=false`);
    }
};

// Status Check for specific user
exports.getStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const isConnected = !!user?.googleCalendarTokens?.refresh_token;
        let email = null;

        if (isConnected) {
            try {
                const oauth2Client = getOauth2Client();
                oauth2Client.setCredentials(user.googleCalendarTokens);
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                const response = await calendar.calendars.get({ calendarId: 'primary' });
                email = response.data.id; // The primary calendar ID is the user's Google email
            } catch (err) {
                console.error('Failed to fetch calendar email:', err.message);
            }
        }

        res.json({ isConnected, email });
    } catch (error) {
        console.error('Error fetching calendar status:', error);
        res.status(500).json({ error: 'Failed to fetch status' });
    }
};

// Disconnect Calendar
exports.disconnect = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.googleCalendarTokens = null;
        await user.save();
        res.json({ message: 'Disconnected successfully.' });
    } catch (error) {
        console.error('Error disconnecting calendar:', error);
        res.status(500).json({ error: 'Failed to disconnect.' });
    }
}

// Create Event
exports.createEvent = async (req, res) => {
    try {
        const { summary, description, startDateTime, endDateTime } = req.body;
        const user = await User.findById(req.user._id);

        if (!user || !user.googleCalendarTokens) {
            return res.status(401).json({ error: 'Google Calendar not connected.' });
        }

        const oauth2Client = getOauth2Client();
        oauth2Client.setCredentials(user.googleCalendarTokens);

        // Auto-refresh token if expired handled internally by googleapis when refresh_token is present

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const event = {
            summary,
            description,
            start: {
                dateTime: new Date(startDateTime).toISOString(),
            },
            end: {
                dateTime: new Date(endDateTime).toISOString(),
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });

        res.status(200).json({
            message: 'Event created successfully!',
            eventUrl: response.data.htmlLink
        });

    } catch (error) {
        console.error('Error creating calendar event:', error);
        res.status(500).json({ error: 'Failed to create event. Check if tokens are expired.' });
    }
};

// Fetch upcoming Events
exports.getEvents = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.googleCalendarTokens) return res.status(401).json({ error: 'Not connected' });

        const oauth2Client = getOauth2Client();
        oauth2Client.setCredentials(user.googleCalendarTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const now = new Date();
        const response = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            maxResults: 10,
            singleEvents: true,
            orderBy: 'startTime',
        });

        res.json({ events: response.data.items });
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
};
