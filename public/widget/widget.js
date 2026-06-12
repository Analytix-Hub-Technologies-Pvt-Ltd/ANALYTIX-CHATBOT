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

// Geolocation coordinates
let userCoords = null;

// Request location on widget load
function requestUserGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userCoords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        console.log("Browser coordinates successfully resolved:", userCoords);
      },
      (error) => {
        console.warn("Browser geolocation access refused or failed:", error);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Request coordinates
  requestUserGeolocation();
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
    const backgroundColor = data.backgroundColor || "#ffffff";
    
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
      body: JSON.stringify({ messages: chatHistory, conversationId: conversationId, coords: userCoords })
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
                  const inlineCard = createInlineBookingCard();
                  botRow.appendChild(inlineCard);
                  if (window.lucide) {
                    window.lucide.createIcons();
                  }
                  scrollToElement(botRow);
                }, 800);
              }
            }

            if (displayText.includes("[CREATE_BOOKING:")) {
              const startIdx = displayText.indexOf("[CREATE_BOOKING:");
              displayText = displayText.substring(0, startIdx).trim();
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
    let finalCleanText = accumulatedText;
    let hasTriggeredBookingTag = false;
    if (finalCleanText.includes("[CREATE_BOOKING:")) {
      const startIdx = finalCleanText.indexOf("[CREATE_BOOKING:");
      const endIdx = finalCleanText.indexOf("]", startIdx);
      if (endIdx !== -1) {
        const tagStr = finalCleanText.substring(startIdx, endIdx + 1);
        finalCleanText = finalCleanText.replace(tagStr, "").trim();
        
        if (!hasTriggeredBookingTag) {
          hasTriggeredBookingTag = true;
          const jsonStr = tagStr.substring(16, tagStr.length - 1);
          try {
            const bookingPayload = JSON.parse(jsonStr);
            setTimeout(() => {
              executeAutomaticChatBooking(bookingPayload);
            }, 500);
          } catch (e) {
            console.error("Auto booking JSON parsing failed:", e);
          }
        }
      } else {
        const jsonStr = finalCleanText.substring(startIdx + 16).trim();
        if (jsonStr.endsWith("}")) {
          try {
            const bookingPayload = JSON.parse(jsonStr);
            setTimeout(() => {
              executeAutomaticChatBooking(bookingPayload);
            }, 500);
          } catch (e) {
            console.error("Auto booking fallback JSON parsing failed:", e);
          }
        }
      }
    }

    finalCleanText = finalCleanText.replace(/\[TRIGGER_BOOKING\]/g, "").trim();
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
  const paymentPanel = document.getElementById("sched-step-payment");
  if (paymentPanel) {
    paymentPanel.classList.remove("active");
    paymentPanel.style.display = "none";
  }
  document.getElementById("sched-step-dateTime").classList.add("active");
}

