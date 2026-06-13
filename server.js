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
const tataService = require('./src/services/tata');
const emailService = require('./src/services/email');
const axios = require('axios');

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
      organizationName: user ? user.organizationName : '',
      websiteUrl: user ? user.websiteUrl : '',
      plan: user ? user.plan || 'free' : 'free',
      paymentStatus: user ? user.paymentStatus || 'unpaid' : 'unpaid',
      amountPaid: user ? user.amountPaid || 0 : 0,
      transactionId: user ? user.transactionId || '' : '',
      trialStartDate: user ? user.trialStartDate || '' : '',
      trialEndDate: user ? user.trialEndDate || '' : ''
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load session details." });
  }
});

// Create a Razorpay Order for tenant registration (subscription)
app.post('/api/auth/razorpay-order', requireAuth, async (req, res) => {
  const { plan } = req.body;

  if (!plan || !['pro', 'advanced'].includes(plan)) {
    return res.status(400).json({ error: "Invalid subscription plan level. Must be 'pro' or 'advanced'." });
  }

  try {
    const globalSettings = db.getGlobalSettings();
    const keyId = globalSettings.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = globalSettings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(400).json({ error: "SaaS Platform Razorpay credentials are not configured on the server." });
    }

    const price = plan === 'pro' ? 20 : 30;
    const amountInSubunits = price * 100; // in USD cents

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    
    const response = await axios.post('https://api.razorpay.com/v1/orders', {
      amount: amountInSubunits,
      currency: 'USD',
      receipt: `rcpt_reg_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    }, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      orderId: response.data.id,
      amount: price,
      currency: 'USD',
      keyId: keyId
    });

  } catch (error) {
    console.error("Razorpay Registration Order Creation Error:", error.response ? error.response.data : error.message);
    const errorMsg = error.response && error.response.data && error.response.data.error 
      ? error.response.data.error.description 
      : error.message;
    res.status(500).json({ error: `Failed to create Razorpay registration order: ${errorMsg}` });
  }
});

// Complete registration subscription & payment
app.post('/api/auth/subscribe', requireAuth, (req, res) => {
  const { plan, websiteUrl, cardholder, cardNumber, expiry, cvv, paymentGateway, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!plan || !['free', 'pro', 'advanced'].includes(plan)) {
    return res.status(400).json({ error: "Invalid subscription plan level. Must be 'free', 'pro', or 'advanced'." });
  }

  const user = db.getUsers().find(u => u.id === req.user.userId);
  
  // Resolve websiteUrl from body, or existing user profile, or default to example.com
  const resolvedWebsiteUrl = (websiteUrl || (user ? user.websiteUrl : '') || 'https://example.com').trim();

  // Validate website URL format
  if (!resolvedWebsiteUrl.startsWith('http://') && !resolvedWebsiteUrl.startsWith('https://')) {
    return res.status(400).json({ error: "Organization website URL must start with 'http://' or 'https://'." });
  }

  try {
    let amountPaid = 0;
    let paymentStatus = 'free';
    let transactionId = 'FREE-MEMBER';

    if (plan !== 'free') {
      if (paymentGateway === 'razorpay') {
        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return res.status(400).json({ error: "Razorpay payment verification parameters are missing." });
        }

        const globalSettings = db.getGlobalSettings();
        const keySecret = globalSettings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

        if (!keySecret) {
          return res.status(500).json({ error: "SaaS Platform Razorpay credentials are not configured on the server." });
        }

        const crypto = require('crypto');
        const generated_signature = crypto
          .createHmac('sha256', keySecret)
          .update(razorpayOrderId + "|" + razorpayPaymentId)
          .digest('hex');

        if (generated_signature !== razorpaySignature) {
          return res.status(400).json({ error: "Payment verification failed. Invalid transaction signature." });
        }

        amountPaid = plan === 'pro' ? 20 : 30;
        paymentStatus = 'paid';
        transactionId = razorpayPaymentId;
      } else {
        // If a premium tier is chosen, default to fallback credentials if card details are not provided
        const finalCardholder = cardholder || 'Simulated User';
        const finalCardNumber = (cardNumber || '4242 4242 4242 4242').replace(/\s/g, '');
        const finalExpiry = expiry || '12/28';
        const finalCvv = cvv || '123';

        // Simple mock card check (needs 16 digits)
        if (finalCardNumber.length !== 16 || isNaN(finalCardNumber)) {
          return res.status(400).json({ error: "Invalid credit card number. Must be a 16-digit card." });
        }

        amountPaid = plan === 'pro' ? 20 : 30;
        paymentStatus = 'paid';
        transactionId = 'TXN-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      }
    }

    const isAlreadyOnboarded = user ? !!user.onboarded : false;

    const updatedUser = db.updateUser(req.user.userId, {
      plan,
      paymentStatus,
      amountPaid,
      transactionId,
      websiteUrl: resolvedWebsiteUrl
    });

    if (!isAlreadyOnboarded) {
      // Auto-train the AI brain in the background using the provided website URL
      const scraperService = require('./src/services/scraper');
      console.log(`Auto-training AI brain in the background for URL: ${websiteUrl} (Bot: ${req.botId})`);
      
      // Clear prompt in current scoped settings first
      db.saveSettings(req.botId, { systemPrompt: "" });
      
      scraperService.crawlWebsite(websiteUrl, 8)
        .then(async (crawlResult) => {
          if (crawlResult.pagesCrawled && crawlResult.pagesCrawled.length > 0) {
            const brainConfig = await tataService.generateWebsiteBrain(crawlResult.corpus, websiteUrl, req.botId);
            db.saveSettings(req.botId, {
              botName: brainConfig.botName,
              welcomeMessage: brainConfig.welcomeMessage,
              primaryColor: brainConfig.primaryColor,
              systemPrompt: brainConfig.systemPrompt,
              companyAddress: (brainConfig.extractedInfo?.location && brainConfig.extractedInfo.location !== "Not specified") ? brainConfig.extractedInfo.location : "",
              companyMapLink: (brainConfig.extractedInfo?.mapLink && brainConfig.extractedInfo.mapLink !== "Not specified") ? brainConfig.extractedInfo.mapLink : "",
              companyPhone: (brainConfig.extractedInfo?.phone && brainConfig.extractedInfo.phone !== "Not specified") ? brainConfig.extractedInfo.phone : "",
              adminEmail: db.getSettings(req.botId).adminEmail || req.user.username,
              companyEmail: (brainConfig.extractedInfo?.email && brainConfig.extractedInfo.email !== "Not specified") ? brainConfig.extractedInfo.email : (db.getSettings(req.botId).companyEmail || ""),
              companyServices: brainConfig.extractedInfo?.services || [],
              botSubTitle: `${brainConfig.botName} Assistant`
            });
            console.log(`Auto-trained AI brain successfully for website: ${websiteUrl} (Bot: ${req.botId})`);
          } else {
            console.warn(`Auto-training found no content on website: ${websiteUrl}`);
          }
        })
        .catch(err => {
          console.error(`Auto-training failed in background for: ${websiteUrl}`, err);
        });
    } else {
      console.log(`Skipping background auto-training for already-onboarded user: ${req.user.username}`);
    }

    res.json({
      success: true,
      message: `Subscription plan ${plan} activated successfully! AI auto-training started.`,
      plan: updatedUser.plan,
      paymentStatus: updatedUser.paymentStatus
    });
  } catch (error) {
    console.error("Subscription Plan activation error:", error);
    res.status(500).json({ error: error.message || "Failed to process subscription plan." });
  }
});

// Activate or restart 2-month Advanced Plan Trial
app.post('/api/auth/activate-trial', requireAuth, (req, res) => {
  try {
    const { websiteUrl } = req.body || {};
    const trialStartDate = new Date();
    const trialEndDate = new Date();
    trialEndDate.setMonth(trialEndDate.getMonth() + 2); // 2 months from now

    const updates = {
      plan: 'advanced',
      paymentStatus: 'trial',
      transactionId: 'TRIAL-RESTART-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
      trialStartDate: trialStartDate.toISOString(),
      trialEndDate: trialEndDate.toISOString(),
      reminderSent: false
    };

    if (websiteUrl) {
      updates.websiteUrl = websiteUrl;
    }

    const updatedUser = db.updateUser(req.user.userId, updates);

    if (websiteUrl) {
      // Auto-train the AI brain in the background using the provided website URL
      const scraperService = require('./src/services/scraper');
      console.log(`Auto-training AI brain in the background for URL: ${websiteUrl} (Bot: ${req.botId})`);
      
      // Clear prompt in current scoped settings first
      db.saveSettings(req.botId, { systemPrompt: "" });
      
      scraperService.crawlWebsite(websiteUrl, 8)
        .then(async (crawlResult) => {
          if (crawlResult.pagesCrawled && crawlResult.pagesCrawled.length > 0) {
            const brainConfig = await tataService.generateWebsiteBrain(crawlResult.corpus, websiteUrl, req.botId);
            db.saveSettings(req.botId, {
              botName: brainConfig.botName,
              welcomeMessage: brainConfig.welcomeMessage,
              primaryColor: brainConfig.primaryColor,
              systemPrompt: brainConfig.systemPrompt,
              companyAddress: (brainConfig.extractedInfo?.location && brainConfig.extractedInfo.location !== "Not specified") ? brainConfig.extractedInfo.location : "",
              companyMapLink: (brainConfig.extractedInfo?.mapLink && brainConfig.extractedInfo.mapLink !== "Not specified") ? brainConfig.extractedInfo.mapLink : "",
              companyPhone: (brainConfig.extractedInfo?.phone && brainConfig.extractedInfo.phone !== "Not specified") ? brainConfig.extractedInfo.phone : "",
              adminEmail: db.getSettings(req.botId).adminEmail || req.user.username,
              companyEmail: (brainConfig.extractedInfo?.email && brainConfig.extractedInfo.email !== "Not specified") ? brainConfig.extractedInfo.email : (db.getSettings(req.botId).companyEmail || ""),
              companyServices: brainConfig.extractedInfo?.services || [],
              botSubTitle: `${brainConfig.botName} Assistant`
            });
            console.log(`Auto-trained AI brain successfully for website: ${websiteUrl} (Bot: ${req.botId})`);
          } else {
            console.warn(`Auto-training found no content on website: ${websiteUrl}`);
          }
        })
        .catch(err => {
          console.error(`Auto-training failed in background for: ${websiteUrl}`, err);
        });
    }

    res.json({
      success: true,
      message: "Congratulations! Your 2-month Advanced Plan Trial has been activated successfully.",
      plan: updatedUser.plan,
      paymentStatus: updatedUser.paymentStatus,
      trialEndDate: updatedUser.trialEndDate
    });
  } catch (error) {
    console.error("Trial activation error:", error);
    res.status(500).json({ error: error.message || "Failed to activate trial." });
  }
});

// -------------------------------------------------------------
// SUPER ADMIN AUTH & MANAGEMENT APIs
// -------------------------------------------------------------
const SUPER_ADMIN_USER = process.env.SUPER_ADMIN_USERNAME || 'superadmin';
const SUPER_ADMIN_PASS = process.env.SUPER_ADMIN_PASSWORD || 'superadmin123';

const requireSuperAuth = (req, res, next) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Super Admin session token is missing." });
  }

  const session = sessions[token];

  if (!session || session.role !== 'superadmin' || session.expiresAt < Date.now()) {
    if (session) delete sessions[token];
    return res.status(401).json({ error: "Unauthorized: Super Admin session has expired or is invalid." });
  }

  session.expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  req.user = session;
  next();
};

app.post('/api/super/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  if (username.trim() !== SUPER_ADMIN_USER || password !== SUPER_ADMIN_PASS) {
    return res.status(401).json({ error: "Invalid Super Admin credentials." });
  }

  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');

  sessions[token] = {
    role: 'superadmin',
    username: SUPER_ADMIN_USER,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000
  };

  res.json({
    success: true,
    message: "Authenticated as Super Admin successfully!",
    token
  });
});

app.get('/api/super/stats', requireSuperAuth, (req, res) => {
  try {
    const users = db.getUsers();
    const bots = db.getBots();
    
    let freeCount = 0;
    let proCount = 0;
    let advCount = 0;
    
    users.forEach(u => {
      const p = u.plan || 'free';
      if (p === 'free') freeCount++;
      else if (p === 'pro') proCount++;
      else if (p === 'advanced') advCount++;
    });

    let totalBookings = 0;
    let totalConversations = 0;

    Object.keys(bots).forEach(botId => {
      const bot = bots[botId];
      if (bot) {
        if (Array.isArray(bot.bookings)) totalBookings += bot.bookings.length;
        if (Array.isArray(bot.conversations)) totalConversations += bot.conversations.length;
      }
    });

    let totalRevenue = 0;
    users.forEach(u => {
      totalRevenue += (u.amountPaid || 0);
    });

    res.json({
      totalTenants: users.length,
      freeCount,
      proCount,
      advCount,
      totalBookings,
      totalConversations,
      totalRevenue
    });
  } catch (error) {
    console.error("Super Admin stats API Error:", error);
    res.status(500).json({ error: "Failed to retrieve global statistics." });
  }
});

// GET Global settings (SUPER ADMIN ONLY)
app.get('/api/super/settings', requireSuperAuth, (req, res) => {
  try {
    const globalSettings = db.getGlobalSettings();
    const safeGlobal = { ...globalSettings };
    if (safeGlobal.tataKey) {
      safeGlobal.tataKey = "●●●●●●●●●●●●";
    }
    if (safeGlobal.razorpayKeySecret) {
      safeGlobal.razorpayKeySecret = "●●●●●●●●●●●●";
    }
    res.json(safeGlobal);
  } catch (error) {
    console.error("Super Admin get settings API Error:", error);
    res.status(500).json({ error: "Failed to load global settings" });
  }
});

// POST Global settings (SUPER ADMIN ONLY)
app.post('/api/super/settings', requireSuperAuth, (req, res) => {
  const newSettings = req.body;
  try {
    const currentGlobal = db.getGlobalSettings();
    if (newSettings.tataKey && (newSettings.tataKey === "●●●●●●●●●●●●" || newSettings.tataKey === "")) {
      delete newSettings.tataKey;
    }
    if (newSettings.razorpayKeySecret && (newSettings.razorpayKeySecret === "●●●●●●●●●●●●" || newSettings.razorpayKeySecret === "")) {
      delete newSettings.razorpayKeySecret;
    }
    const updated = db.saveGlobalSettings(newSettings);
    res.json({ success: true, message: "Global settings saved successfully!", settings: updated });
  } catch (error) {
    console.error("Super Admin save settings API Error:", error);
    res.status(500).json({ error: "Failed to save global settings" });
  }
});

// Helper to escape HTML characters in document export
function escapeHtmlDoc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Export all tenant bookings to DOC (HTML format)
app.get('/api/super/bookings/export', requireSuperAuth, (req, res) => {
  try {
    const users = db.getUsers();
    const bots = db.getBots();
    
    // Create mapping of botId to user info
    const userMap = {};
    users.forEach(u => {
      userMap[u.botId] = {
        email: u.username,
        organizationName: u.organizationName || 'Not Onboarded'
      };
    });

    let docHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Global Tenant Bookings Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 40px; }
  h1 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; font-size: 24px; }
  p { font-size: 14px; }
  .tenant-section { margin-top: 35px; margin-bottom: 15px; }
  .tenant-title { font-size: 18px; font-weight: bold; color: #2563eb; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; margin-bottom: 25px; }
  th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
  th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
  tr:nth-child(even) { background-color: #f8fafc; }
</style>
</head>
<body>
  <h1>Global Tenant Bookings Report</h1>
  <p><strong>Exported On:</strong> ${new Date().toLocaleString()}</p>
`;

    Object.keys(bots).forEach(botId => {
      const bot = bots[botId];
      if (bot && Array.isArray(bot.bookings) && bot.bookings.length > 0) {
        const tenant = userMap[botId] || { email: 'System/Unknown', organizationName: 'N/A' };
        docHtml += `
  <div class="tenant-section">
    <div class="tenant-title">Tenant: ${escapeHtmlDoc(tenant.email)} (${escapeHtmlDoc(tenant.organizationName)})</div>
    <table>
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Client Email</th>
          <th>Client Phone</th>
          <th>Booking Date</th>
          <th>Booking Time</th>
          <th>Purpose</th>
          <th>Details</th>
          <th>Client Timezone</th>
          <th>Payment Status</th>
          <th>Amount Paid</th>
          <th>Transaction ID</th>
          <th>Created At</th>
        </tr>
      </thead>
      <tbody>`;

        bot.bookings.forEach(booking => {
          docHtml += `
        <tr>
          <td>${escapeHtmlDoc(booking.name)}</td>
          <td>${escapeHtmlDoc(booking.email)}</td>
          <td>${escapeHtmlDoc(booking.phone)}</td>
          <td>${escapeHtmlDoc(booking.date)}</td>
          <td>${escapeHtmlDoc(booking.time)}</td>
          <td>${escapeHtmlDoc(booking.purpose)}</td>
          <td>${escapeHtmlDoc(booking.info)}</td>
          <td>${escapeHtmlDoc(booking.clientTimezone)}</td>
          <td>${escapeHtmlDoc(booking.paymentStatus || 'N/A')}</td>
          <td>${escapeHtmlDoc(booking.paymentAmountPaid || '')}</td>
          <td>${escapeHtmlDoc(booking.paymentTransactionId || '')}</td>
          <td>${escapeHtmlDoc(booking.createdAt)}</td>
        </tr>`;
        });

        docHtml += `
      </tbody>
    </table>
  </div>`;
      }
    });

    docHtml += `
</body>
</html>`;

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', 'attachment; filename="all_tenant_bookings.doc"');
    res.status(200).send(docHtml);

  } catch (error) {
    console.error("Super Admin export bookings Error:", error);
    res.status(500).send("Failed to export bookings.");
  }
});

// Export specific tenant's bookings to DOC (HTML format)
app.get('/api/super/admins/:id/bookings/export', requireSuperAuth, (req, res) => {
  const { id } = req.params;

  try {
    const user = db.getUsers().find(u => u.id === id);
    if (!user) {
      return res.status(404).json({ error: "Tenant user not found." });
    }

    const bot = db.getBots()[user.botId];
    if (!bot) {
      return res.status(404).json({ error: "Bot configurations not found." });
    }

    let docHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Bookings Report - ${escapeHtmlDoc(user.username)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; margin: 40px; }
  h1 { color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; font-size: 24px; }
  p { font-size: 14px; }
  table { border-collapse: collapse; width: 100%; margin-top: 20px; }
  th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
  th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
  tr:nth-child(even) { background-color: #f8fafc; }
</style>
</head>
<body>
  <h1>Bookings Report - ${escapeHtmlDoc(user.username)}</h1>
  <p><strong>Organization Name:</strong> ${escapeHtmlDoc(user.organizationName || 'Not Onboarded')}</p>
  <p><strong>Exported On:</strong> ${new Date().toLocaleString()}</p>
  
  <table>
    <thead>
      <tr>
        <th>Client Name</th>
        <th>Client Email</th>
        <th>Client Phone</th>
        <th>Booking Date</th>
        <th>Booking Time</th>
        <th>Purpose</th>
        <th>Details</th>
        <th>Client Timezone</th>
        <th>Payment Status</th>
        <th>Amount Paid</th>
        <th>Transaction ID</th>
        <th>Created At</th>
      </tr>
    </thead>
    <tbody>`;

    if (Array.isArray(bot.bookings)) {
      bot.bookings.forEach(booking => {
        docHtml += `
      <tr>
        <td>${escapeHtmlDoc(booking.name)}</td>
        <td>${escapeHtmlDoc(booking.email)}</td>
        <td>${escapeHtmlDoc(booking.phone)}</td>
        <td>${escapeHtmlDoc(booking.date)}</td>
        <td>${escapeHtmlDoc(booking.time)}</td>
        <td>${escapeHtmlDoc(booking.purpose)}</td>
        <td>${escapeHtmlDoc(booking.info)}</td>
        <td>${escapeHtmlDoc(booking.clientTimezone)}</td>
        <td>${escapeHtmlDoc(booking.paymentStatus || 'N/A')}</td>
        <td>${escapeHtmlDoc(booking.paymentAmountPaid || '')}</td>
        <td>${escapeHtmlDoc(booking.paymentTransactionId || '')}</td>
        <td>${escapeHtmlDoc(booking.createdAt)}</td>
      </tr>`;
      });
    }

    docHtml += `
    </tbody>
  </table>
</body>
</html>`;

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename="${user.username}_bookings.doc"`);
    res.status(200).send(docHtml);

  } catch (error) {
    console.error("Super Admin export single tenant bookings Error:", error);
    res.status(500).send("Failed to export tenant bookings.");
  }
});

app.get('/api/super/admins', requireSuperAuth, (req, res) => {
  try {
    const users = db.getUsers();
    const bots = db.getBots();

    const adminsList = users.map(u => {
      const bot = bots[u.botId] || { bookings: [], conversations: [] };
      const settings = db.getSettings(u.botId) || {};
      return {
        id: u.id,
        username: u.username,
        fullName: u.fullName || '',
        organizationName: u.organizationName || '',
        websiteUrl: u.websiteUrl || '',
        createdAt: u.createdAt,
        plan: u.plan || 'free',
        paymentStatus: u.paymentStatus || 'free',
        amountPaid: u.amountPaid || 0,
        transactionId: u.transactionId || '',
        botId: u.botId,
        bookingsCount: Array.isArray(bot.bookings) ? bot.bookings.length : 0,
        conversationsCount: Array.isArray(bot.conversations) ? bot.conversations.length : 0,
        conversations: (bot.conversations || []).map(c => ({
          id: c.id,
          createdAt: c.createdAt,
          messagesCount: c.messagesCount,
          visitorName: c.visitorName,
          visitorEmail: c.visitorEmail,
          visitorPhone: c.visitorPhone,
          visitorCompany: c.visitorCompany,
          visitorNeeds: c.visitorNeeds,
          ipAddress: c.ipAddress,
          location: c.location,
          messages: c.messages || []
        })),
        settings: settings
      };
    });

    res.json(adminsList);
  } catch (error) {
    console.error("Super Admin admins list API Error:", error);
    res.status(500).json({ error: "Failed to retrieve tenant admins." });
  }
});

app.put('/api/super/admins/:id/plan', requireSuperAuth, (req, res) => {
  const { id } = req.params;
  const { plan } = req.body;

  if (!plan || !['free', 'pro', 'advanced'].includes(plan)) {
    return res.status(400).json({ error: "Invalid subscription plan level. Must be 'free', 'pro', or 'advanced'." });
  }

  try {
    const updatedUser = db.updateTenantPlan(id, plan);
    if (!updatedUser) {
      return res.status(404).json({ error: "Tenant user not found." });
    }
    res.json({
      success: true,
      message: `Successfully upgraded/downgraded tenant plan to ${plan}!`,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        plan: updatedUser.plan
      }
    });
  } catch (error) {
    console.error("Super Admin update plan API Error:", error);
    res.status(500).json({ error: "Failed to update subscription plan." });
  }
});

