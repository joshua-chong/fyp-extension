/**
 * Seat Finder — Testable Module
 * 
 * Extracts all pure functions and logic from content.js, background.js,
 * and bridge.js into a standalone module that can be unit tested with Jest.
 * 
 * These functions are exact copies of the production code — if a test
 * fails here, the same bug exists in the extension.
 */

// ══════════════════════════════════════════════════════════════
// CONFIGURATION (from content.js)
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

const COLOUR_SCHEMES = {
  'default': { label: 'Default', description: 'Dark theme with green accents', '--tm-a11y-accent': '#3ecf8e' },
  'high-contrast': { label: 'High Contrast', description: 'Maximum readability', '--tm-a11y-accent': '#FFD700' },
  'deuteranopia': { label: 'Colour Blind Safe (Red-Green)', description: 'Blue/orange', '--tm-a11y-accent': '#4dabf7' },
  'tritanopia': { label: 'Colour Blind Safe (Blue-Yellow)', description: 'Red/cyan', '--tm-a11y-accent': '#ff6b6b' },
  'muted': { label: 'Muted / Calm', description: 'Soft earth tones', '--tm-a11y-accent': '#8fbc8f' },
  'dark': { label: 'Dark Mode', description: 'Extra low brightness', '--tm-a11y-accent': '#60a5fa' }
};

const DEFAULT_PREFERENCES = {
  focusModeEnabled: false, maxPrice: 150, fontFamily: 'default',
  fontSize: 16, lineSpacing: 1.5, colourScheme: 'default',
  panelOpen: true, sectionFilter: 'all', sortBy: 'price-asc',
  userId: null, declutterEnabled: false, animationFreezeEnabled: false,
  activeProfileId: null, mcdaEnabled: false,
  mcdaWeights: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 },
  ticketQty: 0
};

const BUILT_IN_PROFILES = [
  {
    id: 'profile_low-stim', name: 'Low Stimulation', builtIn: true,
    description: 'Muted colours, large font, motion freeze, declutter',
    settings: { focusModeEnabled: false, colourScheme: 'muted', fontFamily: 'atkinson', fontSize: 20, lineSpacing: 2.0, declutterEnabled: true, animationFreezeEnabled: true },
    mcdaWeights: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 }
  },
  {
    id: 'profile_high-contrast', name: 'High Contrast Focus', builtIn: true,
    description: 'High contrast scheme, focus mode on, motion freeze',
    settings: { focusModeEnabled: true, colourScheme: 'high-contrast', fontFamily: 'atkinson', fontSize: 18, lineSpacing: 1.8, declutterEnabled: false, animationFreezeEnabled: true },
    mcdaWeights: { price: 30, viewQuality: 35, proximity: 20, aisleAccess: 15 }
  },
  {
    id: 'profile_budget', name: 'Budget Mode', builtIn: true,
    description: 'Default colours, focus mode on',
    settings: { focusModeEnabled: true, colourScheme: 'default', fontFamily: 'default', fontSize: 16, lineSpacing: 1.5, declutterEnabled: false, animationFreezeEnabled: false },
    mcdaWeights: { price: 50, viewQuality: 20, proximity: 15, aisleAccess: 15 }
  }
];

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

const MCDA_PRESETS = {
  balanced: { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25, label: 'Balanced' },
  cheapest: { price: 50, viewQuality: 20, proximity: 15, aisleAccess: 15, label: 'Cheapest' },
  bestView: { price: 15, viewQuality: 50, proximity: 20, aisleAccess: 15, label: 'Best view' },
  closeUp:  { price: 15, viewQuality: 20, proximity: 50, aisleAccess: 15, label: 'Close up' },
  easyExit: { price: 15, viewQuality: 15, proximity: 20, aisleAccess: 50, label: 'Easy exit' }
};


// ══════════════════════════════════════════════════════════════
// PURE FUNCTIONS — CONTENT.JS
// ══════════════════════════════════════════════════════════════

function parseRowNumber(row) {
  if (!row) return null;
  const trimmed = row.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^[A-Z]$/.test(trimmed)) return trimmed.charCodeAt(0) - 64;
  if (/^[A-Z]{2}$/.test(trimmed)) {
    return (trimmed.charCodeAt(0) - 64) * 26 + (trimmed.charCodeAt(1) - 64);
  }
  return null;
}

