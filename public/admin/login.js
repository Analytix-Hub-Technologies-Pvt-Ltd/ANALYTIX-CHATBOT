// Authentication Form Toggling and API Interactions

function switchAuthTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const regTab = document.getElementById('tab-register');
  const loginPane = document.getElementById('pane-login');
  const regPane = document.getElementById('pane-register');
  const footerHint = document.getElementById('footer-hint');
  const subTitle = document.getElementById('portal-sub');
  
  // Clear any existing alerts
  hideAlert();

  if (tab === 'login') {
    loginTab.classList.add('active');
    regTab.classList.remove('active');
    loginPane.classList.add('active');
    regPane.classList.remove('active');
    footerHint.style.display = 'block';
    subTitle.innerText = "Multi-Tenant SaaS Control Center";
  } else {
    regTab.classList.add('active');
    loginTab.classList.remove('active');
    regPane.classList.add('active');
    loginPane.classList.remove('active');
    footerHint.style.display = 'none';
    subTitle.innerText = "Register Your Isolated Helpdesk Agent";
  }
}

function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');
  const alertMsg = document.getElementById('alert-msg');
  const alertIcon = document.getElementById('alert-icon');

  alertMsg.innerText = message;
  alertBox.className = `alert alert-${type}`;

  if (type === 'success') {
    alertIcon.setAttribute('data-lucide', 'check-circle-2');
  } else {
    alertIcon.setAttribute('data-lucide', 'alert-circle');
  }

  lucide.createIcons();
}

function hideAlert() {
  document.getElementById('alert-box').className = 'alert hidden';
}

async function handleAuthSubmit(event, action) {
  event.preventDefault();
  hideAlert();

  const isLogin = action === 'login';
  const submitBtn = document.getElementById(isLogin ? 'btn-login-submit' : 'btn-reg-submit');
  const spinner = submitBtn.querySelector('.spinner');
  const arrowIcon = submitBtn.querySelector('.arrow-icon');
  
  // Retrieve credentials
  const usernameInput = document.getElementById(isLogin ? 'login-username' : 'reg-username');
  const passwordInput = document.getElementById(isLogin ? 'login-password' : 'reg-password');
  
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!isLogin) {
    const confirmPassword = document.getElementById('reg-password-confirm').value;
    if (password !== confirmPassword) {
      showAlert("Passwords do not match. Please verify.", "error");
      return;
    }
  }

  // Set loading state
  submitBtn.disabled = true;
  spinner.style.display = 'block';
  if (arrowIcon) arrowIcon.style.display = 'none';

  try {
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    showAlert(isLogin ? "Signing you in..." : "Provisioning complete! Logging you in...", "success");

    // Save tokens and settings variables
    localStorage.setItem('ah_chatbot_auth_token', data.token);
    localStorage.setItem('ah_chatbot_username', data.username);
    localStorage.setItem('ah_chatbot_bot_id', data.botId);

    // Dynamic redirect after delay for smooth micro-interaction
    setTimeout(() => {
      if (isLogin) {
        window.location.href = '/admin/admin.html';
      } else {
        window.location.href = '/admin/onboarding.html';
      }
    }, 1200);

  } catch (error) {
    showAlert(error.message, "error");
    // Clear loading state
    submitBtn.disabled = false;
    spinner.style.display = 'none';
    if (arrowIcon) arrowIcon.style.display = 'block';
  }
}

// Redirect right away if already authenticated
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem('ah_chatbot_auth_token');
  if (token) {
    window.location.href = '/admin/admin.html';
  }
});