app.delete('/api/super/admins/:id', requireSuperAuth, (req, res) => {
  const { id } = req.params;

  try {
    const success = db.deleteTenant(id);
    if (!success) {
      return res.status(404).json({ error: "Tenant user not found." });
    }
    res.json({
      success: true,
      message: "Successfully deleted tenant account and all associated bot configuration, settings, bookings, and conversation metrics."
    });
  } catch (error) {
    console.error("Super Admin delete tenant API Error:", error);
    res.status(500).json({ error: "Failed to delete tenant account." });
  }
});

// Impersonate Tenant Admin (Login as Tenant)
app.post('/api/super/impersonate/:id', requireSuperAuth, (req, res) => {
  const { id } = req.params;

  try {
    const user = db.getUsers().find(u => u.id === id);
    if (!user) {
      return res.status(404).json({ error: "Tenant user not found." });
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
      token,
      botId: user.botId,
      username: user.username
    });
  } catch (error) {
    console.error("Super Admin impersonate tenant API Error:", error);
    res.status(500).json({ error: "Failed to impersonate tenant admin." });
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
    const dbUser = db.getUsers().find(u => u.id === req.user.userId);
    const finalWebsiteUrl = (websiteUrl && websiteUrl.trim()) ? websiteUrl.trim() : (dbUser ? dbUser.websiteUrl : '') || '';
    const updatedUser = db.updateUser(req.user.userId, {
      fullName,
      phone: phone || '',
      organizationName,
      industry: industry || '',
      websiteUrl: finalWebsiteUrl,
      onboarded: true
    });

    // 2. Retrieve default/existing system prompt and clean/extract domain
    const currentSettings = db.getSettings(req.user.botId);
    let systemPrompt = db.DEFAULT_SYSTEM_PROMPT;
 
    let cleanDomain = '';
    if (finalWebsiteUrl) {
      cleanDomain = finalWebsiteUrl.replace(/^(https?:\/\/)?(www\.)?/i, '').split('/')[0];
    }
    const derivedDomain = cleanDomain || (req.user.username.includes('@') ? req.user.username.split('@')[1] : `${organizationName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`);
    const derivedWebsite = finalWebsiteUrl || `https://${derivedDomain}`;

    // 3. Dynamically replace "AnalytixHub" baseline copy with tenant details
    systemPrompt = systemPrompt.replace(/contactus@analytixhub\.org/gi, req.user.username);
    systemPrompt = systemPrompt.replace(/analytixhub\.org/gi, derivedDomain);
    systemPrompt = systemPrompt.replace(/AnalytixHub/gi, organizationName);
    systemPrompt = systemPrompt.replace(/AH Bot/g, botName);
    systemPrompt = systemPrompt.replace(/Chennai, India/g, 'our virtual headquarters');
    systemPrompt = systemPrompt.replace("1st floor, Primus Building, Door No. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India.", "our virtual headquarters");
    systemPrompt = systemPrompt.replace("- **Google Maps Location**: [View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)", "");
    systemPrompt = systemPrompt.replace("- **CRITICAL MAP LINK RULE**: Only provide the Google Maps location link ([View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)) when the user explicitly asks for our address, physical location, office premises, directions, or office location. Do NOT include the map link or URL in general consulting chats, greeting messages, or other unrelated questions.", "");
    systemPrompt = systemPrompt.replace(/\+91 7397577392/g, phone || 'our contact line');

    // 4. Save customizable branding and newly tailored system prompt
    // Preserve existing scraper data if already trained/scraped
    const botSettingsUpdate = {
      botName,
      primaryColor,
      backgroundColor: backgroundColor || '#ffffff',
      welcomeMessage: welcomeMessage || `Hi there! I am your AI assistant representing ${organizationName}. How can I help you today?`,
      adminEmail: req.user.username,
      companyEmail: (currentSettings && currentSettings.companyEmail) ? currentSettings.companyEmail : req.user.username,
      smtpFrom: `${botName} <no-reply@${derivedDomain}>`,
      botSubTitle: `${organizationName} Consultant`,
      companyAddress: (currentSettings && currentSettings.companyAddress && currentSettings.companyAddress !== "our virtual headquarters") ? currentSettings.companyAddress : "our virtual headquarters",
      companyPhone: (currentSettings && currentSettings.companyPhone) ? currentSettings.companyPhone : (phone || ""),
      companyMapLink: (currentSettings && currentSettings.companyMapLink) ? currentSettings.companyMapLink : "",
      companyWebsite: (currentSettings && currentSettings.companyWebsite && !currentSettings.companyWebsite.includes("yourdomain.com")) ? currentSettings.companyWebsite : derivedWebsite,
      companyServices: (currentSettings && currentSettings.companyServices) ? currentSettings.companyServices : [],
      systemPrompt: (currentSettings && currentSettings.systemPrompt && currentSettings.systemPrompt.includes("COMPLETE KNOWLEDGE BASE")) ? currentSettings.systemPrompt : systemPrompt
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

// Geolocation utility for chat visitors
async function getGeoLocation(ipAddress) {
  // Normalize local/loopback IPs
  const cleanIp = (ipAddress || '').replace(/^::ffff:/, '').trim();
  
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost' || !cleanIp) {
    // Return a random mock location for realistic local testing/demonstration
    const mocks = [
      { ip: "103.241.12.18", location: "Mumbai, Maharashtra, India" },
      { ip: "8.8.8.8", location: "Ashburn, Virginia, USA" },
      { ip: "92.40.254.10", location: "London, England, UK" },
      { ip: "185.120.76.5", location: "Berlin, Germany" },
      { ip: "210.140.10.3", location: "Tokyo, Japan" },
      { ip: "1.1.1.1", location: "Sydney, NSW, Australia" }
    ];
    const picked = mocks[Math.floor(Math.random() * mocks.length)];
    return { ip: picked.ip, location: picked.location + " (Demo Mock)" };
  }

  try {
    const response = await axios.get(`https://ipapi.co/${cleanIp}/json/`, { timeout: 1500 });
    if (response.data && !response.data.error) {
      const city = response.data.city || '';
      const region = response.data.region || '';
      const country = response.data.country_name || '';
      const locStr = [city, region, country].filter(Boolean).join(', ');
      return { ip: cleanIp, location: locStr || 'Unknown Location' };
    }
  } catch (err) {
    // Fallback
  }

  try {
    const response = await axios.get(`http://ip-api.com/json/${cleanIp}`, { timeout: 1500 });
    if (response.data && response.data.status === 'success') {
      const city = response.data.city || '';
      const region = response.data.regionName || '';
      const country = response.data.country || '';
      const locStr = [city, region, country].filter(Boolean).join(', ');
      return { ip: cleanIp, location: locStr || 'Unknown Location' };
    }
  } catch (err) {
    // Fallback
  }

  return { ip: cleanIp, location: 'Unknown Location' };
}

// High-Accuracy Reverse Geocoding via OpenStreetMap Nominatim
async function getExactLocation(coords) {
  if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
    return null;
  }
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.latitude}&lon=${coords.longitude}&zoom=18&addressdetails=1`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'AH-Chatbot/1.0 (Enterprise AI Consulting Chatbot)'
      },
      timeout: 3000
    });
    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
  } catch (err) {
    console.error("Reverse geocoding query failed:", err.message);
  }
  return null;
}

// -------------------------------------------------------------
// CHAT API (PUBLIC WIDGET ROUTE)
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { messages, conversationId: reqConversationId, coords } = req.body;
  const botId = req.body.botId || req.query.botId || 'bot-default';
  const conversationId = reqConversationId || ('conv-' + Math.random().toString(36).substring(2, 10));

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid message payload" });
  }

  // Extract IP and resolve geolocation
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const geo = await getGeoLocation(clientIp);

  // If high-accuracy browser coordinates are available, overwrite with exact street address
  if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
    const exactAddress = await getExactLocation(coords);
    if (exactAddress) {
      geo.location = exactAddress;
    }
  }

  // Plan limit check for conversations
  const tenantUser = db.getUserByBotId(botId);
  const plan = tenantUser ? tenantUser.plan || 'free' : 'free';
  const conversations = db.getConversations(botId);
  const isExistingConv = conversations.some(c => c.id === conversationId);

  if (!isExistingConv) {
    if (plan === 'free' && conversations.length >= 15) {
      return res.status(403).json({ error: "Conversational limit reached for this free trial chatbot assistant. Please contact the owner to upgrade." });
    }
    if (plan === 'pro' && conversations.length >= 100) {
      return res.status(403).json({ error: "Conversational limit reached for this chatbot assistant. Please contact the owner to upgrade." });
    }
  }

  // Set Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const startTime = Date.now();
  let ttft = 0;
  let fullResponse = '';

  try {
    const stream = tataService.getChatResponseStream(messages, botId);
    for await (const chunk of stream) {
      if (!ttft) {
        ttft = Date.now() - startTime;
        try {
          db.recordChatMetrics(botId, conversationId, ttft, [], geo.ip, geo.location);
        } catch (dbErr) {
          console.error("Failed to record chat metrics:", dbErr);
        }
      }
      if (chunk) {
        fullResponse += chunk;
      }
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    
    if (!ttft) {
      ttft = Date.now() - startTime;
    }
    
    // Save the complete message exchange history!
    try {
      const fullHistory = [...messages, { role: 'assistant', content: fullResponse }];
      db.recordChatMetrics(botId, conversationId, ttft, fullHistory, geo.ip, geo.location);
    } catch (dbErr) {
      console.error("Failed to save full conversation history:", dbErr);
    }
  } catch (error) {
    console.error("Express Chat Route Streaming Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Failed to generate chat response stream" })}\n\n`);
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// GET conversations list for admin
app.get('/api/conversations', requireAuth, (req, res) => {
  try {
    const botId = req.botId;
    const conversations = db.getConversations(botId);
    const sorted = [...conversations].sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
    res.json(sorted);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to retrieve conversations." });
  }
});

