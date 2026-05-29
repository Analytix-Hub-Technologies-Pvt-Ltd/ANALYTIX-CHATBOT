# 🤖 AnalytixHub AI Consulting Assistant Suite (Production-Grade)

Welcome to the official, production-grade repository of the **AnalytixHub AI Consulting Assistant Suite**. This system is an automated, lead-converting, glassmorphic conversational widget built specifically for data consultancy firms. It engages visitors with non-intrusive AI speech bubbles, showcases interactive service cards, and schedules consultation calls instantly, sending lead notifications to the sales team.

---

## 🌟 Key Features & Achievements

### 1. 💬 Aesthetic Speech Bubble Welcomer
* **Dynamic Welcome Popup**: Replaces standard intrusive full-screen autostarts. After **1 second** of page load, a clean dark-glass speech bubble reading `"Hiii! Let me help you! 👋"` slides out next to the launcher bot.
* **Auto-Expand & Dismiss**: Visitors can click the bubble text to automatically slide open the consulting panel, or dismiss it with the clean close button (`x`).
* **Cross-Window Bridge (`postMessage`)**: Frontend and Iframe communicate seamlessly to handle resizing, minimizing, and visual states.

### 2. 🎨 Elite Glassmorphic Conversational UI
* **Vercel/Apple Aesthetic**: Built with beautiful backdrop blurs, Harmonious HSL colors, high-contrast text, and premium vector icons (powered by Lucide).
* **Stacked suggestion bar**: 
  * **Primary Action**: A full-width, highly prominent gradient indigo button: `Book a Consultation` (glowing & pulsing calendar style).
  * **Secondary Suggestions**: Equal-split `Our Services` and `Office Location` suggestion pills sitting side-by-side (50/50 split), preventing layout scrollbars or text-clipping.
* **Responsive Viewport Height (`calc(100vh - 120px)`)**: The widget adapts perfectly to short laptop screens and high-resolution desktop monitors, ensuring the purple header and avatar are never clipped.
* **Sleek Custom Scrollbars**: Slim, translucent Webkit scrollbars that blend seamlessly with the dark UI layout.

### 3. 📅 Interactive Inline Calendar Scheduler
* **Visual Appointment Picker**: Clients select dates on a visual calendar grid styled with rounded blocks (`radius-lg`) and pick available 30-minute time slots (IST timezone).
* **Automated Lead Booking**: Captures the prospect's Name, Email, Phone, Consultation Topic, and Time Slot, persisting it instantly in a secure database.

### 4. ⚙️ Admin Portal & Sandbox SMTP Generator
* **Central Management System**: Access settings and leads via a secure portal (`/admin`).
* **One-Click SMTP Sandbox Account**: Built with Nodemailer and Ethereal Mail. If you don't have corporate SMTP details, click **"Generate Free Sandbox SMTP"** to provision a free testing inbox instantly!
* **Leads Manager**: Admins can inspect customer leads, download a clean Excel/CSV sheet, and monitor booking timestamps.

---

## 📂 System Architecture & File Directory

```bash
ah_chatbot/
├── .env                  # Environment configurations (API keys & Ports)
├── server.js             # Express core router, static file delivery & SMTP accounts generator
├── package.json          # Node script commands & dependencies
├── data/
│   └── db.json           # Secure JSON Database (Settings, credentials, and leads)
├── src/
│   ├── db.js             # Database read/write utility models
│   └── services/
│       ├── groq.js       # Groq AI LLM inference pipeline (System prompts & brain)
│       └── email.js      # Nodemailer automated lead dispatcher (HTML corporate templates)
└── public/
    ├── embed.js          # Main embed script (handles page injection, speech bubble & iframe resize)
    ├── demo.html         # Interactive web sandbox to test the live chat widget
    ├── admin/            # Secure Corporate Control Center
    │   ├── admin.html    # Configuration portal layout (Lead logs & settings form)
    │   ├── admin.css     # Settings panel styling
    │   └── admin.js      # API loader, CSV exporter & Sandbox SMTP handler
    └── widget/           # Chatbot Widget Iframe application
        ├── widget.html   # Main conversational UI & Scheduler booking form structure
        ├── widget.css    # Full glassmorphic style system (Reset body, container, cards & custom scrollbars)
        └── widget.js     # Chat submission, API handlers, Lucide drawer & calendar engine
```

---

## 🛠️ Installation & Setup Guide

### 1. Requirements
Ensure you have **Node.js** (v16+) installed on your server environment.

### 2. Standard Installation
In your terminal, navigate to the root directory and install dependencies:
```bash
npm install
```

### 3. Configure Variables
Create or open the `.env` file in the root directory:
```env
PORT=3000
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Start the Application
Launch the consulting server:
```bash
npm start
```
The server will boot and display your active endpoints:
```text
🚀 ANALYTIXHUB CHATBOT SERVICE IS NOW ACTIVE
🖥️  Admin Portal: http://localhost:3000/admin
💬 Widget Tester: http://localhost:3000/widget/widget.html
```

---

## 🔌 Integrating the Chatbot on Live Websites

To embed the AnalytixHub Assistant on your official website (WordPress, Webflow, custom HTML, etc.), copy and paste this script tag right before the closing `</body>` tag on your website footer:

```html
<!-- AnalytixHub AI Chatbot Embed -->
<script src="http://localhost:3000/embed.js"></script>
```

---

## 🔧 Operating & Management Instructions

### 1. Accessing the Corporate Control Center
Go to **`http://localhost:3000/admin`** to open your dashboard.
* **Leads Tab**: Monitor, search, and download your consulting leads database directly as a clean spreadsheet file (`leads.csv`).
* **Settings Tab**: Configure your SMTP Mailbox, change the Admin Alert email target, and fine-tune your Chatbot settings.

### 2. Configuring Enterprise SMTP Mail
For enterprise production mail delivery (e.g., Google Workspace, Outlook, SendGrid), update these fields in your Settings tab:
* **SMTP Host**: `smtp.gmail.com` (or your provider's SMTP host)
* **SMTP Port**: `465` (SSL) or `587` (TLS)
* **User**: `your_corporate_email@analytixhub.org`
* **Password**: Your password or custom Google App Password.
* **From Name**: `AnalytixHub Consulting`

### 3. Fine-Tuning the AI Knowledge Base
To update the services, pricing, coordinates, or team specialties the AI assistant shares with clients:
1. Open the Admin Panel (`Settings` tab).
2. Go to the **AI Knowledge Base & System Prompt** textarea.
3. Edit the facts or parameters in plain English.
4. Click **Save Configurations**. The AI's brain will be updated instantly!

---

## 🛡️ Security, Privacy & Reliability
* **NDA Compliant**: The chatbot is configured to notify clients that AnalytixHub signs standard Mutual NDAs prior to database sharing.
* **No Database Leakage**: Dynamic calendar timezone validation prevents overlapping bookings.
* **Encrypted API Layer**: All requests are routed through the secure local Express server backend, protecting your private Groq API keys from client exposure.
