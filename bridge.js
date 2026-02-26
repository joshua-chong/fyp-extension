/**
 * Bridge Script - Runs in ISOLATED world
 * 
 * Handles communication between:
 * - content.js (MAIN world, can intercept fetch/XHR)
 * - popup.js (extension popup, uses chrome.runtime)
 * - chrome.storage (preferences persistence)
 * 
 * Uses window.postMessage + CustomEvents for cross-world messaging.
 * 
 * v6.2: Added MCDA preferences relay
 * v5.0: Added sensory profile storage and relay
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────────
  // LOAD & SEND PREFERENCES TO MAIN WORLD
  // ──────────────────────────────────────────────

  function loadAndBroadcastPreferences() {
    chrome.storage.sync.get(['userPreferences'], (result) => {
      const prefs = result.userPreferences || {};
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'PREFERENCES_LOADED',
        preferences: prefs
      }, '*');
    });
  }

  // On load, send preferences to content.js
  loadAndBroadcastPreferences();

  // ──────────────────────────────────────────────
  // LOAD & SEND SENSORY PROFILES TO MAIN WORLD
  // ──────────────────────────────────────────────

  function loadAndBroadcastProfiles() {
    chrome.storage.sync.get(['sensoryProfiles'], (result) => {
      const profiles = result.sensoryProfiles || [];
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'PROFILES_LOADED',
        profiles: profiles
      }, '*');
      console.log('[A11y Bridge] Sent profiles:', profiles.length, 'custom profiles');
    });
  }

  // Send profiles after a brief delay (after preferences)
  setTimeout(loadAndBroadcastProfiles, 200);

  // Also load and send fallback seat data from seats.json
  function loadAndSendFallbackSeats() {
    try {
      const url = chrome.runtime.getURL('seats.json');
      fetch(url)
        .then(r => r.json())
        .then(data => {
          window.postMessage({
            source: 'tm-a11y-bridge',
            type: 'FALLBACK_SEAT_DATA',
            seatData: data
          }, '*');
          console.log('[A11y Bridge] Sent fallback seat data:', Array.isArray(data) ? data.length : 'unknown', 'seats');
        })
        .catch(err => console.log('[A11y Bridge] No fallback seats.json:', err.message));
    } catch (e) {}
  }

  // Send fallback after a delay (gives API interception time to work first)
  setTimeout(loadAndSendFallbackSeats, 3000);

  // ──────────────────────────────────────────────
  // LISTEN FOR SAVE REQUESTS FROM MAIN WORLD
  // ──────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'tm-a11y-content') return;

    const { type, preferences } = event.data;

    if (type === 'SAVE_PREFERENCES') {
      chrome.storage.sync.set({ userPreferences: preferences }, () => {
        console.log('[A11y Bridge] Preferences saved to chrome.storage');
      });
    }

    if (type === 'REQUEST_PREFERENCES') {
      loadAndBroadcastPreferences();
    }

    // ── Profile messages from content.js (MAIN world) ──

    if (type === 'REQUEST_PROFILES') {
      loadAndBroadcastProfiles();
    }

    if (type === 'SAVE_PROFILES') {
      const profiles = event.data.profiles || [];
      chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
        console.log('[A11y Bridge] Profiles saved:', profiles.length);
      });
    }

    if (type === 'SAVE_PROFILE') {
      // Save a single profile (add or update)
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        const profiles = result.sensoryProfiles || [];
        const profile = event.data.profile;
        const idx = profiles.findIndex(p => p.id === profile.id);
        if (idx !== -1) {
          profiles[idx] = profile;
        } else {
          profiles.push(profile);
        }
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          console.log('[A11y Bridge] Profile saved:', profile.name);
          loadAndBroadcastProfiles();
        });
      });
    }

    if (type === 'DELETE_PROFILE') {
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        let profiles = result.sensoryProfiles || [];
        profiles = profiles.filter(p => p.id !== event.data.profileId);
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          console.log('[A11y Bridge] Profile deleted:', event.data.profileId);
          loadAndBroadcastProfiles();
        });
      });
    }
  });

  // ──────────────────────────────────────────────
  // LISTEN FOR MESSAGES FROM POPUP
  // ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_PREFERENCES') {
      // Save to storage
      chrome.storage.sync.set({ userPreferences: message.preferences }, () => {
        // Forward to content.js in MAIN world
        window.postMessage({
          source: 'tm-a11y-bridge',
          type: 'PREFERENCES_UPDATED',
          preferences: message.preferences
        }, '*');
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'GET_SEAT_DATA') {
      // Request seat data from content.js
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'REQUEST_SEAT_DATA'
      }, '*');

      // Listen for the response (one-time)
      const handler = (event) => {
        if (event.data?.source === 'tm-a11y-content' && event.data?.type === 'SEAT_DATA_RESPONSE') {
          window.removeEventListener('message', handler);
          sendResponse({ seatData: event.data.seatData });
        }
      };
      window.addEventListener('message', handler);
      // Timeout cleanup
      setTimeout(() => window.removeEventListener('message', handler), 5000);
      return true;
    }

    // ── Profile messages from popup ──

    if (message.type === 'GET_PROFILES') {
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        sendResponse({ profiles: result.sensoryProfiles || [] });
      });
      return true;
    }

    if (message.type === 'SAVE_PROFILES') {
      chrome.storage.sync.set({ sensoryProfiles: message.profiles || [] }, () => {
        loadAndBroadcastProfiles();
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'SAVE_PROFILE') {
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        const profiles = result.sensoryProfiles || [];
        const profile = message.profile;
        const idx = profiles.findIndex(p => p.id === profile.id);
        if (idx !== -1) {
          profiles[idx] = profile;
        } else {
          profiles.push(profile);
        }
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          loadAndBroadcastProfiles();
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (message.type === 'DELETE_PROFILE') {
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        let profiles = result.sensoryProfiles || [];
        profiles = profiles.filter(p => p.id !== message.profileId);
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          loadAndBroadcastProfiles();
          sendResponse({ success: true });
        });
      });
      return true;
    }

    if (message.type === 'IMPORT_PROFILES') {
      // Merge imported profiles with existing (by ID)
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        const existing = result.sensoryProfiles || [];
        const imported = message.profiles || [];
        const existingMap = new Map(existing.map(p => [p.id, p]));
        imported.forEach(p => {
          // Don't import built-in profiles
          if (p.builtIn) return;
          existingMap.set(p.id, p);
        });
        const merged = Array.from(existingMap.values());
        chrome.storage.sync.set({ sensoryProfiles: merged }, () => {
          loadAndBroadcastProfiles();
          sendResponse({ success: true, count: imported.filter(p => !p.builtIn).length });
        });
      });
      return true;
    }

    if (message.type === 'APPLY_PROFILE') {
      // Relay to content.js via postMessage
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'APPLY_PROFILE',
        profileId: message.profileId
      }, '*');
      sendResponse({ success: true });
      return true;
    }
  });

  console.log('[A11y Bridge] Initialised v6.2');
})();