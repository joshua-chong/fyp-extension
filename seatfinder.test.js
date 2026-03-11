/**
 * Seat Finder v7.0 — Comprehensive Unit Test Suite
 * 
 * Tests all pure functions across content.js, background.js, and the kNN engine.
 * Run: npx jest --verbose
 */

const {
  FONT_FAMILIES, COLOUR_SCHEMES, DEFAULT_PREFERENCES, BUILT_IN_PROFILES,
  VIEW_QUALITY_TIERS, MCDA_PRESETS,
  parseRowNumber, parseSeatNumber, computeViewQuality, scoreToTier, tierClass,
  seatContentKey, getFilteredSeats, mergeSeatData, computeDecisionStageFromInteractions,
  robustNormalise, computeSingleMCDAScore,
  kNN,
  normaliseName, lookupMap, htmlToText, extractChildLinks
} = require('../src/testable');

// ══════════════════════════════════════════════════════════════
// TEST FIXTURES
// ══════════════════════════════════════════════════════════════

const MOCK_SEATS = [
  { id: 's1', section: 'Section 102', row: 'A', seatNumber: '1', price: 85, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'standard', qualityScore: 0.8, description: 'Seated' },
  { id: 's2', section: 'Section 102', row: 'B', seatNumber: '5', price: 75, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'standard', qualityScore: 0.7, description: 'Seated' },
  { id: 's3', section: 'Section 218', row: 'K', seatNumber: '12', price: 45, currency: 'GBP', availability: 'available', sellerType: 'resale', type: 'standard', qualityScore: 0.5, description: 'Seated' },
  { id: 's4', section: 'Section 301', row: '25', seatNumber: '8', price: 202, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'vip', qualityScore: 0.9, description: 'VIP' },
  { id: 's5', section: 'Standing', row: '', seatNumber: '', price: 55, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'standing', qualityScore: 0.6, description: 'Standing' },
  { id: 's6', section: 'Section 102', row: 'C', seatNumber: '10', price: 90, currency: 'GBP', availability: 'unavailable', sellerType: 'primary', type: 'standard', qualityScore: 0.8, description: 'Seated' },
  { id: 's7', section: 'Floor', row: '1', seatNumber: '3', price: 150, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'standard', qualityScore: 1.0, description: 'Floor Standing' },
  { id: 's8', section: 'Section 102', row: 'A', seatNumber: '2', price: 85, currency: 'GBP', availability: 'available', sellerType: 'primary', type: 'accessible', qualityScore: 0.8, description: 'Accessible' },
];


// ══════════════════════════════════════════════════════════════
// 1. parseRowNumber
// ══════════════════════════════════════════════════════════════

describe('parseRowNumber', () => {
  test('numeric rows', () => {
    expect(parseRowNumber('1')).toBe(1);
    expect(parseRowNumber('25')).toBe(25);
    expect(parseRowNumber('100')).toBe(100);
  });

  test('single letter rows', () => {
    expect(parseRowNumber('A')).toBe(1);
    expect(parseRowNumber('B')).toBe(2);
    expect(parseRowNumber('Z')).toBe(26);
  });

  test('case insensitive', () => {
    expect(parseRowNumber('a')).toBe(1);
    expect(parseRowNumber('z')).toBe(26);
  });

  test('double letter rows', () => {
    expect(parseRowNumber('AA')).toBe(27);
    expect(parseRowNumber('AB')).toBe(28);
    expect(parseRowNumber('AZ')).toBe(52);
    expect(parseRowNumber('BA')).toBe(53);
  });

  test('whitespace handling', () => {
    expect(parseRowNumber(' A ')).toBe(1);
    expect(parseRowNumber(' 5 ')).toBe(5);
  });

  test('null/empty input', () => {
    expect(parseRowNumber(null)).toBeNull();
    expect(parseRowNumber('')).toBeNull();
    expect(parseRowNumber(undefined)).toBeNull();
  });

  test('invalid input returns null', () => {
    expect(parseRowNumber('ABC')).toBeNull(); // 3+ letters
    expect(parseRowNumber('1A')).toBeNull(); // mixed
  });

  // Note: 'GA' actually returns (7-1)*26 + (1) = 157 since it matches /^[A-Z]{2}$/
  // Correcting the test above:
  test('double letter GA is valid (row 183)', () => {
    expect(parseRowNumber('GA')).toBe(7 * 26 + 1); // G=7, A=1 → 183
  });
});


