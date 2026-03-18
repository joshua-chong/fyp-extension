// ══════════════════════════════════════════════════════════════
// SEAT FINDER — BACKGROUND SERVICE WORKER (v6.5.1)
// Handles: venue accessibility page fetching + OpenAI extraction
// Features: multi-page crawl, child-link discovery, PDF parsing
// ══════════════════════════════════════════════════════════════

// -- Known accessibility page URLs (arrays for multi-page venues) --
const VENUE_ACCESSIBILITY_URLS = {
  // === London ===
  'the o2': [
    'https://www.theo2.co.uk/accessibility/the-o2/',
    'https://www.theo2.co.uk/accessibility/booking',
    'https://www.theo2.co.uk/accessibility/getting-to-the-o2-1',
  ],
  'the o2, london': [
    'https://www.theo2.co.uk/accessibility/the-o2/',
    'https://www.theo2.co.uk/accessibility/booking',
    'https://www.theo2.co.uk/accessibility/getting-to-the-o2-1',
  ],
  'o2 arena': [
    'https://www.theo2.co.uk/accessibility/the-o2/',
    'https://www.theo2.co.uk/accessibility/booking',
    'https://www.theo2.co.uk/accessibility/getting-to-the-o2-1',
  ],
  'ovo arena wembley': ['https://www.ovoarena.co.uk/accessibility/'],
  'ovo arena, wembley': ['https://www.ovoarena.co.uk/accessibility/'],
  'wembley arena': ['https://www.ovoarena.co.uk/accessibility/'],
  'eventim apollo': ['https://www.eventimapollo.com/accessibility/'],
  'eventim apollo, london': ['https://www.eventimapollo.com/accessibility/'],
  'hammersmith apollo': ['https://www.eventimapollo.com/accessibility/'],
  'royal albert hall': ['https://www.royalalberthall.com/your-visit/accessibility/'],
  'alexandra palace': ['https://www.alexandrapalace.com/your-visit/accessibility/'],
  'ally pally': ['https://www.alexandrapalace.com/your-visit/accessibility/'],
  'wembley stadium': [
    'https://www.wembleystadium.com/plan-your-visit/disabled-services-and-accessibility/disabled-services',
    'https://www.wembleystadium.com/plan-your-visit/disabled-services-and-accessibility/disabled-access',
    'https://www.accesscard.online/find-a-provider/wembley-stadium/',
  ],
  'wembley stadium, london': [
    'https://www.wembleystadium.com/plan-your-visit/disabled-services-and-accessibility/disabled-services',
    'https://www.wembleystadium.com/plan-your-visit/disabled-services-and-accessibility/disabled-access',
    'https://www.accesscard.online/find-a-provider/wembley-stadium/',
  ],
  'london stadium': ['https://www.london-stadium.com/accessibility'],
  'tottenham hotspur stadium': ['https://www.tottenhamhotspur.com/the-stadium/accessibility/'],
  'o2 academy brixton': ['https://www.academymusicgroup.com/o2academybrixton/accessibility'],
  'o2 shepherd\'s bush empire': ['https://www.academymusicgroup.com/o2shepherdsbushempire/accessibility'],
  'o2 forum kentish town': ['https://www.academymusicgroup.com/o2forumkentishtown/accessibility'],
  'the sse arena, wembley': ['https://www.ovoarena.co.uk/accessibility/'],
  'indigo at the o2': ['https://www.theo2.co.uk/accessibility/the-o2/'],

  // === Manchester ===
  'co-op live': [
    'https://www.cooplive.com/pQ5XAUw/visitor-information/accessibility',
    'https://www.cooplive.com/parking-n8df',
  ],
  'coop live': [
    'https://www.cooplive.com/pQ5XAUw/visitor-information/accessibility',
    'https://www.cooplive.com/parking-n8df',
  ],
  'co-op live, manchester': [
    'https://www.cooplive.com/pQ5XAUw/visitor-information/accessibility',
    'https://www.cooplive.com/parking-n8df',
  ],
  'ao arena': ['https://www.ao-arena.com/plan-your-visit/accessibility', 'https://www.accesscard.online/find-a-provider/ao-arena/'],
  'ao arena, manchester': ['https://www.ao-arena.com/plan-your-visit/accessibility', 'https://www.accesscard.online/find-a-provider/ao-arena/'],
  'manchester arena': ['https://www.ao-arena.com/plan-your-visit/accessibility', 'https://www.accesscard.online/find-a-provider/ao-arena/'],
  'o2 victoria warehouse': ['https://www.academymusicgroup.com/o2victoriawarehouse/accessibility'],
  'o2 apollo manchester': ['https://www.academymusicgroup.com/o2apollomanchester/accessibility'],
  'apollo manchester': ['https://www.academymusicgroup.com/o2apollomanchester/accessibility'],
    'o2 ritz manchester': ['https://www.academymusicgroup.com/o2ritzmanchester/accessibility'],
  'o2 ritz': ['https://www.academymusicgroup.com/o2ritzmanchester/accessibility'],

  // === Scotland ===
  'ovo hydro': ['https://www.ovohydro.com/accessibility/'],
  'ovo hydro, glasgow': ['https://www.ovohydro.com/accessibility/'],
  'sse hydro': ['https://www.ovohydro.com/accessibility/'],
  'the ovo hydro': ['https://www.ovohydro.com/accessibility/'],
  'p&j live': ['https://www.pandjlive.com/accessibility/'],
  'p&j live, aberdeen': ['https://www.pandjlive.com/accessibility/'],
  'usher hall': ['https://www.usherhall.co.uk/accessibility'],
  'sec armadillo': ['https://www.sec.co.uk/accessibility'],
  'o2 academy glasgow': ['https://www.academymusicgroup.com/o2academyglasgow/accessibility'],

  // === Yorkshire ===
  'first direct arena': ['https://www.firstdirectarena.com/accessibility/'],
  'first direct arena, leeds': ['https://www.firstdirectarena.com/accessibility/'],
  'leeds arena': ['https://www.firstdirectarena.com/accessibility/'],
  'utilita arena sheffield': ['https://www.utilitarenasheffield.co.uk/accessibility/'],
  'sheffield arena': ['https://www.utilitarenasheffield.co.uk/accessibility/'],
  'o2 academy leeds': ['https://www.academymusicgroup.com/o2academyleeds/accessibility'],
  'o2 academy sheffield': ['https://www.academymusicgroup.com/o2academysheffield/accessibility'],

  // === Midlands ===
  'utilita arena birmingham': ['https://www.utilitaarenabham.co.uk/accessibility/'],
  'birmingham arena': ['https://www.utilitaarenabham.co.uk/accessibility/'],
  'resorts world arena': ['https://www.resortsworldarena.co.uk/accessibility/'],
  'resorts world arena, birmingham': ['https://www.resortsworldarena.co.uk/accessibility/'],
  'bp pulse live': ['https://www.bppulselive.co.uk/accessibility/'],
  'motorpoint arena nottingham': ['https://www.motorpointarenanottingham.com/accessibility/'],
  'nottingham arena': ['https://www.motorpointarenanottingham.com/accessibility/'],
  'o2 academy birmingham': ['https://www.academymusicgroup.com/o2academybirmingham/accessibility'],
  'o2 institute birmingham': ['https://www.academymusicgroup.com/o2institutebirmingham/accessibility'],
  'rock city': ['https://www.academymusicgroup.com/rockcity/accessibility'],

  // === North East ===
  'utilita arena newcastle': ['https://www.utilitaarena.co.uk/accessibility/'],
  'newcastle arena': ['https://www.utilitaarena.co.uk/accessibility/'],
  'o2 city hall newcastle': ['https://www.academymusicgroup.com/o2cityhallnewcastle/accessibility'],
  'sage gateshead': ['https://sagegateshead.com/your-visit/accessibility/'],
  'o2 academy newcastle': ['https://www.academymusicgroup.com/o2academynewcastle/accessibility'],

  // === North West ===
  'm&s bank arena': ['https://www.mandsbankarena.com/accessibility/'],
  'm&s bank arena, liverpool': ['https://www.mandsbankarena.com/accessibility/'],
  'liverpool arena': ['https://www.mandsbankarena.com/accessibility/'],
  'o2 academy liverpool': ['https://www.academymusicgroup.com/o2academyliverpool/accessibility'],

  // === Wales ===
  'motorpoint arena cardiff': ['https://www.motorpointarenacardiff.co.uk/accessibility/'],
  'cardiff arena': ['https://www.motorpointarenacardiff.co.uk/accessibility/'],
  'cardiff international arena': ['https://www.cardiffcia.co.uk/accessibility/'],
  'principality stadium': ['https://www.principalitystadium.wales/accessibility/'],

  // === South / South West ===
  'brighton centre': ['https://brightoncentre.co.uk/access', 'https://brightoncentre.co.uk/visiting-us/accessible-faqs'],
  'bournemouth international centre': ['https://www.bic.co.uk/accessibility/'],
  'bic': ['https://www.bic.co.uk/accessibility/'],
  'o2 academy bristol': ['https://www.academymusicgroup.com/o2academybristol/accessibility'],

  // === Ireland / NI ===
  '3arena': ['https://www.3arena.ie/accessibility/'],
  '3arena, dublin': ['https://www.3arena.ie/accessibility/'],
  'the 3arena': ['https://www.3arena.ie/accessibility/'],
  'sse arena belfast': ['https://www.ssearenabelfast.com/accessibility/'],
  'odyssey arena': ['https://www.ssearenabelfast.com/accessibility/'],
};

