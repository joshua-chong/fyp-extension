/**
 * Ticketmaster Accessibility Helper - Popup Script v6.2
 * 
 * Features:
 * - Tabbed UI (Settings / Profiles / Journal / Account)
 * - Sensory Profile System (built-in presets + custom CRUD + import/export)
 * - MCDA Heatmap settings (enable/disable, weight sliders)
 * - Local auth with SHA-256 password hashing
 * - Concert journal CRUD with ratings, tags, notes
 * - All existing settings (focus mode, price, colour scheme, typography)
 */

(function () {
  'use strict';

  // ════════════════════════════════════════════
  // CONFIG
  // ════════════════════════════════════════════

  const FONT_FAMILIES = {
    'default': 'inherit', 'arial': 'Arial, Helvetica, sans-serif',
    'verdana': 'Verdana, Geneva, sans-serif', 'comic-sans': '"Comic Sans MS", cursive',
    'opendyslexic': 'OpenDyslexic, sans-serif', 'atkinson': '"Atkinson Hyperlegible", sans-serif',
    'trebuchet': '"Trebuchet MS", sans-serif', 'tahoma': 'Tahoma, Geneva, sans-serif',
    'georgia': 'Georgia, serif', 'times': '"Times New Roman", Times, serif'
  };

  const FONT_LABELS = {
    'default': 'Default', 'arial': 'Arial', 'verdana': 'Verdana', 'tahoma': 'Tahoma',
    'opendyslexic': 'OpenDyslexic', 'atkinson': 'Atkinson', 'comic-sans': 'Comic Sans',
    'trebuchet': 'Trebuchet', 'georgia': 'Georgia', 'times': 'Times'
  };

  const SCHEME_INFO = {
    'default': { description: 'Standard green/grey', swatches: ['#1a73e8', '#22c55e', '#9ca3af'], label: 'Default' },
    'high-contrast': { description: 'Bold black/white/yellow', swatches: ['#000000', '#FFD700', '#ffffff'], label: 'High Contrast' },
    'deuteranopia': { description: 'Blue/orange — red-green safe', swatches: ['#0077BB', '#EE7733', '#ffffff'], label: 'CB Red-Green' },
    'tritanopia': { description: 'Red/cyan — blue-yellow safe', swatches: ['#CC3311', '#33BBEE', '#ffffff'], label: 'CB Blue-Yellow' },
    'muted': { description: 'Soft earth tones', swatches: ['#7c8ba1', '#8fbc8f', '#faf8f5'], label: 'Muted' },
    'dark': { description: 'Low brightness', swatches: ['#60a5fa', '#4ade80', '#111827'], label: 'Dark' }
  };

  const TAG_LABELS = {
    'loud': 'Loud', 'crowded': 'Crowded', 'good-view': 'Good View', 'accessible': 'Accessible',
    'calm': 'Calm', 'bright-lights': 'Bright Lights', 'easy-exit': 'Easy Exit', 'would-return': 'Would Return'
  };

  // ════════════════════════════════════════════
  // BUILT-IN PROFILES (must match content.js)
  // ════════════════════════════════════════════

  const BUILT_IN_PROFILES = [
    {
      id: 'profile_low-stim',
      name: 'Low Stimulation',
      builtIn: true,
      description: 'Muted colours, large font, motion freeze, declutter — minimal sensory input',
      settings: {
        focusModeEnabled: false,
        colourScheme: 'muted',
        fontFamily: 'atkinson',
        fontSize: 20,
        lineSpacing: 2.0,
        declutterEnabled: true,
        animationFreezeEnabled: true
      },
      mcdaWeights: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 }
    },
    {
      id: 'profile_high-contrast',
      name: 'High Contrast Focus',
      builtIn: true,
      description: 'High contrast scheme, focus mode on, motion freeze — maximum readability',
      settings: {
        focusModeEnabled: true,
        colourScheme: 'high-contrast',
        fontFamily: 'atkinson',
        fontSize: 18,
        lineSpacing: 1.8,
        declutterEnabled: false,
        animationFreezeEnabled: true
      },
      mcdaWeights: { price: 30, viewQuality: 35, proximity: 20, aisleAccess: 15 }
    },
    {
      id: 'profile_budget',
      name: 'Budget Mode',
      builtIn: true,
      description: 'Default colours, focus mode on — price-focused ticket hunting',
      settings: {
        focusModeEnabled: true,
        colourScheme: 'default',
        fontFamily: 'default',
        fontSize: 16,
        lineSpacing: 1.5,
        declutterEnabled: false,
        animationFreezeEnabled: false
      },
      mcdaWeights: { price: 50, viewQuality: 20, proximity: 15, aisleAccess: 15 }
    }
  ];

  // ════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════

  let currentUser = null; // { email, displayName, createdAt }
  let journalEntries = [];
  let starRatings = { ratingOverall: 0, ratingSensory: 0, ratingAccessibility: 0 };
  let customProfiles = [];    // User-created sensory profiles (from storage)

  let prefs = {
    focusModeEnabled: false, panelOpen: true, maxPrice: 150,
    colourScheme: 'default', fontFamily: 'default',
    fontSize: 16, lineSpacing: 1.5,
    activeProfileId: null,
    mcdaEnabled: false,
    mcdaWeights: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 }
  };

  // ════════════════════════════════════════════
  // CRYPTO — SHA-256 password hashing
  // ════════════════════════════════════════════

  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_tm_a11y_salt_2025');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ════════════════════════════════════════════
  // STORAGE HELPERS
  // ════════════════════════════════════════════

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  function storageSet(data) {
    return new Promise(resolve => chrome.storage.local.set(data, resolve));
  }

  function storageRemove(keys) {
    return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
  }

  // Also use sync for preferences (cross-device)
  function syncGet(keys) {
    return new Promise(resolve => chrome.storage.sync.get(keys, resolve));
  }

  function syncSet(data) {
    return new Promise(resolve => chrome.storage.sync.set(data, resolve));
  }

  // ════════════════════════════════════════════
  // AUTH SYSTEM
  // ════════════════════════════════════════════

  async function register(displayName, email, password) {
    email = email.toLowerCase().trim();

    if (!displayName || displayName.length < 1) throw new Error('Display name is required');
    if (!email || !email.includes('@')) throw new Error('Valid email is required');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    const { accounts = {} } = await storageGet('accounts');

    if (accounts[email]) throw new Error('An account with this email already exists');

    const passwordHash = await hashPassword(password);

    accounts[email] = {
      displayName,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    await storageSet({ accounts });
    await setSession(email, displayName, accounts[email].createdAt);

    return { email, displayName, createdAt: accounts[email].createdAt };
  }

  async function login(email, password) {
    email = email.toLowerCase().trim();

    if (!email || !password) throw new Error('Email and password are required');

    const { accounts = {} } = await storageGet('accounts');
    const account = accounts[email];

    if (!account) throw new Error('No account found with this email');

    const passwordHash = await hashPassword(password);

    if (account.passwordHash !== passwordHash) throw new Error('Incorrect password');

    await setSession(email, account.displayName, account.createdAt);

    return { email, displayName: account.displayName, createdAt: account.createdAt };
  }

  async function logout() {
    await storageRemove('currentSession');
    currentUser = null;
    journalEntries = [];
  }

  async function deleteAccount() {
    if (!currentUser) return;
    const email = currentUser.email;

    const { accounts = {} } = await storageGet('accounts');
    delete accounts[email];
    await storageSet({ accounts });

    // Delete journal
    await storageRemove(`journal_${email}`);
    await logout();
  }

  async function setSession(email, displayName, createdAt) {
    currentUser = { email, displayName, createdAt };
    await storageSet({ currentSession: { email, displayName, createdAt } });
  }

  async function restoreSession() {
    const { currentSession } = await storageGet('currentSession');
    if (currentSession?.email) {
      // Verify account still exists
      const { accounts = {} } = await storageGet('accounts');
      if (accounts[currentSession.email]) {
        currentUser = currentSession;
        return true;
      }
      // Account deleted, clean up
      await storageRemove('currentSession');
    }
    return false;
  }

  // ════════════════════════════════════════════
  // JOURNAL CRUD
  // ════════════════════════════════════════════

  async function loadJournal() {
    if (!currentUser) { journalEntries = []; return; }
    const key = `journal_${currentUser.email}`;
    const result = await storageGet(key);
    journalEntries = result[key] || [];
    // Sort newest first
    journalEntries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async function saveJournal() {
    if (!currentUser) return;
    const key = `journal_${currentUser.email}`;
    await storageSet({ [key]: journalEntries });
  }

  function addJournalEntry(entry) {
    entry.id = 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    entry.createdAt = new Date().toISOString();
    entry.updatedAt = entry.createdAt;
    journalEntries.unshift(entry);
    return saveJournal();
  }

  function updateJournalEntry(id, updates) {
    const idx = journalEntries.findIndex(e => e.id === id);
    if (idx === -1) return Promise.reject(new Error('Entry not found'));
    journalEntries[idx] = { ...journalEntries[idx], ...updates, updatedAt: new Date().toISOString() };
    return saveJournal();
  }

  function deleteJournalEntry(id) {
    journalEntries = journalEntries.filter(e => e.id !== id);
    return saveJournal();
  }

  // ════════════════════════════════════════════
  // PREFERENCES
  // ════════════════════════════════════════════

  async function loadPreferences() {
    const result = await syncGet('userPreferences');
    if (result.userPreferences) {
      prefs = { ...prefs, ...result.userPreferences };
    }
  }

  async function savePreferences() {
    await syncSet({ userPreferences: prefs });
  }

  async function sendToContentScript() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && /ticketmaster|livenation/.test(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_PREFERENCES', preferences: prefs });
      }
    } catch (e) {}
  }

  async function updatePref(key, value) {
    prefs[key] = value;
    await savePreferences();
    await sendToContentScript();
  }

  // ════════════════════════════════════════════
  // SENSORY PROFILES — CRUD & STORAGE
  // ════════════════════════════════════════════

  function getAllProfiles() {
    return [...BUILT_IN_PROFILES, ...customProfiles];
  }

  async function loadProfiles() {
    const result = await syncGet('sensoryProfiles');
    customProfiles = result.sensoryProfiles || [];
  }

  async function saveProfiles() {
    await syncSet({ sensoryProfiles: customProfiles });
  }

  async function applyProfileFromPopup(profileId) {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) {
      prefs.activeProfileId = null;
      await savePreferences();
      await sendToContentScript();
      return;
    }

    // Merge profile settings into prefs
    const s = profile.settings;
    if (s.colourScheme !== undefined) prefs.colourScheme = s.colourScheme;
    if (s.fontFamily !== undefined) prefs.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) prefs.fontSize = s.fontSize;
    if (s.lineSpacing !== undefined) prefs.lineSpacing = s.lineSpacing;
    if (s.focusModeEnabled !== undefined) prefs.focusModeEnabled = s.focusModeEnabled;
    if (s.declutterEnabled !== undefined) prefs.declutterEnabled = s.declutterEnabled;
    if (s.animationFreezeEnabled !== undefined) prefs.animationFreezeEnabled = s.animationFreezeEnabled;
    prefs.activeProfileId = profileId;

    // Load MCDA weights from profile
    if (profile.mcdaWeights) {
      prefs.mcdaWeights = { ...profile.mcdaWeights };
    }

    await savePreferences();
    populateSettings(); // Update all UI controls

    // Send to content script — apply profile directly
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url && /ticketmaster|livenation/.test(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'APPLY_PROFILE', profileId: profileId });
      }
    } catch (e) {}
  }

  function createCustomProfile(name) {
    const profile = {
      id: 'custom_' + Date.now(),
      name: name,
      builtIn: false,
      description: '',
      settings: {
        focusModeEnabled: prefs.focusModeEnabled,
        colourScheme: prefs.colourScheme,
        fontFamily: prefs.fontFamily,
        fontSize: prefs.fontSize,
        lineSpacing: prefs.lineSpacing,
        declutterEnabled: prefs.declutterEnabled || false,
        animationFreezeEnabled: prefs.animationFreezeEnabled || false
      },
      mcdaWeights: { ...(prefs.mcdaWeights || { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 }) }
    };
    customProfiles.push(profile);
    return profile;
  }

  function deleteCustomProfile(profileId) {
    customProfiles = customProfiles.filter(p => p.id !== profileId);
    if (prefs.activeProfileId === profileId) {
      prefs.activeProfileId = null;
    }
  }

  function exportProfiles() {
    const allProfiles = getAllProfiles();
    const data = JSON.stringify(allProfiles, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sensory-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importProfiles(jsonStr) {
    let imported;
    try {
      imported = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Invalid JSON file');
    }

    if (!Array.isArray(imported)) throw new Error('Expected an array of profiles');

    let count = 0;
    const existingMap = new Map(customProfiles.map(p => [p.id, p]));

    imported.forEach(p => {
      // Skip built-in profiles
      if (p.builtIn) return;
      // Validate structure
      if (!p.id || !p.name || !p.settings) return;
      existingMap.set(p.id, { ...p, builtIn: false });
      count++;
    });

    customProfiles = Array.from(existingMap.values());
    return count;
  }

  // ════════════════════════════════════════════
  // UI RENDERING
  // ════════════════════════════════════════════

  const $ = id => document.getElementById(id);

  // ── Tabs ──
  function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tpanel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(`tab-${tab.dataset.tab}`).classList.add('active');
      });
    });
  }

  // ── Auth UI ──
  function updateAuthUI() {
    const loggedIn = !!currentUser;

    // User banner
    $('userBanner').classList.toggle('hidden', !loggedIn);
    if (loggedIn) {
      $('userAvatar').textContent = currentUser.displayName.charAt(0).toUpperCase();
      $('userName').textContent = currentUser.displayName;
    }

    // Journal tab
    $('journalLoginPrompt').classList.toggle('hidden', loggedIn);
    $('journalContent').classList.toggle('hidden', !loggedIn);

    // Account tab
    $('loginView').classList.toggle('active', !loggedIn);
    $('registerView').classList.remove('active');
    $('accountView').classList.toggle('active', loggedIn);

    if (loggedIn) {
      $('accountName').textContent = currentUser.displayName;
      $('accountEmail').textContent = currentUser.email;
      $('accountCreated').textContent = `Member since ${new Date(currentUser.createdAt).toLocaleDateString()}`;
      $('accountStats').textContent = `${journalEntries.length} journal ${journalEntries.length === 1 ? 'entry' : 'entries'}`;
    }
  }

  // ── Journal UI ──
  function renderJournalEntries() {
    const container = $('journalEntries');
    if (!container) return;

    if (journalEntries.length === 0) {
      container.innerHTML = `
        <div class="jempty">
          <span class="ic ic-lg" style="display:block;margin:0 auto 6px;color:var(--text-3)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg></span>
          <p>No entries yet. Add your first concert experience!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = journalEntries.map(entry => {
      const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));
      const tags = (entry.tags || []).map(t => 
        `<span class="jtag">${TAG_LABELS[t] || t}</span>`
      ).join('');
      const dateStr = entry.date 
        ? new Date(entry.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';

      return `
        <div class="jentry" data-id="${entry.id}">
          <div class="jentry-hdr">
            <div>
              <div class="jentry-title">${escapeHtml(entry.eventName)}</div>
              ${entry.venue ? `<div class="jentry-venue">${escapeHtml(entry.venue)}</div>` : ''}
              ${entry.section ? `<div class="jentry-venue">${escapeHtml(entry.section)}</div>` : ''}
            </div>
            <div class="jentry-date">${dateStr}</div>
          </div>
          <div class="jentry-ratings">
            ${entry.ratingOverall ? `<span class="jrating">Overall <span class="jrating-stars">${stars(entry.ratingOverall)}</span></span>` : ''}
            ${entry.ratingSensory ? `<span class="jrating">Sensory <span class="jrating-stars">${stars(entry.ratingSensory)}</span></span>` : ''}
            ${entry.ratingAccessibility ? `<span class="jrating">Access <span class="jrating-stars">${stars(entry.ratingAccessibility)}</span></span>` : ''}
          </div>
          ${entry.notes ? `<div class="jentry-notes">${escapeHtml(entry.notes)}</div>` : ''}
          ${tags ? `<div class="jentry-tags">${tags}</div>` : ''}
          <div class="jactions">
            <button class="btn btn-g btn-sm jedit-btn" data-id="${entry.id}">Edit</button>
            <button class="btn btn-g btn-sm jdel-btn" data-id="${entry.id}" style="color:var(--danger)">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Event listeners
    container.querySelectorAll('.jedit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditEntry(btn.dataset.id));
    });
    container.querySelectorAll('.jdel-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this entry?')) {
          await deleteJournalEntry(btn.dataset.id);
          renderJournalEntries();
          updateAuthUI();
          showStatus('journalStatus', 'Entry deleted', 'success');
        }
      });
    });
  }

  function openEntryForm(entry = null) {
    $('journalForm').classList.remove('hidden');
    $('addEntryBtn').classList.add('hidden');
    $('journalFormTitle').textContent = entry ? 'Edit Entry' : 'New Entry';

    $('entryEventName').value = entry?.eventName || '';
    $('entryVenue').value = entry?.venue || '';
    $('entryDate').value = entry?.date || '';
    $('entrySection').value = entry?.section || '';
    $('entryNotes').value = entry?.notes || '';
    $('entryEditId').value = entry?.id || '';

    // Set star ratings
    starRatings.ratingOverall = entry?.ratingOverall || 0;
    starRatings.ratingSensory = entry?.ratingSensory || 0;
    starRatings.ratingAccessibility = entry?.ratingAccessibility || 0;
    updateStarDisplays();

    // Set tags
    document.querySelectorAll('.tag-checkbox').forEach(cb => {
      cb.checked = (entry?.tags || []).includes(cb.value);
    });

    $('entryEventName').focus();
  }

  function closeEntryForm() {
    $('journalForm').classList.add('hidden');
    $('addEntryBtn').classList.remove('hidden');
    $('entryEditId').value = '';
  }

  function openEditEntry(id) {
    const entry = journalEntries.find(e => e.id === id);
    if (entry) openEntryForm(entry);
  }

  async function saveEntry() {
    const eventName = $('entryEventName').value.trim();
    if (!eventName) {
      showStatus('journalStatus', 'Event name is required', 'error');
      return;
    }

    const tags = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);

    const entryData = {
      eventName,
      venue: $('entryVenue').value.trim(),
      date: $('entryDate').value,
      section: $('entrySection').value.trim(),
      ratingOverall: starRatings.ratingOverall,
      ratingSensory: starRatings.ratingSensory,
      ratingAccessibility: starRatings.ratingAccessibility,
      tags,
      notes: $('entryNotes').value.trim()
    };

    const editId = $('entryEditId').value;

    try {
      if (editId) {
        await updateJournalEntry(editId, entryData);
        showStatus('journalStatus', 'Entry updated', 'success');
      } else {
        await addJournalEntry(entryData);
        showStatus('journalStatus', 'Entry saved!', 'success');
      }
      closeEntryForm();
      renderJournalEntries();
      updateAuthUI();
    } catch (e) {
      showStatus('journalStatus', e.message, 'error');
    }
  }

  // ── Star ratings ──
  function initStarRatings() {
    document.querySelectorAll('.stars').forEach(container => {
      const field = container.dataset.field;
      container.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const value = parseInt(btn.dataset.value);
          // Toggle: clicking same value resets to 0
          starRatings[field] = starRatings[field] === value ? 0 : value;
          updateStarDisplays();
        });
      });
    });
  }

  function updateStarDisplays() {
    Object.keys(starRatings).forEach(field => {
      const container = $(field);
      if (!container) return;
      const value = starRatings[field];
      container.querySelectorAll('.star-btn').forEach(btn => {
        const v = parseInt(btn.dataset.value);
        btn.classList.toggle('filled', v <= value);
      });
    });
  }

  // ── Settings UI ──
  function populateSettings() {
    $('focusModeToggle').checked = prefs.focusModeEnabled;
    $('panelToggle').checked = prefs.panelOpen !== false;
    $('maxPriceSlider').value = prefs.maxPrice;
    $('priceValue').textContent = `£${prefs.maxPrice}`;
    $('colourScheme').value = prefs.colourScheme || 'default';
    updateSchemePreview();
    $('fontFamily').value = prefs.fontFamily;
    $('fontSizeSlider').value = prefs.fontSize;
    $('fontSizeValue').textContent = `${prefs.fontSize}px`;
    $('lineSpacingSlider').value = prefs.lineSpacing;
    $('lineSpacingValue').textContent = `${prefs.lineSpacing}×`;
    updateFontPreview();
    updatePriceSectionState();
    populateQuickProfileSelect();
    // MCDA state
    populateMCDASettings();
  }

  // MCDA presets (must match content.js)
  const POPUP_MCDA_PRESETS = {
    balanced:  { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 },
    cheapest:  { price: 50, viewQuality: 20, proximity: 15, aisleAccess: 15 },
    bestView:  { price: 15, viewQuality: 50, proximity: 20, aisleAccess: 15 },
    closeUp:   { price: 15, viewQuality: 20, proximity: 50, aisleAccess: 15 },
    easyExit:  { price: 15, viewQuality: 15, proximity: 20, aisleAccess: 50 }
  };

  const POPUP_SLIDER_MAP = [
    { sliderId: 'mcdaPriceSlider', dispId: 'mcdaPriceDisp', key: 'price' },
    { sliderId: 'mcdaViewSlider', dispId: 'mcdaViewDisp', key: 'viewQuality' },
    { sliderId: 'mcdaProxSlider', dispId: 'mcdaProxDisp', key: 'proximity' },
    { sliderId: 'mcdaAisleSlider', dispId: 'mcdaAisleDisp', key: 'aisleAccess' }
  ];

  function populateMCDASettings() {
    const toggle = $('mcdaToggle');
    const weightsSection = $('mcdaWeightsSection');
    if (!toggle) return;
    toggle.checked = prefs.mcdaEnabled;
    if (weightsSection) {
      weightsSection.classList.toggle('hidden', !prefs.mcdaEnabled);
    }
    syncPopupMCDASliders();
    highlightPopupMCDAPreset();
  }

  function syncPopupMCDASliders() {
    const w = prefs.mcdaWeights || { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 };
    const total = w.price + w.viewQuality + w.proximity + w.aisleAccess;

    POPUP_SLIDER_MAP.forEach(s => {
      const slider = $(s.sliderId);
      const disp = $(s.dispId);
      if (slider) slider.value = w[s.key];
      if (disp) {
        const pct = total > 0 ? Math.round((w[s.key] / total) * 100) : 25;
        disp.textContent = `${pct}%`;
      }
    });
  }

  function highlightPopupMCDAPreset() {
    const w = prefs.mcdaWeights || {};
    const container = $('mcdaPresetBtns');
    if (!container) return;

    container.querySelectorAll('[data-mcda-preset]').forEach(btn => {
      const preset = POPUP_MCDA_PRESETS[btn.dataset.mcdaPreset];
      if (!preset) return;
      const isActive = w.price === preset.price && w.viewQuality === preset.viewQuality &&
                       w.proximity === preset.proximity && w.aisleAccess === preset.aisleAccess;
      btn.style.borderColor = isActive ? 'var(--accent)' : '';
      btn.style.color = isActive ? 'var(--accent)' : '';
      btn.style.background = isActive ? 'var(--accent-dim)' : '';
    });
  }

  function updateSchemePreview() {
    const info = SCHEME_INFO[prefs.colourScheme] || SCHEME_INFO['default'];
    $('swatch1').style.background = info.swatches[0];
    $('swatch2').style.background = info.swatches[1];
    $('swatch3').style.background = info.swatches[2];
    $('schemeDescription').textContent = info.description;
  }

  function updateFontPreview() {
    const el = $('fontPreviewText');
    el.style.fontFamily = FONT_FAMILIES[prefs.fontFamily] || 'inherit';
    el.style.fontSize = `${prefs.fontSize}px`;
    el.style.lineHeight = prefs.lineSpacing;
  }

  function updatePriceSectionState() {
    const active = prefs.focusModeEnabled || prefs.mcdaEnabled;
    $('priceSection').style.opacity = active ? '1' : '0.5';
    $('priceSection').style.pointerEvents = active ? 'auto' : 'none';
  }

  // ── Quick Profile Selector (Settings tab) ──
  function populateQuickProfileSelect() {
    const select = $('quickProfileSelect');
    if (!select) return;

    const allProfiles = getAllProfiles();
    const currentActive = prefs.activeProfileId || '';

    select.innerHTML = `<option value="">No Profile (Manual)</option>`;
    allProfiles.forEach(p => {
      const prefix = p.builtIn ? '★ ' : '';
      const selected = p.id === currentActive ? 'selected' : '';
      select.innerHTML += `<option value="${p.id}" ${selected}>${prefix}${escapeHtml(p.name)}</option>`;
    });

    // Update hint text
    const hint = $('quickProfileHint');
    if (hint) {
      const activeProfile = allProfiles.find(p => p.id === currentActive);
      hint.textContent = activeProfile
        ? `Active: ${activeProfile.name}`
        : 'Select a sensory profile to apply all its settings at once';
    }
  }

  // ── Profiles Tab UI ──
  function renderProfileList() {
    const container = $('profileList');
    if (!container) return;

    const allProfiles = getAllProfiles();
    const activeId = prefs.activeProfileId || '';

    if (allProfiles.length === 0) {
      container.innerHTML = '<div class="jempty"><p>No profiles yet.</p></div>';
      return;
    }

    container.innerHTML = allProfiles.map(profile => {
      const isActive = profile.id === activeId;
      const s = profile.settings || {};

      // Build settings chips
      const chips = [];
      if (s.colourScheme) chips.push(SCHEME_INFO[s.colourScheme]?.label || s.colourScheme);
      if (s.fontFamily && s.fontFamily !== 'default') chips.push(FONT_LABELS[s.fontFamily] || s.fontFamily);
      if (s.fontSize && s.fontSize !== 16) chips.push(`${s.fontSize}px`);
      if (s.focusModeEnabled) chips.push('Focus');
      if (s.declutterEnabled) chips.push('Declutter');
      if (s.animationFreezeEnabled) chips.push('Freeze');

      // MCDA weight summary
      const mw = profile.mcdaWeights;
      if (mw) {
        const dominant = Object.entries(mw).sort((a, b) => b[1] - a[1])[0];
        const labels = { price: 'Price', viewQuality: 'View', proximity: 'Proximity', aisleAccess: 'Aisle' };
        if (dominant[1] > 30) chips.push(`MCDA: ${labels[dominant[0]]} ${dominant[1]}%`);
      }

      return `
        <div class="prof-card ${isActive ? 'prof-active' : ''}" data-profile-id="${profile.id}">
          <div class="prof-card-hdr">
            <span class="prof-card-name">${escapeHtml(profile.name)}</span>
            <div style="display:flex;gap:4px;align-items:center;">
              ${isActive ? '<span class="prof-card-badge active-badge">Active</span>' : ''}
              <span class="prof-card-badge ${profile.builtIn ? 'builtin' : 'custom'}">${profile.builtIn ? 'Built-in' : 'Custom'}</span>
            </div>
          </div>
          ${profile.description ? `<div class="prof-card-desc">${escapeHtml(profile.description)}</div>` : ''}
          ${chips.length > 0 ? `
            <div class="prof-card-settings">
              ${chips.map(c => `<span class="prof-setting-chip">${c}</span>`).join('')}
            </div>
          ` : ''}
          <div class="prof-card-actions">
            <button class="btn btn-g btn-sm prof-apply-btn" data-profile-id="${profile.id}">
              ${isActive ? 'Re-apply' : 'Apply'}
            </button>
            ${!profile.builtIn ? `
              <button class="btn btn-g btn-sm prof-delete-btn" data-profile-id="${profile.id}" style="color:var(--danger)">Delete</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    container.querySelectorAll('.prof-apply-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await applyProfileFromPopup(btn.dataset.profileId);
        renderProfileList();
        populateQuickProfileSelect();
        showStatus('profilesStatus', 'Profile applied!', 'success');
      });
    });

    container.querySelectorAll('.prof-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const profileId = btn.dataset.profileId;
        const profile = customProfiles.find(p => p.id === profileId);
        if (confirm(`Delete profile "${profile?.name || 'Unknown'}"?`)) {
          deleteCustomProfile(profileId);
          await saveProfiles();
          await savePreferences();
          await sendToContentScript();
          renderProfileList();
          populateQuickProfileSelect();
          showStatus('profilesStatus', 'Profile deleted', 'success');
        }
      });
    });
  }

  // ── Status messages ──
  function showStatus(elementId, message, type) {
    const el = $(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `sts show ${type === 'success' ? 'ok' : 'err'}`;
    setTimeout(() => el.classList.remove('show'), 3500);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ════════════════════════════════════════════
  // EVENT LISTENERS
  // ════════════════════════════════════════════

  function setupListeners() {
    // ── Auth ──
    $('showRegisterBtn').addEventListener('click', () => {
      $('loginView').classList.remove('active');
      $('registerView').classList.add('active');
    });

    $('showLoginBtn').addEventListener('click', () => {
      $('registerView').classList.remove('active');
      $('loginView').classList.add('active');
    });

    $('loginBtn').addEventListener('click', async () => {
      try {
        await login($('loginEmail').value, $('loginPassword').value);
        await loadJournal();
        updateAuthUI();
        renderJournalEntries();
        showStatus('accountStatus', 'Logged in!', 'success');
        // Switch to journal tab
        document.querySelector('[data-tab="journal"]').click();
      } catch (e) {
        showStatus('accountStatus', e.message, 'error');
      }
    });

    $('registerBtn').addEventListener('click', async () => {
      const pw = $('registerPassword').value;
      const pwConfirm = $('registerPasswordConfirm').value;
      if (pw !== pwConfirm) {
        showStatus('accountStatus', 'Passwords do not match', 'error');
        return;
      }
      try {
        await register($('registerName').value.trim(), $('registerEmail').value, pw);
        await loadJournal();
        updateAuthUI();
        renderJournalEntries();
        showStatus('accountStatus', 'Account created!', 'success');
        document.querySelector('[data-tab="journal"]').click();
      } catch (e) {
        showStatus('accountStatus', e.message, 'error');
      }
    });

    const doLogout = async () => {
      await logout();
      updateAuthUI();
      showStatus('accountStatus', 'Logged out', 'success');
      document.querySelector('[data-tab="account"]').click();
    };

    $('logoutBtnTop').addEventListener('click', doLogout);
    $('logoutBtn2').addEventListener('click', doLogout);

    $('deleteAccountBtn').addEventListener('click', async () => {
      if (confirm('This will permanently delete your account and all journal entries. Are you sure?')) {
        await deleteAccount();
        updateAuthUI();
        showStatus('accountStatus', 'Account deleted', 'success');
      }
    });

    // ── Journal ──
    $('journalGoLogin').addEventListener('click', () => {
      document.querySelector('[data-tab="account"]').click();
    });

    $('addEntryBtn').addEventListener('click', () => openEntryForm());
    $('cancelEntryBtn').addEventListener('click', closeEntryForm);
    $('saveEntryBtn').addEventListener('click', saveEntry);

    // ── Settings ──
    // Focus mode listener is in the MCDA section below (with mutual exclusion)

    $('panelToggle').addEventListener('change', (e) => updatePref('panelOpen', e.target.checked));

    $('maxPriceSlider').addEventListener('input', (e) => {
      $('priceValue').textContent = `£${e.target.value}`;
    });
    $('maxPriceSlider').addEventListener('change', (e) => updatePref('maxPrice', parseInt(e.target.value)));

    $('colourScheme').addEventListener('change', (e) => {
      prefs.colourScheme = e.target.value;
      updateSchemePreview();
      updatePref('colourScheme', e.target.value);
    });

    $('fontFamily').addEventListener('change', (e) => {
      prefs.fontFamily = e.target.value;
      updateFontPreview();
      updatePref('fontFamily', e.target.value);
    });

    $('fontSizeSlider').addEventListener('input', (e) => {
      prefs.fontSize = parseInt(e.target.value);
      $('fontSizeValue').textContent = `${prefs.fontSize}px`;
      updateFontPreview();
    });
    $('fontSizeSlider').addEventListener('change', (e) => updatePref('fontSize', parseInt(e.target.value)));

    $('lineSpacingSlider').addEventListener('input', (e) => {
      prefs.lineSpacing = parseFloat(e.target.value);
      $('lineSpacingValue').textContent = `${prefs.lineSpacing.toFixed(1)}×`;
      updateFontPreview();
    });
    $('lineSpacingSlider').addEventListener('change', (e) => updatePref('lineSpacing', parseFloat(e.target.value)));

    // ── MCDA Heatmap ──
    $('mcdaToggle').addEventListener('change', (e) => {
      prefs.mcdaEnabled = e.target.checked;
      // Mutual exclusion: disable focus mode when enabling MCDA
      if (prefs.mcdaEnabled && prefs.focusModeEnabled) {
        prefs.focusModeEnabled = false;
        $('focusModeToggle').checked = false;
      }
      populateMCDASettings();
      updatePriceSectionState();
      savePreferences();
      sendToContentScript();
    });

    // MCDA preset buttons
    document.querySelectorAll('#mcdaPresetBtns [data-mcda-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = POPUP_MCDA_PRESETS[btn.dataset.mcdaPreset];
        if (!preset) return;
        prefs.mcdaWeights = { ...preset };
        syncPopupMCDASliders();
        highlightPopupMCDAPreset();
        savePreferences();
        sendToContentScript();
      });
    });

    // MCDA custom weight sliders (independent, no auto-redistribute)
    POPUP_SLIDER_MAP.forEach(s => {
      const slider = $(s.sliderId);
      if (!slider) return;

      slider.addEventListener('input', () => {
        prefs.mcdaWeights[s.key] = parseInt(slider.value, 10);
        // Update all % displays (normalised)
        const w = prefs.mcdaWeights;
        const total = w.price + w.viewQuality + w.proximity + w.aisleAccess;
        POPUP_SLIDER_MAP.forEach(m => {
          const disp = $(m.dispId);
          if (disp) {
            const pct = total > 0 ? Math.round((w[m.key] / total) * 100) : 25;
            disp.textContent = `${pct}%`;
          }
        });
        highlightPopupMCDAPreset();
      });

      slider.addEventListener('change', () => {
        savePreferences();
        sendToContentScript();
      });
    });

    // Focus mode: mutual exclusion with MCDA
    $('focusModeToggle').addEventListener('change', (e) => {
      prefs.focusModeEnabled = e.target.checked;
      if (prefs.focusModeEnabled && prefs.mcdaEnabled) {
        prefs.mcdaEnabled = false;
        $('mcdaToggle').checked = false;
        populateMCDASettings();
      }
      updatePref('focusModeEnabled', e.target.checked);
      updatePriceSectionState();
    });

    // Allow Enter key on login/register forms
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('loginBtn').click(); });
    $('registerPasswordConfirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('registerBtn').click(); });

    // ── Quick Profile Selector (Settings tab) ──
    $('quickProfileSelect').addEventListener('change', async (e) => {
      const profileId = e.target.value;
      if (profileId) {
        await applyProfileFromPopup(profileId);
        renderProfileList();
        showStatus('settingsStatus', 'Profile applied!', 'success');
      } else {
        prefs.activeProfileId = null;
        await savePreferences();
        await sendToContentScript();
        populateQuickProfileSelect();
        renderProfileList();
      }
    });

    // ── Profiles Tab ──
    $('profileCreateBtn').addEventListener('click', () => {
      $('profileFormWrapper').classList.remove('hidden');
      $('profileCreateBtn').classList.add('hidden');
      $('profileNameInput').value = '';
      $('profileNameInput').focus();
    });

    $('profileCancelBtn').addEventListener('click', () => {
      $('profileFormWrapper').classList.add('hidden');
      $('profileCreateBtn').classList.remove('hidden');
    });

    $('profileSaveBtn').addEventListener('click', async () => {
      const name = $('profileNameInput').value.trim();
      if (!name) {
        showStatus('profilesStatus', 'Profile name is required', 'error');
        return;
      }
      if (name.length > 40) {
        showStatus('profilesStatus', 'Profile name too long (max 40 chars)', 'error');
        return;
      }

      createCustomProfile(name);
      await saveProfiles();

      $('profileFormWrapper').classList.add('hidden');
      $('profileCreateBtn').classList.remove('hidden');

      renderProfileList();
      populateQuickProfileSelect();
      showStatus('profilesStatus', `Profile "${name}" created!`, 'success');
    });

    // Enter key on profile name input
    $('profileNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('profileSaveBtn').click();
    });

    // Export
    $('profileExportBtn').addEventListener('click', () => {
      exportProfiles();
      showStatus('profilesStatus', 'Profiles exported!', 'success');
    });

    // Import
    $('profileImportBtn').addEventListener('click', () => {
      $('profileImportInput').click();
    });

    $('profileImportInput').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const count = importProfiles(text);
        await saveProfiles();
        renderProfileList();
        populateQuickProfileSelect();
        showStatus('profilesStatus', `Imported ${count} profile${count === 1 ? '' : 's'}!`, 'success');
      } catch (err) {
        showStatus('profilesStatus', err.message, 'error');
      }

      // Reset file input so same file can be re-imported
      e.target.value = '';
    });
  }

  // ════════════════════════════════════════════
  // FONT LOADING
  // ════════════════════════════════════════════

  function loadPreviewFonts() {
    if (document.getElementById('preview-fonts')) return;
    const link = document.createElement('link');
    link.id = 'preview-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `@font-face { font-family: 'OpenDyslexic'; src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff'); }`;
    document.head.appendChild(style);
  }

  // ════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════

  async function init() {
    console.log('[Popup] Initialising v5.0');
    loadPreviewFonts();
    initTabs();
    initStarRatings();

    await loadPreferences();
    await loadProfiles();
    populateSettings();
    renderProfileList();

    const loggedIn = await restoreSession();
    if (loggedIn) {
      await loadJournal();
      renderJournalEntries();
    }
    updateAuthUI();

    setupListeners();
    console.log('[Popup] Ready', loggedIn ? `(logged in as ${currentUser.displayName})` : '(not logged in)',
      `| ${customProfiles.length} custom profiles`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();