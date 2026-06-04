// Resolve botId from query string
const urlParams = new URLSearchParams(window.location.search);
const botId = urlParams.get('botId') || 'bot-default';

// Hook global fetch to inject botId automatically
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  let targetUrl = url;
  if (typeof url === 'string') {
    const urlObj = new URL(url, window.location.origin);
    
    // 1. Append botId to query parameters for GET/DELETE requests
    if (!options.method || options.method === 'GET' || options.method === 'DELETE') {
      urlObj.searchParams.set('botId', botId);
      targetUrl = urlObj.pathname + urlObj.search;
    }
  }

  // 2. Inject botId into POST/PUT request bodies
  if (options.method === 'POST' || options.method === 'PUT') {
    if (options.body && typeof options.body === 'string') {
      try {
        const bodyObj = JSON.parse(options.body);
        bodyObj.botId = botId;
        options.body = JSON.stringify(bodyObj);
      } catch (e) {
        // Silent catch for non-JSON payloads
      }
    }
  }

  return originalFetch(targetUrl, options);
};

// Chat Widget State
let chatHistory = [];
let botName = "AH Bot";
let primaryColor = "#2563eb";
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed

// Resolve or generate a conversationId stored in sessionStorage for this browser tab session
let conversationId = sessionStorage.getItem('ah_chatbot_conversation_id');
if (!conversationId) {
  conversationId = 'conv-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  sessionStorage.setItem('ah_chatbot_conversation_id', conversationId);
}

// Booking selections
let selectedDateStr = ""; // YYYY-MM-DD
let selectedSlot = ""; // HH:MM
let activeAvailableSlots = [];
let activeFetchedDateStr = "";

document.addEventListener("DOMContentLoaded", () => {
  // Init Lucide
  lucide.createIcons();
  
  // Load Settings and apply custom CSS overrides
  loadWidgetSettings();

  // Chat Submission
  const form = document.getElementById("chat-input-form");
  form.addEventListener("submit", handleChatSubmit);

  // Close button listener - posts message to parent window (embed.js)
  document.getElementById("close-btn").addEventListener("click", () => {
    window.parent.postMessage({ type: 'ah-chatbot-close' }, '*');
  });

  // Scroll to bottom initial
  scrollToBottom();
});

