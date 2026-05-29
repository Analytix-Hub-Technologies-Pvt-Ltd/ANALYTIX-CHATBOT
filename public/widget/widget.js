// Chat Widget State
let chatHistory = [];
let botName = "AH Bot";
let primaryColor = "#2563eb";
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed

// Booking selections
let selectedDateStr = ""; // YYYY-MM-DD
let selectedSlot = ""; // HH:MM

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
    
    // Update Header Name
    document.getElementById("bot-display-name").innerText = botName;
    
    // Update Welcome message content
    const welcomeBubble = document.getElementById("welcome-msg-bubble");
    if (data.welcomeMessage) {
      welcomeBubble.innerText = data.welcomeMessage;
    }
    
    // Format welcome message time
    document.getElementById("welcome-msg-time").innerText = getCurrentTimeFormatted();

    // Inject custom CSS styling overrides dynamically to match chosen brand color
    const style = document.createElement("style");
    style.innerHTML = `
      :root {
        --primary: ${primaryColor} !important;
        --primary-glow: ${hexToRgba(primaryColor, 0.15)} !important;
        --primary-hover: ${lightenHexColor(primaryColor, 15)} !important;
      }
    `;
    document.head.appendChild(style);

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
      body: JSON.stringify({ messages: chatHistory })
    });
    
    const result = await res.json();
    
    // Hide Typing Indicator
    typingIndicator.classList.add("hidden");
    
    if (!res.ok) throw new Error(result.error || "Chatbot service unavailable.");
    
    let cleanedResponse = result.response;
    let triggerBooking = false;
    
    // Check if the LLM explicitly requested to slide open the interactive booking window
    if (cleanedResponse.includes("[TRIGGER_BOOKING]")) {
      cleanedResponse = cleanedResponse.replace(/\[TRIGGER_BOOKING\]/g, "").trim();
      triggerBooking = true;
    }
    
    // Append Assistant response bubble
    const botRow = appendMessage("bot", cleanedResponse);
    chatHistory.push({ role: "assistant", content: cleanedResponse });
    scrollToElement(botRow);

    if (triggerBooking) {
      setTimeout(() => {
        triggerInlineBooking();
      }, 800);
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

  if (sender === 'bot' && isLocationTrigger) {
    const card = document.createElement("div");
    card.className = "contact-location-card-premium";
    card.innerHTML = `
      <div class="card-glow-bg"></div>
      <div class="card-header-premium">
        <i data-lucide="map-pin" class="card-pin-icon"></i>
        <span>Official Headquarters</span>
      </div>
      <div class="card-body-premium">
        <h4 class="company-name-premium">AnalytixHub Office Premises</h4>
        <p class="address-text-premium">1st floor, Primus Building, Door No. SP – 7A, Guindy Industrial Estate, SIDCO Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032, India.</p>
        
        <div class="card-actions-premium">
          <a href="https://www.google.com/maps/search/?api=1&query=1st+floor,+Primus+Building,+SP-7A,+Guindy+Industrial+Estate,+Chennai,+Tamil+Nadu+600032" target="_blank" class="card-btn direction-btn">
            <i data-lucide="navigation"></i> Directions
          </a>
          <a href="tel:+917397577392" class="card-btn call-btn">
            <i data-lucide="phone"></i> Call Office
          </a>
          <a href="mailto:contactus@analytixhub.org" class="card-btn email-btn">
            <i data-lucide="mail"></i> Email Us
          </a>
        </div>
      </div>
    `;
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
    appendMessage("bot", `Excellent! Your consultation has been successfully scheduled for **${formatDateDisplay(selectedDateStr)}** at **${formatTime12(selectedSlot)} (IST)**. A calendar invitation and confirmation details email have been dispatched to your inbox.`);
    chatHistory.push({
      role: "assistant",
      content: `Your consultation has been successfully scheduled for ${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)}. A confirmation email has been dispatched.`
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
  summaryLbl.innerText = `${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)}`;
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
async function fetchSlots(dateStr) {
  const slotsGrid = document.getElementById("time-slots-grid");
  slotsGrid.innerHTML = `<div class="slots-info-msg">Retrieving open slots...</div>`;
  
  // Disable next btn during fetch
  document.getElementById("btn-goto-details").disabled = true;
  selectedSlot = "";

  try {
    const res = await fetch(`/api/bookings/available-slots?date=${dateStr}`);
    if (!res.ok) throw new Error();
    
    const { availableSlots } = await res.json();
    slotsGrid.innerHTML = "";
    
    if (availableSlots.length === 0) {
      slotsGrid.innerHTML = `<div class="slots-info-msg">No slots available on this date. Please select another day.</div>`;
      return;
    }
    
    availableSlots.forEach(slot => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-btn";
      btn.innerText = formatTime12(slot);
      
      if (selectedSlot === slot) btn.classList.add("selected");
      
      btn.addEventListener("click", () => {
        const selected = slotsGrid.querySelector(".slot-btn.selected");
        if (selected) selected.classList.remove("selected");
        
        btn.classList.add("selected");
        selectedSlot = slot;
        
        // Enable next step button
        document.getElementById("btn-goto-details").disabled = false;
      });
      
      slotsGrid.appendChild(btn);
    });

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
    purpose: document.getElementById("sched-purpose").value
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
    document.getElementById("success-datetime").innerText = `${formatDateDisplay(selectedDateStr)} at ${formatTime12(selectedSlot)}`;
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
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // Format Bold **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Format Code `code`
  html = html.replace(/`(.*?)`/g, '<code style="background-color:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:12px;">$1</code>');
  
  // Format Bullet Points starting with "* " or "- " at line starts into beautiful custom list items
  html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<div class="custom-list-item">$1</div>');
  
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
