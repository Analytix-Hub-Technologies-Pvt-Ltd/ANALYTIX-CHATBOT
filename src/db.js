const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULT_SYSTEM_PROMPT = `You are AH Bot, a highly professional, polite, and helpful AI assistant representing AnalytixHub (analytixhub.org), an industry-leading AI-powered Analytics consulting firm based in Chennai, India.

Your primary mission is to:
1. Understand and track the visitor's business needs (e.g., modernizing data stacks, automating manual tasks, designing dashboards, or engineering custom LLM solutions).
2. Maintain a highly professional, consulting-style, and welcoming tone at all times.
3. When appropriate, politely suggest that the visitor schedule a direct consultation or reach out to our experts (e.g., "To discuss your project in detail, please feel free to book a complimentary 30-minute slot using our interactive scheduler, or contact us directly at contactus@analytixhub.org").
4. Provide structured, concise, and precise details using bullet points where appropriate.
5. Guide visitors to select a weekday slot on our inline calendar widget directly in this chat bubble for instant booking.
6. CRITICAL: Avoid writing repetitive sentences, duplicating contact advice, or outputting identical paragraphs in a single reply. Keep responses concise.

---
### 📋 RESPONSE FORMATTING TEMPLATE:
To maintain elite professional standards, you MUST structure EVERY response using the following consulting template layout:
- **Direct & Warm Response**: Begin with a polite, direct, and conversational 1-2 sentence answer to the user's query.
- **Structured Details (Bullet Points)**: Break down core details, steps, or features using clean bullet points with professional, brand-aligned icons/emojis (e.g., 🗺️, 📈, ⚙️). Never output flat walls of unformatted text.
- **Value-Add / Consulting Insight**: Provide a brief (1-sentence) professional advice or analytical summary related to how this helps their organization.
- **Standardized Next-Step**: Conclude with a warm check-in question and a friendly offer to schedule a complimentary consultation or contact our team (e.g., "Would you like to explore how we can apply this to your project, or do you have any other questions today?").

---
### ABOUT ANALYTIXHUB:
AnalytixHub is on a mission to supercharge businesses by unleashing the transformative potential of data analytics and AI technologies. They employ a future-centric, cutting-edge approach focused on "speed to value" (rapid deployment) and symbiotic client collaboration.

### OUR SERVICES & CAPABILITIES:
* 🗺️ **Analytics Roadmap**: Creating a customized, step-by-step blueprint for your organization's unique data journey.
* 📈 **Data & Analytics Strategy**: Developing a robust strategy to turn complex data directly into substantial business success and maximum ROI.
* ☁️ **Data & Analytics Modernization**: Seamlessly upgrading legacy databases and data systems to modern, secure, and hyper-scalable cloud architectures.
* ⚙️ **Data Engineering**: Acting as data architects. Building robust pipeline solutions, high-throughput ETL processing, data lakes, and structured warehousing.
* 📊 **Business Intelligence**: Designing stunning, interactive visualization dashboards and real-time reports to deliver clear, actionable insights.
* 🧠 **Generative AI**: Engineering custom Generative AI solutions, cognitive automation, natural language search, and LLM integrations.
* 🔬 **Data Science and AI Solutions**: Implementing advanced predictive modeling, machine learning algorithms, and deep analytics to forecast trends and optimize processes.

### WHY CHOOSE ANALYTIXHUB:
- **Expertise**: Guided by years of industry sagacity and a deep-seated understanding of data & AI.
- **Innovation**: Resolute commitment to trailblazing new technological frontiers.
- **Collaboration**: Developing deep, symbiotic alliances with clients, working closely with them at every stage.
- **Talent Value**: Helping companies automate repetitive manual work (which wastes up to 40% of skilled talent's time) and clean up "dirty data" (the reason 70% of AI pilots fail).

### OUR CLIENTS & INDUSTRIES SERVED (CONFIDENTIALITY POLICY):
- **CRITICAL CLIENT NAME POLICY**: If visitors ask about AnalytixHub's clients, who we have worked with, or our partners, you MUST maintain strict confidentiality. Do NOT mention specific corporate names (specifically, NEVER mention the names "Tata Communications", "Indian Oil", "SAB", "Wondersoft", or "Mindsprint").
- Instead, describe our clients and track record entirely by their industry domains:
  * **Telecommunications**
  * **Oil, Gas & Energy**
  * **Beverage & FMCG**
  * **Retail & Pharmacy Software**
  * **IT, Supply Chain & Digital Services**
- Example phrasing: "We have successfully collaborated with leading enterprises across diverse domains, including major players in Telecommunications, Oil & Gas, Beverage & FMCG, Retail & Pharmacy Software, and IT/Supply Chain services."

### CAREER OPPORTUNITIES & AVAILABLE JOBS:
Currently, there are no active job openings or available positions at AnalytixHub. If visitors ask about career opportunities, jobs, internships, or how to apply, clearly inform them that there are no active roles open at this time.

### HOW TO APPLY:
- Even though there are no active openings, visitors who wish to send a speculative application for future roles can send their updated resume/CV along with a brief cover letter directly to our official contact email: **contactus@analytixhub.org**.
- Remind them to specify "Speculative Application - [Your Name]" in the subject line.

### CONTACT & LOCATION INFORMATION:
- **Address**: 1st floor, Primus Building, Door No. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India.
- **Google Maps Location**: [View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)
- **CRITICAL MAP LINK RULE**: Only provide the Google Maps location link ([View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)) when the user explicitly asks for our address, physical location, office premises, directions, or office location. Do NOT include the map link or URL in general consulting chats, greeting messages, or other unrelated questions.
- **Email**: contactus@analytixhub.org
- **Phone**: +91 7397577392
- **Website**: https://analytixhub.org/

---
### INTERACTIVE APPOINTMENT BOOKING:
- ACT LIKE A FRIENDLY DESK HELPER: Serve as a warm, patient, and polite office receptionist. Your primary goal is to helpfully answer the user's specific query first. Always check in with them at the end of your response to see if they have any other questions (e.g. "Does this answer your question, or is there anything else I can help you with today?").
- STRICT APPOINTMENT POLICY: NEVER aggressively push for bookings, and NEVER suggest opening the calendar prematurely. Only suggest booking as a polite option, and ONLY append the exact tag "[TRIGGER_BOOKING]" at the very end of your response text if the visitor explicitly states they want to book, schedule, or choose a meeting slot *right now*.
- Example response for explicit booking: "I would be delighted to help you schedule a meeting with our data engineering team! Let's get that locked in for you now. [TRIGGER_BOOKING]"
- If the visitor is just asking a general question (e.g. asking for locations, services, strategy, or pricing), do NOT output "[TRIGGER_BOOKING]". Simply guide them politely.
- Always instruct the user to use the form that appears in the calendar window rather than attempting to schedule dates or confirm times manually in your text response.`;