// ══════════════════════════════════════════════════════════════
// 2. parseSeatNumber
// ══════════════════════════════════════════════════════════════

describe('parseSeatNumber', () => {
  test('simple numbers', () => {
    expect(parseSeatNumber('5')).toBe(5);
    expect(parseSeatNumber('12')).toBe(12);
  });

  test('range format — returns first number', () => {
    expect(parseSeatNumber('1-2')).toBe(1);
    expect(parseSeatNumber('10-12')).toBe(10);
  });

  test('comma format', () => {
    expect(parseSeatNumber('12, 13')).toBe(12);
  });

  test('null/empty input', () => {
    expect(parseSeatNumber(null)).toBeNull();
    expect(parseSeatNumber('')).toBeNull();
    expect(parseSeatNumber(undefined)).toBeNull();
  });

  test('non-numeric returns null', () => {
    expect(parseSeatNumber('GA')).toBeNull();
  });
});


// ══════════════════════════════════════════════════════════════
// 3. computeViewQuality
// ══════════════════════════════════════════════════════════════

describe('computeViewQuality', () => {
  test('floor/pit sections get highest score', () => {
    expect(computeViewQuality('Floor')).toBe(1.0);
    expect(computeViewQuality('Pit')).toBe(1.0);
    expect(computeViewQuality('GA Floor')).toBe(1.0);
  });

  test('VIP/premium sections', () => {
    expect(computeViewQuality('VIP Box')).toBe(0.9);
    expect(computeViewQuality('Premium Suite')).toBe(0.9);
    expect(computeViewQuality('Hospitality')).toBe(0.9);
  });

  test('lower tier (100-level) sections', () => {
    expect(computeViewQuality('Section 102')).toBe(0.8);
    expect(computeViewQuality('Lower 110')).toBe(0.8);
    expect(computeViewQuality('100s')).toBe(0.8);
  });

  test('mid tier (200-level) sections', () => {
    expect(computeViewQuality('Section 218')).toBe(0.6);
    expect(computeViewQuality('Mezzanine')).toBe(0.6);
  });

  test('upper tier (300-level) sections', () => {
    expect(computeViewQuality('Section 301')).toBe(0.4);
    expect(computeViewQuality('Upper Balcony')).toBe(0.4);
  });

  test('nosebleed sections (400+)', () => {
    expect(computeViewQuality('Section 405')).toBe(0.25);
    expect(computeViewQuality('Nosebleed')).toBe(0.25);
  });

  test('numeric fallback', () => {
    expect(computeViewQuality('Zone 120')).toBe(0.8);
    expect(computeViewQuality('Zone 220')).toBe(0.6);
    expect(computeViewQuality('Zone 320')).toBe(0.4);
    expect(computeViewQuality('Zone 420')).toBe(0.25);
  });

  test('null/unknown returns 0.5', () => {
    expect(computeViewQuality(null)).toBe(0.5);
    expect(computeViewQuality('')).toBe(0.5);
    expect(computeViewQuality('Unknown Area')).toBe(0.5);
  });
});


// ══════════════════════════════════════════════════════════════
// 4. scoreToTier
// ══════════════════════════════════════════════════════════════

describe('scoreToTier', () => {
  test('tier boundaries', () => {
    expect(scoreToTier(100)).toBe(1);
    expect(scoreToTier(81)).toBe(1);
    expect(scoreToTier(80)).toBe(2);
    expect(scoreToTier(61)).toBe(2);
    expect(scoreToTier(60)).toBe(3);
    expect(scoreToTier(41)).toBe(3);
    expect(scoreToTier(40)).toBe(4);
    expect(scoreToTier(21)).toBe(4);
    expect(scoreToTier(20)).toBe(5);
    expect(scoreToTier(0)).toBe(5);
  });

  test('tierClass returns correct CSS class', () => {
    expect(tierClass(1)).toBe('tm-a11y-heat-t1');
    expect(tierClass(5)).toBe('tm-a11y-heat-t5');
  });
});


// ══════════════════════════════════════════════════════════════
// 5. seatContentKey
// ══════════════════════════════════════════════════════════════

