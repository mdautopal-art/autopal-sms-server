require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Load Environment Variables
const credentials = {
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME,
};
const API_SECRET_KEY = process.env.API_SECRET_KEY;

// Fail fast if misconfigured
if (!credentials.apiKey || !credentials.username || !API_SECRET_KEY) {
    console.error('ERROR: AT_API_KEY, AT_USERNAME, and API_SECRET_KEY must be set in environment!');
    process.exit(1);
}

// Initialize Africa's Talking
const AfricasTalking = require('africastalking')(credentials);
const sms = AfricasTalking.SMS;
const appLogic = AfricasTalking.APPLICATION;

// Security Middleware
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const secretFromPayload = req.body.secret || req.query.secret;

    let providedKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedKey = authHeader.substring(7);
    } else if (secretFromPayload) {
        providedKey = secretFromPayload;
    }

    if (providedKey !== API_SECRET_KEY) {
        console.warn('Blocked unauthorized request');
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Secret Key' });
    }
    next();
}

// --- GLOBAL SMS DISPATCH ENDPOINT ---
// Accepts: { "recipients": ["0712345678", "+254700000000"], "message": "Your rent is due." }
app.post('/api/send-global-sms', authenticate, async (req, res) => {
    const { recipients, message } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
        return res.status(400).json({ error: 'Invalid payload. Requires an array of "recipients" and a "message" string.' });
    }

    // Clean and auto-format phone numbers (Defaults to Kenya format if starts with 0)
    const formattedRecipients = recipients.map(phone => {
        let p = phone.toString().trim();
        if (p.startsWith('0')) {
            return '+254' + p.substring(1);
        }
        return p;
    });

    try {
        const response = await sms.send({
            to: formattedRecipients,
            message: message
        });

        console.log(`Successfully dispatched SMS to ${formattedRecipients.length} recipients.`);
        res.json({ success: true, details: response });
    } catch (error) {
        console.error('Failed to send global SMS:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- BALANCE ENDPOINT ---
app.get('/api/sms-balance', authenticate, async (req, res) => {
    try {
        const result = await appLogic.fetchApplicationData();
        res.json({ balance: result.UserData.balance });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Global SMS Backend Server running on port ${PORT}`);
});
