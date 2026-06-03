/**
 * GenFocus UI Coordinator Module
 * Manages view routing transitions, populates dynamic logs lists,
 * manages text searches & category filters, and links modules together.
 */

(function() {
  // DOM Elements
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const historyLogContainer = document.getElementById('history-log-container');
  const historySearch = document.getElementById('history-search');
  const historyTagFilter = document.getElementById('history-tag-filter');

  // Current View Tracker
  let activeView = 'timer';

  /**
   * Native Internationalized helper to format dates
   */
  function formatDate(dateString) {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      return dateString;
    }
  }

  /**
   * Native Internationalized helper to format times
   */
  function formatTime(dateString) {
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString(undefined, { 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    } catch (e) {
      return '';
    }
  }

  /**
   * Formats focus duration in seconds to rounded minutes
   */
  function formatDuration(durationSeconds) {
    const minutes = Math.round(durationSeconds / 60);
    return `${minutes} min`;
  }

  /**
   * Render history log list with active search/tag filters applied
   */
  function renderHistoryList() {
    historyLogContainer.innerHTML = '';

    const sessions = window.FocusStorage.getSessions();
    const searchQuery = historySearch.value.toLowerCase().trim();
    const selectedTagId = historyTagFilter.value;

    const filteredSessions = sessions.filter(session => {
      const noteText = (session.note || '').toLowerCase();
      const matchesSearch = searchQuery === '' ||
        noteText.includes(searchQuery) ||
        (session.tagName || '').toLowerCase().includes(searchQuery);
      const matchesTag = selectedTagId === 'all' || session.tagId === selectedTagId;
      return matchesSearch && matchesTag;
    });

    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredSessions.length === 0) {
      const isHistoryEmpty = sessions.length === 0;
      const message = isHistoryEmpty
        ? 'No sessions yet — your history will appear here after your first session.'
        : 'No focus sessions match your search or filters.';
      const iconMarkup = isHistoryEmpty
        ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
             <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
           </svg>`
        : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
             <circle cx="12" cy="12" r="10"></circle>
             <line x1="8" y1="12" x2="16" y2="12"></line>
           </svg>`;

      historyLogContainer.innerHTML = `
        <div class="empty-state">
          ${iconMarkup}
          <p>${message}</p>
        </div>`;
      return;
    }

    filteredSessions.forEach(session => {
      const card = document.createElement('div');
      card.className = 'history-entry';

      // Tag badge
      const badgeWrapper = document.createElement('div');
      const badge = document.createElement('div');
      badge.className = 'history-tag-badge';
      badge.style.setProperty('--tag-color', session.tagColor);
      badge.style.boxShadow = `0 2px 10px ${session.tagColor}22`;

      const dot = document.createElement('span');
      dot.className = 'tag-color-dot';
      dot.style.setProperty('--tag-color', session.tagColor);

      badge.appendChild(dot);
      badge.appendChild(document.createTextNode(session.tagName));
      badgeWrapper.appendChild(badge);

      // Details column
      const details = document.createElement('div');
      details.className = 'history-details';

      const date = document.createElement('div');
      date.className = 'history-date';
      date.textContent = formatDate(session.date);
      details.appendChild(date);

      // Expandable note — only shown when a non-empty note exists
      const noteText = (session.note || '').trim();
      if (noteText) {
        const noteToggle = document.createElement('button');
        noteToggle.className = 'history-note-toggle';
        noteToggle.setAttribute('aria-expanded', 'false');
        noteToggle.innerHTML = `
          <span class="note-toggle-label">Note</span>
          <svg class="chevron-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>`;

        const noteBody = document.createElement('div');
        noteBody.className = 'history-note-body';
        noteBody.textContent = noteText;

        noteToggle.addEventListener('click', () => {
          const expanded = noteToggle.getAttribute('aria-expanded') === 'true';
          noteToggle.setAttribute('aria-expanded', String(!expanded));
          noteBody.classList.toggle('open', !expanded);
          noteToggle.querySelector('.chevron-icon').classList.toggle('rotated', !expanded);
        });

        details.appendChild(noteToggle);
        details.appendChild(noteBody);
      }

      // Meta column (duration + time)
      const meta = document.createElement('div');
      meta.className = 'history-meta';

      const duration = document.createElement('div');
      duration.className = 'history-duration';
      duration.textContent = formatDuration(session.duration);

      const time = document.createElement('div');
      time.className = 'history-time';
      time.textContent = formatTime(session.date);

      meta.appendChild(duration);
      meta.appendChild(time);

      card.appendChild(badgeWrapper);
      card.appendChild(details);
      card.appendChild(meta);

      historyLogContainer.appendChild(card);
    });
  }

  /**
   * Populates tag categories dropdown options in History filter
   */
  function refreshHistoryTagFilters() {
    const previousSelection = historyTagFilter.value;
    historyTagFilter.innerHTML = '<option value="all">All Tags</option>';
    
    const tags = window.FocusStorage.getTags();
    tags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag.id;
      opt.textContent = tag.name;
      if (tag.id === previousSelection) {
        opt.selected = true;
      }
      historyTagFilter.appendChild(opt);
    });
  }

  /**
   * Handle Single Page View swapping routing transitions
   */
  function navigateToView(targetViewName) {
    activeView = targetViewName;
    
    navItems.forEach(item => {
      if (item.dataset.target === activeView) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    viewSections.forEach(section => {
      if (section.id === `view-${activeView}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });
    
    if (activeView === 'history') {
      refreshHistoryTagFilters();
      renderHistoryList();
    } else if (activeView === 'dashboard') {
      window.FocusDashboard.refreshDashboard();
    } else if (activeView === 'settings') {
      window.FocusSettings.refreshSettingsView();
    }
  }

  function initUI() {
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navigateToView(item.dataset.target);
      });
    });
    
    historySearch.addEventListener('input', renderHistoryList);
    historyTagFilter.addEventListener('change', renderHistoryList);
    
    navigateToView('timer');
  }

  // Export to Global Namespace
  window.FocusUI = {
    initUI,
    navigateToView,
    renderHistoryList,
    refreshHistoryTagFilters
  };
})();