// -- Fallback domain mapping --
const VENUE_DOMAINS = {
  'the o2': 'https://www.theo2.co.uk',
  'co-op live': 'https://www.cooplive.com',
  'ovo arena wembley': 'https://www.ovoarena.co.uk',
  'ovo hydro': 'https://www.ovohydro.com',
  'ao arena': 'https://www.ao-arena.com',
  'first direct arena': 'https://www.firstdirectarena.com',
  'royal albert hall': 'https://www.royalalberthall.com',
  'alexandra palace': 'https://www.alexandrapalace.com',
  'eventim apollo': 'https://www.eventimapollo.com',
  'utilita arena birmingham': 'https://www.utilitaarenabham.co.uk',
  'utilita arena newcastle': 'https://www.utilitaarena.co.uk',
  'utilita arena sheffield': 'https://www.utilitarenasheffield.co.uk',
  'resorts world arena': 'https://www.resortsworldarena.co.uk',
  'motorpoint arena nottingham': 'https://www.motorpointarenanottingham.com',
  'motorpoint arena cardiff': 'https://www.motorpointarenacardiff.co.uk',
  'brighton centre': 'https://brightoncentre.co.uk',
  '3arena': 'https://www.3arena.ie',
  'wembley stadium': 'https://www.wembleystadium.com',
  'm&s bank arena': 'https://www.mandsbankarena.com',
  'bp pulse live': 'https://www.bppulselive.co.uk',
  'london stadium': 'https://www.london-stadium.com',
  'tottenham hotspur stadium': 'https://www.tottenhamhotspur.com',
  'p&j live': 'https://www.pandjlive.com',
  'bournemouth international centre': 'https://www.bic.co.uk',
  'sse arena belfast': 'https://www.ssearenabelfast.com',
  'sage gateshead': 'https://sagegateshead.com',
  'usher hall': 'https://www.usherhall.co.uk',
  'principality stadium': 'https://www.principalitystadium.wales',
  'cardiff international arena': 'https://www.cardiffcia.co.uk',
};

