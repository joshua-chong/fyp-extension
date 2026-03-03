// ══════════════════════════════════════════════════════════════
// SEAT FINDER — BRIDGE SCRIPT (ISOLATED WORLD) v6.5
// Relays messages between content.js (MAIN) and background.js
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Keep-alive: re-inject if already present ──
  if (window.__tmA11yBridgeLoaded) return;
  window.__tmA11yBridgeLoaded = true;

  // ══════════════════════════════════════════════════════════════
  // 1. SENSORY PROFILE STORAGE (chrome.storage.sync)
  // ══════════════════════════════════════════════════════════════

  function loadAndBroadcastProfiles() {
    chrome.storage.sync.get(['sensoryProfiles', 'activeProfileId'], (result) => {
      const profiles = result.sensoryProfiles || [];
      const activeId = result.activeProfileId || null;
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'PROFILES_UPDATED',
        profiles,
        activeProfileId: activeId
      }, '*');
    });
  }

  // Initial broadcast
  setTimeout(loadAndBroadcastProfiles, 500);

  // ══════════════════════════════════════════════════════════════
  // 2. MESSAGE RELAY: content.js (MAIN) ↔ bridge.js (ISOLATED)
  // ══════════════════════════════════════════════════════════════

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    // Only handle messages from our content script
    if (event.data?.source !== 'tm-a11y-content') return;

    const { type } = event.data;

    // ── Profile operations ──

    if (type === 'GET_PROFILES') {
      loadAndBroadcastProfiles();
      return;
    }

    if (type === 'SAVE_PROFILES') {
      const profiles = event.data.profiles || [];
      chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
        loadAndBroadcastProfiles();
        window.postMessage({
          source: 'tm-a11y-bridge',
          type: 'SAVE_PROFILES_RESULT',
          success: true
        }, '*');
      });
      return;
    }

    if (type === 'SAVE_PROFILE') {
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
          loadAndBroadcastProfiles();
          window.postMessage({
            source: 'tm-a11y-bridge',
            type: 'SAVE_PROFILE_RESULT',
            success: true
          }, '*');
        });
      });
      return;
    }

    if (type === 'DELETE_PROFILE') {
      chrome.storage.sync.get(['sensoryProfiles'], (result) => {
        const profiles = (result.sensoryProfiles || []).filter(p => p.id !== event.data.profileId);
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          loadAndBroadcastProfiles();
          window.postMessage({
            source: 'tm-a11y-bridge',
            type: 'DELETE_PROFILE_RESULT',
            success: true
          }, '*');
        });
      });
      return;
    }

    if (type === 'SET_ACTIVE_PROFILE') {
      chrome.storage.sync.set({ activeProfileId: event.data.profileId }, () => {
        loadAndBroadcastProfiles();
      });
      return;
    }

    if (type === 'APPLY_PROFILE') {
      // Relay — already in MAIN world, this is a no-op relay
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'APPLY_PROFILE',
        profileId: event.data.profileId
      }, '*');
      return;
    }

    // ── OpenAI API key management ──

    if (type === 'SAVE_OPENAI_KEY') {
      const apiKey = event.data.apiKey;
      if (apiKey) {
        chrome.storage.sync.set({ openaiApiKey: apiKey }, () => {
          console.log('[A11y Bridge] OpenAI API key saved');
        });
      }
      return;
    }

    if (type === 'GET_OPENAI_KEY') {
      chrome.storage.sync.get(['openaiApiKey'], (result) => {
        const key = result.openaiApiKey || '';
        window.postMessage({
          source: 'tm-a11y-bridge',
          type: 'OPENAI_KEY_RESULT',
          hasKey: !!key,
          maskedKey: key ? key.substring(0, 7) + '...' + key.substring(key.length - 4) : ''
        }, '*');
      });
      return;
    }

    // ── Venue accessibility (RAG via background.js) ──

    if (type === 'FETCH_VENUE_META') {
      const venueName = event.data.venueName;
      if (!venueName) return;

      console.log('[A11y Bridge] Relaying venue request to background.js:', venueName);

      chrome.runtime.sendMessage(
        { type: 'FETCH_VENUE_ACCESSIBILITY', venueName },
        (response) => {
          if (chrome.runtime.lastError) {
            console.log('[A11y Bridge] Background error:', chrome.runtime.lastError.message);
            window.postMessage({
              source: 'tm-a11y-bridge',
              type: 'VENUE_META_RESULT',
              venueName,
              meta: null
            }, '*');
            return;
          }

          window.postMessage({
            source: 'tm-a11y-bridge',
            type: 'VENUE_META_RESULT',
            venueName,
            meta: response?.meta || null
          }, '*');

          console.log('[A11y Bridge] Venue result received:', response?.meta?.data_source || 'none');
        }
      );
      return;
    }

    // ── Venue RAG Chatbot relay ──
    if (type === "VENUE_CHAT") {
      const { venueName, userMessage, contextText, contextSources } = event.data;
      chrome.runtime.sendMessage(
        { type: "VENUE_CHAT", venueName, userMessage, contextText, contextSources },
        (response) => {
          if (chrome.runtime.lastError) {
            window.postMessage({ source: "tm-a11y-bridge", type: "VENUE_CHAT_RESULT", error: "bridge_error", answer: "Connection failed. Try reloading." }, "*");
            return;
          }
          window.postMessage({
            source: "tm-a11y-bridge",
            type: "VENUE_CHAT_RESULT",
            answer: response?.answer || "No response.",
            citations: response?.citations || [],
            sources: response?.sources || [],
            error: response?.error || null,
          }, "*");
        }
      );
      return;
    }
  });

  // ══════════════════════════════════════════════════════════════
  // 3. CHROME RUNTIME MESSAGE HANDLER (from popup.js)
  // ══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

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
        const profiles = (result.sensoryProfiles || []).filter(p => p.id !== message.profileId);
        chrome.storage.sync.set({ sensoryProfiles: profiles }, () => {
          loadAndBroadcastProfiles();
          sendResponse({ success: true, remaining: profiles.length });
        });
      });
      return true;
    }

    if (message.type === 'SET_ACTIVE_PROFILE') {
      chrome.storage.sync.set({ activeProfileId: message.profileId }, () => {
        loadAndBroadcastProfiles();
        sendResponse({ success: true });
      });
      return true;
    }

    if (message.type === 'APPLY_PROFILE') {
      window.postMessage({
        source: 'tm-a11y-bridge',
        type: 'APPLY_PROFILE',
        profileId: message.profileId
      }, '*');
      sendResponse({ success: true });
      return true;
    }
  });

  console.log('[A11y Bridge] Initialised v6.5');
})();