// -------------------------------------------------------------
// LOAD CONFIGURATIONS & THEME
// -------------------------------------------------------------
async function loadWidgetSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("Could not retrieve chatbot configurations.");
    const data = await res.json();
    
    botName = data.botName || "AH Bot";
    primaryColor = data.primaryColor || "#2563eb";
    const backgroundColor = data.backgroundColor || "#090d16";
    
    // Save settings globally for location card lookup
    window.activeWidgetSettings = data;
    
    // Update Header Name
    document.getElementById("bot-display-name").innerText = botName;
    
    // Update Header Subtitle
    const subtitleEl = document.getElementById("bot-subtitle");
    if (subtitleEl) {
      subtitleEl.innerText = data.botSubTitle || "AI Assistant";
    }

    // Update Footer Branding
    const brandingEl = document.getElementById("powered-by-branding");
    if (brandingEl) {
      const cleanBotName = botName.replace(/\sAssistant|\sBot/gi, "");
      brandingEl.innerText = `Powered by ${cleanBotName} AI`;
    }
    
    // Update Welcome message content
    const welcomeBubble = document.getElementById("welcome-msg-bubble");
    if (data.welcomeMessage) {
      welcomeBubble.innerText = data.welcomeMessage;
    }
    
    // Format welcome message time
    document.getElementById("welcome-msg-time").innerText = getCurrentTimeFormatted();
 
    // Inject custom CSS styling overrides dynamically to match chosen brand color and backgrounds
    const isLight = isLightColor(backgroundColor);
    const textMain = isLight ? "#0f172a" : "#f1f5f9";
    const textMuted = isLight ? "#475569" : "#94a3b8";
    const textDimmed = isLight ? "#64748b" : "#475569";
    const borderColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.05)";
    const bubbleBotBg = isLight ? "rgba(0, 0, 0, 0.03)" : "rgba(255, 255, 255, 0.03)";
    const customListItemBg = isLight ? "rgba(0, 0, 0, 0.02)" : "rgba(255, 255, 255, 0.02)";
    const customListItemBorder = isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";

    const style = document.createElement("style");
    style.innerHTML = `
      :root {
        --primary: ${primaryColor} !important;
        --primary-glow: ${hexToRgba(primaryColor, 0.15)} !important;
        --primary-hover: ${lightenHexColor(primaryColor, 15)} !important;
        --glass-bg: ${hexToRgba(backgroundColor, 0.98)} !important;
        --bg-dark: ${isLight ? lightenHexColor(backgroundColor, 5) : darkenHexColor(backgroundColor, 10)} !important;
        --bg-darker: ${isLight ? lightenHexColor(backgroundColor, 10) : darkenHexColor(backgroundColor, 20)} !important;
        --text-main: ${textMain} !important;
        --text-muted: ${textMuted} !important;
        --text-dimmed: ${textDimmed} !important;
        --border-color: ${borderColor} !important;
      }
      
      .msg-row.bot .msg-bubble {
        background: ${bubbleBotBg} !important;
        border-color: ${borderColor} !important;
      }
      
      .chat-messages-container::-webkit-scrollbar-thumb {
        background: ${isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)"} !important;
      }
      
      .chat-messages-container::-webkit-scrollbar-thumb:hover {
        background: ${isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.22)"} !important;
      }
      
      .custom-list-item {
        background: ${customListItemBg} !important;
        border-color: ${customListItemBorder} !important;
      }
      
      .custom-list-item:hover {
        background: ${isLight ? "rgba(0, 0, 0, 0.04)" : "rgba(255, 255, 255, 0.05)"} !important;
      }
      
      .contact-location-card-premium {
        background: ${isLight ? "rgba(0, 0, 0, 0.01)" : "rgba(255, 255, 255, 0.02)"} !important;
        border-color: ${isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.08)"} !important;
      }
    `;
    document.head.appendChild(style);

    // Detect browser timezone and init timezone select dropdown
    const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzDropdown = document.getElementById("widget-timezone");
    if (tzDropdown) {
      let tzExists = Array.from(tzDropdown.options).some(opt => opt.value === clientTz);
      if (!tzExists) {
        const opt = document.createElement("option");
        opt.value = clientTz;
        opt.innerText = `${clientTz} (Local)`;
        tzDropdown.appendChild(opt);
      }
      tzDropdown.value = clientTz;
      
      // Avoid duplicate listener
      if (!tzDropdown.dataset.listenerAdded) {
        tzDropdown.dataset.listenerAdded = "true";
        tzDropdown.addEventListener("change", () => {
          if (activeFetchedDateStr && activeAvailableSlots.length > 0) {
            renderLocalizedSlots();
          }
        });
      }
    }

  } catch (error) {
    console.error("Load Widget Settings Error:", error);
  }
}

