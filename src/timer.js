/**
 * GenFocus Pomodoro Timer Engine
 * Handles counting state, responsive progress ring, visual pulsing updates,
 * audio chime synthesis, and logs focus session completion.
 */

(function() {
  // DOM Elements
  const timerCountdown = document.getElementById('timer-countdown');
  const timerStatus = document.getElementById('timer-status');
  const progressRingBar = document.querySelector('.progress-ring__bar');
  const viewTimerSection = document.getElementById('view-timer');
  const toggleBtn = document.getElementById('toggle-timer-btn');
  const resetBtn = document.getElementById('reset-timer-btn');
  const skipBtn = document.getElementById('skip-timer-btn');
  const cycleCountDisplay = document.getElementById('cycle-count-display');
  const timerTagContainer = document.getElementById('timer-tag-container');
  const noteModal = document.getElementById('note-modal');
  const noteForm = document.getElementById('note-modal-form');
  const noteInput = document.getElementById('session-note-input');
  const skipNoteBtn = document.getElementById('skip-note-btn');

  // Timer Internal State
  let mode = 'focus';
  let state = 'idle';
  let timeLeft = 25 * 60;
  let totalDuration = 25 * 60;
  let cycleCount = 1;
  let selectedTag = null;
  let intervalId = null;

  // Callbacks
  let stateChangeCallback = null;
  let sessionLoggedCallback = null;

  /**
   * Web Audio API Dual Synth Chime Generator
   */
  function playChime(isSessionComplete = true) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const playNote = (frequency, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = audioCtx.currentTime;
      if (isSessionComplete) {
        playNote(523.25, now, 0.45);        // C5
        playNote(659.25, now + 0.12, 0.45);  // E5
        playNote(783.99, now + 0.24, 0.6);   // G5
      } else {
        playNote(587.33, now, 0.5);         // D5
        playNote(880.00, now + 0.15, 0.65);  // A5
      }
    } catch (error) {
      console.warn('Web Audio synthesis failed or browser blocked sound initialization:', error);
    }
  }

  /**
   * Render standard tags list in the selector tray
   */
  function renderTagsSelector() {
    timerTagContainer.innerHTML = '';
    const tags = window.FocusStorage.getTags();
    
    // Add default "No tag" option
    const allTags = [
      { id: 'tag-none', name: 'No tag (general focus)', color: '#64748b' },
      ...tags
    ];
    
    if (!selectedTag || !allTags.some(t => t.id === selectedTag.id)) {
      selectedTag = allTags[0];
    }
    
    allTags.forEach(tag => {
      const pill = document.createElement('button');
      pill.className = `tag-pill ${selectedTag && selectedTag.id === tag.id ? 'active' : ''}`;
      pill.dataset.id = tag.id;
      pill.style.setProperty('--accent-color', tag.color);
      
      const dot = document.createElement('span');
      dot.className = 'tag-color-dot';
      dot.style.setProperty('--tag-color', tag.color);
      
      const name = document.createElement('span');
      name.textContent = tag.name;
      
      pill.appendChild(dot);
      pill.appendChild(name);
      
      pill.addEventListener('click', () => {
        document.querySelectorAll('.tag-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        selectedTag = tag;
      });
      
      timerTagContainer.appendChild(pill);
    });
  }

  /**
   * Dynamic calculation of the responsive SVG circle ring offset
   */
  function updateProgressRing() {
    if (!progressRingBar) return;
    
    const radius = progressRingBar.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;
    
    progressRingBar.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const fraction = timeLeft / totalDuration;
    const offset = circumference - (fraction * circumference);
    
    progressRingBar.style.strokeDashoffset = offset;
  }

  /**
   * Sync numeric timer digits and update browser tab title
   */
  function updateTimerDisplay() {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const displayString = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    timerCountdown.textContent = displayString;
    updateProgressRing();
    
    document.title = state === 'running'
      ? displayString
      : 'GenFocus';

    const hintEl = document.getElementById('timer-idle-hint');
    if (hintEl) {
      if (state === 'idle' && mode === 'focus') {
        hintEl.classList.remove('hidden');
      } else {
        hintEl.classList.add('hidden');
      }
    }
  }

  /**
   * Update the timer subtitle dynamically based on state and mode
   */
  function updateStatusText() {
    if (state === 'idle') {
      if (mode === 'focus') {
        timerStatus.textContent = 'Press Start Session to begin';
      } else if (mode === 'shortBreak') {
        timerStatus.textContent = 'Press Start Break to begin';
      } else if (mode === 'longBreak') {
        timerStatus.textContent = 'Press Start Break to begin';
      }
    } else if (state === 'running') {
      if (mode === 'focus') {
        timerStatus.textContent = 'Focusing...';
      } else if (mode === 'shortBreak') {
        timerStatus.textContent = 'Short Rest active';
      } else if (mode === 'longBreak') {
        timerStatus.textContent = 'Long Rest active';
      }
    } else if (state === 'paused') {
      timerStatus.textContent = 'Session Paused';
    }
  }

  /**
   * Set active timer mode and fetch correct durations from storage
   */
  function setMode(newMode) {
    mode = newMode;
    state = 'idle';
    
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    
    const settings = window.FocusStorage.getSettings();
    
    if (mode === 'focus') {
      timeLeft = settings.focus * 60;
      viewTimerSection.className = 'view-section active accent-focus';
    } else if (mode === 'shortBreak') {
      timeLeft = settings.shortBreak * 60;
      viewTimerSection.className = 'view-section active accent-shortBreak';
    } else if (mode === 'longBreak') {
      timeLeft = settings.longBreak * 60;
      viewTimerSection.className = 'view-section active accent-longBreak';
    }
    
    totalDuration = timeLeft;
    
    document.querySelectorAll('.mode-pill').forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    toggleBtn.textContent = mode === 'focus' ? 'Start Session' : 'Start Break';
    toggleBtn.className = 'btn btn-primary btn-large';
    viewTimerSection.classList.remove('timer-running');
    viewTimerSection.classList.remove('timer-paused');
    
    updateTimerDisplay();
    updateStatusText();
    
    if (typeof stateChangeCallback === 'function') {
      stateChangeCallback({ mode, state, timeLeft, totalDuration });
    }
  }

  /**
   * Increments Pomodoro Cycle count and updates layout text
   */
  function updateCycleDisplay() {
    cycleCountDisplay.textContent = `Session ${cycleCount} of 4`;
  }

  /**
   * Toggles Timer state (start/pause)
   */
  function toggleTimer() {
    if (state === 'running') {
      state = 'paused';
      clearInterval(intervalId);
      intervalId = null;
      toggleBtn.textContent = 'Resume';
      viewTimerSection.classList.remove('timer-running');
      viewTimerSection.classList.add('timer-paused');
    } else {
      state = 'running';
      toggleBtn.textContent = 'Pause';
      viewTimerSection.classList.add('timer-running');
      viewTimerSection.classList.remove('timer-paused');
      
      intervalId = setInterval(tick, 1000);
    }
    
    updateStatusText();
    
    if (typeof stateChangeCallback === 'function') {
      stateChangeCallback({ mode, state, timeLeft, totalDuration });
    }
  }

  /**
   * Ticks timer backward by 1 second
   */
  function tick() {
    if (timeLeft > 0) {
      timeLeft--;
      updateTimerDisplay();
    } else {
      clearInterval(intervalId);
      intervalId = null;
      handleTimerCompletion();
    }
  }

  /**
   * Triggered when a countdown hits 00:00
   */
  function handleTimerCompletion() {
    if (mode === 'focus') {
      playChime(true);
      // Fire focus-complete notification
      if (window.FocusNotifications) window.FocusNotifications.notifyFocusComplete();

      noteInput.value = '';
      noteModal.classList.add('active');

      state = 'idle';
    } else {
      playChime(false);
      // Fire break-complete notification
      if (window.FocusNotifications) window.FocusNotifications.notifyBreakComplete();
      setMode('focus');
      
      const settings = window.FocusStorage.getSettings();
      if (settings.autoStart) {
        toggleTimer();
      }
    }
  }

  /**
   * Form logger submission inside completed session popup
   */
  function handleLogSession(noteText) {
    const loggedNote = noteText.trim(); // keep empty string if no note — don't fabricate text

    const sessionEntry = {
      date: new Date().toISOString(),
      duration: totalDuration,
      tagId: selectedTag ? selectedTag.id : 'tag-study',
      tagName: selectedTag ? selectedTag.name : 'Study',
      tagColor: selectedTag ? selectedTag.color : '#14b8a6',
      note: loggedNote
    };

    window.FocusStorage.saveSession(sessionEntry);

    // Notify PWA module that a session has been successfully logged
    if (window.FocusPWA && window.FocusPWA.sessionCompleted) {
      window.FocusPWA.sessionCompleted();
    }

    noteModal.classList.remove('active');

    // Refresh daily goal progress bar immediately after logging
    if (window.FocusGoal) window.FocusGoal.refreshGoalUI();

    if (cycleCount >= 4) {
      cycleCount = 1;
      updateCycleDisplay();
      setMode('longBreak');
    } else {
      cycleCount++;
      updateCycleDisplay();
      setMode('shortBreak');
    }

    const settings = window.FocusStorage.getSettings();
    if (settings.autoStart) {
      toggleTimer();
    }

    if (typeof sessionLoggedCallback === 'function') {
      sessionLoggedCallback();
    }
  }

  /**
   * Reset active timer state
   */
  function resetTimer() {
    clearInterval(intervalId);
    intervalId = null;
    state = 'idle';
    
    const settings = window.FocusStorage.getSettings();
    if (mode === 'focus') {
      timeLeft = settings.focus * 60;
    } else if (mode === 'shortBreak') {
      timeLeft = settings.shortBreak * 60;
    } else {
      timeLeft = settings.longBreak * 60;
    }
    
    totalDuration = timeLeft;
    viewTimerSection.classList.remove('timer-running');
    viewTimerSection.classList.remove('timer-paused');
    toggleBtn.textContent = mode === 'focus' ? 'Start Session' : 'Start Break';
    
    updateTimerDisplay();
    updateStatusText();
    
    if (typeof stateChangeCallback === 'function') {
      stateChangeCallback({ mode, state, timeLeft, totalDuration });
    }
  }

  /**
   * Force skip the active session/break
   */
  function skipTimer() {
    clearInterval(intervalId);
    intervalId = null;
    
    if (mode === 'focus') {
      if (cycleCount >= 4) {
        cycleCount = 1;
        updateCycleDisplay();
        setMode('longBreak');
      } else {
        cycleCount++;
        updateCycleDisplay();
        setMode('shortBreak');
      }
    } else {
      setMode('focus');
    }
  }

  function refreshDurations() {
    if (state === 'idle') {
      setMode(mode);
    }
  }

  function resetCycleState() {
    cycleCount = 1;
    updateCycleDisplay();
  }

  function initTimer(callbacks = {}) {
    stateChangeCallback = callbacks.onStateChange;
    sessionLoggedCallback = callbacks.onSessionLogged;
    
    // 1. Mode Pill clicks
    document.querySelectorAll('.mode-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state === 'running' || state === 'paused') {
          if (confirm("Abandon active timer countdown?")) {
            setMode(btn.dataset.mode);
          }
        } else {
          setMode(btn.dataset.mode);
        }
      });
    });
    
    // 2. Play/Pause Trigger
    toggleBtn.addEventListener('click', toggleTimer);
    
    // 3. Reset Trigger
    resetBtn.addEventListener('click', () => {
      if (confirm("Reset current countdown timer?")) {
        resetTimer();
      }
    });
    
    // 4. Skip Trigger
    skipBtn.addEventListener('click', () => {
      if (confirm("Skip current timer countdown?")) {
        skipTimer();
      }
    });
    
    // 5. Modal Notes
    noteForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogSession(noteInput.value);
    });
    
    skipNoteBtn.addEventListener('click', () => {
      handleLogSession(''); // empty note — no text fabricated
    });

    // 6. Spacebar shortcut to start/pause timer
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
      );
      if (e.code === 'Space' && !isInput) {
        e.preventDefault(); // Prevent page scrolling
        toggleTimer();
      }
    });
    
    setMode('focus');
    updateCycleDisplay();
    renderTagsSelector();
  }

  // Export to Global Namespace
  window.FocusTimer = {
    initTimer,
    toggleTimer,
    resetTimer,
    skipTimer,
    setMode,
    refreshDurations,
    resetCycleState,
    renderTagsSelector
  };
})();