const ACCESSIBILITY_PATHS = [
  '/accessibility', '/accessibility/', '/your-visit/accessibility',
  '/your-visit/accessibility/', '/visit/accessibility',
  '/plan-your-visit/accessibility', '/access',
];

// ═══════════════════════════════════
// Utility functions
// ═══════════════════════════════════

function normaliseName(n) {
  return n.toLowerCase().replace(/[\u2018\u2019\u2032'']/g, '').trim();
}

function lookupMap(map, venueName) {
  const n = normaliseName(venueName);
  if (map[n]) return map[n];
  for (const [key, val] of Object.entries(map)) {
    if (n.includes(key) || key.includes(n)) return val;
  }
  return null;
}

function htmlToText(html, maxLen = 15000) {
  let c = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  c = c.replace(/<br\s*\/?>/gi, '\n')
       .replace(/<\/?(p|div|h[1-6]|li|tr|section|article)[^>]*>/gi, '\n');
  c = c.replace(/<[^>]+>/g, ' ');
  c = c.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'")
       .replace(/&rsquo;|&lsquo;/gi, "'").replace(/&rdquo;|&ldquo;/gi, '"')
       .replace(/&mdash;/gi, '\u2014').replace(/&ndash;/gi, '\u2013').replace(/&#\d+;/gi, '');
  c = c.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return c.substring(0, maxLen);
}

/** Extract same-domain accessibility-related links and PDFs from HTML */
function extractChildLinks(html, baseUrl) {
  const links = [];
  const origin = new URL(baseUrl).origin;
  const hrefPattern = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefPattern.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    try {
      const resolved = new URL(href, baseUrl).href;
      if (!resolved.startsWith(origin)) continue;
      if (resolved === baseUrl || resolved === baseUrl + '/') continue;
      const lower = resolved.toLowerCase();
      const isRelevant = lower.includes('access') || lower.includes('disab') ||
                         lower.includes('parking') || lower.includes('hearing') ||
                         lower.includes('wheelchair') || lower.endsWith('.pdf');
      if (isRelevant) links.push(resolved);
    } catch (e) {}
  }
  return [...new Set(links)];
}

