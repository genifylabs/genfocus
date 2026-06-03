/**
 * GenFocus Storage Module
 * Handles local-first multi-profile storage and Firebase Firestore syncing.
 * - Logged-in users: scoped to in-memory session cache (ephemeral) and Firestore (cloud sync).
 * - Guest mode: scoped to sessionStorage (ephemeral, tab-scoped).
 * - Local storage is bypassed entirely for registered users to ensure no local data footprint.
 * All keys use the `genfocus_` prefix.
 */

(function() {
  // Key Constants
  const KEYS = {
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

  // In-Memory cache for registered users
  let memoryCache = {
    settings: null,
    tags: null,
    sessions: null,
    dailyGoal: null,
    onboarded: null,
    notificationsEnabled: null
  };

  function clearMemoryCache() {
    memoryCache.settings = null;
    memoryCache.tags = null;
    memoryCache.sessions = null;
    memoryCache.dailyGoal = null;
    memoryCache.onboarded = null;
    memoryCache.notificationsEnabled = null;
  }

  // ── Guest Mode Helpers ──────────────────────────────────────────────────────

  function isGuest() {
    return sessionStorage.getItem(KEYS.GUEST_MODE) === 'true';
  }

  function loginGuest() {
    sessionStorage.setItem(KEYS.GUEST_MODE, 'true');
    // Seed fresh guest data if not already present in sessionStorage
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

  // Helper to safe-parse JSON for Guest mode
  function safeParse(key, fallback) {
    const data = sessionStorage.getItem(key);
    if (!data) return fallback;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error parsing session storage key "${key}":`, e);
      return fallback;
    }
  }

  // Helper to save JSON for Guest mode
  function safeSave(key, data) {
    sessionStorage.setItem(key, JSON.stringify(data));
  }

  /* ==========================================================================
     AUTHENTICATION & USER PROFILE STORAGE
     ========================================================================== */

  function getUsers() {
    // Registered profile listing from local storage is disabled for security.
    // Return only active logged-in profile if present.
    const current = getCurrentUser();
    return (current && current !== 'Guest') ? [current] : [];
  }

  /**
   * Registers a user in Firestore (online-only).
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async function registerUser(username, password) {
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) return false;

    const userLower = trimmedUser.toLowerCase();

    // Requires database connection to register
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        const userDoc = await window.FocusFirebase.db.collection('users').doc(userLower).get();
        if (userDoc.exists) {
          console.log(`Registration failed: Username "${trimmedUser}" taken in Firestore.`);
          return false;
        }

        // Save credentials and initial defaults directly and only online in Firestore
        await window.FocusFirebase.db.collection('users').doc(userLower).set({
          username: trimmedUser,
          password: password,
          createdAt: new Date().toISOString(),
          settings: { focus: 25, shortBreak: 5, longBreak: 15 },
          tags: PRESET_TAGS,
          dailyGoal: 4,
          onboarded: false,
          notificationsEnabled: false
        });
        // Migrate any guest data to this new account
        await syncLocalToCloud(trimmedUser);
        console.log(`Registered and synced "${trimmedUser}" to Firestore.`);
        return true;
      } catch (e) {
        console.error('Error registering user in Firestore:', e);
        return false;
      }
    }

    console.warn('Cannot register: Firebase is disconnected.');
    return false;
  }

  /**
   * Logs in a user, pulling settings/sessions from Firestore and loading into memory.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async function loginUser(username, password) {
    const trimmedUser = username.trim();
    const userLower = trimmedUser.toLowerCase();

    // Requires database connection to log in
    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        const userDoc = await window.FocusFirebase.db.collection('users').doc(userLower).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          if (userData.password === password) {
            // Save active session username in sessionStorage for security, not localStorage
            sessionStorage.setItem(KEYS.CURRENT_USER, userData.username);
            sessionStorage.removeItem(KEYS.GUEST_MODE);

            // Populate settings/tags/onboarding in memory cache
            memoryCache.settings = userData.settings || { focus: 25, shortBreak: 5, longBreak: 15 };
            memoryCache.tags = userData.tags || PRESET_TAGS;
            memoryCache.dailyGoal = userData.dailyGoal !== undefined ? userData.dailyGoal : 4;
            memoryCache.onboarded = userData.onboarded === true;
            memoryCache.notificationsEnabled = userData.notificationsEnabled === true;

            // Load and populate Sessions
            const sessionsSnap = await window.FocusFirebase.db.collection('users').doc(userLower).collection('sessions').orderBy('date', 'asc').get();
            const sessions = [];
            sessionsSnap.forEach(doc => {
              sessions.push(doc.data());
            });
            memoryCache.sessions = sessions;

            console.log(`Logged in and populated memory cache from Firestore for "${userData.username}".`);
            return true;
          } else {
            console.log('Login failed: Invalid password.');
            return false;
          }
        }
      } catch (e) {
        console.error('Firestore login check failed:', e);
        return false;
      }
    }

    console.warn('Cannot login: Firebase is disconnected.');
    return false;
  }

  function getCurrentUser() {
    if (isGuest()) return 'Guest';
    return sessionStorage.getItem(KEYS.CURRENT_USER);
  }

  function logout() {
    if (isGuest()) {
      logoutGuest();
    } else {
      sessionStorage.removeItem(KEYS.CURRENT_USER);
      clearMemoryCache();
    }
  }

  /**
   * Restores session cache asynchronously from Firestore on refresh/re-entry.
   * @param {string} username
   * @returns {Promise<boolean>}
   */
  async function restoreSession(username) {
    if (!username || username === 'Guest') return true;
    const userLower = username.toLowerCase();

    if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
      try {
        const userDoc = await window.FocusFirebase.db.collection('users').doc(userLower).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          memoryCache.settings = userData.settings || { focus: 25, shortBreak: 5, longBreak: 15 };
          memoryCache.tags = userData.tags || PRESET_TAGS;
          memoryCache.dailyGoal = userData.dailyGoal !== undefined ? userData.dailyGoal : 4;
          memoryCache.onboarded = userData.onboarded === true;
          memoryCache.notificationsEnabled = userData.notificationsEnabled === true;

          const sessionsSnap = await window.FocusFirebase.db.collection('users').doc(userLower).collection('sessions').orderBy('date', 'asc').get();
          const sessions = [];
          sessionsSnap.forEach(doc => {
            sessions.push(doc.data());
          });
          memoryCache.sessions = sessions;
          console.log(`Session cache restored from Firestore for "${username}".`);
          return true;
        }
      } catch (e) {
        console.error('Error restoring session from Firestore:', e);
      }
    }
    return false;
  }

  /* ==========================================================================
     USER-SCOPED DATA (Sessions, Tags, Settings)
     ========================================================================== */

  function getSessions() {
    if (isGuest()) {
      return safeParse('genfocus_guest_sessions', []);
    }
    return memoryCache.sessions || [];
  }

  function saveSession(session) {
    const newSession = {
      id: `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...session
    };

    if (isGuest()) {
      const sessions = getSessions();
      sessions.push(newSession);
      safeSave('genfocus_guest_sessions', sessions);
    } else {
      if (!memoryCache.sessions) memoryCache.sessions = [];
      memoryCache.sessions.push(newSession);

      // Sync directly to Firestore
      const user = getCurrentUser();
      if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).collection('sessions').doc(newSession.id).set(newSession)
          .catch(e => console.error('Error saving session to Firestore:', e));
      }
    }

    return newSession;
  }

  function getTags() {
    if (isGuest()) {
      return safeParse('genfocus_guest_tags', PRESET_TAGS);
    }
    return memoryCache.tags || PRESET_TAGS;
  }

  function saveTags(tags) {
    if (isGuest()) {
      safeSave('genfocus_guest_tags', tags);
    } else {
      memoryCache.tags = tags;
      
      // Sync directly to Firestore
      const user = getCurrentUser();
      if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ tags })
          .catch(e => console.error('Error syncing tags to Firestore:', e));
      }
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
    if (isGuest()) {
      return safeParse('genfocus_guest_settings', fallback);
    }
    return memoryCache.settings || fallback;
  }

  function saveSettings(settings) {
    if (isGuest()) {
      safeSave('genfocus_guest_settings', settings);
    } else {
      memoryCache.settings = settings;

      // Sync directly to Firestore
      const user = getCurrentUser();
      if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ settings })
          .catch(e => console.error('Error syncing settings to Firestore:', e));
      }
    }
  }

  function getDailyGoal() {
    if (isGuest()) {
      const raw = sessionStorage.getItem('genfocus_guest_dailygoal');
      const parsed = parseInt(raw, 10);
      return !isNaN(parsed) && parsed >= 1 ? parsed : 4;
    }
    return memoryCache.dailyGoal !== null && memoryCache.dailyGoal !== undefined ? memoryCache.dailyGoal : 4;
  }

  function saveDailyGoal(val) {
    if (isGuest()) {
      sessionStorage.setItem('genfocus_guest_dailygoal', String(val));
    } else {
      memoryCache.dailyGoal = val;
      // Sync directly to Firestore
      const user = getCurrentUser();
      if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ dailyGoal: val })
          .catch(e => console.error('Error syncing daily goal to Firestore:', e));
      }
    }
  }

  function isOnboarded() {
    const user = getCurrentUser();
    if (!user) return true;
    if (isGuest()) {
      return sessionStorage.getItem('genfocus_guest_onboarded') === 'true';
    }
    return memoryCache.onboarded === true;
  }

  function markOnboarded() {
    const user = getCurrentUser();
    if (!user) return;
    if (isGuest()) {
      sessionStorage.setItem('genfocus_guest_onboarded', 'true');
    } else {
      memoryCache.onboarded = true;
      // Sync directly to Firestore
      if (window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ onboarded: true })
          .catch(e => console.error('Error syncing onboarded status to Firestore:', e));
      }
    }
  }

  function getNotificationPreference() {
    if (isGuest()) {
      return sessionStorage.getItem('genfocus_guest_notifications') === 'true';
    }
    return memoryCache.notificationsEnabled === true;
  }

  function saveNotificationPreference(bool) {
    if (isGuest()) {
      sessionStorage.setItem('genfocus_guest_notifications', bool ? 'true' : 'false');
    } else {
      memoryCache.notificationsEnabled = bool;
      // Sync directly to Firestore
      const user = getCurrentUser();
      if (user && user !== 'Guest' && window.FocusFirebase && window.FocusFirebase.isConnected && window.FocusFirebase.db) {
        window.FocusFirebase.db.collection('users').doc(user.toLowerCase()).update({ notificationsEnabled: bool })
          .catch(e => console.error('Error syncing notifications preference to Firestore:', e));
      }
    }
  }

  /* ==========================================================================
     CLOUD DATA SYNCHRONIZATION HELPERS
     ========================================================================== */

  /**
   * Syncs the entire offline local storage data of a profile to Firestore in chunks of 500.
   * (Maintained for backward compatibility or initial migration purposes)
   * @param {string} username
   */
  async function syncLocalToCloud(username) {
    const userLower = username.toLowerCase();
    const db = window.FocusFirebase.db;
    if (!db || !window.FocusFirebase.isConnected) return;

    try {
      // Pull only guest data for initial migration sync if they decide to sign up
      const settings = safeParse('genfocus_guest_settings', { focus: 25, shortBreak: 5, longBreak: 15 });
      const tags = safeParse('genfocus_guest_tags', PRESET_TAGS);
      const sessions = safeParse('genfocus_guest_sessions', []);
      const dailyGoal = parseInt(sessionStorage.getItem('genfocus_guest_dailygoal'), 10) || 4;

      // Avoid overwriting credentials in Firestore during sync
      const userDoc = await db.collection('users').doc(userLower).get();
      if (userDoc.exists) {
        await db.collection('users').doc(userLower).set({
          username: username,
          settings: settings,
          tags: tags,
          dailyGoal: dailyGoal
        }, { merge: true });
      } else {
        await db.collection('users').doc(userLower).set({
          username: username,
          password: '',
          createdAt: new Date().toISOString(),
          settings: settings,
          tags: tags,
          dailyGoal: dailyGoal,
          onboarded: true,
          notificationsEnabled: false
        });
      }

      // Chunk batch write sessions to prevent exceeding Firestore 500 write operations limit
      if (sessions.length > 0) {
        const chunkSize = 400; // safe limit
        for (let i = 0; i < sessions.length; i += chunkSize) {
          const chunk = sessions.slice(i, i + chunkSize);
          const batch = db.batch();
          chunk.forEach(session => {
            const sessionRef = db.collection('users').doc(userLower).collection('sessions').doc(session.id);
            batch.set(sessionRef, session);
          });
          await batch.commit();
        }
      }

      console.log(`Synced guest data for "${username}" to Firestore.`);
    } catch (e) {
      console.error(`Failed to sync data for "${username}" to Firestore:`, e);
    }
  }

  // Wipes all user related data from localStorage completely to comply with security requirements.
  function cleanLocalCredentials() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('genfocus_') && key !== 'genfocus_pwa_dismissed') {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('GenFocus Storage: Cleaned all local user data from localStorage.');
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
    syncLocalToCloud,
    restoreSession,
    getDailyGoal,
    saveDailyGoal,
    isOnboarded,
    markOnboarded,
    getNotificationPreference,
    saveNotificationPreference
  };
})();
