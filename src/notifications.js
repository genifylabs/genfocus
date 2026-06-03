/**
 * GenFocus Notifications Module
 * Wraps the Web Notifications API.
 * - Requests permission only when the user enables the toggle.
 * - Fires a notification when a focus session or break completes.
 * - Persists the enabled/disabled preference per-user in localStorage.
 */

(function () {
  // ── Storage helpers ─────────────────────────────────────────────────────────

  function prefKey() {
    const user = window.FocusStorage.getCurrentUser();
    return (user && user !== 'Guest')
      ? `genfocus_${user.toLowerCase()}_notifications`
      : 'genfocus_guest_notifications';
  }

  function notifStore() {
    return (window.FocusStorage.isGuest && window.FocusStorage.isGuest())
      ? sessionStorage
      : localStorage;
  }

  function isEnabled() {
    return notifStore().getItem(prefKey()) === 'true';
  }

  function setEnabled(bool) {
    notifStore().setItem(prefKey(), bool ? 'true' : 'false');
    syncToggleUI();
  }

  // ── Permission helpers ──────────────────────────────────────────────────────

  function hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  /**
   * Ask for permission, then enable.
   * If the user denies it, revert the toggle.
   */
  async function requestAndEnable() {
    if (!('Notification' in window)) {
      showToastFallback('Notifications are not supported in this browser.');
      revertToggle(false);
      return;
    }

    if (Notification.permission === 'denied') {
      showToastFallback('Notification permission was denied. Please allow it in browser settings.');
      revertToggle(false);
      return;
    }

    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setEnabled(true);
    } else {
      showToastFallback('Notification permission not granted.');
      revertToggle(false);
    }
  }

  // ── Fire notification ───────────────────────────────────────────────────────

  /**
   * @param {string} title
   * @param {string} body
   */
  function notify(title, body = '') {
    if (!isEnabled() || !hasPermission()) return;

    try {
      const n = new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⏱</text></svg>',
        silent: false
      });
      // Auto-close after 6 s
      setTimeout(() => n.close(), 6000);
    } catch (e) {
      console.warn('FocusNotifications: could not fire notification', e);
    }
  }

  function notifyFocusComplete() {
    notify('Focus session complete! 🎉', 'Great work. Take a well-earned break.');
  }

  function notifyBreakComplete() {
    notify('Break over! ⏱', 'Time to get back in the zone.');
  }

  // ── Toggle UI sync ──────────────────────────────────────────────────────────

  function syncToggleUI() {
    const toggle = document.getElementById('settings-notifications');
    if (toggle) toggle.checked = isEnabled();
  }

  function revertToggle(state) {
    const toggle = document.getElementById('settings-notifications');
    if (toggle) toggle.checked = state;
    setEnabled(state);
  }

  // ── Fallback toast (re-use FocusSettings toast if available) ───────────────

  function showToastFallback(msg) {
    if (window.FocusSettings && window.FocusSettings.showToast) {
      window.FocusSettings.showToast(msg, 'error');
    } else {
      console.warn('FocusNotifications:', msg);
    }
  }

  // ── Init (bind toggle listener) ─────────────────────────────────────────────

  function initNotifications() {
    syncToggleUI();

    const toggle = document.getElementById('settings-notifications');
    if (!toggle) return;

    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        await requestAndEnable();
      } else {
        setEnabled(false);
      }
    });
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  window.FocusNotifications = {
    initNotifications,
    notify,
    notifyFocusComplete,
    notifyBreakComplete,
    isEnabled,
    syncToggleUI,
    requestAndEnable
  };
})();
