// Initialize theme immediately on script load to prevent page flashing!
const activeTheme = localStorage.getItem('ah_admin_theme') || 'light';
document.documentElement.setAttribute('data-theme', activeTheme);

// Hook global fetch to inject token automatically
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  const token = localStorage.getItem('ah_chatbot_auth_token');
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await originalFetch(url, options);
  if (response.status === 401) {
    // If unauthorized (session expired), redirect to login page!
    localStorage.clear();
    window.location.href = '/admin/login.html';
  }
  return response;
};

// Global State
let bookingsData = [];
let settingsData = {};
let statsData = {};

// Logout helper
function logout() {
  const token = localStorage.getItem('ah_chatbot_auth_token');
  if (token) {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
  localStorage.clear();
  window.location.href = '/admin/login.html';
}

document.addEventListener("DOMContentLoaded", () => {
  // Enforce authentication
  const token = localStorage.getItem('ah_chatbot_auth_token');
  if (!token) {
    window.location.href = '/admin/login.html';
    return;
  }

  // Enforce onboarding check
  checkOnboarding();

  // Init Lucide Icons
  lucide.createIcons();
  
  // Tab Navigation Listeners
  const tabs = document.querySelectorAll(".nav-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      switchTab(tabName);
    });
  });

  // Search Filter Listener
  const searchInput = document.getElementById("bookings-search");
  if (searchInput) {
    searchInput.addEventListener("input", filterBookings);
  }

  // Bind Theme Toggle button
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  if (themeToggleBtn) {
    updateThemeToggleIcon(activeTheme);
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('ah_admin_theme', newTheme);
      updateThemeToggleIcon(newTheme);
    });
  }

  // Pre-load data
  loadSettings();
  loadBookings();
  
  // Set dynamic host in embed code block based on active address bar and unique botId
  const embedCode = document.getElementById("embed-code-block");
  const reactCode = document.getElementById("react-code-block");
  const origin = window.location.origin;
  const botId = localStorage.getItem('ah_chatbot_bot_id') || 'bot-default';

  if (embedCode) {
    embedCode.innerText = `<script src="${origin}/embed.js" data-bot-id="${botId}"></script>`;
  }

  if (reactCode) {
    reactCode.innerText = `import React, { useEffect } from 'react';

export function ChatbotWidget() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "${origin}/embed.js";
    script.setAttribute('data-bot-id', "${botId}");
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      window.__ah_chatbot_initialized = false;
      const wrapper = document.querySelector('.ah-chatbot-wrapper');
      if (wrapper) wrapper.remove();
    };
  }, []);

  return null;
}`;
  }

  const universalDisplays = document.querySelectorAll(".universal-script-display");
  universalDisplays.forEach(el => {
    el.innerText = `<script src="${origin}/embed.js" data-bot-id="${botId}"></script>`;
  });

  // Bind header 'Test Live Widget' button click handler dynamically with active botId
  const testWidgetBtn = document.getElementById("test-live-widget-btn");
  if (testWidgetBtn) {
    testWidgetBtn.addEventListener("click", () => {
      const activeBotId = localStorage.getItem('ah_chatbot_bot_id') || 'bot-default';
      window.open(`/widget/widget.html?botId=${activeBotId}`, '_blank');
    });
  }
});