// -------------------------------------------------------------
// CHAT FUNCTIONALITIES
// -------------------------------------------------------------
async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  
  if (!text) return;
  
  // Clear input
  input.value = "";
  
  // Append User Message bubble
  appendMessage("user", text);
  
  // Add to local history
  chatHistory.push({ role: "user", content: text });
  
  // Scroll to bottom
  scrollToBottom();
  
  // Show Typing Indicator
  const typingIndicator = document.getElementById("typing-indicator");
  typingIndicator.classList.remove("hidden");
  scrollToBottom();
  
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: chatHistory, conversationId: conversationId })
    });
    
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Chatbot service unavailable.");
    }
    
    // Hide Typing Indicator once we start receiving the stream
    typingIndicator.classList.add("hidden");
    
    // Create assistant message row to stream the content into
    const container = document.getElementById("chat-messages");
    const botRow = document.createElement("div");
    botRow.className = "msg-row bot";
    botRow.innerHTML = `
      <div class="msg-bubble"></div>
      <span class="msg-time">${getCurrentTimeFormatted()}</span>
    `;
    container.appendChild(botRow);
    const bubble = botRow.querySelector(".msg-bubble");
    scrollToElement(botRow);
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulatedText = "";
    let hasTriggeredBooking = false;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      
      // Save last partial line to buffer
      buffer = lines.pop();
      
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
        
        const dataStr = cleanLine.substring(6);
        if (dataStr === "[DONE]") break;
        
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) {
            accumulatedText += parsed.chunk;
            
            // Render text with markdown in real-time
            let displayText = accumulatedText;
            
            if (displayText.includes("[TRIGGER_BOOKING]")) {
              displayText = displayText.replace(/\[TRIGGER_BOOKING\]/g, "").trim();
              if (!hasTriggeredBooking) {
                hasTriggeredBooking = true;
                setTimeout(() => {
                  triggerInlineBooking();
                }, 800);
              }
            }
            
            bubble.innerHTML = formatTextMarkdown(displayText);
            scrollToElement(botRow);
          }
        } catch (e) {
          console.error("Error parsing stream chunk:", e);
        }
      }
    }
    
    // Final cleanup of the booking tag in our stored history
    const finalCleanText = accumulatedText.replace(/\[TRIGGER_BOOKING\]/g, "").trim();
    chatHistory.push({ role: "assistant", content: finalCleanText });
    
    // Trigger visual location card if the office details were mentioned
    const lowerText = finalCleanText.toLowerCase();
    const isLocationTrigger = lowerText.includes("primus building") || 
                              lowerText.includes("guindy") || 
                              lowerText.includes("chennai") || 
                              lowerText.includes("office location") ||
                              lowerText.includes("office address") ||
                              lowerText.includes("headquarters") ||
                              lowerText.includes("where are you located") ||
                              lowerText.includes("where is your office");
                              
    if (shouldShowLocationCard(finalCleanText, window.activeWidgetSettings)) {
      const card = createLocationCard(window.activeWidgetSettings);
      botRow.appendChild(card);
      if (window.lucide) {
        window.lucide.createIcons();
      }
      scrollToElement(botRow);
    }
    
  } catch (error) {
    typingIndicator.classList.add("hidden");
    const errRow = appendMessage("bot", `I apologize, but I am having trouble connecting to my AI processor: ${error.message}. Please try again shortly!`);
    scrollToElement(errRow);
  }
}

function sendQuickReply(text) {
  document.getElementById("chat-input").value = text;
  document.getElementById("chat-input-form").dispatchEvent(new Event("submit"));
}

function appendMessage(sender, text) {
  const container = document.getElementById("chat-messages");
  const row = document.createElement("div");
  row.className = `msg-row ${sender}`;
  
  // Format bold, code, and links in text markdown for standard bubbles
  const htmlContent = formatTextMarkdown(text);
  
  row.innerHTML = `
    <div class="msg-bubble">${htmlContent}</div>
    <span class="msg-time">${getCurrentTimeFormatted()}</span>
  `;
  container.appendChild(row);

  // If the bot sends the office address, render a stunning visual Contact & Location Card below the bubble
  const lowerText = (text || "").toLowerCase();
  const isLocationTrigger = lowerText.includes("primus building") || 
                            lowerText.includes("guindy") || 
                            lowerText.includes("chennai") || 
                            lowerText.includes("office location") ||
                            lowerText.includes("office address") ||
                            lowerText.includes("headquarters") ||
                            lowerText.includes("where are you located") ||
                            lowerText.includes("where is your office");

  if (sender === 'bot' && shouldShowLocationCard(text, window.activeWidgetSettings)) {
    const card = createLocationCard(window.activeWidgetSettings);
    row.appendChild(card);
  }
  
  // Dynamically compile any new SVG icons injected in the message bubble or location card
  if (window.lucide) {
    window.lucide.createIcons();
  }
  
  return row;
}

function scrollToElement(element) {
  const container = document.getElementById("chat-messages");
  if (!element) return;
  // Smoothly scroll the container so the new message starts at the top (with spacing)
  container.scrollTo({
    top: element.offsetTop - 12,
    behavior: "smooth"
  });
}