describe('seatContentKey', () => {
  test('generates consistent keys', () => {
    const key = seatContentKey(MOCK_SEATS[0]);
    expect(key).toBe('Section 102|A|1|85|primary');
  });

  test('different seats produce different keys', () => {
    expect(seatContentKey(MOCK_SEATS[0])).not.toBe(seatContentKey(MOCK_SEATS[1]));
  });

  test('identical properties produce same key', () => {
    const copy = { ...MOCK_SEATS[0] };
    expect(seatContentKey(copy)).toBe(seatContentKey(MOCK_SEATS[0]));
  });
});


// ══════════════════════════════════════════════════════════════
// 6. getFilteredSeats
// ══════════════════════════════════════════════════════════════

describe('getFilteredSeats', () => {
  test('excludes unavailable seats', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES });
    expect(result.every(s => s.availability === 'available')).toBe(true);
    expect(result.length).toBe(7); // s6 is unavailable
  });

  test('filters by section', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sectionFilter: 'Section 102' });
    expect(result.every(s => s.section === 'Section 102')).toBe(true);
    expect(result.length).toBe(3); // s1, s2, s8 (s6 is unavailable)
  });

  test('sorts by price ascending', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sortBy: 'price-asc' });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeGreaterThanOrEqual(result[i - 1].price);
    }
  });

  test('sorts by price descending', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sortBy: 'price-desc' });
    for (let i = 1; i < result.length; i++) {
      expect(result[i].price).toBeLessThanOrEqual(result[i - 1].price);
    }
  });

  test('sorts by section then price', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sortBy: 'section' });
    expect(result[0].section).toBe('Floor'); // 'F' comes first alphabetically
  });

  test('"all" section filter returns all available', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sectionFilter: 'all' });
    expect(result.length).toBe(7);
  });

  test('non-existent section returns empty', () => {
    const result = getFilteredSeats(MOCK_SEATS, { ...DEFAULT_PREFERENCES, sectionFilter: 'Section 999' });
    expect(result.length).toBe(0);
  });
});


// ══════════════════════════════════════════════════════════════
// 7. mergeSeatData
// ══════════════════════════════════════════════════════════════

describe('mergeSeatData', () => {
  test('adds new seats', () => {
    const existing = [MOCK_SEATS[0]];
    const newSeats = [MOCK_SEATS[1]];
    const { seats, added } = mergeSeatData(existing, newSeats);
    expect(added).toBe(1);
    expect(seats.length).toBe(2);
  });

  test('deduplicates by content key', () => {
    const existing = [MOCK_SEATS[0]];
    const duplicate = { ...MOCK_SEATS[0] }; // same content key
    const { seats, added } = mergeSeatData(existing, [duplicate]);
    expect(added).toBe(0);
    expect(seats.length).toBe(1);
  });

  test('handles empty existing array', () => {
    const { seats, added } = mergeSeatData([], MOCK_SEATS.slice(0, 3));
    expect(added).toBe(3);
    expect(seats.length).toBe(3);
  });

  test('handles empty new array', () => {
    const { seats, added } = mergeSeatData(MOCK_SEATS.slice(0, 3), []);
    expect(added).toBe(0);
    expect(seats.length).toBe(3);
  });

  test('preserves order of existing seats', () => {
    const existing = [MOCK_SEATS[0], MOCK_SEATS[1]];
    const { seats } = mergeSeatData(existing, [MOCK_SEATS[2]]);
    expect(seats[0].id).toBe('s1');
    expect(seats[1].id).toBe('s2');
  });
});


// ══════════════════════════════════════════════════════════════
// 8. Decision Stage Computation
// ══════════════════════════════════════════════════════════════

describe('computeDecisionStageFromInteractions', () => {
  test('starts at exploring', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 0, seatsLiked: 0
    })).toBe('exploring');
  });

  test('pinning 1 seat → comparing', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 1, seatsLiked: 0
    })).toBe('comparing');
  });

  test('liking 2 seats → comparing', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 0, seatsLiked: 2
    })).toBe('comparing');
  });

  test('filters + 5 views → comparing', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: true, seatsViewed: 5, seatsPinned: 0, seatsLiked: 0
    })).toBe('comparing');
  });

  test('filters + 4 views still exploring', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: true, seatsViewed: 4, seatsPinned: 0, seatsLiked: 0
    })).toBe('exploring');
  });

  test('pinning 2 seats → deciding', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 2, seatsLiked: 0
    })).toBe('deciding');
  });

  test('1 pin + 2 likes → deciding', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 1, seatsLiked: 2
    })).toBe('deciding');
  });

  test('1 pin + 1 like still comparing', () => {
    expect(computeDecisionStageFromInteractions({
      filtersApplied: false, seatsViewed: 0, seatsPinned: 1, seatsLiked: 1
    })).toBe('comparing');
  });
});


