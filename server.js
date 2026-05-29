require('dotenv').config();
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

// Serve Static Frontends (Admin Dashboard, Chat Widget, Embed script)
app.get('/admin', (req, res) => res.redirect('/admin/admin.html'));
app.get('/admin/', (req, res) => res.redirect('/admin/admin.html'));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// CHAT API
// -------------------------------------------------------------
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid message payload" });
  }

  try {
    const aiResponse = await groqService.getChatResponse(messages);
    res.json({ response: aiResponse });
  } catch (error) {
    console.error("Express Chat Route Error:", error);
    res.status(500).json({ error: "Failed to generate chat response" });
  }
});

// -------------------------------------------------------------
// BOOKINGS APIs
// -------------------------------------------------------------
// Get list of all booked appointments
app.get('/api/bookings', (req, res) => {
  try {
    const bookings = db.getBookings();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve bookings" });
  }
});

// Create a new booking
app.post('/api/bookings', async (req, res) => {
  const { name, email, phone, date, time, purpose } = req.body;

  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: "Required details: Name, Email, Date, and Time slot must be provided." });
  }

  try {
    // 1. Add booking to database
    const booking = db.addBooking({ name, email, phone, date, time, purpose });
    
    // 2. Dispatch email notifications asynchronously
    let emailSent = false;
    try {
      emailSent = await emailService.sendBookingEmails(booking);
      if (emailSent) {
        // Update booking entry to show emails were sent successfully
        const bookings = db.getBookings();
        const bIndex = bookings.findIndex(b => b.id === booking.id);
        if (bIndex !== -1) {
          bookings[bIndex].emailSent = true;
          // Update DB
          const dbModule = require('./src/db');
          const fullDb = { settings: dbModule.getSettings(), bookings };
          const fs = require('fs');
          const dbPath = path.join(__dirname, 'data', 'db.json');
          fs.writeFileSync(dbPath, JSON.stringify(fullDb, null, 2), 'utf-8');
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

// Delete an appointment slot
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  try {
    const success = db.deleteBooking(id);
    if (success) {
      res.json({ message: "Booking cancelled successfully" });
    } else {
      res.status(404).json({ error: "Booking record not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

// Check slots availability for a given date
app.get('/api/bookings/available-slots', (req, res) => {
  const { date } = req.query; // format: YYYY-MM-DD
  if (!date) return res.status(400).json({ error: "Date parameter required" });

  try {
    const bookings = db.getBookings();
    
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
// Get public settings (masks password)
app.get('/api/settings', (req, res) => {
  try {
    const settings = db.getSettings();
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

    res.json(safeSettings);
  } catch (error) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// Save settings from dashboard
app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  
  try {
    const currentSettings = db.getSettings();
    
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

    const updated = db.saveSettings(newSettings);
    res.json({ success: true, message: "Settings saved successfully!", settings: updated });
  } catch (error) {
    console.error("Save Settings Error:", error);
    res.status(500).json({ error: "Failed to update configurations" });
  }
});

// Automatically create a free test Ethereal SMTP account and save it to configurations
app.post('/api/settings/generate-test-smtp', async (req, res) => {
  const nodemailer = require('nodemailer');
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
        smtpFrom: `AnalytixHub Chatbot Test <${account.user}>`
      };

      const updated = db.saveSettings(generated);
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

// Send a test email from the Settings panel
app.post('/api/bookings/test-email', async (req, res) => {
  const { testEmail, settings } = req.body;

  if (!testEmail) {
    return res.status(400).json({ error: "Test email address must be provided." });
  }

  try {
    // If password/key are masked, pull them from the current DB
    const currentSettings = db.getSettings();
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
// WEB CRAWLER & AI BRAIN GENERATION API
// -------------------------------------------------------------
app.post('/api/scraper/crawl', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: "Website URL must be provided." });
  }

  try {
    const scraperService = require('./src/services/scraper');
    
    console.log(`Starting crawl request for URL: ${url}`);
    
    // Delete/clear the existing system prompt from database configurations first
    console.log("Deleting existing system prompt from database settings...");
    db.saveSettings({ systemPrompt: "" });
    
    // 1. Run recursive scraper
    const crawlResult = await scraperService.crawlWebsite(url, 8);
    
    if (!crawlResult.pagesCrawled || crawlResult.pagesCrawled.length === 0) {
      return res.status(500).json({ error: "The crawler was unable to extract any text from this website. Please verify that the URL is public and allows crawlers." });
    }

    console.log(`Crawl completed. Crawled ${crawlResult.pagesCrawled.length} pages. Total words: ${crawlResult.totalWords}. Triggering Groq Prompt synthesis...`);

    // 2. Feed corpus to Groq to generate customized brain configurations, passing the crawled URL
    const brainConfig = await groqService.generateWebsiteBrain(crawlResult.corpus, url);
    
    console.log(`AI Brain synthesis successful for ${url}! Automatically saving configuration to database settings...`);

    // Auto-save the newly generated configurations (overwriting settings)
    db.saveSettings({
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
