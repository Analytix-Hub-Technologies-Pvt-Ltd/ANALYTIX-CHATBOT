require('dotenv').config();

// Ultimate global Web Blob & File API polyfills for older Node.js environments
if (typeof globalThis.Blob === 'undefined') {
  try {
    globalThis.Blob = require('buffer').Blob;
  } catch (e) {
    globalThis.Blob = class Blob {};
  }
}

if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends globalThis.Blob {
    constructor(chunks, name, options) {
      super(chunks, options);
      this.name = name;
      this.lastModified = (options && options.lastModified) || Date.now();
    }
  };
}

const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./src/db');
const groqService = require('./src/services/groq');
const emailService = require('./src/services/email');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so the widget can make API calls from external sites (like WordPress)
app.use(cors());
app.use(express.json());

// In-memory session store for multi-tenant administrators
const sessions = {}; // token -> { userId, botId, username, expiresAt }

// Middleware to verify session tokens
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized: Session token is missing." });
  }

  const token = authHeader.split(' ')[1];
  const session = sessions[token];

  if (!session || session.expiresAt < Date.now()) {
    if (session) delete sessions[token];
    return res.status(401).json({ error: "Unauthorized: Session has expired or is invalid." });
  }

  // Refresh token expiry on active request (2 hours)
  session.expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  req.user = session;
  req.botId = session.botId;
  next();
};

// Serve Static Frontends (Admin Dashboard, Chat Widget, Embed script)
app.get('/', (req, res) => res.redirect('/demo.html'));
app.get('/admin', (req, res) => res.redirect('/admin/admin.html'));
app.get('/admin/', (req, res) => res.redirect('/admin/admin.html'));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// USER AUTH APIs
// -------------------------------------------------------------
// Register a new tenant account
app.post('/api/auth/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim() === "" || password.length < 6) {
    return res.status(400).json({ error: "Username must be provided and password must be at least 6 characters." });
  }

  try {
    const user = db.addUser(username.trim(), password);
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');

    sessions[token] = {
      userId: user.id,
      botId: user.botId,
      username: user.username,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000
    };

    res.status(201).json({
      success: true,
      message: "User registered successfully!",
      token,
      username: user.username,
      botId: user.botId
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Authenticate administrator credentials
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = db.getUserByUsername(username.trim());
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const inputHash = db.hashPassword(password, user.salt);
  if (inputHash !== user.passwordHash) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');

  sessions[token] = {
    userId: user.id,
    botId: user.botId,
    username: user.username,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000
  };

  res.json({
    success: true,
    message: "Logged in successfully!",
    token,
    username: user.username,
    botId: user.botId
  });
});

// Revoke active sessions
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    delete sessions[token];
  }
  res.json({ success: true, message: "Logged out successfully." });
});