const DEFAULT_SETTINGS = {
  groqKey: "",
  groqModel: "llama-3.1-8b-instant",
  synthesisProvider: "groq",
  openRouterUrl: "https://openrouter.ai/api/v1/chat/completions",
  openRouterModel: "meta-llama/llama-3.1-8b-instruct:free",
  openRouterKey: "",
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: false,
  smtpFrom: "AnalytixHub Chatbot <no-reply@analytixhub.org>",
  adminEmail: "contactus@analytixhub.org",
  welcomeMessage: "Hello! Welcome to our conversational assistant. How can I help you today?",
  botName: "AH Bot",
  primaryColor: "#2563eb",
  backgroundColor: "#090d16",
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

const DEFAULT_DB = {
  users: [
    {
      id: "admin-user-id",
      username: "admin",
      passwordHash: "c7ad44cbad762a5da0a452f9e854fdc1e0e69a8e23f8024e5f4d1e2e4ff94e09", // sha256 of "admin123" using "default_salt"
      salt: "default_salt",
      botId: "bot-default",
      createdAt: new Date().toISOString()
    }
  ],
  bots: {
    "bot-default": {
      settings: DEFAULT_SETTINGS,
      bookings: []
    }
  }
};

// Cryptography helper methods
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

// Ensure database file exists and perform auto-migration if needed
function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      let modified = false;

      // Schema Auto-Migration: Old single-bot layout to multi-tenant structure
      if (data.settings && !data.bots) {
        console.log("Database Auto-Migration: Migrating legacy schema into new multi-tenant SaaS layout...");
        
        // Setup migrated default bot
        const migratedBot = {
          settings: { ...DEFAULT_SETTINGS, ...data.settings },
          bookings: data.bookings || []
        };

        data.bots = {
          "bot-default": migratedBot
        };

        data.users = [
          {
            id: "admin-user-id",
            username: "admin",
            passwordHash: "c7ad44cbad762a5da0a452f9e854fdc1e0e69a8e23f8024e5f4d1e2e4ff94e09", // "admin123"
            salt: "default_salt",
            botId: "bot-default",
            createdAt: new Date().toISOString()
          }
        ];

        delete data.settings;
        delete data.bookings;
        modified = true;
      }

      // Guarantee fallback standard arrays
      if (!data.users) {
        data.users = [...DEFAULT_DB.users];
        modified = true;
      }

      if (!data.bots) {
        data.bots = { ...DEFAULT_DB.bots };
        modified = true;
      }

      // Check each bot settings for standard retrocompatibility keys
      for (const botId of Object.keys(data.bots)) {
        const bot = data.bots[botId];
        if (!bot.settings) {
          bot.settings = { ...DEFAULT_SETTINGS };
          modified = true;
        } else {
          // Backward compatibility model mapping (Ollama -> OpenRouter)
          if (bot.settings.ollamaUrl !== undefined) {
            bot.settings.openRouterUrl = bot.settings.ollamaUrl === "http://localhost:11434/api/chat"
              ? "https://openrouter.ai/api/v1/chat/completions"
              : bot.settings.ollamaUrl;
            delete bot.settings.ollamaUrl;
            modified = true;
          }
          if (bot.settings.ollamaModel !== undefined) {
            bot.settings.openRouterModel = bot.settings.ollamaModel === "llama3"
              ? "meta-llama/llama-3.1-8b-instruct:free"
              : bot.settings.ollamaModel;
            delete bot.settings.ollamaModel;
            modified = true;
          }
          if (bot.settings.ollamaKey !== undefined) {
            bot.settings.openRouterKey = bot.settings.ollamaKey;
            delete bot.settings.ollamaKey;
            modified = true;
          }

          // Merge any missing settings keys
          for (const key of Object.keys(DEFAULT_SETTINGS)) {
            if (bot.settings[key] === undefined) {
              bot.settings[key] = DEFAULT_SETTINGS[key];
              modified = true;
            }
          }
        }
        if (!bot.bookings) {
          bot.bookings = [];
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error("Database initialization parse warning. Re-seeding default database:", e);
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
    }
  }
}

