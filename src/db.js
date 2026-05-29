const fs = require('fs');
const path = require('path');

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

const DEFAULT_DB = {
  settings: {
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
    welcomeMessage: "Hello! I am AH Bot, your AnalytixHub AI assistant. How can I help you today?",
    botName: "AH Bot",
    primaryColor: "#2563eb",
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  },
  bookings: []
};

// Ensure database file exists
function initDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
  } else {
    // Check for missing keys in existing settings to guarantee backward compatibility
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      let modified = false;
      
      if (!data.settings) {
        data.settings = { ...DEFAULT_DB.settings };
        modified = true;
      } else {
        // Migrate Ollama fields to OpenRouter fields
        if (data.settings.ollamaUrl !== undefined) {
          data.settings.openRouterUrl = data.settings.ollamaUrl === "http://localhost:11434/api/chat"
            ? "https://openrouter.ai/api/v1/chat/completions"
            : data.settings.ollamaUrl;
          delete data.settings.ollamaUrl;
          modified = true;
        }
        if (data.settings.ollamaModel !== undefined) {
          data.settings.openRouterModel = data.settings.ollamaModel === "llama3"
            ? "meta-llama/llama-3.1-8b-instruct:free"
            : data.settings.ollamaModel;
          delete data.settings.ollamaModel;
          modified = true;
        }
        if (data.settings.ollamaKey !== undefined) {
          data.settings.openRouterKey = data.settings.ollamaKey;
          delete data.settings.ollamaKey;
          modified = true;
        }

        for (const key of Object.keys(DEFAULT_DB.settings)) {
          if (data.settings[key] === undefined) {
            data.settings[key] = DEFAULT_DB.settings[key];
            modified = true;
          }
        }
      }
      
      if (!data.bookings) {
        data.bookings = [];
        modified = true;
      }
      
      if (modified) {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      // Re-initialize if JSON is corrupt
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
  const dir = path.dirname(DB_PATH);
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, DB_PATH);
}

module.exports = {
  getSettings() {
    const db = readDb();
    return db.settings;
  },

  saveSettings(newSettings) {
    const db = readDb();
    db.settings = { ...db.settings, ...newSettings };
    writeDb(db);
    return db.settings;
  },

  getBookings() {
    const db = readDb();
    return db.bookings;
  },

  addBooking(booking) {
    const db = readDb();
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
    db.bookings.push(newBooking);
    writeDb(db);
    return newBooking;
  },

  deleteBooking(id) {
    const db = readDb();
    const initialLength = db.bookings.length;
    db.bookings = db.bookings.filter(b => b.id !== id);
    writeDb(db);
    return db.bookings.length < initialLength;
  },
  
  DEFAULT_SYSTEM_PROMPT
};
