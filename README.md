# Seat Finder v8.0 — Ticket Accessibility Helper

Chrome Extension (Manifest V3) that reduces cognitive load for neurodivergent users during online ticket booking. Designed as a Final Year Project investigating how personalised accessibility tools can improve the ticket purchasing experience for users with ADHD, autism, dyslexia, and sensory processing differences.

Supports Ticketmaster (primary), Viagogo, and StubHub.

---

## Folder Structure

```
seat-finder/
├── manifest.json              # Chrome Extension manifest (MV3)
├── content.js                 # MAIN world — seat scraping, panel UI, all features
├── bridge.js                  # ISOLATED world — chrome.storage relay, auth, journal
├── content.css                # Companion panel styles + WCAG compliance
├── background.js              # Service worker — venue page fetching + OpenAI extraction
├── popup.html                 # Extension popup (settings, profiles, journal)
├── popup.js                   # Popup interaction logic
├── seats.json                 # Sample seat data for development/testing
├── accessible-icons/          # Custom PNG icons for venue features + UI
│   ├── animals.png            # Service animals
│   ├── brain.png              # Recommendation engine
│   ├── emergency.png          # Emergency info
│   ├── entrance.png           # Accessible entrance
│   ├── hearing.png            # Hearing/induction loop
│   ├── key.png                # API key
│   ├── lock.png               # Privacy indicator
│   ├── palette.png            # Display settings
│   ├── parking.png            # Accessible parking
│   ├── quiet.png              # Quiet space
│   ├── restroom.png           # Accessible restrooms
│   ├── scale.png              # MCDA/scoring
│   ├── seating.png            # Accessible/companion seating
│   ├── ticket.png             # Ticket search
│   ├── toilets.png            # Toilet facilities
│   ├── typography.png         # Typography settings
│   ├── venue.png              # Venue info
│   ├── warning.png            # Warning/error state
│   └── wc.png                 # WC facilities
├── fonts/                     # Local font files (OpenDyslexic)
├── icons/                     # Extension toolbar icons (16/48/128px)
├── testable.js                # Extracted pure functions for unit testing
├── seatfinder.test.js         # Jest unit test suite (244 tests)
├── package.json               # Node.js config for test runner
└── README.md
```

---

## Architecture

### Two-World Content Script Design

| Script | World | Responsibilities |
|--------|-------|-----------------|
| `content.js` | MAIN | Seat scraping via DOM observation, companion panel UI, MCDA scoring, kNN engine, focus mode, heatmap, typography, declutter, animation freeze |
| `bridge.js` | ISOLATED | chrome.storage access, chrome.runtime.getURL for icons, auth/journal CRUD relay, sensory profile storage, OpenAI key management, venue accessibility message relay |
| `background.js` | Service Worker | Multi-page venue accessibility crawling, PDF text extraction, OpenAI GPT-4o-mini extraction, RAG chatbot relay, Google search fallback |

Communication between MAIN and ISOLATED worlds uses `window.postMessage` with source identifiers (`tm-a11y-content` / `tm-a11y-bridge`).

### Data Flow

```
User visits Ticketmaster event page
        |
content.js auto-scrolls TM's sidebar to force virtual scroll rendering
        |
Scrapes each listing card → normalises into seat objects
        |
Merges into capturedSeats[] (deduplication by content key)
        |
Renders companion panel: 5 tabs (Seats, Filters, Venue, Tools, Journal)
        |
User interacts → filters, pins, likes, adjusts preferences
        |
kNN engine learns from selections → recommends similar seats
        |
MCDA engine scores all seats → heatmap visualisation on seat map
        |
Preferences persisted via bridge.js → chrome.storage.sync
```

---

## Features

### Seat Data Extraction
Auto-scrolls the Ticketmaster sidebar listing panel to trigger virtual scroll rendering, then scrapes each visible listing card. Extracts section, row, seat number, price, seller type, quality score, and availability. Handles TM's dynamic class names and re-rendering. Platform adapters for Viagogo and StubHub provide the same normalised format.

