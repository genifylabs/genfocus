/**
 * GenFocus Storage Module
 * Handles Firestore-first cloud storage for authenticated profiles
 * and isolated localStorage for guest mode.
 */

import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  doc,
  setDoc,
  deleteDoc,
  collection,
  writeBatch,
  onSnapshot
} from '../firebase.js';

// Preset Tags
const PRESET_TAGS = [
  { id: 'tag-study', name: 'Study', color: '#14b8a6', isDefault: true },
  { id: 'tag-work', name: 'Work', color: '#9d5cff', isDefault: true },
  { id: 'tag-personal', name: 'Personal', color: '#2563eb', isDefault: true },
  { id: 'tag-health', name: 'Health', color: '#22c55e', isDefault: true }
];

// In-Memory cache for active profile (live-synced with Firestore)
let memoryCache = {
  settings: null,
  tags: null,
  sessions: null,
  dailyGoal: null,
  onboarded: null,
  notificationsEnabled: null
};

// Firestore listeners references
let unsubscribers = [];

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
  return localStorage.getItem('genfocus_guest_mode') === 'true';
}

function loginGuest() {
  localStorage.setItem('genfocus_guest_mode', 'true');
  // Seed fresh guest data if not already present in localStorage
  if (!localStorage.getItem('genfocus_guest_settings')) {
    localStorage.setItem('genfocus_guest_settings', JSON.stringify({ focus: 25, shortBreak: 5, longBreak: 15 }));
  }
  if (!localStorage.getItem('genfocus_guest_tags')) {
    localStorage.setItem('genfocus_guest_tags', JSON.stringify(PRESET_TAGS));
  }
  if (!localStorage.getItem('genfocus_guest_sessions')) {
    localStorage.setItem('genfocus_guest_sessions', JSON.stringify([]));
  }
}

function logoutGuest() {
  localStorage.removeItem('genfocus_guest_mode');
  localStorage.removeItem('genfocus_guest_settings');
  localStorage.removeItem('genfocus_guest_tags');
  localStorage.removeItem('genfocus_guest_sessions');
  localStorage.removeItem('genfocus_guest_dailygoal');
  localStorage.removeItem('genfocus_guest_onboarded');
  localStorage.removeItem('genfocus_guest_notifications');
}

// Helper to safe-parse JSON for Guest mode
function safeParse(key, fallback) {
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error(`Error parsing guest storage key "${key}":`, e);
    return fallback;
  }
}

// Helper to save JSON for Guest mode
function safeSave(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

/* ==========================================================================
   AUTHENTICATION & USER PROFILE STORAGE
   ========================================================================== */

function getUsers() {
  // Deprecated in cloud sync: return empty array to prevent local profile enumeration
  return [];
}

/**
 * Registers a user in Firebase Auth.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<boolean|object>}
 */
async function registerUser(email, password) {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) return false;

  try {
    await createUserWithEmailAndPassword(auth, trimmedEmail, password);
    return true;
  } catch (e) {
    console.error('Error registering Firebase user:', e);
    return { error: true, details: e.message || String(e) };
  }
}

/**
 * Logs in a user in Firebase Auth.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<boolean|object>}
 */
async function loginUser(email, password) {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) return false;

  try {
    await signInWithEmailAndPassword(auth, trimmedEmail, password);
    return true;
  } catch (e) {
    console.error('Firebase login check failed:', e);
    return { error: true, details: e.message || String(e) };
  }
}

function getCurrentUser() {
  if (isGuest()) return 'Guest';
  return auth.currentUser ? auth.currentUser.email : null;
}

async function logout() {
  if (isGuest()) {
    logoutGuest();
  } else {
    clearFirestoreListeners();
    clearMemoryCache();
    await signOut(auth);
  }
}

/**
 * Restores session cache asynchronously (stub for Firebase).
 */
async function restoreSession(username) {
  return true;
}

/* ==========================================================================
   FIRESTORE REAL-TIME SYNCHRONIZATION LISTENERS
   ========================================================================== */

