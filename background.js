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
// AI-powered URL discovery (Level 2)
// ═══════════════════════════════════

/**
 * Ask GPT-4o-mini to identify the venue's official website and accessibility page URL.
 * Returns an array of candidate URLs to fetch, or null if unavailable.
 */
async function discoverUrlsWithAI(apiKey, venueName) {
  if (!apiKey) return null;

  const prompt = `You are a venue research assistant. Given a venue name, return its official website URL and the most likely accessibility/disabled access page URL.

RULES:
1. Only return URLs you are confident exist. Do not guess or fabricate URLs.
2. If you don't know the venue, return an empty array.
3. Return ONLY valid JSON — no markdown, no explanation.

Format: {"urls": ["https://...", "https://..."], "domain": "example.com"}

Venue: "${venueName}"`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      console.log('[A11y BG] AI URL discovery failed: HTTP ' + resp.status);
      return null;
    }

    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const jsonStr = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (parsed.urls && Array.isArray(parsed.urls) && parsed.urls.length > 0) {
      console.log('[A11y BG] AI discovered ' + parsed.urls.length + ' URL(s) for "' + venueName + '"');
      return { urls: parsed.urls.slice(0, 5), domain: parsed.domain || null };
    }
  } catch (e) {
    console.log('[A11y BG] AI URL discovery error:', e.message);
  }
  return null;
}

/**
 * Try fetching AI-discovered URLs with child link crawling.
 * Same pattern as the known URL strategy but with AI-provided URLs.
 */
async function fetchFromAIDiscoveredUrls(apiKey, venueName) {
  const discovery = await discoverUrlsWithAI(apiKey, venueName);
  if (!discovery || !discovery.urls.length) return null;

  const allTexts = [];
  let primaryUrl = null;
  const fetchedUrls = new Set();

  // Fetch discovered URLs
  for (const url of discovery.urls) {
    if (fetchedUrls.has(url)) continue;
    fetchedUrls.add(url);
    const result = await tryFetchAny(url);
    if (result) {
      allTexts.push(result.text);
      if (!primaryUrl) primaryUrl = result.url;

      // Crawl child links from HTML pages
      if (result.html) {
        const children = extractChildLinks(result.html, url).slice(0, 3);
        for (const child of children) {
          if (!fetchedUrls.has(child)) {
            fetchedUrls.add(child);
            const childResult = await tryFetchAny(child);
            if (childResult) allTexts.push(childResult.text);
          }
        }
      }
    }
  }

  // If AI gave us a domain but the specific URLs failed, try common paths
  if (allTexts.length === 0 && discovery.domain) {
    const base = 'https://www.' + discovery.domain.replace(/^www\./, '');
    console.log('[A11y BG] AI URLs failed, trying paths on ' + base);
    for (const path of ACCESSIBILITY_PATHS) {
      const result = await tryFetchPage(base + path);
      if (result) {
        allTexts.push(result.text);
        primaryUrl = result.url;
        break;
      }
    }
  }

  if (allTexts.length > 0) {
    const combined = allTexts.join('\n\n--- Next Page ---\n\n').substring(0, 20000);
    console.log('[A11y BG] AI discovery: ' + allTexts.length + ' sources, ' + combined.length + ' chars');
    return { text: combined, url: primaryUrl };
  }

  return null;
}


// ═══════════════════════════════════
// AI venue inference (Level 4)
// ═══════════════════════════════════

/**
 * When all page-fetching strategies fail, ask GPT-4o-mini to infer
 * accessibility features from its training knowledge of the venue.
 * Results are clearly marked as "ai_inference" rather than "ai_extraction".
 */
async function inferWithAI(apiKey, venueName) {
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

  if (!apiKey) return { ...DEFAULT, _error: 'no_api_key', _source: 'none' };

  const prompt = `You are an accessibility information assistant. Based on your training knowledge, what accessibility features does this venue likely have?

VENUE: "${venueName}"

RULES:
1. Use your general knowledge about this specific venue. If you recognise it, provide what you know.
2. If you do NOT recognise this venue, return "not_specified" for ALL features. Do NOT guess based on venue type.
3. Only use "yes" if you are reasonably confident the venue has this feature.
4. Use "likely" if the venue type typically has it but you're not certain for this specific venue.
5. Use "not_specified" if you genuinely don't know.

Return ONLY valid JSON:
{"accessible_parking":"...","accessible_entrance":"...","accessible_seating":"...","companion_seating":"...","hearing_loop":"...","service_animals":"...","accessible_restrooms":"...","quiet_space":"...","confidence":"high|medium|low"}`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) return { ...DEFAULT, _error: 'api_' + resp.status, _source: 'inference' };

    const data = await resp.json();
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    const jsonStr = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    const VALID = ['yes', 'no', 'not_specified', 'likely'];
    const result = {};
    for (const key of Object.keys(DEFAULT)) {
      result[key] = VALID.includes(parsed[key]) ? parsed[key] : 'not_specified';
    }
    result._confidence = parsed.confidence || 'low';
    result._source = 'inference';
    console.log('[A11y BG] AI inference for "' + venueName + '":', JSON.stringify(result));
    return result;
  } catch (e) {
    console.log('[A11y BG] AI inference failed:', e.message);
    return { ...DEFAULT, _error: 'inference_error', _source: 'inference' };
  }
}


// ═══════════════════════════════════
// Improved Google search fallback (Level 3)
// ═══════════════════════════════════