// Fetch active session info
app.get('/api/auth/me', requireAuth, (req, res) => {
  try {
    const user = db.getUsers().find(u => u.id === req.user.userId);
    res.json({
      username: req.user.username,
      botId: req.user.botId,
      onboarded: user ? !!user.onboarded : false,
      fullName: user ? user.fullName : '',
      organizationName: user ? user.organizationName : ''
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load session details." });
  }
});

// Post-registration user and bot onboarding setup
app.post('/api/auth/onboard', requireAuth, (req, res) => {
  const { fullName, phone, organizationName, industry, websiteUrl, botName, primaryColor, backgroundColor, welcomeMessage } = req.body;

  if (!fullName || !organizationName || !botName || !primaryColor) {
    return res.status(400).json({ error: "Missing required onboarding fields: Full Name, Organization Name, Bot Name, and Brand Color are mandatory." });
  }

  try {
    // 1. Update the user account with details and mark onboarded
    const updatedUser = db.updateUser(req.user.userId, {
      fullName,
      phone: phone || '',
      organizationName,
      industry: industry || '',
      websiteUrl: websiteUrl || '',
      onboarded: true
    });

    // 2. Retrieve default/existing system prompt
    const currentSettings = db.getSettings(req.user.botId);
    let systemPrompt = currentSettings.systemPrompt || db.DEFAULT_SYSTEM_PROMPT;

    // 3. Dynamically replace "AnalytixHub" baseline copy with tenant details
    systemPrompt = systemPrompt.replace(/AnalytixHub/g, organizationName);
    if (websiteUrl) {
      systemPrompt = systemPrompt.replace(/analytixhub\.org/g, websiteUrl);
    }
    systemPrompt = systemPrompt.replace(/AH Bot/g, botName);
    systemPrompt = systemPrompt.replace(/contactus@analytixhub\.org/g, req.user.username);
    systemPrompt = systemPrompt.replace(/Chennai, India/g, 'our virtual headquarters');
    systemPrompt = systemPrompt.replace(/\+91 7397577392/g, phone || 'our contact line');

    // 4. Save customizable branding and newly tailrowed system prompt
    const botSettingsUpdate = {
      botName,
      primaryColor,
      backgroundColor: backgroundColor || '#090d16',
      welcomeMessage: welcomeMessage || `Hi there! I am your AI assistant representing ${organizationName}. How can I help you today?`,
      adminEmail: req.user.username,
      systemPrompt
    };

    db.saveSettings(req.user.botId, botSettingsUpdate);

    res.json({
      success: true,
      message: "Onboarding completed successfully!",
      user: {
        fullName: updatedUser.fullName,
        username: updatedUser.username,
        organizationName: updatedUser.organizationName,
        onboarded: true
      }
    });

  } catch (error) {
    console.error("Onboarding API Error:", error);
    res.status(500).json({ error: error.message || "Failed to process onboarding settings." });
  }
});

// -------------------------------------------------------------
// CHAT API (PUBLIC WIDGET ROUTE)
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  const botId = req.body.botId || req.query.botId || 'bot-default';

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid message payload" });
  }

  // Set Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = groqService.getChatResponseStream(messages, botId);
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
  } catch (error) {
    console.error("Express Chat Route Streaming Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Failed to generate chat response stream" })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// -------------------------------------------------------------
// BOOKINGS APIs
// -------------------------------------------------------------
// Get list of booked appointments (ADMIN PROTECTED)
app.get('/api/bookings', requireAuth, (req, res) => {
  try {
    const bookings = db.getBookings(req.botId);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve bookings" });
  }
});

// Create a new booking (PUBLIC WIDGET ROUTE)
app.post('/api/bookings', async (req, res) => {
  const { name, email, phone, date, time, purpose, info } = req.body;
  const botId = req.body.botId || req.query.botId || 'bot-default';

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: "Required details: Name, Email, Date, and Time slot must be provided." });
  }

  try {
    // 1. Add booking to database for this specific botId
    const booking = db.addBooking(botId, { name, email, phone, date, time, purpose, info });
    
    // 2. Dispatch email notifications asynchronously
    let emailSent = false;
    try {
      emailSent = await emailService.sendBookingEmails(booking, botId);
      if (emailSent) {
        // Update booking entry to show emails were sent successfully
        const bookings = db.getBookings(botId);
        const bIndex = bookings.findIndex(b => b.id === booking.id);
        if (bIndex !== -1) {
          bookings[bIndex].emailSent = true;
          db.saveSettings(botId, {}); // Save update to file via settings write trigger
          booking.emailSent = true;
        }
      }
    } catch (mailError) {
      console.error("Booking created successfully, but mailer encountered an error:", mailError);
    }

    res.status(201).json({
      success: true,
      message: "Booking confirmed successfully!",
      booking
    });

  } catch (error) {
    console.error("Express Bookings Route Error:", error);
    res.status(500).json({ error: "Internal server error scheduling booking." });
  }
});

