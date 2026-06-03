/**
 * GenFocus Daily Goal Module
 * Tracks daily focus sessions completed vs a user-configured goal.
 * Persists the goal per-user in localStorage.
 * Today's completion count is derived from the sessions log (no double storage).
 */

(function () {
  // ── Storage helpers ─────────────────────────────────────────────────────────

  function goalKey() {
    const user = window.FocusStorage.getCurrentUser();
    return user && user !== 'Guest'
      ? `genfocus_${user.toLowerCase()}_dailygoal`
      : 'genfocus_guest_dailygoal';
  }

  function goalStore() {
    return (window.FocusStorage.isGuest && window.FocusStorage.isGuest())
      ? sessionStorage
      : localStorage;
  }

  function getGoal() {
    const raw = goalStore().getItem(goalKey());
    const parsed = parseInt(raw, 10);
    return !isNaN(parsed) && parsed >= 1 ? parsed : 4;
  }

  function setGoal(n) {
    const val = Math.max(1, Math.min(24, parseInt(n, 10) || 4));
    goalStore().setItem(goalKey(), String(val));
    refreshGoalUI();

    // Sync to Firestore
    const user = window.FocusStorage.getCurrentUser();
    if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ dailyGoal: val })
        .catch(e => console.error('Error syncing daily goal to Firestore:', e));
    }
  }

  // ── Today count ─────────────────────────────────────────────────────────────

  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getTodayCount() {
    try {
      const sessions = window.FocusStorage.getSessions();
      const today = getTodayString();
      return sessions.filter(s => {
        const sd = new Date(s.date);
        const ds = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, '0')}-${String(sd.getDate()).padStart(2, '0')}`;
        return ds === today;
      }).length;
    } catch (_) {
      return 0;
    }
  }

  // ── UI Update ───────────────────────────────────────────────────────────────

  function refreshGoalUI() {
    const goal    = getGoal();
    const count   = getTodayCount();
    const clamped = Math.min(count, goal);
    const pct     = goal > 0 ? Math.round((clamped / goal) * 100) : 0;

    const countEl = document.getElementById('daily-goal-count');
    const fillEl  = document.getElementById('daily-goal-bar-fill');

    if (countEl) countEl.textContent = `${clamped} of ${goal} sessions today`;
    if (fillEl)  fillEl.style.width  = `${pct}%`;

    const ringFillEl = document.getElementById('daily-goal-ring-fill');
    if (ringFillEl) {
      const radius = 15;
      const circumference = 2 * Math.PI * radius;
      const ringOffset = circumference - (clamped / goal) * circumference;
      ringFillEl.style.strokeDashoffset = ringOffset;
    }

    // Sync settings input if it exists
    const settingsInput = document.getElementById('settings-daily-goal');
    if (settingsInput) settingsInput.value = goal;

    // Trigger celebration when goal is exactly hit (not exceeded) — calm glow + ripple
    if (count === goal && goal > 0) {
      const timerSection = document.getElementById('view-timer');
      if (timerSection && !timerSection.classList.contains('goal-achieved')) {
        timerSection.classList.add('goal-achieved');
        // Remove the class after the animation ends so it can retrigger if needed
        setTimeout(() => timerSection.classList.remove('goal-achieved'), 8000);
      }
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────

  window.FocusGoal = {
    getGoal,
    setGoal,
    getTodayCount,
    refreshGoalUI
  };
})();