async function improvedGoogleFallback(venueName) {
  // Try multiple query variants for better coverage
  const queries = [
    venueName + ' accessibility information',
    venueName + ' disabled access',
    '"' + venueName + '" accessibility page',
  ];

  for (const queryText of queries) {
    try {
      const query = encodeURIComponent(queryText);
      const searchUrl = 'https://www.google.com/search?q=' + query + '&num=5';
      const resp = await fetch(searchUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Extract accessibility-related URLs
      const urlPattern = /https?:\/\/[^"&\s<>]+(?:access|disab|parking|hearing|wheelchair)[^"&\s<>]*/gi;
      const urlMatches = html.match(urlPattern) || [];
      const candidates = urlMatches.filter(u =>
        !u.includes('google.com') && !u.includes('gstatic.com') &&
        !u.includes('youtube.com') && !u.includes('webcache') &&
        !u.includes('facebook.com') && !u.includes('twitter.com') &&
        !u.includes('instagram.com')
      ).slice(0, 4);

      if (candidates.length === 0) continue;

      console.log('[A11y BG] Google fallback ("' + queryText + '"): ' + candidates.length + ' candidates');

      const allTexts = [];
      let primaryUrl = null;
      for (const url of candidates) {
        const result = await tryFetchAny(url);
        if (result) {
          allTexts.push(result.text);
          if (!primaryUrl) primaryUrl = result.url;
        }
      }

      if (allTexts.length > 0) {
        const combined = allTexts.join('\n\n--- Next Page ---\n\n').substring(0, 20000);
        return { text: combined, url: primaryUrl };
      }
    } catch (e) {
      console.log('[A11y BG] Google fallback query failed:', e.message);
    }
  }
  return null;
}


// ═══════════════════════════════════
// Main orchestrator (4-level fallback)
// ═══════════════════════════════════

/**
 * Fetch all accessibility content for a venue.
 * 4-level fallback chain:
 *   Level 1: Known URLs (pre-mapped, fastest)
 *   Level 2: AI URL discovery (GPT-4o-mini finds the venue's accessibility page)
 *   Level 3: Google search fallback (improved multi-query)
 *   Level 4: AI inference (knowledge-based, clearly labelled)
 * 
 * Levels 1-3 return page text for extraction.
 * Level 4 returns features directly (no page text).
 */
async function fetchAccessibilityPage(venueName, apiKey) {
  const allTexts = [];
  let primaryUrl = null;

  // ── Level 1: Known URLs ──
  const knownUrls = lookupMap(VENUE_ACCESSIBILITY_URLS, venueName);
  if (knownUrls) {
    const urls = Array.isArray(knownUrls) ? knownUrls : [knownUrls];
    console.log('[A11y BG] L1: Fetching ' + urls.length + ' known URL(s)');

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
      console.log('[A11y BG] L1: Crawling ' + toFetch.length + ' child links');
      const childResults = await Promise.all(toFetch.map(u => tryFetchAny(u)));
      for (const r of childResults) {
        if (r) allTexts.push(r.text);
      }
    }

    if (allTexts.length > 0) {
      const combined = allTexts.join('\n\n--- Next Page ---\n\n').substring(0, 20000);
      console.log('[A11y BG] L1 success: ' + allTexts.length + ' sources, ' + combined.length + ' chars');
      return { text: combined, url: primaryUrl, level: 1 };
    }
  }

  // ── Level 1b: Path guessing on known domain ──
  const baseUrl = lookupMap(VENUE_DOMAINS, venueName);
  if (baseUrl) {
    console.log('[A11y BG] L1b: Trying paths on ' + baseUrl);
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
        console.log('[A11y BG] L1b success: path guessing on ' + baseUrl);
        return { text: combined, url: result.url, level: 1 };
      }
    }
  }

  // ── Level 2: AI URL discovery ──
  if (apiKey) {
    console.log('[A11y BG] L2: AI URL discovery for "' + venueName + '"');
    const aiResult = await fetchFromAIDiscoveredUrls(apiKey, venueName);
    if (aiResult) {
      console.log('[A11y BG] L2 success');
      return { ...aiResult, level: 2 };
    }
  }

  // ── Level 3: Google search fallback ──
  console.log('[A11y BG] L3: Google fallback for "' + venueName + '"');
  const googleResult = await improvedGoogleFallback(venueName);
  if (googleResult) {
    console.log('[A11y BG] L3 success');
    return { ...googleResult, level: 3 };
  }

  // ── Level 4: AI inference (no page text — handled in message handler) ──
  console.log('[A11y BG] L1-3 all failed for "' + venueName + '". Will fall back to L4 inference.');
  return null;
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
      const pageResult = await fetchAccessibilityPage(venueName, apiKey);

      let features;
      let dataSource;

      if (pageResult && pageResult.text) {
        // Levels 1-3 succeeded: extract features from page text
        features = await extractWithOpenAI(apiKey, pageResult.text, venueName);
        const levelLabels = { 1: 'ai_extraction', 2: 'ai_discovery', 3: 'google_extraction' };
        dataSource = features._error
          ? ('error_' + features._error)
          : (levelLabels[pageResult.level] || 'ai_extraction');
      } else {
        // All page-fetching failed: try Level 4 AI inference
        console.log('[A11y BG] L4: AI inference for "' + venueName + '"');
        features = await inferWithAI(apiKey, venueName);
        dataSource = features._error ? ('error_' + features._error) : 'ai_inference';
      }

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
        data_source: dataSource,
        data_level: pageResult?.level || 4,
        source_url: pageResult?.url || null,
        last_updated: Date.now(),
        venue_name: venueName,
        _contextText: pageResult?.text || '',
        _contextSources: contextSources,
      };
      if (features._error) meta.error = features._error;
      if (features._confidence) meta.confidence = features._confidence;

      console.log('[A11y BG] Done: "' + venueName + '" (L' + (pageResult?.level || 4) + ' ' + dataSource + ')');
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

console.log('[A11y BG] Service worker v8.0 initialised (4-level fallback)');