// ═══════════════════════════════════
// Page fetching
// ═══════════════════════════════════

async function tryFetchPage(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await resp.text();
    const text = htmlToText(html);
    if (text.length >= 200) {
      console.log('[A11y BG] Page OK: ' + url + ' (' + text.length + ' chars)');
      return { text, url, html };
    }
  } catch (e) {}
  return null;
}

/** Fetch PDF and extract readable text */
async function tryFetchPdf(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('pdf') && !url.toLowerCase().endsWith('.pdf')) return null;

    const buffer = await resp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const rawText = decoder.decode(bytes);

    // Extract text from PDF streams
    const textChunks = [];
    const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    const tjPattern = /\(([^)]+)\)/g;
    let streamMatch;
    while ((streamMatch = streamPattern.exec(rawText)) !== null) {
      const content = streamMatch[1];
      let tjMatch;
      while ((tjMatch = tjPattern.exec(content)) !== null) {
        const chunk = tjMatch[1]
          .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\');
        if (chunk.length > 1 && /[a-zA-Z]/.test(chunk)) textChunks.push(chunk);
      }
    }
    // Fallback: extract long ASCII sequences
    if (textChunks.length < 10) {
      const asciiPattern = /[A-Za-z][A-Za-z0-9 ,.\-:;'()\/]{20,}/g;
      let m;
      while ((m = asciiPattern.exec(rawText)) !== null) textChunks.push(m[0]);
    }

    const text = textChunks.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 100) {
      console.log('[A11y BG] PDF OK: ' + url + ' (' + text.length + ' chars)');
      return { text: text.substring(0, 10000), url };
    }
  } catch (e) {
    console.log('[A11y BG] PDF failed: ' + url);
  }
  return null;
}