// -------------------------------------------------------------
// SCHEDULER VIEW CONTROLLERS
// -------------------------------------------------------------
function triggerInlineBooking() {
  // Toggle Views
  document.getElementById("chat-feed-panel").classList.remove("active");
  document.getElementById("scheduler-panel").classList.add("active");
  
  // Draw current calendar month
  selectedDateStr = "";
  selectedSlot = "";
  document.getElementById("btn-goto-details").disabled = true;
  drawCalendar();
  
  // Reset Time Slots Box
  document.getElementById("time-slots-grid").innerHTML = `<div class="slots-info-msg">Please select a date first.</div>`;
}

function closeScheduler(didBook = false) {
  document.getElementById("scheduler-panel").classList.remove("active");
  document.getElementById("chat-feed-panel").classList.add("active");
  
  // Reset slider steps back to step 1
  gotoDateTimeStep();
  
  if (didBook) {
    // Append assistant context validation
    const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
    const clientTzName = window.selectedClientTimezone ? window.selectedClientTimezone.split('/').pop().replace('_', ' ') : '';
    const clientTimeText = window.selectedClientFormattedSlot ? ` / **${window.selectedClientFormattedSlot} (${clientTzName})**` : '';
    
    appendMessage("bot", `Excellent! Your consultation has been successfully scheduled for **${formatDateDisplay(selectedDateStr)}** at **${formatTime12(selectedSlot)} (${bizTz})**${clientTimeText}. A calendar invitation and confirmation details email have been dispatched to your inbox.`);
    chatHistory.push({
      role: "assistant",
      content: `Your consultation has been successfully scheduled for ${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)} (${bizTz})${clientTimeText ? ' / ' + clientTimeText : ''}. A confirmation email has been dispatched.`
    });
  }
  
  scrollToBottom();
}

function gotoDateTimeStep() {
  document.getElementById("sched-step-details").classList.remove("active");
  document.getElementById("sched-step-success").classList.remove("active");
  document.getElementById("sched-step-dateTime").classList.add("active");
}

function gotoDetailsStep() {
  if (!selectedDateStr || !selectedSlot) return;
  
  // Toggle Steps
  document.getElementById("sched-step-dateTime").classList.remove("active");
  document.getElementById("sched-step-details").classList.add("active");
  
  // Set summary label
  const summaryLbl = document.getElementById("booking-summary-text");
  const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
  const clientTzName = window.selectedClientTimezone ? window.selectedClientTimezone.split('/').pop().replace('_', ' ') : '';
  
  summaryLbl.innerHTML = `
    <div style="font-weight: 600;">Business Time: ${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)} (${bizTz})</div>
    ${window.selectedClientFormattedSlot ? `<div style="font-size: 12px; color: var(--primary); margin-top: 4px; font-weight: 500;">Local Time: ${window.selectedClientFormattedSlot} (${clientTzName})</div>` : ''}
  `;
}

// -------------------------------------------------------------
// CALENDAR GRID POPULATOR
// -------------------------------------------------------------
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function drawCalendar() {
  const monthYearLbl = document.getElementById("cal-month-year");
  monthYearLbl.innerText = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  
  const cellsContainer = document.getElementById("calendar-grid-cells");
  cellsContainer.innerHTML = "";
  
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalMonthDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Fill empty spaces from previous month days
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "cal-cell disabled";
    cellsContainer.appendChild(emptyCell);
  }
  
  const today = new Date();
  
  // Fill actual month dates
  for (let dayNum = 1; dayNum <= totalMonthDays; dayNum++) {
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    cell.innerText = dayNum;
    
    // Check if cell corresponds to today
    const isToday = today.getDate() === dayNum && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
    if (isToday) cell.classList.add("today");

    // Format this day into YYYY-MM-DD
    const dateFormatted = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    
    // Business rules: 
    // 1. Can't book past dates!
    // 2. Can't book weekends (Saturday=6, Sunday=0) for standard operating business hours!
    const cellDate = new Date(currentYear, currentMonth, dayNum);
    const dayOfWeek = cellDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Compare dates ignoring times
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isPast = cellDate < startOfToday;
    
    if (isPast || isWeekend) {
      cell.classList.add("disabled");
    } else {
      // Allow selection
      if (selectedDateStr === dateFormatted) {
        cell.classList.add("selected");
      }
      
      cell.addEventListener("click", () => {
        // Deselect previous
        const selected = cellsContainer.querySelector(".cal-cell.selected");
        if (selected) selected.classList.remove("selected");
        
        cell.classList.add("selected");
        selectedDateStr = dateFormatted;
        
        // Load available time slots for this date
        fetchSlots(dateFormatted);
      });
    }
    
    cellsContainer.appendChild(cell);
  }
}