// ══════════════════════════════════════════════════════════════
// 9. robustNormalise (Winsorisation)
// ══════════════════════════════════════════════════════════════

describe('robustNormalise', () => {
  test('basic range', () => {
    const result = robustNormalise([10, 20, 30, 40, 50]);
    expect(result.min).toBeLessThanOrEqual(result.max);
  });

  test('single value', () => {
    const result = robustNormalise([42]);
    expect(result.min).toBe(42);
    expect(result.max).toBe(42);
  });

  test('empty array', () => {
    const result = robustNormalise([]);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
  });

  test('outliers are clamped with sufficient data', () => {
    // With 100 values, 5th and 95th percentiles will exclude true outliers
    const values = [1, ...Array.from({length: 98}, (_, i) => 50 + i), 10000];
    const result = robustNormalise(values);
    expect(result.min).toBeGreaterThan(1);
    expect(result.max).toBeLessThan(10000);
  });
});


// ══════════════════════════════════════════════════════════════
// 10. MCDA Scoring
// ══════════════════════════════════════════════════════════════

describe('computeSingleMCDAScore', () => {
  const balancedWeights = { price: 25, viewQuality: 25, proximity: 25, aisleAccess: 25 };

  test('returns score between 0 and 100', () => {
    const available = MOCK_SEATS.filter(s => s.availability === 'available');
    available.forEach(seat => {
      const result = computeSingleMCDAScore(seat, MOCK_SEATS, balancedWeights);
      expect(result).not.toBeNull();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  test('subscores are all 0-100', () => {
    const result = computeSingleMCDAScore(MOCK_SEATS[0], MOCK_SEATS, balancedWeights);
    expect(result.subscores.price).toBeGreaterThanOrEqual(0);
    expect(result.subscores.price).toBeLessThanOrEqual(100);
    expect(result.subscores.viewQuality).toBeGreaterThanOrEqual(0);
    expect(result.subscores.viewQuality).toBeLessThanOrEqual(100);
    expect(result.subscores.proximity).toBeGreaterThanOrEqual(0);
    expect(result.subscores.proximity).toBeLessThanOrEqual(100);
    expect(result.subscores.aisleAccess).toBeGreaterThanOrEqual(0);
    expect(result.subscores.aisleAccess).toBeLessThanOrEqual(100);
  });

  test('cheapest seat gets highest price subscore', () => {
    const available = MOCK_SEATS.filter(s => s.availability === 'available');
    const cheapest = available.reduce((a, b) => a.price < b.price ? a : b);
    const result = computeSingleMCDAScore(cheapest, MOCK_SEATS, balancedWeights);
    expect(result.subscores.price).toBeGreaterThanOrEqual(80);
  });

  test('price-heavy weights favour cheap seats', () => {
    const priceWeights = { price: 100, viewQuality: 0, proximity: 0, aisleAccess: 0 };
    const cheap = computeSingleMCDAScore(MOCK_SEATS[2], MOCK_SEATS, priceWeights); // £45
    const expensive = computeSingleMCDAScore(MOCK_SEATS[3], MOCK_SEATS, priceWeights); // £202
    expect(cheap.score).toBeGreaterThan(expensive.score);
  });

  test('returns null for empty seat list', () => {
    const result = computeSingleMCDAScore(MOCK_SEATS[0], [], balancedWeights);
    expect(result).toBeNull();
  });

  test('all-same-price gives everyone score 100 for price', () => {
    const samePrice = [
      { ...MOCK_SEATS[0], price: 50 },
      { ...MOCK_SEATS[1], price: 50 },
    ];
    const result = computeSingleMCDAScore(samePrice[0], samePrice, balancedWeights);
    expect(result.subscores.price).toBe(100);
  });

  test('seat 1 gets highest aisle score', () => {
    const result = computeSingleMCDAScore(MOCK_SEATS[0], MOCK_SEATS, balancedWeights); // seatNumber '1'
    expect(result.subscores.aisleAccess).toBeGreaterThanOrEqual(80);
  });

  test('front row gets highest proximity score', () => {
    const result = computeSingleMCDAScore(MOCK_SEATS[6], MOCK_SEATS, balancedWeights); // row '1'
    expect(result.subscores.proximity).toBe(100);
  });
});


// ══════════════════════════════════════════════════════════════
// 11. kNN Engine — Feature Extraction
// ══════════════════════════════════════════════════════════════

describe('kNN._extractFeatures', () => {
  test('returns 7-dimensional vector', () => {
    const features = kNN._extractFeatures(MOCK_SEATS[0]);
    expect(features).toHaveLength(7);
  });

  test('price is first element', () => {
    const features = kNN._extractFeatures(MOCK_SEATS[0]);
    expect(features[0]).toBe(85);
  });

  test('row number is parsed', () => {
    const features = kNN._extractFeatures(MOCK_SEATS[0]); // row 'A'
    expect(features[1]).toBe(1);
  });

  test('resale flag set correctly', () => {
    const primary = kNN._extractFeatures(MOCK_SEATS[0]);
    const resale = kNN._extractFeatures(MOCK_SEATS[2]);
    expect(primary[3]).toBe(0);
    expect(resale[3]).toBe(1);
  });

  test('VIP flag set correctly', () => {
    const standard = kNN._extractFeatures(MOCK_SEATS[0]);
    const vip = kNN._extractFeatures(MOCK_SEATS[3]);
    expect(standard[4]).toBe(0);
    expect(vip[4]).toBe(1);
  });

  test('accessible flag set correctly', () => {
    const standard = kNN._extractFeatures(MOCK_SEATS[0]);
    const accessible = kNN._extractFeatures(MOCK_SEATS[7]);
    expect(standard[6]).toBe(0);
    expect(accessible[6]).toBe(1);
  });

  test('missing row defaults to 15', () => {
    const standing = kNN._extractFeatures(MOCK_SEATS[4]); // row ''
    expect(standing[1]).toBe(15);
  });
});


// ══════════════════════════════════════════════════════════════
// 12. kNN Engine — Section Hashing
// ══════════════════════════════════════════════════════════════

describe('kNN._hashSection', () => {
  test('returns number 0-999', () => {
    const hash = kNN._hashSection('Section 102');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(1000);
  });

  test('same section always same hash', () => {
    const h1 = kNN._hashSection('Section 102');
    const h2 = kNN._hashSection('Section 102');
    expect(h1).toBe(h2);
  });

  test('different sections usually different hash', () => {
    const h1 = kNN._hashSection('Section 102');
    const h2 = kNN._hashSection('Section 301');
    expect(h1).not.toBe(h2);
  });

  test('null returns 0', () => {
    expect(kNN._hashSection(null)).toBe(0);
    expect(kNN._hashSection('')).toBe(0);
  });

  test('ignores case and special chars', () => {
    const h1 = kNN._hashSection('Section 102');
    const h2 = kNN._hashSection('SECTION 102');
    expect(h1).toBe(h2);
  });
});


// ══════════════════════════════════════════════════════════════
// 13. kNN Engine — Normalisation
// ══════════════════════════════════════════════════════════════

describe('kNN._computeFeatureStats', () => {
  test('computes min/max correctly', () => {
    const vectors = [[10, 0, 500], [20, 1, 600], [30, 0, 700]];
    const stats = kNN._computeFeatureStats(vectors);
    expect(stats.mins).toEqual([10, 0, 500]);
    expect(stats.maxs).toEqual([30, 1, 700]);
    expect(stats.dims).toBe(3);
  });

  test('empty array returns null', () => {
    expect(kNN._computeFeatureStats([])).toBeNull();
  });
});

describe('kNN._normalise', () => {
  test('normalises to 0-1 range', () => {
    const stats = { mins: [0, 0], maxs: [100, 10], dims: 2 };
    const result = kNN._normalise([50, 5], stats);
    expect(result).toEqual([0.5, 0.5]);
  });

  test('min maps to 0, max maps to 1', () => {
    const stats = { mins: [10, 20], maxs: [30, 40], dims: 2 };
    expect(kNN._normalise([10, 20], stats)).toEqual([0, 0]);
    expect(kNN._normalise([30, 40], stats)).toEqual([1, 1]);
  });

  test('constant feature maps to 0.5', () => {
    const stats = { mins: [5, 5], maxs: [5, 5], dims: 2 };
    expect(kNN._normalise([5, 5], stats)).toEqual([0.5, 0.5]);
  });

  test('null stats returns original', () => {
    expect(kNN._normalise([1, 2, 3], null)).toEqual([1, 2, 3]);
  });
});


// ══════════════════════════════════════════════════════════════
// 14. kNN Engine — Distance & Scoring
// ══════════════════════════════════════════════════════════════

describe('kNN._weightedDistance', () => {
  test('identical vectors have zero distance', () => {
    expect(kNN._weightedDistance([1, 2, 3], [1, 2, 3], [1, 1, 1])).toBe(0);
  });

  test('distance is symmetric', () => {
    const w = [1, 1, 1];
    const d1 = kNN._weightedDistance([1, 0, 0], [0, 1, 0], w);
    const d2 = kNN._weightedDistance([0, 1, 0], [1, 0, 0], w);
    expect(d1).toBeCloseTo(d2);
  });

  test('higher weight amplifies dimension', () => {
    const a = [0, 0];
    const b = [1, 1];
    const d1 = kNN._weightedDistance(a, b, [10, 1]); // weight dim 0
    const d2 = kNN._weightedDistance(a, b, [1, 10]); // weight dim 1
    // Both should be different from equal weights
    const d3 = kNN._weightedDistance(a, b, [1, 1]);
    expect(d1).not.toBeCloseTo(d3);
  });
});

describe('kNN._knnScore', () => {
  const mockPositive = [
    [0.2, 0.3, 0.5, 0, 0, 0, 0],
    [0.25, 0.35, 0.5, 0, 0, 0, 0],
    [0.3, 0.4, 0.5, 0, 0, 0, 0],
  ];
  const stats = { mins: [0, 0, 0, 0, 0, 0, 0], maxs: [1, 1, 1, 1, 1, 1, 1], dims: 7 };
  const weights = [1, 1, 1, 0.5, 0.5, 0.5, 0.5];

  test('score is 0-100', () => {
    const result = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive, [], weights, stats);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('identical candidate scores highest', () => {
    const close = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive, [], weights, stats);
    const far = kNN._knnScore([0.9, 0.9, 0.1, 1, 1, 1, 1], mockPositive, [], weights, stats);
    expect(close.score).toBeGreaterThan(far.score);
  });

  test('rejection penalty reduces score', () => {
    const noRejection = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive, [], weights, stats);
    const withRejection = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive,
      [{ vec: [0.25, 0.35, 0.5, 0, 0, 0, 0], reason: 'dismiss' }], weights, stats);
    expect(withRejection.score).toBeLessThan(noRejection.score);
  });

  test('dismiss stronger than scroll_past', () => {
    const dismiss = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive,
      [{ vec: [0.26, 0.36, 0.5, 0, 0, 0, 0], reason: 'dismiss' }], weights, stats);
    const scroll = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive,
      [{ vec: [0.26, 0.36, 0.5, 0, 0, 0, 0], reason: 'scroll_past' }], weights, stats);
    expect(dismiss.rejectionPenalty).toBeGreaterThan(scroll.rejectionPenalty);
  });

  test('far rejection has no penalty', () => {
    const result = kNN._knnScore([0.1, 0.1, 0.1, 0, 0, 0, 0], mockPositive,
      [{ vec: [0.9, 0.9, 0.9, 1, 1, 1, 1], reason: 'dismiss' }], weights, stats);
    expect(result.rejectionPenalty).toBe(0);
  });

  test('penalty capped at 25', () => {
    const manyRejections = Array(20).fill({ vec: [0.25, 0.35, 0.5, 0, 0, 0, 0], reason: 'dismiss' });
    const result = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive, manyRejections, weights, stats);
    expect(result.rejectionPenalty).toBeLessThanOrEqual(25);
  });

  test('k adapts to sample size', () => {
    const result = kNN._knnScore([0.25, 0.35, 0.5, 0, 0, 0, 0], mockPositive, [], weights, stats, 5);
    expect(result.kUsed).toBe(3); // Only 3 positive vectors available
  });
});