### Companion Side Panel
Five-tab interface injected as a fixed sidebar: Seats (filtered cards with pin/like actions), Filters (price slider, section, seller type, row range, sort, MCDA weights, colour scheme, typography), Venue (AI-extracted accessibility features + RAG chatbot), Tools (sensory profiles, accessibility toggles, map visualisation, API key), Journal (concert experience logging with auth gate).

### kNN Recommendation Engine (v2)
Non-parametric machine learning engine that learns from seat selections without averaging. Converts each seat to a 7-dimensional feature vector (price, row number, section hash, resale flag, VIP flag, aisle access, accessible flag), applies min-max normalisation, and scores candidates by inverse mean weighted Euclidean distance to the k=5 nearest positive selections. Handles multi-modal preferences (e.g. both cheap standing and expensive floor seats). Three-tier negative signals (dismiss 1.0, skip 0.6, scroll_past 0.3) with distance-weighted penalty capped at 25 points. Sensory profile weight modulation shifts feature importance based on user needs. Venue metadata integration boosts relevant weights when quiet spaces, companion seating, or hearing loops are available.

### MCDA Heatmap
Multi-Criteria Decision Analysis scoring with 4 dimensions: price (inverted, lower is better), view quality (section-name heuristic), proximity (row number, lower is better), aisle access (edge seats score higher). Winsorised normalisation prevents outlier compression. 5 presets (Balanced, Cheapest, Best View, Close Up, Easy Exit) plus custom slider weights. Visualised as a 5-tier colour heatmap on the seat map via Mapbox GL interceptor.

### Venue Accessibility (AI + RAG)
Background service worker crawls known venue accessibility URLs (80+ UK/Ireland venues mapped), discovers child links (sub-pages, PDFs), extracts text, and sends to GPT-4o-mini for structured feature extraction. 8 features: accessible parking, entrance, seating, companion seating, hearing loop, service animals, restrooms, quiet space. RAG chatbot allows natural language questions about venue accessibility grounded in the crawled context. Google search fallback for unmapped venues.

### Sensory Profiles
3 built-in presets (Low Stimulation, High Contrast Focus, Budget Mode) plus custom profiles with import/export. Each profile configures colour scheme, font, size, spacing, declutter, animation freeze, focus mode, and MCDA weights in one click. Stored in chrome.storage.sync for cross-device persistence.

### Decision Progress Indicator
Three-stage tracker (Exploring → Comparing → Deciding) that advances based on user interactions: filter changes, seat card views, pins, and likes. Externalises executive function — helps users recognise where they are in their decision process. Based on Barkley's (1997) ADHD executive function model.

### Accessibility Tools
- **Declutter mode**: removes ads, countdown timers, "Only X left!" urgency banners, upsell prompts
- **Animation freeze**: stops all CSS animations, transitions, GIFs, and auto-playing video
- **Focus mode**: dims over-budget seats on the map, highlights affordable ones
- **Pin-to-compare**: pin up to 2 seats for side-by-side comparison with winner highlighting

### Typography System
15 fonts across 4 categorised groups: Sans-Serif (Arial, Verdana, Tahoma, Trebuchet, Calibri), Accessibility Designed (Atkinson Hyperlegible, OpenDyslexic, Lexend), High Readability (Comic Sans, Andika), Serif (Georgia, Times New Roman, Bitter). Font family applies to both the TM page and companion panel. Font size (12–28px) and line spacing (1.5–3.0x) apply only to TM page content, preserving panel layout. Categorised dropdown with inline font previews.

### Colour Schemes
6 palettes: Default (green accents), High Contrast (yellow on black), Deuteranopia (blue/orange), Tritanopia (red/cyan), Muted/Calm (earth tones), Dark Mode (low brightness). All implemented as CSS custom properties for instant switching.

### Filtering System
Price slider with green-to-red gradient track, section filter, seller type filter (primary/resale), row range filter (text inputs accepting letters or numbers), ticket quantity, and 5 sort modes (price asc/desc, section, quality, MCDA score).

