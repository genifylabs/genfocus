/**
 * GenFocus Storage Module
 * Handles local-first multi-profile storage.
 * - Logged-in users: scoped to localStorage (persistent).
 * - Guest mode: scoped to sessionStorage (ephemeral, tab-scoped).
 * All keys use the `genfocus_` prefix.
 */

(function() {
  // Key Constants
  const KEYS = {
    USERS: 'genfocus_users',
    CURRENT_USER: 'genfocus_current_user',
    GUEST_MODE: 'genfocus_guest_mode',
  };

  // ── Guest Mode Helpers ──────────────────────────────────────────────────────

  // Preset Tags (defined early for loginGuest seeding)
  const PRESET_TAGS = [
    { id: 'tag-study', name: 'Study', color: '#14b8a6', isDefault: true },
    { id: 'tag-work', name: 'Work', color: '#9d5cff', isDefault: true },
    { id: 'tag-personal', name: 'Personal', color: '#2563eb', isDefault: true },
    { id: 'tag-health', name: 'Health', color: '#22c55e', isDefault: true }
  ];

  function isGuest() {
    return sessionStorage.getItem(KEYS.GUEST_MODE) === 'true';
  }

  function loginGuest() {
    sessionStorage.setItem(KEYS.GUEST_MODE, 'true');
    // Seed fresh guest data if not already present
    if (!sessionStorage.getItem('genfocus_guest_settings')) {
      sessionStorage.setItem('genfocus_guest_settings', JSON.stringify({ focus: 25, shortBreak: 5, longBreak: 15 }));
    }
    if (!sessionStorage.getItem('genfocus_guest_tags')) {
      sessionStorage.setItem('genfocus_guest_tags', JSON.stringify(PRESET_TAGS));
    }
    if (!sessionStorage.getItem('genfocus_guest_sessions')) {
      sessionStorage.setItem('genfocus_guest_sessions', JSON.stringify([]));
    }
  }

  function logoutGuest() {
    sessionStorage.clear();
  }

  // Unified get/set that routes to sessionStorage (guest) or localStorage (user)
  function getItem(key) {
    return isGuest() ? sessionStorage.getItem(key) : localStorage.getItem(key);
  }

  function setItem(key, value) {
    if (isGuest()) {
      sessionStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, value);
    }
  }



  // Helper to safe-parse JSON (routes to session or local storage)
  function safeParse(key, fallback) {
    const data = getItem(key);
    if (!data) return fallback;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error parsing storage key "${key}":`, e);
      return fallback;
    }
  }

  // Helper to save JSON (routes to session or local storage)
  function safeSave(key, data) {
    setItem(key, JSON.stringify(data));
  }

  /* ==========================================================================
     AUTHENTICATION & USER PROFILE STORAGE
     ========================================================================== */

  function getUsers() {
    // Always from localStorage — profile registry is never in sessionStorage
    const data = localStorage.getItem(KEYS.USERS);
    try { return data ? Object.keys(JSON.parse(data)) : []; } catch (e) { return []; }
  }

  function registerUser(username, password) {
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return false;

    const raw = localStorage.getItem(KEYS.USERS);
    const users = raw ? JSON.parse(raw) : {};
    const userLower = trimmedUser.toLowerCase();

    if (users[userLower]) return false; // Username already exists

    users[userLower] = { username: trimmedUser, password, createdAt: new Date().toISOString() };
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));

    initializeUserData(trimmedUser);
    return true;
  }

  function loginUser(username, password) {
    const trimmedUser = username.trim();
    const raw = localStorage.getItem(KEYS.USERS);
    const users = raw ? JSON.parse(raw) : {};
    const userLower = trimmedUser.toLowerCase();

    if (!users[userLower]) return false;

    if (users[userLower].password === password) {
      localStorage.setItem(KEYS.CURRENT_USER, users[userLower].username);
      sessionStorage.removeItem(KEYS.GUEST_MODE); // clear any guest session
      return true;
    }

    return false;
  }

  function getCurrentUser() {
    if (isGuest()) return 'Guest';
    return localStorage.getItem(KEYS.CURRENT_USER);
  }

  function logout() {
    if (isGuest()) {
      logoutGuest();
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
  }

  function initializeUserData(username) {
    const userLower = username.toLowerCase();
    const defaultSettings = { focus: 25, shortBreak: 5, longBreak: 15 };
    // Always write new user data to localStorage (not session)
    localStorage.setItem(`genfocus_${userLower}_settings`, JSON.stringify(defaultSettings));
    localStorage.setItem(`genfocus_${userLower}_tags`, JSON.stringify(PRESET_TAGS));
    localStorage.setItem(`genfocus_${userLower}_sessions`, JSON.stringify([]));
  }

  /* ==========================================================================
     USER-SCOPED DATA (Sessions, Tags, Settings)
     ========================================================================== */

  function getScopedKey(keyName) {
    if (isGuest()) return `genfocus_guest_${keyName}`;
    const currentUser = localStorage.getItem(KEYS.CURRENT_USER);
    if (!currentUser) throw new Error('No active user logged in.');
    return `genfocus_${currentUser.toLowerCase()}_${keyName}`;
  }

  function getSessions() {
    try {
      return safeParse(getScopedKey('sessions'), []);
    } catch (e) {
      return [];
    }
  }

  function saveSession(session) {
    const sessions = getSessions();
    const newSession = {
      id: `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...session
    };
    sessions.push(newSession);
    safeSave(getScopedKey('sessions'), sessions);
    return newSession;
  }

  function getTags() {
    try {
      return safeParse(getScopedKey('tags'), PRESET_TAGS);
    } catch (e) {
      return PRESET_TAGS;
    }
  }

  function saveTags(tags) {
    safeSave(getScopedKey('tags'), tags);
  }

  function addTag(name, color) {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    
    const tags = getTags();
    const exists = tags.some(t => t.name.toLowerCase() === trimmedName.toLowerCase());
    
    if (exists) return null;
    
    const newTag = {
      id: `tag-${Date.now()}`,
      name: trimmedName,
      color: color,
      isDefault: false
    };
    
    tags.push(newTag);
    saveTags(tags);
    return newTag;
  }

  function deleteTag(tagId) {
    const tags = getTags();
    const filtered = tags.filter(t => t.id !== tagId);
    if (filtered.length === tags.length) return false;
    
    saveTags(filtered);
    return true;
  }

  function getSettings() {
    const fallback = { focus: 25, shortBreak: 5, longBreak: 15 };
    try {
      return safeParse(getScopedKey('settings'), fallback);
    } catch (e) {
      return fallback;
    }
  }

  function saveSettings(settings) {
    safeSave(getScopedKey('settings'), settings);
  }

  // Export to Global Namespace
  window.FocusStorage = {
    getUsers,
    registerUser,
    loginUser,
    loginGuest,
    isGuest,
    getCurrentUser,
    logout,
    getSessions,
    saveSession,
    getTags,
    saveTags,
    addTag,
    deleteTag,
    getSettings,
    saveSettings
  };
})();
