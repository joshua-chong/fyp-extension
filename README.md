# Ticketmaster Accessibility Helper v2

## Academic MVP — Chrome Extension for Neurodivergent Users

Chrome Extension (Manifest V3) providing accessibility customisation for Ticketmaster seat-map pages. Designed to **reduce cognitive load** for neurodivergent users during ticket booking.

---

## 📁 Folder Structure

```
ticketmaster-a11y-extension/
├── manifest.json          # Chrome Extension manifest (V3)
├── content.js             # MAIN world — API interception, panel, highlighting
├── bridge.js              # ISOLATED world — chrome.storage & popup messaging
├── content.css            # Companion panel & seat highlighting styles
├── popup.html             # Extension popup UI (settings)
├── popup.js               # Popup interaction logic
├── seats.json             # Fallback seat data (for dev/testing)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Core Features

### 1. Dynamic Seat Data Capture (NEW in v2)

The extension intercepts Ticketmaster's own API calls (`fetch` and `XMLHttpRequest`) to capture seat/offer data **for any concert page** you visit. No static JSON required for live use.

**How it works:**
- `content.js` runs in the `MAIN` JavaScript world (same as the page)
- Monkey-patches `fetch()` and `XMLHttpRequest.open/send` to listen for responses from TM's offer/inventory endpoints
- Parses multiple TM response formats into a normalised seat schema
- Falls back to `seats.json` for development/testing

**Supported TM endpoint patterns:**
- `/api/ismds/event/{id}/offers`
- `/api/.*/offers`
- `offeradapter.*/offers`
- `inventory.*/seats`

### 2. Companion Side Panel (NEW in v2)

A collapsible panel injected onto the Ticketmaster page showing seats in a clean, filterable format.

**Panel features:**
- **Price slider** — filter seats by maximum budget
- **Section filter** — dropdown of all detected sections
- **Sort options** — price (asc/desc), section, view quality
- **Colour scheme selector** — switch palettes in-panel
- **Seat cards** — section, row, seat, price, quality score, resale badges
- **Stats bar** — at-a-glance counts (in budget / over budget / total)
- **Click-to-locate** — clicking a seat card scrolls the TM map to that seat

**Cognitive load reduction:**
- Transforms O(n) visual search → O(k) where k = seats matching filters
- Clear budget/over-budget visual separation
- Collapsible to avoid permanent screen estate use

### 3. Colour Scheme Customisation (NEW in v2)

Six preset palettes designed around specific accessibility needs:

| Scheme | Purpose | Key Colours |
|--------|---------|-------------|
| Default | Standard green/grey | 🟢 Green = available, ⚫ Grey = filtered |
| High Contrast | Maximum readability | 🟡 Yellow on black |
| Colour Blind (Red-Green) | Deuteranopia / Protanopia safe | 🔵 Blue / 🟠 Orange |
| Colour Blind (Blue-Yellow) | Tritanopia safe | 🔴 Red / 🔵 Cyan |
| Muted / Calm | Reduced sensory stimulation | Soft earth tones |
| Dark Mode | Light-sensitive users | Dark background, muted highlights |

**Implementation:** All colours are CSS custom properties set by JavaScript, meaning the entire panel and seat highlighting respond instantly to scheme changes.

### 4. Focus Mode (Seat Map Highlighting)

| Seat State | Visual Treatment |
|------------|------------------|
| Available + Within Budget | Coloured highlight + glow (scheme-aware) |
| Available + Over Budget | Greyed out (35% opacity) |
| Unavailable | Strongly greyed (15% opacity) |

### 5. Typography Customisation

| Setting | Range | WCAG Reference |
|---------|-------|----------------|
| Font Family | Standard / Accessibility / Serif | General readability |
| Font Size | 12px – 28px | SC 1.4.4 Resize text |
| Line Spacing | 1.5× – 3.0× | SC 1.4.12 Text Spacing |

### 6. Preference Persistence

Preferences saved via `chrome.storage.sync` and loaded automatically.

---

## Architecture

### Two-Script Design

The extension uses two content scripts for clean separation of concerns:

| Script | World | Purpose |
|--------|-------|---------|
| `content.js` | `MAIN` | Intercepts page's `fetch`/`XHR`, builds panel UI, applies styles |
| `bridge.js` | `ISOLATED` | Accesses `chrome.storage` and `chrome.runtime` APIs, relays messages |

Communication between worlds uses `window.postMessage` with source identifiers (`tm-a11y-content` / `tm-a11y-bridge`).

### Data Flow

```
TM Page loads seat map
        ↓
content.js intercepts fetch/XHR responses
        ↓
Parses → normalises → stores in capturedSeats[]
        ↓
Renders companion panel with filtered seat cards
        ↓
User adjusts filters → panel re-renders + focus mode re-applies
        ↓
Preferences saved via bridge.js → chrome.storage.sync
```

---

## Installation (Development)

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this extension folder
5. Navigate to any `ticketmaster.com` or `ticketmaster.co.uk` event page
6. Open the seat map — the extension captures data automatically

---

## Privacy & Constraints

- **Ticketmaster only** — host permissions scoped to TM domains
- **No external data sent** — all processing is local
- **No analytics** — no tracking or telemetry
- **Minimal permissions** — `storage` and `activeTab` only
- **API interception is read-only** — responses are cloned, never modified

---

## Academic Context

This extension is an **MVP prototype** for academic research into accessibility tools for neurodivergent users. It demonstrates:

1. Dynamic data capture via API interception (no scraping)
2. Targeted visual filtering to reduce cognitive load
3. Colour scheme customisation for colour vision deficiencies
4. WCAG-aligned typography customisation
5. Preference persistence as an accessibility feature

**Not intended for production use.**

---

## References

- WCAG 2.1 SC 1.4.12 (Text Spacing)
- WCAG 2.1 SC 1.4.4 (Resize Text)
- WCAG 2.1 SC 1.4.11 (Non-text Contrast)
- Chrome Extension Manifest V3 documentation
- Colour Universal Design (CUD) — colour-blind safe palettes

---

## License

MIT License — Academic use only