function parseSeatNumber(seatStr) {
  if (!seatStr) return null;
  const match = seatStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function computeViewQuality(section) {
  if (!section) return 0.5;
  for (const tier of VIEW_QUALITY_TIERS) {
    if (tier.pattern.test(section)) return tier.score;
  }
  const numMatch = section.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num <= 150) return 0.8;
    if (num <= 250) return 0.6;
    if (num <= 350) return 0.4;
    return 0.25;
  }
  return 0.5;
}

function scoreToTier(score) {
  if (score >= 81) return 1;
  if (score >= 61) return 2;
  if (score >= 41) return 3;
  if (score >= 21) return 4;
  return 5;
}

function tierClass(tier) {
  return `tm-a11y-heat-t${tier}`;
}

function seatContentKey(seat) {
  return `${seat.section}|${seat.row}|${seat.seatNumber}|${seat.price}|${seat.sellerType}`;
}

function getFilteredSeats(capturedSeats, preferences) {
  let seats = [...capturedSeats];
  if (preferences.sectionFilter && preferences.sectionFilter !== 'all') {
    seats = seats.filter(s => s.section === preferences.sectionFilter);
  }
  seats = seats.filter(s => s.availability === 'available');
  switch (preferences.sortBy) {
    case 'price-asc': seats.sort((a, b) => a.price - b.price); break;
    case 'price-desc': seats.sort((a, b) => b.price - a.price); break;
    case 'section': seats.sort((a, b) => a.section.localeCompare(b.section) || a.price - b.price); break;
    case 'quality': seats.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0)); break;
  }
  return seats;
}

function mergeSeatData(existing, newSeats) {
  function seatKey(s) { return `${s.section}|${s.row}|${s.seatNumber}|${s.price}|${s.sellerType}`; }
  const seatMap = new Map();
  existing.forEach(s => seatMap.set(seatKey(s), s));
  let added = 0;
  newSeats.forEach(s => {
    const key = seatKey(s);
    if (!seatMap.has(key)) { seatMap.set(key, s); added++; }
  });
  return { seats: Array.from(seatMap.values()), added };
}

/** Decision stage computation */
function computeDecisionStageFromInteractions(interactions) {
  const d = interactions;
  let stage = 'exploring';
  if (d.seatsPinned >= 1 || d.seatsLiked >= 2 || (d.filtersApplied && d.seatsViewed >= 5)) {
    stage = 'comparing';
  }
  if (d.seatsPinned >= 2 || (d.seatsPinned >= 1 && d.seatsLiked >= 2)) {
    stage = 'deciding';
  }
  return stage;
}

/** Robust normalisation (Winsorisation) for MCDA */
function robustNormalise(values, lowerPct = 0.05, upperPct = 0.95) {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lowerIdx = Math.floor(sorted.length * lowerPct);
  const upperIdx = Math.min(sorted.length - 1, Math.ceil(sorted.length * upperPct));
  return { min: sorted[lowerIdx], max: sorted[upperIdx] };
}

/** MCDA composite score for a single seat */
function computeSingleMCDAScore(seat, allSeats, weights) {
  const available = allSeats.filter(s => s.availability === 'available');
  if (available.length === 0) return null;

  const wSum = weights.price + weights.viewQuality + weights.proximity + weights.aisleAccess;
  const w = {
    price: wSum > 0 ? (weights.price / wSum) : 0.25,
    viewQuality: wSum > 0 ? (weights.viewQuality / wSum) : 0.25,
    proximity: wSum > 0 ? (weights.proximity / wSum) : 0.25,
    aisleAccess: wSum > 0 ? (weights.aisleAccess / wSum) : 0.25
  };

  const prices = available.map(s => s.price);
  const priceRange = robustNormalise(prices);
  const rowNums = available.map(s => parseRowNumber(s.row)).filter(r => r !== null);
  const rowRange = robustNormalise(rowNums);

  const sectionMaxSeat = new Map();
  available.forEach(s => {
    const sn = parseSeatNumber(s.seatNumber);
    if (sn !== null) sectionMaxSeat.set(s.section, Math.max(sectionMaxSeat.get(s.section) || 0, sn));
  });

  let priceScore = 0.5;
  if (priceRange.max > priceRange.min) {
    const clamped = Math.max(priceRange.min, Math.min(priceRange.max, seat.price));
    priceScore = 1 - (clamped - priceRange.min) / (priceRange.max - priceRange.min);
  } else { priceScore = 1.0; }

  const viewScore = computeViewQuality(seat.section);
  let proximityScore = 0.5;
  const rowNum = parseRowNumber(seat.row);
  if (rowNum !== null && rowRange.max > rowRange.min) {
    const clamped = Math.max(rowRange.min, Math.min(rowRange.max, rowNum));
    proximityScore = 1 - (clamped - rowRange.min) / (rowRange.max - rowRange.min);
  } else if (rowNum !== null) { proximityScore = 1.0; }

  let aisleScore = 0.5;
  const seatNum = parseSeatNumber(seat.seatNumber);
  if (seatNum !== null) {
    const maxInSection = sectionMaxSeat.get(seat.section) || 20;
    const distFromEdge = Math.min(seatNum - 1, maxInSection - seatNum);
    const maxDist = Math.floor(maxInSection / 2);
    aisleScore = maxDist > 0 ? 1 - (distFromEdge / maxDist) : 1.0;
  }

  const composite = (w.price * priceScore + w.viewQuality * viewScore + w.proximity * proximityScore + w.aisleAccess * aisleScore) * 100;
  return { score: Math.round(Math.max(0, Math.min(100, composite))), subscores: { price: Math.round(priceScore * 100), viewQuality: Math.round(viewScore * 100), proximity: Math.round(proximityScore * 100), aisleAccess: Math.round(aisleScore * 100) } };
}


