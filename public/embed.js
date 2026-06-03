(async function() {
  // Prevent duplicate instances
  if (window.__ah_chatbot_initialized) return;
  window.__ah_chatbot_initialized = true;

  // Retrieve host origin from the script tag src attribute
  const scriptTag = document.currentScript;
  const scriptSrc = scriptTag ? scriptTag.src : 'http://localhost:3000/embed.js';
  const serverUrl = new URL(scriptSrc).origin;

  // Resolve botId from page URL query param OR data-bot-id attribute OR from URL query param on current script
  let botId = new URL(window.location.href).searchParams.get('botId') || 'bot-default';
  if (botId === 'bot-default' && scriptTag) {
    botId = scriptTag.getAttribute('data-bot-id') || 
            new URL(scriptSrc).searchParams.get('botId') || 
            'bot-default';
  }

  // Fetch settings dynamically to override theme colors & details in embed launcher!
  let botName = "AH Bot";
  let primaryColor = "#2563eb";
  let welcomeMessage = "Hi! How can I help you today?";

  try {
    const res = await fetch(`${serverUrl}/api/settings?botId=${encodeURIComponent(botId)}`);
    if (res.ok) {
      const settings = await res.json();
      botName = settings.botName || "AH Bot";
      primaryColor = settings.primaryColor || "#2563eb";
      welcomeMessage = settings.welcomeMessage || "Hi! How can I help you today?";
    }
  } catch(e) {
    console.warn("Chatbot embed launcher failed to load dynamic settings, reverting to default parameters.", e);
  }

  // -------------------------------------------------------------
  // INJECT WIDGET DOM ELEMENTS
  // -------------------------------------------------------------
  // 1. Inject Stylesheet
  const style = document.createElement('style');
  style.innerHTML = `
    .ah-chatbot-wrapper {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    
    /* Launcher button style */
    .ah-chatbot-launcher {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${primaryColor};
      box-shadow: 0 6px 20px rgba(${hexToRgbChannels(primaryColor)}, 0.4), 0 0 0 1px rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    
    .ah-chatbot-launcher:hover {
      transform: scale(1.05) translateY(-2px);
      box-shadow: 0 8px 26px rgba(${hexToRgbChannels(primaryColor)}, 0.5), 0 0 0 1px rgba(255,255,255,0.15);
      filter: brightness(1.08);
    }
    
    .ah-chatbot-launcher:active {
      transform: scale(0.95);
    }
    
    /* Launcher pulse effect */
    .ah-chatbot-launcher::after {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      border-radius: 50%;
      border: 1px solid ${primaryColor};
      opacity: 0.5;
      animation: ahLauncherPulse 2s infinite;
      pointer-events: none;
    }
    
    @keyframes ahLauncherPulse {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(1.35); opacity: 0; }
    }
    
    .ah-chatbot-launcher svg {
      width: 28px;
      height: 28px;
      fill: none;
      stroke: white;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.4s ease;
    }
    
    .ah-chatbot-launcher.active svg {
      transform: rotate(180deg);
    }

    /* Tooltip Bubble */
    .ah-chatbot-tooltip {
      position: absolute;
      right: 76px;
      top: 50%;
      transform: translateY(-50%);
      background-color: #111827;
      color: #f3f4f6;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      opacity: 0;
      transition: all 0.3s ease;
    }
    
    .ah-chatbot-launcher:hover .ah-chatbot-tooltip {
      opacity: 1;
      transform: translateY(-50%) translateX(-4px);
    }

    /* Iframe Wrapper Container */
    .ah-chatbot-iframe-container {
      position: absolute;
      bottom: 76px;
      right: 0;
      width: 380px;
      height: calc(100vh - 120px);
      max-height: 600px;
      min-height: 380px;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: bottom right;
      z-index: 999999;
    }
    
    .ah-chatbot-iframe-container.active {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    
    .ah-chatbot-iframe-container iframe {
      width: 100%;
      height: 100%;
      border: none;
      background-color: transparent;
    }

    /* Automatic Speech Bubble Pop-up */
    .ah-speech-bubble {
      position: absolute;
      right: 76px;
      bottom: 8px;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      white-space: nowrap;
      opacity: 0;
      transform: translateX(15px) scale(0.9);
      transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
      z-index: 99999;
      display: flex;
      align-items: center;
    }
    
    .ah-speech-bubble.active {
      opacity: 1;
      transform: translateX(0) scale(1);
      pointer-events: auto;
    }
    
    .ah-speech-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .ah-speech-text {
      cursor: pointer;
    }
    
    .ah-speech-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 16px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      transition: color 0.2s ease;
    }
    
    .ah-speech-close:hover {
      color: #f8fafc;
    }
    
    .ah-speech-arrow {
      position: absolute;
      right: -6px;
      top: 50%;
      transform: translateY(-50%) rotate(45deg);
      width: 10px;
      height: 10px;
      background-color: #0f172a;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* Mobile Responsiveness */
    @media (max-width: 480px) {
      .ah-chatbot-wrapper {
        bottom: 12px;
        right: 12px;
      }
      .ah-chatbot-iframe-container {
        width: calc(100vw - 24px);
        height: calc(100vh - 100px);
        bottom: 70px;
      }
      .ah-chatbot-tooltip {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);

  // 2. Create and inject Widget Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'ah-chatbot-wrapper';
  
  wrapper.innerHTML = `
    <!-- Speech Bubble Alert Popup -->
    <div class="ah-speech-bubble" id="ah-speech-popup">
      <div class="ah-speech-content">
        <span class="ah-speech-text" id="ah-speech-trigger">Hiii! Let me help you! 👋</span>
        <button class="ah-speech-close" id="ah-speech-close-btn">&times;</button>
      </div>
      <div class="ah-speech-arrow"></div>
    </div>

    <!-- Iframe box container -->
    <div class="ah-chatbot-iframe-container" id="ah-iframe-box">
      <iframe src="${serverUrl}/widget/widget.html?botId=${encodeURIComponent(botId)}&v=${Date.now()}" id="ah-chatbot-iframe" allow="autoplay; clipboard-read; clipboard-write;"></iframe>
    </div>
    
    <!-- Floating Launcher bubble -->
    <div class="ah-chatbot-launcher" id="ah-launcher">
      <!-- Tooltip text -->
      <div class="ah-chatbot-tooltip">Chat with ${botName} 💬</div>
      <!-- SVG Bot icon / close icon -->
      <svg id="ah-launcher-icon" viewBox="0 0 24 24">
        <!-- Default Bot SVG -->
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      </svg>
    </div>
  `;
  
  document.body.appendChild(wrapper);

  // -------------------------------------------------------------
  // CONTROLLER INTERACTORS
  // -------------------------------------------------------------
  const launcher = document.getElementById('ah-launcher');
  const iframeBox = document.getElementById('ah-iframe-box');
  const launcherIcon = document.getElementById('ah-launcher-icon');
  
  let isOpen = false;

  // Toggle widget view when launcher clicked
  launcher.addEventListener('click', () => {
    toggleWidget();
  });

  // Speech Bubble Elements
  const speechPopup = document.getElementById('ah-speech-popup');
  const speechCloseBtn = document.getElementById('ah-speech-close-btn');
  const speechTrigger = document.getElementById('ah-speech-trigger');

  function toggleWidget() {
    isOpen = !isOpen;
    if (isOpen) {
      launcher.classList.add('active');
      iframeBox.classList.add('active');
      speechPopup.classList.remove('active'); // Hide speech popup on expand
      // Swap icon to 'minus' (close style)
      launcherIcon.innerHTML = `
        <line x1="5" y1="12" x2="19" y2="12"></line>
      `;
    } else {
      launcher.classList.remove('active');
      iframeBox.classList.remove('active');
      // Swap icon back to bot
      launcherIcon.innerHTML = `
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
        <line x1="8" y1="16" x2="8" y2="16" />
        <line x1="16" y1="16" x2="16" y2="16" />
      `;
    }
  }

  // Trigger speech popup alert on load/refresh (instead of full widget)
  setTimeout(() => {
    if (!isOpen) {
      speechPopup.classList.add('active');
    }
  }, 1000);

  // Close speech popup when "x" clicked
  speechCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speechPopup.classList.remove('active');
  });

  // Open chatbot when clicking the speech bubble text
  speechTrigger.addEventListener('click', () => {
    speechPopup.classList.remove('active');
    if (!isOpen) toggleWidget();
  });

  // -------------------------------------------------------------
  // MESSAGE BRIDGE FROM IFRAME
  // -------------------------------------------------------------
  window.addEventListener('message', (event) => {
    if (event.origin !== serverUrl) return;

    if (event.data && event.data.type === 'ah-chatbot-close') {
      if (isOpen) toggleWidget();
    }
  });

  // -------------------------------------------------------------
  // HELPER HEX TO RGB CONVERTER
  // -------------------------------------------------------------
  function hexToRgbChannels(hex) {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }

})();
