/**
 * GenFocus Core Bootstrap Application Entrypoint
 * Orchestrates modules, hooks event bindings, handles re-entrant profile initializations,
 * and maintains clean view isolation.
 */

(function() {
  let isInitialized = false;

  /**
   * Handle Profile Login Success Initializations
   * @param {string} username the authenticated profile
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
          // Can hook live notifications or ambient UI changes
        },
        onSessionLogged: () => {
          // Real-time update stats and history logs in background
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
          // Switching profiles completes logging out (handled by handleLogout)
        }
      });

      // 4. Initialize Notifications (bind toggle listener)
      if (window.FocusNotifications) {
        window.FocusNotifications.initNotifications();
      }

      isInitialized = true;
    } else {
      // Re-entrant profile switch: Clear active timer countdowns and reload scopes
      resetTimer();
      resetCycleState();

      // Refresh visual DOM collections with target profile's scopes
      renderTagsSelector();
      refreshSettingsView();
      refreshHistoryTagFilters();

      // Re-sync notification toggle for new user
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
    const { resetTimer, resetCycleState } = window.FocusTimer;
    // If timer is currently running, force kill
    resetTimer();
    resetCycleState();
  }

  // Boot application upon DOM Ready
  document.addEventListener('DOMContentLoaded', () => {
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
  });
})();