// ══════════════════════════════════════════════════════════════
// kNN RECOMMENDATION ENGINE (from content.js UserPreferenceEngine)
// ══════════════════════════════════════════════════════════════

const kNN = {
  _sectionHashCache: {},
  _baseWeights: [1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5],

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

  _weightedDistance(vecA, vecB, weights) {
    let sum = 0;
    for (let d = 0; d < vecA.length; d++) {
      const diff = vecA[d] - vecB[d];
      sum += weights[d] * diff * diff;
    }
    return Math.sqrt(sum);
  },

  _getProfileAwareWeights(activeSensoryProfile, venueMeta) {
    const w = [...this._baseWeights];
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
      if (id.includes('budget') || name.includes('budget')) { w[0] *= 2.5; w[4] *= 0.3; }
      if (id.includes('high-contrast') || name.includes('focus')) { w[2] *= 1.5; w[1] *= 1.3; }
    }
    if (venueMeta) {
      if (venueMeta.quiet_space === 'yes') w[6] *= 1.3;
      if (venueMeta.companion_seating === 'yes') w[6] *= 1.2;
      if (venueMeta.hearing_loop === 'yes') w[2] *= 1.1;
    }
    return w;
  },

  _knnScore(candidateFeatures, positiveVectors, rejectionVectors, weights, stats, k = 5) {
    const normCandidate = this._normalise(candidateFeatures, stats);
    const distances = positiveVectors.map((vec, idx) => ({
      idx, dist: this._weightedDistance(normCandidate, vec, weights)
    }));
    distances.sort((a, b) => a.dist - b.dist);
    const kUsed = Math.min(k, distances.length);
    const kNearest = distances.slice(0, kUsed);
    const meanDist = kNearest.reduce((sum, d) => sum + d.dist, 0) / kUsed;
    const similarity = 1 / (1 + meanDist);

    let rejectionPenalty = 0;
    if (rejectionVectors.length > 0) {
      const rejDistances = rejectionVectors.map(rv => this._weightedDistance(normCandidate, rv.vec, weights));
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
    return { score: finalScore, similarity, meanDistance: meanDist, rejectionPenalty: Math.round(rejectionPenalty * 10) / 10, kUsed, nearestIndices: kNearest.map(d => d.idx) };
  }
};


// ══════════════════════════════════════════════════════════════
// BACKGROUND.JS FUNCTIONS
// ══════════════════════════════════════════════════════════════

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


// ══════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════

module.exports = {
  // Config
  FONT_FAMILIES, COLOUR_SCHEMES, DEFAULT_PREFERENCES, BUILT_IN_PROFILES,
  VIEW_QUALITY_TIERS, MCDA_PRESETS,
  // Pure functions — content.js
  parseRowNumber, parseSeatNumber, computeViewQuality, scoreToTier, tierClass,
  seatContentKey, getFilteredSeats, mergeSeatData, computeDecisionStageFromInteractions,
  robustNormalise, computeSingleMCDAScore,
  // kNN engine
  kNN,
  // Background.js functions
  normaliseName, lookupMap, htmlToText, extractChildLinks
};