/** Fetch any URL — auto-detects HTML vs PDF */
async function tryFetchAny(url) {
  if (url.toLowerCase().endsWith('.pdf')) return await tryFetchPdf(url);
  const htmlResult = await tryFetchPage(url);
  if (htmlResult) return htmlResult;
  return await tryFetchPdf(url);
}

async function googleSearchFallback(venueName) {
  try {
    const query = encodeURIComponent(venueName + ' venue accessibility information');
    const searchUrl = 'https://www.google.com/search?q=' + query + '&num=5';
    const resp = await fetch(searchUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const urlPattern = /https?:\/\/[^"&\s<>]+accessib[^"&\s<>]*/gi;
    const urlMatches = html.match(urlPattern) || [];
    const candidates = urlMatches.filter(u =>
      !u.includes('google.com') && !u.includes('gstatic.com') &&
      !u.includes('youtube.com') && !u.includes('webcache')
    ).slice(0, 3);
    console.log('[A11y BG] Google fallback: ' + candidates.length + ' candidates');
    for (const url of candidates) {
      const result = await tryFetchAny(url);
      if (result) return result;
    }
  } catch (e) {
    console.log('[A11y BG] Google fallback failed:', e.message);
  }
  return null;
}

// ═══════════════════════════════════
// Main orchestrator
// ═══════════════════════════════════

/**
 * Fetch all accessibility content for a venue.
 * 1. Fetch known URLs in parallel
 * 2. Discover + fetch child links (sub-pages, PDFs) from those pages
 * 3. Fall back to path guessing (with child crawling) or Google
 * 4. Merge all text
 */
async function fetchAccessibilityPage(venueName) {
  const allTexts = [];
  let primaryUrl = null;

  // Strategy 1: Known URLs
  const knownUrls = lookupMap(VENUE_ACCESSIBILITY_URLS, venueName);
  if (knownUrls) {
    const urls = Array.isArray(knownUrls) ? knownUrls : [knownUrls];
    console.log('[A11y BG] Fetching ' + urls.length + ' known URL(s)');

    const results = await Promise.all(urls.map(u => tryFetchAny(u)));
    const fetchedUrls = new Set(urls);

    for (const r of results) {
      if (r) {
        allTexts.push(r.text);
        if (!primaryUrl) primaryUrl = r.url;
      }
    }

    // Discover child links from fetched HTML pages
    const childLinks = [];
    for (const r of results) {
      if (r && r.html) {
        for (const link of extractChildLinks(r.html, r.url)) {
          if (!fetchedUrls.has(link)) {
            childLinks.push(link);
            fetchedUrls.add(link);
          }
        }
      }
    }

    if (childLinks.length > 0) {
      const toFetch = childLinks.slice(0, 4);
      console.log('[A11y BG] Crawling ' + toFetch.length + ' child links');
      const childResults = await Promise.all(toFetch.map(u => tryFetchAny(u)));
      for (const r of childResults) {
        if (r) allTexts.push(r.text);
      }
    }

    if (allTexts.length > 0) {
      const combined = allTexts.join('\n\n--- Next Page ---\n\n').substring(0, 20000);
      console.log('[A11y BG] Total: ' + allTexts.length + ' sources, ' + combined.length + ' chars');
      return { text: combined, url: primaryUrl };
    }
  }

  // Strategy 2: Path guessing with child crawling
  const baseUrl = lookupMap(VENUE_DOMAINS, venueName);
  if (baseUrl) {
    console.log('[A11y BG] Trying paths on ' + baseUrl);
    for (const path of ACCESSIBILITY_PATHS) {
      const url = baseUrl + path;
      const result = await tryFetchPage(url);
      if (result) {
        const texts = [result.text];
        if (result.html) {
          const children = extractChildLinks(result.html, url).slice(0, 3);
          if (children.length > 0) {
            const childResults = await Promise.all(children.map(u => tryFetchAny(u)));
            for (const c of childResults) { if (c) texts.push(c.text); }
          }
        }
        const combined = texts.join('\n\n--- Next Page ---\n\n').substring(0, 20000);
        return { text: combined, url: result.url };
      }
    }
  }

  // Strategy 3: Google search fallback
  console.log('[A11y BG] Google fallback for "' + venueName + '"');
  return await googleSearchFallback(venueName);
}

// ═══════════════════════════════════
// OpenAI extraction
// ═══════════════════════════════════

async function extractWithOpenAI(apiKey, venueText, venueName) {
  const DEFAULT = {
    accessible_parking: 'not_specified',
    accessible_entrance: 'not_specified',
    accessible_seating: 'not_specified',
    companion_seating: 'not_specified',
    hearing_loop: 'not_specified',
    service_animals: 'not_specified',
    accessible_restrooms: 'not_specified',
    quiet_space: 'not_specified',
  };

  if (!apiKey) return { ...DEFAULT, _error: 'no_api_key' };
  if (!venueText || venueText.length < 50) return { ...DEFAULT, _error: 'no_text' };

  const systemPrompt = `You are a strict fact-extraction system analysing venue accessibility pages.

CRITICAL RULES — FOLLOW EXACTLY:
1. Use ONLY the provided text below. NEVER use your training knowledge about the venue.
2. A feature is "yes" ONLY if the text EXPLICITLY describes it being available.
3. If the text does not mention a feature at all → "not_specified". Do NOT guess.
4. If the text says something is NOT available → "no".
5. Do NOT infer across features. "step-free access" = accessible_entrance "yes", but says NOTHING about parking.

FEATURE DEFINITIONS:
- accessible_parking: "blue badge", "accessible parking", "disabled parking" mentioned → "yes"
- accessible_entrance: "step-free", "ramped entrance", "accessible entrance", "wheelchair entrance" → "yes"  
- accessible_seating: "wheelchair spaces", "accessible seating", "wheelchair bays", "accessible platforms" → "yes"
- companion_seating: "companion ticket", "personal assistant ticket", "PA ticket", "carer ticket" → "yes"
- hearing_loop: "hearing loop", "induction loop", "assistive listening", "T-position" → "yes"
- service_animals: "assistance dog", "guide dog", "service animal" welcome/permitted → "yes"
- accessible_restrooms: "accessible toilet", "wheelchair toilet", "changing places", "adapted toilet" → "yes"
- quiet_space: "quiet room", "respite room", "sensory room", "calm room" → "yes"

IMPORTANT: If unsure, ALWAYS choose "not_specified" over "yes". A false positive is worse than a missed feature.
Return ONLY valid JSON, nothing else:
{"accessible_parking":"...","accessible_entrance":"...","accessible_seating":"...","companion_seating":"...","hearing_loop":"...","service_animals":"...","accessible_restrooms":"...","quiet_space":"..."}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Venue: ${venueName}\n\nText from venue website:\n${venueText}` },
        ],
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.log('[A11y BG] OpenAI error ' + resp.status + ':', errBody);
      return { ...DEFAULT, _error: 'api_' + resp.status };
    }

    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const jsonStr = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    const VALID = ['yes', 'no', 'not_specified'];
    const result = {};
    for (const key of Object.keys(DEFAULT)) {
      result[key] = VALID.includes(parsed[key]) ? parsed[key] : 'not_specified';
    }
    console.log('[A11y BG] Extraction:', JSON.stringify(result));
    return result;
  } catch (e) {
    console.log('[A11y BG] OpenAI failed:', e.message);
    return { ...DEFAULT, _error: 'parse_error' };
  }
}

