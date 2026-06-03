/**
 * GenFocus Core Bootstrap Application Entrypoint
 * ────────────────────────────────────────────────
 * Single ES-module entry point. Imports every sub-module in strict
 * dependency order so Vite's module graph guarantees they are all
 * defined on `window.*` before `DOMContentLoaded` fires.
 *
 * Load chain:
 *   firebase → storage → goal → notifications → onboarding
 *   → dashboard → settings → timer → ui → auth → this file (boot)
 */

// ── 1. Side-effect imports – each IIFE registers its window.Focus* global ───
import './src/storage.js';     // window.FocusStorage  (depends on firebase)
import './src/goal.js';        // window.FocusGoal     (depends on FocusStorage)
import './src/notifications.js'; // window.FocusNotifications
import './src/onboarding.js';  // window.FocusOnboarding
import './src/dashboard.js';   // window.FocusDashboard
import './src/settings.js';    // window.FocusSettings
import './src/timer.js';       // window.FocusTimer
import './src/ui.js';          // window.FocusUI
import './src/auth.js';        // window.FocusAuth     (depends on firebase)

// ── 2. Application boot ─────────────────────────────────────────────────────

(function () {
  let isInitialized = false;

  /**
   * Handle Profile Login Success Initializations
   * @param {string} username the authenticated email or 'Guest'
   */
  function handleLogin(username) {
    const { initUI, navigateToView, refreshHistoryTagFilters, renderHistoryList } = window.FocusUI;
    const { initTimer, renderTagsSelector, refreshDurations, resetCycleState, resetTimer } = window.FocusTimer;
    const { initSettings, refreshSettingsView } = window.FocusSettings;
    const { refreshDashboard } = window.FocusDashboard;

    if (!isInitialized) {
      // 1. Initialize UI Navigation routing transitions
      initUI();

      // 2. Initialize Pomodoro Engine and logging callbacks
      initTimer({
        onStateChange: (stateInfo) => {
          // Hook for ambient UI changes / notification state
        },
        onSessionLogged: () => {
          // Real-time refresh of stats and history after a session is logged
          refreshDashboard();
          renderHistoryList();
        }
      });

      // 3. Initialize Settings CRUD tags manager
      initSettings({
        onSettingsChanged: (changeType) => {
          if (changeType === 'durations') {
            refreshDurations();
          } else if (changeType === 'tags') {
            renderTagsSelector();
            refreshHistoryTagFilters();
          }
        },
        onProfileSwitch: () => {
          // Firebase handles identity via onAuthStateChanged
        }
      });

      // 4. Initialize Notifications (bind toggle listener)
      if (window.FocusNotifications) {
        window.FocusNotifications.initNotifications();
      }

      isInitialized = true;
    } else {
      // Re-entrant login (e.g. Firebase token refresh):
      // Refresh UI to reflect fresh Firestore data without resetting the timer
      renderTagsSelector();
      refreshSettingsView();
      refreshHistoryTagFilters();

      if (window.FocusNotifications) window.FocusNotifications.syncToggleUI();
    }

    // Refresh daily goal bar for the logged-in user
    if (window.FocusGoal) window.FocusGoal.refreshGoalUI();

    // Show onboarding for first-time users
    if (window.FocusOnboarding) window.FocusOnboarding.initOnboarding();

    // Force land on Timer Main Screen upon login
    navigateToView('timer');
  }

  /**
   * Handle Profile Logout Cleanses
   */
  function handleLogout() {
    // Reset initialization state so re-login fully re-bootstraps
    isInitialized = false;

    // Stop active timer if running
    if (window.FocusTimer) {
      window.FocusTimer.resetTimer();
      window.FocusTimer.resetCycleState();
    }
  }

  function boot() {
    // Register Service Worker for PWA / offline + push notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js').catch(err => {
        console.warn('GenFocus SW registration failed:', err);
      });
    }

    window.FocusAuth.initAuth({
      onLogin: handleLogin,
      onLogout: handleLogout
    });
  }

  // Boot application upon DOM Ready or immediately if already interactive/complete
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