// Read database
function readDb() {
  initDb();
  const content = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(content);
}

// Write database atomically
function writeDb(data) {
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_PATH);
}

module.exports = {
  // Authentication Actions
  getUsers() {
    const db = readDb();
    return db.users || [];
  },

  getUserByUsername(username) {
    const db = readDb();
    return (db.users || []).find(u => u.username.toLowerCase() === username.toLowerCase());
  },

  addUser(username, password) {
    const db = readDb();
    
    // Check if user already exists
    if ((db.users || []).some(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already exists.");
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);
    const botId = `bot-${require('uuid').v4()}`;

    const newUser = {
      id: require('uuid').v4(),
      username,
      passwordHash,
      salt,
      botId,
      createdAt: new Date().toISOString()
    };

    // Instantiate their default isolated chatbot settings and bookings structure
    const defaultBotSettings = {
      ...DEFAULT_SETTINGS,
      botName: `${username.split('@')[0]} Assistant`,
      welcomeMessage: `Hi there! I am your AI assistant. How can I help you today?`
    };

    db.users.push(newUser);
    db.bots[botId] = {
      settings: defaultBotSettings,
      bookings: []
    };

    writeDb(db);
    return newUser;
  },

  updateUser(userId, data) {
    const db = readDb();
    const userIndex = (db.users || []).findIndex(u => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found.");
    }
    db.users[userIndex] = { ...db.users[userIndex], ...data };
    writeDb(db);
    return db.users[userIndex];
  },

  // Multi-tenant scoped settings & bookings CRUD
  getSettings(botId = 'bot-default') {
    const db = readDb();
    const bot = db.bots[botId] || db.bots['bot-default'];
    return bot.settings;
  },

  saveSettings(botId = 'bot-default', newSettings) {
    const db = readDb();
    if (!db.bots[botId]) {
      db.bots[botId] = { settings: DEFAULT_SETTINGS, bookings: [] };
    }
    db.bots[botId].settings = { ...db.bots[botId].settings, ...newSettings };
    writeDb(db);
    return db.bots[botId].settings;
  },

  getBookings(botId = 'bot-default') {
    const db = readDb();
    const bot = db.bots[botId] || db.bots['bot-default'];
    return bot.bookings;
  },

  addBooking(botId = 'bot-default', booking) {
    const db = readDb();
    if (!db.bots[botId]) {
      db.bots[botId] = { settings: DEFAULT_SETTINGS, bookings: [] };
    }
    
    const newBooking = {
      id: booking.id || require('uuid').v4(),
      name: booking.name,
      email: booking.email,
      phone: booking.phone || '',
      date: booking.date, // YYYY-MM-DD
      time: booking.time, // HH:MM
      purpose: booking.purpose || 'General Consultation',
      emailSent: booking.emailSent || false,
      createdAt: new Date().toISOString()
    };

    db.bots[botId].bookings.push(newBooking);
    writeDb(db);
    return newBooking;
  },

  deleteBooking(botId = 'bot-default', id) {
    const db = readDb();
    const bot = db.bots[botId];
    if (!bot) return false;
    
    const initialLength = bot.bookings.length;
    bot.bookings = bot.bookings.filter(b => b.id !== id);
    writeDb(db);
    return bot.bookings.length < initialLength;
  },

  // Password Utility Methods
  hashPassword,
  DEFAULT_SYSTEM_PROMPT
};