// -------------------------------------------------------------
// TAB NAVIGATION
// -------------------------------------------------------------
function switchTab(tabName) {
  // Update nav buttons active state
  const tabs = document.querySelectorAll(".nav-btn");
  tabs.forEach(btn => {
    if (btn.getAttribute("data-tab") === tabName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update panels visibility
  const panels = document.querySelectorAll(".tab-panel");
  panels.forEach(panel => {
    if (panel.id === `tab-content-${tabName}`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  // Update Title & Subtitle text dynamically
  const titles = {
    dashboard: { title: "Dashboard Overview", subtitle: "Real-time chatbot performance and scheduled leads." },
    bookings: { title: "Scheduled Consultations", subtitle: "Manage and audit customer leads gathered by the chatbot." },
    conversations: { title: "Chat Sessions & Leads", subtitle: "Inspect user conversations, IP addresses, and geographical locations captured by the chatbot." },
    settings: { title: "Chatbot Configurations", subtitle: "Customize the Groq LLM brain, themes, custom system prompt, and SMTP email mailer." },
    trainer: { title: "AI Brain Trainer", subtitle: "Recursively crawl any website URL to automatically train and customize your chatbot's identity." },
    embed: { title: "Widget Installation", subtitle: "Generate embed scripts and test the chatbot widget in the sandbox." },
    billing: { title: "Billing & Plans", subtitle: "Manage your subscription plan, view invoice details, and upgrade your chatbot services." }
  };

  if (titles[tabName]) {
    document.getElementById("tab-title").innerText = titles[tabName].title;
    document.getElementById("tab-subtitle").innerText = titles[tabName].subtitle;
  }

  // Reload data if needed
  if (tabName === 'dashboard') {
    loadBookings();
  } else if (tabName === 'bookings') {
    loadBookings();
  } else if (tabName === 'conversations') {
    loadConversations();
  } else if (tabName === 'embed') {
    // Reload Sandbox Preview Iframe to pick up new saved configurations with dynamic botId
    const iframe = document.getElementById("sandbox-iframe");
    if (iframe) {
      const botId = localStorage.getItem('ah_chatbot_bot_id') || 'bot-default';
      iframe.src = `/widget/widget.html?botId=${botId}&v=${Date.now()}`;
    }
  }
}

// -------------------------------------------------------------
// FETCH & RENDER DATA
// -------------------------------------------------------------
async function loadBookings() {
  try {
    const res = await fetch("/api/bookings");
    if (!res.ok) throw new Error("Could not retrieve bookings list.");
    
    bookingsData = await res.json();
    
    // Sort chronologically (newest first)
    bookingsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // Fetch stats
    try {
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        statsData = await statsRes.json();
      }
    } catch (statsErr) {
      console.error("Load Stats Error:", statsErr);
    }
    
    renderDashboardStats();
    renderRecentTable();
    renderAllBookingsTable();
  } catch (error) {
    console.error("Load Bookings Error:", error);
  }
}

function populateTrainerUIFromSettings() {
  if (!settingsData || !settingsData.systemPrompt) {
    return;
  }
  
  const crawlUrlInput = document.getElementById("crawl-url");
  const url = crawlUrlInput ? crawlUrlInput.value.trim() : "";
  if (!url) return; // Wait until websiteUrl is loaded from /api/auth/me
  
  // Show the panels
  const standbyPanel = document.getElementById("crawl-standby-panel");
  const resultsPanel = document.getElementById("crawl-results-panel");
  const identityPanel = document.getElementById("crawl-identity-panel");
  const consolePanel = document.getElementById("crawl-console-panel");
  const consoleLogs = document.getElementById("console-logs-container");
  const statusBadge = document.getElementById("console-status");
  
  if (standbyPanel) standbyPanel.classList.add("hidden");
  if (resultsPanel) resultsPanel.classList.remove("hidden");
  if (identityPanel) identityPanel.classList.remove("hidden");
  
  // Populate result details
  const resPagesEl = document.getElementById("res-pages-count");
  const resWordsEl = document.getElementById("res-words-count");
  if (resPagesEl && resPagesEl.innerText === "0") resPagesEl.innerText = "8";
  if (resWordsEl && resWordsEl.innerText === "0") resWordsEl.innerText = "1248";
  
  // Populate trainer results
  const trainerBotName = document.getElementById("trainer-botName");
  const trainerWelcome = document.getElementById("trainer-welcomeMessage");
  const trainerColor = document.getElementById("trainer-color");
  const trainerColorHex = document.getElementById("trainer-colorHex");
  const trainerPrompt = document.getElementById("trainer-systemPrompt");
  
  if (trainerBotName) trainerBotName.value = settingsData.botName || "Custom Bot";
  if (trainerWelcome) trainerWelcome.value = settingsData.welcomeMessage || "";
  if (trainerColor) trainerColor.value = settingsData.primaryColor || "#0d9488";
  if (trainerColorHex) trainerColorHex.value = settingsData.primaryColor || "#0d9488";
  if (trainerPrompt) trainerPrompt.value = settingsData.systemPrompt || "";
  
  // Populate corporate info card
  const locEl = document.getElementById("scraped-location");
  const emailEl = document.getElementById("scraped-email");
  const phoneEl = document.getElementById("scraped-phone");
  
  if (locEl) locEl.innerText = settingsData.companyAddress || "Not specified";
  if (emailEl) emailEl.innerText = settingsData.companyEmail || "Not specified";
  if (phoneEl) phoneEl.innerText = settingsData.companyPhone || "Not specified";
  
  const mapBtn = document.getElementById("scraped-mapLink");
  const mapWrapper = document.getElementById("scraped-mapLink-wrapper");
  if (settingsData.companyMapLink && settingsData.companyMapLink.startsWith("http")) {
    if (mapBtn) mapBtn.href = settingsData.companyMapLink;
    if (mapWrapper) mapWrapper.style.display = "block";
  } else {
    if (mapWrapper) mapWrapper.style.display = "none";
  }

  // Populate Extracted Services List on page load
  const servicesGrid = document.getElementById("scraped-services-container");
  if (servicesGrid) {
    servicesGrid.innerHTML = "";
    const services = settingsData.companyServices || [];
    if (services && Array.isArray(services) && services.length > 0) {
      services.forEach(serv => {
        const badge = document.createElement("span");
        badge.className = "purpose-tag";
        badge.style.margin = "0";
        badge.innerText = serv;
        servicesGrid.appendChild(badge);
      });
    } else {
      servicesGrid.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">No core services parsed.</span>`;
    }
  }

  
  // Populate console logs to indicate successful training in background!
  if (consolePanel && consoleLogs && consoleLogs.children.length === 0) {
    consolePanel.classList.remove("hidden");
    if (statusBadge) {
      statusBadge.className = "console-badge success";
      statusBadge.innerText = "ACTIVE";
    }
    
    // Add logs
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    consoleLogs.innerHTML = `
      <div class="log-item info">
        <span class="log-time">[${timeStr}]</span>
        <span class="log-text">ℹ️ Automatically detected registered website: ${url}</span>
      </div>
      <div class="log-item success">
        <span class="log-time">[${timeStr}]</span>
        <span class="log-text">✔ Background web crawler task completed successfully!</span>
      </div>
      <div class="log-item success">
        <span class="log-time">[${timeStr}]</span>
        <span class="log-text">✔ AI Chatbot brain auto-trained and actively deployed to your chat widget.</span>
      </div>
    `;
  }
  
  // Update trainer save/deploy button
  const deployBtn = document.querySelector("#trainer-save-form button[type='submit']");
  if (deployBtn) {
    deployBtn.innerHTML = `<i data-lucide="check-circle"></i> <span>Auto-Saved & Deployed!</span>`;
    deployBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    deployBtn.style.border = "none";
  }
  
  lucide.createIcons();
}

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    if (!res.ok) throw new Error("Could not load database configurations.");
    
    settingsData = await res.json();
    
    // Populate SMTP settings
    document.getElementById("smtpHost").value = settingsData.smtpHost || "";
    document.getElementById("smtpPort").value = settingsData.smtpPort || 587;
    document.getElementById("smtpUser").value = settingsData.smtpUser || "";
    document.getElementById("smtpPass").value = settingsData.smtpPass || "";
    document.getElementById("smtpSecure").checked = settingsData.smtpSecure || false;
    document.getElementById("smtpFrom").value = settingsData.smtpFrom || "";
    document.getElementById("adminEmail").value = settingsData.adminEmail || "";
    
    // Populate Email Integration Method settings
    document.getElementById("emailProvider").value = settingsData.emailProvider || "msgraph";
    const msGraphTenantIdEl = document.getElementById("msGraphTenantId");
    if (msGraphTenantIdEl) msGraphTenantIdEl.value = settingsData.msGraphTenantId || "";
    const msGraphClientIdEl = document.getElementById("msGraphClientId");
    if (msGraphClientIdEl) msGraphClientIdEl.value = settingsData.msGraphClientId || "";
    const msGraphClientSecretEl = document.getElementById("msGraphClientSecret");
    if (msGraphClientSecretEl) msGraphClientSecretEl.value = settingsData.msGraphClientSecret || "";
    const msGraphSenderEmailEl = document.getElementById("msGraphSenderEmail");
    if (msGraphSenderEmailEl) msGraphSenderEmailEl.value = settingsData.msGraphSenderEmail || "";
    toggleEmailProviderFields();
    
    // Populate Customizer settings
    document.getElementById("botName").value = settingsData.botName || "AH Bot";
    document.getElementById("primaryColor").value = settingsData.primaryColor || "#2563eb";
    document.getElementById("primaryColorHex").value = settingsData.primaryColor || "#2563eb";
    document.getElementById("backgroundColor").value = settingsData.backgroundColor || "#ffffff";
    document.getElementById("backgroundColorHex").value = settingsData.backgroundColor || "#ffffff";
    document.getElementById("welcomeMessage").value = settingsData.welcomeMessage || "";
    document.getElementById("bookingSlots").value = settingsData.bookingSlots || "";
    document.getElementById("bookingTimezone").value = settingsData.bookingTimezone || "Asia/Kolkata";
    
    // Populate Payments Settings
    document.getElementById("paymentEnabled").checked = settingsData.paymentEnabled || false;
    document.getElementById("paymentGateway").value = settingsData.paymentGateway || "mock";
    document.getElementById("paymentAmount").value = settingsData.paymentAmount !== undefined ? settingsData.paymentAmount : 15.00;
    document.getElementById("paymentCurrency").value = settingsData.paymentCurrency || "USD";
    document.getElementById("paymentInstructions").value = settingsData.paymentInstructions || "";
    document.getElementById("razorpayKeyId").value = settingsData.razorpayKeyId || "";
    document.getElementById("razorpayKeySecret").value = settingsData.razorpayKeySecret || "";
    togglePaymentGatewayFields();

    // Populate Knowledge System Prompt
    document.getElementById("systemPrompt").value = settingsData.systemPrompt || "";
    
    // Auto-populate the AI Brain Trainer interface if auto-trained prompt is present
    populateTrainerUIFromSettings();
    
    updateDashboardSummaryCard();
  } catch (error) {
    console.error("Load Settings Error:", error);
  }
}

// -------------------------------------------------------------
// RENDER KPI STATS & TABLES
// -------------------------------------------------------------
function renderDashboardStats() {
  // Bookings count
  document.getElementById("stat-bookings").innerText = statsData.bookingsCount !== undefined ? statsData.bookingsCount : bookingsData.length;
  
  // Total conversations counter
  document.getElementById("stat-conversations").innerText = statsData.totalConversations !== undefined ? statsData.totalConversations : 0;

  // Conversations trend
  const trendEl = document.getElementById("stat-conversations-trend");
  if (trendEl) {
    const trendClass = statsData.trendClass || 'neutral';
    const trendIcon = statsData.trendIcon || 'minus';
    const trendText = statsData.trendText || '0% this week';
    
    trendEl.className = `kpi-trend ${trendClass}`;
    trendEl.innerHTML = `<i data-lucide="${trendIcon}"></i> ${trendText}`;
  }

  // Groq AI Latency
  const latencyEl = document.getElementById("stat-latency");
  const latencyDescEl = document.getElementById("stat-latency-desc");
  if (latencyEl) {
    const avgLat = statsData.averageLatency || 0;
    if (avgLat > 0) {
      latencyEl.innerText = `${avgLat}ms`;
    } else {
      latencyEl.innerText = `< 95ms`;
    }
  }
  if (latencyDescEl) {
    const lastLat = statsData.lastLatency || 0;
    if (lastLat > 0) {
      latencyDescEl.innerText = `Last call: ${lastLat}ms`;
    } else {
      latencyDescEl.innerText = `Sub-second streaming`;
    }
  }
  
  // Mailer dispatcher status
  const statMailer = document.getElementById("stat-mailer");
  const statMailerDesc = document.getElementById("stat-mailer-desc");
  const mailerIconWrapper = document.getElementById("mailer-icon-wrapper");
  
  if (statMailer && statsData.mailerStatus) {
    statMailer.innerText = statsData.mailerStatus;
    statMailerDesc.innerText = statsData.mailerDesc || "Pending SMTP setup";
    mailerIconWrapper.className = `kpi-icon-wrapper ${statsData.mailerClass || 'yellow'}`;
  } else {
    // Fallback if statsData not loaded
    const host = settingsData.smtpHost;
    const user = settingsData.smtpUser;
    if (host && user) {
      statMailer.innerText = "Active";
      statMailerDesc.innerText = "SMTP mailer connected";
      mailerIconWrapper.className = "kpi-icon-wrapper green";
    } else {
      statMailer.innerText = "Inactive";
      statMailerDesc.innerText = "Pending SMTP setup";
      mailerIconWrapper.className = "kpi-icon-wrapper yellow";
    }
  }

  // Re-run lucide to render any newly injected icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderRecentTable() {
  const tbody = document.querySelector("#recent-bookings-table tbody");
  tbody.innerHTML = "";
  
  const recent = bookingsData.slice(0, 4);
  
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="table-empty">No appointments scheduled yet.</td></tr>`;
    return;
  }
  
  recent.forEach(b => {
    const bookingDate = new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeFormatted = formatTime12(b.time);
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${b.name}</strong></td>
      <td>${bookingDate} at ${timeFormatted}</td>
      <td><span class="purpose-tag">${b.purpose}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAllBookingsTable(filteredData = null) {
  const tbody = document.getElementById("bookings-tbody");
  tbody.innerHTML = "";
  
  const data = filteredData || bookingsData;
  
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No appointments found matching search criteria.</td></tr>`;
    return;
  }
  
  data.forEach(b => {
    const fullDate = new Date(b.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const timeFormatted = formatTime12(b.time);
    const emailStatus = b.emailSent 
      ? `<span class="status-badge sent"><i data-lucide="check" style="width:12px;height:12px;"></i> Email Sent</span>` 
      : `<span class="status-badge failed"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> Failed / Skipped</span>`;

    const paymentBadge = b.paymentStatus === 'Paid'
      ? `<span class="status-badge sent" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="credit-card" style="width:12px;height:12px;"></i> Paid (${b.paymentAmountPaid})</span>`
      : (b.paymentStatus === 'Pending' 
         ? `<span class="status-badge failed" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="clock" style="width:12px;height:12px;"></i> Unpaid</span>`
         : `<span class="status-badge" style="background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); margin-top: 4px; display: inline-flex; align-items: center; gap: 4px;"><i data-lucide="minus" style="width:12px;height:12px;"></i> Free/No Fee</span>`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="client-info">
          <h5>${b.name}</h5>
          <p>${b.email} ${b.phone ? `• ${b.phone}` : ''}</p>
        </div>
      </td>
      <td>
        <strong>${fullDate}</strong><br>
        <span style="font-size:12px; color:var(--text-muted);">${timeFormatted}</span>
        ${b.clientTimezone && b.clientFormattedTime ? `<br><span style="font-size:11px; color:var(--accent-purple); font-weight:500;">Client: ${b.clientFormattedTime} (${b.clientTimezone.split('/').pop().replace('_', ' ')})</span>` : ''}
      </td>
      <td>
        <span class="purpose-tag">${b.purpose}</span>
      </td>
      <td>
        <div class="client-notes" style="max-width: 220px; font-size: 13px; color: var(--text-muted); white-space: normal; word-break: break-word;">
          ${b.info ? b.info : '<span style="opacity: 0.3;">—</span>'}
        </div>
      </td>
      <td>
        ${emailStatus}
        <div style="margin-top: 6px;">${paymentBadge}</div>
        ${b.paymentTransactionId ? `<span style="font-size:10px; color:var(--text-muted); display:block; margin-top:4px; font-family:monospace;">TxID: ${b.paymentTransactionId}</span>` : ''}
      </td>
      <td>
        <button class="delete-btn" title="Cancel Appointment Slot" onclick="deleteBooking('${b.id}')">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

function filterBookings() {
  const query = document.getElementById("bookings-search").value.toLowerCase();
  
  if (!query) {
    renderAllBookingsTable();
    return;
  }
  
  const filtered = bookingsData.filter(b => {
    return (
      b.name.toLowerCase().includes(query) ||
      b.email.toLowerCase().includes(query) ||
      b.purpose.toLowerCase().includes(query) ||
      b.date.includes(query) ||
      (b.paymentTransactionId && b.paymentTransactionId.toLowerCase().includes(query))
    );
  });
  
  renderAllBookingsTable(filtered);
}

// -------------------------------------------------------------
// SAVE CONFIGURATION SETTINGS
// -------------------------------------------------------------
async function saveSettings(e) {
  e.preventDefault();
  
  const statusMsg = document.getElementById("settings-status-msg");
  statusMsg.className = "footer-msg";
  statusMsg.innerText = "Saving settings...";

  const payload = {
    emailProvider: document.getElementById("emailProvider").value,
    msGraphTenantId: document.getElementById("msGraphTenantId")?.value?.trim() || "",
    msGraphClientId: document.getElementById("msGraphClientId")?.value?.trim() || "",
    msGraphClientSecret: document.getElementById("msGraphClientSecret")?.value || "",
    msGraphSenderEmail: document.getElementById("msGraphSenderEmail")?.value?.trim() || "",
    smtpHost: document.getElementById("smtpHost").value.trim(),
    smtpPort: document.getElementById("smtpPort").value,
    smtpUser: document.getElementById("smtpUser").value.trim(),
    smtpPass: document.getElementById("smtpPass").value,
    smtpSecure: document.getElementById("smtpSecure").checked,
    smtpFrom: document.getElementById("smtpFrom").value.trim(),
    adminEmail: document.getElementById("adminEmail").value.trim(),
    botName: document.getElementById("botName").value.trim(),
    primaryColor: document.getElementById("primaryColor").value,
    backgroundColor: document.getElementById("backgroundColor").value,
    welcomeMessage: document.getElementById("welcomeMessage").value.trim(),
    bookingSlots: document.getElementById("bookingSlots").value.trim(),
    bookingTimezone: document.getElementById("bookingTimezone").value,
    paymentEnabled: document.getElementById("paymentEnabled").checked,
    paymentGateway: document.getElementById("paymentGateway").value,
    paymentAmount: parseFloat(document.getElementById("paymentAmount").value) || 0,
    paymentCurrency: document.getElementById("paymentCurrency").value,
    paymentInstructions: document.getElementById("paymentInstructions").value.trim(),
    razorpayKeyId: document.getElementById("razorpayKeyId").value.trim(),
    razorpayKeySecret: document.getElementById("razorpayKeySecret").value,
    systemPrompt: document.getElementById("systemPrompt").value
  };

  const activePlan = localStorage.getItem('ah_chatbot_plan') || 'free';
  if (activePlan === 'free') {
    if (payload.smtpHost && payload.smtpHost.trim() !== "" && payload.smtpHost !== 'smtp.ethereal.email') {
      alert("Custom SMTP settings are only available on Pro or Advanced plans. Upgrade to Pro/Advanced or use Microsoft Graph.");
      statusMsg.className = "footer-msg error";
      statusMsg.innerText = "✗ Custom SMTP settings restricted on Free Trial.";
      return;
    }
  }

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to save settings");

    statusMsg.className = "footer-msg success";
    statusMsg.innerText = "✓ Configurations successfully saved!";
    
    // Refresh settings data locally
    loadSettings();

    // Force reload Sandbox Preview Iframe dynamically to show the updated settings immediately
    const iframe = document.getElementById("sandbox-iframe");
    if (iframe) {
      const botId = localStorage.getItem('ah_chatbot_bot_id') || 'bot-default';
      iframe.src = `/widget/widget.html?botId=${botId}&v=${Date.now()}`;
    }
    
    // Hide notification after 4 seconds
    setTimeout(() => {
      statusMsg.innerText = "";
    }, 4000);

  } catch (error) {
    statusMsg.className = "footer-msg error";
    statusMsg.innerText = `✗ Error saving settings: ${error.message}`;
  }
}

// -------------------------------------------------------------
// SMTP TESTING
// -------------------------------------------------------------
async function testSMTPConnection() {
  const testEmail = document.getElementById("test-email-address").value.trim();
  const alertBox = document.getElementById("test-result-msg");

  if (!testEmail) {
    alertBox.className = "test-result-alert error";
    alertBox.innerText = "Please input a recipient test email address first.";
    alertBox.classList.remove("hidden");
    return;
  }

  const provider = document.getElementById("emailProvider").value;
  alertBox.className = "test-result-alert loading";
  if (provider === "msgraph") {
    alertBox.innerText = "Connecting to Microsoft Graph API and sending test email...";
  } else {
    alertBox.innerText = "Connecting to SMTP server and sending test email...";
  }
  alertBox.classList.remove("hidden");

  // Construct current settings page fields for test payload
  const currentSettings = {
    emailProvider: provider,
    msGraphTenantId: document.getElementById("msGraphTenantId")?.value?.trim() || "",
    msGraphClientId: document.getElementById("msGraphClientId")?.value?.trim() || "",
    msGraphClientSecret: document.getElementById("msGraphClientSecret")?.value || "",
    msGraphSenderEmail: document.getElementById("msGraphSenderEmail")?.value?.trim() || "",
    smtpHost: document.getElementById("smtpHost").value.trim(),
    smtpPort: document.getElementById("smtpPort").value,
    smtpUser: document.getElementById("smtpUser").value.trim(),
    smtpPass: document.getElementById("smtpPass").value,
    smtpSecure: document.getElementById("smtpSecure").checked,
    smtpFrom: document.getElementById("smtpFrom").value.trim()
  };

  try {
    const res = await fetch("/api/bookings/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testEmail, settings: currentSettings })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "SMTP test failed.");

    alertBox.className = "test-result-alert success";
    alertBox.innerText = `✓ Success! Test email sent successfully to ${testEmail}. Check your inbox.`;

  } catch (error) {
    alertBox.className = "test-result-alert error";
    alertBox.innerText = `✗ Connection failed: ${error.message}`;
  }
}

async function generateTestSMTPAccount() {
  const btn = document.getElementById("btn-generate-test-smtp");
  const originalHtml = btn.innerHTML;
  const alertBox = document.getElementById("test-result-msg");

  btn.disabled = true;
  btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Creating Sandbox Mailer...</span>`;
  lucide.createIcons();

  alertBox.className = "test-result-alert loading";
  alertBox.innerText = "Provisioning a secure, isolated sandbox SMTP mailbox...";
  alertBox.classList.remove("hidden");

  try {
    const res = await fetch("/api/settings/generate-test-smtp", {
      method: "POST"
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Dynamic provision failed.");

    alertBox.className = "test-result-alert success";
    alertBox.innerHTML = `✓ <strong>Sandbox Mailbox Active!</strong><br>
    Your test server is now configured with host: <em>${result.settings.smtpHost}</em>.<br>
    All customer lead notifications will be delivered here instantly. You can review delivered emails inside the <a href="${result.previewUrl}" target="_blank" style="text-decoration:underline;color:white;font-weight:600;">Ethereal Inbox</a>.`;

    // Reload settings in the UI
    loadSettings();

  } catch (error) {
    alertBox.className = "test-result-alert error";
    alertBox.innerText = `✗ Sandbox creation failed: ${error.message}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// -------------------------------------------------------------
// CANCEL APPOINTMENTS
// -------------------------------------------------------------
async function deleteBooking(id) {
  if (!confirm("Are you sure you want to cancel this appointment slot? This cannot be undone.")) return;

  try {
    const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Could not cancel this booking.");
    
    // Refresh table list
    loadBookings();
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// -------------------------------------------------------------
// HELPER UTILITIES
// -------------------------------------------------------------
function togglePassVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(`eye-${inputId}`);
  if (input.type === "password") {
    input.type = "text";
    icon.setAttribute("data-lucide", "eye-off");
  } else {
    input.type = "password";
    icon.setAttribute("data-lucide", "eye");
  }
  lucide.createIcons();
}

function updateDashboardSummaryCard() {
  document.getElementById("summary-model").innerText = settingsData.tataModel || "meta/Llama-3.3-70B-Instruct";
  document.getElementById("summary-agent-name").innerText = settingsData.botName || "AI Assistant";
  document.getElementById("summary-color-hex").innerText = settingsData.primaryColor || "#2563EB";
  document.getElementById("summary-color-dot").style.backgroundColor = settingsData.primaryColor || "#2563EB";
  document.getElementById("summary-notify-email").innerText = settingsData.adminEmail || "admin@domain.com";
}

function formatTime12(time24) {
  if (!time24) return "";
  const [hours, minutes] = time24.split(":");
  const ampm = parseInt(hours) >= 12 ? "PM" : "AM";
  const displayHours = parseInt(hours) % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

function copyEmbedCode() {
  const code = document.getElementById("embed-code-block").innerText;
  navigator.clipboard.writeText(code).then(() => {
    const textSpan = document.getElementById("copy-text");
    const icon = document.getElementById("copy-icon");
    textSpan.innerText = "Copied!";
    icon.setAttribute("data-lucide", "check");
    lucide.createIcons();
    
    setTimeout(() => {
      textSpan.innerText = "Copy Script";
      icon.setAttribute("data-lucide", "copy");
      lucide.createIcons();
    }, 2000);
  }).catch(err => {
    console.error("Copy failed", err);
  });
}

function copyReactCode() {
  const code = document.getElementById("react-code-block").innerText;
  navigator.clipboard.writeText(code).then(() => {
    const textSpan = document.getElementById("copy-react-text");
    const icon = document.getElementById("copy-react-icon");
    textSpan.innerText = "Copied Component!";
    icon.setAttribute("data-lucide", "check");
    lucide.createIcons();
    
    setTimeout(() => {
      textSpan.innerText = "Copy Component";
      icon.setAttribute("data-lucide", "copy");
      lucide.createIcons();
    }, 2000);
  }).catch(err => {
    console.error("Copy failed", err);
  });
}

function copyUniversalCode(btn) {
  const codeContainer = btn.previousElementSibling;
  if (!codeContainer) return;
  const code = codeContainer.innerText;
  navigator.clipboard.writeText(code).then(() => {
    const textSpan = btn.querySelector("span");
    const icon = btn.querySelector("i");
    textSpan.innerText = "Copied!";
    icon.setAttribute("data-lucide", "check");
    lucide.createIcons();
    
    setTimeout(() => {
      textSpan.innerText = "Copy";
      icon.setAttribute("data-lucide", "copy");
      lucide.createIcons();
    }, 2000);
  }).catch(err => {
    console.error("Copy failed", err);
  });
}

// -------------------------------------------------------------
// DYNAMIC WEB CRAWLER & AI BRAIN TRAINER HANDLERS
// -------------------------------------------------------------
function addConsoleLog(text, type = 'info') {
  const container = document.getElementById("console-logs-container");
  if (!container) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const logItem = document.createElement("div");
  logItem.className = `log-item ${type}`;
  logItem.innerHTML = `
    <span class="log-time">[${timeStr}]</span>
    <span class="log-text">${text}</span>
  `;
  container.appendChild(logItem);
  container.scrollTop = container.scrollHeight;
}

async function startWebsiteTraining() {
  const activePlan = localStorage.getItem('ah_chatbot_plan') || 'free';
  if (activePlan !== 'advanced') {
    alert("The AI Website Crawler / Brain Trainer is only available on the Advanced Plan. Please upgrade your subscription to train your assistant on custom web assets.");
    return;
  }

  const urlInput = document.getElementById("crawl-url");
  const btn = document.getElementById("btn-start-crawl");
  const consolePanel = document.getElementById("crawl-console-panel");
  const consoleLogs = document.getElementById("console-logs-container");
  const statusBadge = document.getElementById("console-status");
  const standbyPanel = document.getElementById("crawl-standby-panel");
  const resultsPanel = document.getElementById("crawl-results-panel");

  const url = urlInput.value.trim();

  if (!url) {
    alert("Please input a target website URL first.");
    return;
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("Invalid website URL schema. URL must start with 'http://' or 'https://'.");
    return;
  }

  // 1. Reset UI Panels
  resultsPanel.classList.add("hidden");
  standbyPanel.classList.remove("hidden");
  consolePanel.classList.remove("hidden");
  document.getElementById("crawl-identity-panel").classList.add("hidden");
  consoleLogs.innerHTML = "";
  
  // Reset the approve/deploy button state
  const deployBtn = document.querySelector("#trainer-save-form button[type='submit']");
  if (deployBtn) {
    deployBtn.innerHTML = `<i data-lucide="check-circle-2"></i> <span>Approve & Deploy to Chat Widget</span>`;
    deployBtn.style.background = "";
    deployBtn.style.border = "";
  }
  
  statusBadge.className = "console-badge";
  statusBadge.innerText = "Crawling...";
  
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Analyzing & Training...</span>`;
  lucide.createIcons();

  addConsoleLog(`🔍 Initializing AI crawler for target site: ${url}`, 'info');
  addConsoleLog(`📡 Fetching domain blueprints & DNS structures...`, 'info');

  // Set up visual, timed console messages to simulate scraping progress steps while request executes
  let logStep = 0;
  const interval = setInterval(() => {
    logStep++;
    if (logStep === 1) {
      addConsoleLog(`🌐 Connection established. Analyzing domain host maps...`, 'success');
    } else if (logStep === 2) {
      addConsoleLog(`🔗 Scanning structural nodes for internal page linkages...`, 'info');
    } else if (logStep === 3) {
      addConsoleLog(`📄 Crawling root page '/' and building link queue...`, 'info');
    } else if (logStep === 4) {
      addConsoleLog(`📄 Crawling internal subpage '/about' or secondary services...`, 'info');
    } else if (logStep === 5) {
      addConsoleLog(`🧹 Stripping markup noise, styles, scripts, layouts, and menus...`, 'warning');
    } else if (logStep === 6) {
      addConsoleLog(`🧬 Compiling aggregate text corpus for AI synthesis...`, 'info');
    } else if (logStep >= 7) {
      addConsoleLog(`🧠 Synthesizing specialized agent guidelines & prompt templates...`, 'info');
      clearInterval(interval);
    }
  }, 2200);

  try {
    const res = await fetch("/api/scraper/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });

    const result = await res.json();
    clearInterval(interval); // Stop the simulation loop immediately

    if (!res.ok) {
      throw new Error(result.error || "Connection timed out during analysis.");
    }

    // Success logs
    addConsoleLog(`✔ Dynamic scraping & page extraction successful!`, 'success');
    addConsoleLog(`✔ Scraped ${result.stats.pagesCrawled.length} pages. Total text size: ${result.stats.totalWords} words.`, 'success');
    addConsoleLog(`✔ Custom LLM prompt successfully synthesized by Groq!`, 'success');
    addConsoleLog(`✔ Successfully saved and deployed new chatbot configurations automatically!`, 'success');
    
    statusBadge.className = "console-badge success";
    statusBadge.innerText = "COMPLETE";

    // Populate trainer results
    document.getElementById("res-pages-count").innerText = result.stats.pagesCrawled.length;
    document.getElementById("res-words-count").innerText = result.stats.totalWords;

    document.getElementById("trainer-botName").value = result.botName || "Custom Bot";
    document.getElementById("trainer-welcomeMessage").value = result.welcomeMessage || "";
    document.getElementById("trainer-color").value = result.primaryColor || "#0d9488";
    document.getElementById("trainer-colorHex").value = result.primaryColor || "#0d9488";
    document.getElementById("trainer-systemPrompt").value = result.systemPrompt || "";

    // Populate Extracted Corporate Details Card
    const info = result.extractedInfo || {};
    document.getElementById("scraped-location").innerText = info.location || "Not specified";
    document.getElementById("scraped-email").innerText = info.email || "Not specified";
    document.getElementById("scraped-phone").innerText = info.phone || "Not specified";
    
    // Setup Google Maps hyperlink redirect button
    const mapBtn = document.getElementById("scraped-mapLink");
    const mapWrapper = document.getElementById("scraped-mapLink-wrapper");
    if (info.mapLink && info.mapLink !== "Not specified" && info.mapLink.startsWith("http")) {
      mapBtn.href = info.mapLink;
      mapWrapper.style.display = "block";
    } else {
      mapWrapper.style.display = "none";
    }
    
    // Generate primary services tag pills
    const servicesGrid = document.getElementById("scraped-services-container");
    servicesGrid.innerHTML = "";
    if (info.services && Array.isArray(info.services) && info.services.length > 0) {
      info.services.forEach(serv => {
        const badge = document.createElement("span");
        badge.className = "purpose-tag";
        badge.style.margin = "0";
        badge.innerText = serv;
        servicesGrid.appendChild(badge);
      });
    } else {
      servicesGrid.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">No core services parsed.</span>`;
    }
    
    // Refresh configurations in admin settings panel locally
    loadSettings();

    // Toggle standby to results panel and show details card
    standbyPanel.classList.add("hidden");
    resultsPanel.classList.remove("hidden");
    document.getElementById("crawl-identity-panel").classList.remove("hidden");

    // Change deploy button to show it is auto-saved
    const deployBtn = document.querySelector("#trainer-save-form button[type='submit']");
    if (deployBtn) {
      deployBtn.innerHTML = `<i data-lucide="check-circle"></i> <span>Auto-Saved & Deployed!</span>`;
      deployBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
      deployBtn.style.border = "none";
    }

    lucide.createIcons();

  } catch (error) {
    clearInterval(interval);
    addConsoleLog(`❌ Scraper system encountered an error: ${error.message}`, 'error');
    addConsoleLog(`💡 Troubleshooting tip: Verify your AI Cloud API key is set in 'Chatbot Settings' and the URL is public.`, 'info');
    
    statusBadge.className = "console-badge failed";
    statusBadge.innerText = "FAILED";
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

async function deployTrainerConfig(e) {
  e.preventDefault();
  
  const botName = document.getElementById("trainer-botName").value.trim();
  const primaryColor = document.getElementById("trainer-color").value;
  const welcomeMessage = document.getElementById("trainer-welcomeMessage").value.trim();
  const systemPrompt = document.getElementById("trainer-systemPrompt").value;

  const btn = document.querySelector("#trainer-save-form button[type='submit']");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Deploying configuration...</span>`;
  lucide.createIcons();

  const payload = {
    botName,
    primaryColor,
    welcomeMessage,
    systemPrompt
  };

  try {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to deploy brain parameters");

    alert(`🎉 Successfully deployed! The chatbot widget has been customized for your website. Let's head over to the Sandbox to test it!`);
    
    // Refresh admin settings locally
    loadSettings();

    // Switch tab directly to embed sandbox tester
    switchTab('embed');

  } catch (err) {
    alert(`Error deploying settings: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

// Sync hex text fields with dynamic theme color pickers and handle auto-training on paste
document.addEventListener("DOMContentLoaded", () => {
  const trainerColor = document.getElementById("trainer-color");
  const trainerColorHex = document.getElementById("trainer-colorHex");
  if (trainerColor && trainerColorHex) {
    trainerColor.addEventListener("input", (e) => {
      trainerColorHex.value = e.target.value.toUpperCase();
    });
  }

  // Bidirectionally sync settings panel color picker and text inputs
  const primaryColor = document.getElementById("primaryColor");
  const primaryColorHex = document.getElementById("primaryColorHex");
  if (primaryColor && primaryColorHex) {
    primaryColor.addEventListener("input", (e) => {
      primaryColorHex.value = e.target.value.toUpperCase();
    });
    primaryColorHex.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
        primaryColor.value = val;
      }
    });
  }

  const backgroundColor = document.getElementById("backgroundColor");
  const backgroundColorHex = document.getElementById("backgroundColorHex");
  if (backgroundColor && backgroundColorHex) {
    backgroundColor.addEventListener("input", (e) => {
      backgroundColorHex.value = e.target.value.toUpperCase();
    });
    backgroundColorHex.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
        backgroundColor.value = val;
      }
    });
  }

  // Auto-run trainer on pasting URL
  const urlInput = document.getElementById("crawl-url");
  if (urlInput) {
    urlInput.addEventListener("paste", (e) => {
      // Use setTimeout to wait for the browser paste operation to complete and update the input value
      setTimeout(() => {
        const url = urlInput.value.trim();
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          addConsoleLog(`📋 Pasted URL detected: "${url}". Auto-launching crawler & trainer...`, 'info');
          startWebsiteTraining();
        }
      }, 50);
    });
  }
});

function toggleSynthesisFields() {
  // Obsolete helper for Groq/OpenRouter synthesis toggle
}

function toggleEmailProviderFields() {
  const provider = document.getElementById("emailProvider").value;
  const smtpCard = document.getElementById("smtp-settings-card");
  const msGraphCard = document.getElementById("msgraph-settings-card");
  const testerLabel = document.getElementById("tester-label");
  const btnText = document.getElementById("btn-test-email-text");

  if (!smtpCard || !msGraphCard) return;

  if (provider === "msgraph") {
    smtpCard.classList.add("hidden");
    msGraphCard.classList.remove("hidden");
    if (testerLabel) testerLabel.innerText = "Microsoft Graph Connection Tester";
    if (btnText) btnText.innerText = "Send Graph Test Email";
  } else {
    smtpCard.classList.remove("hidden");
    msGraphCard.classList.add("hidden");
    if (testerLabel) testerLabel.innerText = "SMTP Connection Tester";
    if (btnText) btnText.innerText = "Send Test Email";
  }
}

function togglePaymentGatewayFields() {
  const gateway = document.getElementById("paymentGateway").value;
  const mockWrapper = document.getElementById("mock-instructions-wrapper");
  const razorpayCard = document.getElementById("razorpay-credentials-container");

  if (!mockWrapper || !razorpayCard) return;

  if (gateway === "razorpay") {
    mockWrapper.classList.add("hidden");
    razorpayCard.classList.remove("hidden");
  } else {
    mockWrapper.classList.remove("hidden");
    razorpayCard.classList.add("hidden");
  }
}

async function activateAdvancedTrial() {
  if (!confirm("Are you sure you want to activate your 2-Month Advanced Plan Trial?")) {
    return;
  }
  
  try {
    const res = await fetch("/api/auth/activate-trial", {
      method: "POST"
    });
    
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Failed to activate trial");
    
    alert("🎉 " + result.message);
    // Refresh settings and onboarding status
    await checkOnboarding();
    if (typeof loadSettings === 'function') {
      loadSettings();
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
}

async function checkOnboarding() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) throw new Error("Authentication failed");
    const data = await res.json();
    if (data && data.paymentStatus === 'unpaid') {
      window.location.href = '/admin/subscription.html';
    } else if (data && data.onboarded === false) {
      window.location.href = '/admin/onboarding.html';
    } else {
      // Save user plan locally
      localStorage.setItem('ah_chatbot_plan', data.plan || 'free');

      // Update plan badge in sidebar
      const planBadge = document.getElementById("plan-badge");
      if (planBadge) {
        const plan = data.plan || 'free';
        planBadge.innerText = plan.toUpperCase();
        if (plan === 'free') {
          planBadge.style.background = 'rgba(148, 163, 184, 0.15)';
          planBadge.style.borderColor = 'rgba(148, 163, 184, 0.3)';
          planBadge.style.color = '#94a3b8';
        } else if (plan === 'pro') {
          planBadge.style.background = 'rgba(245, 158, 11, 0.15)';
          planBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
          planBadge.style.color = '#f59e0b';
        } else if (plan === 'advanced') {
          planBadge.style.background = 'rgba(168, 85, 247, 0.15)';
          planBadge.style.borderColor = 'rgba(168, 85, 247, 0.3)';
          planBadge.style.color = '#c084fc';
        }
      }

      // Handle Plan Warning Banner visibility and text
      const warningBanner = document.getElementById("plan-warning-banner");
      const warningText = document.getElementById("plan-warning-text");
      if (warningBanner && warningText) {
        const plan = data.plan || 'free';
        if (plan === 'free') {
          warningBanner.style.display = 'flex';
          warningBanner.style.background = 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)';
          warningBanner.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.2)';
          warningText.innerHTML = `You are on the Free Trial Plan. Crawling and custom SMTP are locked. <button onclick="switchTab('billing')" style="margin-left: 12px; background: #fff; color: #d97706; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Upgrade Now</button> <button onclick="activateAdvancedTrial()" style="margin-left: 8px; background: rgba(255,255,255,0.15); color: #fff; border: 1px solid rgba(255,255,255,0.25); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s;">Activate Advanced Trial</button>`;
        } else if (plan === 'pro') {
          warningBanner.style.display = 'flex';
          warningBanner.style.background = 'linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)';
          warningBanner.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.2)';
          warningText.innerHTML = `You are on the Pro Plan. Web crawler is locked. <button onclick="switchTab('billing')" style="margin-left: 12px; background: #fff; color: #4f46e5; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Upgrade to Advanced</button>`;
        } else if (plan === 'advanced' && data.paymentStatus === 'trial') {
          warningBanner.style.display = 'flex';
          warningBanner.style.background = 'linear-gradient(90deg, #8b5cf6 0%, #6d28d9 100%)';
          warningBanner.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.2)';
          
          let remainingDaysText = "";
          if (data.trialEndDate) {
            const exp = new Date(data.trialEndDate);
            const diff = exp - new Date();
            const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            remainingDaysText = ` (${days} day${days === 1 ? '' : 's'} remaining)`;
          }
          
          warningText.innerHTML = `You are on the Advanced Trial Plan${remainingDaysText}. Enjoy full crawling and integrations! <button onclick="switchTab('billing')" style="margin-left: 12px; background: #fff; color: #6d28d9; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 700; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Subscribe Premium</button>`;
        } else {
          warningBanner.style.display = 'none';
        }
      }

      // Update settings tab billing status card fields
      const planNameEl = document.getElementById("billing-plan-name");
      const planBadgeEl = document.getElementById("billing-plan-badge");
      const planExpiryEl = document.getElementById("billing-plan-expiry");
      const planDescEl = document.getElementById("billing-plan-desc");
      const activateBtnSettings = document.getElementById("btn-activate-trial-settings");

      if (planNameEl) {
        const plan = data.plan || 'free';
        planNameEl.innerHTML = plan.charAt(0).toUpperCase() + plan.slice(1);
        if (plan === 'free') {
          planNameEl.innerHTML += ` <span id="billing-plan-badge" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: rgba(148, 163, 184, 0.15); border: 1px solid rgba(148, 163, 184, 0.3); color: #94a3b8; text-transform: uppercase;">Standard</span>`;
          if (planExpiryEl) planExpiryEl.innerText = "Never";
          if (planDescEl) planDescEl.innerText = "You are on the Free Plan. Website crawling, custom SMTP/Microsoft Graph integration, and advanced styling are locked. Activate your 2-month Advanced Plan Trial to unlock all features!";
          if (activateBtnSettings) {
            activateBtnSettings.style.display = 'flex';
            activateBtnSettings.querySelector("span").innerText = "Activate 2-Month Advanced Trial";
          }
        } else if (data.paymentStatus === 'trial') {
          planNameEl.innerHTML += ` <span id="billing-plan-badge" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); color: #c084fc; text-transform: uppercase;">Trial</span>`;
          if (planDescEl) planDescEl.innerText = "Your 2-Month Advanced Trial Plan provides full access to high-fidelity crawling, custom SMTP, Microsoft Graph API integration, and booking systems.";
          if (activateBtnSettings) {
            activateBtnSettings.style.display = 'none';
          }
          
          if (planExpiryEl && data.trialEndDate) {
            const exp = new Date(data.trialEndDate);
            const diff = exp - new Date();
            const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            planExpiryEl.innerText = `${days} Day${days === 1 ? '' : 's'}`;
          } else if (planExpiryEl) {
            planExpiryEl.innerText = "N/A";
          }
        } else {
          planNameEl.innerHTML += ` <span id="billing-plan-badge" style="font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; text-transform: uppercase;">Premium</span>`;
          if (planExpiryEl) planExpiryEl.innerText = "Active";
          if (planDescEl) planDescEl.innerText = `You are on the premium ${plan.toUpperCase()} plan. All configurations and enterprise integrations are unlocked.`;
          if (activateBtnSettings) activateBtnSettings.style.display = 'none';
        }
      }

      // Dynamic profile greeting if element exists
      const greetings = document.querySelectorAll(".profile-greeting-name");
      greetings.forEach(el => {
        el.innerText = data.fullName || data.username || "Admin";
      });

      // Dynamic sidebar organization name
      const sidebarOrg = document.getElementById("sidebar-org-name");
      if (sidebarOrg && data.organizationName) {
        sidebarOrg.innerText = data.organizationName;
      }

      // Dynamic browser tab title
      if (data.organizationName) {
        document.title = `${data.organizationName} - Admin Control Center`;
      }

      // Dynamically populate and lock the scraper URL input field
      const crawlUrlInput = document.getElementById("crawl-url");
      if (crawlUrlInput) {
        crawlUrlInput.value = data.websiteUrl || "";
        crawlUrlInput.readOnly = true;
        crawlUrlInput.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
        crawlUrlInput.style.color = "var(--text-muted)";
        crawlUrlInput.style.cursor = "not-allowed";
        crawlUrlInput.title = "Website URL is locked to your registered domain";
        
        populateTrainerUIFromSettings();
      }

      // Update new Billing tab info
      const bBadge = document.getElementById("billing-current-plan-badge");
      const bName = document.getElementById("billing-current-plan-name");
      const bExpiry = document.getElementById("billing-current-plan-expiry");
      const bAmount = document.getElementById("billing-current-plan-amount");
      const bTx = document.getElementById("billing-current-plan-tx");
      const bDesc = document.getElementById("billing-current-plan-desc");

      if (bName) {
        const plan = data.plan || 'free';
        bName.innerText = plan.charAt(0).toUpperCase() + plan.slice(1) + " Plan";
        if (bBadge) {
          bBadge.innerText = plan.toUpperCase();
          if (plan === 'free') {
            bBadge.style.background = 'rgba(148, 163, 184, 0.15)';
            bBadge.style.borderColor = 'rgba(148, 163, 184, 0.3)';
            bBadge.style.color = 'var(--text-muted)';
          } else if (plan === 'pro') {
            bBadge.style.background = 'rgba(245, 158, 11, 0.15)';
            bBadge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            bBadge.style.color = 'var(--primary)';
          } else {
            bBadge.style.background = 'rgba(168, 85, 247, 0.15)';
            bBadge.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            bBadge.style.color = '#c084fc';
          }
        }
        if (bAmount) {
          bAmount.innerText = plan === 'free' ? '$0.00' : (plan === 'pro' ? '$20.00' : '$30.00');
        }
        if (bTx) {
          bTx.innerText = data.transactionId || 'N/A';
        }
        if (bExpiry) {
          if (data.paymentStatus === 'trial' && data.trialEndDate) {
            const exp = new Date(data.trialEndDate);
            const diff = exp - new Date();
            const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            bExpiry.innerText = `${days} Day${days === 1 ? '' : 's'} Left (Trial)`;
          } else {
            bExpiry.innerText = plan === 'free' ? 'Unlimited (Free Forever)' : 'Active (Auto-renews)';
          }
        }
        if (bDesc) {
          if (plan === 'free') {
            bDesc.innerText = "Your Free Trial plan has standard chat conversations and appointment scheduling. Upgrade to Pro or Advanced to unlock full AI brain crawling capabilities and custom SMTP.";
          } else if (plan === 'pro') {
            bDesc.innerText = "Your Pro Plan is active. You have access to custom appointment scheduling, premium customizer options, and lead email notifications.";
          } else if (plan === 'advanced') {
            bDesc.innerText = "Your Advanced Plan is active. You have access to unlimited conversations, web scraping, custom SMTP/Microsoft Graph integration, and real-time reports.";
          }
        }
      }
    }
  } catch (error) {
    console.error("Onboarding check error:", error);
  }
}

function applyColorCombo(primary, bg) {
  const pColor = document.getElementById("primaryColor");
  const pHex = document.getElementById("primaryColorHex");
  if (pColor && pHex) {
    pColor.value = primary;
    pHex.value = primary.toUpperCase();
  }

  const bColor = document.getElementById("backgroundColor");
  const bHex = document.getElementById("backgroundColorHex");
  if (bColor && bHex) {
    bColor.value = bg;
    bHex.value = bg.toUpperCase();
  }
}

// -------------------------------------------------------------
// THEME SWITCHER & EXPORT APPOINTMENTS UTILITIES
// -------------------------------------------------------------
function updateThemeToggleIcon(theme) {
  const icon = document.getElementById("theme-toggle-icon");
  if (!icon) return;
  if (theme === 'light') {
    icon.setAttribute('data-lucide', 'moon');
  } else {
    icon.setAttribute('data-lucide', 'sun');
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function exportBookings(format) {
  if (!bookingsData || bookingsData.length === 0) {
    alert("No bookings available to export.");
    return;
  }
  
  if (format === 'csv') {
    // CSV headers: ID, Name, Email, Phone, Date, Time, Topic, Info, Email Sent Status, Created At
    const headers = ["ID", "Name", "Email", "Phone", "Date", "Time", "Topic", "Info", "Email Sent Status", "Created At"];
    const rows = bookingsData.map(b => [
      b.id,
      b.name,
      b.email,
      b.phone || '',
      b.date,
      b.time,
      b.purpose,
      b.info || '',
      b.emailSent ? "Sent" : "Failed",
      b.createdAt
    ]);
    
    // Escaping commas/quotes for safety
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chatbot_appointments_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else if (format === 'document') {
    // Generate standard Word Document-compatible HTML file
    let docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Scheduled Consultations Log</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #333333; line-height: 1.6; padding: 20px; }
          h2 { color: #2563eb; font-family: 'Segoe UI Semibold', Arial, sans-serif; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; }
          .meta-info { font-size: 12px; color: #666666; margin-bottom: 25px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #2563eb; color: #ffffff; font-weight: bold; text-align: left; padding: 10px; font-size: 13px; border: 1px solid #cbd5e1; }
          td { padding: 10px; font-size: 12px; border: 1px solid #cbd5e1; vertical-align: top; }
          .notes { font-style: italic; color: #555555; }
          .badge { padding: 3px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; }
          .badge-sent { background-color: #d1fae5; color: #065f46; }
          .badge-failed { background-color: #fef3c7; color: #92400e; }
        </style>
      </head>
      <body>
        <h2>Enterprise Chatbot - Scheduled Consultations Log</h2>
        <div class="meta-info">
          <strong>Generated On:</strong> ${new Date().toLocaleString()}<br>
          <strong>Total Leads Captured:</strong> ${bookingsData.length}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Client Name</th>
              <th style="width: 20%;">Contact Info</th>
              <th style="width: 15%;">Date & Time</th>
              <th style="width: 15%;">Topic</th>
              <th style="width: 25%;">Additional Info / Notes</th>
              <th style="width: 10%;">Status</th>
            </tr>
          </thead>
          <tbody>
    `;

    bookingsData.forEach(b => {
      const fullDate = new Date(b.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      docContent += `
        <tr>
          <td><strong>${escapeHtml(b.name)}</strong></td>
          <td>
            ${escapeHtml(b.email)}<br>
            ${b.phone ? escapeHtml(b.phone) : ''}
          </td>
          <td>
            ${fullDate}<br>
            ${escapeHtml(b.time)}
          </td>
          <td>${escapeHtml(b.purpose)}</td>
          <td class="notes">${b.info ? escapeHtml(b.info) : '—'}</td>
          <td>
            <span class="badge ${b.emailSent ? 'badge-sent' : 'badge-failed'}">
              ${b.emailSent ? 'Email Sent' : 'Failed / Skipped'}
            </span>
          </td>
        </tr>
      `;
    });

    docContent += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([docContent], { type: 'application/msword;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chatbot_appointments_${new Date().toISOString().slice(0,10)}.doc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function escapeHtml(unsafe) {
  return String(unsafe).replace(/[&<>"']/g, function (m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

// Global state for conversations
let conversationsData = [];

async function loadConversations() {
  const tbody = document.getElementById("conversations-tbody");
  tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Loading chat sessions...</td></tr>`;

  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) throw new Error("Could not retrieve conversations list.");
    
    conversationsData = await res.json();
    renderConversationsTable(conversationsData);
  } catch (error) {
    console.error("Load Conversations Error:", error);
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty" style="color: var(--accent-red);">Failed to retrieve conversations.</td></tr>`;
  }
}

function renderConversationsTable(data) {
  const tbody = document.getElementById("conversations-tbody");
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No conversations recorded yet.</td></tr>`;
    return;
  }

  data.forEach(conv => {
    const row = document.createElement("tr");
    
    const messagesCount = conv.messagesCount || 0;
    const avgLatency = conv.lastLatency ? `${conv.lastLatency}ms` : 'N/A';
    const firstActive = conv.createdAt ? new Date(conv.createdAt).toLocaleString() : 'N/A';
    const lastActive = conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString() : 'N/A';
    const ip = conv.ipAddress || 'Unknown';
    const location = conv.location || 'Unknown Location';
    
    let leadDetailsHtml = '<span style="color: var(--text-dimmed); font-style: italic; font-size: 11px;">Not captured</span>';
    if (conv.visitorName || conv.visitorEmail || conv.visitorPhone || conv.visitorCompany || conv.visitorNeeds) {
      const parts = [];
      if (conv.visitorName) {
        parts.push(`<div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 4px; font-size: 12px;"><i data-lucide="user" style="width: 12px; height: 12px; color: var(--primary-hover);"></i> ${escapeHtml(conv.visitorName)}</div>`);
      }
      if (conv.visitorEmail) {
        parts.push(`<div style="color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-size: 11px; margin-top: 2px;"><i data-lucide="mail" style="width: 12px; height: 12px; color: var(--accent-orange);"></i> ${escapeHtml(conv.visitorEmail)}</div>`);
      }
      if (conv.visitorPhone) {
        parts.push(`<div style="color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-size: 11px; margin-top: 2px;"><i data-lucide="phone" style="width: 12px; height: 12px; color: var(--accent-green);"></i> ${escapeHtml(conv.visitorPhone)}</div>`);
      }
      if (conv.visitorCompany) {
        parts.push(`<div style="color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-size: 11px; margin-top: 2px;"><i data-lucide="briefcase" style="width: 12px; height: 12px; color: #a855f7;"></i> ${escapeHtml(conv.visitorCompany)}</div>`);
      }
      if (conv.visitorNeeds) {
        parts.push(`<div style="color: var(--text-muted); display: flex; align-items: center; gap: 4px; font-size: 11px; margin-top: 2px;"><i data-lucide="message-square" style="width: 12px; height: 12px; color: #60a5fa;"></i> ${escapeHtml(conv.visitorNeeds)}</div>`);
      }
      leadDetailsHtml = `<div style="display: flex; flex-direction: column; align-items: flex-start;">${parts.join('')}</div>`;
    }
    
    row.innerHTML = `
      <td style="font-family: monospace; font-size: 12px; color: #60a5fa;">${escapeHtml(conv.id)}</td>
      <td style="font-family: monospace; font-size: 13px;">${escapeHtml(ip)}</td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
          <i data-lucide="globe" style="width: 14px; height: 14px; color: var(--primary-hover);"></i>
          ${escapeHtml(location)}
        </span>
      </td>
      <td>${leadDetailsHtml}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${firstActive}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${lastActive}</td>
      <td>
        <span class="purpose-tag" style="background-color: var(--primary-glow); color: #93c5fd;">
          ${messagesCount} messages
        </span>
      </td>
      <td style="font-size: 12px; font-family: monospace;">${avgLatency}</td>
      <td>
        <button class="action-btn outline" onclick="openChatLogModal('${escapeHtml(conv.id)}')" style="display: inline-flex; align-items: center; gap: 4px;">
          <i data-lucide="eye" style="width: 13px; height: 13px;"></i>
          <span>View Log</span>
        </button>
      </td>
    `;
    
    tbody.appendChild(row);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function searchConversations() {
  const query = document.getElementById("conversations-search").value.toLowerCase().trim();
  if (!query) {
    renderConversationsTable(conversationsData);
    return;
  }

  const filtered = conversationsData.filter(conv => {
    const idMatches = (conv.id || '').toLowerCase().includes(query);
    const ipMatches = (conv.ipAddress || '').toLowerCase().includes(query);
    const locMatches = (conv.location || '').toLowerCase().includes(query);
    
    // Search within messages content
    const msgMatches = conv.messages && conv.messages.some(m => (m.content || '').toLowerCase().includes(query));
    
    return idMatches || ipMatches || locMatches || msgMatches;
  });

  renderConversationsTable(filtered);
}

function openChatLogModal(conversationId) {
  const conv = conversationsData.find(c => c.id === conversationId);
  if (!conv) return;

  document.getElementById("chat-session-id").innerText = conv.id;
  document.getElementById("chat-session-ip").innerText = conv.ipAddress || 'Unknown';
  document.getElementById("chat-session-location").innerText = conv.location || 'Unknown Location';
  
  let leadText = 'Not captured';
  if (conv.visitorName || conv.visitorEmail || conv.visitorPhone || conv.visitorCompany || conv.visitorNeeds) {
    const parts = [];
    if (conv.visitorName) parts.push(`Name: ${conv.visitorName}`);
    if (conv.visitorEmail) parts.push(`Email: ${conv.visitorEmail}`);
    if (conv.visitorPhone) parts.push(`Phone: ${conv.visitorPhone}`);
    if (conv.visitorCompany) parts.push(`Company: ${conv.visitorCompany}`);
    if (conv.visitorNeeds) parts.push(`Needs: ${conv.visitorNeeds}`);
    leadText = parts.join(' | ');
  }
  document.getElementById("chat-session-lead-details").innerText = leadText;

  document.getElementById("chat-session-active").innerText = conv.createdAt ? new Date(conv.createdAt).toLocaleString() : 'N/A';

  const threadContainer = document.getElementById("chat-log-messages");
  threadContainer.innerHTML = "";

  const messages = conv.messages || [];
  if (messages.length === 0) {
    threadContainer.innerHTML = `<div style="text-align: center; color: var(--text-dimmed); font-size: 13px; padding: 20px;">No messages saved in this session.</div>`;
  } else {
    messages.forEach(msg => {
      const row = document.createElement("div");
      const isUser = msg.role === 'user';
      row.className = `chat-log-bubble-row ${isUser ? 'user' : 'bot'}`;
      
      // Clean triggers like [TRIGGER_BOOKING]
      const cleanContent = (msg.content || '').replace(/\[TRIGGER_BOOKING\]/g, '').trim();
      
      row.innerHTML = `
        <div class="chat-log-bubble">
          <div style="font-size: 10px; opacity: 0.6; margin-bottom: 4px; font-weight: 600;">
            ${isUser ? 'Visitor' : 'AI Assistant'}
          </div>
          <div style="white-space: pre-wrap; font-size: 13px;">${escapeHtml(cleanContent)}</div>
        </div>
      `;
      threadContainer.appendChild(row);
    });
  }

  const modal = document.getElementById("chatLogModal");
  modal.style.display = "flex";
  
  // Auto-scroll messages thread to bottom
  setTimeout(() => {
    threadContainer.scrollTop = threadContainer.scrollHeight;
  }, 100);
}

function closeChatLogModal() {
  document.getElementById("chatLogModal").style.display = "none";
}

// -------------------------------------------------------------
// BILLING & PLANS INTERFACE LOGIC
// -------------------------------------------------------------
let selectedBillingPlanId = null;
let billingPaymentMethod = 'razorpay'; // Default to razorpay

function selectBillingPlan(planId) {
  // Free plan has no checkout panel
  if (planId === 'free') {
    alert("You are already on the Free Trial Plan. Select Pro or Advanced to initiate checkout.");
    return;
  }

  selectedBillingPlanId = planId;
  
  // Highlight selected card
  document.querySelectorAll(".price-card").forEach(card => {
    card.classList.remove("selected");
  });
  const selectedCard = document.getElementById(`billing-card-${planId}`);
  if (selectedCard) selectedCard.classList.add("selected");

  // Show checkout panel
  const checkoutPanel = document.getElementById("billing-checkout-panel");
  if (checkoutPanel) checkoutPanel.classList.remove("hidden");

  // Update order summary
  const subtotal = planId === 'pro' ? 20.00 : 30.00;
  const planName = planId === 'pro' ? 'Pro Plan' : 'Advanced Plan';

  document.getElementById("billing-summary-plan-name").innerText = planName;
  document.getElementById("billing-summary-subtotal").innerText = `$${subtotal.toFixed(2)}`;
  document.getElementById("billing-summary-total").innerText = `$${subtotal.toFixed(2)}`;

  // Auto scroll to checkout panel
  setTimeout(() => {
    checkoutPanel.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function switchBillingPaymentMethod(method) {
  billingPaymentMethod = method;
  
  const razorpayTab = document.getElementById("billing-pay-tab-razorpay");
  const mockTab = document.getElementById("billing-pay-tab-mock");
  const razorpayContainer = document.getElementById("billing-payment-container-razorpay");
  const mockContainer = document.getElementById("billing-payment-container-mock");

  if (method === 'razorpay') {
    razorpayTab.classList.remove("outline");
    mockTab.classList.add("outline");
    razorpayContainer.classList.remove("hidden");
    mockContainer.classList.add("hidden");
  } else {
    razorpayTab.classList.add("outline");
    mockTab.classList.remove("outline");
    razorpayContainer.classList.add("hidden");
    mockContainer.classList.remove("hidden");
  }
}

function cancelBillingCheckout() {
  const checkoutPanel = document.getElementById("billing-checkout-panel");
  if (checkoutPanel) checkoutPanel.classList.add("hidden");
  
  document.querySelectorAll(".price-card").forEach(card => {
    card.classList.remove("selected");
  });
  
  selectedBillingPlanId = null;
}

async function payBillingWithRazorpay() {
  const alertBox = document.getElementById("billing-alert-box");
  const alertMsg = document.getElementById("billing-alert-msg");
  const btn = document.getElementById("btn-billing-razorpay-checkout");
  
  if (alertBox) alertBox.classList.add("hidden");
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Initializing Secure Order...</span>`;
  lucide.createIcons();

  try {
    const amount = selectedBillingPlanId === 'pro' ? 20.00 : 30.00;
    
    // Create Razorpay Order
    const orderRes = await fetch("/api/auth/razorpay-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: selectedBillingPlanId
      })
    });
    
    const orderData = await orderRes.json();
    if (!orderRes.ok) {
      throw new Error(orderData.error || "Failed to initialize subscription checkout.");
    }
    
    // Check if key is configured (meaning we can run live SDK)
    if (orderData.razorpayKeyId) {
      // Setup Razorpay options
      const options = {
        key: orderData.razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Analytix Chatbot",
        description: `Upgrade to ${selectedBillingPlanId.toUpperCase()} Plan`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            // Verify payment on the server
            btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Verifying Payment...</span>`;
            lucide.createIcons();
            
            const verifyRes = await fetch("/api/auth/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                plan: selectedBillingPlanId,
                paymentGateway: "razorpay",
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              })
            });
            
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed.");
            
            alert(`🎉 Payment Successful! Your ${selectedBillingPlanId.toUpperCase()} subscription is active.`);
            cancelBillingCheckout();
            await checkOnboarding();
            loadSettings();
          } catch (err) {
            if (alertBox && alertMsg) {
              alertBox.className = "alert-banner error";
              alertMsg.innerText = err.message;
              alertBox.classList.remove("hidden");
            }
          } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
          }
        },
        prefill: {
          name: localStorage.getItem('ah_chatbot_username') || "Subscriber",
          email: settingsData.adminEmail || ""
        },
        theme: {
          color: "#2563eb"
        }
      };
      
      const rzp = new Razorpay(options);
      rzp.open();
    } else {
      // Fallback: If Razorpay credentials are not configured on the server, trigger Demo Mode/Mock order activation
      console.warn("Razorpay key not configured on server. Falling back to simulated instant activation.");
      
      // Simulate Razorpay success automatically
      const verifyRes = await fetch("/api/auth/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedBillingPlanId
        })
      });
      
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "Simulated payment failed.");
      
      alert(`🎉 [Demo Mode] Payment Simulated Successfully! Your ${selectedBillingPlanId.toUpperCase()} plan is now active.`);
      cancelBillingCheckout();
      await checkOnboarding();
      loadSettings();
    }
  } catch (err) {
    if (alertBox && alertMsg) {
      alertBox.className = "alert-banner error";
      alertMsg.innerText = err.message;
      alertBox.classList.remove("hidden");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}

async function handleBillingPaymentSubmitSimulated() {
  const alertBox = document.getElementById("billing-alert-box");
  const alertMsg = document.getElementById("billing-alert-msg");
  const btn = document.getElementById("btn-billing-pay-submit");
  
  if (alertBox) alertBox.classList.add("hidden");
  btn.disabled = true;
  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<i class="animate-spin" data-lucide="loader-2"></i> <span>Simulating Payment...</span>`;
  lucide.createIcons();

  try {
    // Trigger mock subscription activation
    const res = await fetch("/api/auth/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: selectedBillingPlanId
      })
    });
    
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Simulation activation failed.");
    
    alert(`🎉 [Demo Mode] Checkout successful! Your ${selectedBillingPlanId.toUpperCase()} subscription is active.`);
    cancelBillingCheckout();
    await checkOnboarding();
    loadSettings();
  } catch (err) {
    if (alertBox && alertMsg) {
      alertBox.className = "alert-banner error";
      alertMsg.innerText = err.message;
      alertBox.classList.remove("hidden");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    lucide.createIcons();
  }
}
