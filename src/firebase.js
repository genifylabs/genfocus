/**
 * GenFocus Firebase Integration Module
 * Initializes Firebase App and Firestore with offline persistence enabled.
 * Supports hot-swapping configurations via UI settings or static script definitions.
 */

(function () {
  const CONFIG_KEY = 'genfocus_firebase_config';
  let dbInstance = null;
  let isConnected = false;

  function loadConfig() {
    // 1. Check localStorage for UI-based configuration
    try {
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading Firebase config from localStorage:', e);
    }

    // 2. Fall back to window.FIREBASE_CONFIG (defined in firebase-config.js)
    if (window.FIREBASE_CONFIG && isConfigValid(window.FIREBASE_CONFIG)) {
      return window.FIREBASE_CONFIG;
    }

    return null;
  }

  function isConfigValid(config) {
    return !!(config && config.apiKey && config.projectId);
  }

  async function init() {
    const config = loadConfig();
    if (!config || !isConfigValid(config)) {
      console.log('Firebase Cloud Sync: Not configured. App is running in Local-Only Mode.');
      dbInstance = null;
      isConnected = false;
      return false;
    }

    try {
      // Avoid initializing multiple times or handle re-initialization
      if (firebase.apps.length > 0) {
        try {
          await firebase.app().delete();
        } catch (e) {
          console.warn('Error deleting existing Firebase app instance:', e);
        }
      }
      firebase.initializeApp(config);
      
      dbInstance = firebase.firestore();
      isConnected = true;

      // Enable offline persistence
      dbInstance.enablePersistence({ synchronizeTabs: true })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn('Firestore offline persistence failed: Multiple tabs open.');
          } else if (err.code === 'unimplemented') {
            console.warn('Firestore offline persistence: Browser not supported.');
          }
        });

      console.log('Firebase Cloud Sync: Connected and configured successfully.');
      return true;
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      dbInstance = null;
      isConnected = false;
      return false;
    }
  }

  function saveConfig(config) {
    if (!config || !isConfigValid(config)) return false;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    
    // If firebase was already initialized, we must reload the page to re-initialize with new config safely.
    const reInitSuccess = init();
    return reInitSuccess;
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    dbInstance = null;
    isConnected = false;
    console.log('Firebase Cloud Sync: Configuration cleared. App reverted to Local-Only Mode.');
  }

  // Export to Global Namespace
  window.FocusFirebase = {
    get db() { return dbInstance; },
    get isConnected() { return isConnected; },
    init,
    saveConfig,
    clearConfig,
    isConfigValid,
    loadConfig
  };

  // Run on load
  init();
})();