function setupFirestoreListeners(uid, onReady, onError) {
  clearFirestoreListeners();

  let settingsLoaded = false;
  let tagsLoaded = false;
  let sessionsLoaded = false;

  const checkReady = () => {
    if (settingsLoaded && tagsLoaded && sessionsLoaded) {
      onReady();
    }
  };

  // 1. Settings & Preferences listener
  const settingsRef = doc(db, "users", uid, "settings", "preferences");
  const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      memoryCache.settings = {
        focus: data.focus || 25,
        shortBreak: data.shortBreak || 5,
        longBreak: data.longBreak || 15,
        autoStart: data.autoStart || false
      };
      memoryCache.dailyGoal = data.dailyGoal || 4;
      memoryCache.onboarded = data.onboarded || false;
      memoryCache.notificationsEnabled = data.notificationsEnabled || false;
    } else {
      // Seed default settings on Firestore for a new user
      memoryCache.settings = { focus: 25, shortBreak: 5, longBreak: 15, autoStart: false };
      memoryCache.dailyGoal = 4;
      memoryCache.onboarded = false;
      memoryCache.notificationsEnabled = false;
    }
    settingsLoaded = true;
    checkReady();
  }, (error) => {
    console.error("Firestore settings load failed:", error);
    onError(error);
  });
  unsubscribers.push(unsubSettings);

  // 2. Tags listener
  const tagsRef = collection(db, "users", uid, "tags");
  const unsubTags = onSnapshot(tagsRef, (querySnap) => {
    const tags = [];
    querySnap.forEach((doc) => {
      tags.push(doc.data());
    });
    if (tags.length === 0) {
      // Seed default preset tags in Firestore if empty
      memoryCache.tags = PRESET_TAGS;
      // Pre-seed Firestore asynchronously without blocking
      const batch = writeBatch(db);
      PRESET_TAGS.forEach(t => {
        batch.set(doc(db, "users", uid, "tags", t.id), t);
      });
      batch.commit().catch(e => console.error("Error seeding tags:", e));
    } else {
      memoryCache.tags = tags;
    }
    tagsLoaded = true;
    checkReady();
  }, (error) => {
    console.error("Firestore tags load failed:", error);
    onError(error);
  });
  unsubscribers.push(unsubTags);

  // 3. Sessions listener
  const sessionsRef = collection(db, "users", uid, "sessions");
  const unsubSessions = onSnapshot(sessionsRef, (querySnap) => {
    const sessions = [];
    querySnap.forEach((doc) => {
      sessions.push(doc.data());
    });
    memoryCache.sessions = sessions;
    sessionsLoaded = true;
    checkReady();
  }, (error) => {
    console.error("Firestore sessions load failed:", error);
    onError(error);
  });
  unsubscribers.push(unsubSessions);
}

function clearFirestoreListeners() {
  unsubscribers.forEach(unsub => unsub());
  unsubscribers = [];
}

/* ==========================================================================
   GUEST MIGRATION HELPER
   ========================================================================== */

async function migrateGuestDataToFirestore(uid) {
  const guestSettings = localStorage.getItem('genfocus_guest_settings');
  const guestTags = localStorage.getItem('genfocus_guest_tags');
  const guestSessions = localStorage.getItem('genfocus_guest_sessions');
  const guestDailyGoal = localStorage.getItem('genfocus_guest_dailygoal');
  const guestOnboarded = localStorage.getItem('genfocus_guest_onboarded');
  const guestNotifications = localStorage.getItem('genfocus_guest_notifications');

  const batch = writeBatch(db);

  // 1. Settings
  const settings = guestSettings ? JSON.parse(guestSettings) : { focus: 25, shortBreak: 5, longBreak: 15, autoStart: false };
  const dailyGoal = guestDailyGoal ? parseInt(guestDailyGoal, 10) : 4;
  const onboarded = guestOnboarded === 'true';
  const notificationsEnabled = guestNotifications === 'true';

  const settingsRef = doc(db, "users", uid, "settings", "preferences");
  batch.set(settingsRef, {
    focus: settings.focus,
    shortBreak: settings.shortBreak,
    longBreak: settings.longBreak,
    autoStart: settings.autoStart || false,
    dailyGoal: dailyGoal,
    onboarded: onboarded,
    notificationsEnabled: notificationsEnabled
  }, { merge: true });

  // 2. Tags
  let tags = [];
  if (guestTags) {
    try { tags = JSON.parse(guestTags); } catch (_) {}
  }
  if (tags.length === 0) {
    tags = PRESET_TAGS;
  }
  tags.forEach(tag => {
    const tagRef = doc(db, "users", uid, "tags", tag.id);
    batch.set(tagRef, tag);
  });

  // 3. Sessions
  let sessions = [];
  if (guestSessions) {
    try { sessions = JSON.parse(guestSessions); } catch (_) {}
  }
  sessions.forEach(session => {
    const sessionRef = doc(db, "users", uid, "sessions", session.id);
    batch.set(sessionRef, session);
  });

  await batch.commit();

  // Clear guest data from local storage
  logoutGuest();
  console.log(`Successfully batch-migrated guest data for user "${uid}" to Firestore.`);
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
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "sessions", newSession.id), newSession).catch(err => {
        console.error("Error saving session to Firestore:", err);
      });
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
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      const batch = writeBatch(db);
      tags.forEach(tag => {
        batch.set(doc(db, "users", uid, "tags", tag.id), tag);
      });
      batch.commit().catch(err => {
        console.error("Error saving tags to Firestore:", err);
      });
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

  if (isGuest()) {
    tags.push(newTag);
    saveTags(tags);
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "tags", newTag.id), newTag).catch(err => {
        console.error("Error adding tag to Firestore:", err);
      });
    }
  }

  return newTag;
}

