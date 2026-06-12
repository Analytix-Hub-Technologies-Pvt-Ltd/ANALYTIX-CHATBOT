const axios = require('axios');
const db = require('../db');

const TATA_FALLBACK_MODELS = [
  'meta/Llama-3.3-70B-Instruct',
  'meta/Llama-3.1-8B-Instruct',
  'google/gemma-4-26B-A4B-it',
  'Qwen/Qwen2.5-Coder-14B-Instruct'
];

/**
 * Get a chat response from Tata Communications AI
 * @param {Array} messages - Array of message objects: [{ role: 'user'|'assistant', content: '...' }]
 * @param {string} botId - Unique identifier for the bot tenant
 * @returns {Promise<string>} - The assistant's text response
 */
async function getChatResponse(messages, botId = 'bot-default') {
  const settings = db.getSettings(botId);
  const globalSettings = db.getGlobalSettings ? db.getGlobalSettings() : {};
  const tataKey = globalSettings.tataKey || process.env.TATA_API_KEY || "";
  const tataUrl = globalSettings.tataUrl || process.env.TATA_BASE_URL || 'https://models.cloudservices.tatacommunications.com/v1';

  if (!tataKey) {
    const orgName = settings.botName ? settings.botName.replace(/\sAssistant|\sBot/gi, "") : "our team";
    const contactEmail = settings.adminEmail || "our email";
    return `Thank you for contacting ${orgName}. Our conversational assistant is currently undergoing routine maintenance. Please feel free to reach out to our team directly at **${contactEmail}** or use the interactive scheduler above to book a consultation slot with our experts.`;
  }

  const preferredModel = globalSettings.tataModel || process.env.TATA_MODEL || 'meta/Llama-3.3-70B-Instruct';
  const modelQueue = [preferredModel, ...TATA_FALLBACK_MODELS.filter(m => m !== preferredModel)];

  const fullMessages = [
    {
      role: 'system',
      content: settings.systemPrompt
    },
    ...messages
  ];

  let lastError = null;

  for (const modelName of modelQueue) {
    try {
      console.log(`Tata Chat Service: Attempting completion using model: ${modelName}`);
      const response = await axios.post(`${tataUrl}/chat/completions`, {
        model: modelName,
        messages: fullMessages,
        temperature: 0.5,
        max_tokens: 1024,
        stream: false
      }, {
        headers: {
          'Authorization': `Bearer ${tataKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      });

      if (response.data && response.data.choices && response.data.choices[0]) {
        console.log(`Tata Chat Service: Successful completion with model: ${modelName}`);
        return response.data.choices[0].message.content;
      } else {
        throw new Error("Invalid response format from Tata AI API");
      }
    } catch (error) {
      console.warn(`Tata Chat Service Model Fallback warning: Model ${modelName} failed. Details: ${error.message}`);
      lastError = error;
    }
  }

  const contactEmail = settings.adminEmail || "our email";
  return `I apologize, but I am currently experiencing technical difficulties and am unable to process your message. Please feel free to contact our team directly at **${contactEmail}** or use the calendar scheduler above to book a direct consultation with one of our experts.`;
}

function getAvailableSlotsForNextDays(botId, daysCount = 3) {
  const slots = {};
  const bookings = db.getBookings(botId) || [];
  
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

  const timezone = settings.bookingTimezone || 'Asia/Kolkata';
  
  let current = new Date();
  let addedDays = 0;
  let loopCount = 0;
  while (addedDays < daysCount && loopCount < 15) {
    loopCount++;
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
      const parts = formatter.formatToParts(new Date());
      const partObj = {};
      parts.forEach(p => partObj[p.type] = p.value);
      const tzTodayStr = `${partObj.year}-${partObj.month}-${partObj.day}`;
      const tzCurrentHour = parseInt(partObj.hour);
      const tzCurrentMinute = parseInt(partObj.minute);

      const isToday = (dateStr === tzTodayStr);

      const takenSlots = bookings
        .filter(b => b.date === dateStr)
        .map(b => b.time);
        
      let available = standardSlots.filter(s => !takenSlots.includes(s));
      
      if (isToday) {
        available = available.filter(slot => {
          const [h, m] = slot.split(':').map(Number);
          if (h < tzCurrentHour) return false;
          if (h === tzCurrentHour && m <= tzCurrentMinute) return false;
          return true;
        });
      }

      const formattedDate = current.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
      slots[dateStr] = { formattedDate, available };
      addedDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

/**
 * Get a chat response stream from Tata Communications AI
 * @param {Array} messages - Array of message objects: [{ role: 'user'|'assistant', content: '...' }]
 * @param {string} botId - Unique identifier for the bot tenant
 * @returns {AsyncGenerator<string>} - The assistant's text response stream
 */
async function* getChatResponseStream(messages, botId = 'bot-default') {
  const settings = db.getSettings(botId);
  const globalSettings = db.getGlobalSettings ? db.getGlobalSettings() : {};
  const tataKey = globalSettings.tataKey || process.env.TATA_API_KEY || "";
  const tataUrl = globalSettings.tataUrl || process.env.TATA_BASE_URL || 'https://models.cloudservices.tatacommunications.com/v1';

  if (!tataKey) {
    const orgName = settings.botName ? settings.botName.replace(/\sAssistant|\sBot/gi, "") : "our team";
    const contactEmail = settings.adminEmail || "our email";
    yield `Thank you for contacting ${orgName}. Our conversational assistant is currently undergoing routine maintenance. Please feel free to reach out to our team directly at **${contactEmail}** or use the interactive scheduler above to book a consultation slot with our experts.`;
    return;
  }

  const preferredModel = globalSettings.tataModel || process.env.TATA_MODEL || 'meta/Llama-3.3-70B-Instruct';
  const modelQueue = [preferredModel, ...TATA_FALLBACK_MODELS.filter(m => m !== preferredModel)];

  const nextSlots = getAvailableSlotsForNextDays(botId);
  const now = new Date();
  const timezone = settings.bookingTimezone || 'Asia/Kolkata';
  const localDateStr = now.toLocaleDateString('en-US', { 
    timeZone: timezone, 
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
  });
  const localTimeStr = now.toLocaleTimeString('en-US', { 
    timeZone: timezone, 
    hour: '2-digit', minute: '2-digit' 
  });

  let slotsText = "";
  for (const [dateStr, info] of Object.entries(nextSlots)) {
    slotsText += `- **${info.formattedDate}** (Date: \`${dateStr}\`): ${info.available.length > 0 ? info.available.join(', ') : 'No slots available'}\n`;
  }

  let paymentPromptText = "";
  if (settings.paymentEnabled) {
    const feeAmount = settings.paymentAmount !== undefined ? settings.paymentAmount : "15.00";
    const feeCurrency = settings.paymentCurrency || "USD";
    const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
    const symbol = currencySymbols[feeCurrency] || '';
    paymentPromptText = `- **Payment Fee Requirement**: Note that a consultation fee of **${symbol}${feeAmount} ${feeCurrency}** is required to book a slot. You MUST mention this fee to the user when discussing scheduling or booking, so they are aware of the price before proceeding.`;
  }

  const schedulingPromptSuffix = `

---
### 📅 CURRENT DATE, TIME & SLOT AVAILABILITY (REAL-TIME DATA):
- **Current Local Date/Time**: ${localDateStr} at ${localTimeStr} (${timezone})
- **Available Booking Slots**:
${slotsText}
${paymentPromptText ? paymentPromptText + '\n' : ''}

### 🤖 CONVERSATIONAL BOOKING SYSTEM RULES:
1. **INFORM ABOUT AVAILABLE SLOTS**: If the user asks to schedule, book, or see available times, present the above date list with available slots using clean bullets. Do not make up dates or slots!
2. **COLLECT REQUIRED DETAILS**: To book a slot, you MUST obtain all of the following details from the user:
   - **Full Name**
   - **Email Address**
   - **Phone Number**
   - **Desired Date** (from the list of available slots above, e.g. "2026-06-10")
   - **Desired Time** (from the list of available slots above, e.g. "10:15")
   - **Purpose of Consultation** (optional, default to "Consultation")
   If any of name, email, or phone are missing, politely ask the user to provide them (e.g. "Sure, I can book that for you! Could you please share your name, email, and phone number?"). Also, remind them of the required consultation fee.
3. **AUTOMATIC BOOKING TRIGGER**: Once you have gathered the Name, Email, Phone, Date, and Time, confirm the booking and append the exact tag below at the very end of your response:
   \`[CREATE_BOOKING:{"date":"YYYY-MM-DD","time":"HH:MM","name":"User Name","email":"user@email.com","phone":"Phone Number","purpose":"Purpose"}]\`
   - Make sure the JSON payload is valid.
   - Do NOT output the tag unless you have all of Name, Email, Phone, Date, and Time.
   - Ensure the date is in \`YYYY-MM-DD\` format and the time is in \`HH:MM\` format matching the slot exactly.
`;

  const fullMessages = [
    {
      role: 'system',
      content: settings.systemPrompt + schedulingPromptSuffix
    },
    ...messages
  ];

  let lastError = null;

  for (const modelName of modelQueue) {
    try {
      console.log(`Tata Chat Stream Service: Attempting completion using model: ${modelName}`);
      const response = await axios.post(`${tataUrl}/chat/completions`, {
        model: modelName,
        messages: fullMessages,
        temperature: 0.5,
        max_tokens: 1024,
        stream: true
      }, {
        headers: {
          'Authorization': `Bearer ${tataKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 20000
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;
          if (cleanLine === 'data: [DONE]') {
            return;
          }
          if (cleanLine.startsWith('data: ')) {
            const jsonStr = cleanLine.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                yield content;
              }
            } catch (err) {
              // Gracefully handle end of stream or partial frames
            }
          }
        }
      }

      if (buffer) {
        const cleanLine = buffer.trim();
        if (cleanLine.startsWith('data: ') && cleanLine !== 'data: [DONE]') {
          const jsonStr = cleanLine.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              yield content;
            }
          } catch (err) {
            // Ignore
          }
        }
      }

      return;
    } catch (error) {
      console.warn(`Tata Chat Stream Fallback warning: Model ${modelName} failed. Details: ${error.message}`);
      lastError = error;
    }
  }

  console.error("Tata Chat Stream Service Error: All configured fallback models have failed.", lastError);
  const contactEmail = settings.adminEmail || "our email";
  yield `I apologize, but I am currently experiencing technical difficulties and am unable to process your message. Please feel free to contact our team directly at **${contactEmail}** or use the calendar scheduler above to book a direct consultation with one of our experts.`;
}

/**
 * Synthesizes a clean text corpus from a scraped website into a custom chatbot configuration
 * @param {string} corpus - The clean website text corpus
 * @param {string} url - The URL crawled
 * @param {string} botId - The bot tenant identifier
 * @returns {Promise<Object>} - Config object with botName, welcomeMessage, primaryColor, systemPrompt
 */
async function generateWebsiteBrain(corpus, url = "", botId = 'bot-default') {
  const settings = db.getSettings(botId);
  const globalSettings = db.getGlobalSettings ? db.getGlobalSettings() : {};
  const tataKey = globalSettings.tataKey || process.env.TATA_API_KEY || "";
  const tataUrl = globalSettings.tataUrl || process.env.TATA_BASE_URL || 'https://models.cloudservices.tatacommunications.com/v1';

  const genericTemplate = db.DEFAULT_SYSTEM_PROMPT
    .replace(/AnalytixHub/gi, '[BUSINESS_NAME]')
    .replace(/analytixhub\.org/gi, '[BUSINESS_URL]')
    .replace(/AH Bot/g, '[BOT_NAME]')
    .replace(/contactus@analytixhub\.org/gi, '[CONTACT_EMAIL]')
    .replace(/\+91\s*7397577392/g, '[CONTACT_PHONE]')
    .replace(/1st floor, Primus Building, Door No\. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India\./gi, '[PHYSICAL_ADDRESS_IF_EXIST_OR_OPERATE_ONLINE]')
    .replace(/https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[^\s\)]+/gi, '[GOOGLE_MAPS_SEARCH_LINK]')
    .replace(/Chennai/gi, '[LOCATION_CITY]')
    .replace(/Guindy/gi, '[LOCATION_NEIGHBORHOOD]')
    .replace(/Tata Communications|Indian Oil|SAB|Wondersoft|Mindsprint/g, '[CONFIDENTIAL_CLIENTS_TO_OMIT]');

  const metaPrompt = `You are a world-class AI developer and expert system prompt engineer. Your job is to analyze the crawled content of a website and synthesize a state-of-the-art configuration for a custom Helpdesk AI Chatbot.

The official URL of the website being crawled is: ${url}. You MUST include this official URL as the official website link (e.g. "- **Website**: ${url}") under the "CONTACT & LOCATION INFORMATION" section of the systemPrompt so that users can easily locate and navigate to the official website.

Here is the cleaned website content (the corpus):
${corpus}

---
### 📋 PROMPT STRUCTURAL REFERENCE TEMPLATE:
Your generated systemPrompt MUST match the exact formatting style, bulleted structure, comprehensive detail level, tone, and length of the reference template below. Avoid producing short summaries or generic paragraphs; write a complete, rich, production-grade assistant instruction set (at least 600-1000 words) matching this layout:

${genericTemplate}
---

### 🚨 CRITICAL CUSTOMIZATION RULES:
1. **NO LEAKED TEMPLATE DETAILS**: You MUST replace ALL references to "AnalytixHub", "AH Bot", "contactus@analytixhub.org", and the Chennai office address from the template with the details extracted from the crawled website (${url}). Do NOT leave any trace of AnalytixHub or its contact details in your final output!
2. **PHYSICAL LOCATION DISCOVERY**: If the crawled website content does not specify a physical address, location, or map link, do NOT invent one or copy the template's Chennai address. Instead, state clearly in the location section that the business operates fully online, or list contact email/forms as the primary contact method.
3. **BRAND IDENTITY**: The chatbot name, visual color, and system instructions must match the brand of the crawled website (${url}). For example, if crawling a referral/affiliate software site like Referbro, the bot name should represent Referbro (e.g. "Referbro Assistant") and answer questions specifically about their referral and affiliate offerings, NOT analytics roadmaps!
4. **DO NOT invent jobs**: If the crawled website lists active jobs, summarize them. If not, state that no active roles are listed.
---

You must return a raw JSON object with EXACTLY the following structure (do not include any additional keys or conversational text outside the JSON):
{
  "botName": "A catchy, professional, brand-aligned name for the chatbot (2-3 words max, e.g., 'EcoShop Assistant' or 'Velo Helpdesk')",
  "welcomeMessage": "A warm, premium, personalized first greeting that introduces the bot and asks how it can help (e.g., 'Hi there! Welcome to Velo Digital. I can answer questions about our services or help you schedule a strategy call. How can I assist you today?')",
  "primaryColor": "A cohesive, elegant hex color code that fits this brand's visual identity (avoid plain red/blue, use rich palettes like deep teal, slate blue, emerald green, etc., e.g., '#0d9488' or '#4f46e5')",
  "systemPrompt": "A highly detailed, production-grade markdown system prompt that configures the assistant's brain. Customize the reference template above with the crawled business details. Make sure you write detailed, exhaustive descriptions for the Business, each Service, and the Scheduler policies. Ensure the [TRIGGER_BOOKING] token rules and receptionist role remain strictly active.",
  "extractedInfo": {
    "location": "The physical address/location of the company as extracted from the website corpus, or 'Not specified'",
    "mapLink": "A direct Google Maps search link for the physical address if found, e.g. 'https://www.google.com/maps/search/?api=1&query=Guindy+Chennai' (if no address is found, use 'Not specified')",
    "email": "The contact email address of the business as found in the corpus, or 'Not specified'",
    "phone": "The contact phone number of the business as found in the corpus, or 'Not specified'",
    "services": ["Array", "of", "extracted", "primary", "business", "services", "or", "capabilities", "(max 5)"]
  }
}

Ensure the output is valid, parsable JSON. Do not write any markdown code fences (like \`\`\`json) or text before/after the JSON. Just return the raw JSON string.

### STRICT APPOINTMENT RULE:
Within the generated systemPrompt, explicitly state in the Scheduler section that the chatbot must NEVER suggest scheduling or output the '[TRIGGER_BOOKING]' keyword on greetings, hello, pricing FAQs, office locations, or general consulting questions. The bot must ONLY output '[TRIGGER_BOOKING]' at the absolute end of the response when the user explicitly requests to book a consultation slot, schedule a call, or book a meeting right now.

### STRICT RESPONSE FORMATTING TEMPLATE RULE:
Instruct the chatbot to format EVERY single response using a clean, elite consulting template: (1) A polite direct answer/greeting of 1-2 sentences, (2) Core details presented using clean bullet points with emojis, (3) A brief consulting value-add or insight, and (4) A standardized friendly call to action check-in question.`;

  let rawText = "";
  try {
    rawText = await callTataSynthesis(tataKey, tataUrl, globalSettings.tataModel, metaPrompt);
  } catch (err) {
    console.error("Tata synthesis failed:", err.message);
    throw new Error(`Synthesis failed: ${err.message}`);
  }

  rawText = rawText || "";

  try {
    if (rawText.startsWith('```json')) {
      rawText = rawText.substring(7);
    } else if (rawText.startsWith('```')) {
      rawText = rawText.substring(3);
    }
    if (rawText.endsWith('```')) {
      rawText = rawText.substring(0, rawText.length - 3);
    }
    rawText = rawText.trim();

    const sanitizedText = sanitizeJsonString(rawText);
    const parsedConfig = JSON.parse(sanitizedText);
    
    if (!parsedConfig.botName || !parsedConfig.welcomeMessage || !parsedConfig.systemPrompt) {
      throw new Error("Missing critical keys in synthesized JSON.");
    }

    parsedConfig.systemPrompt += `\n\n---\n### 🌐 OFFICIAL WEBSITE REFERENCE:\n- **Official Website URL**: ${url}\n- **Root Address Link**: [${url}](${url})\n\n---\n### 📚 COMPLETE KNOWLEDGE BASE & WEBSITE CONTENT:\nUse the detailed page-by-page scraped documentation below to answer user queries with 100% precision. Relist facts, contacts, and services exactly as documented here:\n\n${corpus}`;
    
    return parsedConfig;
  } catch (parseErr) {
    console.error("Failed to parse synthesized configuration JSON:", parseErr);
    console.log("RAW TEXT WAS:", rawText);
    throw new Error(`AI prompt parsing failed: ${parseErr.message}`);
  }
}

async function callTataSynthesis(tataKey, tataUrl, configModel, promptText) {
  if (!tataKey) {
    throw new Error("Tata API key is missing. Please set it in Settings to train the AI.");
  }

  const preferredModel = configModel || 'meta/Llama-3.3-70B-Instruct';
  const modelQueue = [preferredModel, ...TATA_FALLBACK_MODELS.filter(m => m !== preferredModel)];

  let lastError = null;

  for (const modelName of modelQueue) {
    try {
      console.log(`Tata Prompt Synthesis: Attempting synthesis using model: ${modelName}`);
      
      // Try with response_format first
      try {
        const response = await axios.post(`${tataUrl}/chat/completions`, {
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are a precise JSON generator. You output only raw, valid JSON. Never output markdown brackets, code fences, or explanations.'
            },
            {
              role: 'user',
              content: promptText
            }
          ],
          temperature: 0.3,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          stream: false
        }, {
          headers: {
            'Authorization': `Bearer ${tataKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 40000
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
          console.log(`Tata Prompt Synthesis: Successful synthesis with model: ${modelName}`);
          return response.data.choices[0].message.content.trim();
        }
      } catch (innerErr) {
        console.warn(`Response format request failed, falling back to raw prompt request...`, innerErr.message);
        
        const response = await axios.post(`${tataUrl}/chat/completions`, {
          model: modelName,
          messages: [
            {
              role: 'system',
              content: 'You are a precise JSON generator. You output only raw, valid JSON. Never output markdown brackets, code fences, or explanations.'
            },
            {
              role: 'user',
              content: promptText
            }
          ],
          temperature: 0.3,
          max_tokens: 4096,
          stream: false
        }, {
          headers: {
            'Authorization': `Bearer ${tataKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 40000
        });

        if (response.data && response.data.choices && response.data.choices[0]) {
          console.log(`Tata Prompt Synthesis: Successful synthesis with model: ${modelName}`);
          return response.data.choices[0].message.content.trim();
        }
      }

      throw new Error("Empty response from Tata completions endpoint.");
    } catch (error) {
      console.warn(`Tata Prompt Synthesis Fallback warning: Model ${modelName} failed. Details: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`All Tata fallback models failed for synthesis. Last Error: ${lastError.message}`);
}

function sanitizeJsonString(str) {
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
    } else if (inString) {
      if (char === '\\') {
        const nextChar = str[i + 1];
        const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];
        if (nextChar && validEscapes.includes(nextChar)) {
          isEscaped = true;
          result += char;
        } else {
          result += '\\\\';
          isEscaped = false;
        }
      } else {
        isEscaped = false;
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else if (char.charCodeAt(0) < 32) {
          result += '\\u' + ('0000' + char.charCodeAt(0).toString(16)).slice(-4);
        } else {
          result += char;
        }
      }
    } else {
      isEscaped = false;
      result += char;
    }
  }
  return result;
}

module.exports = {
  getChatResponse,
  getChatResponseStream,
  generateWebsiteBrain
};