// -------------------------------------------------------------
// DASHBOARD STATISTICS API
// -------------------------------------------------------------
// Get dashboard statistics (ADMIN PROTECTED)
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const botId = req.botId;
    const settings = db.getSettings(botId);
    const bookings = db.getBookings(botId);
    const conversations = db.getConversations(botId);

    // 1. Bookings Count
    const bookingsCount = bookings.length;

    // 2. Conversations Count & Trend
    const totalConversations = conversations.length;
    
    // Calculate Trend (this week vs last week)
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    const conversationsThisWeek = conversations.filter(c => {
      const createdTime = new Date(c.createdAt).getTime();
      return (now - createdTime) <= oneWeekMs;
    });

    const conversationsLastWeek = conversations.filter(c => {
      const createdTime = new Date(c.createdAt).getTime();
      const diff = now - createdTime;
      return diff > oneWeekMs && diff <= twoWeeksMs;
    });

    const countThisWeek = conversationsThisWeek.length;
    const countLastWeek = conversationsLastWeek.length;

    let trendPercent = 0;
    if (countLastWeek > 0) {
      trendPercent = Math.round(((countThisWeek - countLastWeek) / countLastWeek) * 100);
    } else if (countThisWeek > 0) {
      trendPercent = 100;
    }

    const trendText = `${trendPercent >= 0 ? '+' : ''}${trendPercent}% this week`;
    const trendClass = trendPercent > 0 ? 'positive' : (trendPercent < 0 ? 'negative' : 'neutral');
    const trendIcon = trendPercent > 0 ? 'trending-up' : (trendPercent < 0 ? 'trending-down' : 'minus');

    // 3. Latency calculations
    const validLatencies = conversations
      .map(c => c.lastLatency)
      .filter(l => typeof l === 'number' && l > 0);

    const lastLatency = validLatencies.length > 0 ? validLatencies[validLatencies.length - 1] : 0;
    const averageLatency = validLatencies.length > 0 
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length) 
      : 0;

    // 4. Mailer dispatcher status
    const emailProvider = settings.emailProvider || process.env.EMAIL_PROVIDER || 'msgraph';
    let mailerStatus = "Inactive";
    let mailerDesc = "Pending MS Graph setup";
    let mailerClass = "yellow";

    if (emailProvider === 'msgraph') {
      const active = (process.env.MS_GRAPH_TENANT_ID || settings.msGraphTenantId) &&
                     (process.env.MS_GRAPH_CLIENT_ID || settings.msGraphClientId) &&
                     (process.env.MS_GRAPH_CLIENT_SECRET || settings.msGraphClientSecret);
      if (active) {
        mailerStatus = "Active";
        mailerDesc = "Microsoft Graph active";
        mailerClass = "green";
      } else {
        mailerStatus = "Inactive";
        mailerDesc = "Pending MS Graph setup";
        mailerClass = "yellow";
      }
    } else {
      // SMTP
      const active = settings.smtpHost && settings.smtpUser;
      if (active) {
        mailerStatus = "Active";
        mailerDesc = "SMTP mailer connected";
        mailerClass = "green";
      } else {
        mailerStatus = "Inactive";
        mailerDesc = "Pending SMTP setup";
        mailerClass = "yellow";
      }
    }

    res.json({
      totalConversations,
      trendText,
      trendClass,
      trendIcon,
      bookingsCount,
      lastLatency,
      averageLatency,
      mailerStatus,
      mailerDesc,
      mailerClass
    });
  } catch (error) {
    console.error("Failed to retrieve dashboard stats:", error);
    res.status(500).json({ error: "Failed to retrieve dashboard statistics" });
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

// Create a Razorpay Order (PUBLIC WIDGET ROUTE)
app.post('/api/bookings/razorpay-order', async (req, res) => {
  const { amount, currency } = req.body;
  const botId = req.body.botId || req.query.botId || 'bot-default';

  if (!amount || !currency) {
    return res.status(400).json({ error: "Required fields: amount and currency must be provided." });
  }

  try {
    const settings = db.getSettings(botId);
    if (!settings.paymentEnabled || settings.paymentGateway !== 'razorpay') {
      return res.status(400).json({ error: "Razorpay payments are not enabled for this chatbot assistant." });
    }

    const keyId = settings.razorpayKeyId;
    const keySecret = settings.razorpayKeySecret;

    if (!keyId || !keySecret) {
      return res.status(400).json({ error: "Razorpay credentials are not configured on the server." });
    }

    // Convert amount to minor units (e.g. cents, paise)
    const amountInSubunits = Math.round(parseFloat(amount) * 100);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    
    const response = await axios.post('https://api.razorpay.com/v1/orders', {
      amount: amountInSubunits,
      currency: currency.toUpperCase(),
      receipt: `rcpt_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
    }, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({
      success: true,
      orderId: response.data.id,
      amount: amount,
      currency: currency,
      keyId: keyId
    });

  } catch (error) {
    console.error("Razorpay Order Creation Error:", error.response ? error.response.data : error.message);
    const errorMsg = error.response && error.response.data && error.response.data.error 
      ? error.response.data.error.description 
      : error.message;
    res.status(500).json({ error: `Failed to create Razorpay order: ${errorMsg}` });
  }
});

// Create a new booking (PUBLIC WIDGET ROUTE)
app.post('/api/bookings', async (req, res) => {
  const { name, email, phone, date, time, purpose, info, clientTimezone, clientFormattedTime, paymentStatus, paymentAmountPaid, paymentTransactionId, razorpayOrderId, razorpaySignature } = req.body;
  const botId = req.body.botId || req.query.botId || 'bot-default';

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: "Required details: Name, Email, Date, and Time slot must be provided." });
  }

  // Plan limit check for bookings
  const tenantUser = db.getUserByBotId(botId);
  const plan = tenantUser ? tenantUser.plan || 'free' : 'free';
  const bookings = db.getBookings(botId);

  if (plan === 'free' && bookings.length >= 5) {
    return res.status(403).json({ error: "Booking limit reached (5 maximum) for this Free Trial chatbot. Please upgrade to Pro or Advanced to book additional meetings." });
  }
  if (plan === 'pro' && bookings.length >= 50) {
    return res.status(403).json({ error: "Booking limit reached (50 maximum) for this Pro chatbot. Please upgrade to Advanced to book additional meetings." });
  }

  try {
    // Verify Payment if enabled
    const settings = db.getSettings(botId);
    if (settings && settings.paymentEnabled) {
      if (settings.paymentGateway === 'razorpay') {
        if (!paymentTransactionId || !razorpayOrderId || !razorpaySignature) {
          return res.status(400).json({ error: "Razorpay payment verification parameters are missing." });
        }
        
        const crypto = require('crypto');
        const generated_signature = crypto
          .createHmac('sha256', settings.razorpayKeySecret)
          .update(razorpayOrderId + "|" + paymentTransactionId)
          .digest('hex');

        if (generated_signature !== razorpaySignature) {
          return res.status(400).json({ error: "Payment verification failed. Invalid transaction signature." });
        }
      } else {
        // Mock gateway
        if (paymentStatus !== 'Paid' && paymentStatus !== 'paid') {
          return res.status(400).json({ error: "Payment is required to schedule this consultation." });
        }
      }
    }

    // 1. Add booking to database for this specific botId
    const booking = db.addBooking(botId, { 
      name, 
      email, 
      phone, 
      date, 
      time, 
      purpose, 
      info, 
      clientTimezone, 
      clientFormattedTime, 
      paymentStatus: (settings && settings.paymentEnabled) ? 'Paid' : 'Free', 
      paymentAmountPaid: (settings && settings.paymentEnabled) ? settings.paymentAmount : 0, 
      paymentTransactionId: paymentTransactionId || 'FREE-BOOKING'
    });
    
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
    
    // Default standard operating slots (overridden by database settings or environment variables)
    let standardSlots = [
      "09:30", "10:15", "11:00", "11:45",
      "14:00", "14:45", "15:30", "16:15", "17:00"
    ];

    const settings = db.getSettings(botId);
    if (settings && settings.bookingSlots) {
      standardSlots = settings.bookingSlots.split(',')
        .map(slot => slot.trim())
        .filter(slot => slot.length > 0);
    } else if (process.env.BOOKING_SLOTS) {
      standardSlots = process.env.BOOKING_SLOTS.split(',')
        .map(slot => slot.trim())
        .filter(slot => slot.length > 0);
    }

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
    if (safeSettings.smtpPass) {
      safeSettings.smtpPass = "●●●●●●●●●●●●";
    }
    if (safeSettings.razorpayKeySecret) {
      safeSettings.razorpayKeySecret = "●●●●●●●●●●●●";
    }
    // Completely remove sensitive keys from the settings sent to frontend
    delete safeSettings.msGraphTenantId;
    delete safeSettings.msGraphClientId;
    delete safeSettings.msGraphClientSecret;

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
    const user = db.getUsers().find(u => u.id === req.user.userId);
    const plan = user ? user.plan || 'free' : 'free';

    // Enforce custom SMTP restrictions on Free plan (MS Graph is unlocked for all)
    if (plan === 'free') {
      if (newSettings.smtpHost && newSettings.smtpHost.trim() !== "" && newSettings.smtpHost !== 'smtp.ethereal.email') {
        return res.status(403).json({ error: "Custom SMTP settings are only available on Pro or Advanced plans. Upgrade to Pro/Advanced or use Microsoft Graph." });
      }
    }

    const currentSettings = db.getSettings(botId);
    
    // If SMTP password comes back masked, do not overwrite the existing saved values!
    if (newSettings.smtpPass && (newSettings.smtpPass === "●●●●●●●●●●●●" || newSettings.smtpPass === "")) {
      delete newSettings.smtpPass;
    }
    // If Razorpay Key Secret comes back masked, do not overwrite the existing saved values!
    if (newSettings.razorpayKeySecret && (newSettings.razorpayKeySecret === "●●●●●●●●●●●●" || newSettings.razorpayKeySecret === "")) {
      delete newSettings.razorpayKeySecret;
    }
    
    // Disallow tenant admin from updating global Tata AI Cloud configuration
    delete newSettings.tataKey;
    delete newSettings.tataUrl;
    delete newSettings.tataModel;

    // Remove any sensitive API credentials sent by the frontend from database settings
    delete newSettings.msGraphTenantId;
    delete newSettings.msGraphClientId;
    delete newSettings.msGraphClientSecret;

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
    if (settings.tataKey && (settings.tataKey === "●●●●●●●●●●●●" || settings.tataKey === "")) {
      activeSettings.tataKey = currentSettings.tataKey;
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

  // Website Crawler restricted to Advanced plan only
  const user = db.getUsers().find(u => u.id === req.user.userId);
  const plan = user ? user.plan || 'free' : 'free';
  if (plan !== 'advanced') {
    return res.status(403).json({ error: "The AI Website Crawler / Brain Trainer is only available on the Advanced Plan. Upgrade your subscription to train your assistant on custom web assets." });
  }

  // Enforce crawling registered websiteUrl only
  const registeredUrl = user ? (user.websiteUrl || '') : '';
  if (!registeredUrl) {
    return res.status(400).json({ error: "No registered website URL found for this tenant account." });
  }

  const normalizeUrl = (u) => {
    return u.trim().toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .replace(/\/+$/, '');
  };

  if (normalizeUrl(url) !== normalizeUrl(registeredUrl)) {
    return res.status(400).json({ error: `Unauthorized crawl attempt. You can only crawl your registered website domain: ${registeredUrl}` });
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

    // 2. Feed corpus to Tata to generate customized brain configurations
    const brainConfig = await tataService.generateWebsiteBrain(crawlResult.corpus, url, botId);
    
    console.log(`AI Brain synthesis successful for ${url}! Automatically saving configuration to database settings...`);

    // Auto-save the newly generated configurations (overwriting settings)
    db.saveSettings(botId, {
      botName: brainConfig.botName,
      welcomeMessage: brainConfig.welcomeMessage,
      primaryColor: brainConfig.primaryColor,
      systemPrompt: brainConfig.systemPrompt,
      companyAddress: (brainConfig.extractedInfo?.location && brainConfig.extractedInfo.location !== "Not specified") ? brainConfig.extractedInfo.location : "",
      companyMapLink: (brainConfig.extractedInfo?.mapLink && brainConfig.extractedInfo.mapLink !== "Not specified") ? brainConfig.extractedInfo.mapLink : "",
      companyPhone: (brainConfig.extractedInfo?.phone && brainConfig.extractedInfo.phone !== "Not specified") ? brainConfig.extractedInfo.phone : "",
      adminEmail: db.getSettings(botId).adminEmail || req.user.username,
      companyEmail: (brainConfig.extractedInfo?.email && brainConfig.extractedInfo.email !== "Not specified") ? brainConfig.extractedInfo.email : (db.getSettings(botId).companyEmail || ""),
      companyServices: brainConfig.extractedInfo?.services || [],
      botSubTitle: `${brainConfig.botName} Assistant`
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

// Background scheduler to manage trial expirations and reminders
async function checkTrials() {
  console.log("[Trial Manager] Checking subscription trials...");
  try {
    const users = db.getUsers();
    const now = new Date();
    
    for (const user of users) {
      if (user.plan === 'advanced' && user.paymentStatus === 'trial' && user.trialEndDate) {
        const endDate = new Date(user.trialEndDate);
        
        // 1. Expiration check
        if (now >= endDate) {
          console.log(`[Trial Manager] Trial expired for user ${user.username}. Downgrading to free plan.`);
          db.updateUser(user.id, {
            plan: 'free',
            paymentStatus: 'free',
            trialEndDate: null,
            reminderSent: false
          });
        }
        // 2. 2-week warning reminder check
        else if (!user.reminderSent) {
          const diffTime = endDate - now;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          // If 14 days or less remain
          if (diffDays <= 14 && diffDays > 0) {
            console.log(`[Trial Manager] Trial expiring in ${diffDays} days for user ${user.username}. Sending email reminder.`);
            const sent = await emailService.sendTrialExpirationEmail(user.username, user.trialEndDate, user.botId);
            if (sent) {
              db.updateUser(user.id, { reminderSent: true });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Trial Manager Error] Failed to run trial checks:", err);
  }
}

// Start checking trials immediately, and then every 12 hours
checkTrials();
setInterval(checkTrials, 12 * 60 * 60 * 1000);

// Start listening
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 ANALYTIXHUB CHATBOT SERVICE IS NOW ACTIVE`);
  console.log(`🖥️  Admin Portal: http://localhost:${PORT}/admin`);
  console.log(`💬 Widget Tester: http://localhost:${PORT}/widget/widget.html`);
  console.log(`===================================================`);
});
// Reload trigger comment to refresh node watch process with updated db settings schema

