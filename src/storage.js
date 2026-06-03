/**
 * GenFocus Storage Module
 * Handles local-first multi-profile storage and Firebase Firestore syncing.
 * - Logged-in users: scoped to localStorage (persistent) and Firestore (cloud sync).
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

  // Preset Tags
  const PRESET_TAGS = [
    { id: 'tag-study', name: 'Study', color: '#14b8a6', isDefault: true },
    { id: 'tag-work', name: 'Work', color: '#9d5cff', isDefault: true },
    { id: 'tag-personal', name: 'Personal', color: '#2563eb', isDefault: true },
    { id: 'tag-health', name: 'Health', color: '#22c55e', isDefault: true }
  ];

  // ── Guest Mode Helpers ──────────────────────────────────────────────────────

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

  // Helper to safe-parse JSON
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

  // Helper to save JSON
  function safeSave(key, data) {
    setItem(key, JSON.stringify(data));
  }

  /* ==========================================================================
     AUTHENTICATION & USER PROFILE STORAGE
     ========================================================================== */

  function getUsers() {
    const data = localStorage.getItem(KEYS.USERS);
    try { return data ? Object.keys(JSON.parse(data)) : []; } catch (e) { return []; }
  }

  /**
   * Registers a user locally and in Firestore (if connected).
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async function registerUser(username, password) {
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return false;

    const userLower = trimmedUser.toLowerCase();

    // 1. Check Firestore first if online to prevent duplicate username registration globally
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        const userDoc = await window.FocusFirebase.db.collection('users').doc(userLower).get();
        if (userDoc.exists) {
          console.log(`Registration failed: Username "${trimmedUser}" taken in Firestore.`);
          return false;
        }
      } catch (e) {
        console.warn('Firestore availability check failed during registration. Falling back to local check.', e);
      }
    }

    // 2. Check local database
    const raw = localStorage.getItem(KEYS.USERS);
    const users = raw ? JSON.parse(raw) : {};
    if (users[userLower]) return false;

    // 3. Register locally (WITHOUT PASSWORD!)
    users[userLower] = { username: trimmedUser, createdAt: new Date().toISOString() };
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    initializeUserData(trimmedUser);

    // 4. Register in Firestore (if connected)
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        await window.FocusFirebase.db.collection('users').doc(userLower).set({
          username: trimmedUser,
          password: password,
          createdAt: new Date().toISOString(),
          settings: { focus: 25, shortBreak: 5, longBreak: 15 },
          tags: PRESET_TAGS,
          dailyGoal: 4
        });
        console.log(`Registered and synced "${trimmedUser}" to Firestore.`);
      } catch (e) {
        console.error('Error registering user in Firestore:', e);
      }
    }

    return true;
  }

  /**
   * Logs in a user, pulling settings/sessions from Firestore if connected.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async function loginUser(username, password) {
    const trimmedUser = username.trim();
    const userLower = trimmedUser.toLowerCase();

    // 1. If Firestore is connected, check cloud credentials first
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        const userDoc = await window.FocusFirebase.db.collection('users').doc(userLower).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData.password === password) {
            // Save to current user session
            localStorage.setItem(KEYS.CURRENT_USER, userData.username);
            sessionStorage.removeItem(KEYS.GUEST_MODE);

            // Register username in local users list if not present (WITHOUT PASSWORD!)
            const raw = localStorage.getItem(KEYS.USERS);
            const users = raw ? JSON.parse(raw) : {};
            if (!users[userLower]) {
              users[userLower] = { username: userData.username, createdAt: userData.createdAt || new Date().toISOString() };
              localStorage.setItem(KEYS.USERS, JSON.stringify(users));
            }

            // Sync down Settings, Tags, and Goals to localStorage
            if (userData.settings) {
              localStorage.setItem(`genfocus_${userLower}_settings`, JSON.stringify(userData.settings));
            }
            if (userData.tags) {
              localStorage.setItem(`genfocus_${userLower}_tags`, JSON.stringify(userData.tags));
            }
            if (userData.dailyGoal !== undefined) {
              localStorage.setItem(`genfocus_${userLower}_dailygoal`, String(userData.dailyGoal));
            }

            // Sync down Sessions
            const sessionsSnap = await window.FocusFirebase.db.collection('users').doc(userLower).collection('sessions').orderBy('date', 'asc').get();
            const sessions = [];
            sessionsSnap.forEach(doc => {
              sessions.push(doc.data());
            });
            localStorage.setItem(`genfocus_${userLower}_sessions`, JSON.stringify(sessions));

            console.log(`Logged in and fully synced settings/sessions from Firestore for "${userData.username}".`);
            return true;
          } else {
            console.log('Login failed: Invalid password in Firestore.');
            return false;
          }
        }
      } catch (e) {
        console.warn('Firestore login check failed. Falling back to local offline check.', e);
      }
    }

    // 2. Fall back to localStorage login (offline or local-only)
    const raw = localStorage.getItem(KEYS.USERS);
    const users = raw ? JSON.parse(raw) : {};

    if (!users[userLower]) return false;

    // Offline mode: since we don't store passwords locally, we allow logging in if the profile exists.
    localStorage.setItem(KEYS.CURRENT_USER, users[userLower].username);
    sessionStorage.removeItem(KEYS.GUEST_MODE); // clear any guest session

    // If we are now online but didn't have this user in Firestore yet, sync local profile to cloud
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      syncLocalToCloud(users[userLower].username);
    }

    return true;
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
    localStorage.setItem(`genfocus_${userLower}_settings`, JSON.stringify(defaultSettings));
    localStorage.setItem(`genfocus_${userLower}_tags`, JSON.stringify(PRESET_TAGS));
    localStorage.setItem(`genfocus_${userLower}_sessions`, JSON.stringify([]));
    localStorage.setItem(`genfocus_${userLower}_dailygoal`, '4');
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

    // Sync to Firestore
    const user = getCurrentUser();
    if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).collection('sessions').doc(newSession.id).set(newSession)
        .catch(e => console.error('Error saving session to Firestore:', e));
    }

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

    // Sync to Firestore
    const user = getCurrentUser();
    if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ tags })
        .catch(e => console.error('Error syncing tags to Firestore:', e));
    }
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

    // Sync to Firestore
    const user = getCurrentUser();
    if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ settings })
        .catch(e => console.error('Error syncing settings to Firestore:', e));
    }
  }

  /* ==========================================================================
     CLOUD DATA SYNCHRONIZATION HELPERS
     ========================================================================== */

  /**
   * Syncs the entire offline local storage data of a profile to Firestore.
   * @param {string} username
   */
  async function syncLocalToCloud(username) {
    const userLower = username.toLowerCase();
    const db = window.FocusFirebase.db;
    if (!db || !window.FocusFirebase.isConnected) return;

    try {
      const settings = safeParse(`genfocus_${userLower}_settings`, { focus: 25, shortBreak: 5, longBreak: 15 });
      const tags = safeParse(`genfocus_${userLower}_tags`, PRESET_TAGS);
      const rawSessions = localStorage.getItem(`genfocus_${userLower}_sessions`);
      const sessions = rawSessions ? JSON.parse(rawSessions) : [];
      
      const rawGoal = localStorage.getItem(`genfocus_${userLower}_dailygoal`);
      const dailyGoal = parseInt(rawGoal, 10) || 4;

      const rawUsers = localStorage.getItem(KEYS.USERS);
      const users = rawUsers ? JSON.parse(rawUsers) : {};
      const createdAt = users[userLower] ? users[userLower].createdAt : new Date().toISOString();

      // Avoid overwriting credentials in Firestore during sync
      const userDoc = await db.collection('users').doc(userLower).get();
      if (userDoc.exists) {
        // Only merge settings, tags, and dailyGoal, leaving password intact
        await db.collection('users').doc(userLower).set({
          username: username,
          settings: settings,
          tags: tags,
          dailyGoal: dailyGoal
        }, { merge: true });
      } else {
        // Create new document with blank password
        await db.collection('users').doc(userLower).set({
          username: username,
          password: '',
          createdAt: createdAt,
          settings: settings,
          tags: tags,
          dailyGoal: dailyGoal
        });
      }

      // Batch write sessions to reduce database request overhead
      if (sessions.length > 0) {
        const batch = db.batch();
        sessions.forEach(session => {
          const sessionRef = db.collection('users').doc(userLower).collection('sessions').doc(session.id);
          batch.set(sessionRef, session);
        });
        await batch.commit();
      }

      console.log(`Synced all local data for "${username}" to Firestore.`);
    } catch (e) {
      console.error(`Failed to sync local data for "${username}" to Firestore:`, e);
    }
  }

  // Clean up any passwords stored in localStorage under genfocus_users
  function cleanLocalCredentials() {
    try {
      const raw = localStorage.getItem(KEYS.USERS);
      if (raw) {
        const users = JSON.parse(raw);
        let modified = false;
        for (const key in users) {
          if (users[key] && users[key].hasOwnProperty('password')) {
            delete users[key].password;
            modified = true;
          }
        }
        if (modified) {
          localStorage.setItem(KEYS.USERS, JSON.stringify(users));
          console.log('GenFocus Storage: Cleaned up existing password credentials from localStorage.');
        }
      }
    } catch (e) {
      console.error('Error cleaning up local credentials:', e);
    }
  }

  // Run cleanup immediately on script load
  cleanLocalCredentials();

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
    saveSettings,
    syncLocalToCloud
  };
})();