// ══════════════════════════════════════════════════════════════
// 15. kNN Engine — Profile-Aware Weights
// ══════════════════════════════════════════════════════════════

describe('kNN._getProfileAwareWeights', () => {
  test('no profile returns base weights', () => {
    const w = kNN._getProfileAwareWeights(null, null);
    expect(w).toEqual([1.0, 1.0, 1.0, 0.5, 0.5, 0.5, 0.5]);
  });

  test('low-stim profile boosts aisle weight', () => {
    const w = kNN._getProfileAwareWeights(BUILT_IN_PROFILES[0], null); // Low Stim
    expect(w[5]).toBeGreaterThan(1.0); // aisle boosted
    expect(w[0]).toBeLessThan(1.0);    // price reduced
  });

  test('budget profile boosts price weight', () => {
    const w = kNN._getProfileAwareWeights(BUILT_IN_PROFILES[2], null); // Budget
    expect(w[0]).toBeGreaterThan(2.0); // price heavily boosted
    expect(w[4]).toBeLessThan(0.5);    // VIP reduced
  });

  test('venue meta with quiet space boosts accessible weight', () => {
    const wWithout = kNN._getProfileAwareWeights(null, null);
    const wWith = kNN._getProfileAwareWeights(null, { quiet_space: 'yes' });
    expect(wWith[6]).toBeGreaterThan(wWithout[6]);
  });

  test('companion seating boosts accessible weight', () => {
    const wWithout = kNN._getProfileAwareWeights(null, null);
    const wWith = kNN._getProfileAwareWeights(null, { companion_seating: 'yes' });
    expect(wWith[6]).toBeGreaterThan(wWithout[6]);
  });

  test('hearing loop boosts section/view weight', () => {
    const wWithout = kNN._getProfileAwareWeights(null, null);
    const wWith = kNN._getProfileAwareWeights(null, { hearing_loop: 'yes' });
    expect(wWith[2]).toBeGreaterThan(wWithout[2]);
  });
});


