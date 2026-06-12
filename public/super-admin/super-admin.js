document.addEventListener('DOMContentLoaded', () => {
  // 1. Session Verification
  const token = localStorage.getItem('super_token');
  const username = localStorage.getItem('super_username');

  // Verify token exists (if we are on the dashboard)
  if (!token && !window.location.pathname.endsWith('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  // Populate username display
  const userDisplay = document.getElementById('superUserDisplay');
  if (userDisplay && username) {
    userDisplay.textContent = `Hello, ${username}`;
  }

  // Logout handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('super_token');
      localStorage.removeItem('super_username');
      window.location.href = 'login.html';
    });
  }

  // Theme Toggle Logic
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');

  if (themeToggleBtn && themeIcon) {
    const updateThemeIcon = (theme) => {
      if (theme === 'dark') {
        themeIcon.setAttribute('data-feather', 'sun');
      } else {
        themeIcon.setAttribute('data-feather', 'moon');
      }
      if (window.feather) {
        feather.replace();
      }
    };

    // Initialize icon based on current theme
    const currentTheme = localStorage.getItem('super_theme') || 'light';
    updateThemeIcon(currentTheme);

    themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', activeTheme);
      localStorage.setItem('super_theme', activeTheme);
      updateThemeIcon(activeTheme);
    });
  }

  // If we are on login page, don't execute dashboard logic
  if (window.location.pathname.endsWith('login.html')) return;

  // Initialize Feather Icons
  if (window.feather) {
    feather.replace();
  }

  // Dashboard Data variables
  let allAdmins = [];
  let tenantToDeleteId = null;

  // DOM Elements
  const tableBody = document.getElementById('adminsTableBody');
  const searchInput = document.getElementById('searchInput');
  const exportBookingsBtn = document.getElementById('exportBookingsBtn');
  const deleteModal = document.getElementById('deleteModal');
  const deleteTenantEmailSpan = document.getElementById('deleteTenantEmail');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  // Global Statistics Cards
  const statTotalTenants = document.getElementById('statTotalTenants');
  const statFreeCount = document.getElementById('statFreeCount');
  const statProCount = document.getElementById('statProCount');
  const statAdvCount = document.getElementById('statAdvCount');
  const statTotalBookings = document.getElementById('statTotalBookings');
  const statTotalConversations = document.getElementById('statTotalConversations');
  const statTotalRevenue = document.getElementById('statTotalRevenue');

  // Fetch Global Stats
  async function fetchStats() {
    try {
      const res = await fetch('/api/super/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) handleSessionExpiration();
        throw new Error('Failed to load stats');
      }
      const data = await res.json();
      
      statTotalTenants.textContent = data.totalTenants;
      statFreeCount.textContent = data.freeCount;
      statProCount.textContent = data.proCount;
      statAdvCount.textContent = data.advCount;
      statTotalBookings.textContent = data.totalBookings;
      statTotalConversations.textContent = data.totalConversations;
      if (statTotalRevenue) {
        statTotalRevenue.textContent = `$${data.totalRevenue || 0}`;
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Fetch Tenant Admins List
  async function fetchAdmins() {
    try {
      tableBody.innerHTML = `<tr><td colspan="9" class="no-data">Loading tenant directories...</td></tr>`;
      
      const res = await fetch('/api/super/admins', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) handleSessionExpiration();
        throw new Error('Failed to load admins');
      }
      allAdmins = await res.json();
      renderAdmins(allAdmins);
      renderGlobalLeads(allAdmins);
    } catch (err) {
      console.error(err);
      tableBody.innerHTML = `<tr><td colspan="9" class="no-data" style="color:var(--danger-color)">Error loading tenants. Please try reloading the dashboard.</td></tr>`;
    }
  }

  // Render Admins in the table
  function renderAdmins(admins) {
    if (admins.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" class="no-data">No tenant admins found.</td></tr>`;
      return;
    }

    tableBody.innerHTML = '';
    admins.forEach(admin => {
      const row = document.createElement('tr');
      
      // Formatted Join Date
      const joinedDate = admin.createdAt ? new Date(admin.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) : 'N/A';

      // Billing status badge
      let billingHtml = '';
      if (admin.paymentStatus === 'paid') {
        billingHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:var(--success-color); font-size:13px;">
          <i data-feather="check-circle" style="width:14px; height:14px;"></i> Paid $${admin.amountPaid}
        </span>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${admin.transactionId || ''}</div>`;
      } else if (admin.paymentStatus === 'free') {
        billingHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:500; color:var(--text-secondary); font-size:13px;">
          <i data-feather="smile" style="width:14px; height:14px;"></i> Free Plan
        </span>`;
      } else {
        billingHtml = `<span style="display:inline-flex; align-items:center; gap:4px; font-weight:600; color:var(--warning-color); font-size:13px;">
          <i data-feather="alert-circle" style="width:14px; height:14px;"></i> Unpaid
        </span>`;
      }

      row.innerHTML = `
        <td>
          <div class="tenant-info">
            <span class="tenant-email">${escapeHtml(admin.username)}</span>
            <span class="tenant-id">ID: ${admin.id}</span>
          </div>
        </td>
        <td>
          <div style="font-weight:600">${escapeHtml(admin.organizationName || 'Not Onboarded')}</div>
          <div style="font-size:12px; color:var(--text-secondary)">${escapeHtml(admin.fullName || '—')}</div>
        </td>
        <td>
          ${admin.websiteUrl ? `<a href="${escapeHtml(admin.websiteUrl)}" target="_blank" style="color:var(--accent-color); text-decoration:none; font-weight:600; font-size:13px;"><i data-feather="external-link" style="width:12px; height:12px; vertical-align:middle; margin-right:4px;"></i>Link</a>` : `<span style="color:var(--text-secondary)">—</span>`}
        </td>
        <td style="color:var(--text-secondary)">${joinedDate}</td>
        <td style="font-weight:700; color:var(--success-color)">${admin.bookingsCount}</td>
        <td style="font-weight:700; color:#60a5fa">${admin.conversationsCount}</td>
        <td>
          <select class="plan-select" data-user-id="${admin.id}">
            <option value="free" ${admin.plan === 'free' ? 'selected' : ''}>Free Trial</option>
            <option value="pro" ${admin.plan === 'pro' ? 'selected' : ''}>Pro Plan</option>
            <option value="advanced" ${admin.plan === 'advanced' ? 'selected' : ''}>Advanced</option>
          </select>
        </td>
        <td>
          ${billingHtml}
        </td>
        <td style="white-space: nowrap;">
          <button class="btn-primary btn-view-info" data-user-id="${admin.id}" style="padding: 6px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; width: auto; margin-top: 0; margin-right: 8px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; font-weight: 600; cursor: pointer; border-radius: 6px;">
            <i data-feather="info" style="width:14px; height:14px; vertical-align:middle;"></i> Details
          </button>
          <button class="btn-primary btn-export-single" data-user-id="${admin.id}" data-user-email="${escapeHtml(admin.username)}" style="padding: 6px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; width: auto; margin-top: 0; margin-right: 8px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); color: var(--accent-color); font-weight: 600; cursor: pointer; border-radius: 6px;">
            <i data-feather="download" style="width:14px; height:14px; vertical-align:middle;"></i> Bookings
          </button>
          <button class="btn-delete" data-user-id="${admin.id}" data-user-email="${escapeHtml(admin.username)}">
            <i data-feather="trash-2" style="width:14px; height:14px; vertical-align:middle;"></i> Delete
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    // Re-initialize Feather Icons for dynamically rendered list elements
    if (window.feather) {
      feather.replace();
    }

    // Attach Event Listeners to selects, details, and delete buttons
    document.querySelectorAll('.plan-select').forEach(select => {
      select.addEventListener('change', handlePlanChange);
    });

    document.querySelectorAll('.btn-view-info').forEach(btn => {
      btn.addEventListener('click', openInfoModal);
    });

    document.querySelectorAll('.btn-export-single').forEach(btn => {
      btn.addEventListener('click', handleSingleExport);
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', openDeleteModal);
    });
  }

  // Tenant Info Modal references
  const infoModal = document.getElementById('infoModal');
  const closeInfoBtn = document.getElementById('closeInfoBtn');
  const closeInfoBtn2 = document.getElementById('closeInfoBtn2');

  function openInfoModal(e) {
    let target = e.target;
    if (target.tagName === 'SVG' || target.tagName === 'path' || target.tagName === 'svg') {
      target = target.closest('.btn-view-info');
    }
    const userId = target.getAttribute('data-user-id');
    const admin = allAdmins.find(a => a.id === userId);
    if (!admin) return;

    document.getElementById('infoUserId').textContent = admin.id || 'N/A';
    document.getElementById('infoUsername').textContent = admin.username || 'N/A';
    document.getElementById('infoFullName').textContent = admin.fullName || 'Not Onboarded';
    document.getElementById('infoOrgName').textContent = admin.organizationName || 'Not Onboarded';
    
    const webVal = document.getElementById('infoWebsite');
    if (admin.websiteUrl) {
      webVal.innerHTML = `<a href="${escapeHtml(admin.websiteUrl)}" target="_blank" style="color: var(--accent-color); text-decoration: none; font-weight: 600;">
        ${escapeHtml(admin.websiteUrl)} <i data-feather="external-link" style="width:11px; height:11px; vertical-align:middle; margin-left:4px;"></i>
      </a>`;
    } else {
      webVal.textContent = '—';
    }

    document.getElementById('infoPlan').textContent = (admin.plan || 'free').toUpperCase();
    document.getElementById('infoPaymentStatus').textContent = (admin.paymentStatus || 'free').toUpperCase();
    document.getElementById('infoAmountPaid').textContent = `$${admin.amountPaid || 0}`;
    document.getElementById('infoTransactionId').textContent = admin.transactionId || 'FREE-MEMBER';

    const joinedDate = admin.createdAt ? new Date(admin.createdAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'N/A';
    document.getElementById('infoJoinedDate').textContent = joinedDate;

    document.getElementById('infoBotId').textContent = admin.botId || 'N/A';
    
    // Set bot settings info
    const settings = admin.settings || {};
    document.getElementById('infoBotName').textContent = settings.botName || 'Not Configured';
    document.getElementById('infoWelcomeMsg').textContent = settings.welcomeMessage || 'Not Configured';
    document.getElementById('infoPrimaryColor').innerHTML = settings.primaryColor ? 
      `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${settings.primaryColor}; margin-right:6px; vertical-align:middle; border:1px solid rgba(255,255,255,0.2);"></span> ${settings.primaryColor}` : 'Not Configured';
    document.getElementById('infoSystemPrompt').textContent = settings.systemPrompt || 'No prompt generated.';

    // Populate Captured Visitor Leads Section
    const leadsBody = document.getElementById('infoCapturedLeadsBody');
    if (leadsBody) {
      const convs = admin.conversations || [];
      // Filter conversations that have captured visitor info
      const leads = convs.filter(c => c.visitorName || c.visitorEmail || c.visitorPhone || c.visitorCompany || c.visitorNeeds);
      
      if (leads.length === 0) {
        leadsBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 12px; font-style: italic;">No captured leads found.</td>
          </tr>`;
      } else {
        leadsBody.innerHTML = '';
        leads.forEach(lead => {
          const row = document.createElement('tr');
          row.style.borderBottom = '1px solid var(--border-color)';
          
          // Format Date
          const leadDate = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'N/A';
          
          // Formatted details
          const nameHtml = lead.visitorName ? `<div style="font-weight:600; color:var(--text-primary);">${escapeHtml(lead.visitorName)}</div>` : '<div style="color:var(--text-secondary); font-style:italic;">Anonymous</div>';
          
          const contactParts = [];
          if (lead.visitorEmail) contactParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="mail" style="width:10px; height:10px; vertical-align:middle; color:#f59e0b;"></i> ${escapeHtml(lead.visitorEmail)}</div>`);
          if (lead.visitorPhone) contactParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="phone" style="width:10px; height:10px; vertical-align:middle; color:#10b981;"></i> ${escapeHtml(lead.visitorPhone)}</div>`);
          if (contactParts.length === 0) contactParts.push('<div style="color:var(--text-secondary); font-style:italic;">—</div>');
          
          const businessParts = [];
          if (lead.visitorCompany) businessParts.push(`<div style="font-size:11px; font-weight:600; color:#a855f7; display:flex; align-items:center; gap:4px;"><i data-feather="briefcase" style="width:10px; height:10px; vertical-align:middle;"></i> ${escapeHtml(lead.visitorCompany)}</div>`);
          if (lead.visitorNeeds) businessParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="message-square" style="width:10px; height:10px; vertical-align:middle; color:#60a5fa;"></i> ${escapeHtml(lead.visitorNeeds)}</div>`);
          if (businessParts.length === 0) businessParts.push('<div style="color:var(--text-secondary); font-style:italic;">—</div>');

          row.innerHTML = `
            <td style="padding: 10px 6px; vertical-align: top;">${nameHtml}</td>
            <td style="padding: 10px 6px; vertical-align: top;">${contactParts.join('')}</td>
            <td style="padding: 10px 6px; vertical-align: top;">${businessParts.join('')}</td>
            <td style="padding: 10px 6px; vertical-align: top; color:var(--text-secondary); font-size:11px;">${leadDate}</td>
          `;
          leadsBody.appendChild(row);
        });
      }
    }

    infoModal.style.display = 'flex';
    
    if (window.feather) {
      feather.replace();
    }
  }

  function closeInfoModalFunc() {
    infoModal.style.display = 'none';
  }

  if (closeInfoBtn) closeInfoBtn.addEventListener('click', closeInfoModalFunc);
  if (closeInfoBtn2) closeInfoBtn2.addEventListener('click', closeInfoModalFunc);
  window.addEventListener('click', (e) => {
    if (e.target === infoModal) {
      closeInfoModalFunc();
    }
  });

  // Handle Plan Change
  async function handlePlanChange(e) {
    const userId = e.target.getAttribute('data-user-id');
    const newPlan = e.target.value;

    try {
      const res = await fetch(`/api/super/admins/${userId}/plan`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plan: newPlan })
      });

      if (!res.ok) {
        if (res.status === 401) handleSessionExpiration();
        throw new Error('Failed to update plan level.');
      }

      // Refresh Stats and update local cache
      await fetchStats();
      await fetchAdmins();
    } catch (err) {
      alert('Error: ' + err.message);
      // Revert select input
      fetchAdmins();
    }
  }

  // Handle Specific Tenant Bookings Export
  function handleSingleExport(e) {
    let target = e.target;
    if (target.tagName === 'svg' || target.tagName === 'path') {
      target = target.closest('.btn-export-single');
    }
    const userId = target.getAttribute('data-user-id');
    window.location.href = `/api/super/admins/${userId}/bookings/export?token=${encodeURIComponent(token)}`;
  }

  // Open Delete Tenant Modal
  function openDeleteModal(e) {
    // Traverse up if click landed on icon
    let target = e.target;
    if (target.tagName === 'svg' || target.tagName === 'path') {
      target = target.closest('.btn-delete');
    }
    
    tenantToDeleteId = target.getAttribute('data-user-id');
    const email = target.getAttribute('data-user-email');

    deleteTenantEmailSpan.textContent = email;
    deleteModal.style.display = 'flex';
  }

  // Close Delete Tenant Modal
  function closeDeleteModal() {
    deleteModal.style.display = 'none';
    tenantToDeleteId = null;
  }

  cancelDeleteBtn.addEventListener('click', closeDeleteModal);

  // Confirm Delete Tenant
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!tenantToDeleteId) return;

    try {
      const res = await fetch(`/api/super/admins/${tenantToDeleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) handleSessionExpiration();
        throw new Error('Failed to delete tenant.');
      }

      closeDeleteModal();
      // Reload statistics and list
      await fetchStats();
      await fetchAdmins();

    } catch (err) {
      alert('Error: ' + err.message);
      closeDeleteModal();
    }
  });

  // Search Filter Handler
  if (searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        renderAdmins(allAdmins);
        return;
      }

      const filtered = allAdmins.filter(admin => 
        admin.username.toLowerCase().includes(query) ||
        (admin.organizationName && admin.organizationName.toLowerCase().includes(query)) ||
        (admin.fullName && admin.fullName.toLowerCase().includes(query))
      );
      renderAdmins(filtered);
    });
  }

  // Global Leads Search Filter Handler
  const leadsSearchInput = document.getElementById('leadsSearchInput');
  if (leadsSearchInput) {
    leadsSearchInput.addEventListener('keyup', () => {
      renderGlobalLeads(allAdmins);
    });
  }

  // Export Bookings Event Listener
  if (exportBookingsBtn) {
    exportBookingsBtn.addEventListener('click', () => {
      window.location.href = `/api/super/bookings/export?token=${encodeURIComponent(token)}`;
    });
  }

  // Handle Token Expiry
  function handleSessionExpiration() {
    localStorage.removeItem('super_token');
    localStorage.removeItem('super_username');
    window.location.href = 'login.html';
  }

  // Utility to escape HTML strings safely
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Tata AI Cloud Settings elements
  const globalSettingsForm = document.getElementById('globalSettingsForm');
  const tataUrlInput = document.getElementById('tataUrl');
  const tataModelSelect = document.getElementById('tataModel');
  const tataKeyInput = document.getElementById('tataKey');
  const toggleTataKeyBtn = document.getElementById('toggleTataKeyBtn');
  const settingsStatusMsg = document.getElementById('settingsStatusMsg');

  const razorpayKeyIdInput = document.getElementById('razorpayKeyId');
  const razorpayKeySecretInput = document.getElementById('razorpayKeySecret');
  const toggleRazorpaySecretBtn = document.getElementById('toggleRazorpaySecretBtn');

  // Load Global Settings
  async function loadGlobalSettings() {
    try {
      const res = await fetch('/api/super/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401) handleSessionExpiration();
        throw new Error('Failed to load global settings');
      }
      const data = await res.json();
      if (tataUrlInput) {
        const urlVal = data.tataUrl || "";
        if (urlVal === "https://models.cloudservices.tatacommunications.com/v1") {
          tataUrlInput.value = "";
        } else {
          tataUrlInput.value = urlVal;
        }
      }
      if (tataModelSelect) tataModelSelect.value = data.tataModel || "meta/Llama-3.3-70B-Instruct";
      if (tataKeyInput) tataKeyInput.value = data.tataKey || "";
      if (razorpayKeyIdInput) razorpayKeyIdInput.value = data.razorpayKeyId || "";
      if (razorpayKeySecretInput) razorpayKeySecretInput.value = data.razorpayKeySecret || "";
    } catch (err) {
      console.error(err);
      if (settingsStatusMsg) {
        settingsStatusMsg.style.color = 'var(--danger-color)';
        settingsStatusMsg.textContent = 'Error loading global settings.';
      }
    }
  }

  // Save Global Settings
  if (globalSettingsForm) {
    globalSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (settingsStatusMsg) {
        settingsStatusMsg.style.color = 'var(--text-secondary)';
        settingsStatusMsg.textContent = 'Saving global settings...';
      }

      const rawUrl = tataUrlInput.value.trim();
      const payload = {
        tataUrl: rawUrl === "" ? "https://models.cloudservices.tatacommunications.com/v1" : rawUrl,
        tataModel: tataModelSelect.value,
        tataKey: tataKeyInput.value.trim(),
        razorpayKeyId: razorpayKeyIdInput ? razorpayKeyIdInput.value.trim() : "",
        razorpayKeySecret: razorpayKeySecretInput ? razorpayKeySecretInput.value.trim() : ""
      };

      try {
        const res = await fetch('/api/super/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          if (res.status === 401) handleSessionExpiration();
          throw new Error('Failed to save settings.');
        }

        const data = await res.json();
        if (settingsStatusMsg) {
          settingsStatusMsg.style.color = 'var(--success-color)';
          settingsStatusMsg.textContent = '✓ Global settings saved successfully!';
          setTimeout(() => {
            settingsStatusMsg.textContent = '';
          }, 3000);
        }
        loadGlobalSettings();
      } catch (err) {
        if (settingsStatusMsg) {
          settingsStatusMsg.style.color = 'var(--danger-color)';
          settingsStatusMsg.textContent = '✗ ' + err.message;
        }
      }
    });
  }

  // Toggle Password Visibility
  if (toggleTataKeyBtn && tataKeyInput) {
    toggleTataKeyBtn.addEventListener('click', () => {
      const isPassword = tataKeyInput.getAttribute('type') === 'password';
      tataKeyInput.setAttribute('type', isPassword ? 'text' : 'password');
      const eyeIcon = toggleTataKeyBtn.querySelector('i');
      if (eyeIcon && window.feather) {
        eyeIcon.setAttribute('data-feather', isPassword ? 'eye-off' : 'eye');
        feather.replace();
      }
    });
  }

  // Toggle Razorpay Secret Visibility
  if (toggleRazorpaySecretBtn && razorpayKeySecretInput) {
    toggleRazorpaySecretBtn.addEventListener('click', () => {
      const isPassword = razorpayKeySecretInput.getAttribute('type') === 'password';
      razorpayKeySecretInput.setAttribute('type', isPassword ? 'text' : 'password');
      const eyeIcon = toggleRazorpaySecretBtn.querySelector('i');
      if (eyeIcon && window.feather) {
        eyeIcon.setAttribute('data-feather', isPassword ? 'eye-off' : 'eye');
        feather.replace();
      }
    });
  }

  // Chat Modal DOM Elements & Functions
  const chatModal = document.getElementById('chatModal');
  const closeChatBtn = document.getElementById('closeChatBtn');
  const closeChatBtn2 = document.getElementById('closeChatBtn2');

  function openChatModal(e) {
    let target = e.target;
    if (target.tagName === 'SVG' || target.tagName === 'path' || target.tagName === 'svg') {
      target = target.closest('.btn-view-chat');
    }
    if (!target) return;
    const botId = target.getAttribute('data-bot-id');
    const convId = target.getAttribute('data-conv-id');

    const admin = allAdmins.find(a => a.botId === botId);
    if (!admin) return;

    const conv = admin.conversations.find(c => c.id === convId);
    if (!conv) return;

    const messagesContainer = document.getElementById('chatMessagesContainer');
    messagesContainer.innerHTML = '';

    const messages = conv.messages || [];
    if (messages.length === 0) {
      messagesContainer.innerHTML = '<div style="text-align: center; color: var(--text-secondary); font-style: italic; margin-top: 20px;">No messages found in this chat session.</div>';
    } else {
      messages.forEach(msg => {
        const bubble = document.createElement('div');
        bubble.className = `chat-message ${msg.role === 'user' ? 'user' : 'bot'}`;
        bubble.innerText = msg.content || '';
        messagesContainer.appendChild(bubble);
      });
    }

    chatModal.style.display = 'flex';
  }

  function closeChatModalFunc() {
    chatModal.style.display = 'none';
  }

  if (closeChatBtn) closeChatBtn.addEventListener('click', closeChatModalFunc);
  if (closeChatBtn2) closeChatBtn2.addEventListener('click', closeChatModalFunc);
  window.addEventListener('click', (e) => {
    if (e.target === chatModal) {
      closeChatModalFunc();
    }
  });

  // Render Global Leads
  function renderGlobalLeads(admins) {
    const leadsTableBody = document.getElementById('globalLeadsTableBody');
    if (!leadsTableBody) return;

    // 1. Gather all conversations across all admins
    let allConvs = [];
    admins.forEach(admin => {
      const convs = admin.conversations || [];
      convs.forEach(c => {
        allConvs.push({
          ...c,
          tenantEmail: admin.username,
          tenantOrg: admin.organizationName || 'Not Onboarded',
          tenantBotId: admin.botId
        });
      });
    });

    // 2. Sort by creation date descending
    allConvs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 3. Filter by search query if any
    const query = document.getElementById('leadsSearchInput') ? document.getElementById('leadsSearchInput').value.toLowerCase().trim() : '';
    if (query) {
      allConvs = allConvs.filter(c => 
        c.tenantEmail.toLowerCase().includes(query) ||
        c.tenantOrg.toLowerCase().includes(query) ||
        (c.visitorName && c.visitorName.toLowerCase().includes(query)) ||
        (c.visitorEmail && c.visitorEmail.toLowerCase().includes(query)) ||
        (c.visitorPhone && c.visitorPhone.toLowerCase().includes(query)) ||
        (c.visitorCompany && c.visitorCompany.toLowerCase().includes(query)) ||
        (c.visitorNeeds && c.visitorNeeds.toLowerCase().includes(query))
      );
    }

    if (allConvs.length === 0) {
      leadsTableBody.innerHTML = `<tr><td colspan="7" class="no-data">No chat sessions or visitor leads found.</td></tr>`;
      return;
    }

    leadsTableBody.innerHTML = '';
    allConvs.forEach(conv => {
      const row = document.createElement('tr');

      // Joined/Created Date
      const dateStr = conv.createdAt ? new Date(conv.createdAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'N/A';

      const visitorNameHtml = conv.visitorName ? `<div style="font-weight:600; color:var(--text-primary);">${escapeHtml(conv.visitorName)}</div>` : '<div style="color:var(--text-secondary); font-style:italic;">Anonymous</div>';
      
      const contactParts = [];
      if (conv.visitorEmail) contactParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="mail" style="width:10px; height:10px; color:#f59e0b;"></i> ${escapeHtml(conv.visitorEmail)}</div>`);
      if (conv.visitorPhone) contactParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="phone" style="width:10px; height:10px; color:#10b981;"></i> ${escapeHtml(conv.visitorPhone)}</div>`);
      if (contactParts.length === 0) contactParts.push('<span style="color:var(--text-secondary); font-style:italic;">—</span>');

      const businessParts = [];
      if (conv.visitorCompany) businessParts.push(`<div style="font-size:11px; font-weight:600; color:#a855f7; display:flex; align-items:center; gap:4px;"><i data-feather="briefcase" style="width:10px; height:10px;"></i> ${escapeHtml(conv.visitorCompany)}</div>`);
      if (conv.visitorNeeds) businessParts.push(`<div style="font-size:11px; color:var(--text-secondary); display:flex; align-items:center; gap:4px; margin-top:2px;"><i data-feather="message-square" style="width:10px; height:10px; color:#60a5fa;"></i> ${escapeHtml(conv.visitorNeeds)}</div>`);
      if (businessParts.length === 0) businessParts.push('<span style="color:var(--text-secondary); font-style:italic;">—</span>');

      row.innerHTML = `
        <td>
          <div style="font-weight:600">${escapeHtml(conv.tenantOrg)}</div>
          <div style="font-size:11px; color:var(--text-secondary)">${escapeHtml(conv.tenantEmail)}</div>
        </td>
        <td>${visitorNameHtml}</td>
        <td>${contactParts.join('')}</td>
        <td>${businessParts.join('')}</td>
        <td style="font-size:12px; color:var(--text-secondary)">
          <div>${escapeHtml(conv.ipAddress || 'Unknown')}</div>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(conv.location || 'Unknown Location')}</div>
        </td>
        <td style="color:var(--text-secondary); font-size:12px;">${dateStr}</td>
        <td>
          <button class="btn-primary btn-view-chat" data-bot-id="${conv.tenantBotId}" data-conv-id="${conv.id}" style="padding: 6px 12px; font-size: 13px; display: inline-flex; align-items: center; gap: 4px; width: auto; margin-top: 0; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.3); color: #c084fc; font-weight: 600; cursor: pointer; border-radius: 6px;">
            <i data-feather="message-square" style="width:14px; height:14px;"></i> View Chat
          </button>
        </td>
      `;
      leadsTableBody.appendChild(row);
    });

    if (window.feather) {
      feather.replace();
    }

    // Attach Event Listeners to view chat buttons
    document.querySelectorAll('.btn-view-chat').forEach(btn => {
      btn.addEventListener('click', openChatModal);
    });
  }

  // Initialize load
  fetchStats();
  fetchAdmins();
  loadGlobalSettings();
});