### Concert Journal
Login-gated journal tab for recording concert experiences. Local auth with SHA-256 password hashing via chrome.storage.local. Journal entries include: event name (auto-filled from current page), venue, section/seat, 5-star ratings for Overall and Sensory Comfort, 8 tag categories (Loud, Crowded, Good View, Accessible, Calm, Bright Lights, Easy Exit, Would Return), and freetext notes. Rich card display with calendar date badges, rating-coloured accent bars, and edit/delete actions.

### Custom Icon System
All UI icons replaced with custom PNG assets from the `accessible-icons/` folder. Icons are loaded via `chrome.runtime.getURL()` (relayed from bridge.js to MAIN world). CSS filter-based colouring adapts icons to the active colour scheme. 30x30px across all tabs.

---

## WCAG 2.1 AA Compliance

| Criterion | Status | Implementation |
|-----------|--------|---------------|
| SC 1.4.1 Use of Colour | Pass | All statuses use text labels alongside colour |
| SC 1.4.3 Contrast (Minimum) | Pass | Tertiary text raised from 2.79:1 to 4.81:1; button text switched to dark-on-accent |
| SC 1.4.4 Resize Text | Pass | Font size slider 12–28px |
| SC 1.4.11 Non-text Contrast | Pass | Slider tracks raised to 3.00:1 |
| SC 1.4.12 Text Spacing | Pass | Line spacing slider 1.5–3.0x; overflow-wrap on all content |
| SC 1.4.13 Content on Hover | Pass | Native title tooltips only |
| SC 2.3.3 Animation | Pass | prefers-reduced-motion kills all animations and transitions |
| SC 2.4.7 Focus Visible | Pass | Universal focus-visible rule on all interactive elements |
| SC 2.5.8 Target Size | Pass | All interactive elements min 24x24px |
| SC 4.1.2 Name, Role, Value | Pass | 87+ aria attributes across content.js |

---

## Testing

244 unit tests at 97% code coverage across 35 test groups:

```
npm install
npm test                    # Run all tests
npx jest --coverage         # Run with coverage report
```

Test coverage includes: parseRowNumber, parseSeatNumber, computeViewQuality, scoreToTier, seatContentKey, getFilteredSeats, mergeSeatData, decision stage computation, robustNormalise, MCDA scoring, kNN feature extraction, section hashing, normalisation, weighted distance, kNN scoring with rejection penalties, sensory profile weight modulation, venue name normalisation, lookupMap, htmlToText, extractChildLinks, configuration integrity, edge cases, multi-modal preference detection, end-to-end kNN pipeline, rejection locality, profile switching, and real venue data validation.

---

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" and select the extension folder
5. Navigate to any Ticketmaster event page with a seat map
6. The Seat Finder panel appears automatically on the right side

---

## Privacy

- All seat data processing is local — nothing is sent to external servers
- Recommendation engine history stored in IndexedDB, never transmitted
- Journal entries stored in chrome.storage.local, scoped to user account
- OpenAI API key stored locally, used only for venue accessibility extraction
- No analytics, tracking, or telemetry
- Permissions scoped to ticketing platform domains only

---

## Academic Context

This extension is a Final Year Project prototype investigating personalised accessibility tools for neurodivergent users in online ticket purchasing. It demonstrates: dynamic seat extraction via DOM scraping, non-parametric preference learning (kNN), multi-criteria decision support (MCDA), AI-powered venue accessibility extraction (RAG), sensory-aware personalisation, WCAG 2.1 AA compliance, and cognitive load reduction through interface simplification.

Key academic references: Sweller's Cognitive Load Theory (declutter mode), Barkley's Executive Function Model (decision progress indicator), BDA font recommendations (typography system), Colour Universal Design guidelines (colour schemes), Robertson and Simmons 2013 on sensory processing in autism (animation freeze, sensory profiles).

---

## License

MIT License — Academic use only