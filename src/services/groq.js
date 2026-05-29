const Groq = require('groq-sdk');
const db = require('../db');

/**
 * Get a chat response from Groq LLM
 * @param {Array} messages - Array of message objects: [{ role: 'user'|'assistant', content: '...' }]
 * @returns {Promise<string>} - The assistant's text response
 */
const GROQ_FALLBACK_MODELS = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768',
  'llama-3.2-11b-vision-preview'
];

async function getChatResponse(messages) {
  const settings = db.getSettings();
  const apiKey = settings.groqKey || process.env.GROQ_API_KEY;

  if (!apiKey) {
    return "Thank you for contacting AnalytixHub. Our conversational assistant is currently undergoing routine maintenance. Please feel free to reach out to our team directly at **contactus@analytixhub.org** or use the interactive scheduler above to book a consultation slot with our experts.";
  }

  // Compile a unique sequence of models to try, placing user's preference first
  const preferredModel = settings.groqModel || 'llama-3.1-8b-instant';
  const modelQueue = [preferredModel, ...GROQ_FALLBACK_MODELS.filter(m => m !== preferredModel)];

  const fullMessages = [
    {
      role: 'system',
      content: settings.systemPrompt
    },
    ...messages
  ];

  const groqClient = new Groq({ apiKey });
  let lastError = null;

  // Try each model sequentially in case of rate limits or service disruptions
  for (const modelName of modelQueue) {
    try {
      console.log(`Groq Chat Service: Attempting completion using model: ${modelName}`);
      const response = await groqClient.chat.completions.create({
        messages: fullMessages,
        model: modelName,
        temperature: 0.5,
        max_tokens: 1024,
        top_p: 1,
        stream: false
      });

      if (response && response.choices && response.choices[0]) {
        console.log(`Groq Chat Service: Successful completion with model: ${modelName}`);
        return response.choices[0].message.content;
      } else {
        throw new Error("Invalid response format from Groq API");
      }
    } catch (error) {
      console.warn(`Groq Chat Service Model Fallback warning: Model ${modelName} failed. Details: ${error.message}`);
      lastError = error;
    }
  }

  console.error("Groq Chat Service Error: All configured fallback models have failed.", lastError);
  return "I apologize, but I am currently experiencing technical difficulties and am unable to process your message. Please feel free to contact our team directly at **contactus@analytixhub.org** or use the calendar scheduler above to book a direct consultation with one of our analytics experts.";
}

/**
 * Synthesizes a clean text corpus from a scraped website into a custom chatbot configuration
 * @param {string} corpus - The clean website text corpus
 * @returns {Promise<Object>} - Config object with botName, welcomeMessage, primaryColor, systemPrompt
 */
async function generateWebsiteBrain(corpus, url = "") {
  const settings = db.getSettings();
  const provider = settings.synthesisProvider || 'groq';
  const apiKey = settings.groqKey || process.env.GROQ_API_KEY;

  // 1. Compile Meta Prompt with strict structural layout and extraction requirements
  const metaPrompt = `You are a world-class AI developer and expert system prompt engineer. Your job is to analyze the crawled content of a website and synthesize a state-of-the-art configuration for a custom Helpdesk AI Chatbot.

The official URL of the website being crawled is: ${url}. You MUST include this official URL as the official website link (e.g. "- **Website**: ${url}") under the "CONTACT & LOCATION INFORMATION" section of the systemPrompt so that users can easily locate and navigate to the official website.

Here is the cleaned website content (the corpus):
${corpus}

---
### 📋 PROMPT STRUCTURAL REFERENCE TEMPLATE:
Your generated systemPrompt MUST match the exact formatting style, bulleted structure, comprehensive detail level, tone, and length of the reference template below. Avoid producing short summaries or generic paragraphs; write a complete, rich, production-grade assistant instruction set (at least 600-1000 words) matching this layout:

${db.DEFAULT_SYSTEM_PROMPT}
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
Within the generated systemPrompt, explicitly state in the Scheduler section that the chatbot must NEVER suggest scheduling or output the '[TRIGGER_BOOKING]' keyword on greetings, hello, pricing FAQs, office locations, or general consulting questions. The bot must ONLY output '[TRIGGER_BOOKING]' at the absolute end of the response when the user explicitly requests to book a consultation slot, schedule a call, or book a meeting right now.`;

  // 2. Execute synthesis using selected Provider (with graceful bidirectional failover)
  let rawText = "";

  if (provider === 'openrouter') {
    console.log("Using OpenRouter provider for prompt synthesis...");
    try {
      rawText = await callOpenRouterSynthesis(settings, metaPrompt);
    } catch (orErr) {
      console.warn("OpenRouter prompt synthesis failed. Falling back to Groq:", orErr.message);
      try {
        rawText = await callGroqSynthesis(apiKey, settings.groqModel, metaPrompt);
      } catch (groqErr) {
        console.error("Failover to Groq also failed:", groqErr.message);
        throw new Error(`Synthesis failed on both OpenRouter and Groq. OpenRouter Error: ${orErr.message}. Groq Error: ${groqErr.message}`);
      }
    }
  } else {
    console.log("Using Groq provider for prompt synthesis...");
    try {
      rawText = await callGroqSynthesis(apiKey, settings.groqModel, metaPrompt);
    } catch (groqErr) {
      console.warn("Groq prompt synthesis failed. Falling back to OpenRouter:", groqErr.message);
      try {
        rawText = await callOpenRouterSynthesis(settings, metaPrompt);
      } catch (orErr) {
        console.error("Failover to OpenRouter also failed:", orErr.message);
        throw new Error(`Synthesis failed on both Groq and OpenRouter. Groq Error: ${groqErr.message}. OpenRouter Error: ${orErr.message}`);
      }
    }
  }

  // Ensure rawText is a safe string before manipulating
  rawText = rawText || "";

  // 3. Process and parse synthesized JSON
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

    // Sanitize raw JSON string to handle control characters and invalid backslashes safely
    const sanitizedText = sanitizeJsonString(rawText);
    const parsedConfig = JSON.parse(sanitizedText);
    
    // Basic schema validations
    if (!parsedConfig.botName || !parsedConfig.welcomeMessage || !parsedConfig.systemPrompt) {
      throw new Error("Missing critical keys in synthesized JSON.");
    }

    // Automatically append the complete raw crawled text corpus directly to the system prompt.
    // This guarantees that 100% of the gathered website details (URLs, headings, paragraphs) are 
    // present inside the prompt instructions with zero loss or generalization, giving the chatbot infinite accuracy!
    parsedConfig.systemPrompt += `\n\n---\n### 🌐 OFFICIAL WEBSITE REFERENCE:\n- **Official Website URL**: ${url}\n- **Root Address Link**: [${url}](${url})\n\n---\n### 📚 COMPLETE KNOWLEDGE BASE & WEBSITE CONTENT:\nUse the detailed page-by-page scraped documentation below to answer user queries with 100% precision. Relist facts, contacts, and services exactly as documented here:\n\n${corpus}`;
    
    return parsedConfig;
  } catch (parseErr) {
    console.error("Failed to parse synthesized configuration JSON:", parseErr);
    console.log("RAW TEXT WAS:", rawText);
    throw new Error(`AI prompt parsing failed: ${parseErr.message}`);
  }
}

