/**
 * GenFocus Authentication Module
 * Coordinates UI states for Login, Signup, profile validation, and session lifecycle.
 */

(function() {
  // DOM Elements
  const authView = document.getElementById('auth-view');
  const mainView = document.getElementById('main-view');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const toSignupLink = document.getElementById('to-signup');
  const toLoginLink = document.getElementById('to-login');
  const logoutBtn = document.getElementById('logout-btn');
  const activeUserDisplay = document.getElementById('active-user-display');
  const guestBtns = document.querySelectorAll('.guest-login-btn');

  /**
   * Creates and shows a premium inline error message in the form
   */
  function showFormError(form, message) {
    clearFormErrors(form);

    const errorBanner = document.createElement('div');
    errorBanner.className = 'form-error-banner';
    errorBanner.style.cssText = `
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #ef4444;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      font-weight: 500;
      text-align: center;
      animation: scale-in 0.25s ease;
    `;
    errorBanner.textContent = message;

    form.insertBefore(errorBanner, form.querySelector('.input-group'));
  }

  function clearFormErrors(form) {
    const existing = form.querySelector('.form-error-banner');
    if (existing) {
      existing.remove();
    }
  }

  function updateActiveUserLayout(username) {
    const isGuest = !username || username.toLowerCase() === 'guest';
    activeUserDisplay.textContent = isGuest ? 'Guest Mode' : username;
    
    const signupNudge = document.getElementById('guest-signup-nudge');
    if (signupNudge) {
      if (isGuest) {
        signupNudge.classList.remove('hidden');
      } else {
        signupNudge.classList.add('hidden');
      }
    }
  }

  function toggleView(isLoggedIn) {
    if (isLoggedIn) {
      authView.classList.remove('active');
      mainView.classList.add('active');
    } else {
      mainView.classList.remove('active');
      authView.classList.add('active');
    }
  }

  function initAuth(callbacks = {}) {
    const { onLogin, onLogout } = callbacks;

    // 1. Toggle between Login & Signup
    toSignupLink.addEventListener('click', (e) => {
      e.preventDefault();
      clearFormErrors(loginForm);
      loginForm.classList.add('hidden');
      signupForm.classList.remove('hidden');
      signupForm.reset();
    });

    toLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      clearFormErrors(signupForm);
      signupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      loginForm.reset();
    });

    // Guest Signup Nudge Redirect
    const signupNudge = document.getElementById('guest-signup-nudge');
    if (signupNudge) {
      signupNudge.addEventListener('click', (e) => {
        e.preventDefault();
        window.FocusStorage.logout();
        toggleView(false);
        clearFormErrors(loginForm);
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        signupForm.reset();
        if (typeof onLogout === 'function') onLogout();
      });
    }

    // 2. Handle Signup Submission
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(signupForm);

      const username = document.getElementById('signup-username').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm-password').value;

      if (username.length < 3) {
        showFormError(signupForm, "Username must be at least 3 characters.");
        return;
      }
      if (password.length < 4) {
        showFormError(signupForm, "Password must be at least 4 characters.");
        return;
      }
      if (password !== confirmPassword) {
        showFormError(signupForm, "Passwords do not match.");
        return;
      }

      const success = await window.FocusStorage.registerUser(username, password);
      if (success) {
        const loggedIn = await window.FocusStorage.loginUser(username, password);
        if (loggedIn) {
          const activeUser = window.FocusStorage.getCurrentUser();
          updateActiveUserLayout(activeUser);
          toggleView(true);
          if (typeof onLogin === 'function') onLogin(activeUser);
        }
      } else {
        showFormError(signupForm, "Username already taken on this device or in the database.");
      }
    });

    // 3. Handle Login Submission
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(loginForm);

      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;

      const success = await window.FocusStorage.loginUser(username, password);
      if (success) {
        const activeUser = window.FocusStorage.getCurrentUser();
        updateActiveUserLayout(activeUser);
        toggleView(true);
        if (typeof onLogin === 'function') onLogin(activeUser);
      } else {
        showFormError(loginForm, "Invalid username or password.");
      }
    });

    // 4. Handle Logout Button
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.FocusStorage.logout();
      toggleView(false);
      loginForm.reset();
      signupForm.reset();
      if (typeof onLogout === 'function') onLogout();
    });

    // 5. Handle Guest Login buttons
    guestBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        window.FocusStorage.loginGuest();
        updateActiveUserLayout('Guest');
        toggleView(true);
        if (typeof onLogin === 'function') onLogin('Guest');
      });
    });

    // 6. Initial Session Check on Boot
    (async function() {
      if (window.FocusStorage.isGuest && window.FocusStorage.isGuest()) {
        updateActiveUserLayout('Guest');
        toggleView(true);
        if (typeof onLogin === 'function') onLogin('Guest');
      } else {
        const existingUser = window.FocusStorage.getCurrentUser();
        if (existingUser) {
          // Since registered user storage is online-only, restore the session cache asynchronously first!
          const success = await window.FocusStorage.restoreSession(existingUser);
          if (success) {
            updateActiveUserLayout(existingUser);
            toggleView(true);
            if (typeof onLogin === 'function') onLogin(existingUser);
          } else {
            // If the session restore fails (e.g. invalid config or offline), log out to keep app state clean
            window.FocusStorage.logout();
            toggleView(false);
          }
        } else {
          toggleView(false);
        }
      }
    })();
  }

  // Export to Global Namespace
  window.FocusAuth = {
    initAuth
  };
})();