// ═══════════════════════════════════
// Message handler
// ═══════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_VENUE_ACCESSIBILITY') {
    const venueName = message.venueName;
    if (!venueName) { sendResponse({ meta: null }); return true; }
    console.log('[A11y BG] Processing: "' + venueName + '"');

    chrome.storage.sync.get(['openaiApiKey'], async (result) => {
      const apiKey = result.openaiApiKey || '';
      const pageResult = await fetchAccessibilityPage(venueName);
      const features = await extractWithOpenAI(apiKey, pageResult?.text || '', venueName);

      // Store context for chatbot
      const contextSources = [];
      if (pageResult?.url) contextSources.push({ title: venueName + ' Accessibility', url: pageResult.url });

      const meta = {
        accessible_parking:  features.accessible_parking,
        accessible_entrance: features.accessible_entrance,
        accessible_seating:  features.accessible_seating,
        companion_seating:   features.companion_seating,
        hearing_loop:        features.hearing_loop,
        service_animals:     features.service_animals,
        accessible_restrooms: features.accessible_restrooms,
        quiet_space:         features.quiet_space,
        data_source: features._error ? ('error_' + features._error) : (pageResult ? 'ai_extraction' : 'ai_no_page'),
        source_url: pageResult?.url || null,
        last_updated: Date.now(),
        venue_name: venueName,
        _contextText: pageResult?.text || '',
        _contextSources: contextSources,
      };
      if (features._error) meta.error = features._error;

      console.log('[A11y BG] Done: "' + venueName + '" (' + meta.data_source + ')');
      sendResponse({ meta });
    });
    return true;
  }


  // ── Venue RAG Chatbot ──
  if (message.type === "VENUE_CHAT") {
    const { venueName, userMessage, contextText, contextSources } = message;
    if (!venueName || !userMessage) { sendResponse({ error: "missing_params" }); return true; }

    chrome.storage.sync.get(["openaiApiKey"], async (result) => {
      const apiKey = result.openaiApiKey || "";
      if (!apiKey) {
        sendResponse({ error: "no_api_key", answer: "Please add your OpenAI API key in the Tools tab." });
        return;
      }

      const sourceList = (contextSources || []).map((s, i) => "[" + (i+1) + "] " + s.title + " \u2014 " + s.url).join("\n");

      const systemPrompt = "You are a venue accessibility assistant for \"" + venueName + "\".\n\n" +
        "STRICT RULES:\n" +
        "1. Answer ONLY using the CONTEXT below. NEVER use training knowledge.\n" +
        "2. If the answer is NOT in the context, respond with answer: \"Not specified in available sources.\"\n" +
        "3. NEVER guess, infer, or assume facts not in the context.\n" +
        "4. Include citation numbers [1], [2] inline when referencing information.\n" +
        "5. ONLY answer about: this venue, its accessibility, transport to it, nearby accessible facilities.\n" +
        "6. For ANY other topic, respond: \"This chatbot only answers questions about this venue and its accessibility.\"\n" +
        "7. Keep answers concise (2-4 sentences).\n" +
        "8. ALWAYS respond in JSON: {\n" +
        "  \"answer\": \"Text with [1] [2] citations\",\n" +
        "  \"citations\": [{\n" +
        "    \"index\": 1,\n" +
        "    \"title\": \"Page title\",\n" +
        "    \"url\": \"https://...\",\n" +
        "    \"snippet\": \"Brief relevant excerpt\"\n" +
        "  }]\n" +
        "}\n\n" +
        "SOURCES:\n" + sourceList + "\n\n" +
        "CONTEXT:\n" + (contextText || "No venue context available.");

      try {
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            max_tokens: 500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!resp.ok) {
          sendResponse({ error: "api_" + resp.status, answer: "API error (" + resp.status + "). Check your API key." });
          return;
        }

        const data = await resp.json();
        const raw = (data.choices?.[0]?.message?.content || "").trim();
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { parsed = { answer: raw, citations: [] }; }
        sendResponse({ answer: parsed.answer || raw, citations: parsed.citations || [], sources: contextSources || [] });
      } catch (e) {
        sendResponse({ error: "network", answer: "Network error. Please try again." });
      }
    });
    return true;
  }
  if (message.type === 'PING') { sendResponse({ pong: true }); return true; }
});

console.log('[A11y BG] Service worker v6.5.1 initialised');