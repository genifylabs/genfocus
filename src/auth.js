/**
 * GenFocus Authentication Module
 * Coordinates Firebase Auth, Google OAuth popups, and Firestore real-time state transitions.
 */

import {
  auth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from '../firebase.js';

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
  
  // Google Auth & Loading Overlay elements
  const googleBtns = document.querySelectorAll('.google-login-btn');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const errorLogoutBtn = document.getElementById('error-logout-btn');

  /**
   * Creates and shows a premium inline error or success message in the form
   */
  function showFormMessage(form, message, isSuccess = false) {
    clearFormErrors(form);

    const banner = document.createElement('div');
    banner.className = 'form-error-banner'; // Keep class for easy clearing
    
    const bg = isSuccess ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const border = isSuccess ? '1px solid rgba(34, 197, 94, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)';
    const color = isSuccess ? '#22c55e' : '#ef4444';

    banner.style.cssText = `
      background: ${bg};
      border: ${border};
      color: ${color};
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      font-weight: 500;
      text-align: center;
      animation: scale-in 0.25s ease;
    `;
    banner.textContent = message;

    form.insertBefore(banner, form.querySelector('.input-group'));
  }

  function showFormError(form, message) {
    showFormMessage(form, message, false);
  }

  function showFormSuccess(form, message) {
    showFormMessage(form, message, true);
  }

  function clearFormErrors(form) {
    const existing = form.querySelector('.form-error-banner');
    if (existing) {
      existing.remove();
    }
  }

  function updateActiveUserLayout(username) {
    const isGuest = !username || username.toLowerCase() === 'guest';
    
    // Move Guest Mode out of footer user-badge
    const userBadgeEl = document.querySelector('.user-badge');
    if (userBadgeEl) {
      if (isGuest) {
        userBadgeEl.style.display = 'none';
      } else {
        userBadgeEl.style.display = 'flex';
        activeUserDisplay.textContent = username;
      }
    }
    
    // Sync settings profile email display card if exists
    const settingsEmailEl = document.getElementById('settings-profile-email');
    if (settingsEmailEl) {
      settingsEmailEl.textContent = isGuest ? 'Guest Mode' : username;
    }

    // Toggle top guest mode badge
    const topGuestBadge = document.getElementById('top-guest-badge');
    if (topGuestBadge) {
      if (isGuest) {
        topGuestBadge.classList.remove('hidden');
      } else {
        topGuestBadge.classList.add('hidden');
      }
    }

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
      const passwordFeedback = document.getElementById('signup-password-feedback');
      if (passwordFeedback) {
        passwordFeedback.textContent = '';
        passwordFeedback.className = 'password-feedback';
      }
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
      signupNudge.addEventListener('click', async (e) => {
        e.preventDefault();
        await window.FocusStorage.logout();
        toggleView(false);
        clearFormErrors(loginForm);
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        signupForm.reset();
        if (typeof onLogout === 'function') onLogout();
      });
    }

    // Inline password strength feedback
    const signupPasswordInput = document.getElementById('signup-password');
    const passwordFeedbackEl = document.getElementById('signup-password-feedback');
    if (signupPasswordInput && passwordFeedbackEl) {
      signupPasswordInput.addEventListener('input', () => {
        const val = signupPasswordInput.value;
        if (!val) {
          passwordFeedbackEl.textContent = '';
          passwordFeedbackEl.className = 'password-feedback';
          return;
        }

        const common = ['123456', 'password', '12345678', 'qwerty', '123456789', 'password123', 'admin123'];
        if (common.includes(val.toLowerCase())) {
          passwordFeedbackEl.textContent = '❌ Weak: This password is too common.';
          passwordFeedbackEl.className = 'password-feedback weak';
          return;
        }

        if (val.length < 8) {
          passwordFeedbackEl.textContent = `⚠️ Weak: Too short (minimum 8 characters). Current: ${val.length}/8`;
          passwordFeedbackEl.className = 'password-feedback weak';
          return;
        }

        let score = 0;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        if (score === 0) {
          passwordFeedbackEl.textContent = '⚠️ Weak: Try adding numbers, uppercase, or special characters.';
          passwordFeedbackEl.className = 'password-feedback weak';
        } else if (score < 3) {
          passwordFeedbackEl.textContent = '🟡 Medium: Good, but add special characters or uppercase for extra strength.';
          passwordFeedbackEl.className = 'password-feedback medium';
        } else {
          passwordFeedbackEl.textContent = '💚 Strong password.';
          passwordFeedbackEl.className = 'password-feedback strong';
        }
      });
    }

    // 2. Handle Signup Submission (Email + Password)
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(signupForm);

      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-confirm-password').value;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showFormError(signupForm, "Please enter a valid email address.");
        return;
      }
      if (password.length < 8) {
        showFormError(signupForm, "Password must be at least 8 characters.");
        return;
      }
      const commonPasswords = ['123456', 'password', '12345678', 'qwerty', '123456789', 'password123', 'admin123'];
      if (commonPasswords.includes(password.toLowerCase())) {
        showFormError(signupForm, "This password is too common. Please choose a different one.");
        return;
      }
      if (password !== confirmPassword) {
        showFormError(signupForm, "Passwords do not match.");
        return;
      }

      const result = await window.FocusStorage.registerUser(email, password);
      if (result !== true) {
        showFormError(signupForm, result.details || "Registration failed.");
      }
    });

    // 3. Handle Login Submission (Email + Password)
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormErrors(loginForm);

      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showFormError(loginForm, "Please enter a valid email address.");
        return;
      }

      const result = await window.FocusStorage.loginUser(email, password);
      if (result !== true) {
        showFormError(loginForm, result.details || "Invalid email or password.");
      }
    });

    // Forgot Password Trigger
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        clearFormErrors(loginForm);

        const email = document.getElementById('login-email').value.trim();
        if (!email) {
          showFormError(loginForm, "Please enter your email address first so we can send a reset link.");
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          showFormError(loginForm, "Please enter a valid email address.");
          return;
        }

        try {
          await sendPasswordResetEmail(auth, email);
          showFormSuccess(loginForm, "Password reset email sent! Check your inbox.");
        } catch (error) {
          console.error("Forgot password reset failed:", error);
          showFormError(loginForm, `Failed to send reset email: ${error.message || String(error)}`);
        }
      });
    }

    // 4. Handle Google Sign-In click
    googleBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
          await signInWithPopup(auth, provider);
        } catch (e) {
          console.error("Google Sign-in failed:", e);
          const activeForm = signupForm.classList.contains('hidden') ? loginForm : signupForm;
          showFormError(activeForm, `Google sign-in failed: ${e.message}`);
        }
      });
    });

    // 5. Handle Logout Button
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await window.FocusStorage.logout();
      toggleView(false);
      loginForm.reset();
      signupForm.reset();
      if (typeof onLogout === 'function') onLogout();
    });

    // 6. Handle Guest Login buttons
    guestBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        window.FocusStorage.loginGuest();
        updateActiveUserLayout('Guest');
        toggleView(true);
        if (typeof onLogin === 'function') onLogin('Guest');
      });
    });

    // 7. Error state Logout handler
    if (errorLogoutBtn) {
      errorLogoutBtn.addEventListener('click', async () => {
        loadingOverlay.classList.remove('active');
        await window.FocusStorage.logout();
      });
    }

    // 8. Core Auth State Listener
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Authenticated user path
        loadingOverlay.classList.add('active');
        loadingState.classList.remove('hidden');
        errorState.classList.add('hidden');

        try {
          // If they signed up/logged in from guest mode, migrate their local guest data
          if (window.FocusStorage.isGuest()) {
            await window.FocusStorage.migrateGuestDataToFirestore(user.uid);
          }

          // Fetch all Firestore documents and setup live listener triggers
          window.FocusStorage.setupFirestoreListeners(
            user.uid,
            () => {
              // Successfully connected and synced cache
              loadingOverlay.classList.remove('active');
              updateActiveUserLayout(user.email);
              toggleView(true);
              if (typeof onLogin === 'function') onLogin(user.email);
            },
            (error) => {
              // Failed loading data (Firestore Security Rules, credentials, or offline)
              loadingState.classList.add('hidden');
              errorState.classList.remove('hidden');
              errorMessage.textContent = `Sync Error: ${error.message || String(error)}`;
            }
          );
        } catch (e) {
          console.error("Auth state synchronization handler failed:", e);
          loadingState.classList.add('hidden');
          errorState.classList.remove('hidden');
          errorMessage.textContent = `Init Error: ${e.message || String(e)}`;
        }
      } else {
        // Unauthenticated user path
        if (window.FocusStorage.isGuest()) {
          // Keep active guest session
          updateActiveUserLayout('Guest');
          toggleView(true);
          if (typeof onLogin === 'function') onLogin('Guest');
        } else {
          // No active guest mode: push to Auth forms view
          updateActiveUserLayout(null);
          toggleView(false);
          if (typeof onLogout === 'function') onLogout();
        }
      }
    });
  }

  // Export to Global Namespace
  window.FocusAuth = {
    initAuth
  };
})();