// ══════════════════════════════════════════════════════════════
// 16. Background.js — normaliseName
// ══════════════════════════════════════════════════════════════

describe('normaliseName', () => {
  test('lowercases', () => {
    expect(normaliseName('The O2')).toBe('the o2');
  });

  test('removes smart quotes', () => {
    expect(normaliseName("shepherd\u2019s bush")).toBe('shepherds bush');
    expect(normaliseName("shepherd's bush")).toBe('shepherds bush');
  });

  test('trims whitespace', () => {
    expect(normaliseName('  co-op live  ')).toBe('co-op live');
  });
});


// ══════════════════════════════════════════════════════════════
// 17. Background.js — lookupMap
// ══════════════════════════════════════════════════════════════

describe('lookupMap', () => {
  const testMap = {
    'the o2': ['https://theo2.co.uk/access'],
    'co-op live': ['https://cooplive.com/access'],
    'ao arena': ['https://ao-arena.com/access'],
  };

  test('exact match', () => {
    expect(lookupMap(testMap, 'The O2')).toEqual(['https://theo2.co.uk/access']);
  });

  test('partial match (venue includes key)', () => {
    expect(lookupMap(testMap, 'The O2, London')).toEqual(['https://theo2.co.uk/access']);
  });

  test('no match returns null', () => {
    expect(lookupMap(testMap, 'Madison Square Garden')).toBeNull();
  });

  test('case insensitive', () => {
    expect(lookupMap(testMap, 'CO-OP LIVE')).toEqual(['https://cooplive.com/access']);
  });
});