// Delete an appointment slot (ADMIN PROTECTED)
app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  try {
    const success = db.deleteBooking(req.botId, id);
    if (success) {
      res.json({ message: "Booking cancelled successfully" });
    } else {
      res.status(404).json({ error: "Booking record not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

// Check slots availability for a given date (PUBLIC WIDGET ROUTE)
app.get('/api/bookings/available-slots', (req, res) => {
  const { date } = req.query; // format: YYYY-MM-DD
  const botId = req.query.botId || 'bot-default';
  
  if (!date) return res.status(400).json({ error: "Date parameter required" });

  try {
    const bookings = db.getBookings(botId);
    
    // Default standard operating slots
    const standardSlots = [
      "09:30", "10:15", "11:00", "11:45",
      "14:00", "14:45", "15:30", "16:15", "17:00"
    ];

    // Find slots on this date that are already taken
    const takenSlots = bookings
      .filter(b => b.date === date)
      .map(b => b.time);

    // Filter slots to find the ones that are still open
    const availableSlots = standardSlots.filter(slot => !takenSlots.includes(slot));

    res.json({ availableSlots });
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve open slots" });
  }
});

// -------------------------------------------------------------
// SETTINGS APIs
// -------------------------------------------------------------
// Get settings (ADMIN OR PUBLIC WIDGET ROOT)
app.get('/api/settings', (req, res) => {
  try {
    let botId = 'bot-default';
    
    // 1. Resolve botId from auth token session if admin calls it
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const session = sessions[token];
      if (session && session.expiresAt > Date.now()) {
        botId = session.botId;
      }
    } else {
      // 2. Otherwise resolve from query param for public widget
      botId = req.query.botId || 'bot-default';
    }

    const settings = db.getSettings(botId);
    const safeSettings = { ...settings };
    
    // Mask API Keys and Passwords for safe rendering in client browser
    if (safeSettings.groqKey) {
      safeSettings.groqKey = safeSettings.groqKey.substring(0, 7) + "..." + safeSettings.groqKey.substring(safeSettings.groqKey.length - 4);
    }
    if (safeSettings.openRouterKey) {
      safeSettings.openRouterKey = safeSettings.openRouterKey.substring(0, 7) + "..." + safeSettings.openRouterKey.substring(safeSettings.openRouterKey.length - 4);
    }
    if (safeSettings.smtpPass) {
      safeSettings.smtpPass = "●●●●●●●●●●●●";
    }
    if (safeSettings.msGraphClientSecret) {
      safeSettings.msGraphClientSecret = "●●●●●●●●●●●●";
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(safeSettings);
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// Save settings from dashboard (ADMIN PROTECTED)
app.post('/api/settings', requireAuth, (req, res) => {
  const newSettings = req.body;
  const botId = req.botId;
  
  try {
    const currentSettings = db.getSettings(botId);
    
    // If the API key or SMTP password comes back masked, do not overwrite the existing saved values!
    if (newSettings.groqKey && (newSettings.groqKey.includes("...") || newSettings.groqKey === "")) {
      delete newSettings.groqKey;
    }
    if (newSettings.openRouterKey && (newSettings.openRouterKey.includes("...") || newSettings.openRouterKey === "")) {
      delete newSettings.openRouterKey;
    }
    if (newSettings.smtpPass && (newSettings.smtpPass === "●●●●●●●●●●●●" || newSettings.smtpPass === "")) {
      delete newSettings.smtpPass;
    }
    if (newSettings.msGraphClientSecret && (newSettings.msGraphClientSecret === "●●●●●●●●●●●●" || newSettings.msGraphClientSecret === "")) {
      delete newSettings.msGraphClientSecret;
    }

    // Convert SMTP port to integer
    if (newSettings.smtpPort) {
      newSettings.smtpPort = parseInt(newSettings.smtpPort);
    }

    const updated = db.saveSettings(botId, newSettings);
    res.json({ success: true, message: "Settings saved successfully!", settings: updated });
  } catch (error) {
    console.error("Save Settings Error:", error);
    res.status(500).json({ error: "Failed to update configurations" });
  }
});

// Automatically create a free test Ethereal SMTP account and save it to configurations (ADMIN PROTECTED)
app.post('/api/settings/generate-test-smtp', requireAuth, async (req, res) => {
  const nodemailer = require('nodemailer');
  const botId = req.botId;
  try {
    nodemailer.createTestAccount((err, account) => {
      if (err) {
        console.error("Ethereal creation error:", err);
        return res.status(500).json({ error: "Failed to generate dynamic Ethereal mailer credentials." });
      }

      const generated = {
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
        smtpSecure: account.smtp.secure,
        smtpFrom: `Chatbot Test <${account.user}>`
      };

      const updated = db.saveSettings(botId, generated);
      res.json({
        success: true,
        message: "Successfully generated and configured a free Ethereal SMTP mailer account! You can now send real test emails.",
        settings: updated,
        previewUrl: "https://ethereal.email/"
      });
    });
  } catch (error) {
    console.error("Test SMTP generation failed:", error);
    res.status(500).json({ error: "Failed to generate dynamic SMTP setup." });
  }
});

// Send a test email from the Settings panel (ADMIN PROTECTED)
app.post('/api/bookings/test-email', requireAuth, async (req, res) => {
  const { testEmail, settings } = req.body;
  const botId = req.botId;

  if (!testEmail) {
    return res.status(400).json({ error: "Test email address must be provided." });
  }

  try {
    // If password/key are masked, pull them from the current DB
    const currentSettings = db.getSettings(botId);
    const activeSettings = { ...currentSettings, ...settings };
    
    if (settings.smtpPass === "●●●●●●●●●●●●" || !settings.smtpPass) {
      activeSettings.smtpPass = currentSettings.smtpPass;
    }
    if (settings.msGraphClientSecret === "●●●●●●●●●●●●" || !settings.msGraphClientSecret) {
      activeSettings.msGraphClientSecret = currentSettings.msGraphClientSecret;
    }
    if (settings.groqKey && settings.groqKey.includes("...")) {
      activeSettings.groqKey = currentSettings.groqKey;
    }

    await emailService.sendTestEmail(activeSettings, testEmail);
    res.json({ success: true, message: `Test email successfully sent to ${testEmail}!` });
  } catch (error) {
    console.error("SMTP/Graph Test Error:", error);
    res.status(500).json({ error: `Mailer failed connection test: ${error.message}` });
  }
});

// -------------------------------------------------------------
// WEB CRAWLER & AI BRAIN GENERATION API (ADMIN PROTECTED)
// -------------------------------------------------------------
app.post('/api/scraper/crawl', requireAuth, async (req, res) => {
  const { url } = req.body;
  const botId = req.botId;
  
  if (!url) {
    return res.status(400).json({ error: "Website URL must be provided." });
  }

  try {
    const scraperService = require('./src/services/scraper');
    
    console.log(`Starting crawl request for URL: ${url} (Bot: ${botId})`);
    
    // Clear prompt in current scoped settings first
    db.saveSettings(botId, { systemPrompt: "" });
    
    // 1. Run recursive scraper
    const crawlResult = await scraperService.crawlWebsite(url, 8);
    
    if (!crawlResult.pagesCrawled || crawlResult.pagesCrawled.length === 0) {
      return res.status(500).json({ error: "The crawler was unable to extract any text from this website. Please verify that the URL is public and allows crawlers." });
    }

    console.log(`Crawl completed. Crawled ${crawlResult.pagesCrawled.length} pages. Total words: ${crawlResult.totalWords}. Triggering Groq Prompt synthesis...`);

    // 2. Feed corpus to Groq to generate customized brain configurations
    const brainConfig = await groqService.generateWebsiteBrain(crawlResult.corpus, url, botId);
    
    console.log(`AI Brain synthesis successful for ${url}! Automatically saving configuration to database settings...`);

    // Auto-save the newly generated configurations (overwriting settings)
    db.saveSettings(botId, {
      botName: brainConfig.botName,
      welcomeMessage: brainConfig.welcomeMessage,
      primaryColor: brainConfig.primaryColor,
      systemPrompt: brainConfig.systemPrompt
    });

    console.log("Successfully saved and deployed custom website chatbot brain to database.");

    // 3. Return the synthesized configurations + stats to the frontend
    res.json({
      success: true,
      botName: brainConfig.botName,
      welcomeMessage: brainConfig.welcomeMessage,
      primaryColor: brainConfig.primaryColor,
      systemPrompt: brainConfig.systemPrompt,
      extractedInfo: brainConfig.extractedInfo || {
        location: "Not specified",
        mapLink: "Not specified",
        email: "Not specified",
        phone: "Not specified",
        services: []
      },
      stats: {
        pagesCrawled: crawlResult.pagesCrawled,
        totalWords: crawlResult.totalWords
      }
    });

  } catch (error) {
    console.error("Web Scraper API Route Error:", error);
    res.status(500).json({ error: `AI training failed: ${error.message}` });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 ANALYTIXHUB CHATBOT SERVICE IS NOW ACTIVE`);
  console.log(`🖥️  Admin Portal: http://localhost:${PORT}/admin`);
  console.log(`💬 Widget Tester: http://localhost:${PORT}/widget/widget.html`);
  console.log(`===================================================`);
});