function deleteTag(tagId) {
  if (isGuest()) {
    const tags = getTags();
    const filtered = tags.filter(t => t.id !== tagId);
    if (filtered.length === tags.length) return false;
    saveTags(filtered);
    return true;
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      deleteDoc(doc(db, "users", uid, "tags", tagId)).catch(err => {
        console.error("Error deleting tag from Firestore:", err);
      });
      return true;
    }
  }
  return false;
}

function getSettings() {
  const fallback = { focus: 25, shortBreak: 5, longBreak: 15, autoStart: false };
  if (isGuest()) {
    return safeParse('genfocus_guest_settings', fallback);
  }
  return memoryCache.settings || fallback;
}

function saveSettings(settings) {
  if (isGuest()) {
    safeSave('genfocus_guest_settings', settings);
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "settings", "preferences"), {
        focus: settings.focus,
        shortBreak: settings.shortBreak,
        longBreak: settings.longBreak,
        autoStart: settings.autoStart || false
      }, { merge: true }).catch(err => {
        console.error("Error saving settings to Firestore:", err);
      });
    }
  }
}

function getDailyGoal() {
  if (isGuest()) {
    const raw = localStorage.getItem('genfocus_guest_dailygoal');
    const parsed = parseInt(raw, 10);
    return !isNaN(parsed) && parsed >= 1 ? parsed : 4;
  }
  return memoryCache.dailyGoal !== null && memoryCache.dailyGoal !== undefined ? memoryCache.dailyGoal : 4;
}

function saveDailyGoal(val) {
  if (isGuest()) {
    localStorage.setItem('genfocus_guest_dailygoal', String(val));
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "settings", "preferences"), { dailyGoal: val }, { merge: true }).catch(err => {
        console.error("Error saving daily goal to Firestore:", err);
      });
    }
  }
}

function isOnboarded() {
  if (isGuest()) {
    return localStorage.getItem('genfocus_guest_onboarded') === 'true';
  }
  return memoryCache.onboarded === true;
}

function markOnboarded() {
  if (isGuest()) {
    localStorage.setItem('genfocus_guest_onboarded', 'true');
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "settings", "preferences"), { onboarded: true }, { merge: true }).catch(err => {
        console.error("Error marking onboarding complete in Firestore:", err);
      });
    }
  }
}

function getNotificationPreference() {
  if (isGuest()) {
    return localStorage.getItem('genfocus_guest_notifications') === 'true';
  }
  return memoryCache.notificationsEnabled === true;
}

function saveNotificationPreference(bool) {
  if (isGuest()) {
    localStorage.setItem('genfocus_guest_notifications', bool ? 'true' : 'false');
  } else {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setDoc(doc(db, "users", uid, "settings", "preferences"), { notificationsEnabled: bool }, { merge: true }).catch(err => {
        console.error("Error saving notification preference to Firestore:", err);
      });
    }
  }
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
  saveSettings,
  getDailyGoal,
  saveDailyGoal,
  isOnboarded,
  markOnboarded,
  getNotificationPreference,
  saveNotificationPreference,
  setupFirestoreListeners,
  clearFirestoreListeners,
  migrateGuestDataToFirestore
};
