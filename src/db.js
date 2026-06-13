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

**CRITICAL**: Do NOT output the section titles, labels, or names (such as "Direct & Warm Response", "Structured Details", "Value-Add / Consulting Insight", or "Standardized Next-Step") in your final response. Just output the content blocks formatted with paragraphs and bullet points.

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
### 🤝 FRIENDLY VISITOR INFO COLLECTION POLICY:
- **Tone & Demeanor**: Maintain an exceptionally warm, friendly, conversational, and welcoming tone at all times. Use expressions like "I'd love to help you with that!", "That sounds like a great project!", etc.
- **Friendly Information Request**: If visitors are hesitant or state they do not want to share their details (e.g. name, email, or company), respond in an extremely polite and understanding way. Gently try to obtain it by explaining why we need it:
  - Explain that we ask for their name and email so that our specialized consulting team can reach out to them directly with a personalized strategy proposal, detailed answers to their questions, or follow up on their booking.
  - Assure them: "We only ask for this information so we can stay in touch and send you the custom roadmap we discussed. We respect your privacy completely!"
- **Phone Number Flexibility**: The visitor's phone number is NOT important. Do NOT press them or emphasize collecting their phone number. If they do not want to provide it, simply skip it and move forward with their name and email.

---
### INTERACTIVE APPOINTMENT BOOKING:
- ACT LIKE A FRIENDLY DESK HELPER: Serve as a warm, patient, and polite office receptionist. Your primary goal is to helpfully answer the user's specific query first. Always check in with them at the end of your response to see if they have any other questions (e.g. "Does this answer your question, or is there anything else I can help you with today?").
- STRICT APPOINTMENT POLICY: NEVER aggressively push for bookings, and NEVER suggest opening the calendar prematurely. Only suggest booking as a polite option, and ONLY append the exact tag "[TRIGGER_BOOKING]" at the very end of your response text if the visitor explicitly states they want to book, schedule, or choose a meeting slot *right now*.
- Example response for explicit booking: "I would be delighted to help you schedule a meeting with our data engineering team! Let's get that locked in for you now. [TRIGGER_BOOKING]"
- If the visitor is just asking a general question (e.g. asking for locations, services, strategy, or pricing), do NOT output "[TRIGGER_BOOKING]". Simply guide them politely.
- Always instruct the user to use the form that appears in the calendar window rather than attempting to schedule dates or confirm times manually in your text response.`;

const DEFAULT_SETTINGS = {
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  smtpSecure: false,
  smtpFrom: "AnalytixHub Chatbot <no-reply@analytixhub.org>",
  adminEmail: "contactus@analytixhub.org",
  welcomeMessage: "Hello! Welcome to our conversational assistant. How can I help you today?",
  botName: "AH Bot",
  primaryColor: "#4f46e5",
  backgroundColor: "#ffffff",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  botSubTitle: "AnalytixHub Consultant",
  companyAddress: "1st floor, Primus Building, Door No. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India.",
  companyPhone: "+91 7397577392",
  companyMapLink: "https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032",
  companyWebsite: "https://analytixhub.org",
  companyEmail: "contactus@analytixhub.org",
  bookingSlots: "09:30,10:15,11:00,11:45,14:00,14:45,15:30,16:15,17:00",
  bookingTimezone: "Asia/Kolkata",
  paymentEnabled: false,
  paymentGateway: "mock",
  paymentAmount: 15.00,
  paymentCurrency: "USD",
  paymentInstructions: "Mock payment mode: Use test card 4242 4242 4242 4242, any future expiry date, and any CVC to confirm the consultation.",
  razorpayKeyId: "",
  razorpayKeySecret: ""
};


const DEFAULT_DB = {
  users: [
    {
      id: "admin-user-id",
      username: "admin",
      passwordHash: "c7ad44cbad762a5da0a452f9e854fdc1e0e69a8e23f8024e5f4d1e2e4ff94e09", // sha256 of "admin123" using "default_salt"
      salt: "default_salt",
      botId: "bot-default",
      plan: "free",
      createdAt: new Date().toISOString()
    }
  ],
  bots: {
    "bot-default": {
      settings: DEFAULT_SETTINGS,
      bookings: [],
      conversations: []
    }
  },
  globalSettings: {
    tataKey: "",
    tataUrl: "https://models.cloudservices.tatacommunications.com/v1",
    tataModel: "meta/Llama-3.3-70B-Instruct"
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

      // Migrate existing users to have a plan field if missing
      if (data.users && Array.isArray(data.users)) {
        data.users.forEach(u => {
          if (u.plan === undefined) {
            u.plan = 'free';
            modified = true;
          }
        });
      }

      if (!data.bots) {
        data.bots = { ...DEFAULT_DB.bots };
        modified = true;
      }

      if (!data.globalSettings) {
        // Retrieve keys from first bot if available to preserve existing migration
        let firstBotSettings = {};
        if (data.bots && Object.keys(data.bots).length > 0) {
          const firstBotId = Object.keys(data.bots)[0];
          firstBotSettings = data.bots[firstBotId].settings || {};
        }
        data.globalSettings = {
          tataKey: firstBotSettings.tataKey || process.env.TATA_API_KEY || "",
          tataUrl: firstBotSettings.tataUrl || process.env.TATA_BASE_URL || "https://models.cloudservices.tatacommunications.com/v1",
          tataModel: firstBotSettings.tataModel || process.env.TATA_MODEL || "meta/Llama-3.3-70B-Instruct"
        };
        modified = true;
      }

      // Also clean up local bot settings from any Tata settings
      if (data.bots) {
        for (const botId of Object.keys(data.bots)) {
          const bot = data.bots[botId];
          if (bot.settings) {
            if (bot.settings.tataKey !== undefined) {
              delete bot.settings.tataKey;
              modified = true;
            }
            if (bot.settings.tataUrl !== undefined) {
              delete bot.settings.tataUrl;
              modified = true;
            }
            if (bot.settings.tataModel !== undefined) {
              delete bot.settings.tataModel;
              modified = true;
            }
          }
        }
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

          // Migrate Groq & OpenRouter -> Tata Communications
          if (bot.settings.groqKey !== undefined || bot.settings.openRouterKey !== undefined) {
            bot.settings.tataKey = bot.settings.tataKey || bot.settings.groqKey || bot.settings.openRouterKey || "";
            bot.settings.tataUrl = bot.settings.tataUrl || "https://models.cloudservices.tatacommunications.com/v1";
            bot.settings.tataModel = bot.settings.tataModel || "meta/Llama-3.3-70B-Instruct";

            delete bot.settings.groqKey;
            delete bot.settings.groqModel;
            delete bot.settings.synthesisProvider;
            delete bot.settings.openRouterUrl;
            delete bot.settings.openRouterModel;
            delete bot.settings.openRouterKey;
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
        if (!bot.conversations) {
          bot.conversations = [];
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

function extractVisitorInfo(messages) {
  let email = null;
  let phone = null;
  let name = null;
  let company = null;
  let needs = null;

  if (Array.isArray(messages)) {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const content = msg.content || '';
        
        // 1. Extract email
        const emailMatch = content.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          email = emailMatch[1];
        }

        // 2. Extract phone number
        const phoneMatch = content.match(/(\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4})/);
        if (phoneMatch) {
          phone = phoneMatch[1];
        }

        // 3. Extract name: Look for patterns (case-insensitive)
        const namePatterns = [
          /my name is\s+([a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)/i,
          /i am\s+([a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)/i,
          /i'm\s+([a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)/i,
          /this is\s+([a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)/i,
          /call me\s+([a-zA-Z-]{2,}(?:\s+[a-zA-Z-]{2,})?)/i
        ];
        for (const pattern of namePatterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const val = match[1].trim();
            const commonStopwords = ['a', 'an', 'the', 'interested', 'looking', 'here', 'planning', 'trying', 'ready', 'happy', 'new', 'testing', 'just', 'hello', 'hi', 'hey', 'very', 'not', 'no', 'yes', 'fine', 'good', 'some', 'any'];
            if (!commonStopwords.includes(val.toLowerCase())) {
              name = val.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              break;
            }
          }
        }

        // 4. Extract company: "my company is X", "work at X", "represent X", "company name is X"
        const companyPatterns = [
          /my company is\s+([a-zA-Z0-9\s.-]{2,})/i,
          /i work at\s+([a-zA-Z0-9\s.-]{2,})/i,
          /represent\s+([a-zA-Z0-9\s.-]{2,})/i,
          /company name is\s+([a-zA-Z0-9\s.-]{2,})/i
        ];
        for (const pattern of companyPatterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const rawVal = match[1].trim();
            const val = rawVal.split(/\s+(?:and|or|but|for|with|to|from|on|at|we|i|you|they|he|she)\b/i)[0].trim().split(/[.,]/)[0].trim();
            const commonStopwords = ['a', 'an', 'the', 'some', 'any', 'my', 'your', 'our'];
            if (!commonStopwords.includes(val.toLowerCase())) {
              company = val;
              break;
            }
          }
        }

        // 5. Extract needs: "looking for X", "need X", "want X", "interested in X"
        const needsPatterns = [
          /(?:looking for|need|want|interested in)\s+([a-zA-Z0-9\s.-]{4,})/i
        ];
        for (const pattern of needsPatterns) {
          const match = content.match(pattern);
          if (match && match[1]) {
            const rawVal = match[1].trim();
            const val = rawVal.split(/\s+(?:and|or|but|for|with|to|from|on|at|we|i|you|they|he|she)\b/i)[0].trim().split(/[.,]/)[0].trim();
            needs = val;
            break;
          }
        }
      }
    }
  }
  return { email, phone, name, company, needs };
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
      plan: 'free',
      paymentStatus: 'unpaid',
      amountPaid: 0,
      transactionId: null,
      trialStartDate: null,
      trialEndDate: null,
      reminderSent: false,
      createdAt: new Date().toISOString()
    };

    // Derive generic organization details and domain from username/email
    const userDomain = username.includes('@') ? username.split('@')[1] : 'yourdomain.com';
    const rawOrgName = username.includes('@') ? username.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ') : username;
    const formattedOrgName = rawOrgName.charAt(0).toUpperCase() + rawOrgName.slice(1);
    const newBotName = `${formattedOrgName} Assistant`;

    // Initialize custom system prompt derived from defaults
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    systemPrompt = systemPrompt.replace(/contactus@analytixhub\.org/gi, username);
    systemPrompt = systemPrompt.replace(/analytixhub\.org/gi, userDomain);
    systemPrompt = systemPrompt.replace(/AnalytixHub/gi, formattedOrgName);
    systemPrompt = systemPrompt.replace(/AH Bot/g, newBotName);
    systemPrompt = systemPrompt.replace(/Chennai, India/g, 'our virtual headquarters');
    systemPrompt = systemPrompt.replace("1st floor, Primus Building, Door No. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India.", "our virtual headquarters");
    systemPrompt = systemPrompt.replace("- **Google Maps Location**: [View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)", "");
    systemPrompt = systemPrompt.replace("- **CRITICAL MAP LINK RULE**: Only provide the Google Maps location link ([View Chennai Office on Google Maps](https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032)) when the user explicitly asks for our address, physical location, office premises, directions, or office location. Do NOT include the map link or URL in general consulting chats, greeting messages, or other unrelated questions.", "");
    systemPrompt = systemPrompt.replace(/\+91\s*7397577392/g, 'our contact line');

    // Instantiate their default isolated chatbot settings and bookings structure
    const defaultBotSettings = {
      ...DEFAULT_SETTINGS,
      botName: newBotName,
      botSubTitle: `${formattedOrgName} Consultant`,
      welcomeMessage: `Hi there! I am your AI assistant representing ${formattedOrgName}. How can I help you today?`,
      adminEmail: username,
      smtpFrom: `${newBotName} <no-reply@${userDomain}>`,
      companyAddress: "our virtual headquarters",
      companyPhone: "",
      companyMapLink: "",
      companyWebsite: `https://${userDomain}`,
      systemPrompt: systemPrompt
    };

    db.users.push(newUser);
    db.bots[botId] = {
      settings: defaultBotSettings,
      bookings: [],
      conversations: []
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
    const bot = db.bots[botId] || db.bots['bot-default'] || Object.values(db.bots)[0];
    return bot ? bot.settings : DEFAULT_SETTINGS;
  },

  saveSettings(botId = 'bot-default', newSettings) {
    const db = readDb();
    if (!db.bots[botId]) {
      db.bots[botId] = { settings: DEFAULT_SETTINGS, bookings: [], conversations: [] };
    }
    db.bots[botId].settings = { ...db.bots[botId].settings, ...newSettings };
    writeDb(db);
    return db.bots[botId].settings;
  },

  getBookings(botId = 'bot-default') {
    const db = readDb();
    const bot = db.bots[botId] || db.bots['bot-default'] || Object.values(db.bots)[0];
    return bot ? bot.bookings : [];
  },

  addBooking(botId = 'bot-default', booking) {
    const db = readDb();
    if (!db.bots[botId]) {
      db.bots[botId] = { settings: DEFAULT_SETTINGS, bookings: [], conversations: [] };
    }
    
    const newBooking = {
      id: booking.id || require('uuid').v4(),
      name: booking.name,
      email: booking.email,
      phone: booking.phone || '',
      date: booking.date, // YYYY-MM-DD
      time: booking.time, // HH:MM
      purpose: booking.purpose || 'General Consultation',
      info: booking.info || '',
      clientTimezone: booking.clientTimezone || '',
      clientFormattedTime: booking.clientFormattedTime || '',
      emailSent: booking.emailSent || false,
      paymentStatus: booking.paymentStatus || 'N/A',
      paymentAmountPaid: booking.paymentAmountPaid || '',
      paymentTransactionId: booking.paymentTransactionId || '',
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

  getConversations(botId = 'bot-default') {
    const db = readDb();
    const bot = db.bots[botId] || db.bots['bot-default'] || Object.values(db.bots)[0];
    return bot ? (bot.conversations || []) : [];
  },

  recordChatMetrics(botId = 'bot-default', conversationId, latency = 0, messages = [], ipAddress = '', location = '') {
    const dbData = readDb();
    let bot = dbData.bots[botId];
    if (!bot) {
      bot = dbData.bots['bot-default'] || Object.values(dbData.bots)[0];
    }
    if (!bot) return;

    if (!bot.conversations) {
      bot.conversations = [];
    }

    let conv = bot.conversations.find(c => c.id === conversationId);
    if (!conv) {
      conv = {
        id: conversationId,
        createdAt: new Date().toISOString(),
        messagesCount: 0,
        lastMessageAt: new Date().toISOString(),
        lastLatency: latency,
        ipAddress: ipAddress || 'Unknown',
        location: location || 'Unknown Location',
        visitorName: null,
        visitorEmail: null,
        visitorPhone: null,
        visitorCompany: null,
        visitorNeeds: null,
        messages: []
      };
      bot.conversations.push(conv);
    }

    if (messages && messages.length > 0) {
      conv.messages = messages;
      conv.messagesCount = messages.length;
      
      const info = extractVisitorInfo(messages);
      if (info.email) conv.visitorEmail = info.email;
      if (info.phone) conv.visitorPhone = info.phone;
      if (info.name) conv.visitorName = info.name;
      if (info.company) conv.visitorCompany = info.company;
      if (info.needs) conv.visitorNeeds = info.needs;
    } else {
      conv.messagesCount += 1;
    }

    conv.lastMessageAt = new Date().toISOString();
    if (latency > 0) {
      conv.lastLatency = latency;
    }

    if (ipAddress) {
      conv.ipAddress = ipAddress;
    }
    if (location) {
      conv.location = location;
    }

    writeDb(dbData);
    return conv;
  },

  getUserByBotId(botId) {
    const db = readDb();
    return (db.users || []).find(u => u.botId === botId);
  },

  deleteTenant(userId) {
    const db = readDb();
    const userIndex = (db.users || []).findIndex(u => u.id === userId);
    if (userIndex === -1) return false;
    
    const user = db.users[userIndex];
    db.users.splice(userIndex, 1);
    
    if (user.botId && db.bots[user.botId]) {
      delete db.bots[user.botId];
    }
    
    writeDb(db);
    return true;
  },

  updateTenantPlan(userId, plan) {
    const db = readDb();
    const userIndex = (db.users || []).findIndex(u => u.id === userId);
    if (userIndex === -1) return false;
    
    db.users[userIndex].plan = plan;
    
    // Also update billing status based on the selected plan from Super Admin
    if (plan === 'free') {
      db.users[userIndex].paymentStatus = 'free';
      db.users[userIndex].amountPaid = 0;
      db.users[userIndex].transactionId = 'FREE-UPGRADE';
    } else if (plan === 'pro') {
      db.users[userIndex].paymentStatus = 'paid';
      db.users[userIndex].amountPaid = 20;
      db.users[userIndex].transactionId = 'TXN-SUPER-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    } else if (plan === 'advanced') {
      db.users[userIndex].paymentStatus = 'paid';
      db.users[userIndex].amountPaid = 30;
      db.users[userIndex].transactionId = 'TXN-SUPER-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    writeDb(db);
    return db.users[userIndex];
  },

  getBots() {
    const db = readDb();
    return db.bots || {};
  },

  getGlobalSettings() {
    const db = readDb();
    const defaultGlobal = {
      tataKey: "",
      tataUrl: "https://models.cloudservices.tatacommunications.com/v1",
      tataModel: "meta/Llama-3.3-70B-Instruct",
      razorpayKeyId: "",
      razorpayKeySecret: ""
    };
    return { ...defaultGlobal, ...(db.globalSettings || {}) };
  },

  saveGlobalSettings(newSettings) {
    const db = readDb();
    db.globalSettings = { ...(db.globalSettings || {}), ...newSettings };
    writeDb(db);
    return db.globalSettings;
  },

  // Password Utility Methods
  hashPassword,
  DEFAULT_SYSTEM_PROMPT
};

