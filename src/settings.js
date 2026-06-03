/**
 * GenFocus Settings Module
 * Manages timer config inputs, tag CRUD actions, and user profile selectors.
 */

(function() {
  // DOM Elements
  const focusInput = document.getElementById('settings-focus');
  const shortBreakInput = document.getElementById('settings-short-break');
  const longBreakInput = document.getElementById('settings-long-break');
  const dailyGoalInput = document.getElementById('settings-daily-goal');
  const applyDurationsBtn = document.getElementById('save-durations-btn');

  const createTagForm = document.getElementById('create-tag-form');
  const tagNameInput = document.getElementById('tag-name-input');
  const tagColorInput = document.getElementById('tag-color-input');
  const settingsTagsList = document.getElementById('settings-tags-list');

  const profileSelect = document.getElementById('profile-select');
  const switchProfileBtn = document.getElementById('switch-profile-btn');

  // Callbacks
  let settingsChangedCallback = null;
  let profileSwitchCallback = null;

  /**
   * Creates and shows a premium floating toast alert
   * @param {string} message 
   * @param {string} type 'success' | 'error'
   */
  function showToast(message, type = 'success') {
    const existing = document.querySelectorAll('.flow-toast');
    existing.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'flow-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${type === 'success' ? 'rgba(20, 184, 166, 0.9)' : 'rgba(239, 68, 68, 0.9)'};
      color: #fff;
      padding: 0.85rem 1.75rem;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      z-index: 2000;
      animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      backdrop-filter: blur(10px);
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 500);
    }, 3500);
  }

  /**
   * Populate duration parameters from active user settings
   */
  function loadDurations() {
    const config = window.FocusStorage.getSettings();
    focusInput.value = config.focus;
    shortBreakInput.value = config.shortBreak;
    longBreakInput.value = config.longBreak;
    // Sync daily goal input
    if (dailyGoalInput && window.FocusGoal) {
      dailyGoalInput.value = window.FocusGoal.getGoal();
    }
  }

  /**
   * Populate target profile usernames dropdown
   */
  function loadProfiles() {
    profileSelect.innerHTML = '';
    const currentUser = window.FocusStorage.getCurrentUser();
    const allUsers = window.FocusStorage.getUsers();
    
    allUsers.forEach(username => {
      const opt = document.createElement('option');
      opt.value = username;
      opt.textContent = username + (username.toLowerCase() === currentUser?.toLowerCase() ? ' (Current)' : '');
      opt.selected = username.toLowerCase() === currentUser?.toLowerCase();
      profileSelect.appendChild(opt);
    });
  }

  /**
   * Render complete tag CRUD rows inside settings
   */
  function renderTagsCRUD() {
    settingsTagsList.innerHTML = '';
    const tags = window.FocusStorage.getTags();
    
    tags.forEach(tag => {
      const row = document.createElement('div');
      row.className = 'settings-tag-item';
      
      const infoBlock = document.createElement('div');
      infoBlock.className = 'tag-info-block';
      
      const dot = document.createElement('span');
      dot.className = 'settings-tag-dot';
      dot.style.setProperty('--tag-color', tag.color);
      
      const label = document.createElement('span');
      label.className = 'tag-name-label';
      label.textContent = tag.name + (tag.isDefault ? ' (Preset)' : '');
      
      infoBlock.appendChild(dot);
      infoBlock.appendChild(label);
      
      const actions = document.createElement('div');
      actions.className = 'tag-actions';
      
      // Edit Rename Button
      const editBtn = document.createElement('button');
      editBtn.className = 'tag-action-btn edit';
      editBtn.title = 'Rename Tag';
      editBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
      `;
      editBtn.addEventListener('click', () => {
        const newName = prompt(`Rename tag "${tag.name}" to:`, tag.name);
        if (newName !== null) {
          const trimmed = newName.trim();
          if (!trimmed) {
            showToast("Tag name cannot be empty", "error");
            return;
          }
          
          const allTags = window.FocusStorage.getTags();
          const duplicate = allTags.some(t => t.id !== tag.id && t.name.toLowerCase() === trimmed.toLowerCase());
          if (duplicate) {
            showToast("A tag with this name already exists", "error");
            return;
          }
          
          const updatedTags = allTags.map(t => {
            if (t.id === tag.id) {
              return { ...t, name: trimmed };
            }
            return t;
          });
          window.FocusStorage.saveTags(updatedTags);
          renderTagsCRUD();
          
          if (typeof settingsChangedCallback === 'function') {
            settingsChangedCallback('tags');
          }
          showToast("Tag successfully renamed");
        }
      });
      
      actions.appendChild(editBtn);
      
      // Delete Button (only if custom tag)
      if (!tag.isDefault) {
        const delBtn = document.createElement('button');
        delBtn.className = 'tag-action-btn delete';
        delBtn.title = 'Delete Custom Tag';
        delBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        `;
        delBtn.addEventListener('click', () => {
          if (confirm(`Delete the custom tag "${tag.name}"? Sessions already completed using this tag will retain its logs.`)) {
            const success = window.FocusStorage.deleteTag(tag.id);
            if (success) {
              renderTagsCRUD();
              if (typeof settingsChangedCallback === 'function') {
                settingsChangedCallback('tags');
              }
              showToast("Tag successfully deleted");
            }
          }
        });
        actions.appendChild(delBtn);
      }
      
      row.appendChild(infoBlock);
      row.appendChild(actions);
      settingsTagsList.appendChild(row);
    });
  }

  function loadFirebaseConfig() {
    // Update status badge
    const statusBadge = document.getElementById('firebase-status-badge');
    if (statusBadge) {
      const statusText = statusBadge.querySelector('.status-text');
      if (window.FocusFirebase.isConnected) {
        statusBadge.className = 'firebase-status-badge status-connected';
        if (statusText) statusText.textContent = 'Cloud Sync Connected';
      } else {
        statusBadge.className = 'firebase-status-badge status-disconnected';
        if (statusText) statusText.textContent = 'Local-Only Mode';
      }
    }
  }

  function refreshSettingsView() {
    loadDurations();
    renderTagsCRUD();
    loadProfiles();
    loadFirebaseConfig();
  }

  function initSettings(callbacks = {}) {
    settingsChangedCallback = callbacks.onSettingsChanged;
    profileSwitchCallback = callbacks.onProfileSwitch;
    
    // 1. Duration Form Apply
    applyDurationsBtn.addEventListener('click', () => {
      const focusVal = parseInt(focusInput.value, 10);
      const shortVal = parseInt(shortBreakInput.value, 10);
      const longVal = parseInt(longBreakInput.value, 10);
      
      if (isNaN(focusVal) || focusVal < 1 || focusVal > 180) {
        showToast("Focus duration must be between 1 and 180 minutes", "error");
        return;
      }
      if (isNaN(shortVal) || shortVal < 1 || shortVal > 60) {
        showToast("Short break must be between 1 and 60 minutes", "error");
        return;
      }
      if (isNaN(longVal) || longVal < 1 || longVal > 120) {
        showToast("Long break must be between 1 and 120 minutes", "error");
        return;
      }
      
      const settings = {
        focus: focusVal,
        shortBreak: shortVal,
        longBreak: longVal
      };

      window.FocusStorage.saveSettings(settings);

      // Also save daily goal
      if (dailyGoalInput && window.FocusGoal) {
        const goalVal = parseInt(dailyGoalInput.value, 10);
        if (!isNaN(goalVal) && goalVal >= 1 && goalVal <= 24) {
          window.FocusGoal.setGoal(goalVal);
        }
      }

      showToast('Settings applied successfully');

      if (typeof settingsChangedCallback === 'function') {
        settingsChangedCallback('durations');
      }
    });
    
    // 2. Custom tag creation submission
    createTagForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = tagNameInput.value.trim();
      const color = tagColorInput.value;
      
      if (!name) return;
      
      const newTag = window.FocusStorage.addTag(name, color);
      if (newTag) {
        createTagForm.reset();
        tagColorInput.value = '#a855f7';
        
        renderTagsCRUD();
        
        if (typeof settingsChangedCallback === 'function') {
          settingsChangedCallback('tags');
        }
        showToast(`Custom tag "${name}" created`);
      } else {
        showToast("A tag with this name already exists", "error");
      }
    });
    
    // 3. User profile switching triggers
    switchProfileBtn.addEventListener('click', () => {
      const targetUser = profileSelect.value;
      const currentUser = window.FocusStorage.getCurrentUser();
      
      if (targetUser.toLowerCase() === currentUser?.toLowerCase()) {
        showToast("Profile already active", "error");
        return;
      }
      
      if (confirm(`Switch profile to "${targetUser}"? This will log you out of the current profile.`)) {
        window.FocusStorage.logout();
        
        const loginUserField = document.getElementById('login-username');
        if (loginUserField) {
          loginUserField.value = targetUser;
        }
        
        if (typeof profileSwitchCallback === 'function') {
          profileSwitchCallback();
        }
        showToast(`Logged out. Please enter credentials for "${targetUser}"`);
      }
    });
    
    // 4. Settings Logout Button trigger
    const settingsLogoutBtn = document.getElementById('settings-logout-btn');
    if (settingsLogoutBtn) {
      settingsLogoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out of GenFocus?')) {
          const mainLogoutBtn = document.getElementById('logout-btn');
          if (mainLogoutBtn) mainLogoutBtn.click();
        }
      });
    }



    // Initial population
    refreshSettingsView();
  }

  // Export to Global Namespace
  window.FocusSettings = {
    initSettings,
    refreshSettingsView,
    showToast
  };
})();
