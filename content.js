/**
 * Ticketmaster Accessibility Helper - Content Script (MAIN world)
 * 
 * Runs in MAIN world on Ticketmaster pages.
 * 
 * Features:
 * 1. Sidebar-only seat data capture (auto-scrolls TM listing panel)
 * 2. Companion side panel with filterable seat display
 * 3. Colour scheme customisation (accessibility palettes)
 * 4. Focus mode — dims unavailable SVG seats based on sidebar data
 * 5. Typography customisation
 * 6. Declutter mode — hides ad units (ad_unit / Google ads)
 * 7. Animation freeze — stops all host page animations/transitions
 * 8. Pin-to-compare — pin up to 2 seats for side-by-side comparison
 * 9. Sensory profile system — named presets bundling all settings
 * 10. MCDA heatmap — multi-criteria scoring + seat map colour coding
 * 
 * v4.0: Simplified to sidebar-only extraction. Previous API interception,
 * SVG scraping, and __NEXT_DATA__ parsing removed — the sidebar is the
 * single source of truth for available tickets.
 * 
 * v4.3: Removed clickThroughSections (was hijacking TM map navigation).
 * Added strict hasStrongSignal filter — only elements with "Section NNN" or 
 * "SECTION"+"ROW" DOM patterns pass. Rejects garbage entries ("0 No results",
 * "VIP Packages", "Full Price Ticket", delivery fees). Focus mode is CSS-only.
 */

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // MAPBOX GL INTERCEPTOR
  // ══════════════════════════════════════════════════════════════
  // Runs at document_start (before page scripts). Captures the
  // Mapbox GL map instance so we can repaint section fill layers
  // for the MCDA heatmap and focus mode on Viagogo/StubHub.

  const _capturedMapInstances = [];

  function _installMapboxInterceptor() {
    // If mapboxgl is already loaded, patch immediately
    if (window.mapboxgl?.Map) {
      _patchMapConstructor(window.mapboxgl);
      return;
    }

    // Watch for mapboxgl to appear on window (lazy-loaded)
    let _patched = false;
    const origMapboxgl = window.mapboxgl;
    
    Object.defineProperty(window, 'mapboxgl', {
      configurable: true,
      enumerable: true,
      get() { return origMapboxgl; },
      set(val) {
        // Remove our interceptor and set the real value
        Object.defineProperty(window, 'mapboxgl', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: val
        });
        if (val && val.Map && !_patched) {
          _patched = true;
          _patchMapConstructor(val);
        }
      }
    });
  }

  function _patchMapConstructor(mbgl) {
    const OrigMap = mbgl.Map;
    
    mbgl.Map = function (...args) {
      const instance = new OrigMap(...args);
      _capturedMapInstances.push(instance);
      console.log(`[A11y Helper] 🗺️ Captured Mapbox GL map instance (#${_capturedMapInstances.length})`);
      return instance;
    };

    // Preserve prototype chain so instanceof checks still work
    mbgl.Map.prototype = OrigMap.prototype;
    
    // Copy static properties
    Object.keys(OrigMap).forEach(key => {
      try { mbgl.Map[key] = OrigMap[key]; } catch (e) {}
    });
  }

  // Install immediately (before page scripts load)
  try { _installMapboxInterceptor(); } catch (e) {
    console.log('[A11y Helper] Mapbox interceptor setup failed (non-fatal):', e.message);
  }

  // ══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ══════════════════════════════════════════════════════════════

  const FONT_FAMILIES = {
    'default': null,
    // Sans-Serif (General)
    'arial': 'Arial, Helvetica, sans-serif',
    'verdana': 'Verdana, Geneva, sans-serif',
    'tahoma': 'Tahoma, Geneva, sans-serif',
    'trebuchet': '"Trebuchet MS", sans-serif',
    'calibri': 'Calibri, "Gill Sans", sans-serif',
    // Accessibility Designed
    'atkinson': '"Atkinson Hyperlegible", sans-serif',
    'opendyslexic': 'OpenDyslexic, sans-serif',
    'lexend': 'Lexend, sans-serif',
    // High Readability
    'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
    'andika': 'Andika, sans-serif',
    'tiresias': '"Tiresias Infofont", Verdana, sans-serif',
    // Serif
    'georgia': 'Georgia, serif',
    'times': '"Times New Roman", Times, serif',
    'bitter': 'Bitter, Georgia, serif'
  };

  /** Font categories for grouped dropdown display */
  const FONT_CATEGORIES = [
    { label: 'Sans-Serif', fonts: [
      { key: 'default', name: 'Default (page font)' },
      { key: 'arial', name: 'Arial' },
      { key: 'verdana', name: 'Verdana' },
      { key: 'tahoma', name: 'Tahoma' },
      { key: 'trebuchet', name: 'Trebuchet MS' },
      { key: 'calibri', name: 'Calibri' },
    ]},
    { label: 'Accessibility Designed', fonts: [
      { key: 'atkinson', name: 'Atkinson Hyperlegible', note: 'Designed for low vision' },
      { key: 'opendyslexic', name: 'OpenDyslexic', note: 'Designed for dyslexia' },
      { key: 'lexend', name: 'Lexend', note: 'Improves reading fluency' },
    ]},
    { label: 'High Readability', fonts: [
      { key: 'comic-sans', name: 'Comic Sans', note: 'BDA recommended' },
      { key: 'andika', name: 'Andika', note: 'Literacy-focused' },
    ]},
    { label: 'Serif', fonts: [
      { key: 'georgia', name: 'Georgia' },
      { key: 'times', name: 'Times New Roman' },
      { key: 'bitter', name: 'Bitter' },
    ]},
  ];

  /** 
   * Colour schemes — each defines CSS custom properties applied to 
   * both the companion panel and seat map highlights.
   * 
   * Designed around common colour vision deficiencies and sensory needs.
   */
  const COLOUR_SCHEMES = {
    'default': {
      label: 'Default',
      description: 'Dark theme with green accents',
      '--tm-a11y-accent': '#3ecf8e',
      '--tm-a11y-seat-available': '#3ecf8e',
      '--tm-a11y-seat-available-bg': 'rgba(62, 207, 142, 0.10)',
      '--tm-a11y-seat-available-glow': 'rgba(62, 207, 142, 0.45)',
      '--tm-a11y-seat-overbudget': '#555a6b',
      '--tm-a11y-seat-unavailable': '#2a2e3d',
      '--tm-a11y-panel-bg': '#0d0f14',
      '--tm-a11y-panel-text': '#e4e6eb',
      '--tm-a11y-panel-text-secondary': '#8b90a0',
      '--tm-a11y-panel-border': '#2a2e3d',
      '--tm-a11y-panel-card-bg': '#13151c',
      '--tm-a11y-panel-header-bg': '#13151c',
      '--tm-a11y-panel-header-text': '#e4e6eb',
      '--tm-a11y-tag-budget': 'rgba(62, 207, 142, 0.10)',
      '--tm-a11y-tag-budget-text': '#3ecf8e',
      '--tm-a11y-tag-over': 'rgba(239, 68, 68, 0.10)',
      '--tm-a11y-tag-over-text': '#ef4444',
      // Heatmap tiers: best (T1) → worst (T5)
      '--tm-a11y-heat-t1': '#22c55e',
      '--tm-a11y-heat-t2': '#84cc16',
      '--tm-a11y-heat-t3': '#eab308',
      '--tm-a11y-heat-t4': '#f97316',
      '--tm-a11y-heat-t5': '#ef4444'
    },
    'high-contrast': {
      label: 'High Contrast',
      description: 'Maximum readability — bold black/white/yellow',
      '--tm-a11y-accent': '#FFD700',
      '--tm-a11y-seat-available': '#FFD700',
      '--tm-a11y-seat-available-bg': 'rgba(255, 215, 0, 0.15)',
      '--tm-a11y-seat-available-glow': 'rgba(255, 215, 0, 0.6)',
      '--tm-a11y-seat-overbudget': '#666666',
      '--tm-a11y-seat-unavailable': '#333333',
      '--tm-a11y-panel-bg': '#000000',
      '--tm-a11y-panel-text': '#ffffff',
      '--tm-a11y-panel-text-secondary': '#cccccc',
      '--tm-a11y-panel-border': '#444444',
      '--tm-a11y-panel-card-bg': '#1a1a1a',
      '--tm-a11y-panel-header-bg': '#111111',
      '--tm-a11y-panel-header-text': '#FFD700',
      '--tm-a11y-tag-budget': 'rgba(255, 215, 0, 0.15)',
      '--tm-a11y-tag-budget-text': '#FFD700',
      '--tm-a11y-tag-over': 'rgba(255, 68, 68, 0.15)',
      '--tm-a11y-tag-over-text': '#ff6666',
      '--tm-a11y-heat-t1': '#FFD700',
      '--tm-a11y-heat-t2': '#ffffff',
      '--tm-a11y-heat-t3': '#aaaaaa',
      '--tm-a11y-heat-t4': '#777777',
      '--tm-a11y-heat-t5': '#cc0000'
    },
    'deuteranopia': {
      label: 'Colour Blind Safe (Red-Green)',
      description: 'Blue/orange — safe for deuteranopia & protanopia',
      '--tm-a11y-accent': '#4dabf7',
      '--tm-a11y-seat-available': '#4dabf7',
      '--tm-a11y-seat-available-bg': 'rgba(77, 171, 247, 0.12)',
      '--tm-a11y-seat-available-glow': 'rgba(77, 171, 247, 0.45)',
      '--tm-a11y-seat-overbudget': '#EE7733',
      '--tm-a11y-seat-unavailable': '#3a3a3a',
      '--tm-a11y-panel-bg': '#0c1017',
      '--tm-a11y-panel-text': '#e4e6eb',
      '--tm-a11y-panel-text-secondary': '#8b90a0',
      '--tm-a11y-panel-border': '#252a38',
      '--tm-a11y-panel-card-bg': '#121620',
      '--tm-a11y-panel-header-bg': '#121620',
      '--tm-a11y-panel-header-text': '#e4e6eb',
      '--tm-a11y-tag-budget': 'rgba(77, 171, 247, 0.12)',
      '--tm-a11y-tag-budget-text': '#4dabf7',
      '--tm-a11y-tag-over': 'rgba(238, 119, 51, 0.12)',
      '--tm-a11y-tag-over-text': '#EE7733',
      '--tm-a11y-heat-t1': '#0077BB',
      '--tm-a11y-heat-t2': '#33BBEE',
      '--tm-a11y-heat-t3': '#EE7733',
      '--tm-a11y-heat-t4': '#CC3311',
      '--tm-a11y-heat-t5': '#991100'
    },
    'tritanopia': {
      label: 'Colour Blind Safe (Blue-Yellow)',
      description: 'Red/cyan — safe for tritanopia',
      '--tm-a11y-accent': '#ff6b6b',
      '--tm-a11y-seat-available': '#ff6b6b',
      '--tm-a11y-seat-available-bg': 'rgba(255, 107, 107, 0.12)',
      '--tm-a11y-seat-available-glow': 'rgba(255, 107, 107, 0.45)',
      '--tm-a11y-seat-overbudget': '#33BBEE',
      '--tm-a11y-seat-unavailable': '#3a3a3a',
      '--tm-a11y-panel-bg': '#110d0d',
      '--tm-a11y-panel-text': '#e4e6eb',
      '--tm-a11y-panel-text-secondary': '#8b90a0',
      '--tm-a11y-panel-border': '#2e2528',
      '--tm-a11y-panel-card-bg': '#1a1416',
      '--tm-a11y-panel-header-bg': '#1a1416',
      '--tm-a11y-panel-header-text': '#e4e6eb',
      '--tm-a11y-tag-budget': 'rgba(255, 107, 107, 0.12)',
      '--tm-a11y-tag-budget-text': '#ff6b6b',
      '--tm-a11y-tag-over': 'rgba(51, 187, 238, 0.12)',
      '--tm-a11y-tag-over-text': '#33BBEE',
      '--tm-a11y-heat-t1': '#CC3311',
      '--tm-a11y-heat-t2': '#ff6b6b',
      '--tm-a11y-heat-t3': '#999999',
      '--tm-a11y-heat-t4': '#33BBEE',
      '--tm-a11y-heat-t5': '#991100'
    },
    'muted': {
      label: 'Muted / Calm',
      description: 'Soft earth tones — reduced sensory stimulation',
      '--tm-a11y-accent': '#8fbc8f',
      '--tm-a11y-seat-available': '#8fbc8f',
      '--tm-a11y-seat-available-bg': 'rgba(143, 188, 143, 0.12)',
      '--tm-a11y-seat-available-glow': 'rgba(143, 188, 143, 0.3)',
      '--tm-a11y-seat-overbudget': '#7a7268',
      '--tm-a11y-seat-unavailable': '#3a3530',
      '--tm-a11y-panel-bg': '#141210',
      '--tm-a11y-panel-text': '#d8d0c8',
      '--tm-a11y-panel-text-secondary': '#8a8480',
      '--tm-a11y-panel-border': '#2a2622',
      '--tm-a11y-panel-card-bg': '#1a1815',
      '--tm-a11y-panel-header-bg': '#1a1815',
      '--tm-a11y-panel-header-text': '#d8d0c8',
      '--tm-a11y-tag-budget': 'rgba(143, 188, 143, 0.12)',
      '--tm-a11y-tag-budget-text': '#8fbc8f',
      '--tm-a11y-tag-over': 'rgba(196, 160, 130, 0.12)',
      '--tm-a11y-tag-over-text': '#c4a082',
      '--tm-a11y-heat-t1': '#8fbc8f',
      '--tm-a11y-heat-t2': '#b5c4a0',
      '--tm-a11y-heat-t3': '#c4a082',
      '--tm-a11y-heat-t4': '#8a7e74',
      '--tm-a11y-heat-t5': '#a04040'
    },
    'dark': {
      label: 'Dark Mode',
      description: 'Extra low brightness for light sensitivity',
      '--tm-a11y-accent': '#60a5fa',
      '--tm-a11y-seat-available': '#4ade80',
      '--tm-a11y-seat-available-bg': 'rgba(74, 222, 128, 0.10)',
      '--tm-a11y-seat-available-glow': 'rgba(74, 222, 128, 0.35)',
      '--tm-a11y-seat-overbudget': '#4b5563',
      '--tm-a11y-seat-unavailable': '#1f2937',
      '--tm-a11y-panel-bg': '#090b10',
      '--tm-a11y-panel-text': '#e5e7eb',
      '--tm-a11y-panel-text-secondary': '#9ca3af',
      '--tm-a11y-panel-border': '#1e2433',
      '--tm-a11y-panel-card-bg': '#0f1219',
      '--tm-a11y-panel-header-bg': '#0f1219',
      '--tm-a11y-panel-header-text': '#e5e7eb',
      '--tm-a11y-tag-budget': 'rgba(74, 222, 128, 0.10)',
      '--tm-a11y-tag-budget-text': '#4ade80',
      '--tm-a11y-tag-over': 'rgba(239, 68, 68, 0.10)',
      '--tm-a11y-tag-over-text': '#f87171',
      '--tm-a11y-heat-t1': '#4ade80',
      '--tm-a11y-heat-t2': '#a3e635',
      '--tm-a11y-heat-t3': '#facc15',
      '--tm-a11y-heat-t4': '#f97316',
      '--tm-a11y-heat-t5': '#dc2626'
    }
  };

  /**
   * Ticketmaster DOM selectors for FOMO/urgency/promotional elements.
   * These are elements that create anxiety for neurodivergent users:
   * countdown timers, "only X left", upsell banners, VIP upgrade nudges, etc.
   * 
   * Selectors target both class-based and data-testid-based patterns
   * observed across TM UK, TM US, and TM EU domains.
   */
  const DEFAULT_PREFERENCES = {
    focusModeEnabled: false,
    maxPrice: 150,
    fontFamily: 'default',
    fontSize: 16,
    lineSpacing: 1.5,
    colourScheme: 'default',
    panelOpen: true,
    sectionFilter: 'all',
    sortBy: 'price-asc',
    userId: null,
    // New feature preferences
    declutterEnabled: false,
    animationFreezeEnabled: false,
    activeProfileId: null,
    // MCDA heatmap preferences
    mcdaEnabled: false,
    mcdaWeights: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 },
    ticketQty: 0,
    // Advanced filters
    sellerFilter: 'all',   // 'all', 'primary', 'resale'
    rowMin: '',            // '' = no filter, 'A' or '1' etc.
    rowMax: ''
  };

  // ══════════════════════════════════════════════════════════════
  // SENSORY PROFILE SYSTEM — BUILT-IN PRESETS
  // ══════════════════════════════════════════════════════════════

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

  // ══════════════════════════════════════════════════════════════
  // STATE
  // ══════════════════════════════════════════════════════════════

  let currentPreferences = { ...DEFAULT_PREFERENCES };
  let capturedSeats = [];
  let eventMeta = { eventId: null, eventName: null, venue: null };
  let panelElement = null;
  let styleElement = null;
  let extensionBaseUrl = ''; // Set by bridge.js via postMessage
  let mutationObserver = null;
  let isInitialised = false;

  // New feature state
  let declutterStyleElement = null;
  let animationFreezeStyleElement = null;
  let pinnedSeats = []; // Max 2 pinned seats for comparison
  let declutterHiddenCount = 0;
  let currentPanelTab = 'seats';
  let scanState = 'ready';
  let scanProgress = 0;
  let currentAdapter = null; // Set during initialise()
  let customProfiles = [];    // User-created sensory profiles
  let activeProfileId = null; // Currently active profile ID
  let mcdaScores = new Map(); // seatContentKey → { score, tier, subscores }

  // ── Auth & Journal state ──
  let _authUser = null;        // { email, displayName, createdAt } or null
  let _journalEntries = [];    // Array of journal entry objects
  let _journalFormVisible = false;
  let _journalEditId = null;   // ID of entry being edited, or null

  // ── Decision progress tracker ──
  // Externalises the user's decision stage to reduce executive function load.
  // Stages: 'exploring' → 'comparing' → 'deciding'
  // Advances automatically based on observable user behaviour.
  let _decisionStage = 'exploring';
  let _decisionInteractions = {
    filtersApplied: false,    // User changed section/sort/price filter
    seatsViewed: 0,           // Number of seat cards clicked/scrolled into view
    seatsPinned: 0,           // Number of seats pinned for comparison
    seatsLiked: 0,            // Number of seats liked (preference signal)
    timeOnPageMs: 0,          // Time since panel opened
    lastStageChange: Date.now()
  };

  /**
   * Compute the current decision stage from interaction signals.
   * 
   * Exploring: initial browsing — user is scanning options
   * Comparing: user has narrowed down — pinned/liked seats, applied filters
   * Deciding:  user is in final selection — 2 pins, or 1 pin + extended dwell
   * 
   * Based on executive function externalisation research (Barkley, 1997):
   * neurodivergent users benefit from explicit "where am I?" cues in
   * unstructured decision processes.
   */
  function computeDecisionStage() {
    const d = _decisionInteractions;
    let stage = 'exploring';

    // Comparing: user has started narrowing down
    if (d.seatsPinned >= 1 || d.seatsLiked >= 2 || (d.filtersApplied && d.seatsViewed >= 5)) {
      stage = 'comparing';
    }

    // Deciding: user is in final selection mode
    if (d.seatsPinned >= 2 || (d.seatsPinned >= 1 && d.seatsLiked >= 2)) {
      stage = 'deciding';
    }

    if (stage !== _decisionStage) {
      _decisionStage = stage;
      _decisionInteractions.lastStageChange = Date.now();
      updateDecisionProgressUI();
    }
  }

  /** Update just the progress indicator DOM (no full re-render needed) */
  function updateDecisionProgressUI() {
    const el = document.getElementById('tmA11yDecisionProgress');
    if (!el) return;
    const stages = ['exploring', 'comparing', 'deciding'];
    const idx = stages.indexOf(_decisionStage);
    stages.forEach((s, i) => {
      const step = el.querySelector(`[data-stage="${s}"]`);
      if (!step) return;
      step.classList.toggle('tm-a11y-stage-active', i === idx);
      step.classList.toggle('tm-a11y-stage-done', i < idx);
      step.classList.toggle('tm-a11y-stage-future', i > idx);
    });
    // Update the connecting lines
    el.querySelectorAll('.tm-a11y-stage-line').forEach((line, i) => {
      line.classList.toggle('tm-a11y-stage-line-done', i < idx);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // ICON HELPER — generates <img> tags for accessible-icons/
  // ══════════════════════════════════════════════════════════════

  function iconImg(name, size = 30, alt = '') {
    const src = extensionBaseUrl ? extensionBaseUrl + `accessible-icons/${name}.png` : `accessible-icons/${name}.png`;
    return `<img src="${src}" class="tm-a11y-icon-img" alt="${alt}" width="${size}" height="${size}">`;
  }

  // ══════════════════════════════════════════════════════════════
  // 3. SEAT DATA — SIDEBAR-ONLY EXTRACTION
  // ══════════════════════════════════════════════════════════════
  //
  // Strategy: The TM sidebar IS the canonical source of available tickets.
  // If a ticket isn't listed in the sidebar, it's not for sale.
  //
  // 1. Auto-scroll the sidebar to force TM's virtual scroller to render
  //    every listing (TM only keeps ~21 in the DOM at any time).
  // 2. At each scroll step, scrape the currently-visible listing cards.
  // 3. Merge into capturedSeats with content-based dedup.
  //
  // This replaces all previous strategies (API interception, SVG scraping,
  // __NEXT_DATA__ parsing) which suffered from including unavailable seats.
  // The sidebar is simpler and 100% accurate.
  // ══════════════════════════════════════════════════════════════

  /**
   * Merge newly captured seats into our store.
   * De-duplicates by CONTENT (section + row + price + description).
   * All seats from the sidebar are available — no availability filtering needed.
   */
  function mergeSeatData(newSeats) {
    if (!newSeats.length) return;

    function seatKey(s) {
      return `${s.section}|${s.row}|${s.seatNumber}|${s.price}|${s.sellerType}`;
    }

    const seatMap = new Map();
    capturedSeats.forEach(s => seatMap.set(seatKey(s), s));

    let added = 0;
    newSeats.forEach(s => {
      const key = seatKey(s);
      if (!seatMap.has(key)) {
        seatMap.set(key, s);
        added++;
      }
    });

    if (added === 0) return; // No new seats

    capturedSeats = Array.from(seatMap.values());
    console.log(`[A11y Helper] Seat store: +${added} new → ${capturedSeats.length} total`);

    if (panelElement) {
      renderPanelContent();
    }

    // Update focus mode highlights whenever seat data changes
    if (currentPreferences.focusModeEnabled && currentAdapter) {
      currentAdapter.applyMapHighlights();
    }
  }

  // —— Fallback: try to detect event ID from URL and load static data ——

  function tryExtractEventIdFromURL() {
    const match = window.location.href.match(/event\/([A-Za-z0-9]+)/);
    if (match) {
      eventMeta.eventId = match[1];
    }
    // Also try the page title for the event name
    const titleEl = document.querySelector('h1, [data-testid="event-title"], .event-name, [class*="EventTitle"], [class*="event-title"], [class*="eventTitle"]');
    if (titleEl) {
      eventMeta.eventName = titleEl.textContent?.trim();
    }
    // Try venue — TM shows venue as a link near the event header (e.g. "The O2, London")
    if (!eventMeta.venue) {
      const venueSelectors = [
        // TM-specific: venue link in event header area
        'a[href*="/venue/"]',
        'a[href*="/discover/"]',
        '[data-testid="venue-link"]', '[data-testid="venue-name"]',
        '[data-testid*="venue"]',
        // Class-based patterns
        '[class*="VenueName"]', '[class*="venue-name"]', '[class*="venueName"]',
        '[class*="venue_name"]',
        // Generic venue containers
        '[class*="Venue"] a', '[class*="venue"] a',
        // Broader fallbacks
        '[class*="venue"]', '[class*="Venue"]',
        '[class*="location-name"]', '[class*="LocationName"]',
      ];
      for (const sel of venueSelectors) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            const text = el.textContent?.trim();
            // Must look like a venue name: 3–80 chars, not a price, not an event name
            if (text && text.length >= 3 && text.length <= 80 &&
                !/^\$|^£|^€|ticket|buy|more info/i.test(text) &&
                text !== eventMeta.eventName) {
              eventMeta.venue = text;
              break;
            }
          }
        } catch (e) {}
      }
    }
  }


  // ══════════════════════════════════════════════════════════════
  // 3b. DOM SCRAPER — READS TM SIDEBAR LISTINGS
  // ══════════════════════════════════════════════════════════════

  /**
   * Scrape ticket listings from the TM sidebar panel.
   * 
   * TM renders each available listing as a card containing:
   *   - "Section 104  Row 20" (section + row)
   *   - "Standing Ticket" or "Mastercard Preferred Seated Ticket" (description)
   *   - "£71.50 each" (price)
   *   - A coloured dot (blue=standard, gold=VIP, pink=resale)
   * 
   * We find these by scanning all elements for section+price patterns,
   * using a bottom-up smallest-card approach that won't accidentally
   * treat the whole listing panel as a single card.
   */
  function scrapeTicketListingsFromDOM() {
    const seats = [];
    const seen = new Set();

    tryExtractEventIdFromURL();

    // ── Strategy 1: Find individual listing cards by content pattern ──
    // TM UK listings contain "Section XXX Row YY" and "£XX.XX each".
    // We scan all elements and find the SMALLEST element that contains
    // both a section reference and a price — that's an individual card.
    
    const allElements = document.querySelectorAll('div, li, a, article, button, [role="button"]');
    
    allElements.forEach(el => {
      // Skip our own panel
      if (el.closest('#tm-a11y-companion-panel')) return;
      
      // Build spaced text (fixes the textContent concatenation problem)
      const text = getSpacedText(el);
      
      // Must contain a price with "each" (TM's standard format: "£78.20 each")
      // This filters out delivery fees, package headers, and other price-like text
      if (!/[£$€]\s*\d+/.test(text)) return;
      
      // ── STRICT TICKET SIGNAL: must look like an actual ticket listing ──
      // A real TM listing contains "Section XXX" or "Section" as a DOM label
      // plus a price. Reject elements that only contain vague words like "ticket"
      const hasStrongSignal = /\bSection\s+\d/i.test(text) ||       // "Section 229"
                              /\bSECTION\b.*\b(ROW|Row)\b/i.test(text) ||  // SECTION label + ROW label
                              /\bBL\s+\d/i.test(text) ||            // "BL 210"
                              /\bBlock\s+\d/i.test(text) ||         // "Block 5"
                              /\bFloor\b/i.test(text) ||            // "Floor"
                              /\bStanding\b/i.test(text) ||         // "Standing"
                              /\bGeneral Admission\b/i.test(text);  // "General Admission"
      if (!hasStrongSignal) return;
      
      // Must be small enough to be a single listing card
      if (text.length > 350 || text.length < 20) return;
      
      // ── REJECT known garbage patterns ──
      // TM UI elements that contain prices but aren't ticket listings
      if (/no results/i.test(text)) return;
      if (/delivery.*£/i.test(text)) return;
      if (/additional fees/i.test(text)) return;
      if (/pay in \d+ interest/i.test(text)) return;
      if (/^\s*(VIP|Gold|Silver|Platinum)\s+(Packages?|Experience)\s+[£$€]/i.test(text)) return;
      
      // Must NOT have child elements that also match (we want the smallest card)
      let childAlsoMatches = false;
      for (const child of el.children) {
        const childText = getSpacedText(child);
        if (childText.length >= 20 && childText.length < 350 &&
            /[£$€]\s*\d+/.test(childText) &&
            (/\bSection\s+\d/i.test(childText) || /\bSECTION\b/i.test(childText) || /\bBL\s+\d/i.test(childText))) {
          childAlsoMatches = true;
          break;
        }
      }
      if (childAlsoMatches) return;
      
      // Parse this element as a ticket card
      const info = extractTicketInfo(el);
      if (!info || info.price <= 0 || info.price < 5) return;
      if (info.availability !== 'available') return;
      
      // ── Post-parse rejection: bad section names ──
      const secLower = info.section.toLowerCase();
      if (/^(general|0|no results|vip packages?|full price|delivery|additional)/i.test(secLower)) return;
      if (/^(gold|silver|platinum|package|experience)$/i.test(secLower)) return;
      if (info.section.length < 3) return;
      // Section name should contain a number or recognisable area name
      if (!/\d/.test(info.section) && 
          !/floor|standing|general|admission|arena|stage|pit|balcony/i.test(info.section)) {
        // Might still be valid if it has a row
        if (!info.row) return;
      }
      
      // Dedup: section + row + seatNumber + price + description
      const key = `${info.section}|${info.row}|${info.seatNumber}|${info.price}|${info.description}`;
      if (seen.has(key)) return;
      seen.add(key);
      
      seats.push({
        id: `sidebar-${seats.length}-${info.section.replace(/\s+/g, '')}-R${info.row}-S${info.seatNumber}`,
        ...info
      });
    });

    if (seats.length > 0) {
      console.log(`[A11y Helper] 🔍 Sidebar scrape: ${seats.length} listings found`);
      mergeSeatData(seats);
    }

    return seats;
  }


  /**
   * Auto-scroll TM's listing sidebar to force the virtual scroller to
   * render every ticket listing.
   *
   * TM only keeps ~21 items in the DOM at any time. By scrolling smoothly
   * from top to bottom, we force each batch of ~21 to render, scrape them,
   * and accumulate the full set.
   *
   * After completion, scrolls back to the top.
   */
  let _autoScrollInProgress = false;
  const SCAN_DURATION_MS = 20000; // 20 seconds of aggressive scrolling

  function autoScrollListingPanel() {
    if (_autoScrollInProgress) return;

    const candidates = document.querySelectorAll('div, section, [role="list"], [role="listbox"]');
    let scrollContainer = null;
    let bestScore = 0;

    candidates.forEach(el => {
      if (el.closest('#tm-a11y-companion-panel')) return;
      const style = window.getComputedStyle(el);
      const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                           style.overflow === 'auto' || style.overflow === 'scroll';
      if (!isScrollable) return;
      if (el.scrollHeight <= el.clientHeight + 10) return;

      const text = el.textContent || '';
      let score = 0;
      if (/section/i.test(text)) score += 2;
      if (/[£$€]\s*\d+/.test(text)) score += 3;
      if (/each/i.test(text)) score += 3;
      if (/row/i.test(text)) score += 2;
      if (/standing|seated|floor/i.test(text)) score += 2;
      if (/ticket/i.test(text)) score += 1;
      if (el.scrollHeight > el.clientHeight && el.scrollHeight < 20000) score += 3;
      const rect = el.getBoundingClientRect();
      if (rect.width < 600 && rect.width > 200) score += 2;
      if (score > bestScore) { bestScore = score; scrollContainer = el; }
    });

    if (!scrollContainer || bestScore < 5) {
      console.log(`[A11y Helper] Could not find listing sidebar (best score: ${bestScore})`);
      if (scanState === 'scanning') finishScan();
      return;
    }

    _autoScrollInProgress = true;
    console.log(`[A11y Helper] 📜 AGGRESSIVE SCAN: ${SCAN_DURATION_MS / 1000}s`);

    const startTime = Date.now();
    const viewHeight = scrollContainer.clientHeight;
    const scrollStep = Math.floor(viewHeight * 0.6);
    let scrollDir = 1;
    let lastCount = capturedSeats.length;

    scrapeTicketListingsFromDOM();

    const scanInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.round((elapsed / SCAN_DURATION_MS) * 100));
      scanProgress = progress;

      // Update overlay
      const bar = document.getElementById('tmA11yScanProgress');
      const txt = document.getElementById('tmA11yScanText');
      if (bar) bar.style.width = `${progress}%`;
      if (txt) txt.textContent = `Scanning seats… ${capturedSeats.length} found`;

      // Scroll
      const cur = scrollContainer.scrollTop;
      const max = scrollContainer.scrollHeight - viewHeight;
      if (scrollDir === 1 && cur >= max - 20) scrollDir = -1;
      else if (scrollDir === -1 && cur <= 20) scrollDir = 1;
      scrollContainer.scrollTop += scrollDir * scrollStep;

      scrapeTicketListingsFromDOM();
      if (capturedSeats.length > lastCount) {
        console.log(`[A11y Helper] 📜 ${capturedSeats.length} seats (+${capturedSeats.length - lastCount})`);
        lastCount = capturedSeats.length;
      }

      if (elapsed >= SCAN_DURATION_MS) {
        clearInterval(scanInterval);
        _autoScrollInProgress = false;
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          scrapeTicketListingsFromDOM();
          console.log(`[A11y Helper] 📜 SCAN COMPLETE: ${capturedSeats.length} seats`);
          finishScan();
        }, 500);
      }
    }, 250);
  }

  function finishScan() {
    scanState = 'ready';
    scanProgress = 100;
    const overlay = document.getElementById('tmA11yScanOverlay');
    if (overlay) { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 300); }
    renderPanelContent();
    if (currentPreferences.mcdaEnabled) computeAllMCDAScores();
    if ((currentPreferences.focusModeEnabled || currentPreferences.mcdaEnabled) && currentAdapter) currentAdapter.applyMapHighlights();
  }

  // extractTicketInfo parses a DOM element's text for ticket data

  /**
   * Extract ticket info from a TM listing card element.
   * 
   * TM UK uses a structured table layout for listing cards:
   *   <div>SECTION</div><div>BL 113</div>
   *   <div>ROW</div><div>S</div>
   *   <div>SEAT</div><div>6</div>
   *   <div>Seated Ticket</div>
   *   <div>£122.05 each</div>
   * 
   * CRITICAL: el.textContent concatenates all child text WITHOUT spaces,
   * producing "SECTIONBL 113ROWS6SEAT6Seated Ticket£122.05 each".
   * Regex on flattened text fails for ROW/SEAT extraction.
   * 
   * Strategy: Walk child elements to find structured label→value pairs
   * (SECTION, ROW, SEAT headers followed by their values), then fall
   * back to regex on spaced text for less structured cards.
   */
  function extractTicketInfo(card) {
    const fullText = card.textContent || '';
    
    if (/cookie|privacy|accept|paypal.*partner/i.test(fullText) && fullText.length < 120) return null;
    if (fullText.length < 10) return null;

    // ── Price extraction (works fine on concatenated text) ──
    const allPrices = [];
    const priceRegex = /[£$€]\s*(\d{1,5}[\.,]?\d{0,2})/g;
    let pm;
    while ((pm = priceRegex.exec(fullText)) !== null) {
      const val = parseFloat(pm[1].replace(',', ''));
      if (val >= 5 && val < 10000) allPrices.push(val);
    }
    if (allPrices.length === 0) return null;
    
    const price = allPrices[0];
    let currency = 'GBP';
    if (fullText.includes('$')) currency = 'USD';
    else if (fullText.includes('€')) currency = 'EUR';

    // ── DOM-structure extraction: find SECTION/ROW/SEAT label→value pairs ──
    let section = '';
    let row = '';
    let seatNumber = '';
    
    const children = card.querySelectorAll('*');
    
    // Strategy 1: Structured label→value DOM pairs
    // TM renders "SECTION", "ROW", "SEAT" as text in one element,
    // with the value in a sibling or child element.
    for (const child of children) {
      const dt = getDirectText(child).trim();
      const dtUpper = dt.toUpperCase();
      
      if (dtUpper === 'SECTION' || dtUpper === 'SEC') {
        // Value is in next sibling, or in the parent's next child
        const value = getAdjacentValue(child);
        if (value && value.length < 30) {
          section = `Section ${value}`;
        }
      }
      
      if (dtUpper === 'ROW') {
        const value = getAdjacentValue(child);
        if (value && value.length < 15) {
          row = value;
        }
      }
      
      if (dtUpper === 'SEAT' || dtUpper === 'SEATS') {
        const value = getAdjacentValue(child);
        if (value && value.length < 15) {
          seatNumber = value;
        }
      }
    }

    // ── Build spaced text for regex fallbacks ──
    // Walk all text nodes and join with spaces to fix the concatenation problem
    const spacedText = getSpacedText(card);
    
    // Strategy 2: Regex on spaced text for "Section XXX Row YY Seat ZZ" format
    if (!section) {
      const sectionRowSeat = spacedText.match(/Section\s+([A-Za-z0-9\s]+?)\s+Row\s+([A-Za-z0-9]+)(?:\s+Seat\s+([A-Za-z0-9\-]+))?/i);
      if (sectionRowSeat) {
        section = `Section ${sectionRowSeat[1].trim()}`;
        row = row || sectionRowSeat[2];
        seatNumber = seatNumber || (sectionRowSeat[3] || '');
      }
    }

    // Strategy 3: "Section [name]" without row
    if (!section) {
      const sm = spacedText.match(/Section\s+([A-Za-z0-9][A-Za-z0-9\s\-\/]{0,30}?)(?=\s*[£$€\n]|\s*$|\s{2,})/i);
      if (sm) section = `Section ${sm[1].trim()}`;
    }

    // Strategy 4: "BL / Block / Suite / Level / Floor / Box" patterns
    if (!section) {
      const nm = spacedText.match(/\b(BL|Block|Suite|Level|Tier|Floor|Box)\s+([A-Za-z0-9][A-Za-z0-9\s\-()]{0,30}?)(?=\s*[£$€\n]|\s{2,})/i);
      if (nm) section = `Section ${nm[1]} ${nm[2].trim()}`;
    }
    
    // Strategy 5: Standing/Floor sections
    if (!section && /\bFLOOR\b/i.test(spacedText)) section = 'Section FLOOR';
    if (!section && /\bstanding\b/i.test(spacedText)) section = 'Standing';

    // Strategy 6: First meaningful text that describes the listing
    if (!section) {
      for (const child of children) {
        const dt = getDirectText(child);
        if (dt.length >= 5 && dt.length <= 60 &&
            !/^[£$€]/.test(dt) &&
            !/^(each|per ticket|from|SECTION|ROW|SEAT|Show|more|Pay|Interest)/i.test(dt) &&
            !/^(Full Price|Ticket|Reserved|Seated|Standing|VIP|Premium|Gold|Silver)/i.test(dt) &&
            !/^(Package|Experience|Hospitality|Verified|Resale|Standard|Accessible)/i.test(dt) &&
            !/^(No results|results for|Additional|Delivery|Lowest|Highest)/i.test(dt) &&
            !/^\d{1,3}$/.test(dt) &&
            !/^(×|x\d|Qty|qty)$/i.test(dt)) {
          section = dt.substring(0, 50);
          break;
        }
      }
    }

    if (!section) section = 'General';

    // Row fallback: regex on spaced text
    if (!row) {
      const rowMatch = spacedText.match(/\bRow\s+([A-Za-z0-9]+)/i);
      if (rowMatch) row = rowMatch[1];
    }

    // Seat fallback: regex on spaced text
    if (!seatNumber) {
      const seatMatch = spacedText.match(/\bSeats?\s+(\d+(?:\s*[-–]\s*\d+)?)/i);
      if (seatMatch) seatNumber = seatMatch[1].replace(/\s/g, '');
    }
    
    // Clean up section name
    section = section.replace(/[£$€]\d+.*$/, '').trim();
    section = section.replace(/\s+each.*$/i, '').trim();
    section = section.replace(/\s+$/, '');

    // ── Description / type / seller ──
    let description = '';
    const keywords = [
      'Standing', 'Seated', 'Seated Ticket', 'VIP', 'Premium', 'Accessible',
      'General Admission', 'Front Standing', 'Rear Standing',
      'Hospitality', 'Arena Club', 'Package', 'Experience', 'Suite',
      'Reserved Seat', 'Reserved', 'Gold VIP'
    ];
    keywords.forEach(kw => {
      if (spacedText.toLowerCase().includes(kw.toLowerCase())) {
        if (!description.toLowerCase().includes(kw.toLowerCase())) {
          description += (description ? ', ' : '') + kw;
        }
      }
    });

    let type = 'standard';
    if (/VIP|hospitality|experience/i.test(spacedText)) type = 'vip';
    else if (/accessible/i.test(spacedText)) type = 'accessible';
    else if (/premium|suite|arena club|preferred/i.test(spacedText)) type = 'premium';
    else if (/standing/i.test(spacedText)) type = 'standing';
    else if (/reserved\s+seat|seated/i.test(spacedText)) type = 'seated';

    let sellerType = 'primary';
    if (/resale|verified resale/i.test(spacedText)) sellerType = 'resale';

    const isUnavailable = /sold\s*out|unavailable|not\s*available/i.test(spacedText);

    return {
      section: section,
      row: row,
      seatNumber: seatNumber,
      price: price,
      priceMax: allPrices.length > 1 ? Math.max(...allPrices) : price,
      currency: currency,
      availability: isUnavailable ? 'unavailable' : 'available',
      areaName: '',
      description: description || type,
      qualityScore: null,
      sellerType: sellerType,
      type: type
    };
  }

  /**
   * Get the value adjacent to a label element.
   * Handles multiple TM DOM patterns:
   *   Pattern A: <span>SECTION</span><span>BL 113</span>  (nextElementSibling)
   *   Pattern B: <div><span>SECTION</span></div><div><span>BL 113</span></div>  (parent's next sibling)
   *   Pattern C: <td>SECTION</td><td>BL 113</td>  (nextElementSibling in a table)
   */
  function getAdjacentValue(labelEl) {
    // Try 1: Next element sibling
    const next = labelEl.nextElementSibling;
    if (next) {
      const text = next.textContent?.trim();
      if (text && text.length < 30 && !/^(SECTION|ROW|SEAT|each|£|€|\$)/i.test(text)) {
        return text;
      }
    }

    // Try 2: Parent's next element sibling (label is wrapped in a div/span)
    const parent = labelEl.parentElement;
    if (parent) {
      const parentNext = parent.nextElementSibling;
      if (parentNext) {
        const text = parentNext.textContent?.trim();
        if (text && text.length < 30 && !/^(SECTION|ROW|SEAT|each|£|€|\$)/i.test(text)) {
          return text;
        }
      }
    }

    // Try 3: Look at all siblings of the parent (table cells in same row)
    if (parent?.parentElement) {
      const siblings = parent.parentElement.children;
      let foundLabel = false;
      for (const sib of siblings) {
        if (sib === parent || sib === labelEl) {
          foundLabel = true;
          continue;
        }
        if (foundLabel) {
          const text = sib.textContent?.trim();
          if (text && text.length < 30 && !/^(SECTION|ROW|SEAT|each|£|€|\$)/i.test(text)) {
            return text;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get all text content from an element with spaces between nodes.
   * Unlike el.textContent which concatenates without spaces, this walks
   * all text nodes and joins them with spaces so regex works correctly.
   */
  function getSpacedText(el) {
    const texts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t) texts.push(t);
    }
    return texts.join(' ');
  }

  function getDirectText(el) {
    return Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .join(' ')
      .trim();
  }
  // ══════════════════════════════════════════════════════════════
  // 2. COLOUR SCHEME ENGINE
  // ══════════════════════════════════════════════════════════════

  function applyColourScheme(schemeKey) {
    const scheme = COLOUR_SCHEMES[schemeKey] || COLOUR_SCHEMES['default'];
    const root = document.documentElement;

    Object.entries(scheme).forEach(([prop, value]) => {
      if (prop.startsWith('--')) {
        root.style.setProperty(prop, value);
      }
    });

    root.setAttribute('data-tm-a11y-scheme', schemeKey);
    console.log(`[A11y Helper] Colour scheme applied: ${scheme.label}`);
  }

  // ══════════════════════════════════════════════════════════════
  // 3. COMPANION SIDE PANEL
  // ══════════════════════════════════════════════════════════════

  function createPanel() {
    if (panelElement) return;

    // Load Montserrat for the panel UI
    loadAccessibilityFonts();

    panelElement = document.createElement('div');
    panelElement.id = 'tm-a11y-companion-panel';
    panelElement.setAttribute('role', 'complementary');
    panelElement.setAttribute('aria-label', 'Accessibility seat finder panel');
    document.body.appendChild(panelElement);

    // Toggle tab (always visible on edge of screen)
    const tab = document.createElement('button');
    tab.id = 'tm-a11y-panel-tab';
    tab.setAttribute('aria-label', 'Toggle accessibility panel');
    tab.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>';
    tab.addEventListener('click', togglePanel);
    document.body.appendChild(tab);

    renderPanelContent();
    updatePanelVisibility();
  }

  function togglePanel() {
    currentPreferences.panelOpen = !currentPreferences.panelOpen;
    updatePanelVisibility();
    broadcastPreferences();
  }

  function updatePanelVisibility() {
    if (!panelElement) return;
    const tab = document.getElementById('tm-a11y-panel-tab');

    if (currentPreferences.panelOpen) {
      panelElement.classList.add('tm-a11y-panel-open');
      panelElement.classList.remove('tm-a11y-panel-closed');
      if (tab) tab.classList.add('tm-a11y-tab-shifted');
    } else {
      panelElement.classList.remove('tm-a11y-panel-open');
      panelElement.classList.add('tm-a11y-panel-closed');
      if (tab) tab.classList.remove('tm-a11y-tab-shifted');
    }
  }

  function getFilteredSeats() {
    let seats = [...capturedSeats];

    // Section filter
    if (currentPreferences.sectionFilter && currentPreferences.sectionFilter !== 'all') {
      seats = seats.filter(s => s.section === currentPreferences.sectionFilter);
    }

    // Seller type filter
    if (currentPreferences.sellerFilter && currentPreferences.sellerFilter !== 'all') {
      seats = seats.filter(s => s.sellerType === currentPreferences.sellerFilter);
    }

    // Row range filter
    if (currentPreferences.rowMin || currentPreferences.rowMax) {
      const minRow = currentPreferences.rowMin ? parseRowNumber(currentPreferences.rowMin) : null;
      const maxRow = currentPreferences.rowMax ? parseRowNumber(currentPreferences.rowMax) : null;
      seats = seats.filter(s => {
        const rowNum = parseRowNumber(s.row);
        if (rowNum === null) return true; // Keep seats with unparseable rows (standing etc.)
        if (minRow !== null && rowNum < minRow) return false;
        if (maxRow !== null && rowNum > maxRow) return false;
        return true;
      });
    }

    // Only available
    seats = seats.filter(s => s.availability === 'available');

    // Sort
    switch (currentPreferences.sortBy) {
      case 'price-asc':
        seats.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        seats.sort((a, b) => b.price - a.price);
        break;
      case 'section':
        seats.sort((a, b) => a.section.localeCompare(b.section) || a.price - b.price);
        break;
      case 'quality':
        seats.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
        break;
      case 'score-desc':
        seats.sort((a, b) => {
          const sa = getSeatMCDAScore(a);
          const sb = getSeatMCDAScore(b);
          return (sb?.score || 0) - (sa?.score || 0);
        });
        break;
    }

    return seats;
  }

  /**
   * MCDA weight presets — each maps to a specific weight distribution.
   */
  const MCDA_PRESETS = {
    balanced:  { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25, label: 'Balanced' },
    cheapest:  { price: 50, viewQuality: 20, proximity: 15, aisleAccess: 15, label: 'Cheapest' },
    bestView:  { price: 15, viewQuality: 50, proximity: 20, aisleAccess: 15, label: 'Best view' },
    closeUp:   { price: 15, viewQuality: 20, proximity: 50, aisleAccess: 15, label: 'Close up' },
    easyExit:  { price: 15, viewQuality: 15, proximity: 20, aisleAccess: 50, label: 'Easy exit' }
  };

  const MCDA_CRITERIA = [
    { key: 'price', label: 'Price' },
    { key: 'viewQuality', label: 'View quality' },
    { key: 'proximity', label: 'Proximity' },
    { key: 'aisleAccess', label: 'Aisle access' }
  ];

  /**
   * Determine which preset (if any) matches the current weights.
   */
  function getActivePreset() {
    const w = currentPreferences.mcdaWeights;
    for (const [key, preset] of Object.entries(MCDA_PRESETS)) {
      if (w.price === preset.price && w.viewQuality === preset.viewQuality &&
          w.proximity === preset.proximity && w.aisleAccess === preset.aisleAccess) {
        return key;
      }
    }
    return null; // custom weights
  }

  /**
   * Render the MCDA weight controls: preset buttons + custom sliders.
   * Sliders are independent (not auto-redistributing). The engine
   * normalises internally by dividing each weight by their sum.
   */
  function renderMCDAWeightPanel() {
    const w = currentPreferences.mcdaWeights || { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 };
    const activePreset = getActivePreset();
    const total = w.price + w.viewQuality + w.proximity + w.aisleAccess;

    // Preset buttons (no icons)
    const presetsHTML = Object.entries(MCDA_PRESETS).map(([key, preset]) =>
      `<button class="tm-a11y-mcda-preset-btn ${activePreset === key ? 'tm-a11y-preset-active' : ''}" 
              data-mcda-preset="${key}">${preset.label}</button>`
    ).join('');

    // Custom sliders
    const slidersHTML = MCDA_CRITERIA.map(c => {
      const pct = total > 0 ? Math.round((w[c.key] / total) * 100) : 25;
      return `
        <div class="tm-a11y-mcda-slider-row">
          <span class="tm-a11y-mcda-slider-label">${c.label}</span>
          <input type="range" class="tm-a11y-mcda-slider-track" 
                 data-mcda-key="${c.key}"
                 min="0" max="100" step="5" value="${w[c.key]}"
                 aria-label="${c.label} weight" />
          <span class="tm-a11y-mcda-slider-val" data-mcda-val="${c.key}">${pct}%</span>
        </div>`;
    }).join('');

    // Legend
    const legendHTML = `
      <div class="tm-a11y-heat-legend">
        <span class="tm-a11y-heat-legend-label">Map:</span>
        <span class="tm-a11y-heat-swatch tm-a11y-heat-sw-1" title="81–100 Best"></span>
        <span class="tm-a11y-heat-swatch tm-a11y-heat-sw-2" title="61–80"></span>
        <span class="tm-a11y-heat-swatch tm-a11y-heat-sw-3" title="41–60"></span>
        <span class="tm-a11y-heat-swatch tm-a11y-heat-sw-4" title="21–40"></span>
        <span class="tm-a11y-heat-swatch tm-a11y-heat-sw-5" title="0–20 Worst"></span>
        <span class="tm-a11y-heat-legend-range">Best → Worst</span>
      </div>`;

    return `
      <div class="tm-a11y-mcda-panel" id="tmA11yMCDAPanel">
        <div class="tm-a11y-mcda-header">
          <span class="tm-a11y-mcda-title">What matters most?</span>
        </div>
        <div class="tm-a11y-mcda-presets" id="tmA11yMCDAPresets">${presetsHTML}</div>
        <div class="tm-a11y-mcda-divider"></div>
        <div class="tm-a11y-mcda-sliders" id="tmA11yMCDASliders">${slidersHTML}</div>
        ${legendHTML}
      </div>
    `;
  }

  function getUniqueSections() {
    const sections = new Set();
    capturedSeats.forEach(s => sections.add(s.section));
    return Array.from(sections).sort();
  }

  /** Helper to generate a unique content key for a seat (used for pinning) */
  function seatContentKey(seat) {
    return `${seat.section}|${seat.row}|${seat.seatNumber}|${seat.price}|${seat.sellerType}`;
  }

  function isSeatPinned(seat) {
    const key = seatContentKey(seat);
    return pinnedSeats.some(p => seatContentKey(p) === key);
  }

  function togglePinSeat(seat) {
    const key = seatContentKey(seat);
    const idx = pinnedSeats.findIndex(p => seatContentKey(p) === key);
    if (idx !== -1) {
      pinnedSeats.splice(idx, 1);
    } else if (pinnedSeats.length < 2) {
      pinnedSeats.push(seat);
    } else {
      // Replace the first pinned seat (FIFO)
      pinnedSeats.shift();
      pinnedSeats.push(seat);
    }
    renderPanelContent();
  }

  // ══════════════════════════════════════════════════════════════
  // VENUE ACCESSIBILITY TAB RENDERER
  // ══════════════════════════════════════════════════════════════

  function renderVenueTab() {
    const meta = _venueMeta;
    const venueName = eventMeta.venue;
    const eventName = eventMeta.eventName || 'Unknown event';

    // ── Loading / no data states ──
    if (!meta) {
      return `
        <div class="tm-a11y-venue-tab-content">
          <div class="tm-a11y-venue-header">
            <div class="tm-a11y-venue-name">${venueName || 'Venue not detected'}</div>
            ${!venueName ? `<div class="tm-a11y-venue-hint" style="margin-top:4px">Could not find a venue name on this page. Try scrolling to make the venue info visible, then press Retry.</div>` : ''}
          </div>
          <div class="tm-a11y-venue-loading">
            <div class="tm-a11y-venue-loading-icon">${iconImg("venue", 30, "Venue")}</div>
            <p>${venueName ? 'Analysing venue accessibility information…' : 'Waiting for venue name…'}</p>
            <p class="tm-a11y-venue-hint">The extension fetches the venue's official accessibility page and uses AI to extract key features.</p>
            <button class="tm-a11y-toggle-btn" id="tmA11yVenueRetry" style="margin-top:10px">
              <span>Retry Lookup</span>
            </button>
          </div>
        </div>`;
    }

    // ── Error: no API key ──
    if (meta.error === 'no_api_key') {
      return `
        <div class="tm-a11y-venue-tab-content">
          <div class="tm-a11y-venue-header">
            <div class="tm-a11y-venue-name">${venueName || 'Unknown venue'}</div>
            <div class="tm-a11y-venue-event">${eventName}</div>
          </div>
          <div class="tm-a11y-venue-loading">
            <div class="tm-a11y-venue-loading-icon">${iconImg("key", 30, "API Key")}</div>
            <p>OpenAI API key required</p>
            <p class="tm-a11y-venue-hint">To use AI-powered venue accessibility extraction, add your OpenAI API key in the <strong>Tools</strong> tab below.</p>
            <button class="tm-a11y-toggle-btn" id="tmA11yVenueRetry" style="margin-top:10px">
              <span>Retry After Adding Key</span>
            </button>
          </div>
        </div>`;
    }

    // ── Error: API failure ──
    if (meta.error && meta.error !== 'no_api_key') {
      return `
        <div class="tm-a11y-venue-tab-content">
          <div class="tm-a11y-venue-header">
            <div class="tm-a11y-venue-name">${venueName || 'Unknown venue'}</div>
            <div class="tm-a11y-venue-event">${eventName}</div>
          </div>
          <div class="tm-a11y-venue-loading">
            <div class="tm-a11y-venue-loading-icon">${iconImg("warning", 30, "Warning")}</div>
            <p>AI extraction failed</p>
            <p class="tm-a11y-venue-hint">${meta.error === 'no_text' ? 'Could not find meaningful text on the venue accessibility page.' : 'The OpenAI API returned an error. Check your API key in the Tools tab, or try again.'} (${meta.error})</p>
            ${meta.source_url ? `<p class="tm-a11y-venue-hint"><a href="${meta.source_url}" target="_blank" rel="noopener" style="color:var(--tm-a11y-accent,#3ecf8e);text-decoration:underline">View accessibility page manually ↗</a></p>` : ''}
            <button class="tm-a11y-toggle-btn" id="tmA11yVenueRetry" style="margin-top:10px">
              <span>Retry</span>
            </button>
          </div>
        </div>`;
    }

    // ── Build the 8 accessibility feature rows ──
    const features = [
      { key: 'accessible_parking',  iconFile: 'accessible-icons/parking.png',   label: 'Accessible Parking',      desc: 'Designated parking spaces for disabled visitors' },
      { key: 'accessible_entrance', iconFile: 'accessible-icons/entrance.png',  label: 'Accessible Entrance',     desc: 'Step-free or ramped entrance available' },
      { key: 'accessible_seating',  iconFile: 'accessible-icons/seating.png',   label: 'Accessible Seating',       desc: 'Wheelchair-accessible seating positions' },
      { key: 'companion_seating',   iconFile: 'accessible-icons/seating.png',   label: 'Companion Seating',        desc: 'Seats for carers or assistants alongside accessible seats' },
      { key: 'hearing_loop',        iconFile: 'accessible-icons/hearing.png',   label: 'Hearing / Induction Loop', desc: 'Induction loop system for hearing aid users' },
      { key: 'service_animals',     iconFile: 'accessible-icons/animals.png',   label: 'Service Animals',          desc: 'Guide dogs and assistance animals permitted' },
      { key: 'accessible_restrooms', iconFile: 'accessible-icons/wc.png',      label: 'Accessible Restrooms',     desc: 'Wheelchair-accessible toilet facilities' },
      { key: 'quiet_space',         iconFile: 'accessible-icons/quiet.png',     label: 'Quiet Space',              desc: 'Sensory-friendly quiet room or calm zone' },
    ];

    const featureRows = features.map(f => {
      const val = meta[f.key]; // "yes", "no", or "not_specified"
      const iconUrl = extensionBaseUrl ? extensionBaseUrl + f.iconFile : f.iconFile;
      const iconImg = `<img src="${iconUrl}" class="tm-a11y-venue-icon-img" alt="${f.label}" width="30" height="30">`;

      if (val === 'yes') {
        return `
          <div class="tm-a11y-venue-row tm-a11y-venue-available">
            <span class="tm-a11y-venue-row-icon">${iconImg}</span>
            <div class="tm-a11y-venue-row-content">
              <span class="tm-a11y-venue-row-label">${f.label}</span>
              <span class="tm-a11y-venue-row-desc">${f.desc}</span>
            </div>
            <span class="tm-a11y-venue-row-status tm-a11y-venue-status-yes">Available</span>
          </div>`;
      }

      if (val === 'no') {
        return `
          <div class="tm-a11y-venue-row tm-a11y-venue-unavailable">
            <span class="tm-a11y-venue-row-icon">${iconImg}</span>
            <div class="tm-a11y-venue-row-content">
              <span class="tm-a11y-venue-row-label">${f.label}</span>
              <span class="tm-a11y-venue-row-desc">${f.desc}</span>
            </div>
            <span class="tm-a11y-venue-row-status tm-a11y-venue-status-no">Not available</span>
          </div>`;
      }

      // not_specified
      return `
        <div class="tm-a11y-venue-row tm-a11y-venue-unknown">
          <span class="tm-a11y-venue-row-icon">${iconImg}</span>
          <div class="tm-a11y-venue-row-content">
            <span class="tm-a11y-venue-row-label">${f.label}</span>
            <span class="tm-a11y-venue-row-desc">Not mentioned on official venue site.</span>
          </div>
          <span class="tm-a11y-venue-row-status tm-a11y-venue-status-unknown">Unknown</span>
        </div>`;
    }).join('');

    // ── Source info ──
    const sourceLabel = {
      'ai_extraction': 'AI extraction from venue website',
      'ai_no_page': 'AI analysis (no accessibility page found)',
      'cached': 'Cached data'
    }[meta.data_source] || meta.data_source || 'Unknown';

    const lastUpdated = meta.last_updated
      ? new Date(meta.last_updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Unknown';

    const sourceUrlHTML = meta.source_url
      ? `<div class="tm-a11y-venue-source-url"><a href="${meta.source_url}" target="_blank" rel="noopener" style="color:var(--tm-a11y-accent,#3ecf8e);font-size:11px;text-decoration:underline">View accessibility page ↗</a></div>`
      : '';

    return `
      <div class="tm-a11y-venue-tab-content">
        <div class="tm-a11y-venue-header">
          <div class="tm-a11y-venue-name">${venueName || 'Unknown venue'}</div>
          <div class="tm-a11y-venue-event">${eventName}</div>
        </div>

        <div class="tm-a11y-venue-section">
          <div class="tm-a11y-venue-section-title">Accessibility Features</div>
          <div class="tm-a11y-venue-features">
            ${featureRows}
          </div>
        </div>

        <div class="tm-a11y-venue-footer">
          <div class="tm-a11y-venue-source">
            <span>Source: ${sourceLabel}</span>
            <span>Updated: ${lastUpdated}</span>
          </div>
          ${sourceUrlHTML}
          <p class="tm-a11y-venue-disclaimer">This accessibility summary is AI-generated from the venue's published information. Always verify directly with the venue.</p>
          <button class="tm-a11y-toggle-btn" id="tmA11yVenueRefresh" style="margin-top:8px">
            <span>Refresh Data</span>
          </button>

        </div>

        <div class="tm-a11y-chatbot-section">
          <div class="tm-a11y-chatbot-header">
            <span class="tm-a11y-chatbot-title">💬 Ask about this venue</span>
          </div>
          <div class="tm-a11y-chatbot-messages" id="tmA11yChatMessages">
            <div class="tm-a11y-chat-msg tm-a11y-chat-bot">
              <div class="tm-a11y-chat-bubble">Ask me anything about accessibility at <strong>${venueName}</strong> — parking, entrances, hearing loops, transport, and more.</div>
            </div>
          </div>
          <div class="tm-a11y-chatbot-input-row">
            <input type="text" id="tmA11yChatInput" placeholder="e.g. Is there step-free access from the station?" autocomplete="off" />
            <button id="tmA11yChatSend" title="Send">➤</button>
          </div>
          <div class="tm-a11y-chatbot-controls">
            <button id="tmA11yChatClear" class="tm-a11y-chat-clear-btn">Clear chat</button>
            <span class="tm-a11y-chatbot-disclaimer">Answers are based on publicly available sources and may be incomplete.</span>
          </div>
        </div>
      </div>`;
  }

  function renderPanelContent() {
    if (!panelElement) return;

    // Recompute MCDA scores if heatmap is active
    if (currentPreferences.mcdaEnabled) {
      computeAllMCDAScores();
    }

    // Async: update recommendations in background (non-blocking)
    if (!_recDismissed && capturedSeats.length > 0) {
      UserPreferenceEngine.getRecommendations(capturedSeats, getActiveProfile(), _venueMeta).then(recs => {
        if (recs.length > 0 && JSON.stringify(recs.map(r => r.seat.id)) !== JSON.stringify((_cachedRecommendations || []).map(r => r.seat.id))) {
          _cachedRecommendations = recs;
          // Re-render only the rec panel if it exists, otherwise next full render will pick it up
          const recPanel = document.getElementById('tmA11yRecPanel');
          if (!recPanel && recs.length > 0) {
            // Need a full re-render to insert rec panel
            renderPanelContent();
          }
        }
      }).catch(() => {});
    }

    const filtered = getFilteredSeats();
    const sections = getUniqueSections();
    const withinBudget = filtered.filter(s => s.price <= currentPreferences.maxPrice);
    const overBudget = filtered.filter(s => s.price > currentPreferences.maxPrice);
    const priceRange = capturedSeats.length
      ? { min: Math.min(...capturedSeats.map(s => s.price)), max: Math.max(...capturedSeats.map(s => s.price)) }
      : { min: 0, max: 500 };
    const currency = capturedSeats[0]?.currency || 'GBP';
    const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' ';

    panelElement.innerHTML = `
      <div class="tm-a11y-panel-inner">
        
        <!-- HEADER -->
        <div class="tm-a11y-panel-header">
          <div class="tm-a11y-panel-header-content">
            <span class="tm-a11y-panel-logo"><svg viewBox="0 0 24 24"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg></span>
            <div>
              <div class="tm-a11y-panel-title">Seat Finder</div>
              <div class="tm-a11y-panel-subtitle">${eventMeta.eventName || 'Detecting event...'}</div>
            </div>
          </div>
          <div class="tm-a11y-header-actions">
            ${_authUser ? `
              <button class="tm-a11y-header-avatar" id="tmA11yHeaderAvatar" title="Logged in as ${_authUser.displayName}" aria-label="Account: ${_authUser.displayName}">
                ${(_authUser.displayName || 'U')[0].toUpperCase()}
              </button>
            ` : `
              <button class="tm-a11y-header-login-btn" id="tmA11yHeaderLoginBtn" title="Log in" aria-label="Log in">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
            `}
            <button class="tm-a11y-panel-close" aria-label="Close panel" id="tmA11yClosePanel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        </div>

        <!-- STATUS BAR -->
        <div class="tm-a11y-panel-status">
          ${capturedSeats.length === 0
            ? '<span class="tm-a11y-status-dot tm-a11y-status-waiting"></span> Waiting for seat data…'
            : `<span class="tm-a11y-status-dot tm-a11y-status-live"></span> ${filtered.length} seats found`
          }
          ${scanState !== 'scanning' ? `
          <button class="tm-a11y-rescan-btn" id="tmA11yRescanBtn" 
                  aria-label="Rescan sidebar for new listings"
                  title="Re-scroll the sidebar to capture any newly loaded seats">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Rescan
          </button>
          ` : ''}
        </div>

        ${scanState !== 'scanning' && capturedSeats.length < 10 ? `
        <button class="tm-a11y-scan-all-btn" id="tmA11yScanAllBtn" aria-label="Scan all available seats">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          Scan All Seats
        </button>
        ` : ''}

        <!-- TAB BAR -->
        <div class="tm-a11y-tab-bar" role="tablist" aria-label="Panel sections">
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'seats' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'seats'}" data-tab="seats">Seats</button>
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'filters' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'filters'}" data-tab="filters">Filters</button>
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'venue' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'venue'}" data-tab="venue">Venue${_venueMeta ? ' ✓' : ''}</button>
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'tools' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'tools'}" data-tab="tools">Tools</button>
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'journal' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'journal'}" data-tab="journal">Journal</button>
        </div>

        <!-- DECISION PROGRESS INDICATOR -->
        ${capturedSeats.length > 0 && scanState !== 'scanning' ? `
        <div class="tm-a11y-decision-progress" id="tmA11yDecisionProgress" 
             role="status" aria-label="Decision progress: ${_decisionStage}"
             title="Tracks where you are in your seat selection process">
          <div class="tm-a11y-stage ${_decisionStage === 'exploring' ? 'tm-a11y-stage-active' : ''}${_decisionStage === 'comparing' || _decisionStage === 'deciding' ? ' tm-a11y-stage-done' : ''}" data-stage="exploring">
            <span class="tm-a11y-stage-dot"></span>
            <span class="tm-a11y-stage-label">Exploring</span>
          </div>
          <div class="tm-a11y-stage-line ${_decisionStage === 'comparing' || _decisionStage === 'deciding' ? 'tm-a11y-stage-line-done' : ''}"></div>
          <div class="tm-a11y-stage ${_decisionStage === 'comparing' ? 'tm-a11y-stage-active' : ''}${_decisionStage === 'deciding' ? ' tm-a11y-stage-done' : ''}${_decisionStage === 'exploring' ? ' tm-a11y-stage-future' : ''}" data-stage="comparing">
            <span class="tm-a11y-stage-dot"></span>
            <span class="tm-a11y-stage-label">Comparing</span>
          </div>
          <div class="tm-a11y-stage-line ${_decisionStage === 'deciding' ? 'tm-a11y-stage-line-done' : ''}"></div>
          <div class="tm-a11y-stage ${_decisionStage === 'deciding' ? 'tm-a11y-stage-active' : ''} ${_decisionStage !== 'deciding' ? 'tm-a11y-stage-future' : ''}" data-stage="deciding">
            <span class="tm-a11y-stage-dot"></span>
            <span class="tm-a11y-stage-label">Deciding</span>
          </div>
        </div>
        ` : ''}

        ${scanState === 'scanning' ? `
        <div class="tm-a11y-scan-overlay" id="tmA11yScanOverlay">
        <button class="tm-a11y-panel-close" aria-label="Close panel" id="tmA11yClosePanel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <div class="tm-a11y-scan-content">
            <div class="tm-a11y-scan-spinner"></div>
            <div class="tm-a11y-scan-title">Scanning all tickets…</div>
            <div class="tm-a11y-scan-text" id="tmA11yScanText">Scanning seats… ${capturedSeats.length} found</div>
            <div class="tm-a11y-scan-bar-bg">
              <div class="tm-a11y-scan-bar-fill" id="tmA11yScanProgress" style="width: ${scanProgress}%"></div>
            </div>
            <div class="tm-a11y-scan-hint">Loading all available listings…</div>
          </div>
        </div>
        ` : ''}

        <!-- ═══ TAB: SEATS ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'seats' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabSeats" role="tabpanel">
          
          <!-- COMPACT PRICE SLIDER -->
          <div class="tm-a11y-seats-price-bar">
            <label class="tm-a11y-filter-label">
              Max Price
              <span class="tm-a11y-filter-value tm-a11y-price-display-sync">${symbol}${currentPreferences.maxPrice}</span>
            </label>
            <input type="range" class="tm-a11y-slider tm-a11y-price-slider-sync"
              min="${Math.floor(priceRange.min)}" max="${Math.ceil(priceRange.max)}" 
              step="5" value="${currentPreferences.maxPrice}" aria-label="Maximum seat price" />
            <div class="tm-a11y-slider-range">
              <span>${symbol}${Math.floor(priceRange.min)}</span>
              <span>${symbol}${Math.ceil(priceRange.max)}</span>
            </div>
          </div>

          <!-- PIN-TO-COMPARE -->
          ${renderPinnedComparison(symbol)}
          

          <!-- STATS -->
          <div class="tm-a11y-panel-stats">
            <div class="tm-a11y-stat-chip tm-a11y-stat-budget">
              <span class="tm-a11y-stat-num">${withinBudget.length}</span>
              <span class="tm-a11y-stat-lbl">In budget</span>
            </div>
            <div class="tm-a11y-stat-chip tm-a11y-stat-over">
              <span class="tm-a11y-stat-num">${overBudget.length}</span>
              <span class="tm-a11y-stat-lbl">Over budget</span>
            </div>
            <div class="tm-a11y-stat-chip tm-a11y-stat-total">
              <span class="tm-a11y-stat-num">${filtered.length}</span>
              <span class="tm-a11y-stat-lbl">Total</span>
            </div>
          </div>

          <!-- SEAT LIST -->
          <div class="tm-a11y-seat-list" id="tmA11ySeatList">
            ${!_recDismissed && _cachedRecommendations && _cachedRecommendations.length > 0
              ? UserPreferenceEngine.renderRecommendations(_cachedRecommendations, symbol)
              : ''}
            ${filtered.length === 0 
              ? `<div class="tm-a11y-empty-state">
                  <div class="tm-a11y-empty-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
                  <p>${capturedSeats.length === 0 
                    ? 'Navigate to a Ticketmaster event page and open the seat map to capture seat data.' 
                    : 'No seats match your filters. Try adjusting your price or section.'}</p>
                 </div>`
              : renderSeatCards(filtered, withinBudget, symbol)
            }
          </div>
        </div>

        <!-- ═══ TAB: FILTERS ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'filters' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabFilters" role="tabpanel">

          <!-- MCDA WEIGHT SLIDERS — shown at TOP when heatmap is active -->
          ${currentPreferences.mcdaEnabled ? renderMCDAWeightPanel() : ''}

          <div class="tm-a11y-panel-filters">
            
            <!-- ═══ SECTION: TICKET SEARCH ═══ -->
            <div class="tm-a11y-filter-section">
              <div class="tm-a11y-filter-section-header">
                ${iconImg("ticket", 30, "Ticket Search")}
                <span class="tm-a11y-filter-section-title">Ticket Search</span>
              </div>

              <!-- Price slider -->
              <div class="tm-a11y-filter-group">
                <label class="tm-a11y-filter-label">
                  Max Price
                  <span class="tm-a11y-filter-value tm-a11y-price-display-sync">${symbol}${currentPreferences.maxPrice}</span>
                </label>
                <input type="range" class="tm-a11y-slider tm-a11y-slider-gradient tm-a11y-price-slider-sync"
                  min="${Math.floor(priceRange.min)}" max="${Math.ceil(priceRange.max)}" 
                  step="5" value="${currentPreferences.maxPrice}" aria-label="Maximum seat price" />
                <div class="tm-a11y-slider-range">
                  <span>${symbol}${Math.floor(priceRange.min)}</span>
                  <span>${symbol}${Math.ceil(priceRange.max)}</span>
                </div>
              </div>

              <!-- Ticket quantity + Sort — side by side -->
              <div class="tm-a11y-filter-row">
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11yTicketQty">Tickets</label>
                  <select id="tmA11yTicketQty" class="tm-a11y-select" aria-label="Number of tickets">
                    ${[0,1,2,3,4,5,6].map(n => 
                      `<option value="${n}" ${(currentPreferences.ticketQty||0)===n?'selected':''}>${n===0?'Any':n}</option>`
                    ).join('')}
                  </select>
                </div>
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11ySortBy">Sort by</label>
                  <select id="tmA11ySortBy" class="tm-a11y-select" aria-label="Sort seats by">
                    <option value="price-asc" ${currentPreferences.sortBy === 'price-asc' ? 'selected' : ''}>Price ↑</option>
                    <option value="price-desc" ${currentPreferences.sortBy === 'price-desc' ? 'selected' : ''}>Price ↓</option>
                    <option value="section" ${currentPreferences.sortBy === 'section' ? 'selected' : ''}>Section</option>
                    <option value="quality" ${currentPreferences.sortBy === 'quality' ? 'selected' : ''}>View Quality</option>
                    ${currentPreferences.mcdaEnabled ? `<option value="score-desc" ${currentPreferences.sortBy === 'score-desc' ? 'selected' : ''}>MCDA Score ★</option>` : ''}
                  </select>
                </div>
              </div>

              <!-- Section + Seller — side by side -->
              <div class="tm-a11y-filter-row">
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11ySectionFilter">Section</label>
                  <select id="tmA11ySectionFilter" class="tm-a11y-select" aria-label="Filter by section">
                    <option value="all" ${currentPreferences.sectionFilter === 'all' ? 'selected' : ''}>All (${sections.length})</option>
                    ${sections.map(s => {
                      const count = capturedSeats.filter(seat => seat.section === s && seat.availability === 'available').length;
                      return `<option value="${s}" ${currentPreferences.sectionFilter === s ? 'selected' : ''}>${s} (${count})</option>`;
                    }).join('')}
                  </select>
                </div>
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11ySellerFilter">Seller</label>
                  <select id="tmA11ySellerFilter" class="tm-a11y-select" aria-label="Filter by seller type">
                    <option value="all" ${currentPreferences.sellerFilter === 'all' ? 'selected' : ''}>All</option>
                    <option value="primary" ${currentPreferences.sellerFilter === 'primary' ? 'selected' : ''}>Primary</option>
                    <option value="resale" ${currentPreferences.sellerFilter === 'resale' ? 'selected' : ''}>Resale</option>
                  </select>
                </div>
              </div>

              <!-- Row range — side by side inputs -->
              <div class="tm-a11y-filter-row">
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11yRowMin">Row from</label>
                  <input type="text" id="tmA11yRowMin" class="tm-a11y-input" 
                    placeholder="e.g. A or 1" value="${currentPreferences.rowMin || ''}" 
                    aria-label="Minimum row" maxlength="3" />
                </div>
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label" for="tmA11yRowMax">Row to</label>
                  <input type="text" id="tmA11yRowMax" class="tm-a11y-input" 
                    placeholder="e.g. F or 10" value="${currentPreferences.rowMax || ''}" 
                    aria-label="Maximum row" maxlength="3" />
                </div>
              </div>
            </div>

            <!-- ═══ SECTION: DISPLAY ═══ -->
            <div class="tm-a11y-filter-section">
              <div class="tm-a11y-filter-section-header">
                ${iconImg("palette", 30, "Display")}
                <span class="tm-a11y-filter-section-title">Display</span>
              </div>

              <!-- Colour scheme — with swatch preview -->
              <div class="tm-a11y-filter-group">
                <label class="tm-a11y-filter-label" for="tmA11yColourScheme">Colour Scheme</label>
                <select id="tmA11yColourScheme" class="tm-a11y-select" aria-label="Colour scheme">
                  ${Object.entries(COLOUR_SCHEMES).map(([key, scheme]) =>
                    `<option value="${key}" ${currentPreferences.colourScheme === key ? 'selected' : ''}>${scheme.label}</option>`
                  ).join('')}
                </select>
                <div class="tm-a11y-scheme-preview" id="tmA11ySchemePreview">
                  <span class="tm-a11y-scheme-swatch" style="background:${(COLOUR_SCHEMES[currentPreferences.colourScheme] || COLOUR_SCHEMES['default'])['--tm-a11y-accent']}"></span>
                  <span class="tm-a11y-scheme-desc">${(COLOUR_SCHEMES[currentPreferences.colourScheme] || COLOUR_SCHEMES['default']).description}</span>
                </div>
              </div>
            </div>

            <!-- ═══ SECTION: TYPOGRAPHY ═══ -->
            <div class="tm-a11y-filter-section">
              <div class="tm-a11y-filter-section-header">
                ${iconImg("typography", 30, "Typography")}
                <span class="tm-a11y-filter-section-title">Typography</span>
              </div>

              <!-- Typeface with live preview and categorised dropdown -->
              <div class="tm-a11y-filter-group">
                <label class="tm-a11y-filter-label" for="tmA11yFontFamily">Typeface</label>
                <select id="tmA11yFontFamily" class="tm-a11y-select tm-a11y-font-select" aria-label="Font family">
                  ${FONT_CATEGORIES.map(cat => `
                    <optgroup label="${cat.label}">
                      ${cat.fonts.map(f => 
                        `<option value="${f.key}" ${currentPreferences.fontFamily === f.key ? 'selected' : ''} style="font-family: ${FONT_FAMILIES[f.key] || 'inherit'}">${f.name}${f.note ? ' — ' + f.note : ''}</option>`
                      ).join('')}
                    </optgroup>
                  `).join('')}
                </select>
                <div class="tm-a11y-font-preview" id="tmA11yFontPreview" style="font-family: ${FONT_FAMILIES[currentPreferences.fontFamily] || 'inherit'}; font-size: ${currentPreferences.fontSize}px; line-height: ${currentPreferences.lineSpacing}">
                  <span class="tm-a11y-font-preview-text">The quick brown fox jumps over the lazy dog</span>
                  <span class="tm-a11y-font-preview-numbers">Section 114 · Row G · £84.50</span>
                </div>
              </div>

              <!-- Font Size + Line Spacing — side by side -->
              <div class="tm-a11y-filter-row">
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label">
                    Size
                    <span class="tm-a11y-filter-value" id="tmA11yFontSizeVal">${currentPreferences.fontSize}px</span>
                  </label>
                  <input type="range" class="tm-a11y-slider" id="tmA11yFontSize"
                    min="12" max="28" step="1" value="${currentPreferences.fontSize}" aria-label="Font size" />
                  <div class="tm-a11y-slider-range"><span>12</span><span>28</span></div>
                </div>
                <div class="tm-a11y-filter-group tm-a11y-filter-half">
                  <label class="tm-a11y-filter-label">
                    Spacing
                    <span class="tm-a11y-filter-value" id="tmA11yLineSpacingVal">${currentPreferences.lineSpacing.toFixed(1)}×</span>
                  </label>
                  <input type="range" class="tm-a11y-slider" id="tmA11yLineSpacing"
                    min="1.5" max="3.0" step="0.1" value="${currentPreferences.lineSpacing}" aria-label="Line spacing" />
                  <div class="tm-a11y-slider-range"><span>1.5×</span><span>3.0×</span></div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ═══ TAB: VENUE ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'venue' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabVenue" role="tabpanel">
          ${renderVenueTab()}
        </div>

        <!-- ═══ TAB: TOOLS ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'tools' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabTools" role="tabpanel">
          <div class="tm-a11y-panel-tools">
            
            <!-- PROFILE SELECTOR -->
            <div class="tm-a11y-toolcard">
              <div class="tm-a11y-toolcard-header">
                ${iconImg("brain", 30, "Profile")}
                <div class="tm-a11y-toolcard-title">Sensory Profile</div>
              </div>
              <p class="tm-a11y-toolcard-desc">Apply a preset or custom profile to configure all settings at once.</p>
              <select id="tmA11yProfileSelect" class="tm-a11y-select" aria-label="Sensory profile">
                <option value="" ${!activeProfileId ? 'selected' : ''}>No Profile (Manual)</option>
                ${getAllProfiles().map(p => 
                  `<option value="${p.id}" ${activeProfileId === p.id ? 'selected' : ''}>${p.builtIn ? '★ ' : ''}${p.name}</option>`
                ).join('')}
              </select>
            </div>

            <!-- ACCESSIBILITY TOGGLES -->
            <div class="tm-a11y-toolcard">
              <div class="tm-a11y-toolcard-header">
                ${iconImg("entrance", 30, "Access")}
                <div class="tm-a11y-toolcard-title">Accessibility</div>
              </div>
              <div class="tm-a11y-toolcard-grid">
                <button class="tm-a11y-toolcard-toggle ${currentPreferences.declutterEnabled ? 'tm-a11y-toolcard-toggle-on' : ''}" 
                        id="tmA11yDeclutterToggle" aria-pressed="${currentPreferences.declutterEnabled}"
                        title="Hide ads, 'Only X left!', countdown timers, upsell banners">
                  <svg class="tm-a11y-toolcard-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                  <span class="tm-a11y-toolcard-toggle-label">Declutter${currentPreferences.declutterEnabled && declutterHiddenCount > 0 ? ` (${declutterHiddenCount})` : ''}</span>
                  <span class="tm-a11y-toolcard-toggle-desc">Remove FOMO elements</span>
                </button>
                <button class="tm-a11y-toolcard-toggle ${currentPreferences.animationFreezeEnabled ? 'tm-a11y-toolcard-toggle-on' : ''}" 
                        id="tmA11yAnimFreezeToggle" aria-pressed="${currentPreferences.animationFreezeEnabled}"
                        title="Stop all animations, transitions, and moving elements">
                  <svg class="tm-a11y-toolcard-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>
                  <span class="tm-a11y-toolcard-toggle-label">Freeze Motion</span>
                  <span class="tm-a11y-toolcard-toggle-desc">Stop all animations</span>
                </button>
              </div>
            </div>

            <!-- MAP VISUALISATION -->
            <div class="tm-a11y-toolcard">
              <div class="tm-a11y-toolcard-header">
                ${iconImg("venue", 30, "Map")}
                <div class="tm-a11y-toolcard-title">Map Visualisation</div>
              </div>
              <div class="tm-a11y-toolcard-grid">
                <button class="tm-a11y-toolcard-toggle ${currentPreferences.focusModeEnabled ? 'tm-a11y-toolcard-toggle-on' : ''}" 
                        id="tmA11yFocusModeToggle" aria-pressed="${currentPreferences.focusModeEnabled}"
                        title="Highlight affordable seats and dim expensive ones">
                  <svg class="tm-a11y-toolcard-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                  <span class="tm-a11y-toolcard-toggle-label">Focus Mode</span>
                  <span class="tm-a11y-toolcard-toggle-desc">Dim over-budget seats</span>
                </button>
                <button class="tm-a11y-toolcard-toggle ${currentPreferences.mcdaEnabled ? 'tm-a11y-toolcard-toggle-on' : ''}" 
                        id="tmA11yMCDAToggle" aria-pressed="${currentPreferences.mcdaEnabled}"
                        title="Score and colour-code all seats using weighted criteria">
                  <svg class="tm-a11y-toolcard-toggle-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
                  <span class="tm-a11y-toolcard-toggle-label">Heatmap</span>
                  <span class="tm-a11y-toolcard-toggle-desc">Colour-code by score</span>
                </button>
              </div>
            </div>

            <!-- RECOMMENDATION ENGINE -->
            <div class="tm-a11y-toolcard">
              <div class="tm-a11y-toolcard-header">
                ${iconImg("scale", 30, "AI")}
                <div class="tm-a11y-toolcard-title">Recommendations</div>
              </div>
              <p class="tm-a11y-toolcard-desc">Learns from seats you like or pin. After 3+ selections, personalised recommendations appear in the Seats tab.</p>
              <button class="tm-a11y-toggle-btn" id="tmA11yClearRecHistory" title="Remove all stored seat selection history">
                <span>Clear History</span>
              </button>
              <p class="tm-a11y-toolcard-privacy">${iconImg("lock", 30, "Privacy")} Stored locally, never sent anywhere</p>
            </div>

            <!-- OPENAI API KEY -->
            <div class="tm-a11y-toolcard">
              <div class="tm-a11y-toolcard-header">
                ${iconImg("key", 30, "API")}
                <div class="tm-a11y-toolcard-title">Venue AI</div>
              </div>
              <p class="tm-a11y-toolcard-desc">OpenAI API key for AI-powered venue accessibility extraction.</p>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="password" id="tmA11yOpenAIKey" placeholder="sk-..." class="tm-a11y-input" style="font-size:12px;font-family:monospace" />
                <button class="tm-a11y-toggle-btn" id="tmA11ySaveAPIKey" style="flex-shrink:0;padding:6px 10px">
                  <span>Save</span>
                </button>
              </div>
              <p class="tm-a11y-tool-hint" id="tmA11yAPIKeyStatus" style="margin-top:6px;font-size:11px"></p>
              <p class="tm-a11y-toolcard-privacy">${iconImg("lock", 30, "Privacy")} Sent only to OpenAI's API, stored locally</p>
            </div>
          </div>
        </div>

        <!-- ═══ TAB: JOURNAL ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'journal' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabJournal" role="tabpanel">
          <div class="tm-a11y-panel-tools">
            ${!_authUser ? `
              <!-- Login gate -->
              <div class="tm-a11y-journal-gate">
                <div class="tm-a11y-journal-gate-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <p class="tm-a11y-journal-gate-title">Concert Journal</p>
                <p class="tm-a11y-journal-gate-text">Log in to save your concert experiences, rate venues for sensory comfort, and build your personal accessibility reference.</p>
                
                <div id="tmA11yAuthForms" style="width:100%;margin-top:12px">
                  <div id="tmA11yLoginForm">
                    <div class="tm-a11y-filter-group" style="margin-bottom:6px">
                      <input type="email" id="tmA11yLoginEmail" class="tm-a11y-input" placeholder="Email" aria-label="Email" />
                    </div>
                    <div class="tm-a11y-filter-group" style="margin-bottom:8px">
                      <input type="password" id="tmA11yLoginPass" class="tm-a11y-input" placeholder="Password" aria-label="Password" />
                    </div>
                    <div style="display:flex;gap:6px">
                      <button class="tm-a11y-toggle-btn tm-a11y-toggle-active" id="tmA11yLoginBtn" style="flex:1"><span>Log In</span></button>
                      <button class="tm-a11y-toggle-btn" id="tmA11yShowRegisterBtn" style="flex:1"><span>Create Account</span></button>
                    </div>
                  </div>
                  <div id="tmA11yRegisterForm" style="display:none">
                    <div class="tm-a11y-filter-group" style="margin-bottom:6px">
                      <input type="text" id="tmA11yRegName" class="tm-a11y-input" placeholder="Display name" aria-label="Display name" />
                    </div>
                    <div class="tm-a11y-filter-group" style="margin-bottom:6px">
                      <input type="email" id="tmA11yRegEmail" class="tm-a11y-input" placeholder="Email" aria-label="Email" />
                    </div>
                    <div class="tm-a11y-filter-group" style="margin-bottom:8px">
                      <input type="password" id="tmA11yRegPass" class="tm-a11y-input" placeholder="Password (6+ chars)" aria-label="Password" />
                    </div>
                    <div style="display:flex;gap:6px">
                      <button class="tm-a11y-toggle-btn tm-a11y-toggle-active" id="tmA11yRegisterBtn" style="flex:1"><span>Create Account</span></button>
                      <button class="tm-a11y-toggle-btn" id="tmA11yShowLoginBtn" style="flex:1"><span>Back to Login</span></button>
                    </div>
                  </div>
                </div>
                <div id="tmA11yAuthStatus" class="tm-a11y-tool-hint" style="margin-top:6px"></div>
              </div>
            ` : `
              <!-- Logged in: Journal content -->
              <div class="tm-a11y-tool-section">
                <div class="tm-a11y-tool-label">Concert Journal <span style="font-weight:400;color:var(--tm-a11y-panel-text-tertiary)">(${_journalEntries.length} ${_journalEntries.length === 1 ? 'entry' : 'entries'})</span></div>
                
                <button class="tm-a11y-toggle-btn tm-a11y-toggle-active" id="tmA11yAddEntryBtn" style="margin-bottom:8px">
                  <span>${_journalFormVisible ? 'Cancel' : '+ New Entry'}</span>
                </button>

                ${_journalFormVisible ? `
                <div class="tm-a11y-journal-form">
                  <div class="tm-a11y-filter-group">
                    <input type="text" id="tmA11yJournalEvent" class="tm-a11y-input" placeholder="Event / Artist *" aria-label="Event name" value="${eventMeta.eventName || ''}" />
                  </div>
                  <div class="tm-a11y-filter-row">
                    <div class="tm-a11y-filter-group tm-a11y-filter-half">
                      <input type="text" id="tmA11yJournalVenue" class="tm-a11y-input" placeholder="Venue" aria-label="Venue" value="${eventMeta.venue || ''}" />
                    </div>
                    <div class="tm-a11y-filter-group tm-a11y-filter-half">
                      <input type="text" id="tmA11yJournalSection" class="tm-a11y-input" placeholder="Section / Seat" aria-label="Section" />
                    </div>
                  </div>
                  <div class="tm-a11y-filter-group">
                    <label class="tm-a11y-filter-label">Overall</label>
                    <div class="tm-a11y-star-row" id="tmA11yStarsOverall">
                      ${[1,2,3,4,5].map(n => `<button class="tm-a11y-star-btn" data-val="${n}" aria-label="${n} stars">★</button>`).join('')}
                    </div>
                  </div>
                  <div class="tm-a11y-filter-group">
                    <label class="tm-a11y-filter-label">Sensory Comfort</label>
                    <div class="tm-a11y-star-row" id="tmA11yStarsSensory">
                      ${[1,2,3,4,5].map(n => `<button class="tm-a11y-star-btn" data-val="${n}" aria-label="${n} stars">★</button>`).join('')}
                    </div>
                  </div>
                  <div class="tm-a11y-filter-group">
                    <label class="tm-a11y-filter-label">Tags</label>
                    <div class="tm-a11y-tag-grid">
                      ${[
                        ['loud', 'Loud'], ['crowded', 'Crowded'], ['good-view', 'Good View'], ['accessible', 'Accessible'],
                        ['calm', 'Calm'], ['bright-lights', 'Bright Lights'], ['easy-exit', 'Easy Exit'], ['would-return', 'Would Return']
                      ].map(([val, label]) => 
                        `<label class="tm-a11y-tag-chip"><input type="checkbox" value="${val}" class="tm-a11y-tag-check" />${label}</label>`
                      ).join('')}
                    </div>
                  </div>
                  <div class="tm-a11y-filter-group">
                    <textarea id="tmA11yJournalNotes" class="tm-a11y-input" rows="3" placeholder="Notes — sensory triggers, best entry route, good spots..." aria-label="Notes" style="resize:vertical"></textarea>
                  </div>
                  <input type="hidden" id="tmA11yJournalEditId" value="${_journalEditId || ''}" />
                  <button class="tm-a11y-toggle-btn tm-a11y-toggle-active" id="tmA11yJournalSaveBtn">
                    <span>${_journalEditId ? 'Update Entry' : 'Save Entry'}</span>
                  </button>
                </div>
                ` : ''}

                <div class="tm-a11y-journal-entries">
                  ${_journalEntries.length === 0 ? `
                    <div class="tm-a11y-journal-empty">
                      <svg class="tm-a11y-journal-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                        <path d="M8 7h6"/><path d="M8 11h8"/>
                      </svg>
                      <p class="tm-a11y-journal-empty-title">Your Concert Journal</p>
                      <p class="tm-a11y-journal-empty-text">Record your experiences, rate sensory comfort, and build a personal accessibility reference for future events.</p>
                    </div>
                  ` : _journalEntries.map(e => {
                    const d = e.createdAt ? new Date(e.createdAt) : null;
                    const dayNum = d ? d.getDate() : '';
                    const monthStr = d ? d.toLocaleDateString('en-GB', { month: 'short' }) : '';
                    const yearStr = d ? d.getFullYear() : '';
                    const ratingColour = (e.ratingOverall || 0) >= 4 ? '#22c55e' : (e.ratingOverall || 0) >= 3 ? '#eab308' : (e.ratingOverall || 0) >= 1 ? '#f97316' : '#555a6b';
                    const TAG_ICONS = { 'loud': '', 'crowded': '', 'good-view': '', 'accessible': '', 'calm': '', 'bright-lights': '', 'easy-exit': '', 'would-return': '' };
                    const TAG_LABELS = { 'loud': 'Loud', 'crowded': 'Crowded', 'good-view': 'Good View', 'accessible': 'Accessible', 'calm': 'Calm', 'bright-lights': 'Bright Lights', 'easy-exit': 'Easy Exit', 'would-return': 'Would Return' };
                    return `
                    <div class="tm-a11y-jcard" style="border-left: 3px solid ${ratingColour}">
                      <div class="tm-a11y-jcard-top">
                        ${d ? `
                        <div class="tm-a11y-jcard-date-badge">
                          <span class="tm-a11y-jcard-day">${dayNum}</span>
                          <span class="tm-a11y-jcard-month">${monthStr}</span>
                          <span class="tm-a11y-jcard-year">${yearStr}</span>
                        </div>
                        ` : ''}
                        <div class="tm-a11y-jcard-info">
                          <div class="tm-a11y-jcard-event">${e.eventName || 'Untitled'}</div>
                          ${e.venue ? `<div class="tm-a11y-jcard-venue">${e.venue}${e.section ? ' · ' + e.section : ''}</div>` : ''}
                        </div>
                      </div>

                      ${(e.ratingOverall || e.ratingSensory) ? `
                      <div class="tm-a11y-jcard-ratings">
                        ${e.ratingOverall ? `
                        <div class="tm-a11y-jcard-rating">
                          <span class="tm-a11y-jcard-rating-label">Overall</span>
                          <div class="tm-a11y-jcard-stars">
                            ${[1,2,3,4,5].map(n => `<span class="tm-a11y-jcard-star ${n <= e.ratingOverall ? 'tm-a11y-jcard-star-on' : ''}">★</span>`).join('')}
                          </div>
                        </div>` : ''}
                        ${e.ratingSensory ? `
                        <div class="tm-a11y-jcard-rating">
                          <span class="tm-a11y-jcard-rating-label">Sensory</span>
                          <div class="tm-a11y-jcard-stars">
                            ${[1,2,3,4,5].map(n => `<span class="tm-a11y-jcard-star ${n <= e.ratingSensory ? 'tm-a11y-jcard-star-on' : ''}">★</span>`).join('')}
                          </div>
                        </div>` : ''}
                      </div>
                      ` : ''}

                      ${e.tags?.length ? `
                      <div class="tm-a11y-jcard-tags">
                        ${e.tags.map(t => `<span class="tm-a11y-jcard-tag">${TAG_LABELS[t] || t}</span>`).join('')}
                      </div>
                      ` : ''}

                      ${e.notes ? `<div class="tm-a11y-jcard-notes">${e.notes}</div>` : ''}

                      <div class="tm-a11y-jcard-actions">
                        <button class="tm-a11y-journal-edit-btn" data-entry-id="${e.id}">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          Edit
                        </button>
                        <button class="tm-a11y-journal-delete-btn" data-entry-id="${e.id}">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Delete
                        </button>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>

              <!-- Account management at bottom -->
              <div class="tm-a11y-tool-section" style="margin-top:8px;padding-top:10px;border-top:1px solid var(--tm-a11y-panel-border,#2a2e3d)">
                <div class="tm-a11y-account-banner">
                  <div class="tm-a11y-account-avatar">${(_authUser.displayName || 'U')[0].toUpperCase()}</div>
                  <div class="tm-a11y-account-info">
                    <span class="tm-a11y-account-name">${_authUser.displayName}</span>
                    <span class="tm-a11y-account-email">${_authUser.email}</span>
                  </div>
                  <button class="tm-a11y-toggle-btn" id="tmA11yLogoutBtn" style="flex-shrink:0;padding:5px 10px"><span>Log out</span></button>
                </div>
              </div>
            `}
          </div>
        </div>

      </div>
    `;

    // Attach event listeners
    attachPanelListeners(symbol);
  }

  // ══════════════════════════════════════════════════════════════
  // 3b. PIN-TO-COMPARE RENDERING
  // ══════════════════════════════════════════════════════════════

  /**
   * Render the pinned seats comparison area.
   * Shows 0, 1, or 2 pinned seats side by side with a clear visual comparison.
   * When 2 seats are pinned, highlights the "winner" in each category.
   */
  function renderPinnedComparison(symbol) {
    if (pinnedSeats.length === 0) {
      return `
        <div class="tm-a11y-pinned-area tm-a11y-pinned-empty">
          <div class="tm-a11y-pinned-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            <span>Pin up to 2 seats to compare them side by side</span>
          </div>
        </div>`;
    }

    const maxPrice = currentPreferences.maxPrice;

    if (pinnedSeats.length === 1) {
      const s = pinnedSeats[0];
      const inBudget = s.price <= maxPrice;
      return `
        <div class="tm-a11y-pinned-area">
          <div class="tm-a11y-pinned-header">
            <span class="tm-a11y-pinned-label">Pinned for comparison</span>
            <button class="tm-a11y-pinned-clear" id="tmA11yClearPins" aria-label="Clear all pinned seats">Clear</button>
          </div>
          <div class="tm-a11y-pinned-cards">
            <div class="tm-a11y-pinned-card ${inBudget ? 'tm-a11y-pinned-budget' : 'tm-a11y-pinned-over'}">
              <button class="tm-a11y-pin-remove" data-pin-index="0" aria-label="Unpin this seat">×</button>
              <div class="tm-a11y-pinned-section">${s.section}</div>
              ${s.row ? `<div class="tm-a11y-pinned-detail">Row ${s.row}${s.seatNumber ? ` · Seat ${s.seatNumber}` : ''}</div>` : ''}
              <div class="tm-a11y-pinned-price ${inBudget ? 'tm-a11y-price-budget' : 'tm-a11y-price-over'}">${symbol}${s.price.toFixed(2)}</div>
              ${s.qualityScore ? `<div class="tm-a11y-pinned-meta">View: ${(s.qualityScore * 100).toFixed(0)}%</div>` : ''}
              ${s.sellerType === 'resale' ? '<div class="tm-a11y-pinned-meta tm-a11y-pinned-resale">Resale</div>' : ''}
              ${s.type !== 'standard' ? `<div class="tm-a11y-pinned-meta">${s.type.charAt(0).toUpperCase() + s.type.slice(1)}</div>` : ''}
            </div>
            <div class="tm-a11y-pinned-card tm-a11y-pinned-placeholder">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              <span>Pin another seat to compare</span>
            </div>
          </div>
        </div>`;
    }

    // Two pinned seats — full comparison
    const a = pinnedSeats[0];
    const b = pinnedSeats[1];
    const aInBudget = a.price <= maxPrice;
    const bInBudget = b.price <= maxPrice;
    
    // Determine winners for each category
    const cheaperIdx = a.price < b.price ? 0 : a.price > b.price ? 1 : -1;
    const betterViewIdx = (a.qualityScore || 0) > (b.qualityScore || 0) ? 0 
      : (a.qualityScore || 0) < (b.qualityScore || 0) ? 1 : -1;
    // Prefer primary over resale
    const betterSellerIdx = a.sellerType === 'primary' && b.sellerType === 'resale' ? 0
      : b.sellerType === 'primary' && a.sellerType === 'resale' ? 1 : -1;

    function winClass(idx, winIdx) { return idx === winIdx ? 'tm-a11y-compare-win' : ''; }

    return `
      <div class="tm-a11y-pinned-area">
        <div class="tm-a11y-pinned-header">
          <span class="tm-a11y-pinned-label">Comparing 2 seats</span>
          <button class="tm-a11y-pinned-clear" id="tmA11yClearPins" aria-label="Clear all pinned seats">Clear</button>
        </div>
        <div class="tm-a11y-compare-table" role="table" aria-label="Seat comparison">
          <div class="tm-a11y-compare-row tm-a11y-compare-header-row" role="row">
            <div class="tm-a11y-compare-label" role="columnheader"></div>
            <div class="tm-a11y-compare-cell" role="columnheader">
              <button class="tm-a11y-pin-remove" data-pin-index="0" aria-label="Unpin seat A">×</button>
              Seat A
            </div>
            <div class="tm-a11y-compare-cell" role="columnheader">
              <button class="tm-a11y-pin-remove" data-pin-index="1" aria-label="Unpin seat B">×</button>
              Seat B
            </div>
          </div>
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">Section</div>
            <div class="tm-a11y-compare-cell" role="cell">${a.section}</div>
            <div class="tm-a11y-compare-cell" role="cell">${b.section}</div>
          </div>
          ${a.row || b.row ? `
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">Row</div>
            <div class="tm-a11y-compare-cell" role="cell">${a.row || '—'}</div>
            <div class="tm-a11y-compare-cell" role="cell">${b.row || '—'}</div>
          </div>` : ''}
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">Price</div>
            <div class="tm-a11y-compare-cell ${winClass(0, cheaperIdx)} ${aInBudget ? 'tm-a11y-price-budget' : 'tm-a11y-price-over'}" role="cell">${symbol}${a.price.toFixed(2)}</div>
            <div class="tm-a11y-compare-cell ${winClass(1, cheaperIdx)} ${bInBudget ? 'tm-a11y-price-budget' : 'tm-a11y-price-over'}" role="cell">${symbol}${b.price.toFixed(2)}</div>
          </div>
          ${(a.qualityScore || b.qualityScore) ? `
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">View</div>
            <div class="tm-a11y-compare-cell ${winClass(0, betterViewIdx)}" role="cell">${a.qualityScore ? (a.qualityScore * 100).toFixed(0) + '%' : '—'}</div>
            <div class="tm-a11y-compare-cell ${winClass(1, betterViewIdx)}" role="cell">${b.qualityScore ? (b.qualityScore * 100).toFixed(0) + '%' : '—'}</div>
          </div>` : ''}
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">Seller</div>
            <div class="tm-a11y-compare-cell ${winClass(0, betterSellerIdx)}" role="cell">${a.sellerType === 'resale' ? 'Resale' : 'Primary'}</div>
            <div class="tm-a11y-compare-cell ${winClass(1, betterSellerIdx)}" role="cell">${b.sellerType === 'resale' ? 'Resale' : 'Primary'}</div>
          </div>
          ${(a.type !== 'standard' || b.type !== 'standard') ? `
          <div class="tm-a11y-compare-row" role="row">
            <div class="tm-a11y-compare-label" role="rowheader">Type</div>
            <div class="tm-a11y-compare-cell" role="cell">${a.type.charAt(0).toUpperCase() + a.type.slice(1)}</div>
            <div class="tm-a11y-compare-cell" role="cell">${b.type.charAt(0).toUpperCase() + b.type.slice(1)}</div>
          </div>` : ''}
        </div>
      </div>`;
  }

  function renderSeatCards(seats, withinBudget, symbol) {
    const maxPrice = currentPreferences.maxPrice;
    const budgetSeats = seats.filter(s => s.price <= maxPrice);
    const overSeats = seats.filter(s => s.price > maxPrice);

    let html = '';

    if (budgetSeats.length > 0) {
      html += `<div class="tm-a11y-seat-group-label tm-a11y-group-budget">Within Budget (${budgetSeats.length})</div>`;
      budgetSeats.forEach(seat => {
        html += renderSingleCard(seat, symbol, true);
      });
    }

    if (overSeats.length > 0 && currentPreferences.focusModeEnabled) {
      html += `<div class="tm-a11y-seat-group-label tm-a11y-group-over">Over Budget (${overSeats.length}) — dimmed</div>`;
      overSeats.forEach(seat => {
        html += renderSingleCard(seat, symbol, false);
      });
    } else if (overSeats.length > 0) {
      html += `<div class="tm-a11y-seat-group-label tm-a11y-group-over">Over Budget (${overSeats.length})</div>`;
      overSeats.forEach(seat => {
        html += renderSingleCard(seat, symbol, false);
      });
    }

    return html;
  }

  function renderSingleCard(seat, symbol, inBudget) {
    const qualityLabel = seat.qualityScore 
      ? `<span class="tm-a11y-card-quality" title="View quality score">${(seat.qualityScore * 100).toFixed(0)}%</span>`
      : '';
    const sellerBadge = seat.sellerType === 'resale' 
      ? '<span class="tm-a11y-card-resale">Resale</span>' 
      : '';
    const typeBadge = seat.type && seat.type !== 'standard'
      ? `<span class="tm-a11y-card-type">${seat.type.charAt(0).toUpperCase() + seat.type.slice(1)}</span>`
      : '';

    // MCDA score badge
    let scoreBadge = '';
    if (currentPreferences.mcdaEnabled) {
      const scoreData = getSeatMCDAScore(seat);
      if (scoreData) {
        scoreBadge = `<span class="tm-a11y-score-badge tm-a11y-score-tier-${scoreData.tier}" 
                            title="MCDA: Price ${scoreData.subscores.price}%, View ${scoreData.subscores.viewQuality}%, Proximity ${scoreData.subscores.proximity}%, Aisle ${scoreData.subscores.aisleAccess}%">
                        ${scoreData.score}
                      </span>`;
      }
    }

    let detailParts = [];
    if (seat.row) detailParts.push(`Row ${seat.row}`);
    if (seat.seatNumber) detailParts.push(`Seat ${seat.seatNumber}`);
    const locationDetail = detailParts.join(' · ');

    // Description line (ticket type, shown below location)
    let descLine = '';
    if (seat.description && seat.description !== seat.section) {
      descLine = seat.description;
    } else if (seat.type && seat.type !== 'standard') {
      descLine = seat.type.charAt(0).toUpperCase() + seat.type.slice(1);
    }

    const ariaLabel = [
      seat.section,
      seat.row ? `Row ${seat.row}` : '',
      seat.seatNumber ? `Seat ${seat.seatNumber}` : '',
      `${symbol}${seat.price.toFixed(2)}`,
      seat.type !== 'standard' ? seat.type : ''
    ].filter(Boolean).join(', ');

    const pinned = isSeatPinned(seat);
    const pinIcon = pinned
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

    return `
      <div class="tm-a11y-seat-card ${inBudget ? 'tm-a11y-card-budget' : 'tm-a11y-card-over'} ${pinned ? 'tm-a11y-card-pinned' : ''}" 
           data-seat-id="${seat.id}"
           tabindex="0"
           role="button"
           aria-label="${ariaLabel}">
        <div class="tm-a11y-card-top">
          <div class="tm-a11y-card-location">
            <span class="tm-a11y-card-section">${seat.section}</span>
            ${locationDetail ? `<span class="tm-a11y-card-detail">${locationDetail}</span>` : ''}
            ${descLine ? `<span class="tm-a11y-card-desc">${descLine}</span>` : ''}
          </div>
          <div class="tm-a11y-card-actions">
            <button class="tm-a11y-like-btn" 
                    data-seat-id="${seat.id}" 
                    aria-label="Save seat preference for recommendations"
                    title="Save to recommendations">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
            </button>
            <button class="tm-a11y-pin-btn ${pinned ? 'tm-a11y-pin-active' : ''}" 
                    data-seat-id="${seat.id}" 
                    aria-label="${pinned ? 'Unpin seat' : 'Pin seat for comparison'}"
                    title="${pinned ? 'Unpin' : 'Pin to compare'}">
              ${pinIcon}
            </button>
            <div class="tm-a11y-card-price ${inBudget ? 'tm-a11y-price-budget' : 'tm-a11y-price-over'}">
              ${symbol}${seat.price.toFixed(2)}
            </div>
          </div>
        </div>
        <div class="tm-a11y-card-bottom">
          <span class="tm-a11y-card-area">${seat.areaName || ''}</span>
          <div class="tm-a11y-card-badges">
            ${scoreBadge}
            ${typeBadge}
            ${qualityLabel}
            ${sellerBadge}
          </div>
        </div>
        <div class="tm-a11y-card-select-row">
          <div class="tm-a11y-card-qty-wrap">
            <span class="tm-a11y-card-qty-label">Qty</span>
            <select class="tm-a11y-card-qty" data-seat-id="${seat.id}">
              ${[1,2,3,4,5,6].map(n => `<option value="${n}" ${n===(currentPreferences.ticketQty||2)?'selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <button class="tm-a11y-card-select-btn" data-seat-id="${seat.id}" 
                  title="Select this ticket on Ticketmaster">Select</button>
        </div>
      </div>
    `;
  }

  function attachPanelListeners(symbol) {
    // Close button
    document.getElementById('tmA11yClosePanel')?.addEventListener('click', togglePanel);

    // === Header avatar → go to Journal tab ===
    document.getElementById('tmA11yHeaderAvatar')?.addEventListener('click', () => {
      currentPanelTab = 'journal';
      renderPanelContent();
    });

    // === Header login button → go to Journal tab (shows login form) ===
    document.getElementById('tmA11yHeaderLoginBtn')?.addEventListener('click', () => {
      currentPanelTab = 'journal';
      renderPanelContent();
    });

    // === Tab switching ===
    document.querySelectorAll('.tm-a11y-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPanelTab = btn.dataset.tab;
        // Update tab button states
        document.querySelectorAll('.tm-a11y-tab-btn').forEach(b => {
          b.classList.toggle('tm-a11y-tab-active', b.dataset.tab === currentPanelTab);
          b.setAttribute('aria-selected', b.dataset.tab === currentPanelTab);
        });
        // Show/hide panels
        document.querySelectorAll('.tm-a11y-tab-panel').forEach(panel => {
          panel.classList.toggle('tm-a11y-tab-hidden', 
            panel.id !== `tmA11yTab${currentPanelTab.charAt(0).toUpperCase() + currentPanelTab.slice(1)}`);
        });
      });
    });

    // === Profile selector ===
    document.getElementById('tmA11yProfileSelect')?.addEventListener('change', (e) => {
      const profileId = e.target.value;
      if (profileId) {
        applyProfile(profileId);
      } else {
        // "No Profile" selected — clear active profile but keep current settings
        activeProfileId = null;
        currentPreferences.activeProfileId = null;
        broadcastPreferences();
      }
    });

    // Price sliders (synced across Seats + Filters tabs)
    document.querySelectorAll('.tm-a11y-price-slider-sync').forEach(slider => {
      slider.addEventListener('input', (e) => {
        document.querySelectorAll('.tm-a11y-price-display-sync').forEach(d => d.textContent = `${symbol}${e.target.value}`);
        document.querySelectorAll('.tm-a11y-price-slider-sync').forEach(s => { if (s !== e.target) s.value = e.target.value; });
      });
      slider.addEventListener('change', (e) => {
        currentPreferences.maxPrice = parseInt(e.target.value, 10);
        renderPanelContent();
        currentAdapter.applyMapHighlights();
        broadcastPreferences();
      });
    });

    // Ticket quantity filter
    document.getElementById('tmA11yTicketQty')?.addEventListener('change', (e) => {
      currentPreferences.ticketQty = parseInt(e.target.value, 10);
      renderPanelContent();
    });

    // Section filter
    document.getElementById('tmA11ySectionFilter')?.addEventListener('change', (e) => {
      currentPreferences.sectionFilter = e.target.value;
      _decisionInteractions.filtersApplied = true;
      computeDecisionStage();
      renderPanelContent();
    });

    // Sort
    document.getElementById('tmA11ySortBy')?.addEventListener('change', (e) => {
      currentPreferences.sortBy = e.target.value;
      _decisionInteractions.filtersApplied = true;
      computeDecisionStage();
      renderPanelContent();
    });

    // Seller type filter
    document.getElementById('tmA11ySellerFilter')?.addEventListener('change', (e) => {
      currentPreferences.sellerFilter = e.target.value;
      _decisionInteractions.filtersApplied = true;
      computeDecisionStage();
      renderPanelContent();
    });

    // Row range filters (debounced — user types then we filter)
    ['tmA11yRowMin', 'tmA11yRowMax'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', (e) => {
        const val = e.target.value.trim().toUpperCase();
        if (id === 'tmA11yRowMin') currentPreferences.rowMin = val;
        else currentPreferences.rowMax = val;
        clearTimeout(window._tmA11yRowDebounce);
        window._tmA11yRowDebounce = setTimeout(() => {
          _decisionInteractions.filtersApplied = true;
          computeDecisionStage();
          renderPanelContent();
        }, 500);
      });
    });

    // Colour scheme
    document.getElementById('tmA11yColourScheme')?.addEventListener('change', (e) => {
      currentPreferences.colourScheme = e.target.value;
      applyColourScheme(e.target.value);
      // Update scheme preview
      const preview = document.getElementById('tmA11ySchemePreview');
      if (preview) {
        const scheme = COLOUR_SCHEMES[e.target.value] || COLOUR_SCHEMES['default'];
        const swatch = preview.querySelector('.tm-a11y-scheme-swatch');
        const desc = preview.querySelector('.tm-a11y-scheme-desc');
        if (swatch) swatch.style.background = scheme['--tm-a11y-accent'];
        if (desc) desc.textContent = scheme.description;
      }
      broadcastPreferences();
    });

    // === Typography controls ===
    document.getElementById('tmA11yFontFamily')?.addEventListener('change', (e) => {
      currentPreferences.fontFamily = e.target.value;
      applyTypography();
      // Update font preview
      const preview = document.getElementById('tmA11yFontPreview');
      if (preview) {
        preview.style.fontFamily = FONT_FAMILIES[e.target.value] || 'inherit';
      }
      broadcastPreferences();
    });

    document.getElementById('tmA11yFontSize')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      const display = document.getElementById('tmA11yFontSizeVal');
      if (display) display.textContent = `${val}px`;
      // Update font preview size
      const preview = document.getElementById('tmA11yFontPreview');
      if (preview) preview.style.fontSize = `${val}px`;
    });
    document.getElementById('tmA11yFontSize')?.addEventListener('change', (e) => {
      currentPreferences.fontSize = parseInt(e.target.value, 10);
      applyTypography();
      broadcastPreferences();
    });

    document.getElementById('tmA11yLineSpacing')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const display = document.getElementById('tmA11yLineSpacingVal');
      if (display) display.textContent = `${val.toFixed(1)}×`;
      // Update font preview spacing
      const preview = document.getElementById('tmA11yFontPreview');
      if (preview) preview.style.lineHeight = `${val}`;
    });
    document.getElementById('tmA11yLineSpacing')?.addEventListener('change', (e) => {
      currentPreferences.lineSpacing = parseFloat(e.target.value);
      applyTypography();
      broadcastPreferences();
    });

    // === NEW: Declutter toggle ===
    document.getElementById('tmA11yDeclutterToggle')?.addEventListener('click', () => {
      currentPreferences.declutterEnabled = !currentPreferences.declutterEnabled;
      applyDeclutterMode();
      renderPanelContent();
      broadcastPreferences();
    });

    // === NEW: Animation freeze toggle ===
    document.getElementById('tmA11yAnimFreezeToggle')?.addEventListener('click', () => {
      currentPreferences.animationFreezeEnabled = !currentPreferences.animationFreezeEnabled;
      applyAnimationFreeze();
      renderPanelContent();
      broadcastPreferences();
    });

    // === NEW: Focus mode toggle (moved from popup-only to panel) ===
    document.getElementById('tmA11yFocusModeToggle')?.addEventListener('click', () => {
      currentPreferences.focusModeEnabled = !currentPreferences.focusModeEnabled;
      // Mutual exclusion: disable MCDA when enabling focus mode
      if (currentPreferences.focusModeEnabled && currentPreferences.mcdaEnabled) {
        currentPreferences.mcdaEnabled = false;
        removeHeatmapHighlights();
      }
      currentAdapter.applyMapHighlights();
      renderPanelContent();
      broadcastPreferences();
    });

    // === NEW: MCDA heatmap toggle ===
    document.getElementById('tmA11yMCDAToggle')?.addEventListener('click', () => {
      currentPreferences.mcdaEnabled = !currentPreferences.mcdaEnabled;
      // Mutual exclusion: disable focus mode when enabling MCDA
      if (currentPreferences.mcdaEnabled && currentPreferences.focusModeEnabled) {
        currentPreferences.focusModeEnabled = false;
        removeFocusHighlights();
      }
      if (currentPreferences.mcdaEnabled) {
        computeAllMCDAScores();
        // Auto-switch sort to score when first enabling
        if (currentPreferences.sortBy !== 'score-desc') {
          currentPreferences.sortBy = 'score-desc';
        }
      }
      currentAdapter.applyMapHighlights();
      renderPanelContent();
      broadcastPreferences();
    });

    // === MCDA preset buttons ===
    document.querySelectorAll('[data-mcda-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.mcdaPreset;
        const preset = MCDA_PRESETS[presetKey];
        if (!preset) return;
        currentPreferences.mcdaWeights = {
          price: preset.price,
          viewQuality: preset.viewQuality,
          proximity: preset.proximity,
          aisleAccess: preset.aisleAccess
        };
        computeAllMCDAScores();
        currentAdapter.applyMapHighlights();
        renderPanelContent();
        broadcastPreferences();
      });
    });

    // === MCDA custom weight sliders ===
    // Each slider is independent (0–100). The scoring engine normalises
    // internally by dividing each by the sum. No confusing auto-redistribution.
    document.querySelectorAll('.tm-a11y-mcda-slider-track').forEach(slider => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.mcdaKey;
        const newVal = parseInt(slider.value, 10);
        currentPreferences.mcdaWeights[key] = newVal;

        // Update % displays live (normalised)
        const w = currentPreferences.mcdaWeights;
        const total = w.price + w.viewQuality + w.proximity + w.aisleAccess;
        MCDA_CRITERIA.forEach(c => {
          const valEl = document.querySelector(`[data-mcda-val="${c.key}"]`);
          if (valEl) {
            const pct = total > 0 ? Math.round((w[c.key] / total) * 100) : 25;
            valEl.textContent = `${pct}%`;
          }
        });

        // Clear active preset highlight (now custom)
        document.querySelectorAll('.tm-a11y-mcda-preset-btn').forEach(b => {
          b.classList.remove('tm-a11y-preset-active');
        });
        // Check if it matches a preset
        const activePreset = getActivePreset();
        if (activePreset) {
          const activeBtn = document.querySelector(`[data-mcda-preset="${activePreset}"]`);
          if (activeBtn) activeBtn.classList.add('tm-a11y-preset-active');
        }
      });

      slider.addEventListener('change', () => {
        computeAllMCDAScores();
        currentAdapter.applyMapHighlights();
        renderPanelContent();
        broadcastPreferences();
      });
    });

    // === Scan All Seats button — user-initiated full scan ===
    document.getElementById('tmA11yScanAllBtn')?.addEventListener('click', () => {
      console.log(`[A11y Helper] User-initiated full scan (${capturedSeats.length} seats currently)`);
      scanState = 'scanning';
      scanProgress = 0;
      renderPanelContent();
      
      // Start the aggressive scan
      currentAdapter.autoScroll();
      
      // Safety timeout — unlock panel even if scan stalls
      setTimeout(() => { 
        if (scanState === 'scanning') { 
          console.log('[A11y Helper] Scan safety timeout'); 
          finishScan(); 
        } 
      }, 30000);
    });

    // === Rescan button — re-scroll sidebar to capture late-loading seats ===
    document.getElementById('tmA11yRescanBtn')?.addEventListener('click', () => {
      const before = capturedSeats.length;
      console.log(`[A11y Helper] Manual rescan triggered (${before} seats currently)`);
      
      scanState = 'scanning';
      scanProgress = 0;
      renderPanelContent();
      
      // First do a quick scrape of what's visible
      currentAdapter.scrapeSeats();
      
      // Then auto-scroll to catch everything
      currentAdapter.autoScroll();
      
      // Safety timeout
      setTimeout(() => { 
        if (scanState === 'scanning') { 
          console.log('[A11y Helper] Rescan safety timeout'); 
          finishScan(); 
        } 
      }, 30000);
    });

    // === NEW: Pin buttons on seat cards ===
    document.querySelectorAll('.tm-a11y-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const seatId = btn.dataset.seatId;
        const seat = capturedSeats.find(s => s.id === seatId);
        if (seat) {
          togglePinSeat(seat);
          // ── Tier 2: Record pin as a preference signal ──
          if (isSeatPinned(seat)) {
            UserPreferenceEngine.recordSelection(seat, eventMeta.eventId, eventMeta.venue);
            _decisionInteractions.seatsPinned = pinnedSeats.length;
            computeDecisionStage();
          }
        }
      });
    });

    // === Tier 2: Like buttons on seat cards (saves preference without checkout) ===
    document.querySelectorAll('.tm-a11y-like-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const seatId = btn.dataset.seatId;
        const seat = capturedSeats.find(s => s.id === seatId);
        if (seat) {
          UserPreferenceEngine.recordSelection(seat, eventMeta.eventId, eventMeta.venue);
          _decisionInteractions.seatsLiked++;
          computeDecisionStage();
          btn.classList.add('tm-a11y-like-active');
          btn.title = 'Saved ✓';
          setTimeout(() => {
            btn.classList.remove('tm-a11y-like-active');
            btn.title = 'Save to recommendations';
          }, 2000);
        }
      });
    });

    // === NEW: Clear pinned seats ===
    document.getElementById('tmA11yClearPins')?.addEventListener('click', () => {
      pinnedSeats = [];
      _decisionInteractions.seatsPinned = 0;
      computeDecisionStage();
      renderPanelContent();
    });

    // === NEW: Remove individual pinned seats ===
    document.querySelectorAll('.tm-a11y-pin-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.pinIndex, 10);
        if (!isNaN(idx) && pinnedSeats[idx]) {
          pinnedSeats.splice(idx, 1);
          renderPanelContent();
        }
      });
    });

    // Seat card clicks — scroll to seat on map (but not on button/select/pin/like clicks)
    document.querySelectorAll('.tm-a11y-seat-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.tm-a11y-card-select-btn, .tm-a11y-card-qty, .tm-a11y-pin-btn, .tm-a11y-like-btn')) return;
        _decisionInteractions.seatsViewed++;
        computeDecisionStage();
        currentAdapter.scrollToSeat(card.dataset.seatId);
      });
    });

    // === Implicit rejection tracking: seat visible >3s without interaction ===
    document.querySelectorAll('.tm-a11y-seat-card').forEach(card => {
      let viewTimer = null;
      const seatId = card.dataset.seatId;
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            viewTimer = setTimeout(() => {
              const seat = capturedSeats.find(s => s.id === seatId);
              if (seat && !isSeatPinned(seat)) {
                UserPreferenceEngine.recordRejection(seat, 'scroll_past');
              }
            }, 3000);
          } else {
            if (viewTimer) clearTimeout(viewTimer);
          }
        });
      }, { threshold: 0.5 });
      observer.observe(card);
      // Cancel rejection if user interacts
      card.addEventListener('click', () => { if (viewTimer) clearTimeout(viewTimer); });
    });

    // === Tier 2: Recommendation dismiss (+ negative signal recording) ===
    document.getElementById('tmA11yRecDismiss')?.addEventListener('click', () => {
      _recDismissed = true;
      // Record dismissed recommendations as strong negative signals
      if (_cachedRecommendations) {
        _cachedRecommendations.forEach(rec => {
          UserPreferenceEngine.recordRejection(rec.seat, 'dismiss');
        });
      }
      const recPanel = document.getElementById('tmA11yRecPanel');
      if (recPanel) recPanel.remove();
    });

    // === Tier 2: Recommendation card clicks — scroll to seat ===
    document.querySelectorAll('.tm-a11y-rec-card').forEach(card => {
      card.addEventListener('click', () => {
        currentAdapter.scrollToSeat(card.dataset.seatId);
      });
    });

    // === Tier 2: Clear recommendation history ===
    document.getElementById('tmA11yClearRecHistory')?.addEventListener('click', async () => {
      const btn = document.getElementById('tmA11yClearRecHistory');
      if (btn) btn.textContent = 'Clearing…';
      const count = await UserPreferenceEngine.clearHistory();
      _cachedRecommendations = null;
      _recDismissed = false;
      if (btn) btn.textContent = `✓ Cleared ${count} selections`;
      setTimeout(() => renderPanelContent(), 1500);
    });

    // === Tier 1: Venue tab — Retry / Refresh buttons ===
    const venueRetryHandler = async (btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.querySelector('span').textContent = 'Searching…';
        btn.disabled = true;
      }
      // Re-extract event meta to pick up venue name if it wasn't available before
      currentAdapter.getEventMeta();
      const vName = eventMeta.venue;
      if (vName) {
        // Clear cache to force fresh fetch
        const cacheKey = VenueMetadataService._cacheKey(eventMeta.eventId, vName);
        try { localStorage.removeItem(cacheKey); } catch (e) {}
        delete VenueMetadataService._cache[cacheKey];

        const meta = await VenueMetadataService.enrich(eventMeta.eventId, vName);
        if (meta) {
          _venueMeta = meta;
          eventMeta.venueMeta = meta;
        }
      }
      renderPanelContent();
    };
    document.getElementById('tmA11yVenueRetry')?.addEventListener('click', () => venueRetryHandler('tmA11yVenueRetry'));
    document.getElementById('tmA11yVenueRefresh')?.addEventListener('click', () => venueRetryHandler('tmA11yVenueRefresh'));

    // ══════════════════════════════════════════
    // Venue RAG Chatbot
    // ══════════════════════════════════════════
    const chatInput = document.getElementById('tmA11yChatInput');
    const chatSend = document.getElementById('tmA11yChatSend');
    const chatMessages = document.getElementById('tmA11yChatMessages');
    const chatClear = document.getElementById('tmA11yChatClear');

    if (chatInput && chatSend && chatMessages) {
      const sendChatMessage = () => {
        const msg = chatInput.value.trim();
        if (!msg) return;
        chatInput.value = '';

        // User bubble
        const userDiv = document.createElement('div');
        userDiv.className = 'tm-a11y-chat-msg tm-a11y-chat-user';
        userDiv.innerHTML = '<div class="tm-a11y-chat-bubble">' + msg.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        chatMessages.appendChild(userDiv);

        // Loading bubble
        const loadDiv = document.createElement('div');
        loadDiv.className = 'tm-a11y-chat-msg tm-a11y-chat-bot';
        loadDiv.id = 'tmA11yChatLoading';
        loadDiv.innerHTML = '<div class="tm-a11y-chat-bubble tm-a11y-chat-loading"><span class="tm-a11y-chat-dots"></span> Searching venue sources\u2026</div>';
        chatMessages.appendChild(loadDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Get venue context from cached meta
        const ctxText = _venueMeta?._contextText || '';
        const ctxSources = _venueMeta?._contextSources || [];
        const vName = eventMeta.venue || '';

        window.postMessage({
          source: 'tm-a11y-content',
          type: 'VENUE_CHAT',
          venueName: vName,
          userMessage: msg,
          contextText: ctxText,
          contextSources: ctxSources,
        }, '*');

        chatInput.disabled = true;
        chatSend.disabled = true;
      };

      chatSend.addEventListener('click', sendChatMessage);
      chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

      chatClear?.addEventListener('click', () => {
        const vName = eventMeta.venue || 'this venue';
        chatMessages.innerHTML = '<div class="tm-a11y-chat-msg tm-a11y-chat-bot"><div class="tm-a11y-chat-bubble">Ask me anything about accessibility at <strong>' + vName + '</strong>.</div></div>';
      });
    }

    // === Tier 1: OpenAI API key save ===
    const apiKeyInput = document.getElementById('tmA11yOpenAIKey');
    const apiKeyStatus = document.getElementById('tmA11yAPIKeyStatus');
    if (apiKeyInput) {
      // Load existing key on render — ask bridge for stored key
      window.postMessage({ source: 'tm-a11y-content', type: 'GET_OPENAI_KEY' }, '*');
      document.getElementById('tmA11ySaveAPIKey')?.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key || !key.startsWith('sk-')) {
          if (apiKeyStatus) apiKeyStatus.textContent = '\u26A0 Key should start with sk-';
          return;
        }
        window.postMessage({ source: 'tm-a11y-content', type: 'SAVE_OPENAI_KEY', apiKey: key }, '*');
        if (apiKeyStatus) apiKeyStatus.textContent = '\u2713 Saved. Refresh page to use for venue lookups.';
        apiKeyInput.value = key.substring(0, 7) + '...' + key.substring(key.length - 4);
      });
    }

    // === Auth: Login / Register / Logout ===
    document.getElementById('tmA11yLoginBtn')?.addEventListener('click', () => {
      const email = document.getElementById('tmA11yLoginEmail')?.value;
      const password = document.getElementById('tmA11yLoginPass')?.value;
      const status = document.getElementById('tmA11yAuthStatus');
      if (!email || !password) { if (status) status.textContent = 'Enter email and password'; return; }
      if (status) status.textContent = 'Logging in...';
      window.postMessage({ source: 'tm-a11y-content', type: 'AUTH_LOGIN', email, password }, '*');
    });

    document.getElementById('tmA11yShowRegisterBtn')?.addEventListener('click', () => {
      const login = document.getElementById('tmA11yLoginForm');
      const reg = document.getElementById('tmA11yRegisterForm');
      if (login) login.style.display = 'none';
      if (reg) reg.style.display = 'block';
    });

    document.getElementById('tmA11yShowLoginBtn')?.addEventListener('click', () => {
      const login = document.getElementById('tmA11yLoginForm');
      const reg = document.getElementById('tmA11yRegisterForm');
      if (login) login.style.display = 'block';
      if (reg) reg.style.display = 'none';
    });

    document.getElementById('tmA11yRegisterBtn')?.addEventListener('click', () => {
      const name = document.getElementById('tmA11yRegName')?.value;
      const email = document.getElementById('tmA11yRegEmail')?.value;
      const password = document.getElementById('tmA11yRegPass')?.value;
      const status = document.getElementById('tmA11yAuthStatus');
      if (!name || !email || !password) { if (status) status.textContent = 'Fill all fields'; return; }
      if (password.length < 6) { if (status) status.textContent = 'Password needs 6+ characters'; return; }
      if (status) status.textContent = 'Creating account...';
      window.postMessage({ source: 'tm-a11y-content', type: 'AUTH_REGISTER', displayName: name, email, password }, '*');
    });

    document.getElementById('tmA11yLogoutBtn')?.addEventListener('click', () => {
      window.postMessage({ source: 'tm-a11y-content', type: 'AUTH_LOGOUT' }, '*');
    });

    // === Journal: Add/Save/Edit/Delete ===
    document.getElementById('tmA11yAddEntryBtn')?.addEventListener('click', () => {
      _journalFormVisible = !_journalFormVisible;
      _journalEditId = null;
      renderPanelContent();
    });

    document.getElementById('tmA11yJournalSaveBtn')?.addEventListener('click', () => {
      const eventName = document.getElementById('tmA11yJournalEvent')?.value?.trim();
      if (!eventName || !_authUser) return;
      const entry = {
        eventName,
        venue: document.getElementById('tmA11yJournalVenue')?.value?.trim() || '',
        section: document.getElementById('tmA11yJournalSection')?.value?.trim() || '',
        ratingOverall: document.querySelectorAll('#tmA11yStarsOverall .tm-a11y-star-active').length,
        ratingSensory: document.querySelectorAll('#tmA11yStarsSensory .tm-a11y-star-active').length,
        tags: [...document.querySelectorAll('.tm-a11y-tag-check:checked')].map(c => c.value),
        notes: document.getElementById('tmA11yJournalNotes')?.value?.trim() || ''
      };
      const editId = document.getElementById('tmA11yJournalEditId')?.value;
      if (editId) {
        const idx = _journalEntries.findIndex(e => e.id === editId);
        if (idx !== -1) _journalEntries[idx] = { ..._journalEntries[idx], ...entry, updatedAt: new Date().toISOString() };
      } else {
        entry.id = 'entry_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        entry.createdAt = new Date().toISOString();
        entry.updatedAt = entry.createdAt;
        _journalEntries.unshift(entry);
      }
      window.postMessage({ source: 'tm-a11y-content', type: 'JOURNAL_SAVE', email: _authUser.email, entries: _journalEntries }, '*');
      _journalFormVisible = false;
      _journalEditId = null;
      renderPanelContent();
    });

    // Star rating buttons
    document.querySelectorAll('.tm-a11y-star-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.tm-a11y-star-row');
        const val = parseInt(btn.dataset.val, 10);
        row.querySelectorAll('.tm-a11y-star-btn').forEach((b, i) => {
          b.classList.toggle('tm-a11y-star-active', i < val);
        });
      });
    });

    // Edit/Delete journal entries
    document.querySelectorAll('.tm-a11y-journal-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = _journalEntries.find(e => e.id === btn.dataset.entryId);
        if (!entry) return;
        _journalEditId = entry.id;
        _journalFormVisible = true;
        renderPanelContent();
        setTimeout(() => {
          const el = (id) => document.getElementById(id);
          if (el('tmA11yJournalEvent')) el('tmA11yJournalEvent').value = entry.eventName || '';
          if (el('tmA11yJournalVenue')) el('tmA11yJournalVenue').value = entry.venue || '';
          if (el('tmA11yJournalSection')) el('tmA11yJournalSection').value = entry.section || '';
          if (el('tmA11yJournalNotes')) el('tmA11yJournalNotes').value = entry.notes || '';
          if (el('tmA11yJournalEditId')) el('tmA11yJournalEditId').value = entry.id;
          if (entry.ratingOverall) document.querySelectorAll('#tmA11yStarsOverall .tm-a11y-star-btn').forEach((b, i) => b.classList.toggle('tm-a11y-star-active', i < entry.ratingOverall));
          if (entry.ratingSensory) document.querySelectorAll('#tmA11yStarsSensory .tm-a11y-star-btn').forEach((b, i) => b.classList.toggle('tm-a11y-star-active', i < entry.ratingSensory));
          (entry.tags || []).forEach(t => { const chk = document.querySelector(`.tm-a11y-tag-check[value="${t}"]`); if (chk) chk.checked = true; });
        }, 100);
      });
    });

    document.querySelectorAll('.tm-a11y-journal-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!_authUser) return;
        _journalEntries = _journalEntries.filter(e => e.id !== btn.dataset.entryId);
        window.postMessage({ source: 'tm-a11y-content', type: 'JOURNAL_SAVE', email: _authUser.email, entries: _journalEntries }, '*');
        renderPanelContent();
      });
    });

    // === Select button — click TM listing + proceed to checkout ===
    document.querySelectorAll('.tm-a11y-card-select-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const seat = capturedSeats.find(s => s.id === btn.dataset.seatId);
        if (!seat) return;
        const qtySelect = btn.closest('.tm-a11y-seat-card')?.querySelector('.tm-a11y-card-qty');
        const qty = qtySelect ? parseInt(qtySelect.value, 10) : 2;
        btn.textContent = 'Selecting…';
        btn.disabled = true;
        currentAdapter.clickListing(seat, qty).then(success => {
          if (success) {
            btn.textContent = '✓ Selected';
            btn.classList.add('tm-a11y-select-success');
          } else {
            btn.textContent = 'Not found';
            btn.classList.add('tm-a11y-select-fail');
            setTimeout(() => { btn.textContent = 'Select'; btn.disabled = false; btn.classList.remove('tm-a11y-select-fail'); }, 2000);
          }
        });
      });
    });
  }

  /**
   * Click TM's sidebar listing then auto-click the checkout/proceed button.
   * 
   * TM flow: click listing → TM shows details + "Get Tickets"/"Add to Basket" → 
   * click that → redirect to checkout page.
   * 
   * We handle both steps automatically.
   */
  async function clickTMSidebarListing(seat, qty) {
    console.log(`[A11y Helper] 🛒 Selecting: ${seat.section} Row ${seat.row} @ £${seat.price} (qty: ${qty})`);

    // ── Step 1: Try to set TM's quantity selector ──
    const qtySelectors = [
      'select[data-testid*="quantity"]', 'select[aria-label*="quantity" i]',
      'select[aria-label*="Quantity" i]', 'select[id*="quantity" i]',
      'select[name*="qty" i]'
    ];
    for (const sel of qtySelectors) {
      try {
        const qtyEl = document.querySelector(sel);
        if (qtyEl && qtyEl.tagName === 'SELECT') {
          const opt = Array.from(qtyEl.options).find(o => parseInt(o.value) === qty);
          if (opt) {
            qtyEl.value = opt.value;
            qtyEl.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[A11y Helper] 🛒 Set quantity to ${qty}`);
            await new Promise(r => setTimeout(r, 600));
            break;
          }
        }
      } catch (e) {}
    }

    // ── Step 2: Find matching listing in TM's sidebar ──
    const allClickables = document.querySelectorAll('div, li, a, button, [role="button"], [role="listitem"]');
    const sectionNorm = seat.section.replace(/^Section\s*/i, '').replace(/\s+/g, '').toLowerCase();
    const priceStr = seat.price.toFixed(2);
    const priceInt = Math.round(seat.price);
    let bestMatch = null;
    let bestScore = 0;

    allClickables.forEach(el => {
      if (el.closest('#tm-a11y-companion-panel')) return;
      const text = el.textContent || '';
      if (text.length < 15 || text.length > 400) return;
      let score = 0;
      const textNorm = text.replace(/\s+/g, '').toLowerCase();
      if (textNorm.includes(sectionNorm)) score += 4;
      if (text.includes(priceStr)) score += 3;
      else if (text.includes(`£${priceInt}`) || text.includes(`$${priceInt}`)) score += 2;
      if (seat.row && new RegExp(`row\\s*${seat.row}\\b`, 'i').test(text)) score += 2;
      if (/each/i.test(text)) score += 1;
      if (text.length < 200) score += 1;
      if (score > bestScore && score >= 5) { bestScore = score; bestMatch = el; }
    });

    if (!bestMatch) {
      console.log(`[A11y Helper] 🛒 No matching listing found`);
      return false;
    }

    console.log(`[A11y Helper] 🛒 Found match (score ${bestScore}):`, bestMatch.textContent.substring(0, 80));

    // ── Step 3: Click the listing ──
    bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 400));
    bestMatch.style.outline = '3px solid var(--tm-a11y-accent, #3ecf8e)';
    bestMatch.click();
    try {
      bestMatch.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      bestMatch.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (e) {}

    console.log(`[A11y Helper] 🛒 Clicked listing, waiting for checkout button…`);

    // ── Step 4: Wait for and click the checkout/proceed button ──
    // TM shows a checkout button after selecting a listing.
    // We poll for it over 8 seconds with increasing intervals.
    const checkoutFound = await waitForCheckoutButton(8000);
    
    setTimeout(() => { if (bestMatch) bestMatch.style.outline = ''; }, 3000);
    return checkoutFound;
  }

  /**
   * Poll for TM's checkout/proceed button and click it.
   * TM uses various labels: "Get Tickets", "Add to Basket", "Checkout", "Continue", "Next"
   */
  async function waitForCheckoutButton(timeoutMs) {
    const startTime = Date.now();
    const checkoutPatterns = [
      // Button text patterns (case-insensitive)
      /get\s*tickets/i, /add\s*to\s*(basket|cart)/i, /checkout/i, 
      /continue/i, /proceed/i, /buy\s*now/i, /next/i, /confirm/i
    ];
    // Selector patterns for TM checkout buttons
    const checkoutSelectors = [
      'button[data-testid*="checkout"]', 'button[data-testid*="add-to-cart"]',
      'button[data-testid*="continue"]', 'button[data-testid*="get-ticket"]',
      'a[data-testid*="checkout"]', '[data-testid*="unified-checkout"]',
      'button[data-testid*="submit"]', 'button[data-bdd*="checkout"]',
      'button[data-bdd*="continue"]'
    ];

    while (Date.now() - startTime < timeoutMs) {
      // Try specific selectors first
      for (const sel of checkoutSelectors) {
        try {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) { // visible
            console.log(`[A11y Helper] 🛒 Found checkout button via selector: ${sel}`);
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 200));
            btn.style.outline = '3px solid #22c55e';
            btn.click();
            try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {}
            console.log(`[A11y Helper] 🛒 Clicked checkout button — should redirect to payment`);
            return true;
          }
        } catch (e) {}
      }

      // Try text-matching on visible buttons/links
      const buttons = document.querySelectorAll('button, a[role="button"], a[href*="checkout"], input[type="submit"]');
      for (const btn of buttons) {
        if (btn.closest('#tm-a11y-companion-panel')) continue;
        if (!btn.offsetParent) continue; // hidden
        const text = (btn.textContent || btn.value || '').trim();
        if (text.length < 2 || text.length > 40) continue;
        
        for (const pattern of checkoutPatterns) {
          if (pattern.test(text)) {
            // Make sure it's a real checkout button, not a nav link
            const rect = btn.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 20) continue; // too small
            
            console.log(`[A11y Helper] 🛒 Found checkout button by text: "${text}"`);
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 200));
            btn.style.outline = '3px solid #22c55e';
            btn.click();
            try { btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {}
            console.log(`[A11y Helper] 🛒 Clicked checkout — should redirect to payment`);
            return true;
          }
        }
      }

      // Wait before next poll (200ms → 500ms → 1s)
      const elapsed = Date.now() - startTime;
      const delay = elapsed < 2000 ? 200 : elapsed < 5000 ? 500 : 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    console.log(`[A11y Helper] 🛒 No checkout button found within ${timeoutMs}ms — user may need to click manually`);
    return false;
  }

  /**
   * Try to scroll the actual Ticketmaster seat map to a specific seat.
   * This is best-effort as TM's DOM structure varies.
   */
  function scrollToSeatOnMap(seatId) {
    const selectors = [
      `[data-seat-id="${seatId}"]`,
      `[data-seat="${seatId}"]`,
      `[data-testid*="${seatId}"]`,
      `#seat-${seatId}`
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Briefly flash the seat
          el.style.transition = 'outline 0.2s';
          el.style.outline = `4px solid var(--tm-a11y-seat-available, #22c55e)`;
          setTimeout(() => { el.style.outline = ''; }, 2000);
          return;
        }
      } catch (e) {}
    }
    console.log('[A11y Helper] Could not locate seat on map:', seatId);
  }


  // ══════════════════════════════════════════════════════════════
  // 4. FOCUS MODE — SVG SEAT MAP DIMMING
  // ══════════════════════════════════════════════════════════════
  //
  // Dims seats on TM's SVG seat map that are NOT in our sidebar data.
  // Available seats glow bright; unavailable/out-of-budget seats dim.
  //
  // TM SVG structure (from DOM inspection):
  //   <g data-component="svg_block" data-section-name="104" class="section">
  //     <g class="seats">
  //       <g data-row-name="20">
  //         <circle data-component="svg__seat" data-seat-name="13" type="primary" />
  //
  // We match our sidebar-extracted seats (which have section + row) to
  // the SVG's section/row hierarchy. Seats whose section+row combo
  // appears in our captured data get highlighted; everything else dims.
  // ══════════════════════════════════════════════════════════════

  function applyFocusMode() {
    if (!currentPreferences.focusModeEnabled) {
      removeFocusHighlights();
      return;
    }
    highlightSVGSeats();
  }

  /**
   * Build a lookup of available sections + rows from sidebar data,
   * then walk the SVG seat map and apply visual classes.
   * 
   * Uses fuzzy matching for section names because the sidebar and SVG
   * use different naming conventions:
   *   Sidebar: "Section BL 210"  →  SVG: "BL210" or "210" or "BL 210"
   *   Sidebar: "Section 530"     →  SVG: "530" or "Section 530"
   */
  function highlightSVGSeats() {
    if (capturedSeats.length === 0) {
      console.log('[A11y Helper] Focus mode: no seats captured yet, skipping');
      return;
    }

    // ── Build normalised section lookup ──
    // For each captured section, generate multiple name variants for matching
    const availableRows = new Map();   // "normalisedSection|row" → cheapest price
    const availableSections = new Map(); // normalisedName → cheapest price
    const sectionVariants = new Map();  // variant → canonical section name

    capturedSeats.forEach(seat => {
      // Strip "Section " prefix to get the raw name
      const rawSection = seat.section.replace(/^Section\s*/i, '').trim();
      
      // Generate all variants of this section name for fuzzy matching
      const variants = generateSectionVariants(rawSection);
      variants.forEach(v => sectionVariants.set(v, rawSection));
      
      // Track by section
      const existing = availableSections.get(rawSection);
      if (!existing || seat.price < existing) {
        availableSections.set(rawSection, seat.price);
      }
      
      // Track by section + row
      if (seat.row) {
        const rowKey = `${rawSection}|${seat.row}`;
        const existingRow = availableRows.get(rowKey);
        if (!existingRow || seat.price < existingRow) {
          availableRows.set(rowKey, seat.price);
        }
      }
    });

    console.log(`[A11y Helper] Focus mode: ${availableSections.size} sections, ${availableRows.size} section+row combos`);

    // ── Walk SVG section groups and apply dimming ──
    const sectionGroups = document.querySelectorAll(
      'g[data-section-name], g[data-component="svg_block"], [data-section-id], path[data-section-name], [data-component="svg_section"]'
    );

    if (sectionGroups.length === 0) {
      console.log('[A11y Helper] Focus mode: no SVG section groups found');
      // Try individual seat circles
      dimIndividualSeats();
      return;
    }

    // Log SVG section names for debugging (first time only)
    if (!window._tmA11ySVGSectionsLogged) {
      const svgNames = [];
      sectionGroups.forEach(g => {
        const name = g.getAttribute('data-section-name') || g.getAttribute('data-section-id') || '';
        if (name) svgNames.push(name);
      });
      console.log(`[A11y Helper] SVG sections found: ${svgNames.join(', ')}`);
      console.log(`[A11y Helper] Sidebar sections: ${Array.from(availableSections.keys()).join(', ')}`);
      window._tmA11ySVGSectionsLogged = true;
    }

    let matched = 0;
    let dimmed = 0;

    sectionGroups.forEach(sectionG => {
      const svgName = (sectionG.getAttribute('data-section-name') || 
                       sectionG.getAttribute('data-section-id') || '').trim();
      if (!svgName) return;

      // Try to match SVG section name to our captured sections
      const svgVariants = generateSectionVariants(svgName);
      let matchedSection = null;
      
      for (const variant of svgVariants) {
        if (sectionVariants.has(variant)) {
          matchedSection = sectionVariants.get(variant);
          break;
        }
      }

      // Also try direct match against available sections
      if (!matchedSection && availableSections.has(svgName)) {
        matchedSection = svgName;
      }

      const allClasses = ['tm-a11y-seat-highlighted', 'tm-a11y-seat-greyed', 'tm-a11y-seat-unavailable'];

      if (!matchedSection) {
        // No match → dim entire section
        sectionG.classList.add('tm-a11y-seat-unavailable');
        sectionG.classList.remove('tm-a11y-seat-highlighted', 'tm-a11y-seat-greyed');
        applyFocusInlineStyle(sectionG, 'unavailable');
        dimmed++;
        return;
      }

      matched++;
      
      // Section matched — now check rows within it
      sectionG.classList.remove(...allClasses);
      clearFocusInlineStyles(sectionG);
      
      // For <path> elements (no child rows), apply directly
      if (sectionG.tagName.toLowerCase() === 'path') {
        const sectionPrice = availableSections.get(matchedSection);
        if (sectionPrice !== undefined) {
          const inBudget = sectionPrice <= currentPreferences.maxPrice;
          sectionG.classList.add(inBudget ? 'tm-a11y-seat-highlighted' : 'tm-a11y-seat-greyed');
          applyFocusInlineStyle(sectionG, inBudget ? 'highlighted' : 'greyed');
        }
        return;
      }

      const rowGroups = sectionG.querySelectorAll('g[data-row-name]');

      if (rowGroups.length > 0) {
        rowGroups.forEach(rowG => {
          const rowName = (rowG.getAttribute('data-row-name') || '').trim();
          const rowKey = `${matchedSection}|${rowName}`;
          const rowPrice = availableRows.get(rowKey);

          rowG.classList.remove(...allClasses);
          clearFocusInlineStyles(rowG);

          if (rowPrice !== undefined) {
            const inBudget = rowPrice <= currentPreferences.maxPrice;
            rowG.classList.add(inBudget ? 'tm-a11y-seat-highlighted' : 'tm-a11y-seat-greyed');
            // Apply inline styles to child shapes too
            rowG.querySelectorAll('circle, rect, path').forEach(shape => {
              applyFocusInlineStyle(shape, inBudget ? 'highlighted' : 'greyed');
            });
          } else {
            rowG.classList.add('tm-a11y-seat-unavailable');
            rowG.querySelectorAll('circle, rect, path').forEach(shape => {
              applyFocusInlineStyle(shape, 'unavailable');
            });
          }
        });
      } else {
        // No row groups — highlight entire section based on cheapest price
        const sectionPrice = availableSections.get(matchedSection);
        if (sectionPrice !== undefined) {
          const inBudget = sectionPrice <= currentPreferences.maxPrice;
          sectionG.classList.add(inBudget ? 'tm-a11y-seat-highlighted' : 'tm-a11y-seat-greyed');
          applyFocusInlineStyle(sectionG, inBudget ? 'highlighted' : 'greyed');
          // Also child shapes
          sectionG.querySelectorAll('circle, rect, path').forEach(shape => {
            applyFocusInlineStyle(shape, inBudget ? 'highlighted' : 'greyed');
          });
        }
      }
    });

    console.log(`[A11y Helper] Focus mode: ${matched} sections highlighted, ${dimmed} dimmed`);

    // Also handle loose seat circles not in section groups
    dimIndividualSeats();
  }

  /**
   * Generate normalised variants of a section name for fuzzy matching.
   * "BL 210" → ["BL 210", "BL210", "210", "bl 210", "bl210"]
   * "530"    → ["530"]
   * "Early Entry VIP Experience" → ["Early Entry VIP Experience", "earlyentryvipexperience"]
   */
  function generateSectionVariants(name) {
    const variants = new Set();
    const n = name.trim();
    if (!n) return variants;
    
    variants.add(n);                           // "BL 210"
    variants.add(n.toLowerCase());             // "bl 210"
    variants.add(n.replace(/\s+/g, ''));       // "BL210"
    variants.add(n.toLowerCase().replace(/\s+/g, '')); // "bl210"
    
    // Strip common prefixes: "BL ", "Block ", "Section "
    const stripped = n.replace(/^(BL|Block|Section|SEC|Level|Tier)\s*/i, '');
    if (stripped !== n) {
      variants.add(stripped);                  // "210"
      variants.add(stripped.toLowerCase());    // "210"
    }

    // Try just the numeric part
    const numMatch = n.match(/(\d+)/);
    if (numMatch) {
      variants.add(numMatch[1]);               // "210"
    }

    return variants;
  }

  /**
   * Handle individual seat circles that aren't inside section groups.
   */
  function dimIndividualSeats() {
    const seatSelectors = [
      'circle[data-component="svg__seat"]', 'circle[data-seat-name]',
      '[data-component="seat"]', '[data-testid*="seat"]',
      '.seat-button', '.seat'
    ];
    
    seatSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el.closest('.tm-a11y-seat-highlighted, .tm-a11y-seat-greyed, .tm-a11y-seat-unavailable')) return;
          if (el.closest('#tm-a11y-companion-panel')) return;

          // Try to determine if this seat is available by checking its section/row
          const sectionG = el.closest('g[data-section-name]');
          if (sectionG) return; // Already handled by section-level logic

          // For loose seats, match by data attributes
          const seatId = el.dataset?.seatId || el.dataset?.seat || el.id;
          const matched = capturedSeats.find(s => s.id === seatId);

          const allClasses = ['tm-a11y-seat-highlighted', 'tm-a11y-seat-greyed', 'tm-a11y-seat-unavailable'];
          el.classList.remove(...allClasses);

          if (matched) {
            const inBudget = matched.price <= currentPreferences.maxPrice;
            el.classList.add(inBudget ? 'tm-a11y-seat-highlighted' : 'tm-a11y-seat-greyed');
          } else {
            el.classList.add('tm-a11y-seat-unavailable');
          }
        });
      } catch (e) {}
    });
  }

  function removeFocusHighlights() {
    const classes = ['tm-a11y-seat-highlighted', 'tm-a11y-seat-greyed', 'tm-a11y-seat-unavailable'];
    classes.forEach(cls => {
      document.querySelectorAll('.' + cls).forEach(el => el.classList.remove(cls));
    });
    // Also clear inline styles applied for specificity override
    document.querySelectorAll('[data-tm-a11y-focus]').forEach(el => {
      clearFocusInlineStyles(el);
    });
  }

  /**
   * Apply inline focus mode styles to an SVG element.
   * Uses inline styles to beat TM's styled-components specificity.
   * mode: 'highlighted' | 'greyed' | 'unavailable'
   */
  function applyFocusInlineStyle(el, mode) {
    el.setAttribute('data-tm-a11y-focus', mode);
    const root = document.documentElement;
    const cs = getComputedStyle(root);

    if (mode === 'highlighted') {
      const colour = cs.getPropertyValue('--tm-a11y-seat-available').trim() || '#22c55e';
      el.style.setProperty('fill', colour, 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.removeProperty('filter');
    } else if (mode === 'greyed') {
      el.style.setProperty('opacity', '0.35', 'important');
      el.style.setProperty('filter', 'grayscale(80%)', 'important');
    } else {
      // unavailable
      el.style.setProperty('opacity', '0.12', 'important');
      el.style.setProperty('filter', 'grayscale(100%)', 'important');
    }
  }

  /**
   * Clear inline focus mode styles from an element.
   */
  function clearFocusInlineStyles(el) {
    if (el.getAttribute('data-tm-a11y-focus')) {
      el.style.removeProperty('fill');
      el.style.removeProperty('opacity');
      el.style.removeProperty('filter');
      el.removeAttribute('data-tm-a11y-focus');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 5. TYPOGRAPHY CUSTOMISATION
  // ══════════════════════════════════════════════════════════════

  function loadAccessibilityFonts() {
    if (document.getElementById('tm-a11y-fonts-loaded')) return;
    const fontStyle = document.createElement('style');
    fontStyle.id = 'tm-a11y-fonts-loaded';
    fontStyle.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Andika:wght@400;700&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Bitter:wght@400;600;700&display=swap');
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff');
        font-weight: normal; font-style: normal;
      }
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff') format('woff');
        font-weight: bold; font-style: normal;
      }
    `;
    document.head.insertBefore(fontStyle, document.head.firstChild);
  }

  function applyTypography() {
    const { fontFamily, fontSize, lineSpacing } = currentPreferences;
    removeTypography();

    if (fontFamily === 'default' && fontSize === 16 && lineSpacing === 1.5) return;
    // Load web fonts for any non-system font
    if (['opendyslexic', 'atkinson', 'lexend', 'andika', 'bitter'].includes(fontFamily)) {
      loadAccessibilityFonts();
    }

    const fontFamilyValue = FONT_FAMILIES[fontFamily];

    styleElement = document.createElement('style');
    styleElement.id = 'tm-a11y-typography-override';

    let css = '';

    // ── Font family: applies to BOTH the TM page AND our panel ──
    // This is safe — font-family doesn't affect layout/spacing.
    if (fontFamilyValue) {
      css += `
        html body *:not(svg *) { font-family: ${fontFamilyValue} !important; }
        #tm-a11y-companion-panel, #tm-a11y-companion-panel * { font-family: ${fontFamilyValue} !important; }
      `;
    }

    // ── Font size + line spacing: applies ONLY to the TM page, NOT our panel ──
    // The companion panel has its own carefully tuned sizing.
    if (fontSize !== 16 || lineSpacing !== 1.5) {
      const sizeProps = [];
      if (fontSize !== 16) sizeProps.push(`font-size: ${fontSize}px !important`);
      if (lineSpacing !== 1.5) sizeProps.push(`line-height: ${lineSpacing} !important`);
      const sizeStr = sizeProps.join('; ');

      css += `
        /* TM page text — NOT our panel */
        header:not(#tm-a11y-companion-panel *) *,
        nav *,
        footer *,
        [class*="event"] *, [class*="Event"] *,
        [class*="breadcrumb"] *, [class*="Breadcrumb"] *,
        [class*="listing"] *, [class*="Listing"] *,
        [class*="ticket"] *, [class*="Ticket"] *,
        [class*="offer"] *, [class*="Offer"] *,
        [class*="results"] *, [class*="Results"] *,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > span,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > div,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > p,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > a,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > button,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > h1,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > h2,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > h3,
        [class*="sc-"]:not(svg [class*="sc-"]):not(#tm-a11y-companion-panel [class*="sc-"]) > li,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) p,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) span,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) a,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) button,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) li,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) h1,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) h2,
        body > div:not(:has(svg[data-component])):not(#tm-a11y-companion-panel) h3,
        [class*="banner"] *, [class*="Banner"] *,
        [class*="notice"] *, [class*="Notice"] *,
        [class*="info-bar"] *, [class*="InfoBar"] *,
        [class*="important"] *, [class*="Important"] *,
        [class*="SimilarListings"] *, [class*="FilterBar"] *,
        [class*="search-result"] *, [class*="SearchResult"] *,
        [data-testid*="listing"] *, [data-testid*="ticket"] *,
        [role="list"]:not(#tm-a11y-companion-panel [role="list"]) > *,
        [role="listbox"]:not(#tm-a11y-companion-panel [role="listbox"]) > *
        { ${sizeStr}; }
      `;
    }

    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }

  function applyTypoToElement() {
    // No-op: typography is CSS-only
  }

  function removeTypography() {
    if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
    if (styleElement) { styleElement.remove(); styleElement = null; }
    document.getElementById('tm-a11y-typography-override')?.remove();
    document.querySelectorAll('[data-tm-a11y-styled="true"]').forEach(el => {
      el.style.removeProperty('font-family');
      el.style.removeProperty('font-size');
      el.style.removeProperty('line-height');
      el.removeAttribute('data-tm-a11y-styled');
    });
  }


  // ══════════════════════════════════════════════════════════════
  // 6. DECLUTTER MODE — AD REMOVAL
  // ══════════════════════════════════════════════════════════════
  //
  // Surgically hides advertisement containers on Ticketmaster pages.
  // Targets only elements with id containing "ad_unit" (TM's ad wrapper).
  //
  // Previous versions used 70+ CSS selectors and FOMO text patterns
  // which were too aggressive and stripped legitimate UI elements.
  // Now we only touch actual ads.
  //
  // Targets ADHD (ads compete for attention, trigger impulsive clicks)
  // and Autism (unexpected visual interruptions cause distress).
  // ══════════════════════════════════════════════════════════════

  function applyDeclutterMode() {
    removeDeclutter();

    if (!currentPreferences.declutterEnabled) return;

    declutterHiddenCount = 0;

    /**
     * Safety check: never hide an element that contains the seat map,
     * main content, or navigation.
     */
    function isSafeToHide(el) {
      if (el.closest('#tm-a11y-companion-panel')) return false;
      // Never hide anything that contains the SVG seat map
      if (el.querySelector('svg[data-component="svg"], [aria-label*="Seat Map"], [id*="map-container"], [data-component="zoomer"]')) return false;
      if (el.closest('[aria-label*="Seat Map"], [id*="map-container"], [data-component="zoomer"]')) return false;
      // Never hide main, nav, header, footer
      if (el.tagName === 'MAIN' || el.tagName === 'NAV' || el.tagName === 'HEADER') return false;
      if (el.id === 'main-content' || el.id === 'content') return false;
      return true;
    }

    /**
     * Walk up at most 2 levels to find the ad wrapper,
     * but ONLY if the parent looks like a pure ad wrapper (very few children).
     */
    function findAdWrapper(el) {
      let target = el;
      for (let i = 0; i < 2; i++) {
        const parent = target.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) break;
        if (parent.tagName === 'MAIN' || parent.tagName === 'NAV' || parent.tagName === 'HEADER') break;
        if (parent.id === 'main-content' || parent.id === 'content') break;
        // Only walk up if parent has ≤ 2 children (it's just an ad wrapper)
        if (parent.children.length > 2) break;
        // Don't walk up if parent contains non-ad content
        if (parent.querySelector('svg, [aria-label], [data-component]')) break;
        target = parent;
      }
      return target;
    }

    // ── Target ad_unit containers ──
    const adSelectors = [
      '[id*="ad_unit"]',
      '[id*="ad-unit"]',
      '[id*="ad_slot"]',
      '[id*="ad-slot"]',
      '[id*="dclk-studio"]'
    ];

    adSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el.getAttribute('data-tm-a11y-decluttered')) return;
          if (!isSafeToHide(el)) return;

          const target = findAdWrapper(el);
          if (!isSafeToHide(target)) return;

          target.setAttribute('data-tm-a11y-decluttered', 'true');
          target.style.setProperty('display', 'none', 'important');
          declutterHiddenCount++;
        });
      } catch (e) {}
    });

    // ── Hide iframes from Google ad networks ──
    document.querySelectorAll('iframe').forEach(iframe => {
      if (iframe.getAttribute('data-tm-a11y-decluttered')) return;
      if (!isSafeToHide(iframe)) return;

      const id = (iframe.id || '').toLowerCase();
      const src = (iframe.src || '').toLowerCase();

      if (/google_ads|doubleclick|googlesyndication|adservice|sadbundle/.test(id + src)) {
        const target = findAdWrapper(iframe);
        if (!isSafeToHide(target)) return;

        if (!target.getAttribute('data-tm-a11y-decluttered')) {
          target.setAttribute('data-tm-a11y-decluttered', 'true');
          target.style.setProperty('display', 'none', 'important');
          declutterHiddenCount++;
        }
      }
    });

    // ── Hide FOMO / urgency elements (not ads, but anxiety-inducing) ──
    const fomoSelectors = [
      '[class*="urgency"]', '[class*="countdown"]', '[class*="timer"]',
      '[data-testid*="urgency"]', '[data-testid*="countdown"]'
    ];
    fomoSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el.closest('#tm-a11y-companion-panel')) return;
          if (el.getAttribute('data-tm-a11y-decluttered')) return;
          if (!isSafeToHide(el)) return;
          el.setAttribute('data-tm-a11y-decluttered', 'true');
          el.style.setProperty('display', 'none', 'important');
          declutterHiddenCount++;
        });
      } catch (e) {}
    });

    if (declutterHiddenCount > 0) {
      console.log(`[A11y Helper] Declutter: hidden ${declutterHiddenCount} ad/FOMO elements`);
    }
  }

  function removeDeclutter() {
    if (declutterStyleElement) {
      declutterStyleElement.remove();
      declutterStyleElement = null;
    }
    document.getElementById('tm-a11y-declutter-styles')?.remove();

    document.querySelectorAll('[data-tm-a11y-decluttered]').forEach(el => {
      el.style.removeProperty('display');
      el.removeAttribute('data-tm-a11y-decluttered');
    });

    declutterHiddenCount = 0;
  }

  // ══════════════════════════════════════════════════════════════
  // 7. ANIMATION FREEZE — STOP ALL HOST PAGE MOTION
  // ══════════════════════════════════════════════════════════════

  /**
   * Animation freeze injects a global CSS rule that stops ALL animations,
   * transitions, and scroll behaviours on the host page.
   * 
   * This goes beyond the existing `prefers-reduced-motion` CSS which only
   * affects our own panel elements. This affects TM's own:
   * - Seat map hover effects and pulsing dots
   * - Loading spinners and skeleton screens
   * - Carousel auto-scrolling
   * - Banner transitions and fade effects
   * - SVG <animate> elements in seat maps
   * 
   * Targets autistic sensory processing (unexpected motion is distressing)
   * and ADHD attention capture (motion involuntarily pulls focus).
   */
  function applyAnimationFreeze() {
    removeAnimationFreeze();
    
    if (!currentPreferences.animationFreezeEnabled) return;

    animationFreezeStyleElement = document.createElement('style');
    animationFreezeStyleElement.id = 'tm-a11y-animation-freeze';
    animationFreezeStyleElement.textContent = `
      /* Global animation/transition freeze — excludes our own panel */
      *:not(#tm-a11y-companion-panel):not(#tm-a11y-companion-panel *):not(#tm-a11y-panel-tab) {
        animation: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
        transition: none !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
        will-change: auto !important;
      }
      
      /* Stop SVG animations (seat map pulsing dots, etc.) */
      svg animate,
      svg animateTransform,
      svg animateMotion,
      svg set {
        display: none !important;
      }
      
      /* Stop GIF animations by freezing the first frame */
      img[src$=".gif"]:not(#tm-a11y-companion-panel img) {
        animation-play-state: paused !important;
      }
      
      /* Stop CSS-based carousels / marquees */
      [class*="carousel"]:not(#tm-a11y-companion-panel *),
      [class*="Carousel"]:not(#tm-a11y-companion-panel *),
      [class*="marquee"]:not(#tm-a11y-companion-panel *),
      [class*="slider"]:not(#tm-a11y-companion-panel *):not(.tm-a11y-slider),
      [class*="Slider"]:not(#tm-a11y-companion-panel *) {
        animation: none !important;
        transition: none !important;
        overflow: hidden !important;
      }
      
      /* Freeze auto-playing video elements */
      video:not(#tm-a11y-companion-panel video) {
        animation-play-state: paused !important;
      }
    `;
    document.head.appendChild(animationFreezeStyleElement);

    // Also pause any auto-playing videos on the page
    document.querySelectorAll('video').forEach(v => {
      if (!v.closest('#tm-a11y-companion-panel')) {
        try { v.pause(); } catch (e) {}
      }
    });

    console.log('[A11y Helper] Animation freeze: all page motion stopped');
  }

  function removeAnimationFreeze() {
    if (animationFreezeStyleElement) {
      animationFreezeStyleElement.remove();
      animationFreezeStyleElement = null;
    }
    document.getElementById('tm-a11y-animation-freeze')?.remove();
  }


  // ══════════════════════════════════════════════════════════════
  // 8a. SENSORY PROFILE SYSTEM
  // ══════════════════════════════════════════════════════════════

  /** Get all profiles: built-in + custom, in display order */
  function getAllProfiles() {
    return [...BUILT_IN_PROFILES, ...customProfiles];
  }

  /** Get the currently active profile object (or null) */
  function getActiveProfile() {
    if (!activeProfileId) return null;
    return getAllProfiles().find(p => p.id === activeProfileId) || null;
  }

  /**
   * Apply a sensory profile — merges its settings into currentPreferences,
   * then triggers all visual updates (colour scheme, typography, focus mode, etc.)
   */
  function applyProfile(profileId) {
    const profile = getAllProfiles().find(p => p.id === profileId);
    if (!profile) {
      activeProfileId = null;
      currentPreferences.activeProfileId = null;
      broadcastPreferences();
      if (panelElement) renderPanelContent();
      return;
    }

    activeProfileId = profileId;
    currentPreferences.activeProfileId = profileId;

    // Merge profile settings into preferences
    const s = profile.settings;
    if (s.colourScheme !== undefined) currentPreferences.colourScheme = s.colourScheme;
    if (s.fontFamily !== undefined) currentPreferences.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) currentPreferences.fontSize = s.fontSize;
    if (s.lineSpacing !== undefined) currentPreferences.lineSpacing = s.lineSpacing;
    if (s.focusModeEnabled !== undefined) currentPreferences.focusModeEnabled = s.focusModeEnabled;
    if (s.declutterEnabled !== undefined) currentPreferences.declutterEnabled = s.declutterEnabled;
    if (s.animationFreezeEnabled !== undefined) currentPreferences.animationFreezeEnabled = s.animationFreezeEnabled;

    // Load MCDA weights from profile
    if (profile.mcdaWeights) {
      currentPreferences.mcdaWeights = { ...profile.mcdaWeights };
    }

    // Apply all visual changes
    applyColourScheme(currentPreferences.colourScheme);
    applyTypography();
    currentAdapter.applyMapHighlights();
    applyDeclutterMode();
    applyAnimationFreeze();

    // Save and re-render
    broadcastPreferences();
    if (panelElement) renderPanelContent();

    console.log(`[A11y Helper] Profile applied: "${profile.name}"`);
  }

  /** Create a new custom profile from current settings */
  function createProfileFromCurrent(name) {
    const profile = {
      id: 'custom_' + Date.now(),
      name: name,
      builtIn: false,
      description: '',
      settings: {
        focusModeEnabled: currentPreferences.focusModeEnabled,
        colourScheme: currentPreferences.colourScheme,
        fontFamily: currentPreferences.fontFamily,
        fontSize: currentPreferences.fontSize,
        lineSpacing: currentPreferences.lineSpacing,
        declutterEnabled: currentPreferences.declutterEnabled,
        animationFreezeEnabled: currentPreferences.animationFreezeEnabled
      },
      mcdaWeights: { ...(currentPreferences.mcdaWeights || { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 }) }
    };
    customProfiles.push(profile);
    saveProfilesToStorage();
    return profile;
  }

  /** Delete a custom profile by ID */
  function deleteProfile(profileId) {
    customProfiles = customProfiles.filter(p => p.id !== profileId);
    if (activeProfileId === profileId) {
      activeProfileId = null;
      currentPreferences.activeProfileId = null;
      broadcastPreferences();
    }
    saveProfilesToStorage();
  }

  /** Save custom profiles to storage via bridge */
  function saveProfilesToStorage() {
    window.postMessage({
      source: 'tm-a11y-content',
      type: 'SAVE_PROFILES',
      profiles: customProfiles
    }, '*');
  }

  /** Request profiles from bridge */
  function requestProfiles() {
    window.postMessage({
      source: 'tm-a11y-content',
      type: 'REQUEST_PROFILES'
    }, '*');
  }


  // ══════════════════════════════════════════════════════════════
  // 8a-ii. MCDA SCORING ENGINE
  // ══════════════════════════════════════════════════════════════

  /**
   * Section name → view quality heuristic (0–1).
   * Higher = better view.
   */
  const VIEW_QUALITY_TIERS = [
    { pattern: /\b(floor|pit|standing\s*a|ga\s*floor|field|stage)\b/i, score: 1.0 },
    { pattern: /\b(vip|premium|suite|hospitality|club)\b/i, score: 0.9 },
    { pattern: /\b(lower|100s?|1\d{2})\b/i, score: 0.8 },
    { pattern: /\bsection\s*(10[0-9]|1[0-4]\d)\b/i, score: 0.8 },
    { pattern: /\b(200s?|2\d{2}|club|mezzanine)\b/i, score: 0.6 },
    { pattern: /\bsection\s*(2\d{2})\b/i, score: 0.6 },
    { pattern: /\b(300s?|3\d{2}|upper|balcony|terrace)\b/i, score: 0.4 },
    { pattern: /\bsection\s*(3\d{2})\b/i, score: 0.4 },
    { pattern: /\b(400s?|4\d{2}|500s?|5\d{2}|nosebleed)\b/i, score: 0.25 },
    { pattern: /\bsection\s*([4-9]\d{2})\b/i, score: 0.25 }
  ];

  function computeViewQuality(section) {
    if (!section) return 0.5;
    for (const tier of VIEW_QUALITY_TIERS) {
      if (tier.pattern.test(section)) return tier.score;
    }
    // Fallback: try to extract section number
    const numMatch = section.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num <= 150) return 0.8;
      if (num <= 250) return 0.6;
      if (num <= 350) return 0.4;
      return 0.25;
    }
    return 0.5; // Unknown → middle
  }

  /**
   * Parse row identifier into a numeric value.
   * "1" → 1, "A" → 1, "AA" → 27, "GA" → null (general admission)
   */
  function parseRowNumber(row) {
    if (!row) return null;
    const trimmed = row.trim().toUpperCase();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^[A-Z]$/.test(trimmed)) return trimmed.charCodeAt(0) - 64; // A=1, B=2
    if (/^[A-Z]{2}$/.test(trimmed)) {
      return (trimmed.charCodeAt(0) - 64) * 26 + (trimmed.charCodeAt(1) - 64);
    }
    return null;
  }

  /**
   * Parse seat number(s) and return the primary seat number.
   * "5" → 5, "1-2" → 1, "12, 13" → 12
   */
  function parseSeatNumber(seatStr) {
    if (!seatStr) return null;
    const match = seatStr.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Compute all MCDA sub-scores and composite scores for every available seat.
   * Results stored in `mcdaScores` map keyed by seatContentKey.
   */
  function computeAllMCDAScores() {
    mcdaScores = new Map();
    const available = capturedSeats.filter(s => s.availability === 'available');
    if (available.length === 0) return;

    const weights = currentPreferences.mcdaWeights || { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 };
    const wSum = weights.price + weights.viewQuality + weights.proximity + weights.aisleAccess;
    const w = {
      price: wSum > 0 ? (weights.price / wSum) : 0.25,
      viewQuality: wSum > 0 ? (weights.viewQuality / wSum) : 0.25,
      proximity: wSum > 0 ? (weights.proximity / wSum) : 0.25,
      aisleAccess: wSum > 0 ? (weights.aisleAccess / wSum) : 0.25
    };

    /**
     * Percentile-based normalisation (Winsorisation).
     * Clamps values at the 5th and 95th percentile before 0–1 scaling.
     * This prevents a single outlier (e.g. one £350 ticket among £60 tickets)
     * from compressing the entire score range.
     */
    function robustNormalise(values, lowerPct = 0.05, upperPct = 0.95) {
      if (values.length === 0) return { min: 0, max: 1 };
      const sorted = [...values].sort((a, b) => a - b);
      const lowerIdx = Math.floor(sorted.length * lowerPct);
      const upperIdx = Math.min(sorted.length - 1, Math.ceil(sorted.length * upperPct));
      const pMin = sorted[lowerIdx];
      const pMax = sorted[upperIdx];
      return { min: pMin, max: pMax };
    }

    // ── Gather raw values for normalisation ──
    const prices = available.map(s => s.price);
    const priceRange = robustNormalise(prices);

    const rowNums = available.map(s => parseRowNumber(s.row)).filter(r => r !== null);
    const rowRange = robustNormalise(rowNums);

    // For aisle access: group seats by section, find max seat number per section
    const sectionMaxSeat = new Map();
    available.forEach(s => {
      const sn = parseSeatNumber(s.seatNumber);
      if (sn !== null) {
        const sec = s.section;
        sectionMaxSeat.set(sec, Math.max(sectionMaxSeat.get(sec) || 0, sn));
      }
    });

    // ── Score each seat ──
    available.forEach(seat => {
      // Price score: lower price = higher score (inverted, clamped + normalised 0–1)
      let priceScore = 0.5;
      if (priceRange.max > priceRange.min) {
        const clamped = Math.max(priceRange.min, Math.min(priceRange.max, seat.price));
        priceScore = 1 - (clamped - priceRange.min) / (priceRange.max - priceRange.min);
      } else {
        priceScore = 1.0; // All same price
      }

      // View quality: section name heuristic
      const viewScore = computeViewQuality(seat.section);

      // Proximity: row number (lower = better, clamped)
      let proximityScore = 0.5;
      const rowNum = parseRowNumber(seat.row);
      if (rowNum !== null && rowRange.max > rowRange.min) {
        const clamped = Math.max(rowRange.min, Math.min(rowRange.max, rowNum));
        proximityScore = 1 - (clamped - rowRange.min) / (rowRange.max - rowRange.min);
      } else if (rowNum !== null) {
        proximityScore = 1.0;
      }

      // Aisle access: edge seats score higher
      let aisleScore = 0.5;
      const seatNum = parseSeatNumber(seat.seatNumber);
      if (seatNum !== null) {
        const maxInSection = sectionMaxSeat.get(seat.section) || 20;
        // Distance from nearest edge (seat 1 or max)
        const distFromEdge = Math.min(seatNum - 1, maxInSection - seatNum);
        const maxDist = Math.floor(maxInSection / 2);
        aisleScore = maxDist > 0 ? 1 - (distFromEdge / maxDist) : 1.0;
      }

      // Composite weighted score (0–100)
      const composite = (
        w.price * priceScore +
        w.viewQuality * viewScore +
        w.proximity * proximityScore +
        w.aisleAccess * aisleScore
      ) * 100;

      const score = Math.round(Math.max(0, Math.min(100, composite)));
      const tier = scoreToTier(score);

      const key = seatContentKey(seat);
      mcdaScores.set(key, {
        score,
        tier,
        subscores: {
          price: Math.round(priceScore * 100),
          viewQuality: Math.round(viewScore * 100),
          proximity: Math.round(proximityScore * 100),
          aisleAccess: Math.round(aisleScore * 100)
        }
      });
    });

    console.log(`[A11y Helper] MCDA scores computed for ${mcdaScores.size} seats`);
  }

  /**
   * Map a score (0–100) to one of 5 tiers.
   * T1 = best (81–100), T5 = worst (0–20).
   */
  function scoreToTier(score) {
    if (score >= 81) return 1;
    if (score >= 61) return 2;
    if (score >= 41) return 3;
    if (score >= 21) return 4;
    return 5;
  }

  /**
   * Get the CSS class for a heatmap tier.
   */
  function tierClass(tier) {
    return `tm-a11y-heat-t${tier}`;
  }

  /**
   * Get the MCDA score data for a seat (or null).
   */
  function getSeatMCDAScore(seat) {
    const key = seatContentKey(seat);
    return mcdaScores.get(key) || null;
  }

  // ══════════════════════════════════════════════════════════════
  // 8a-iii. HEATMAP MODE — SVG SEAT MAP RECOLOURING
  // ══════════════════════════════════════════════════════════════

  /**
   * Apply the MCDA heatmap to the SVG seat map.
   * This REPLACES focus mode when MCDA is active.
   * Each section/row group gets coloured by its best seat's tier.
   * 
   * IMPORTANT: We use INLINE STYLES (not just CSS classes) because
   * TM's styled-components CSS has very high specificity that overrides
   * our class-based fill rules.
   */
  function applyHeatmapMode() {
    if (!currentPreferences.mcdaEnabled) {
      removeHeatmapHighlights();
      return;
    }

    // Recompute scores
    computeAllMCDAScores();

    if (capturedSeats.length === 0 || mcdaScores.size === 0) return;

    // Remove existing focus mode highlights first
    removeFocusHighlights();

    // Build lookup: section → best tier
    const sectionBestTier = new Map();
    const rowBestTier = new Map(); // "section|row" → best tier

    capturedSeats.forEach(seat => {
      if (seat.availability !== 'available') return;
      const scoreData = getSeatMCDAScore(seat);
      if (!scoreData) return;

      const rawSection = seat.section.replace(/^Section\s*/i, '').trim();
      const existing = sectionBestTier.get(rawSection);
      if (!existing || scoreData.tier < existing) {
        sectionBestTier.set(rawSection, scoreData.tier);
      }

      if (seat.row) {
        const rowKey = `${rawSection}|${seat.row}`;
        const existingRow = rowBestTier.get(rowKey);
        if (!existingRow || scoreData.tier < existingRow) {
          rowBestTier.set(rowKey, scoreData.tier);
        }
      }
    });

    // Build section variant lookup (same logic as focus mode)
    const sectionVariants = new Map();
    sectionBestTier.forEach((tier, rawSection) => {
      const variants = generateSectionVariants(rawSection);
      variants.forEach(v => sectionVariants.set(v, rawSection));
    });

    const heatClasses = ['tm-a11y-heat-t1', 'tm-a11y-heat-t2', 'tm-a11y-heat-t3', 'tm-a11y-heat-t4', 'tm-a11y-heat-t5'];
    const allVisualClasses = [...heatClasses, 'tm-a11y-seat-highlighted', 'tm-a11y-seat-greyed', 'tm-a11y-seat-unavailable'];

    // Walk SVG section elements (both <g> groups and <path> sections)
    const sectionElements = document.querySelectorAll(
      'g[data-section-name], g[data-component="svg_block"], [data-section-id], path[data-section-name], [data-component="svg_section"]'
    );

    sectionElements.forEach(el => {
      const svgName = (el.getAttribute('data-section-name') ||
                       el.getAttribute('data-section-id') || '').trim();
      if (!svgName) return;

      const svgVariants = generateSectionVariants(svgName);
      let matchedSection = null;
      for (const variant of svgVariants) {
        if (sectionVariants.has(variant)) {
          matchedSection = sectionVariants.get(variant);
          break;
        }
      }
      if (!matchedSection && sectionBestTier.has(svgName)) {
        matchedSection = svgName;
      }

      el.classList.remove(...allVisualClasses);
      clearHeatmapInlineStyles(el);

      if (!matchedSection) {
        applyHeatmapInlineStyle(el, null); // Unavailable
        return;
      }

      // For <g> elements, check rows within
      if (el.tagName.toLowerCase() === 'g') {
        const rowGroups = el.querySelectorAll('g[data-row-name]');
        if (rowGroups.length > 0) {
          rowGroups.forEach(rowG => {
            const rowName = (rowG.getAttribute('data-row-name') || '').trim();
            const rowKey = `${matchedSection}|${rowName}`;
            const tier = rowBestTier.get(rowKey);
            clearHeatmapInlineStyles(rowG);
            applyHeatmapInlineStyle(rowG, tier !== undefined ? tier : null);
            // Also style child shapes
            rowG.querySelectorAll('circle, rect, path').forEach(shape => {
              clearHeatmapInlineStyles(shape);
              applyHeatmapInlineStyle(shape, tier !== undefined ? tier : null);
            });
          });
          return;
        }
      }

      // Direct section element (path or g without rows)
      const tier = sectionBestTier.get(matchedSection);
      applyHeatmapInlineStyle(el, tier !== undefined ? tier : null);

      // Also style child shapes for <g> elements
      if (el.tagName.toLowerCase() === 'g') {
        el.querySelectorAll('circle, rect, path').forEach(shape => {
          clearHeatmapInlineStyles(shape);
          applyHeatmapInlineStyle(shape, tier !== undefined ? tier : null);
        });
      }
    });

    // Handle loose seat elements
    heatmapIndividualSeats();
  }

  /**
   * Tier colour & opacity lookup.
   * Returns the resolved CSS colour from custom properties.
   */
  function getTierColour(tier) {
    const root = document.documentElement;
    const prop = `--tm-a11y-heat-t${tier}`;
    return getComputedStyle(root).getPropertyValue(prop).trim() || '#6b7280';
  }

  const TIER_OPACITY = { 1: '1', 2: '1', 3: '0.95', 4: '0.9', 5: '0.85' };

  /**
   * Apply inline heatmap styles to an SVG element.
   * Uses inline styles with !important to beat styled-components specificity.
   * tier=null → unavailable (dim)
   */
  function applyHeatmapInlineStyle(el, tier) {
    el.setAttribute('data-tm-a11y-heatmap', tier !== null ? `t${tier}` : 'unavail');

    if (tier === null) {
      el.style.setProperty('opacity', '0.12', 'important');
      el.style.setProperty('filter', 'grayscale(100%)', 'important');
      return;
    }

    const colour = getTierColour(tier);
    const opacity = TIER_OPACITY[tier] || '0.5';

    el.style.setProperty('fill', colour, 'important');
    el.style.setProperty('opacity', opacity, 'important');
    el.style.removeProperty('filter');
  }

  /**
   * Clear inline heatmap styles from an element.
   */
  function clearHeatmapInlineStyles(el) {
    if (el.getAttribute('data-tm-a11y-heatmap')) {
      el.style.removeProperty('fill');
      el.style.removeProperty('opacity');
      el.style.removeProperty('filter');
      el.removeAttribute('data-tm-a11y-heatmap');
    }
  }

  /**
   * Apply heatmap colours to individual seat circles not in section groups.
   */
  function heatmapIndividualSeats() {
    const seatSelectors = [
      'circle[data-component="svg__seat"]', 'circle[data-seat-name]',
      '[data-component="seat"]', '[data-testid*="seat"]',
      '.seat-button', '.seat'
    ];

    seatSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => {
          if (el.closest('[data-tm-a11y-heatmap]')) return;
          if (el.closest('#tm-a11y-companion-panel')) return;
          const sectionG = el.closest('g[data-section-name], [data-section-id]');
          if (sectionG) return;

          const seatId = el.dataset?.seatId || el.dataset?.seat || el.id;
          const matched = capturedSeats.find(s => s.id === seatId);

          clearHeatmapInlineStyles(el);
          if (matched) {
            const scoreData = getSeatMCDAScore(matched);
            applyHeatmapInlineStyle(el, scoreData ? scoreData.tier : null);
          } else {
            applyHeatmapInlineStyle(el, null);
          }
        });
      } catch (e) {}
    });
  }

  /**
   * Remove all heatmap visual changes from the SVG seat map.
   * Clears both CSS classes and inline styles.
   */
  function removeHeatmapHighlights() {
    // Remove CSS classes
    const classes = ['tm-a11y-heat-t1', 'tm-a11y-heat-t2', 'tm-a11y-heat-t3', 'tm-a11y-heat-t4', 'tm-a11y-heat-t5'];
    classes.forEach(cls => {
      document.querySelectorAll('.' + cls).forEach(el => el.classList.remove(cls));
    });
    // Remove inline styles applied by heatmap
    document.querySelectorAll('[data-tm-a11y-heatmap]').forEach(el => {
      clearHeatmapInlineStyles(el);
    });
  }

  /**
   * Master function: apply the correct map visualisation mode.
   * MCDA heatmap and focus mode are mutually exclusive.
   */
  function applyMapVisualisation() {
    if (currentPreferences.mcdaEnabled) {
      removeFocusHighlights();
      applyHeatmapMode();
    } else if (currentPreferences.focusModeEnabled) {
      removeHeatmapHighlights();
      applyFocusMode();
    } else {
      removeFocusHighlights();
      removeHeatmapHighlights();
    }
  }


  // ══════════════════════════════════════════════════════════════
  // 8a-ii. MAPBOX GL HEATMAP (shared by Viagogo + StubHub)
  // ══════════════════════════════════════════════════════════════

  /**
   * Apply heatmap/focus colouring to a Mapbox GL map instance.
   * 
   * Both Viagogo and StubHub render their seat maps with Mapbox GL.
   * The sections are drawn as vector fill layers on a WebGL canvas —
   * NOT as DOM SVG elements we can style with CSS.
   * 
   * To recolour sections we must:
   *   1. Get the live Mapbox GL `Map` instance (captured by our interceptor)
   *   2. Walk `map.getStyle().layers` to find fill layers
   *   3. Match layer IDs/source-layer names to our scraped section data
   *   4. Call `map.setPaintProperty()` to change fill-color and fill-opacity
   * 
   * @param {string} platformName — 'viagogo' or 'stubhub' (for logging)
   * @returns {boolean} true if highlights were applied
   */
  function applyMapboxHeatmap(platformName) {
    if (capturedSeats.length === 0) return false;
    if (!currentPreferences.mcdaEnabled && !currentPreferences.focusModeEnabled) return false;

    if (currentPreferences.mcdaEnabled) computeAllMCDAScores();

    // ── Find the Mapbox GL map instance ──
    const map = _getMapboxInstance();
    if (!map) {
      console.log(`[A11y Helper] 🗺️ ${platformName}: No Mapbox instance found (${_capturedMapInstances.length} captured)`);
      return false;
    }

    // ── Build section → best tier / best price lookups ──
    const sectionBestTier = new Map();
    const sectionBestPrice = new Map();

    capturedSeats.forEach(seat => {
      if (seat.availability !== 'available') return;
      // Strip prefixes: "Section 419" → "419", "Upper Tier 208" → "Upper Tier 208"
      const rawSection = seat.section
        .replace(/^Section\s*/i, '')
        .replace(/^Block\s*/i, '')
        .trim();

      const ep = sectionBestPrice.get(rawSection);
      if (!ep || seat.price < ep) sectionBestPrice.set(rawSection, seat.price);

      if (currentPreferences.mcdaEnabled) {
        const scoreData = getSeatMCDAScore(seat);
        if (scoreData) {
          const et = sectionBestTier.get(rawSection);
          if (!et || scoreData.tier < et) sectionBestTier.set(rawSection, scoreData.tier);
        }
      }
    });

    if (sectionBestPrice.size === 0) return false;

    // Build variant lookup for fuzzy matching
    const sectionVariantsMap = new Map();
    sectionBestPrice.forEach((price, rawSection) => {
      const variants = generateSectionVariants(rawSection);
      variants.forEach(v => sectionVariantsMap.set(v, rawSection));
    });

    const heatColors = {
      1: '#22c55e', 2: '#86efac', 3: '#fde047', 4: '#fb923c', 5: '#ef4444'
    };

    let applied = 0;
    let dimmed = 0;

    try {
      const style = map.getStyle();
      if (!style || !style.layers) return false;

      style.layers.forEach(layer => {
        if (!layer.id) return;
        if (layer.type !== 'fill') return; // Only fill layers (section polygons)

        // ── Try to match this layer to a section ──
        const layerId = layer.id;
        const sourceLayer = layer['source-layer'] || '';

        // Extract candidate section numbers/names from layer ID and source-layer
        let matchedSection = null;
        const candidates = [layerId, sourceLayer];

        for (const candidate of candidates) {
          if (!candidate) continue;

          // Try direct variant match on the full candidate string
          const candidateVariants = generateSectionVariants(candidate);
          for (const v of candidateVariants) {
            if (sectionVariantsMap.has(v)) {
              matchedSection = sectionVariantsMap.get(v);
              break;
            }
          }
          if (matchedSection) break;

          // Try extracting just the number portion
          const numMatch = candidate.match(/(\d{2,4})/);
          if (numMatch) {
            const numVariants = generateSectionVariants(numMatch[1]);
            for (const v of numVariants) {
              if (sectionVariantsMap.has(v)) {
                matchedSection = sectionVariantsMap.get(v);
                break;
              }
            }
          }
          if (matchedSection) break;

          // Try matching "upper-tier-208" or "floor_standing" style IDs
          const parts = candidate.replace(/[-_]/g, ' ').toLowerCase();
          for (const [key] of sectionBestPrice) {
            if (parts.includes(key.toLowerCase())) {
              matchedSection = key;
              break;
            }
          }
          if (matchedSection) break;
        }

        try {
          if (matchedSection) {
            applied++;
            if (currentPreferences.mcdaEnabled && sectionBestTier.has(matchedSection)) {
              const tier = sectionBestTier.get(matchedSection);
              map.setPaintProperty(layerId, 'fill-color', heatColors[tier] || '#fde047');
              map.setPaintProperty(layerId, 'fill-opacity', 0.75);
            } else if (currentPreferences.focusModeEnabled) {
              const cheapest = sectionBestPrice.get(matchedSection);
              const inBudget = cheapest <= currentPreferences.maxPrice;
              map.setPaintProperty(layerId, 'fill-color', inBudget ? '#22c55e' : '#f97316');
              map.setPaintProperty(layerId, 'fill-opacity', inBudget ? 0.7 : 0.3);
            }
          } else {
            // Dim unmatched fill layers (but skip base/background layers)
            if (!/background|base|land|water|road|building|label|text|icon|border/i.test(layerId)) {
              map.setPaintProperty(layerId, 'fill-opacity', 0.15);
              dimmed++;
            }
          }
        } catch (e) {
          // Layer may not support this paint property — ignore
        }
      });

      console.log(`[A11y Helper] 🗺️ ${platformName}: Mapbox heatmap applied — ${applied} sections coloured, ${dimmed} dimmed`);
      return applied > 0;
    } catch (e) {
      console.log(`[A11y Helper] 🗺️ ${platformName}: Mapbox heatmap error:`, e.message);
      return false;
    }
  }

  /**
   * Get the best available Mapbox GL map instance.
   * Tries the interceptor capture array first, then DOM probing.
   */
  function _getMapboxInstance() {
    // Priority 1: Instances captured by our constructor interceptor
    for (const inst of _capturedMapInstances) {
      try {
        if (inst && typeof inst.getStyle === 'function' && inst.getStyle()) {
          return inst;
        }
      } catch (e) {}
    }

    // Priority 2: Global mapboxgl references
    if (window.mapboxgl?._instances) {
      for (const inst of window.mapboxgl._instances) {
        try {
          if (inst && typeof inst.getStyle === 'function') return inst;
        } catch (e) {}
      }
    }

    // Priority 3: Walk DOM map containers for stored references
    const mapEls = document.querySelectorAll('.mapboxgl-map, #SeatMapMapbox, #MapBoxWrapper [data-testid="map-container"]');
    for (const el of mapEls) {
      // Check common property names
      for (const key of ['__mapboxgl', '_mapboxgl', '__map', '_map', 'mapbox', 'map', '_mapboxMap']) {
        try {
          if (el[key] && typeof el[key].getStyle === 'function') return el[key];
        } catch (e) {}
      }
      // Check all own properties for map-like objects
      try {
        for (const key of Object.keys(el)) {
          if (el[key] && typeof el[key].getStyle === 'function' && typeof el[key].setPaintProperty === 'function') {
            return el[key];
          }
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Reset all Mapbox GL heatmap paint changes back to defaults.
   */
  function resetMapboxHeatmap() {
    const map = _getMapboxInstance();
    if (!map) return;
    try {
      const style = map.getStyle();
      if (!style?.layers) return;
      style.layers.forEach(layer => {
        if (layer.type !== 'fill') return;
        try {
          // Reset to original style values (Mapbox will use the style spec defaults)
          map.setPaintProperty(layer.id, 'fill-opacity', null);
          map.setPaintProperty(layer.id, 'fill-color', null);
        } catch (e) {}
      });
    } catch (e) {}
  }


  // ══════════════════════════════════════════════════════════════
  // 9. VENUE ACCESSIBILITY METADATA — RAG EXTRACTION (TIER 1)
  // ══════════════════════════════════════════════════════════════
  // Flow: content.js → bridge.js → background.js (fetch page + OpenAI) → back
  // Returns 8 features: yes / no / not_specified
  // Cache: localStorage, 7-day TTL
  // ══════════════════════════════════════════════════════════════

  const VenueMetadataService = {
    _cache: {},  // in-memory session cache
    _pendingCallbacks: {},  // callbacks waiting for bridge response

    /** Sanitise venue name for cache key */
    _sanitiseName(name) {
      return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 60);
    },

    /** Cache key for localStorage */
    _cacheKey(eventId, venueName) {
      return `venue_meta_v7_${eventId || 'unknown'}_${this._sanitiseName(venueName)}`;
    },

    /** Check localStorage cache (30-day TTL) */
    _getFromCache(eventId, venueName) {
      try {
        const key = this._cacheKey(eventId, venueName);
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const cached = JSON.parse(raw);
        const age = Date.now() - (cached.last_updated || 0);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (age > sevenDays) {
          localStorage.removeItem(key);
          return null;
        }
        cached.data_source = 'cached';
        return cached;
      } catch (e) {
        return null;
      }
    },

    /** Save to localStorage cache */
    _saveToCache(eventId, venueName, meta) {
      try {
        const key = this._cacheKey(eventId, venueName);
        localStorage.setItem(key, JSON.stringify(meta));
      } catch (e) {
        console.log('[A11y Helper] Venue cache save failed:', e.message);
      }
    },

    /**
     * Main enrichment function.
     * Checks cache first, then requests from bridge.js via postMessage.
     */
    async enrich(eventId, venueName) {
      if (!venueName || venueName.length < 3) return null;

      // 1. Check in-memory cache
      const memKey = this._cacheKey(eventId, venueName);
      if (this._cache[memKey]) return this._cache[memKey];

      // 2. Check localStorage cache
      const cached = this._getFromCache(eventId, venueName);
      if (cached) {
        this._cache[memKey] = cached;
        return cached;
      }

      // 3. Request from bridge.js → background.js (RAG: page fetch + OpenAI)
      console.log(`[A11y Helper] Requesting venue metadata via bridge for: "${venueName}"`);
      return new Promise((resolve) => {
        // Set a timeout — RAG pipeline (page fetch + OpenAI) can take 10-15s
        const timeoutId = setTimeout(() => {
          delete this._pendingCallbacks[venueName];
          console.log('[A11y Helper] Venue metadata request timed out');
          resolve(null);
        }, 15000);

        this._pendingCallbacks[venueName] = (meta) => {
          clearTimeout(timeoutId);
          delete this._pendingCallbacks[venueName];
          if (meta) {
            // Don't cache error results (no API key, API failure, etc.)
            if (!meta.error) {
              this._saveToCache(eventId, venueName, meta);
              this._cache[memKey] = meta;
            }
            console.log(`[A11y Helper] Venue metadata received from bridge: ${meta.data_source}`);
          } else {
            console.log('[A11y Helper] Bridge returned no venue data');
          }
          resolve(meta);
        };

        // Send request to bridge.js
        window.postMessage({
          source: 'tm-a11y-content',
          type: 'FETCH_VENUE_META',
          venueName: venueName
        }, '*');
      });
    },

    /** Handle response from bridge.js */
    _handleBridgeResponse(data) {
      const venueName = data.venueName;
      const callback = this._pendingCallbacks[venueName];
      if (callback) {
        callback(data.meta || null);
      }
    }
  };

  // Listen for venue metadata and API key responses from bridge.js
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'tm-a11y-bridge') return;

    if (event.data.type === 'VENUE_META_RESULT') {
      VenueMetadataService._handleBridgeResponse(event.data);
    }


    // ── Venue RAG Chatbot result ──
    if (event.data.type === 'VENUE_CHAT_RESULT') {
      const chatMsgs = document.getElementById('tmA11yChatMessages');
      const chatIn = document.getElementById('tmA11yChatInput');
      const chatBtn = document.getElementById('tmA11yChatSend');
      const loadEl = document.getElementById('tmA11yChatLoading');

      if (loadEl) loadEl.remove();
      if (chatIn) chatIn.disabled = false;
      if (chatBtn) chatBtn.disabled = false;

      if (chatMsgs) {
        const { answer, citations } = event.data;
        let html = (answer || 'No response received.').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/\[(\d+)\]/g, '<sup class="tm-a11y-chat-cite">[$1]</sup>');

        let citeHTML = '';
        if (citations && citations.length > 0) {
          citeHTML = '<div class="tm-a11y-chat-citations">' +
            citations.map(c => {
              const t = (c.title || 'Source').replace(/</g, '&lt;');
              const u = c.url || '#';
              const s = (c.snippet || '').replace(/</g, '&lt;');
              return '<div class="tm-a11y-chat-citation"><a href="' + u + '" target="_blank" rel="noopener">[' + (c.index||'') + '] ' + t + '</a>' +
                (s ? '<span class="tm-a11y-chat-citation-snippet">' + s + '</span>' : '') + '</div>';
            }).join('') + '</div>';
        }

        const botDiv = document.createElement('div');
        botDiv.className = 'tm-a11y-chat-msg tm-a11y-chat-bot';
        botDiv.innerHTML = '<div class="tm-a11y-chat-bubble">' + html + '</div>' + citeHTML;
        chatMsgs.appendChild(botDiv);
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
        if (chatIn) chatIn.focus();
      }
    }

    if (event.data.type === 'OPENAI_KEY_RESULT') {
      const input = document.getElementById('tmA11yOpenAIKey');
      const status = document.getElementById('tmA11yAPIKeyStatus');
      if (input && event.data.hasKey) {
        input.value = event.data.maskedKey;
        if (status) status.textContent = '\u2713 API key configured';
      } else if (status && !event.data.hasKey) {
        status.textContent = 'No API key set yet';
      }
    }
  });


  // ══════════════════════════════════════════════════════════════
  // 10. COGNITIVE LOAD REDUCTION — RECOMMENDATION ENGINE v2 (kNN)
  // ══════════════════════════════════════════════════════════════

  const UserPreferenceEngine = {
    _db: null,
    _dbName: 'SeatFinderUserPrefs',
    _storeName: 'seatSelections',
    _rejectionStore: 'seatRejections',
    _maxRecords: 50,
    _maxRejections: 100,
    _minSampleSize: 3,
    _profile: null,
    _profileDirty: true,
    _featureStats: null,
    _knnK: 5,
    _sectionHashCache: {},
    _baseWeights: [1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5],

    // ── Initialise IndexedDB v2 (adds rejections store) ──
    async init() {
      return new Promise((resolve) => {
        try {
          const request = indexedDB.open(this._dbName, 2);
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(this._storeName)) {
              const store = db.createObjectStore(this._storeName, { keyPath: 'id', autoIncrement: true });
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('eventId', 'eventId', { unique: false });
            }
            if (!db.objectStoreNames.contains(this._rejectionStore)) {
              const rejStore = db.createObjectStore(this._rejectionStore, { keyPath: 'id', autoIncrement: true });
              rejStore.createIndex('timestamp', 'timestamp', { unique: false });
              rejStore.createIndex('seatKey', 'seatKey', { unique: false });
            }
          };
          request.onsuccess = (e) => {
            this._db = e.target.result;
            console.log('[A11y Helper] 🧠 Recommendation engine v2 (kNN): IndexedDB ready');
            resolve();
          };
          request.onerror = (e) => {
            console.log('[A11y Helper] 🧠 IndexedDB init failed:', e.target?.error);
            resolve();
          };
        } catch (e) {
          console.log('[A11y Helper] 🧠 IndexedDB not available:', e.message);
          resolve();
        }
      });
    },

    // ── Record positive signal (selection/like/pin) ──
    async recordSelection(seat, eventId, venueName) {
      if (!this._db) return;
      try {
        const record = {
          timestamp: Date.now(),
          eventId: eventId || 'unknown',
          venueName: venueName || '',
          section: seat.section,
          row: seat.row,
          seatNumber: seat.seatNumber,
          price: seat.price,
          currency: seat.currency || 'GBP',
          sellerType: seat.sellerType || 'primary',
          type: seat.type || 'standard',
          qualityScore: seat.qualityScore || null,
          rowNumber: parseRowNumber(seat.row),
          aisleAccess: seat.aisleAccess || false,
          sectionNormalised: seat.section?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || ''
        };
        const tx = this._db.transaction(this._storeName, 'readwrite');
        const store = tx.objectStore(this._storeName);
        store.add(record);
        const countReq = store.count();
        countReq.onsuccess = () => {
          if (countReq.result > this._maxRecords) {
            const idx = store.index('timestamp');
            const cursor = idx.openCursor();
            let toDelete = countReq.result - this._maxRecords;
            cursor.onsuccess = (e) => {
              const cur = e.target.result;
              if (cur && toDelete > 0) { cur.delete(); toDelete--; cur.continue(); }
            };
          }
        };
        this._profileDirty = true;
        console.log(`[A11y Helper] 🧠 Recorded selection: ${seat.section} @ ${seat.price}`);
      } catch (e) {
        console.log('[A11y Helper] 🧠 Record failed:', e.message);
      }
    },

    // ── Record negative signal (dismiss/skip/scroll_past) ──
    async recordRejection(seat, reason = 'skip') {
      if (!this._db) return;
      try {
        const seatKey = `${seat.section}|${seat.row}|${seat.price}`;
        const tx = this._db.transaction(this._rejectionStore, 'readwrite');
        const store = tx.objectStore(this._rejectionStore);
        store.add({
          timestamp: Date.now(), seatKey,
          section: seat.section, row: seat.row, price: seat.price,
          rowNumber: parseRowNumber(seat.row),
          sellerType: seat.sellerType || 'primary',
          type: seat.type || 'standard',
          reason
        });
        const countReq = store.count();
        countReq.onsuccess = () => {
          if (countReq.result > this._maxRejections) {
            const idx = store.index('timestamp');
            const cursor = idx.openCursor();
            let toDelete = countReq.result - this._maxRejections;
            cursor.onsuccess = (e) => {
              const cur = e.target.result;
              if (cur && toDelete > 0) { cur.delete(); toDelete--; cur.continue(); }
            };
          }
        };
        this._profileDirty = true;
      } catch (e) { /* Silent — rejections are supplementary */ }
    },

    // ── Data access helpers ──
    async _getAllSelections() {
      if (!this._db) return [];
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(this._storeName, 'readonly');
          const req = tx.objectStore(this._storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) { resolve([]); }
      });
    },

    async _getAllRejections() {
      if (!this._db) return [];
      return new Promise((resolve) => {
        try {
          if (!this._db.objectStoreNames.contains(this._rejectionStore)) { resolve([]); return; }
          const tx = this._db.transaction(this._rejectionStore, 'readonly');
          const req = tx.objectStore(this._rejectionStore).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) { resolve([]); }
      });
    },

    async getSelectionCount() {
      if (!this._db) return 0;
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(this._storeName, 'readonly');
          const req = tx.objectStore(this._storeName).count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(0);
        } catch (e) { resolve(0); }
      });
    },

    // ── Feature extraction: seat → 7-dim numeric vector ──
    // [price, rowNumber, sectionHash, isResale, isVIP, isAisle, isAccessible]
    _hashSection(section) {
      if (!section) return 0;
      const key = section.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (this._sectionHashCache[key] !== undefined) return this._sectionHashCache[key];
      let hash = 0;
      for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
      const normalised = Math.abs(hash) % 1000;
      this._sectionHashCache[key] = normalised;
      return normalised;
    },

    _extractFeatures(seatOrRecord) {
      return [
        seatOrRecord.price || 0,
        seatOrRecord.rowNumber ?? parseRowNumber(seatOrRecord.row) ?? 15,
        this._hashSection(seatOrRecord.section),
        (seatOrRecord.sellerType === 'resale') ? 1 : 0,
        (seatOrRecord.type === 'vip' || seatOrRecord.type === 'premium') ? 1 : 0,
        (seatOrRecord.aisleAccess) ? 1 : 0,
        (seatOrRecord.type === 'accessible') ? 1 : 0
      ];
    },

    // ── Min-max normalisation ──
    _computeFeatureStats(allFeatureVectors) {
      if (allFeatureVectors.length === 0) return null;
      const dims = allFeatureVectors[0].length;
      const mins = new Array(dims).fill(Infinity);
      const maxs = new Array(dims).fill(-Infinity);
      for (const vec of allFeatureVectors) {
        for (let d = 0; d < dims; d++) {
          if (vec[d] < mins[d]) mins[d] = vec[d];
          if (vec[d] > maxs[d]) maxs[d] = vec[d];
        }
      }
      return { mins, maxs, dims };
    },

    _normalise(featureVec, stats) {
      if (!stats) return featureVec;
      return featureVec.map((val, d) => {
        const range = stats.maxs[d] - stats.mins[d];
        return range === 0 ? 0.5 : (val - stats.mins[d]) / range;
      });
    },

    // ── Profile-aware feature weights ──
    _getProfileAwareWeights(activeSensoryProfile, venueMeta) {
      const w = [...this._baseWeights];
      // indices: [0:price, 1:row, 2:section, 3:resale, 4:vip, 5:aisle, 6:accessible]
      if (activeSensoryProfile) {
        const mcda = activeSensoryProfile.mcdaWeights;
        if (mcda) {
          const total = (mcda.price||25) + (mcda.viewQuality||25) + (mcda.proximity||25) + (mcda.aisleAccess||25);
          w[0] = (mcda.price||25) / total * 4;
          w[1] = (mcda.proximity||25) / total * 4;
          w[2] = (mcda.viewQuality||25) / total * 4;
          w[5] = (mcda.aisleAccess||25) / total * 4;
        }
        const id = activeSensoryProfile.id || '';
        const name = (activeSensoryProfile.name || '').toLowerCase();
        if (id.includes('low-stim') || name.includes('low stim') || name.includes('sensory')) {
          w[5] *= 2.0; w[6] *= 1.5; w[0] *= 0.6; w[1] *= 1.3;
        }
        if (id.includes('budget') || name.includes('budget')) {
          w[0] *= 2.5; w[4] *= 0.3;
        }
        if (id.includes('high-contrast') || name.includes('focus')) {
          w[2] *= 1.5; w[1] *= 1.3;
        }
      }
      if (venueMeta) {
        if (venueMeta.quiet_space === 'yes') w[6] *= 1.3;
        if (venueMeta.companion_seating === 'yes') w[6] *= 1.2;
        if (venueMeta.hearing_loop === 'yes') w[2] *= 1.1;
      }
      return w;
    },

    // ── kNN scoring engine ──
    _weightedDistance(vecA, vecB, weights) {
      let sum = 0;
      for (let d = 0; d < vecA.length; d++) {
        const diff = vecA[d] - vecB[d];
        sum += weights[d] * diff * diff;
      }
      return Math.sqrt(sum);
    },

    _knnScore(candidateFeatures, positiveVectors, rejectionVectors, weights, stats) {
      const normCandidate = this._normalise(candidateFeatures, stats);
      const distances = positiveVectors.map((vec, idx) => ({
        idx, dist: this._weightedDistance(normCandidate, vec, weights)
      }));
      distances.sort((a, b) => a.dist - b.dist);
      const k = Math.min(this._knnK, distances.length);
      const kNearest = distances.slice(0, k);
      const meanDist = kNearest.reduce((sum, d) => sum + d.dist, 0) / k;
      const similarity = 1 / (1 + meanDist);

      // Rejection penalty
      let rejectionPenalty = 0;
      if (rejectionVectors.length > 0) {
        const rejDistances = rejectionVectors.map(rv =>
          this._weightedDistance(normCandidate, rv.vec, weights)
        );
        for (let i = 0; i < rejDistances.length; i++) {
          if (rejDistances[i] < 0.3) {
            const rv = rejectionVectors[i];
            const strengthMul = rv.reason === 'dismiss' ? 1.0 : rv.reason === 'skip' ? 0.6 : 0.3;
            const proximityFactor = 1 - (rejDistances[i] / 0.3);
            rejectionPenalty += proximityFactor * strengthMul * 8;
          }
        }
        rejectionPenalty = Math.min(rejectionPenalty, 25);
      }

      const finalScore = Math.max(0, Math.min(100, Math.round(similarity * 100 - rejectionPenalty)));
      return {
        score: finalScore, similarity, meanDistance: meanDist,
        rejectionPenalty: Math.round(rejectionPenalty * 10) / 10,
        kUsed: k, nearestIndices: kNearest.map(d => d.idx)
      };
    },

    // ── Build profile (computes feature vectors + normalisation stats) ──
    async buildProfile() {
      if (!this._profileDirty && this._profile) return this._profile;
      const selections = await this._getAllSelections();
      if (selections.length < this._minSampleSize) { this._profile = null; return null; }
      const rejections = await this._getAllRejections();

      const positiveVectors = selections.map(s => this._extractFeatures(s));
      const rejectionVectorsRaw = rejections.map(r => ({ vec: this._extractFeatures(r), reason: r.reason || 'skip' }));
      const allVectors = [...positiveVectors, ...rejectionVectorsRaw.map(r => r.vec)];
      this._featureStats = this._computeFeatureStats(allVectors);

      const normPositive = positiveVectors.map(v => this._normalise(v, this._featureStats));
      const normRejections = rejectionVectorsRaw.map(r => ({ vec: this._normalise(r.vec, this._featureStats), reason: r.reason }));

      // Legacy profile fields for display/MCDA
      const prices = selections.map(s => s.price).filter(p => p > 0);
      const sectionCounts = {};
      const rows = [];
      let resaleCount = 0, vipCount = 0;
      selections.forEach(s => {
        sectionCounts[s.section] = (sectionCounts[s.section] || 0) + 1;
        const rn = s.rowNumber ?? parseRowNumber(s.row);
        if (rn !== null && rn !== undefined) rows.push(rn);
        if (s.sellerType === 'resale') resaleCount++;
        if (s.type === 'vip' || s.type === 'premium') vipCount++;
      });
      const total = selections.length;
      const sectionFreq = {};
      for (const [sec, count] of Object.entries(sectionCounts)) sectionFreq[sec] = count / total;
      const sortedSections = Object.entries(sectionFreq).sort((a, b) => b[1] - a[1]);
      const preferredSections = {};
      let cumFreq = 0;
      for (const [sec, freq] of sortedSections) {
        preferredSections[sec] = freq;
        cumFreq += freq;
        if (cumFreq >= 0.6 && Object.keys(preferredSections).length >= 2) break;
      }
      const avgRow = rows.length > 0 ? rows.reduce((a, b) => a + b, 0) / rows.length : null;
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

      // Build avoided sections from rejections
      const rejectedSections = {};
      rejections.forEach(r => { if (r.section) rejectedSections[r.section] = (rejectedSections[r.section] || 0) + 1; });
      const avoidsSections = Object.entries(rejectedSections)
        .filter(([sec, count]) => count >= 3 && !sectionCounts[sec])
        .map(([sec]) => sec);

      let proximityPref = 'middle';
      if (avgRow !== null) { if (avgRow <= 10) proximityPref = 'front'; else if (avgRow >= 25) proximityPref = 'back'; }

      this._profile = {
        avg_price: Math.round(avgPrice * 100) / 100,
        price_range: { min: prices.length > 0 ? Math.min(...prices) : 0, max: prices.length > 0 ? Math.max(...prices) : 0 },
        price_tolerance: Math.round(avgPrice * 0.2 * 100) / 100,
        preferred_sections: preferredSections,
        preferred_rows: rows.length > 0 ? [...new Set(rows)].sort((a, b) => a - b).map(String) : [],
        avg_row_number: avgRow !== null ? Math.round(avgRow * 10) / 10 : null,
        proximity_preference: proximityPref,
        avoids_sections: avoidsSections,
        prefers_resale: resaleCount > total * 0.5,
        prefers_vip: vipCount > total * 0.3,
        sample_size: total,
        _positiveVectors: normPositive,
        _rejectionVectors: normRejections,
        _featureStats: this._featureStats,
        _rejectionCount: rejections.length
      };
      this._profileDirty = false;
      return this._profile;
    },

    // ── Score a seat (kNN-based) ──
    scoreSeat(seat, profile, activeSensoryProfile, venueMeta) {
      if (!profile || !profile._positiveVectors || profile._positiveVectors.length === 0) return null;
      const candidateFeatures = this._extractFeatures(seat);
      const weights = this._getProfileAwareWeights(activeSensoryProfile, venueMeta);
      return this._knnScore(candidateFeatures, profile._positiveVectors, profile._rejectionVectors || [], weights, profile._featureStats).score;
    },

    scoreSeatDetailed(seat, profile, activeSensoryProfile, venueMeta) {
      if (!profile || !profile._positiveVectors || profile._positiveVectors.length === 0) return null;
      const candidateFeatures = this._extractFeatures(seat);
      const weights = this._getProfileAwareWeights(activeSensoryProfile, venueMeta);
      return this._knnScore(candidateFeatures, profile._positiveVectors, profile._rejectionVectors || [], weights, profile._featureStats);
    },

    // ── Get recommendations (profile + venue aware) ──
    async getRecommendations(availableSeats, activeSensoryProfile, venueMeta) {
      const profile = await this.buildProfile();
      if (!profile || profile.sample_size < this._minSampleSize) return [];
      const scored = availableSeats
        .filter(s => s.availability === 'available')
        .map(seat => {
          const score = this.scoreSeat(seat, profile, activeSensoryProfile, venueMeta);
          const detailed = this.scoreSeatDetailed(seat, profile, activeSensoryProfile, venueMeta);
          const reasons = this._generateReasons(seat, profile, score, detailed, activeSensoryProfile, venueMeta);
          return { seat, score, reasons, detailed };
        })
        .filter(r => r.score >= 55)
        .sort((a, b) => b.score - a.score);

      // Diversity filter: avoid 3 from same section+row
      const diverse = [];
      const seenKeys = new Set();
      for (const rec of scored) {
        const key = `${rec.seat.section}|${rec.seat.row}`;
        if (seenKeys.has(key) && diverse.length > 0) continue;
        diverse.push(rec);
        seenKeys.add(key);
        if (diverse.length >= 3) break;
      }
      return diverse;
    },

    // ── Reason generation (sensory + venue context aware) ──
    _generateReasons(seat, profile, score, detailed, activeSensoryProfile, venueMeta) {
      const reasons = [];
      if (profile.avg_price > 0) {
        const diff = Math.abs(seat.price - profile.avg_price);
        const tol = profile.price_tolerance || (profile.avg_price * 0.2);
        if (diff <= tol) reasons.push('Near your usual price');
        else if (seat.price < profile.avg_price * 0.8) reasons.push('Below your typical spend');
      }
      if (profile.preferred_sections[seat.section]) {
        reasons.push(profile.preferred_sections[seat.section] >= 0.3 ? 'In a section you frequently choose' : 'In a section you\'ve picked before');
      }
      if (profile.avg_row_number !== null) {
        const rowNum = parseRowNumber(seat.row);
        if (rowNum !== null && Math.abs(rowNum - profile.avg_row_number) <= 5) reasons.push('Similar row to your past picks');
      }
      if (activeSensoryProfile) {
        const name = (activeSensoryProfile.name || '').toLowerCase();
        if (name.includes('low stim') || name.includes('sensory')) {
          if (seat.aisleAccess) reasons.push('Aisle seat — easy exit for sensory breaks');
          if (seat.type === 'accessible') reasons.push('Accessible area — typically quieter');
        }
      }
      if (venueMeta) {
        if (venueMeta.quiet_space === 'yes' && seat.type === 'accessible') reasons.push('Venue has a quiet space nearby');
        if (venueMeta.companion_seating === 'yes' && seat.type === 'accessible') reasons.push('Companion seating available');
      }
      if (detailed && detailed.rejectionPenalty > 0 && detailed.rejectionPenalty < 3) {
        reasons.push('Different from seats you\'ve skipped');
      }
      if (reasons.length === 0 && score >= 55) reasons.push('Good overall match based on your history');
      return reasons;
    },

    // ── Clear history (selections + rejections) ──
    async clearHistory() {
      if (!this._db) return 0;
      return new Promise((resolve) => {
        try {
          const storeNames = [this._storeName];
          if (this._db.objectStoreNames.contains(this._rejectionStore)) storeNames.push(this._rejectionStore);
          const tx = this._db.transaction(storeNames, 'readwrite');
          const store = tx.objectStore(this._storeName);
          const countReq = store.count();
          countReq.onsuccess = () => {
            const count = countReq.result;
            store.clear();
            if (storeNames.includes(this._rejectionStore)) tx.objectStore(this._rejectionStore).clear();
            this._profile = null;
            this._profileDirty = true;
            this._featureStats = null;
            this._sectionHashCache = {};
            console.log(`[A11y Helper] 🧠 Cleared ${count} selections + rejections`);
            resolve(count);
          };
          countReq.onerror = () => resolve(0);
        } catch (e) { resolve(0); }
      });
    },

    // ── Render recommendations card ──
    renderRecommendations(recommendations, symbol) {
      if (!recommendations || recommendations.length === 0) return '';
      const cards = recommendations.map((rec, i) => {
        const s = rec.seat;
        const matchPct = rec.score;
        const reasonsHtml = rec.reasons.map(r => `<span class="tm-a11y-rec-reason">${r}</span>`).join('');
        const rankLabel = `<span class="tm-a11y-rec-rank-num">${i + 1}</span>`;
        const penaltyBadge = (rec.detailed && rec.detailed.rejectionPenalty > 2)
          ? `<span class="tm-a11y-rec-penalty" title="Score reduced by ${rec.detailed.rejectionPenalty} pts from skipped similar seats">${iconImg("scale", 30, "Adjusted")}</span>` : '';
        return `
          <div class="tm-a11y-rec-card" data-seat-id="${s.id}" tabindex="0" role="button"
               aria-label="Recommended: ${s.section} ${s.row ? 'Row ' + s.row : ''} ${symbol}${s.price.toFixed(2)} — ${matchPct}% match">
            <div class="tm-a11y-rec-rank">${rankLabel}</div>
            <div class="tm-a11y-rec-info">
              <div class="tm-a11y-rec-section">${s.section}${s.row ? ` · Row ${s.row}` : ''}</div>
              <div class="tm-a11y-rec-reasons">${reasonsHtml}</div>
            </div>
            <div class="tm-a11y-rec-right">
              <div class="tm-a11y-rec-match">${matchPct}% ${penaltyBadge}</div>
              <div class="tm-a11y-rec-price">${symbol}${s.price.toFixed(2)}</div>
            </div>
          </div>`;
      }).join('');
      const firstRec = recommendations[0];
      const engineInfo = firstRec?.detailed
        ? `kNN (k=${firstRec.detailed.kUsed}${firstRec.detailed.rejectionPenalty > 0 ? ', rejection-aware' : ''})`
        : 'kNN';
      return `
        <div class="tm-a11y-rec-panel" id="tmA11yRecPanel">
          <div class="tm-a11y-rec-header">
            <span class="tm-a11y-rec-title">${iconImg("brain", 30, "AI")} Recommended for You</span>
            <button class="tm-a11y-rec-dismiss" id="tmA11yRecDismiss" aria-label="Dismiss recommendations" title="Hide recommendations">×</button>
          </div>
          <div class="tm-a11y-rec-cards">${cards}</div>
          <div class="tm-a11y-rec-privacy">${iconImg("lock", 30, "Privacy")} Based on your local history · ${engineInfo} · Never sent anywhere</div>
        </div>`;
    }
  };

  // Track whether recommendations panel is dismissed for this session
  let _recDismissed = false;
  // Cache recommendations to avoid recompute on every render
  let _cachedRecommendations = null;
  let _cachedRecVersion = 0;
  // Cache venue metadata
  let _venueMeta = null;


  // ══════════════════════════════════════════════════════════════
  // 8b. BRIDGE COMMUNICATION
  // ══════════════════════════════════════════════════════════════

  function broadcastPreferences() {
    window.postMessage({
      source: 'tm-a11y-content',
      type: 'SAVE_PREFERENCES',
      preferences: currentPreferences
    }, '*');
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'tm-a11y-bridge') return;

    const { type, preferences } = event.data;

    if (type === 'PREFERENCES_LOADED' || type === 'PREFERENCES_UPDATED') {
      const typographyChanged =
        currentPreferences.fontFamily !== preferences?.fontFamily ||
        currentPreferences.fontSize !== preferences?.fontSize ||
        currentPreferences.lineSpacing !== preferences?.lineSpacing;

      const declutterChanged = currentPreferences.declutterEnabled !== preferences?.declutterEnabled;
      const animFreezeChanged = currentPreferences.animationFreezeEnabled !== preferences?.animationFreezeEnabled;

      currentPreferences = { ...DEFAULT_PREFERENCES, ...preferences };
      activeProfileId = currentPreferences.activeProfileId || null;

      applyColourScheme(currentPreferences.colourScheme);
      if (typographyChanged) applyTypography();
      currentAdapter.applyMapHighlights();
      if (declutterChanged) applyDeclutterMode();
      if (animFreezeChanged) applyAnimationFreeze();

      if (panelElement) {
        renderPanelContent();
        updatePanelVisibility();
      }
    }

    // Profile data loaded from storage
    if (type === 'PROFILES_LOADED') {
      customProfiles = event.data.profiles || [];
      console.log(`[A11y Helper] Profiles loaded: ${customProfiles.length} custom`);
      if (panelElement) renderPanelContent();
    }

    // Extension base URL from bridge (for loading icons in MAIN world)
    if (type === 'EXTENSION_URL') {
      extensionBaseUrl = event.data.baseUrl || '';
      console.log(`[A11y Helper] Extension URL: ${extensionBaseUrl}`);
      if (panelElement) renderPanelContent();
    }

    // ── Auth responses ──
    if (type === 'AUTH_SESSION_RESULT') {
      _authUser = event.data.user || null;
      if (_authUser) {
        window.postMessage({ source: 'tm-a11y-content', type: 'JOURNAL_LOAD', email: _authUser.email }, '*');
      } else {
        _journalEntries = [];
      }
      if (panelElement) renderPanelContent();
    }

    if (type === 'AUTH_LOGIN_RESULT') {
      if (event.data.error) {
        const status = document.getElementById('tmA11yAuthStatus');
        if (status) { status.textContent = event.data.error; status.style.color = '#ef4444'; }
      } else {
        _authUser = event.data.user;
        window.postMessage({ source: 'tm-a11y-content', type: 'JOURNAL_LOAD', email: _authUser.email }, '*');
        if (panelElement) renderPanelContent();
      }
    }

    if (type === 'AUTH_REGISTER_RESULT') {
      if (event.data.error) {
        const status = document.getElementById('tmA11yAuthStatus');
        if (status) { status.textContent = event.data.error; status.style.color = '#ef4444'; }
      } else {
        _authUser = event.data.user;
        _journalEntries = [];
        if (panelElement) renderPanelContent();
      }
    }

    if (type === 'AUTH_LOGOUT_RESULT') {
      _authUser = null;
      _journalEntries = [];
      _journalFormVisible = false;
      if (panelElement) renderPanelContent();
    }

    // ── Journal responses ──
    if (type === 'JOURNAL_LOADED') {
      _journalEntries = event.data.entries || [];
      if (panelElement) renderPanelContent();
    }

    // Profile applied from popup
    if (type === 'APPLY_PROFILE') {
      applyProfile(event.data.profileId);
    }

    if (type === 'REQUEST_SEAT_DATA') {
      window.postMessage({
        source: 'tm-a11y-content',
        type: 'SEAT_DATA_RESPONSE',
        seatData: capturedSeats
      }, '*');
    }
  });


  // ══════════════════════════════════════════════════════════════
  // PLATFORM ADAPTERS
  // ══════════════════════════════════════════════════════════════
  //
  // Each adapter encapsulates all platform-specific logic:
  //   - DOM scraping selectors and parsing
  //   - Scroll container detection
  //   - Listing click + checkout flow
  //   - Map highlighting (SVG vs Mapbox vs other)
  //   - Event metadata extraction
  //
  // The shared UI layer (panel, tabs, cards, MCDA, filters) calls
  // adapter methods via `currentAdapter`, never platform code directly.
  //
  // Phase 1: TicketmasterAdapter wraps all existing functions.
  // Phase 2+: ViagogoAdapter, StubHubAdapter added here.
  // ══════════════════════════════════════════════════════════════

  const TicketmasterAdapter = {
    name: 'ticketmaster',
    shouldAutoScan: true, // TM virtual scroll needs aggressive sidebar scroll on load
    
    /** Does the current page belong to this platform? */
    detect() {
      return /ticketmaster\.(com|co\.uk|ie|de|fr|es|nl|be|at|au|nz|se|dk|fi|no|pl|cz)/i.test(window.location.hostname) ||
             /livenation\.(com|co\.uk)/i.test(window.location.hostname);
    },

    /** Extract event ID, name, venue from URL + DOM */
    getEventMeta() { tryExtractEventIdFromURL(); },

    /** Scrape visible ticket listings from the platform's DOM */
    scrapeSeats() { return scrapeTicketListingsFromDOM(); },

    /** Auto-scroll the listing container to force lazy-loaded items to render */
    autoScroll() { autoScrollListingPanel(); },

    /** Click a listing on the platform's sidebar/list + proceed to checkout */
    clickListing(seat, qty) { return clickTMSidebarListing(seat, qty); },

    /** Scroll to and highlight a seat on the platform's map */
    scrollToSeat(seatId) { scrollToSeatOnMap(seatId); },

    /** Apply visual highlights (focus mode + MCDA heatmap) to the platform's map */
    applyMapHighlights() { applyMapVisualisation(); },

    /** Check if a DOM mutation is related to the platform's seat map */
    isMapMutation(node) {
      if (!node || node.nodeType !== 1) return false;
      return !!(node.querySelector?.('circle, g[data-section-name]') ||
                node.tagName === 'svg' ||
                /seat|section/i.test(node.className || ''));
    },

    /** Currency symbol for this platform/locale */
    getCurrencySymbol() {
      const host = window.location.hostname;
      if (/\.co\.uk|\.ie/i.test(host)) return '£';
      if (/\.de|\.fr|\.es|\.nl|\.be|\.at|\.se|\.dk|\.fi|\.no|\.pl|\.cz/i.test(host)) return '€';
      return '$';
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // STUBHUB ADAPTER
  // ═══════════════════════════════════════════════════════════════

  const StubHubAdapter = {
    name: 'stubhub',
    shouldAutoScan: true, // StubHub's listing container is scrollable
    
    /**
     * StubHub domains: stubhub.com, stubhub.co.uk, stubhub.de, etc.
     */
    detect() {
      return /stubhub\.(com|co\.uk|de|fr|es|it|ie|nl|be|at|ch|se|ca|com\.au|com\.mx|jp|kr|sg|hk)/i.test(window.location.hostname);
    },

    /**
     * Extract event metadata from StubHub page.
     * 
     * URL format: /event/{eventId}  or  /event-name-tickets/event/{eventId}
     * DOM: header.event_merch_header has event title, date, venue
     * Body class: EventRoyalBody
     */
    getEventMeta() {
      // Event ID from URL
      const urlMatch = window.location.href.match(/\/event\/(\d+)/i);
      if (urlMatch) eventMeta.eventId = `SH-${urlMatch[1]}`;

      // Event name — StubHub uses the page title or header elements
      const titleSelectors = [
        '[data-testid="event-title"]', '[data-testid="eventTitle"]',
        '.event-title', '[class*="EventTitle"]', '[class*="event-title"]',
        '.EventHeader__title', '[class*="EventHeader"] h1',
        'h1[class*="event"]', 'h1', 'title'
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 3 && el.textContent.trim().length < 200) {
          let name = el.textContent.trim();
          // Strip "Tickets" suffix StubHub often adds
          name = name.replace(/\s*[-–—]\s*Tickets?\s*$/i, '').trim();
          if (name.length > 3) { eventMeta.eventName = name; break; }
        }
      }
      // Fallback: parse document title
      if (!eventMeta.eventName) {
        const dt = document.title || '';
        const m = dt.match(/^(.+?)\s*(?:Tickets|[-–|])/i);
        if (m) eventMeta.eventName = m[1].trim();
      }

      // Venue from page subtitle/metadata
      const venueSelectors = [
        '[data-testid="venue-name"]', '.venue-name',
        '[class*="VenueName"]', '[class*="venue"]',
        'a[href*="/venue/"]', '[class*="EventSubTitle"]'
      ];
      for (const sel of venueSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 3) {
          eventMeta.venue = el.textContent.trim();
          break;
        }
      }

      // Date
      if (!eventMeta.date) {
        const dateEl = document.querySelector('[class*="EventDate"], [class*="event-date"], time, [datetime]');
        if (dateEl) eventMeta.date = dateEl.textContent.trim();
      }
    },

    /**
     * Scrape ticket listings from StubHub's DOM.
     * 
     * StubHub listing card text follows this pattern:
     *   "{Section} Row {X} | {N} [- {M}] ticket(s) £{price} each"
     *   "Floor Standing Row 73 | 1 ticket £111 each"
     *   "Upper Tier 208 Row Q | 1 - 5 tickets £106 each"
     *   "Floor Standing 1 - 6 tickets £126 each" (no row)
     * 
     * We scan all elements for these patterns — no reliance on 
     * class names since StubHub may obfuscate them.
     */
    scrapeSeats() {
      const seats = [];
      const seen = new Set();

      StubHubAdapter.getEventMeta();

      const allEls = document.querySelectorAll('div, li, a, article, [role="listitem"], [role="row"], tr');

      allEls.forEach(el => {
        if (el.closest('#tm-a11y-companion-panel')) return;

        const spacedText = getSpacedText(el);
        if (spacedText.length < 15 || spacedText.length > 500) return;

        // Must contain a price with £/$€ and "each" or just a price
        if (!/[£$€]\s*\d+/.test(spacedText)) return;

        // Must contain a section/area reference
        const hasSection = /\b(Upper|Lower)\s+Tier\s+\d/i.test(spacedText) ||
                          /\bFloor\s+(Standing|Seat)/i.test(spacedText) ||
                          /\bFloor\b/i.test(spacedText) ||
                          /\bSection\s+\d/i.test(spacedText) ||
                          /\bBlock\s+[A-Z0-9]/i.test(spacedText) ||
                          /\bStanding\b/i.test(spacedText) ||
                          /\bGeneral\s*Admission\b/i.test(spacedText) ||
                          /\bRow\s+[A-Z0-9]/i.test(spacedText) ||
                          /\bGA\b/.test(spacedText) ||
                          /\bPitch\b/i.test(spacedText) ||
                          /\bStalls\b/i.test(spacedText);
        if (!hasSection) return;

        // Must mention tickets (StubHub always shows "X ticket(s)")
        if (!/\d+\s*(?:-\s*\d+\s*)?tickets?/i.test(spacedText) && !/ticket/i.test(spacedText)) return;

        // Reject junk
        if (/cookie|privacy|accept|sign\s*in|log\s*in|sell\s*tickets/i.test(spacedText) && spacedText.length < 100) return;

        // Smallest-card check
        let childAlsoMatches = false;
        for (const child of el.children) {
          const ct = getSpacedText(child);
          if (ct.length >= 15 && ct.length < 500 &&
              /[£$€]\s*\d+/.test(ct) &&
              (/Tier\s+\d/i.test(ct) || /Floor/i.test(ct) || /Row\s+[A-Z0-9]/i.test(ct) || /Section\s+\d/i.test(ct)) &&
              /tickets?/i.test(ct)) {
            childAlsoMatches = true;
            break;
          }
        }
        if (childAlsoMatches) return;

        const info = StubHubAdapter._parseListingText(spacedText, el.textContent || '');
        if (!info || info.price < 5) return;

        const key = `${info.section}|${info.row}|${info.price}`;
        if (seen.has(key)) return;
        seen.add(key);

        seats.push({
          id: `sh-${seats.length}-${info.section.replace(/\s+/g, '')}-R${info.row}`,
          ...info
        });
      });

      if (seats.length > 0) {
        console.log(`[A11y Helper] 🔍 StubHub scrape: ${seats.length} listings found`);
        mergeSeatData(seats);
      }
      return seats;
    },

    /**
     * Parse section, row, price from a StubHub listing card's text.
     * 
     * Patterns:
     *   "Upper Tier 208 Row Q | 1 - 5 tickets £106 each"
     *   "Floor Standing Row 73 | 1 ticket £111 each"
     *   "Floor Standing 1 - 6 tickets £126 each" (no row)
     *   "Lower Tier 115 Row N | 2 tickets £292 each"
     */
    _parseListingText(spacedText, rawText) {
      // ── Price ──
      const allPrices = [];
      const priceRegex = /[£$€]\s*(\d{1,6}[\.,]?\d{0,2})/g;
      let pm;
      while ((pm = priceRegex.exec(rawText)) !== null) {
        const val = parseFloat(pm[1].replace(',', ''));
        if (val >= 5 && val < 100000) allPrices.push(val);
      }
      if (allPrices.length === 0) return null;
      const price = allPrices[0];

      let currency = 'GBP';
      if (rawText.includes('$') && !rawText.includes('£')) currency = 'USD';
      else if (rawText.includes('€')) currency = 'EUR';

      // ── Section ──
      let section = '';

      // Priority 1: "Upper Tier 208" / "Lower Tier 115" (most common StubHub format)
      const tierMatch = spacedText.match(/\b(Upper|Lower)\s+Tier\s+(\d{1,4}[A-Z]?)\b/i);
      if (tierMatch) {
        section = `${tierMatch[1]} Tier ${tierMatch[2]}`;
      }

      // Priority 2: "Floor Standing" or "Floor Seated"
      if (!section) {
        const floorMatch = spacedText.match(/\bFloor\s+(Standing|Seated|General|VIP)\b/i);
        if (floorMatch) {
          section = `Floor ${floorMatch[1]}`;
        } else if (/\bFloor\b/i.test(spacedText) && !/\bFloor\s+\d/i.test(spacedText)) {
          section = 'Floor Standing';
        }
      }

      // Priority 3: "Section XXX"
      if (!section) {
        const sectionMatch = spacedText.match(/\bSection\s+(\d{1,4}[A-Z]?)\b/i);
        if (sectionMatch) section = `Section ${sectionMatch[1]}`;
      }

      // Priority 4: "Block XXX"
      if (!section) {
        const blockMatch = spacedText.match(/\bBlock\s+([A-Z0-9]{1,6})\b/i);
        if (blockMatch) section = `Block ${blockMatch[1]}`;
      }

      // Priority 5: Named areas
      if (!section) {
        if (/\bStanding\b/i.test(spacedText)) section = 'Standing';
        else if (/\bGeneral\s*Admission\b/i.test(spacedText)) section = 'General Admission';
        else if (/\bPitch\b/i.test(spacedText)) section = 'Pitch';
        else if (/\bStalls\b/i.test(spacedText)) section = 'Stalls';
        else if (/\bCircle\b/i.test(spacedText)) section = 'Circle';
        else if (/\bBalcony\b/i.test(spacedText)) section = 'Balcony';
        else if (/\bMezzanine\b/i.test(spacedText)) section = 'Mezzanine';
      }

      // Priority 6: "Cat X" / "Category X", "Level X", "Zone X"
      if (!section) {
        const catMatch = spacedText.match(/\bCat(?:egory)?\s+(\d+[A-Z]?)\b/i);
        if (catMatch) section = `Category ${catMatch[1]}`;
      }
      if (!section) {
        const levelMatch = spacedText.match(/\b(Level|Zone)\s+([A-Z0-9]{1,6})\b/i);
        if (levelMatch) section = `${levelMatch[1]} ${levelMatch[2]}`;
      }

      if (!section) section = 'General';

      // ── Row ──
      let row = '';
      const rowMatch = spacedText.match(/\bRow\s+([A-Z]{1,3}|\d{1,3}|[A-Z]{1,2}\d{1,2})\b/i);
      if (rowMatch) row = rowMatch[1].toUpperCase();

      // ── Quantity ──
      // StubHub format: "1 - 5 tickets" (range) or "2 tickets" (exact)
      let quantity = 1;
      let quantityMax = 1;
      const qtyRangeMatch = spacedText.match(/(\d+)\s*-\s*(\d+)\s*tickets?\b/i);
      const qtyExactMatch = spacedText.match(/(\d+)\s*tickets?\b/i);
      if (qtyRangeMatch) {
        quantity = parseInt(qtyRangeMatch[1]);
        quantityMax = parseInt(qtyRangeMatch[2]);
      } else if (qtyExactMatch) {
        quantity = parseInt(qtyExactMatch[1]);
        quantityMax = quantity;
      }

      // ── Description / type ──
      let description = '';
      let type = 'standard';
      if (/VIP|hospitality|experience|premium|lounge/i.test(spacedText)) { type = 'vip'; description = 'VIP'; }
      else if (/standing/i.test(spacedText)) { type = 'standing'; description = 'Standing'; }
      else if (/seated/i.test(spacedText)) { type = 'seated'; description = 'Seated'; }

      if (/restricted\s*view/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Restricted View';
      if (!description) description = type;

      // Delivery type
      let sellerType = 'resale'; // StubHub is always resale
      if (/print.at.home|mobile\s*transfer|instant\s*download/i.test(spacedText)) {
        description += `, ${spacedText.match(/(print.at.home|mobile\s*transfer|instant\s*download)/i)?.[0] || ''}`;
      }

      return {
        section, row, seatNumber: '', price,
        priceMax: allPrices.length > 1 ? Math.max(...allPrices) : price,
        currency, availability: 'available',
        areaName: '', description, qualityScore: null,
        sellerType, type, quantity, quantityMax
      };
    },

    /**
     * Auto-scroll StubHub's listing container.
     * 
     * The listings are inside the MiddleContent section which is scrollable.
     * We use the same bidirectional scroll technique as TM.
     */
    autoScroll() {
      if (_autoScrollInProgress) return;
      _autoScrollInProgress = true;

      console.log(`[A11y Helper] 📜 StubHub SCROLL SCAN: ${SCAN_DURATION_MS / 1000}s`);

      // ── Find the scrollable listings container ──
      let scrollContainer = null;

      // Strategy 1: Known StubHub class names
      const knownSelectors = [
        'section[class*="MiddleContent"]',
        'section[class*="BodyContainer_MiddleContent"]',
        '[class*="EventRoyal__DesktopLayout__BodyContainer__MiddleContent"]',
        '[class*="listings"]',
        '[class*="TicketList"]',
        '[class*="ticket-list"]'
      ];
      for (const sel of knownSelectors) {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > el.clientHeight + 50) {
          scrollContainer = el;
          break;
        }
      }

      // Strategy 2: Generic heuristic (same as TM)
      if (!scrollContainer) {
        const candidates = document.querySelectorAll('div, section, [role="list"], [role="listbox"], main');
        let bestScore = 0;
        candidates.forEach(el => {
          if (el.closest('#tm-a11y-companion-panel')) return;
          const style = window.getComputedStyle(el);
          const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll' ||
                               style.overflow === 'auto' || style.overflow === 'scroll';
          if (!isScrollable && el.scrollHeight <= el.clientHeight + 10) return;

          const text = el.textContent || '';
          let score = 0;
          if (/tier/i.test(text)) score += 3;
          if (/[£$€]\s*\d+/.test(text)) score += 3;
          if (/each/i.test(text)) score += 3;
          if (/row/i.test(text)) score += 2;
          if (/standing|seated|floor/i.test(text)) score += 2;
          if (/tickets?/i.test(text)) score += 2;
          if (el.scrollHeight > el.clientHeight + 50) score += 3;
          const rect = el.getBoundingClientRect();
          if (rect.width > 200 && rect.width < 800) score += 2;
          if (score > bestScore) { bestScore = score; scrollContainer = el; }
        });
        if (bestScore < 5) scrollContainer = null;
      }

      // Strategy 3: Full page scroll
      if (!scrollContainer) {
        scrollContainer = document.scrollingElement || document.documentElement;
      }

      const startTime = Date.now();
      const viewHeight = scrollContainer === document.documentElement
        ? window.innerHeight
        : scrollContainer.clientHeight;
      const scrollStep = Math.floor(viewHeight * 0.6);
      let scrollDir = 1;
      let lastCount = capturedSeats.length;

      StubHubAdapter.scrapeSeats();

      const scanInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, Math.round((elapsed / SCAN_DURATION_MS) * 100));
        scanProgress = progress;

        const bar = document.getElementById('tmA11yScanProgress');
        const txt = document.getElementById('tmA11yScanText');
        if (bar) bar.style.width = `${progress}%`;
        if (txt) txt.textContent = `Scanning seats… ${capturedSeats.length} found`;

        // Scroll
        const cur = scrollContainer.scrollTop;
        const max = scrollContainer.scrollHeight - viewHeight;
        if (scrollDir === 1 && cur >= max - 20) scrollDir = -1;
        else if (scrollDir === -1 && cur <= 20) scrollDir = 1;
        scrollContainer.scrollTop += scrollDir * scrollStep;

        StubHubAdapter.scrapeSeats();
        if (capturedSeats.length > lastCount) {
          console.log(`[A11y Helper] 📜 ${capturedSeats.length} seats (+${capturedSeats.length - lastCount})`);
          lastCount = capturedSeats.length;
        }

        if (elapsed >= SCAN_DURATION_MS) {
          clearInterval(scanInterval);
          _autoScrollInProgress = false;
          scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(() => {
            StubHubAdapter.scrapeSeats();
            console.log(`[A11y Helper] 📜 StubHub SCAN COMPLETE: ${capturedSeats.length} seats`);
            finishScan();
          }, 500);
        }
      }, 250);
    },

    /**
     * Click a StubHub listing to select it.
     * StubHub listings are clickable rows/cards that lead to checkout.
     */
    async clickListing(seat, qty) {
      console.log(`[A11y Helper] 🛒 StubHub: selecting ${seat.section} Row ${seat.row} @ £${seat.price}`);

      const sectionNorm = seat.section.replace(/\s+/g, '').toLowerCase();

      // Find matching listing element
      const allEls = document.querySelectorAll('div, a, li, article, [role="listitem"], [role="row"], tr');
      let bestMatch = null;
      let bestScore = 0;

      allEls.forEach(el => {
        if (el.closest('#tm-a11y-companion-panel')) return;
        const text = getSpacedText(el);
        if (text.length < 15 || text.length > 500) return;
        if (!/[£$€]\s*\d+/.test(text)) return;

        let score = 0;
        const elSectionNorm = text.replace(/\s+/g, '').toLowerCase();
        if (elSectionNorm.includes(sectionNorm)) score += 5;

        // Price match
        const pm = text.match(/[£$€]\s*(\d{1,6}[\.,]?\d{0,2})/);
        if (pm && Math.abs(parseFloat(pm[1].replace(',', '')) - seat.price) < 1) score += 4;

        // Row match
        if (seat.row) {
          const rm = text.match(/\bRow\s+([A-Z0-9]+)/i);
          if (rm && rm[1].toUpperCase() === seat.row.toUpperCase()) score += 3;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = el;
        }
      });

      if (!bestMatch || bestScore < 7) {
        console.log(`[A11y Helper] 🛒 StubHub: no confident match (best score ${bestScore})`);
        return false;
      }

      // Click the listing
      bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 300));

      // Try clicking a buy button within the card first
      const buyBtn = bestMatch.querySelector('button, a[href*="checkout"], a[href*="buy"], [class*="buy"], [class*="Buy"]');
      if (buyBtn) {
        buyBtn.click();
      } else {
        bestMatch.click();
      }

      console.log('[A11y Helper] 🛒 StubHub: listing clicked');
      return true;
    },

    /** Scroll to and highlight a seat on the Mapbox map */
    scrollToSeat(seatId) {
      const mapEl = document.getElementById('SeatMapMapbox') || document.querySelector('.mapboxgl-map');
      if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mapEl.style.outline = '3px solid var(--tm-a11y-accent, #3ecf8e)';
        mapEl.style.outlineOffset = '-3px';
        setTimeout(() => { mapEl.style.outline = ''; mapEl.style.outlineOffset = ''; }, 2000);
      }
      const card = document.querySelector(`.tm-a11y-seat-card[data-seat-id="${seatId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    /**
     * Apply heatmap/focus highlights to the StubHub Mapbox seat map.
     * Uses the shared applyMapboxHeatmap() which accesses the
     * captured Mapbox GL instance via our constructor interceptor.
     */
    applyMapHighlights() {
      if (currentPreferences.mcdaEnabled) computeAllMCDAScores();
      if (!currentPreferences.mcdaEnabled && !currentPreferences.focusModeEnabled) {
        resetMapboxHeatmap();
        return;
      }
      applyMapboxHeatmap('stubhub');
    },

    /** Detect Mapbox-related DOM mutations */
    isMapMutation(node) {
      if (!node || node.nodeType !== 1) return false;
      return !!(
        node.id === 'SeatMapMapbox' ||
        node.classList?.contains('mapboxgl-map') ||
        node.classList?.contains('mapboxgl-canvas') ||
        node.classList?.contains('SeatMapView__Mapbox') ||
        node.querySelector?.('#SeatMapMapbox, .mapboxgl-map, .SeatMapView__Mapbox')
      );
    },

    getCurrencySymbol() {
      const host = window.location.hostname;
      if (/\.co\.uk|\.ie/i.test(host)) return '£';
      if (/\.de|\.fr|\.es|\.it|\.nl|\.be|\.at|\.ch|\.se/i.test(host)) return '€';
      if (/\.ca|\.com\.au/i.test(host)) return '$';
      return '£'; // Default for stubhub.com — often US$ but we detect from listings
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // VIAGOGO ADAPTER
  // ═══════════════════════════════════════════════════════════════
  //
  // Viagogo is a React SPA with full-page infinite scroll.
  // Key differences from TM:
  //   - No scrollable sidebar — listings are in the page body
  //   - data-testid attributes on ticket cards
  //   - No interactive SVG seat map (focus mode / heatmap are no-ops)
  //   - Clicking a card navigates to a purchase page
  //   - Prices sometimes shown per-ticket, sometimes total
  //   - Viagogo owns StubHub; DOM patterns may overlap
  //
  // DOM selectors are multi-strategy: data-testid first,
  // then class-based, then text-pattern fallback.
  // ═══════════════════════════════════════════════════════════════

  const ViagogoAdapter = {
    name: 'viagogo',
    shouldAutoScan: false, // Viagogo uses "Show more" button — user triggers scan manually

    detect() {
      return /viagogo\.(com|co\.uk|de|fr|es|it|nl|be|at|ch|se|dk|fi|no|pl|pt|ie|au|nz|jp|kr|sg|hk|ca|com\.br|com\.ar)/i.test(window.location.hostname);
    },

    getEventMeta() {
      // URL pattern: /E-{id} or /event/E-{id}
      const urlMatch = window.location.href.match(/\/E-(\d+)/i);
      if (urlMatch) eventMeta.eventId = `VG-${urlMatch[1]}`;

      // data-testid selectors (most reliable)
      const titleSelectors = [
        '[data-testid="event-title"]', '[data-testid="eventTitle"]',
        'h1[data-testid]', '.event-title', '[class*="EventTitle"]',
        '[class*="event-title"]', '[class*="eventTitle"]',
        'h1', '[class*="eventInfo"] h1', '[class*="EventInfo"] h1'
      ];
      for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 3 && el.textContent.trim().length < 200) {
          eventMeta.eventName = el.textContent.trim();
          break;
        }
      }

      const venueSelectors = [
        '[data-testid="venue-name"]', '[data-testid="venueName"]',
        '.venue-name', '[class*="VenueName"]', '[class*="venue-name"]',
        '[class*="venueName"]', '[class*="location"]'
      ];
      for (const sel of venueSelectors) {
        const el = document.querySelector(sel);
        if (el && !eventMeta.venue) {
          eventMeta.venue = el.textContent.trim();
          break;
        }
      }
    },

    /**
     * Scrape ticket listings from Viagogo's DOM.
     * 
     * Viagogo uses obfuscated class names (bway-*), so we can't rely on
     * class selectors. Instead we scan for elements whose text contains
     * BOTH a section/area reference AND a price.
     * 
     * Viagogo listing card text looks like:
     *   "Section 419 Row N FV 1 ticket Clear view £265"
     *   "Floor 2 tickets Amazing view Standing only £189"
     *   "Section 313 Row 23 FV 2 tickets together Clear view £145"
     */
    scrapeSeats() {
      const seats = [];
      const seen = new Set();

      ViagogoAdapter.getEventMeta();

      // ── Scan all elements for listing card patterns ──
      const allEls = document.querySelectorAll('div, li, a, article, [role="listitem"]');
      
      allEls.forEach(el => {
        if (el.closest('#tm-a11y-companion-panel')) return;
        
        const spacedText = getSpacedText(el);
        if (spacedText.length < 15 || spacedText.length > 500) return;
        
        // Must contain a price
        if (!/[£$€]\s*\d+/.test(spacedText)) return;
        
        // Must contain a section/area reference OR a ticket keyword
        const hasSection = /\bSection\s+\d/i.test(spacedText) ||
                          /\bBlock\s+\d/i.test(spacedText) ||
                          /\bFloor\b/i.test(spacedText) ||
                          /\bStanding\b/i.test(spacedText) ||
                          /\bGeneral Admission\b/i.test(spacedText) ||
                          /\bRow\s+[A-Z0-9]/i.test(spacedText);
        if (!hasSection) return;
        
        // Must mention tickets (Viagogo always shows "X ticket(s)")
        if (!/\d+\s*tickets?/i.test(spacedText) && !/ticket/i.test(spacedText)) return;
        
        // Reject garbage
        if (/cookie|privacy|accept|sign\s*in|log\s*in/i.test(spacedText) && spacedText.length < 100) return;
        if (/delivery fee|service fee|total.*price/i.test(spacedText)) return;
        
        // ── Smallest-card check: skip if a child also matches ──
        let childAlsoMatches = false;
        for (const child of el.children) {
          const ct = getSpacedText(child);
          if (ct.length >= 15 && ct.length < 500 &&
              /[£$€]\s*\d+/.test(ct) &&
              (/\bSection\s+\d/i.test(ct) || /\bFloor\b/i.test(ct) || /\bRow\s+[A-Z0-9]/i.test(ct)) &&
              /\d+\s*tickets?/i.test(ct)) {
            childAlsoMatches = true;
            break;
          }
        }
        if (childAlsoMatches) return;
        
        // ── Parse this element ──
        const info = ViagogoAdapter._parseListingText(spacedText, el.textContent || '');
        if (!info || info.price < 5) return;
        
        const key = `${info.section}|${info.row}|${info.price}`;
        if (seen.has(key)) return;
        seen.add(key);
        
        seats.push({
          id: `vg-${seats.length}-${info.section.replace(/\s+/g, '')}-R${info.row}`,
          ...info
        });
      });

      if (seats.length > 0) {
        console.log(`[A11y Helper] 🔍 Viagogo scrape: ${seats.length} listings found`);
        mergeSeatData(seats);
      }
      return seats;
    },

    /**
     * Parse section, row, price from a Viagogo listing card's text.
     * 
     * Uses simple, direct regex patterns that match the actual text:
     *   "Section 419" → section = "Section 419"
     *   "Row N"       → row = "N"
     *   "£265"        → price = 265
     *   "2 tickets"   → quantity = 2
     *   "Floor"       → section = "Floor"
     */
    _parseListingText(spacedText, rawText) {
      // ── Price ──
      const allPrices = [];
      const priceRegex = /[£$€]\s*(\d{1,6}[\.,]?\d{0,2})/g;
      let pm;
      while ((pm = priceRegex.exec(rawText)) !== null) {
        const val = parseFloat(pm[1].replace(',', ''));
        if (val >= 5 && val < 50000) allPrices.push(val);
      }
      if (allPrices.length === 0) return null;
      const price = allPrices[0];
      
      let currency = 'GBP';
      if (rawText.includes('$')) currency = 'USD';
      else if (rawText.includes('€')) currency = 'EUR';

      // ── Section ──
      // Priority 1: "Section XXX" (most common Viagogo format)
      let section = '';
      const sectionMatch = spacedText.match(/\bSection\s+(\d{1,4}[A-Z]?)\b/i);
      if (sectionMatch) {
        section = `Section ${sectionMatch[1]}`;
      }
      
      // Priority 2: "Block XXX"
      if (!section) {
        const blockMatch = spacedText.match(/\bBlock\s+([A-Z0-9]{1,6})\b/i);
        if (blockMatch) section = `Block ${blockMatch[1]}`;
      }
      
      // Priority 3: Named areas
      if (!section) {
        if (/\bFloor\b/i.test(spacedText)) section = 'Floor';
        else if (/\bStanding\b/i.test(spacedText)) section = 'Standing';
        else if (/\bGeneral\s*Admission\b/i.test(spacedText)) section = 'General Admission';
        else if (/\bPitch\b/i.test(spacedText)) section = 'Pitch';
        else if (/\bStalls\b/i.test(spacedText)) section = 'Stalls';
        else if (/\bCircle\b/i.test(spacedText)) section = 'Circle';
        else if (/\bBalcony\b/i.test(spacedText)) section = 'Balcony';
        else if (/\bMezzanine\b/i.test(spacedText)) section = 'Mezzanine';
        else if (/\bUpper\s*Tier\b/i.test(spacedText)) section = 'Upper Tier';
        else if (/\bLower\s*Tier\b/i.test(spacedText)) section = 'Lower Tier';
      }
      
      // Priority 4: "Cat X" or "Category X" (European venues)
      if (!section) {
        const catMatch = spacedText.match(/\bCat(?:egory)?\s+(\d+[A-Z]?)\b/i);
        if (catMatch) section = `Category ${catMatch[1]}`;
      }

      // Priority 5: "Level X" / "Tier X" / "Zone X"
      if (!section) {
        const levelMatch = spacedText.match(/\b(Level|Tier|Zone)\s+([A-Z0-9]{1,6})\b/i);
        if (levelMatch) section = `${levelMatch[1]} ${levelMatch[2]}`;
      }
      
      if (!section) section = 'General';

      // ── Row ──
      let row = '';
      const rowMatch = spacedText.match(/\bRow\s+([A-Z]{1,3}|\d{1,3}|[A-Z]{1,2}\d{1,2})\b/i);
      if (rowMatch) row = rowMatch[1].toUpperCase();

      // ── Quantity ──
      let quantity = 1;
      const qtyMatch = spacedText.match(/(\d+)\s*tickets?\b/i);
      if (qtyMatch) quantity = parseInt(qtyMatch[1]);

      // ── Description / type ──
      let description = '';
      let type = 'standard';
      if (/VIP|hospitality|experience|premium|lounge/i.test(spacedText)) { type = 'vip'; description = 'VIP'; }
      else if (/standing\s*only/i.test(spacedText)) { type = 'standing'; description = 'Standing'; }
      else if (/seated/i.test(spacedText)) { type = 'seated'; description = 'Seated'; }
      
      if (/restricted\s*view/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Restricted View';
      if (/clear\s*view/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Clear View';
      if (/amazing\s*view/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Amazing View';
      if (/great\b/i.test(spacedText) && /view/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Great View';
      if (/face\s*value|FV/i.test(spacedText)) description = (description ? description + ', ' : '') + 'Face Value';
      
      if (!description) description = type;

      // ── View quality score (Viagogo shows 1.0-10.0 ratings) ──
      let qualityScore = null;
      const scoreMatch = spacedText.match(/\b(\d{1,2}\.\d)\b/);
      if (scoreMatch) {
        const score = parseFloat(scoreMatch[1]);
        if (score >= 1.0 && score <= 10.0) qualityScore = score;
      }

      return {
        section, row, seatNumber: '', price,
        priceMax: allPrices.length > 1 ? Math.max(...allPrices) : price,
        currency, availability: 'available',
        areaName: '', description, qualityScore,
        sellerType: 'resale', type
      };
    },

    /**
     * Viagogo paginates with a "Show more" button, not infinite scroll.
     * We repeatedly click the button until all listings are rendered.
     * 
     * From DOM inspection:
     *   <p>Showing 6 of 44</p>
     *   <button class="...btn__root..." type="button">Show more</button>
     */
    autoScroll() {
      if (_autoScrollInProgress) return;
      _autoScrollInProgress = true;

      console.log('[A11y Helper] 📜 Viagogo SCAN: clicking "Show more" to load all listings');

      const startTime = Date.now();
      const MAX_SCAN_MS = 60000; // 60s max (some events have 100+ listings)
      let lastCount = capturedSeats.length;
      let clickCount = 0;
      let noNewDataRounds = 0;

      ViagogoAdapter.scrapeSeats();

      const scanInterval = setInterval(async () => {
        const elapsed = Date.now() - startTime;

        // Update progress based on "Showing X of Y" text if available
        let progressPct = Math.min(95, Math.round((elapsed / SCAN_DURATION_MS) * 100));
        const showingMatch = document.body.textContent.match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
        if (showingMatch) {
          const shown = parseInt(showingMatch[1]);
          const total = parseInt(showingMatch[2]);
          if (total > 0) progressPct = Math.min(99, Math.round((shown / total) * 100));
        }
        scanProgress = progressPct;

        const bar = document.getElementById('tmA11yScanProgress');
        const txt = document.getElementById('tmA11yScanText');
        if (bar) bar.style.width = `${progressPct}%`;
        if (txt) txt.textContent = `Scanning seats… ${capturedSeats.length} found`;

        // ── Find and click "Show more" button ──
        const showMoreBtn = ViagogoAdapter._findShowMoreButton();

        if (showMoreBtn) {
          showMoreBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await new Promise(r => setTimeout(r, 200));
          showMoreBtn.click();
          try { showMoreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch(e) {}
          clickCount++;
          console.log(`[A11y Helper] 📜 Clicked "Show more" (${clickCount}x)`);
          noNewDataRounds = 0;

          // Wait for new listings to render, then scrape
          await new Promise(r => setTimeout(r, 1200));
          ViagogoAdapter.scrapeSeats();
        } else {
          // No button found — scrape what's visible
          ViagogoAdapter.scrapeSeats();
          noNewDataRounds++;
        }

        if (capturedSeats.length > lastCount) {
          console.log(`[A11y Helper] 📜 ${capturedSeats.length} seats (+${capturedSeats.length - lastCount})`);
          lastCount = capturedSeats.length;
          noNewDataRounds = 0;
        }

        // ── Done conditions ──
        const allLoaded = showingMatch && parseInt(showingMatch[1]) >= parseInt(showingMatch[2]);
        const timedOut = elapsed >= MAX_SCAN_MS;
        const stalled = noNewDataRounds >= 6 && !showMoreBtn; // No button + no new data for 6 rounds

        if (allLoaded || timedOut || stalled) {
          clearInterval(scanInterval);
          _autoScrollInProgress = false;
          
          // Scroll back to top
          const scrollEl = document.scrollingElement || document.documentElement;
          scrollEl.scrollTo({ top: 0, behavior: 'smooth' });

          setTimeout(() => {
            ViagogoAdapter.scrapeSeats();
            console.log(`[A11y Helper] 📜 Viagogo SCAN COMPLETE: ${capturedSeats.length} seats (${clickCount} clicks, ${allLoaded ? 'all loaded' : timedOut ? 'timeout' : 'stalled'})`);
            finishScan();
          }, 500);
        }
      }, 1500); // Check every 1.5s (slower than TM to allow DOM updates)
    },

    /**
     * Find the "Show more" button on the page.
     * Viagogo uses obfuscated class names, so we match by:
     *   1. btn__root class + "Show more" text
     *   2. Any button containing "Show more" text
     *   3. Any button containing "Load more" text
     */
    _findShowMoreButton() {
      // Strategy 1: btn__root class
      const btnRootBtns = document.querySelectorAll('button[class*="btn__root"], button[class*="btn_root"]');
      for (const btn of btnRootBtns) {
        if (btn.closest('#tm-a11y-companion-panel')) continue;
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'show more' || text === 'load more' || text === 'see more') return btn;
      }

      // Strategy 2: Any visible button with matching text
      const allButtons = document.querySelectorAll('button, [role="button"]');
      for (const btn of allButtons) {
        if (btn.closest('#tm-a11y-companion-panel')) continue;
        if (!btn.offsetParent) continue; // Hidden
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'show more' || text === 'load more' || text === 'see more') return btn;
      }

      return null;
    },

    /**
     * Click a Viagogo listing card and proceed to purchase.
     *
     * Viagogo flow: click card → navigate to purchase/checkout page.
     * Unlike TM, there's typically no two-step process.
     */
    async clickListing(seat, qty) {
      console.log(`[A11y Helper] 🛒 Viagogo: selecting ${seat.section} Row ${seat.row} @ £${seat.price}`);

      // Find matching card in the DOM
      const sectionNorm = seat.section.replace(/^Section\s*/i, '').replace(/\s+/g, '').toLowerCase();
      const priceStr = seat.price.toFixed(2);
      const allCards = document.querySelectorAll(
        '[data-testid="ticket-card"], [data-testid="listing-card"], ' +
        '.ticket-card, .listing-card, .ticket-row, .listing-row, ' +
        '[class*="TicketCard"], [class*="ListingCard"], [class*="ticket-row"], [class*="listing-row"]'
      );

      let bestMatch = null;
      let bestScore = 0;

      allCards.forEach(card => {
        if (card.closest('#tm-a11y-companion-panel')) return;
        const text = card.textContent || '';
        if (text.length < 15 || text.length > 500) return;

        let score = 0;
        const textNorm = text.replace(/\s+/g, '').toLowerCase();
        if (textNorm.includes(sectionNorm)) score += 4;
        if (text.includes(priceStr)) score += 3;
        else if (text.includes(`£${Math.round(seat.price)}`) || text.includes(`€${Math.round(seat.price)}`)) score += 2;
        if (seat.row && new RegExp(`row\\s*${seat.row}\\b`, 'i').test(text)) score += 2;
        if (text.length < 300) score += 1;

        if (score > bestScore && score >= 5) { bestScore = score; bestMatch = card; }
      });

      // Broader fallback — any clickable element containing section + price
      if (!bestMatch) {
        const allClickables = document.querySelectorAll('div, li, a, button, [role="button"], [role="listitem"]');
        allClickables.forEach(el => {
          if (el.closest('#tm-a11y-companion-panel')) return;
          const text = el.textContent || '';
          if (text.length < 15 || text.length > 500) return;
          let score = 0;
          const textNorm = text.replace(/\s+/g, '').toLowerCase();
          if (textNorm.includes(sectionNorm)) score += 4;
          if (text.includes(priceStr)) score += 3;
          if (seat.row && new RegExp(`row\\s*${seat.row}\\b`, 'i').test(text)) score += 2;
          if (score > bestScore && score >= 5) { bestScore = score; bestMatch = el; }
        });
      }

      if (!bestMatch) {
        console.log('[A11y Helper] 🛒 Viagogo: no matching listing found');
        return false;
      }

      console.log(`[A11y Helper] 🛒 Viagogo: found match (score ${bestScore}):`, bestMatch.textContent.substring(0, 80));

      // Click the listing
      bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 400));
      bestMatch.style.outline = '3px solid var(--tm-a11y-accent, #3ecf8e)';

      // Look for a buy/select button INSIDE the card first
      const innerBtn = bestMatch.querySelector(
        'button, a[href*="checkout"], a[href*="buy"], a[href*="purchase"], ' +
        '[data-testid*="buy"], [data-testid*="select"], [data-testid*="checkout"]'
      );

      if (innerBtn) {
        innerBtn.click();
        try { innerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {}
        console.log('[A11y Helper] 🛒 Viagogo: clicked inner buy button');
      } else {
        // Click the card itself — Viagogo cards are often clickable links
        bestMatch.click();
        try {
          bestMatch.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
          bestMatch.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
          bestMatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } catch (e) {}
        console.log('[A11y Helper] 🛒 Viagogo: clicked card');
      }

      // Wait for page to react — Viagogo may show a purchase modal or navigate
      await new Promise(r => setTimeout(r, 2000));

      // Look for checkout/buy/proceed button that appeared
      const checkoutPatterns = [
        /buy\s*now/i, /get\s*tickets?/i, /checkout/i, /proceed/i,
        /continue/i, /add\s*to\s*(basket|cart)/i, /confirm/i, /place\s*order/i
      ];
      const checkoutSelectors = [
        'button[data-testid*="buy"]', 'button[data-testid*="checkout"]',
        'a[data-testid*="buy"]', 'a[data-testid*="checkout"]',
        'button[data-testid*="proceed"]', 'button[data-testid*="confirm"]',
        '[class*="BuyButton"]', '[class*="buyButton"]', '[class*="checkout"]'
      ];

      // Try selectors first
      for (const sel of checkoutSelectors) {
        try {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(r => setTimeout(r, 200));
            btn.click();
            console.log('[A11y Helper] 🛒 Viagogo: clicked checkout button');
            setTimeout(() => { if (bestMatch) bestMatch.style.outline = ''; }, 3000);
            return true;
          }
        } catch (e) {}
      }

      // Try text matching on visible buttons
      const buttons = document.querySelectorAll('button, a[role="button"]');
      for (const btn of buttons) {
        if (btn.closest('#tm-a11y-companion-panel')) continue;
        if (!btn.offsetParent) continue;
        const btnText = (btn.textContent || '').trim();
        if (btnText.length < 2 || btnText.length > 40) continue;
        for (const pattern of checkoutPatterns) {
          if (pattern.test(btnText)) {
            btn.click();
            console.log(`[A11y Helper] 🛒 Viagogo: clicked "${btnText}" button`);
            setTimeout(() => { if (bestMatch) bestMatch.style.outline = ''; }, 3000);
            return true;
          }
        }
      }

      // Card click alone may have navigated — report success
      setTimeout(() => { if (bestMatch) bestMatch.style.outline = ''; }, 3000);
      console.log('[A11y Helper] 🛒 Viagogo: card clicked, may have navigated');
      return true;
    },

    /** Scroll to seat: scroll the map into view and highlight the panel card */
    scrollToSeat(seatId) {
      // Scroll the Mapbox map into view
      const mapWrapper = document.getElementById('MapBoxWrapper') || 
                         document.querySelector('.mapboxgl-map') ||
                         document.querySelector('[data-testid="map-container"]');
      if (mapWrapper) {
        mapWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mapWrapper.style.outline = '3px solid var(--tm-a11y-accent, #3ecf8e)';
        mapWrapper.style.outlineOffset = '-3px';
        setTimeout(() => { mapWrapper.style.outline = ''; mapWrapper.style.outlineOffset = ''; }, 2000);
      }
      // Also scroll to the card in our panel
      const card = document.querySelector(`.tm-a11y-seat-card[data-seat-id="${seatId}"]`);
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    /**
     * Apply heatmap/focus highlights to the Mapbox GL map.
     * Uses the shared applyMapboxHeatmap() which accesses the
     * captured Mapbox GL instance via our constructor interceptor.
     */
    applyMapHighlights() {
      if (currentPreferences.mcdaEnabled) computeAllMCDAScores();
      if (!currentPreferences.mcdaEnabled && !currentPreferences.focusModeEnabled) {
        resetMapboxHeatmap();
        return;
      }
      applyMapboxHeatmap('viagogo');
    },

    /** Detect Mapbox map container mutations */
    isMapMutation(node) {
      if (!node || node.nodeType !== 1) return false;
      return !!(
        node.id === 'MapBoxWrapper' ||
        node.id === 'SeatMapMapbox' ||
        node.classList?.contains('mapboxgl-map') ||
        node.classList?.contains('mapboxgl-canvas') ||
        node.querySelector?.('.mapboxgl-map, .mapboxgl-canvas, #MapBoxWrapper, [data-testid="map-container"]')
      );
    },

    getCurrencySymbol() {
      const host = window.location.hostname;
      if (/\.co\.uk|\.ie/i.test(host)) return '£';
      if (/\.de|\.fr|\.es|\.it|\.nl|\.be|\.at|\.ch|\.se|\.dk|\.fi|\.no|\.pl|\.pt/i.test(host)) return '€';
      if (/\.com\.br|\.com\.ar/i.test(host)) return '$';
      if (/\.com$/.test(host)) return '$';
      return '£';
    }
  };


  const PLATFORM_ADAPTERS = [
    TicketmasterAdapter,
    ViagogoAdapter,
    StubHubAdapter,
  ];

  /**
   * Detect which platform we're on and return the appropriate adapter.
   * Falls back to TicketmasterAdapter if no match (legacy behaviour).
   */
  function detectPlatform() {
    for (const adapter of PLATFORM_ADAPTERS) {
      if (adapter.detect()) {
        console.log(`[A11y Helper] Platform detected: ${adapter.name}`);
        return adapter;
      }
    }
    console.log('[A11y Helper] No platform match — defaulting to Ticketmaster adapter');
    return TicketmasterAdapter;
  }


  // ══════════════════════════════════════════════════════════════
  // INITIALISATION
  // ══════════════════════════════════════════════════════════════

  function initialise() {
    if (isInitialised) return;
    isInitialised = true;

    currentAdapter = detectPlatform();

    console.log(`[A11y Helper] ████ Initialising v7.0 (${currentAdapter.name}) on:`, window.location.href);

    // Add platform class to body for platform-specific CSS
    document.body.setAttribute('data-tm-a11y-platform', currentAdapter.name);

    currentAdapter.getEventMeta();
    applyColourScheme(currentPreferences.colourScheme);
    applyTypography();
    applyDeclutterMode();
    applyAnimationFreeze();

    // Set scan state BEFORE creating panel so the overlay renders correctly
    if (currentAdapter.shouldAutoScan) {
      scanState = 'scanning';
    }

    createPanel();

    // Request auth session from bridge (loads journal if logged in)
    window.postMessage({ source: 'tm-a11y-content', type: 'AUTH_GET_SESSION' }, '*');

    // Request preferences from bridge (async)
    window.postMessage({ source: 'tm-a11y-content', type: 'REQUEST_PREFERENCES' }, '*');
    // Request sensory profiles from bridge
    requestProfiles();

    // ── Quick scrapes of what's already visible (no scrolling/movement) ──
    setTimeout(() => currentAdapter.scrapeSeats(), 1500);
    setTimeout(() => {
      currentAdapter.scrapeSeats();
      if (capturedSeats.length > 0) renderPanelContent();
    }, 3000);

    // ── Platform-specific scan behaviour ──
    // TM: auto-scroll sidebar on load (virtual scroll needs it to populate)
    // Viagogo: wait for user to press "Scan All Seats" (avoids overstimulation)
    if (currentAdapter.shouldAutoScan) {
      setTimeout(() => currentAdapter.autoScroll(), 4000);
      // Safety timeout — unlock panel even if scan stalls
      setTimeout(() => { if (scanState === 'scanning') { console.log('[A11y Helper] Scan timeout'); finishScan(); } }, 30000);
    }
    // NOTE: When shouldAutoScan is false, the user presses "Scan All Seats"
    // button in the companion panel to begin. This prevents overstimulation
    // from unexpected page scrolling/movement on load.

    // Background scrape every 15s for 90s
    let bgScrapeCount = 0;
    const bgScrapeInterval = setInterval(() => {
      bgScrapeCount++;
      const before = capturedSeats.length;
      currentAdapter.scrapeSeats();
      if (capturedSeats.length > before && scanState === 'ready') {
        renderPanelContent();
        if (currentPreferences.focusModeEnabled || currentPreferences.mcdaEnabled) currentAdapter.applyMapHighlights();
      }
      if (bgScrapeCount >= 6) clearInterval(bgScrapeInterval);
    }, 15000);

    // ── MutationObserver: watch for dynamic content ──
    const contentObserver = new MutationObserver((mutations) => {
      // Re-apply map visualisation when seat map loads/changes
      if (currentPreferences.focusModeEnabled || currentPreferences.mcdaEnabled) {
        let mapChanged = false;
        for (const mutation of mutations) {
          for (const added of mutation.addedNodes) {
            if (currentAdapter.isMapMutation(added)) {
              mapChanged = true;
              break;
            }
          }
          if (mapChanged) break;
        }
        if (mapChanged) {
          clearTimeout(window._tmA11yReapply);
          window._tmA11yReapply = setTimeout(() => currentAdapter.applyMapHighlights(), 500);
        }
      }

      // Extract event meta if not yet found
      if (!eventMeta.eventName) {
        currentAdapter.getEventMeta();
        if (eventMeta.eventName && panelElement) {
          renderPanelContent();
          // Trigger venue enrichment when we first discover venue name
          if (!_venueMeta && eventMeta.venue) {
            VenueMetadataService.enrich(eventMeta.eventId, eventMeta.venue).then(meta => {
              if (meta) { _venueMeta = meta; eventMeta.venueMeta = meta; renderPanelContent(); }
            });
          }
        }
      }
      // Also keep trying to find venue name if we have event name but not venue yet
      if (eventMeta.eventName && !eventMeta.venue) {
        currentAdapter.getEventMeta();
        if (eventMeta.venue && !_venueMeta) {
          VenueMetadataService.enrich(eventMeta.eventId, eventMeta.venue).then(meta => {
            if (meta) { _venueMeta = meta; eventMeta.venueMeta = meta; renderPanelContent(); }
          });
        }
      }

      // Re-apply declutter for dynamically loaded ads
      if (currentPreferences.declutterEnabled) {
        clearTimeout(window._tmA11yReDeclutter);
        window._tmA11yReDeclutter = setTimeout(() => applyDeclutterMode(), 500);
      }
    });

    if (document.body) {
      contentObserver.observe(document.body, { childList: true, subtree: true });
    }

    // ── Scroll listener: scrape new sidebar items as user scrolls ──
    // (Catches manual scrolling in addition to our auto-scroll)
    setTimeout(() => {
      const scrollContainers = document.querySelectorAll(
        '[class*="listing"], [class*="Listing"], [class*="scroll"], [class*="results"], ' +
        '[data-testid*="listing"], [data-testid*="ticket"], [role="list"], [role="listbox"]'
      );
      scrollContainers.forEach(container => {
        if (container.closest('#tm-a11y-companion-panel')) return;
        container.addEventListener('scroll', () => {
          clearTimeout(window._tmA11yScrollScrape);
          window._tmA11yScrollScrape = setTimeout(() => currentAdapter.scrapeSeats(), 500);
        }, { passive: true });
      });
    }, 3000);

    console.log('[A11y Helper] ████ Initialisation complete');

    // ── Tier 2: Init recommendation engine (async, non-blocking) ──
    UserPreferenceEngine.init().then(() => {
      // Pre-build profile so it's ready when seats load
      UserPreferenceEngine.buildProfile().then(profile => {
        if (profile) {
          console.log(`[A11y Helper] 🧠 Preference profile loaded (${profile.sample_size} selections)`);
        }
      });
    });

    // ── Tier 1: Venue metadata enrichment (async, non-blocking) ──
    // Wait for DOM to settle so venue name has been extracted
    const _tryVenueEnrich = () => {
      // Re-extract event meta in case it wasn't ready earlier
      currentAdapter.getEventMeta();
      const venueName = eventMeta.venue; // Only use actual venue name, NOT event name
      if (!venueName) {
        console.log('[A11y Helper] 🏟 Venue name not found yet, will retry');
        return false;
      }
      VenueMetadataService.enrich(eventMeta.eventId, venueName).then(meta => {
        if (meta) {
          _venueMeta = meta;
          eventMeta.venueMeta = meta;
          if (panelElement) renderPanelContent();
          console.log(`[A11y Helper] 🏟 Venue metadata loaded for "${venueName}"`);
        }
      });
      return true;
    };
    // Try at 3s, retry at 6s and 10s if venue name not yet available
    setTimeout(() => {
      if (!_tryVenueEnrich()) {
        setTimeout(() => {
          if (!_tryVenueEnrich()) {
            setTimeout(() => _tryVenueEnrich(), 4000);
          }
        }, 3000);
      }
    }, 3000);
  }

  // Robust startup — wait for document.body to exist
  function startWhenReady() {
    if (document.body) {
      initialise();
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialise);
    } else {
      const bodyPoll = setInterval(() => {
        if (document.body) {
          clearInterval(bodyPoll);
          initialise();
        }
      }, 50);
      setTimeout(() => clearInterval(bodyPoll), 10000);
    }
  }

  startWhenReady();

})();