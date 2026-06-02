/**
 * GenFocus Onboarding Module
 * Shows a 3-step modal on first launch for each user:
 *   Step 1 – Welcome splash
 *   Step 2 – Set daily focus goal (sessions/day)
 *   Step 3 – Customize durations (focus / short break / long break)
 * Persists completion with a per-user localStorage flag.
 */

(function () {
  const modal   = document.getElementById('onboarding-modal');
  const steps   = Array.from(document.querySelectorAll('.onboarding-step'));

  // Step navigation buttons
  const nextBtn1   = document.getElementById('onboarding-next-1');
  const nextBtn2   = document.getElementById('onboarding-next-2');
  const skipBtn2   = document.getElementById('onboarding-skip-2');
  const finishBtn  = document.getElementById('onboarding-finish');
  const skipBtn3   = document.getElementById('onboarding-skip-3');

  // Step 2 input
  const goalInput  = document.getElementById('onboarding-goal-input');

  // Step 3 inputs
  const focusInput = document.getElementById('onboarding-focus-input');
  const shortInput = document.getElementById('onboarding-short-input');
  const longInput  = document.getElementById('onboarding-long-input');

  let currentStep = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function onboardingKey() {
    const user = window.FocusStorage.getCurrentUser();
    return user ? `genfocus_${user.toLowerCase()}_onboarded` : null;
  }

  function isOnboarded() {
    const key = onboardingKey();
    return key ? localStorage.getItem(key) === 'true' : true;
  }

  function markOnboarded() {
    const key = onboardingKey();
    if (key) localStorage.setItem(key, 'true');
  }

  function showStep(index) {
    steps.forEach((s, i) => {
      s.classList.toggle('active', i === index);
    });
    currentStep = index;
  }

  function openModal() {
    // Pre-fill with current stored settings
    try {
      const settings = window.FocusStorage.getSettings();
      if (focusInput) focusInput.value = settings.focus   || 25;
      if (shortInput) shortInput.value = settings.shortBreak || 5;
      if (longInput)  longInput.value  = settings.longBreak  || 15;

      const goal = window.FocusGoal ? window.FocusGoal.getGoal() : 4;
      if (goalInput) goalInput.value = goal;
    } catch (_) { /* guest / no user – use defaults */ }

    showStep(0);
    modal.classList.add('active');
  }

  function closeModal() {
    modal.classList.remove('active');
    markOnboarded();
  }

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleNext1() {
    showStep(1);
  }

  function handleNext2() {
    const goal = parseInt(goalInput.value, 10);
    if (!isNaN(goal) && goal >= 1 && goal <= 20) {
      if (window.FocusGoal) window.FocusGoal.setGoal(goal);
    }
    showStep(2);
  }

  function handleSkip2() {
    showStep(2);
  }

  function handleFinish() {
    // Persist durations from step 3
    const focus = parseInt(focusInput.value, 10);
    const short = parseInt(shortInput.value, 10);
    const long  = parseInt(longInput.value, 10);

    const valid =
      !isNaN(focus) && focus >= 1 && focus <= 180 &&
      !isNaN(short) && short >= 1 && short <= 60  &&
      !isNaN(long)  && long  >= 1 && long  <= 120;

    if (valid) {
      window.FocusStorage.saveSettings({ focus, shortBreak: short, longBreak: long });
      // Keep the settings UI in sync
      if (window.FocusSettings) window.FocusSettings.refreshSettingsView();
      // Apply to live timer
      if (window.FocusTimer) window.FocusTimer.refreshDurations();
    }

    closeModal();
  }

  function handleSkip3() {
    closeModal();
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function initOnboarding() {
    if (nextBtn1)  nextBtn1.addEventListener('click', handleNext1);
    if (nextBtn2)  nextBtn2.addEventListener('click', handleNext2);
    if (skipBtn2)  skipBtn2.addEventListener('click', handleSkip2);
    if (finishBtn) finishBtn.addEventListener('click', handleFinish);
    if (skipBtn3)  skipBtn3.addEventListener('click', handleSkip3);

    // Show on first login only
    if (!isOnboarded()) {
      // Slight delay so the main view is fully visible first
      setTimeout(openModal, 400);
    }
  }

  // Export
  window.FocusOnboarding = {
    initOnboarding,
    openModal,   // callable from Settings "Reset Onboarding" if desired
    isOnboarded
  };
})();