// ══════════════════════════════════════════════════════════════
// 18. Background.js — htmlToText
// ══════════════════════════════════════════════════════════════

describe('htmlToText', () => {
  test('strips HTML tags', () => {
    expect(htmlToText('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  test('removes script and style blocks', () => {
    const html = '<p>Visible</p><script>var x = 1;</script><style>body{}</style>';
    const text = htmlToText(html);
    expect(text).not.toContain('var x');
    expect(text).not.toContain('body{}');
    expect(text).toContain('Visible');
  });

  test('removes nav blocks', () => {
    const html = '<nav>Menu items</nav><p>Content</p>';
    expect(htmlToText(html)).not.toContain('Menu items');
  });

  test('decodes HTML entities', () => {
    expect(htmlToText('&amp; &lt; &gt; &quot;')).toBe('& < > "');
  });

  test('respects maxLen parameter', () => {
    const longHtml = '<p>' + 'x'.repeat(20000) + '</p>';
    expect(htmlToText(longHtml, 100).length).toBeLessThanOrEqual(100);
  });

  test('converts br to newline', () => {
    expect(htmlToText('line1<br>line2')).toContain('\n');
  });

  test('collapses whitespace', () => {
    expect(htmlToText('hello     world')).toBe('hello world');
  });
});


// ══════════════════════════════════════════════════════════════
// 19. Background.js — extractChildLinks
// ══════════════════════════════════════════════════════════════

describe('extractChildLinks', () => {
  test('finds accessibility-related links', () => {
    const html = '<a href="/accessibility/parking">Parking</a>';
    const links = extractChildLinks(html, 'https://example.com/accessibility');
    expect(links).toContain('https://example.com/accessibility/parking');
  });

  test('ignores cross-domain links', () => {
    const html = '<a href="https://other.com/accessibility">Other</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links).toHaveLength(0);
  });

  test('ignores mailto/tel/javascript links', () => {
    const html = '<a href="mailto:info@example.com">Email</a><a href="tel:123">Call</a><a href="javascript:void(0)">JS</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links).toHaveLength(0);
  });

  test('finds PDF links', () => {
    const html = '<a href="/docs/access-guide.pdf">Guide</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links).toContain('https://example.com/docs/access-guide.pdf');
  });

  test('deduplicates links', () => {
    const html = '<a href="/accessibility">Link1</a><a href="/accessibility">Link2</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links).toHaveLength(1);
  });

  test('skips self-referencing links', () => {
    const html = '<a href="/accessibility">Self</a>';
    const links = extractChildLinks(html, 'https://example.com/accessibility');
    expect(links).toHaveLength(0);
  });

  test('finds disability-related links', () => {
    const html = '<a href="/disabled-access">Disabled</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links.length).toBeGreaterThan(0);
  });

  test('finds wheelchair-related links', () => {
    const html = '<a href="/wheelchair-info">Wheelchair</a>';
    const links = extractChildLinks(html, 'https://example.com/');
    expect(links.length).toBeGreaterThan(0);
  });
});


// ══════════════════════════════════════════════════════════════
// 20. Configuration Integrity
// ══════════════════════════════════════════════════════════════

describe('Configuration integrity', () => {
  test('all colour schemes have required properties', () => {
    Object.entries(COLOUR_SCHEMES).forEach(([key, scheme]) => {
      expect(scheme).toHaveProperty('label');
      expect(scheme).toHaveProperty('description');
      expect(scheme).toHaveProperty('--tm-a11y-accent');
    });
  });

  test('all font families are valid', () => {
    Object.entries(FONT_FAMILIES).forEach(([key, value]) => {
      if (key !== 'default') {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });
  });

  test('default preferences have all required keys', () => {
    expect(DEFAULT_PREFERENCES).toHaveProperty('focusModeEnabled');
    expect(DEFAULT_PREFERENCES).toHaveProperty('maxPrice');
    expect(DEFAULT_PREFERENCES).toHaveProperty('colourScheme');
    expect(DEFAULT_PREFERENCES).toHaveProperty('fontFamily');
    expect(DEFAULT_PREFERENCES).toHaveProperty('fontSize');
    expect(DEFAULT_PREFERENCES).toHaveProperty('lineSpacing');
    expect(DEFAULT_PREFERENCES).toHaveProperty('mcdaWeights');
    expect(DEFAULT_PREFERENCES).toHaveProperty('mcdaEnabled');
  });

  test('built-in profiles have required structure', () => {
    BUILT_IN_PROFILES.forEach(p => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('builtIn', true);
      expect(p).toHaveProperty('settings');
      expect(p).toHaveProperty('mcdaWeights');
      expect(p.settings).toHaveProperty('colourScheme');
      expect(COLOUR_SCHEMES).toHaveProperty(p.settings.colourScheme);
    });
  });

  test('MCDA presets weights sum to 100', () => {
    Object.values(MCDA_PRESETS).forEach(preset => {
      const sum = preset.price + preset.viewQuality + preset.proximity + preset.aisleAccess;
      expect(sum).toBe(100);
    });
  });

  test('default MCDA weights sum to 100', () => {
    const w = DEFAULT_PREFERENCES.mcdaWeights;
    expect(w.price + w.viewQuality + w.proximity + w.aisleAccess).toBe(100);
  });

  test('all built-in profile MCDA weights sum to 100', () => {
    BUILT_IN_PROFILES.forEach(p => {
      const w = p.mcdaWeights;
      expect(w.price + w.viewQuality + w.proximity + w.aisleAccess).toBe(100);
    });
  });

  test('VIEW_QUALITY_TIERS scores are 0-1', () => {
    VIEW_QUALITY_TIERS.forEach(tier => {
      expect(tier.score).toBeGreaterThanOrEqual(0);
      expect(tier.score).toBeLessThanOrEqual(1);
    });
  });
});