/**
 * Helper to call OpenRouter completions API for prompt generation
 */
async function callOpenRouterSynthesis(settings, promptText) {
  const axios = require('axios');
  const openRouterUrl = settings.openRouterUrl || process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
  let model = settings.openRouterModel || process.env.OPENROUTER_MODEL || 'openrouter/free';
  const openRouterKey = settings.openRouterKey || process.env.OPENROUTER_API_KEY || '';

  // Handle placeholders gracefully (let 'openrouter/free' auto-route directly!)
  if (model === 'free') {
    model = 'openrouter/free';
  }

  if (!openRouterKey) {
    throw new Error("OpenRouter API key is missing. Please specify it in Settings.");
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openRouterKey}`,
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'AnalytixHub Chatbot Generator'
  };
  
  console.log(`Routing request to OpenRouter: ${openRouterUrl} (Model: ${model})`);

  const response = await axios.post(openRouterUrl, {
    model: model,
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
    stream: false
  }, { headers, timeout: 25000 }); // Richer 25-second timeout for complex synthesis

  if (response && response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
    return (response.data.choices[0].message.content || "").trim();
  } else {
    throw new Error("Invalid response schema from OpenRouter completions server");
  }
}

/**
 * Helper to call Groq completions API for prompt generation
 */
async function callGroqSynthesis(apiKey, configModel, promptText) {
  if (!apiKey) {
    throw new Error("Groq API key is missing. Please set it in Settings to train the AI.");
  }

  // Compile a unique sequence of models to try for high-fidelity prompt synthesis
  const preferredModel = configModel || 'llama-3.3-70b-versatile';
  const modelQueue = [preferredModel, ...GROQ_FALLBACK_MODELS.filter(m => m !== preferredModel)];
  
  const groqClient = new Groq({ apiKey });
  let lastError = null;

  for (const modelName of modelQueue) {
    try {
      console.log(`Groq Prompt Synthesis: Attempting synthesis using model: ${modelName}`);
      const response = await groqClient.chat.completions.create({
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
        model: modelName,
        temperature: 0.3,
        max_tokens: 2048,
        stream: false
      });

      if (response && response.choices && response.choices[0]) {
        console.log(`Groq Prompt Synthesis: Successful synthesis with model: ${modelName}`);
        return response.choices[0].message.content.trim();
      } else {
        throw new Error("Empty response from Groq completions endpoint.");
      }
    } catch (error) {
      console.warn(`Groq Prompt Synthesis Fallback warning: Model ${modelName} failed. Details: ${error.message}`);
      lastError = error;
    }
  }

  throw new Error(`All Groq fallback models failed for synthesis. Last Error: ${lastError.message}`);
}

/**
 * Sanitizes raw JSON string from LLM to safely handle unescaped control characters (newlines, tabs)
 * and invalid escape sequences within string literals before parsing.
 */
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
  generateWebsiteBrain
};