function navigateMonth(direction) {
  currentMonth += direction;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  drawCalendar();
}

// -------------------------------------------------------------
// SLOTS FETCHING
// -------------------------------------------------------------
function convertTimezone(dateStr, timeStr, fromZone, toZone) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const tempUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  
  function getTzParts(date, tz) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const partObj = {};
    parts.forEach(p => partObj[p.type] = p.value);
    return partObj;
  }
  
  const fromParts = getTzParts(tempUtc, fromZone);
  const fromLocal = new Date(Date.UTC(
    Number(fromParts.year),
    Number(fromParts.month) - 1,
    Number(fromParts.day),
    Number(fromParts.hour),
    Number(fromParts.minute)
  ));
  
  const offsetMs = fromLocal.getTime() - tempUtc.getTime();
  const utcDate = new Date(tempUtc.getTime() - offsetMs);
  
  const toPartsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: toZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  });
  
  const toParts = toPartsFormatter.formatToParts(utcDate);
  const toPartObj = {};
  toParts.forEach(p => toPartObj[p.type] = p.value);
  
  const targetDateStr = `${toPartObj.year}-${toPartObj.month}-${toPartObj.day}`;
  const targetTimeStr = `${toPartObj.hour}:${toPartObj.minute}`;
  
  let hourNum = parseInt(toPartObj.hour);
  const ampm = hourNum >= 12 ? 'PM' : 'AM';
  const displayHour = hourNum % 12 || 12;
  const time12 = `${displayHour}:${toPartObj.minute} ${ampm}`;
  
  const isDateShifted = targetDateStr !== dateStr;
  
  let displayText = time12;
  if (isDateShifted) {
    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const targetMonthIndex = parseInt(toPartObj.month) - 1;
    const targetMonthName = monthNamesShort[targetMonthIndex];
    const targetDay = parseInt(toPartObj.day);
    displayText = `${time12} (${targetMonthName} ${targetDay})`;
  }
  
  return {
    utcDate,
    displayText,
    targetDateStr,
    targetTimeStr
  };
}

function renderLocalizedSlots() {
  const slotsGrid = document.getElementById("time-slots-grid");
  slotsGrid.innerHTML = "";
  
  if (activeAvailableSlots.length === 0) {
    slotsGrid.innerHTML = `<div class="slots-info-msg">No slots available on this date. Please select another day.</div>`;
    return;
  }
  
  const fromZone = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
  const toZone = document.getElementById("widget-timezone").value;
  
  activeAvailableSlots.forEach(slot => {
    const converted = convertTimezone(activeFetchedDateStr, slot, fromZone, toZone);
    
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot-btn";
    btn.innerText = converted.displayText;
    
    if (selectedSlot === slot) btn.classList.add("selected");
    
    btn.addEventListener("click", () => {
      const selected = slotsGrid.querySelector(".slot-btn.selected");
      if (selected) selected.classList.remove("selected");
      
      btn.classList.add("selected");
      selectedSlot = slot;
      
      window.selectedClientFormattedSlot = converted.displayText;
      window.selectedClientTimezone = toZone;
      
      document.getElementById("btn-goto-details").disabled = false;
    });
    
    slotsGrid.appendChild(btn);
  });
}

async function fetchSlots(dateStr) {
  const slotsGrid = document.getElementById("time-slots-grid");
  slotsGrid.innerHTML = `<div class="slots-info-msg">Retrieving open slots...</div>`;
  
  // Disable next btn during fetch
  document.getElementById("btn-goto-details").disabled = true;
  selectedSlot = "";
  activeAvailableSlots = [];
  activeFetchedDateStr = dateStr;

  try {
    const res = await fetch(`/api/bookings/available-slots?date=${dateStr}`);
    if (!res.ok) throw new Error();
    
    const { availableSlots } = await res.json();
    activeAvailableSlots = availableSlots;
    
    renderLocalizedSlots();
  } catch (error) {
    slotsGrid.innerHTML = `<div class="slots-info-msg" style="color:var(--accent-red)">Failed to retrieve slots. Try again.</div>`;
  }
}

