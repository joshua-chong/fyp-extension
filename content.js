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
    'arial': 'Arial, Helvetica, sans-serif',
    'verdana': 'Verdana, Geneva, sans-serif',
    'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
    'opendyslexic': 'OpenDyslexic, sans-serif',
    'atkinson': '"Atkinson Hyperlegible", sans-serif',
    'trebuchet': '"Trebuchet MS", sans-serif',
    'tahoma': 'Tahoma, Geneva, sans-serif',
    'georgia': 'Georgia, serif',
    'times': '"Times New Roman", Times, serif'
  };

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
      '--tm-a11y-heat-t5': '#6b7280'
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
      '--tm-a11y-heat-t5': '#444444'
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
      '--tm-a11y-heat-t5': '#555555'
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
      '--tm-a11y-heat-t5': '#555555'
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
      '--tm-a11y-heat-t5': '#5a544e'
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
      '--tm-a11y-heat-t4': '#4b5563',
      '--tm-a11y-heat-t5': '#374151'
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
    ticketQty: 0
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
    // Try venue
    const venueEl = document.querySelector('[class*="venue"], [class*="Venue"], [data-testid*="venue"]');
    if (venueEl && !eventMeta.venue) {
      eventMeta.venue = venueEl.textContent?.trim();
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

  function renderPanelContent() {
    if (!panelElement) return;

    // Recompute MCDA scores if heatmap is active
    if (currentPreferences.mcdaEnabled) {
      computeAllMCDAScores();
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
          <button class="tm-a11y-panel-close" aria-label="Close panel" id="tmA11yClosePanel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
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
          <button class="tm-a11y-tab-btn ${currentPanelTab === 'tools' ? 'tm-a11y-tab-active' : ''}" 
                  role="tab" aria-selected="${currentPanelTab === 'tools'}" data-tab="tools">Tools</button>
        </div>

        ${scanState === 'scanning' ? `
        <div class="tm-a11y-scan-overlay" id="tmA11yScanOverlay">
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
          <div class="tm-a11y-panel-filters">
            
            <!-- Price slider -->
            <div class="tm-a11y-filter-group">
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

            <!-- Ticket quantity -->
            <div class="tm-a11y-filter-group">
              <label class="tm-a11y-filter-label" for="tmA11yTicketQty">Number of Tickets</label>
              <select id="tmA11yTicketQty" class="tm-a11y-select" aria-label="Number of tickets">
                ${[0,1,2,3,4,5,6].map(n => 
                  `<option value="${n}" ${(currentPreferences.ticketQty||0)===n?'selected':''}>${n===0?'Any quantity':n+' ticket'+(n>1?'s':'')}</option>`
                ).join('')}
              </select>
            </div>

            <!-- Section filter -->
            <div class="tm-a11y-filter-group">
              <label class="tm-a11y-filter-label" for="tmA11ySectionFilter">Section</label>
              <select id="tmA11ySectionFilter" class="tm-a11y-select" aria-label="Filter by section">
                <option value="all" ${currentPreferences.sectionFilter === 'all' ? 'selected' : ''}>All Sections (${sections.length})</option>
                ${sections.map(s => {
                  const count = capturedSeats.filter(seat => seat.section === s && seat.availability === 'available').length;
                  return `<option value="${s}" ${currentPreferences.sectionFilter === s ? 'selected' : ''}>${s} (${count})</option>`;
                }).join('')}
              </select>
            </div>

            <!-- Sort -->
            <div class="tm-a11y-filter-group">
              <label class="tm-a11y-filter-label" for="tmA11ySortBy">Sort by</label>
              <select id="tmA11ySortBy" class="tm-a11y-select" aria-label="Sort seats by">
                <option value="price-asc" ${currentPreferences.sortBy === 'price-asc' ? 'selected' : ''}>Price: Low → High</option>
                <option value="price-desc" ${currentPreferences.sortBy === 'price-desc' ? 'selected' : ''}>Price: High → Low</option>
                <option value="section" ${currentPreferences.sortBy === 'section' ? 'selected' : ''}>Section</option>
                <option value="quality" ${currentPreferences.sortBy === 'quality' ? 'selected' : ''}>View Quality</option>
                ${currentPreferences.mcdaEnabled ? `<option value="score-desc" ${currentPreferences.sortBy === 'score-desc' ? 'selected' : ''}>MCDA Score ★</option>` : ''}
              </select>
            </div>

            <!-- Colour scheme -->
            <div class="tm-a11y-filter-group">
              <label class="tm-a11y-filter-label" for="tmA11yColourScheme">Colour Scheme</label>
              <select id="tmA11yColourScheme" class="tm-a11y-select" aria-label="Colour scheme">
                ${Object.entries(COLOUR_SCHEMES).map(([key, scheme]) =>
                  `<option value="${key}" ${currentPreferences.colourScheme === key ? 'selected' : ''}>${scheme.label}</option>`
                ).join('')}
              </select>
            </div>
          </div>

          <!-- MCDA WEIGHT SLIDERS (visible when heatmap is active) -->
          ${currentPreferences.mcdaEnabled ? renderMCDAWeightPanel() : ''}
        </div>

        <!-- ═══ TAB: TOOLS ═══ -->
        <div class="tm-a11y-tab-panel ${currentPanelTab === 'tools' ? '' : 'tm-a11y-tab-hidden'}" id="tmA11yTabTools" role="tabpanel">
          <div class="tm-a11y-panel-tools">
            
            <!-- PROFILE SELECTOR -->
            <div class="tm-a11y-tool-section">
              <div class="tm-a11y-tool-label">Sensory Profile</div>
              <select id="tmA11yProfileSelect" class="tm-a11y-select" aria-label="Sensory profile">
                <option value="" ${!activeProfileId ? 'selected' : ''}>No Profile (Manual)</option>
                ${getAllProfiles().map(p => 
                  `<option value="${p.id}" ${activeProfileId === p.id ? 'selected' : ''}>${p.builtIn ? '★ ' : ''}${p.name}</option>`
                ).join('')}
              </select>
            </div>

            <!-- ACCESSIBILITY TOGGLES -->
            <div class="tm-a11y-tool-section">
              <div class="tm-a11y-tool-label">Accessibility Tools</div>
              <div class="tm-a11y-tool-toggles">
                <button class="tm-a11y-toggle-btn ${currentPreferences.declutterEnabled ? 'tm-a11y-toggle-active' : ''}" 
                        id="tmA11yDeclutterToggle" 
                        aria-pressed="${currentPreferences.declutterEnabled}"
                        title="Hide ads, 'Only X left!', countdown timers, upsell banners and other FOMO elements">
                  <span>Declutter${currentPreferences.declutterEnabled && declutterHiddenCount > 0 ? ` (${declutterHiddenCount})` : ''}</span>
                </button>
                <button class="tm-a11y-toggle-btn ${currentPreferences.animationFreezeEnabled ? 'tm-a11y-toggle-active' : ''}" 
                        id="tmA11yAnimFreezeToggle" 
                        aria-pressed="${currentPreferences.animationFreezeEnabled}"
                        title="Stop all animations, transitions, and moving elements">
                  <span>Freeze motion</span>
                </button>
              </div>
            </div>

            <!-- MAP VISUALISATION -->
            <div class="tm-a11y-tool-section">
              <div class="tm-a11y-tool-label">Map Visualisation</div>
              <div class="tm-a11y-tool-toggles">
                <button class="tm-a11y-toggle-btn ${currentPreferences.focusModeEnabled ? 'tm-a11y-toggle-active' : ''}" 
                        id="tmA11yFocusModeToggle" 
                        aria-pressed="${currentPreferences.focusModeEnabled}"
                        title="Highlight affordable seats and dim expensive ones on the seat map">
                  <span>Focus mode</span>
                </button>
                <button class="tm-a11y-toggle-btn ${currentPreferences.mcdaEnabled ? 'tm-a11y-toggle-active' : ''}" 
                        id="tmA11yMCDAToggle" 
                        aria-pressed="${currentPreferences.mcdaEnabled}"
                        title="Score and colour-code all seats using weighted criteria">
                  <span>Heatmap</span>
                </button>
              </div>
              <p class="tm-a11y-tool-hint">Focus mode dims over-budget seats. Heatmap scores all seats by your priorities (set weights in Filters tab).</p>
            </div>
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
      renderPanelContent();
    });

    // Sort
    document.getElementById('tmA11ySortBy')?.addEventListener('change', (e) => {
      currentPreferences.sortBy = e.target.value;
      renderPanelContent();
    });

    // Colour scheme
    document.getElementById('tmA11yColourScheme')?.addEventListener('change', (e) => {
      currentPreferences.colourScheme = e.target.value;
      applyColourScheme(e.target.value);
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
        if (seat) togglePinSeat(seat);
      });
    });

    // === NEW: Clear pinned seats ===
    document.getElementById('tmA11yClearPins')?.addEventListener('click', () => {
      pinnedSeats = [];
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

    // Seat card clicks — scroll to seat on map (but not on button/select clicks)
    document.querySelectorAll('.tm-a11y-seat-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.tm-a11y-card-select-btn, .tm-a11y-card-qty, .tm-a11y-pin-btn')) return;
        currentAdapter.scrollToSeat(card.dataset.seatId);
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
      @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
    `;
    document.head.insertBefore(fontStyle, document.head.firstChild);
  }

  function applyTypography() {
    const { fontFamily, fontSize, lineSpacing } = currentPreferences;
    removeTypography();

    if (fontFamily === 'default' && fontSize === 16 && lineSpacing === 1.5) return;
    if (fontFamily === 'opendyslexic' || fontFamily === 'atkinson') loadAccessibilityFonts();

    const fontFamilyValue = FONT_FAMILIES[fontFamily];
    const importantProps = [];

    if (fontFamilyValue) importantProps.push(`font-family: ${fontFamilyValue} !important`);
    if (fontSize !== 16) importantProps.push(`font-size: ${fontSize}px !important`);
    if (lineSpacing !== 1.5) importantProps.push(`line-height: ${lineSpacing} !important`);
    if (importantProps.length === 0) return;

    const propsString = importantProps.join('; ');

    styleElement = document.createElement('style');
    styleElement.id = 'tm-a11y-typography-override';
    styleElement.textContent = `
      html body *:not(#tm-a11y-companion-panel *):not(#tm-a11y-panel-tab) { ${propsString}; }
      html body [class]:not(#tm-a11y-companion-panel [class]) { ${propsString}; }
      html body [class^="sc-"]:not(#tm-a11y-companion-panel *) { ${propsString}; }
      html body [data-testid]:not(#tm-a11y-companion-panel *) { ${propsString}; }
    `;
    document.head.appendChild(styleElement);

    // Inline styles — skip our own panel
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest('#tm-a11y-companion-panel') || el.id === 'tm-a11y-panel-tab') return;
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'g', 'defs', 'use', 'symbol', 'clippath', 'mask'].includes(tag)) return;

      if (fontFamilyValue) el.style.setProperty('font-family', fontFamilyValue, 'important');
      if (fontSize !== 16) el.style.setProperty('font-size', `${fontSize}px`, 'important');
      if (lineSpacing !== 1.5) el.style.setProperty('line-height', String(lineSpacing), 'important');
      el.setAttribute('data-tm-a11y-styled', 'true');
    });

    // Observer for dynamically added elements
    if (mutationObserver) mutationObserver.disconnect();
    mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && !node.closest?.('#tm-a11y-companion-panel')) {
          applyTypoToElement(node, fontFamilyValue, fontSize, lineSpacing);
        }
      }));
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function applyTypoToElement(el, fontFamily, fontSize, lineSpacing) {
    const skip = ['script', 'style', 'svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline', 'g', 'defs', 'use', 'symbol', 'clippath', 'mask'];
    if (skip.includes(el.tagName?.toLowerCase())) return;
    if (fontFamily) el.style.setProperty('font-family', fontFamily, 'important');
    if (fontSize !== 16) el.style.setProperty('font-size', `${fontSize}px`, 'important');
    if (lineSpacing !== 1.5) el.style.setProperty('line-height', String(lineSpacing), 'important');
    el.setAttribute('data-tm-a11y-styled', 'true');
    el.querySelectorAll('*').forEach(child => {
      if (!skip.includes(child.tagName?.toLowerCase())) {
        if (fontFamily) child.style.setProperty('font-family', fontFamily, 'important');
        if (fontSize !== 16) child.style.setProperty('font-size', `${fontSize}px`, 'important');
        if (lineSpacing !== 1.5) child.style.setProperty('line-height', String(lineSpacing), 'important');
        child.setAttribute('data-tm-a11y-styled', 'true');
      }
    });
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

  const TIER_OPACITY = { 1: '1', 2: '0.95', 3: '0.85', 4: '0.6', 5: '0.35' };

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

    console.log(`[A11y Helper] ████ Initialising v6.3 (${currentAdapter.name}) on:`, window.location.href);

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
        if (eventMeta.eventName && panelElement) renderPanelContent();
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