function gotoDetailsStep() {
  if (!selectedDateStr || !selectedSlot) return;
  
  // Toggle Steps
  document.getElementById("sched-step-dateTime").classList.remove("active");
  const paymentPanel = document.getElementById("sched-step-payment");
  if (paymentPanel) {
    paymentPanel.classList.remove("active");
    paymentPanel.style.display = "none";
  }
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
// Global variable to hold temporary booking payload before payment is finalized
let pendingBookingPayload = null;

async function submitBooking(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById("btn-submit-booking");
  const originalHtml = submitBtn.innerHTML;
  
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

  if (window.activeWidgetSettings?.paymentEnabled) {
    // Save payload and navigate to payments screen
    pendingBookingPayload = payload;
    
    // Update payment summary fee banner
    const feeAmount = window.activeWidgetSettings.paymentAmount !== undefined ? window.activeWidgetSettings.paymentAmount : "15.00";
    const feeCurrency = window.activeWidgetSettings.paymentCurrency || "USD";
    const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
    const symbol = currencySymbols[feeCurrency] || '';
    document.getElementById("payment-summary-fee").innerText = `Consultation Fee: ${symbol}${feeAmount} ${feeCurrency}`;
    
    const gateway = window.activeWidgetSettings.paymentGateway || "mock";
    const mockContainer = document.getElementById("mock-payment-container");
    const razorpayContainer = document.getElementById("razorpay-payment-container");

    if (gateway === "razorpay") {
      if (mockContainer) mockContainer.classList.add("hidden");
      if (razorpayContainer) razorpayContainer.classList.remove("hidden");
    } else {
      if (mockContainer) mockContainer.classList.remove("hidden");
      if (razorpayContainer) razorpayContainer.classList.add("hidden");

      // Populate instructions text
      const sandboxText = document.getElementById("sandbox-instructions-text");
      if (sandboxText) {
        sandboxText.innerText = window.activeWidgetSettings.paymentInstructions || "Mock payment mode enabled. Use test card 4242 4242 4242 4242 and any future expiry.";
      }
      
      // Bind credit card input formatters/visualizers if not already bound
      setupCreditCardListeners();
    }

    // Switch panels
    document.getElementById("sched-step-details").classList.remove("active");
    const paymentPanel = document.getElementById("sched-step-payment");
    paymentPanel.style.display = "block"; // Make sure it's visible
    paymentPanel.classList.add("active");
    return;
  }

  // Otherwise, book directly
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Booking slot...</span>`;
  
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

let ccListenersBound = false;
function setupCreditCardListeners() {
  if (ccListenersBound) return;
  ccListenersBound = true;
  
  const cardNumInput = document.getElementById("card-number");
  const cardExpiryInput = document.getElementById("card-expiry");
  const cardCvcInput = document.getElementById("card-cvc");
  const cardVisualNumber = document.getElementById("card-visual-number");
  const cardVisualHolder = document.getElementById("card-visual-holder-val");
  const cardVisualExpiry = document.getElementById("card-visual-expiry-val");
  const cardHolderInput = document.getElementById("card-holder");
  const cardIndicator = document.getElementById("card-type-icon-indicator");
  
  if (cardNumInput) {
    cardNumInput.addEventListener("input", (e) => {
      let value = e.target.value.replace(/\D/g, "");
      // Format with spaces
      let formatted = "";
      for (let i = 0; i < value.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += " ";
        formatted += value[i];
      }
      e.target.value = formatted;
      
      // Update visual card
      if (cardVisualNumber) {
        cardVisualNumber.innerText = formatted || "•••• •••• •••• ••••";
      }
      
      // Card brand indicator
      if (cardIndicator) {
        if (value.startsWith("4")) {
          cardIndicator.innerText = "VISA";
        } else if (/^5[1-5]/.test(value)) {
          cardIndicator.innerText = "MASTERCARD";
        } else {
          cardIndicator.innerText = "";
        }
      }
    });
  }
  
  if (cardHolderInput && cardVisualHolder) {
    cardHolderInput.addEventListener("input", (e) => {
      cardVisualHolder.innerText = e.target.value.toUpperCase() || "YOUR NAME";
    });
  }
  
  if (cardExpiryInput) {
    cardExpiryInput.addEventListener("input", (e) => {
      let value = e.target.value.replace(/\D/g, "");
      if (value.length > 2) {
        value = value.substring(0, 2) + "/" + value.substring(2, 4);
      }
      e.target.value = value;
      
      if (cardVisualExpiry) {
        cardVisualExpiry.innerText = value || "MM/YY";
      }
    });
  }
  
  if (cardCvcInput) {
    cardCvcInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4);
    });
  }
}

async function processPayment(e) {
  e.preventDefault();
  
  const errorMsgEl = document.getElementById("payment-error-msg");
  errorMsgEl.classList.add("hidden");
  errorMsgEl.innerText = "";
  
  const cardHolder = document.getElementById("card-holder").value.trim();
  const cardNumber = document.getElementById("card-number").value.replace(/\s/g, "");
  const cardExpiry = document.getElementById("card-expiry").value.trim();
  const cardCvc = document.getElementById("card-cvc").value.trim();
  
  if (!cardHolder || cardNumber.length < 15 || cardExpiry.length < 5 || cardCvc.length < 3) {
    errorMsgEl.classList.remove("hidden");
    errorMsgEl.innerText = "Please fill in all credit card details correctly.";
    return;
  }
  
  if (!/^\d+$/.test(cardNumber)) {
    errorMsgEl.classList.remove("hidden");
    errorMsgEl.innerText = "Invalid credit card number format.";
    return;
  }
  
  const payBtn = document.getElementById("btn-pay-confirm");
  const originalHtml = payBtn.innerHTML;
  payBtn.disabled = true;
  payBtn.innerHTML = `<span>Authorizing payment...</span>`;
  
  // Simulate payment processing delay
  setTimeout(async () => {
    try {
      const mockTxId = "TXN-MOCK-" + Math.random().toString(36).substring(2, 10).toUpperCase();
      const feeAmount = window.activeWidgetSettings.paymentAmount !== undefined ? window.activeWidgetSettings.paymentAmount : "15.00";
      const feeCurrency = window.activeWidgetSettings.paymentCurrency || "USD";
      const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
      const symbol = currencySymbols[feeCurrency] || '';
      
      const payload = {
        ...pendingBookingPayload,
        paymentStatus: "Paid",
        paymentAmountPaid: `${symbol}${feeAmount} ${feeCurrency}`,
        paymentTransactionId: mockTxId
      };
      
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed scheduling appointment.");
      
      // Update success details with payment confirmation
      const paymentRow = document.getElementById("success-payment-row");
      if (paymentRow) {
        paymentRow.style.display = "flex";
        document.getElementById("success-payment-val").innerText = `Paid ${symbol}${feeAmount} ${feeCurrency} (TxID: ${mockTxId})`;
      }
      
      // Hide payment step, show success step
      const paymentPanel = document.getElementById("sched-step-payment");
      paymentPanel.classList.remove("active");
      paymentPanel.style.display = "none";
      
      document.getElementById("sched-step-success").classList.add("active");
      
      // Populate success ticket
      const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
      const clientTzName = window.selectedClientTimezone ? window.selectedClientTimezone.split('/').pop().replace('_', ' ') : '';
      document.getElementById("success-datetime").innerHTML = `
        <div>${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)} (${bizTz})</div>
        ${window.selectedClientFormattedSlot ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">Local: ${window.selectedClientFormattedSlot} (${clientTzName})</div>` : ''}
      `;
      document.getElementById("success-purpose").innerText = payload.purpose;

      // Reset forms
      document.getElementById("widget-booking-form").reset();
      document.getElementById("widget-payment-form").reset();
      
    } catch (error) {
      errorMsgEl.classList.remove("hidden");
      errorMsgEl.innerText = error.message;
      payBtn.disabled = false;
      payBtn.innerHTML = originalHtml;
    }
  }, 1200);
}

async function payWithRazorpay(e) {
  if (e) e.preventDefault();
  
  const errorMsgEl = document.getElementById("razorpay-error-msg");
  if (errorMsgEl) errorMsgEl.classList.add("hidden");
  
  const payBtn = document.getElementById("btn-razorpay-pay");
  const originalHtml = payBtn.innerHTML;
  payBtn.disabled = true;
  payBtn.innerHTML = `<span>Opening Razorpay...</span>`;
  
  try {
    const feeAmount = window.activeWidgetSettings.paymentAmount !== undefined ? window.activeWidgetSettings.paymentAmount : 15.00;
    const feeCurrency = window.activeWidgetSettings.paymentCurrency || "USD";
    
    // 1. Create secure order on server
    const orderRes = await fetch("/api/bookings/razorpay-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: feeAmount, currency: feeCurrency })
    });
    
    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderData.error || "Failed to initialize secure payment order.");
    
    // 2. Setup checkout options
    const options = {
      key: orderData.keyId,
      amount: orderData.amount * 100, // minor units
      currency: orderData.currency,
      name: window.activeWidgetSettings.botName || "Consultation Booking",
      description: `Booking Fee for ${pendingBookingPayload.name}`,
      order_id: orderData.orderId,
      handler: async function (response) {
        payBtn.innerHTML = `<span>Verifying payment...</span>`;
        
        try {
          // 3. Confirm payment during booking creation
          const payload = {
            ...pendingBookingPayload,
            paymentStatus: "Paid",
            paymentAmountPaid: feeAmount,
            paymentTransactionId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature
          };
          
          const res = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Failed scheduling appointment.");
          
          // Update success ticket
          const paymentRow = document.getElementById("success-payment-row");
          if (paymentRow) {
            paymentRow.style.display = "flex";
            const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
            const symbol = currencySymbols[feeCurrency] || '';
            document.getElementById("success-payment-val").innerText = `Paid ${symbol}${feeAmount} ${feeCurrency} (TxID: ${response.razorpay_payment_id})`;
          }
          
          // Toggle steps
          const paymentPanel = document.getElementById("sched-step-payment");
          paymentPanel.classList.remove("active");
          paymentPanel.style.display = "none";
          
          document.getElementById("sched-step-success").classList.add("active");
          
          const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
          const clientTzName = window.selectedClientTimezone ? window.selectedClientTimezone.split('/').pop().replace('_', ' ') : '';
          document.getElementById("success-datetime").innerHTML = `
            <div>${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)} (${bizTz})</div>
            ${window.selectedClientFormattedSlot ? `<div style="font-size: 11px; opacity: 0.8; margin-top: 3px;">Local: ${window.selectedClientFormattedSlot} (${clientTzName})</div>` : ''}
          `;
          document.getElementById("success-purpose").innerText = payload.purpose;
    
          document.getElementById("widget-booking-form").reset();
          
        } catch (error) {
          if (errorMsgEl) {
            errorMsgEl.classList.remove("hidden");
            errorMsgEl.innerText = error.message;
          }
          payBtn.disabled = false;
          payBtn.innerHTML = originalHtml;
        }
      },
      modal: {
        ondismiss: function () {
          payBtn.disabled = false;
          payBtn.innerHTML = originalHtml;
        }
      },
      prefill: {
        name: pendingBookingPayload.name,
        email: pendingBookingPayload.email,
        contact: pendingBookingPayload.phone
      },
      theme: {
        color: window.activeWidgetSettings.primaryColor || "#2563eb"
      }
    };
    
    const rzp = new Razorpay(options);
    rzp.open();
    
  } catch (error) {
    if (errorMsgEl) {
      errorMsgEl.classList.remove("hidden");
      errorMsgEl.innerText = error.message;
    }
    payBtn.disabled = false;
    payBtn.innerHTML = originalHtml;
  }
}

async function executeAutomaticChatBooking(bookingPayload) {
  const payload = {
    botId,
    name: bookingPayload.name,
    email: bookingPayload.email,
    phone: bookingPayload.phone || '',
    date: bookingPayload.date,
    time: bookingPayload.time,
    purpose: bookingPayload.purpose || 'General Consultation',
    info: bookingPayload.info || 'Scheduled via Conversational AI Assistant',
    clientTimezone: window.selectedClientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    clientFormattedTime: bookingPayload.time,
    paymentStatus: window.activeWidgetSettings?.paymentEnabled ? 'unpaid' : 'N/A',
    paymentAmountPaid: '',
    paymentTransactionId: ''
  };

  appendMessage("bot", `🤖 *Processing your booking request...*`);
  
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed scheduling appointment.");
    
    const bizTz = window.activeWidgetSettings?.bookingTimezone || "Asia/Kolkata";
    
    let successMsg = `🎉 **Appointment Successfully Booked!**\n\n`;
    successMsg += `📅 **Date:** ${formatDateDisplay(payload.date)}\n`;
    successMsg += `⏰ **Time:** ${formatTime12(payload.time)} (${bizTz})\n`;
    successMsg += `👤 **Name:** ${payload.name}\n`;
    successMsg += `✉️ **Email:** ${payload.email}\n`;
    
    if (window.activeWidgetSettings?.paymentEnabled) {
      const feeAmount = window.activeWidgetSettings.paymentAmount !== undefined ? window.activeWidgetSettings.paymentAmount : "15.00";
      const feeCurrency = window.activeWidgetSettings.paymentCurrency || "USD";
      const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
      const symbol = currencySymbols[feeCurrency] || '';
      
      successMsg += `\n💳 **Payment Status:** Unpaid (Fee: ${symbol}${feeAmount} ${feeCurrency}). Please check your email for the payment link to complete the booking confirmation.`;
    } else {
      successMsg += `\n✅ A calendar invitation has been sent to your email.`;
    }
    
    appendMessage("bot", successMsg);
    
    chatHistory.push({
      role: "assistant",
      content: `Appointment successfully scheduled for ${formatDateDisplay(payload.date)} at ${formatTime12(payload.time)}. Details sent via email.`
    });
    
  } catch (error) {
    appendMessage("bot", `❌ **Booking Failed:** ${error.message || "An error occurred while booking. Please try booking manually using the calendar icon."}`);
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

function createInlineBookingCard() {
  const card = document.createElement("div");
  card.className = "inline-booking-card";
  
  let selectedDate = "";
  let selectedSlot = "";
  let activeSlots = [];
  
  // Step 1: Select Date & Time
  const stepDate = document.createElement("div");
  stepDate.className = "inline-step step-date active";
  stepDate.innerHTML = `
    <div class="step-title"><i data-lucide="calendar"></i> Select a Date</div>
    <div class="date-tabs"></div>
    <div class="step-title" style="margin-top:16px;"><i data-lucide="clock"></i> Available Slots</div>
    <div class="slots-grid"><div class="slots-info-msg">Choose a date to see times</div></div>
  `;
  card.appendChild(stepDate);
  
  // Step 2: Form Details
  const stepForm = document.createElement("div");
  stepForm.className = "inline-step step-form";
  stepForm.style.display = "none";
  stepForm.innerHTML = `
    <div class="step-title"><i data-lucide="user"></i> Contact Information</div>
    <div class="details-form-container">
      <div class="form-group">
        <label>Full Name *</label>
        <input type="text" class="form-input-name" placeholder="John Doe" required />
      </div>
      <div class="form-group">
        <label>Email Address *</label>
        <input type="email" class="form-input-email" placeholder="john@example.com" required />
      </div>
      <div class="form-group">
        <label>Phone Number *</label>
        <input type="tel" class="form-input-phone" placeholder="1234567890" required />
      </div>
      <button type="button" class="action-btn btn-submit-details" disabled>Confirm details & Proceed</button>
    </div>
  `;
  card.appendChild(stepForm);
  
  // Step 3: Payment
  const stepPayment = document.createElement("div");
  stepPayment.className = "inline-step step-payment";
  stepPayment.style.display = "none";
  
  const feeAmount = window.activeWidgetSettings?.paymentAmount !== undefined ? window.activeWidgetSettings.paymentAmount : "15.00";
  const feeCurrency = window.activeWidgetSettings?.paymentCurrency || "USD";
  const currencySymbols = { USD: '$', INR: '₹', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };
  const symbol = currencySymbols[feeCurrency] || '';
  const instructions = window.activeWidgetSettings?.paymentInstructions || "Mock payment mode: Use test card 4242 4242 4242 4242";
  const gateway = window.activeWidgetSettings?.paymentGateway || "mock";

  if (gateway === "razorpay") {
    stepPayment.innerHTML = `
      <div class="step-title"><i data-lucide="credit-card"></i> Consultation Payment</div>
      <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 15px; line-height: 1.4;">
        Please complete payment through the secure Razorpay Gateway to book your consultation appointment.
      </p>
      <div class="payment-error-alert hidden" style="margin-top:10px; margin-bottom:10px;"></div>
      <button type="button" class="action-btn btn-submit-payment" style="width:100%; max-width:none;">Pay Now via Razorpay</button>
    `;
  } else {
    stepPayment.innerHTML = `
      <div class="step-title"><i data-lucide="credit-card"></i> Consultation Payment</div>
      <div class="sandbox-payment-alert" style="margin-bottom: 10px;">
        <i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;"></i>
        <span>${instructions}</span>
      </div>
      <div class="form-group">
        <label>Cardholder Name</label>
        <input type="text" class="card-holder" placeholder="JOHN DOE" required />
      </div>
      <div class="form-group">
        <label>Card Number</label>
        <input type="text" class="card-number" placeholder="4242 4242 4242 4242" required />
      </div>
      <div style="display:flex;gap:8px;">
        <div class="form-group" style="flex:1;">
          <label>Expiry Date</label>
          <input type="text" class="card-expiry" placeholder="MM/YY" required />
        </div>
        <div class="form-group" style="flex:1;">
          <label>CVC / CVV</label>
          <input type="password" class="card-cvc" placeholder="•••" required />
        </div>
      </div>
      <div class="payment-error-alert hidden" style="margin-top:10px;"></div>
      <button type="button" class="action-btn btn-submit-payment">Pay ${symbol}${feeAmount} ${feeCurrency}</button>
    `;
  }
  card.appendChild(stepPayment);

  // Step 4: Success Ticket
  const stepSuccess = document.createElement("div");
  stepSuccess.className = "inline-step step-success";
  stepSuccess.style.display = "none";
  card.appendChild(stepSuccess);

  // LOGIC & EVENTS
  const dates = getNext5Days();
  const dateTabsContainer = stepDate.querySelector(".date-tabs");
  const slotsGrid = stepDate.querySelector(".slots-grid");
  const btnSubmitDetails = stepForm.querySelector(".btn-submit-details");
  
  dates.forEach(d => {
    const tab = document.createElement("button");
    tab.className = "date-tab";
    tab.innerText = d.label;
    tab.type = "button";
    tab.addEventListener("click", async () => {
      dateTabsContainer.querySelectorAll(".date-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      selectedDate = d.dateStr;
      selectedSlot = "";
      slotsGrid.innerHTML = `<div class="slots-info-msg">Retrieving open slots...</div>`;
      
      try {
        const res = await fetch(`/api/bookings/available-slots?date=${d.dateStr}`);
        if (!res.ok) throw new Error();
        const { availableSlots } = await res.json();
        activeSlots = availableSlots;
        
        slotsGrid.innerHTML = "";
        if (activeSlots.length === 0) {
          slotsGrid.innerHTML = `<div class="slots-info-msg">No slots available on this date.</div>`;
          return;
        }
        
        activeSlots.forEach(slot => {
          const btn = document.createElement("button");
          btn.className = "slot-pill";
          btn.type = "button";
          btn.innerText = formatTime12(slot);
          btn.addEventListener("click", () => {
            slotsGrid.querySelectorAll(".slot-pill").forEach(p => p.classList.remove("selected"));
            btn.classList.add("selected");
            selectedSlot = slot;
            
            stepForm.style.display = "block";
            scrollToBottom();
          });
          slotsGrid.appendChild(btn);
        });
      } catch (err) {
        slotsGrid.innerHTML = `<div class="slots-info-msg" style="color:var(--accent-red)">Failed to load slots.</div>`;
      }
    });
    dateTabsContainer.appendChild(tab);
  });
  
  const inputs = stepForm.querySelectorAll("input");
  const validateForm = () => {
    let valid = true;
    inputs.forEach(i => {
      if (!i.value.trim()) valid = false;
    });
    btnSubmitDetails.disabled = !valid;
  };
  inputs.forEach(i => i.addEventListener("input", validateForm));
  
  btnSubmitDetails.addEventListener("click", () => {
    if (window.activeWidgetSettings?.paymentEnabled) {
      stepForm.style.display = "none";
      stepPayment.style.display = "block";
      
      const ccNum = stepPayment.querySelector(".card-number");
      const ccExp = stepPayment.querySelector(".card-expiry");
      const ccCvc = stepPayment.querySelector(".card-cvc");
      
      if (ccNum && ccExp && ccCvc) {
        ccNum.addEventListener("input", (e) => {
          let val = e.target.value.replace(/\D/g, "");
          let fmt = "";
          for (let i = 0; i < val.length; i++) {
            if (i > 0 && i % 4 === 0) fmt += " ";
            fmt += val[i];
          }
          e.target.value = fmt;
        });
        ccExp.addEventListener("input", (e) => {
          let val = e.target.value.replace(/\D/g, "");
          if (val.length > 2) {
            val = val.substring(0, 2) + "/" + val.substring(2, 4);
          }
          e.target.value = val;
        });
        ccCvc.addEventListener("input", (e) => {
          e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4);
        });
      }
      
    } else {
      executeInlineBooking();
    }
    scrollToBottom();
  });
  
  const btnSubmitPayment = stepPayment.querySelector(".btn-submit-payment");
  btnSubmitPayment.addEventListener("click", async () => {
    const errorAlert = stepPayment.querySelector(".payment-error-alert");
    errorAlert.classList.add("hidden");

    if (window.activeWidgetSettings?.paymentGateway === "razorpay") {
      btnSubmitPayment.disabled = true;
      btnSubmitPayment.innerText = "Opening Razorpay...";

      const clientName = stepForm.querySelector(".form-input-name").value.trim();
      const clientEmail = stepForm.querySelector(".form-input-email").value.trim();
      const clientPhone = stepForm.querySelector(".form-input-phone").value.trim();

      try {
        const orderRes = await fetch("/api/bookings/razorpay-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: feeAmount, currency: feeCurrency })
        });
        
        const orderData = await orderRes.json();
        if (!orderRes.ok) throw new Error(orderData.error || "Failed to initialize secure payment order.");

        const options = {
          key: orderData.keyId,
          amount: orderData.amount * 100,
          currency: orderData.currency,
          name: window.activeWidgetSettings.botName || "Consultation Booking",
          description: `Booking Fee for ${clientName}`,
          order_id: orderData.orderId,
          handler: async function (response) {
            btnSubmitPayment.innerText = "Verifying...";
            try {
              await executeInlineBooking(
                "Paid", 
                `${symbol}${feeAmount} ${feeCurrency}`, 
                response.razorpay_payment_id,
                response.razorpay_order_id,
                response.razorpay_signature
              );
            } catch (err) {
              errorAlert.classList.remove("hidden");
              errorAlert.innerText = err.message;
              btnSubmitPayment.disabled = false;
              btnSubmitPayment.innerText = "Pay Now via Razorpay";
            }
          },
          modal: {
            ondismiss: function () {
              btnSubmitPayment.disabled = false;
              btnSubmitPayment.innerText = "Pay Now via Razorpay";
            }
          },
          prefill: {
            name: clientName,
            email: clientEmail,
            contact: clientPhone
          },
          theme: {
            color: window.activeWidgetSettings.primaryColor || "#2563eb"
          }
        };

        const rzp = new Razorpay(options);
        rzp.open();

      } catch (error) {
        errorAlert.classList.remove("hidden");
        errorAlert.innerText = error.message;
        btnSubmitPayment.disabled = false;
        btnSubmitPayment.innerText = "Pay Now via Razorpay";
      }

    } else {
      const ccHolderInput = stepPayment.querySelector(".card-holder");
      const ccNumInput = stepPayment.querySelector(".card-number");
      const ccExpInput = stepPayment.querySelector(".card-expiry");
      const ccCvcInput = stepPayment.querySelector(".card-cvc");

      const ccName = ccHolderInput ? ccHolderInput.value.trim() : "";
      const ccNum = ccNumInput ? ccNumInput.value.replace(/\s/g, "") : "";
      const ccExp = ccExpInput ? ccExpInput.value.trim() : "";
      const ccCvc = ccCvcInput ? ccCvcInput.value.trim() : "";
      
      if (!ccName || ccNum.length < 15 || ccExp.length < 5 || ccCvc.length < 3) {
        errorAlert.classList.remove("hidden");
        errorAlert.innerText = "Please fill in all credit card details correctly.";
        return;
      }
      
      btnSubmitPayment.disabled = true;
      btnSubmitPayment.innerText = "Authorizing...";
      
      setTimeout(() => {
        const mockTxId = "TXN-MOCK-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        executeInlineBooking("Paid", `${symbol}${feeAmount} ${feeCurrency}`, mockTxId);
      }, 1200);
    }
  });
  
  async function executeInlineBooking(payStatus = "N/A", payAmount = "", payTxId = "", razorpayOrderId = "", razorpaySignature = "") {
    const payload = {
      botId,
      name: stepForm.querySelector(".form-input-name").value.trim(),
      email: stepForm.querySelector(".form-input-email").value.trim(),
      phone: stepForm.querySelector(".form-input-phone").value.trim(),
      date: selectedDate,
      time: selectedSlot,
      purpose: "General Consultation",
      info: "Scheduled via Interactive Chat Selection Form",
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      clientFormattedTime: selectedSlot,
      paymentStatus: payStatus,
      paymentAmountPaid: payAmount,
      paymentTransactionId: payTxId,
      razorpayOrderId: razorpayOrderId,
      razorpaySignature: razorpaySignature
    };
    
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed scheduling booking");
      }
      
      stepDate.style.display = "none";
      stepForm.style.display = "none";
      stepPayment.style.display = "none";
      
      stepSuccess.style.display = "block";
      stepSuccess.innerHTML = `
        <div class="success-ticket text-center">
          <div class="success-badge"><i data-lucide="check"></i></div>
          <h4 style="color:white;font-weight:600;margin-bottom:8px;">Booking Confirmed!</h4>
          <p style="font-size:11px;color:var(--text-muted);line-height:1.4;margin-bottom:12px;">
            Your session has been scheduled successfully. An invitation has been sent to <strong>${payload.email}</strong>.
          </p>
          <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px;text-align:left;font-size:11px;line-height:1.5;">
            <div><strong style="color:var(--text-muted);">Date:</strong> <span style="float:right;color:white;">${formatDateDisplay(payload.date)}</span></div>
            <div><strong style="color:var(--text-muted);">Time:</strong> <span style="float:right;color:white;">${formatTime12(payload.time)}</span></div>
            ${payStatus !== "N/A" ? `
            <div style="margin-top:6px;border-top:1px dashed rgba(255,255,255,0.06);padding-top:6px;"><strong style="color:var(--text-muted);">Paid Amount:</strong> <span style="float:right;color:var(--accent-green);">${payAmount}</span></div>
            <div><strong style="color:var(--text-muted);">Transaction ID:</strong> <span style="float:right;color:white;font-family:monospace;font-size:9.5px;">${payTxId}</span></div>
            ` : ''}
          </div>
        </div>
      `;
      
      if (window.lucide) {
        window.lucide.createIcons({
          attrs: {
            "stroke-width": 3
          },
          nameAttr: "data-lucide",
          nodeList: stepSuccess.querySelectorAll("[data-lucide]")
        });
      }
      
    } catch (err) {
      alert(`Booking failed: ${err.message}`);
      btnSubmitPayment.disabled = false;
      btnSubmitPayment.innerText = `Pay ${symbol}${feeAmount} ${feeCurrency}`;
    }
  }
  
  return card;
}

function getNext5Days() {
  const dates = [];
  const today = new Date();
  let current = new Date(today);
  while (dates.length < 5) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const label = current.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      dates.push({ dateStr, label });
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