// -------------------------------------------------------------
// BOOKING FORM SUBMISSION
// -------------------------------------------------------------
async function submitBooking(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("btn-submit-booking");
  const originalHtml = submitBtn.innerHTML;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Booking slot...</span>`;

  const payload = {
    name: document.getElementById("sched-name").value.trim(),
    email: document.getElementById("sched-email").value.trim(),
    phone: document.getElementById("sched-phone").value.trim(),
    date: selectedDateStr,
    time: selectedSlot,
    purpose: document.getElementById("sched-purpose").value,
    info: document.getElementById("sched-info").value.trim(),
    clientTimezone: window.selectedClientTimezone || "",
    clientFormattedTime: window.selectedClientFormattedSlot || ""
  };

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    
    if (!res.ok) throw new Error(result.error || "Failed scheduling appointment.");
    
    // Switch to step 3 Success Screen
    document.getElementById("sched-step-details").classList.remove("active");
    document.getElementById("sched-step-success").classList.add("active");
    
    // Populate success ticket
    const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
    const clientTzName = window.selectedClientTimezone ? window.selectedClientTimezone.split('/').pop().replace('_', ' ') : '';
    document.getElementById("success-datetime").innerHTML = `
      <div>${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)} (${bizTz})</div>
      ${window.selectedClientFormattedSlot ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">Local: ${window.selectedClientFormattedSlot} (${clientTzName})</div>` : ''}
    `;
    document.getElementById("success-purpose").innerText = payload.purpose;

    // Reset Form fields
    document.getElementById("widget-booking-form").reset();
    
  } catch (error) {
    alert(`Booking Error: ${error.message}`);
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHtml;
  }
}

// -------------------------------------------------------------
// FORMATTERS & MATH UTILS
// -------------------------------------------------------------
function getCurrentTimeFormatted() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function formatTime12(time24) {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const ampm = parseInt(hours) >= 12 ? "PM" : "AM";
  const displayHours = parseInt(hours) % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  // dateStr format: YYYY-MM-DD
  const [year, month, day] = dateStr.split("-");
  const dateObj = new Date(year, month - 1, day);
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function scrollToBottom() {
  const container = document.getElementById("chat-messages");
  container.scrollTop = container.scrollHeight;
}

// Quick markdown formatter for bolding (**bold**), code blocks (`code`), and hyperlinked text ([lbl](url))
function formatTextMarkdown(text) {
  if (!text) return "";
  
  // Clean up any literal template section headers
  let cleanText = text
    .replace(/^(?:\*\*)?Direct\s*&\s*Warm\s*Response:?(?:\*\*)?:?\s*/gim, "")
    .replace(/^(?:\*\*)?Structured\s*Details\s*(?:\(Bullet\s*Points\))?:?(?:\*\*)?:?\s*/gim, "")
    .replace(/^(?:\*\*)?Value-Add\s*\/\s*Consulting\s*Insight:?(?:\*\*)?:?\s*/gim, "")
    .replace(/^(?:\*\*)?Standardized\s*Next-Step:?(?:\*\*)?:?\s*/gim, "");
    
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  let html = cleanText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Format Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Format Code `code`
  html = html.replace(/`(.*?)`/g, '<code style="background-color:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');
  
  // Format Bullet Points starting with "* " or "- " at line starts into beautiful custom list items
  html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<div class="custom-list-item">$1</div>');
  
  // Strip trailing newlines directly following custom list items to prevent unwanted vertical <br> breaks
  html = html.replace(/(<div class="custom-list-item">.*?<\/div>)\n/g, '$1');
  
  // Format markdown links [text](url) into premium styled buttons
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="inline-link-btn"><i data-lucide="external-link"></i> $1</a>');
  
  // Auto-detect and parse any remaining raw HTTP/HTTPS URLs (that are not inside existing href tags)
  html = html.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, (url) => {
    // Trim trailing punctuation marks like periods or commas from sentences
    let cleanUrl = url;
    let suffix = "";
    if (url.endsWith(".") || url.endsWith(",")) {
      cleanUrl = url.slice(0, -1);
      suffix = url.slice(-1);
    }
    // Formulate a beautiful action button
    return `<a href="${cleanUrl}" target="_blank" class="inline-link-btn"><i data-lucide="external-link"></i> Open Link</a>${suffix}`;
  });

  // Convert newlines to breaks
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

// Convert Hex to RGBA
function hexToRgba(hex, alpha = 1) {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Lighten colors for hovers
function lightenHexColor(hex, percent) {
  let num = parseInt(hex.replace("#",""), 16),
  amt = Math.round(2.55 * percent),
  R = (num >> 16) + amt,
  G = (num >> 8 & 0x00FF) + amt,
  B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

// Darken colors for nested panels
function darkenHexColor(hex, percent) {
  let num = parseInt(hex.replace("#",""), 16),
  amt = Math.round(2.55 * percent),
  R = (num >> 16) - amt,
  G = (num >> 8 & 0x00FF) - amt,
  B = (num & 0x0000FF) - amt;
  return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}

function isLightColor(hex) {
  if (!hex) return false;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return false;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 180;
}

function shouldShowLocationCard(text, settings = {}) {
  const lowerText = (text || "").toLowerCase();
  const address = settings.companyAddress || "";
  const addressKeyword = (address && address !== "Not specified" && address !== "our virtual headquarters") ? address.toLowerCase().substring(0, 15) : null;

  return (addressKeyword && lowerText.includes(addressKeyword)) ||
         lowerText.includes("primus building") || 
         lowerText.includes("guindy") || 
         lowerText.includes("chennai") || 
         lowerText.includes("office location") ||
         lowerText.includes("office address") ||
         lowerText.includes("headquarters") ||
         lowerText.includes("where are you located") ||
         lowerText.includes("where is your office");
}

function createLocationCard(settings = {}) {
  const card = document.createElement("div");
  card.className = "contact-location-card-premium";
  
  const compName = settings.botName ? settings.botName.replace(/\sAssistant|\sBot/gi, "") : "Company";
  const address = settings.companyAddress || "";
  const phoneVal = settings.companyPhone || "";
  const mapLink = settings.companyMapLink || "";
  const emailVal = settings.adminEmail || "";
  
  // Determine if it is a physical location or online contact card
  const hasPhysicalAddress = address && address !== "Not specified" && address !== "our virtual headquarters" && address.trim() !== "";
  
  let actionsHtml = "";
  if (hasPhysicalAddress && mapLink && mapLink !== "Not specified" && mapLink.trim() !== "") {
    actionsHtml += `
      <a href="${mapLink}" target="_blank" class="card-btn direction-btn">
        <i data-lucide="navigation"></i> Directions
      </a>`;
  }
  if (phoneVal && phoneVal !== "Not specified" && phoneVal.trim() !== "") {
    actionsHtml += `
      <a href="tel:${phoneVal}" class="card-btn call-btn">
        <i data-lucide="phone"></i> Call Office
      </a>`;
  }
  if (emailVal && emailVal !== "Not specified" && emailVal.trim() !== "") {
    actionsHtml += `
      <a href="mailto:${emailVal}" class="card-btn email-btn">
        <i data-lucide="mail"></i> Email Us
      </a>`;
  }

  card.innerHTML = `
    <div class="card-glow-bg"></div>
    <div class="card-header-premium">
      <i data-lucide="${hasPhysicalAddress ? 'map-pin' : 'mail'}" class="card-pin-icon"></i>
      <span>${hasPhysicalAddress ? 'Official Headquarters' : 'Contact Information'}</span>
    </div>
    <div class="card-body-premium">
      <h4 class="company-name-premium">${compName} ${hasPhysicalAddress ? 'Office Premises' : 'Support Team'}</h4>
      <p class="address-text-premium">${hasPhysicalAddress ? address : `Get in touch with us directly at ${emailVal || 'our email'} or via phone ${phoneVal ? `at ${phoneVal}` : ''}.`}</p>
      
      <div class="card-actions-premium">
        ${actionsHtml}
      </div>
    </div>
  `;
  return card;
}
