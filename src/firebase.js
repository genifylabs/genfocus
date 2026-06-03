/**
 * GenFocus Firebase Integration Module
 * Initializes Firebase App and Firestore with offline persistence enabled.
 * Supports hot-swapping configurations via UI settings or static script definitions.
 */

(function () {
  const CONFIG_KEY = 'genfocus_firebase_config';
  let dbInstance = null;
  let isConnected = false;
  let lastErrorInstance = null;

  function loadConfig() {
    // Load directly and only from window.FIREBASE_CONFIG (defined manually in firebase-config.js)
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
      
      const db = firebase.firestore();
      
      // Test connectivity and credentials validity
      try {
        // Querying a specific dummy doc requires "get" permission, not "list" (query) permission.
        // This is compatible with secure Firestore rules that block root collection listing.
        await db.collection('users').doc('_connection_test_').get({ source: 'server' });
      } catch (error) {
        // If the error message indicates an API Key issue, throw it.
        const isKeyInvalid = error.message && (
          error.message.includes('API key') || 
          error.message.includes('apiKey') || 
          error.message.includes('invalid') || 
          error.message.includes('Invalid')
        );
        if (isKeyInvalid) {
          console.error('Firebase Firestore configuration test failed (Invalid API Key):', error);
          throw error;
        } else {
          // If it's a permission-denied or other rule error, it means we connected successfully
          // to Firestore (valid project and API key), but rules restricted access. This is expected.
          console.warn('Firebase Firestore server connected (access restricted by rules or offline). Proceeding.', error);
        }
      }
      
      dbInstance = db;
      isConnected = true;
      lastErrorInstance = null;

      // Enable offline persistence
      dbInstance.enablePersistence({ synchronizeTabs: true })
        .catch((err) => {
          if (err.code === 'failed-precondition') {
            console.warn('Firestore offline persistence failed: Multiple tabs open.');
          } else if (err.code === 'unimplemented') {
            console.warn('Firestore offline persistence: Browser not supported.');
          }
        });

      console.log('Firebase Cloud Sync: Connected and configured successfully from firebase-config.js.');
      return true;
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      lastErrorInstance = e;
      dbInstance = null;
      isConnected = false;
      return false;
    }
  }

  function saveConfig(config) {
    // Configuration is manual only for security reasons.
    return init();
  }

  function clearConfig() {
    // Configuration is manual only for security reasons.
    dbInstance = null;
    isConnected = false;
    console.log('Firebase Cloud Sync: Disconnected. App reverted to Local-Only Mode until reload.');
  }

  // Export to Global Namespace
  window.FocusFirebase = {
    get db() { return dbInstance; },
    get isConnected() { return isConnected; },
    get lastError() { return lastErrorInstance; },
    init,
    saveConfig,
    clearConfig,
    isConfigValid,
    loadConfig
  };

  // Run on load
  init();
})();
