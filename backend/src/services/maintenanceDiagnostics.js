// Deterministic (non-AI) safety and categorization rules for maintenance intake.
// These run BEFORE any AI call — emergency detection must never depend on a model.

const CATEGORIES = [
  'PLUMBING_LEAK', 'CLOGGED_DRAIN', 'NO_HEAT', 'NO_HOT_WATER', 'ELECTRICAL',
  'APPLIANCE', 'BROKEN_LOCK', 'BROKEN_WINDOW', 'PEST', 'MOLD', 'WATER_DAMAGE',
  'NOISE', 'SMOKE_OR_FIRE', 'GAS_SMELL', 'SEWAGE_BACKUP', 'GENERAL',
];

// Ordered — first match wins. More specific/dangerous categories listed first
// so e.g. "gas smell near the stove" classifies as GAS_SMELL, not APPLIANCE.
const CATEGORY_KEYWORDS = [
  ['GAS_SMELL', ['gas smell', 'smell gas', 'gas leak', 'rotten egg smell']],
  ['SMOKE_OR_FIRE', ['fire', 'smoke', 'burning smell', 'flames']],
  ['SEWAGE_BACKUP', ['sewage', 'sewer backup', 'raw sewage']],
  ['ELECTRICAL', ['spark', 'sparking', 'exposed wire', 'shock', 'outlet', 'breaker', 'electrical']],
  ['NO_HEAT', ['no heat', 'heater not working', 'furnace', 'heat is out', 'heating not working']],
  ['NO_HOT_WATER', ['no hot water', 'cold water only', 'water heater']],
  ['PLUMBING_LEAK', ['leak', 'leaking', 'dripping', 'burst pipe', 'pipe burst']],
  ['CLOGGED_DRAIN', ['clogged', 'clog', 'drain is slow', 'backed up drain', 'won’t drain']],
  ['WATER_DAMAGE', ['water damage', 'ceiling stain', 'water stain', 'flooding', 'flooded']],
  ['MOLD', ['mold', 'mildew', 'mould']],
  ['BROKEN_LOCK', ['lock is broken', 'can’t lock', 'broken lock', 'door won’t lock', 'key won’t turn']],
  ['BROKEN_WINDOW', ['broken window', 'window is cracked', 'window won’t close', 'shattered window']],
  ['PEST', ['roach', 'roaches', 'mice', 'mouse', 'rat', 'rats', 'bed bug', 'ants', 'infestation', 'pest']],
  ['NOISE', ['noise', 'loud', 'noisy neighbor', 'banging']],
  ['APPLIANCE', ['fridge', 'refrigerator', 'stove', 'oven', 'dishwasher', 'washer', 'dryer', 'appliance']],
];

// Deterministic, hardcoded — never AI-derived. Any match forces EMERGENCY
// regardless of what the AI triage model concludes.
const EMERGENCY_RULES = [
  { key: 'ACTIVE_FIRE', keywords: ['fire', 'flames', 'on fire'] },
  { key: 'SMOKE_UNKNOWN_SOURCE', keywords: ['smoke', 'smoke alarm', 'smoky smell'] },
  { key: 'GAS_SMELL', keywords: ['gas smell', 'smell gas', 'gas leak', 'rotten egg smell'] },
  { key: 'ACTIVE_MAJOR_FLOODING', keywords: ['flooding', 'water everywhere', 'water pouring', 'major flood'] },
  { key: 'ELECTRICAL_SPARKS', keywords: ['spark', 'sparking', 'sparks'] },
  { key: 'EXPOSED_LIVE_WIRING', keywords: ['exposed wire', 'live wire', 'exposed wiring'] },
  { key: 'SEWAGE_FLOODING', keywords: ['sewage flooding', 'sewage everywhere', 'raw sewage flooding'] },
  { key: 'CO_ALARM', keywords: ['carbon monoxide', 'co alarm', 'co detector'] },
  { key: 'BROKEN_EXTERIOR_DOOR_SECURITY', keywords: ['front door won’t lock', 'door won’t close', 'can’t secure the door', 'exterior door broken'] },
  { key: 'STRUCTURAL_COLLAPSE', keywords: ['ceiling collapsed', 'floor collapsed', 'wall collapsed', 'structural damage', 'caving in'] },
  { key: 'IMMEDIATE_DANGER', keywords: ['someone is hurt', 'in danger', 'emergency', 'help now', 'call 911'] },
];

// No-heat is only an emergency in combination with dangerous weather context
// (the tenant or intake flow must supply this — never inferred from text alone).
function isNoHeatEmergency({ text, dangerousWeather }) {
  return Boolean(dangerousWeather) && /no heat|heat is out|furnace|heater not working/i.test(text);
}

function normalize(text) {
  return (text || '').toLowerCase();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match so short keywords (e.g. "rat") never false-positive
// inside an unrelated longer word (e.g. "refrigerator").
function containsKeyword(text, keyword) {
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i').test(text);
}

function classifyCategory(title, description) {
  const text = normalize(`${title} ${description}`);
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => containsKeyword(text, k))) return category;
  }
  return 'GENERAL';
}

/**
 * Deterministic emergency check. Returns { isEmergency, matchedRules }.
 * Must run before any AI call; AI output can never downgrade an emergency
 * detected here, only add detail.
 */
function detectEmergency({ title, description, dangerousWeather = false }) {
  const text = normalize(`${title} ${description}`);
  const matchedRules = EMERGENCY_RULES.filter((rule) => rule.keywords.some((k) => containsKeyword(text, k))).map((r) => r.key);

  if (isNoHeatEmergency({ text, dangerousWeather })) {
    matchedRules.push('NO_HEAT_DANGEROUS_WEATHER');
  }

  return { isEmergency: matchedRules.length > 0, matchedRules };
}

// Per-category diagnostic follow-up questions. Only the relevant subset is
// ever asked for a given category — never the full universal list.
const DIAGNOSTIC_QUESTIONS = {
  PLUMBING_LEAK: [
    { key: 'active', question: 'Is water actively leaking right now?' },
    { key: 'spreading', question: 'Is the water spreading to other areas?' },
    { key: 'canStop', question: 'Can you safely shut off the water source (e.g. valve under the sink)?' },
    { key: 'photo', question: 'Can you send a photo or short video of the leak?' },
  ],
  CLOGGED_DRAIN: [
    { key: 'which', question: 'Which drain is clogged (sink, tub, toilet)?' },
    { key: 'backingUp', question: 'Is water backing up or overflowing?' },
    { key: 'howLong', question: 'How long has this been happening?' },
  ],
  NO_HEAT: [
    { key: 'howLong', question: 'How long has the heat been out?' },
    { key: 'currentTemp', question: 'How cold is it inside right now?' },
    { key: 'thermostat', question: 'Have you checked the thermostat settings and breaker?' },
  ],
  NO_HOT_WATER: [
    { key: 'howLong', question: 'How long has hot water been unavailable?' },
    { key: 'allFixtures', question: 'Is this happening at every faucet, or just one?' },
  ],
  ELECTRICAL: [
    { key: 'sparksOrSmoke', question: 'Are there any sparks, smoke, or a burning smell?' },
    { key: 'which', question: 'Which outlet, switch, or fixture is affected?' },
    { key: 'canAvoid', question: 'Can you avoid using that outlet/fixture until a vendor arrives?' },
  ],
  APPLIANCE: [
    { key: 'which', question: 'Which appliance is having the issue?' },
    { key: 'symptom', question: 'What exactly is it doing (not turning on, leaking, making noise)?' },
    { key: 'photo', question: 'Can you send a photo of the appliance and any error display?' },
  ],
  BROKEN_LOCK: [
    { key: 'secure', question: 'Is the unit currently secure, or can anyone get in?' },
    { key: 'which', question: 'Which door or lock is affected?' },
  ],
  BROKEN_WINDOW: [
    { key: 'secure', question: 'Is the unit currently secure, or is the window open to the outside?' },
    { key: 'photo', question: 'Can you send a photo of the window?' },
  ],
  PEST: [
    { key: 'which', question: 'What kind of pest have you seen?' },
    { key: 'where', question: 'Where have you seen them (kitchen, bathroom, whole unit)?' },
    { key: 'happenedBefore', question: 'Has this happened before in your unit?' },
  ],
  MOLD: [
    { key: 'where', question: 'Where is the mold, and roughly how large an area?' },
    { key: 'photo', question: 'Can you send a photo?' },
    { key: 'moistureSource', question: 'Is there a leak or moisture source nearby?' },
  ],
  WATER_DAMAGE: [
    { key: 'active', question: 'Is water currently coming in, or is this from a past event?' },
    { key: 'photo', question: 'Can you send a photo of the affected area?' },
  ],
  NOISE: [
    { key: 'source', question: 'Where is the noise coming from?' },
    { key: 'when', question: 'What times of day does it happen?' },
  ],
  SMOKE_OR_FIRE: [
    { key: 'active', question: 'Is there an active fire or visible flames right now?' },
  ],
  GAS_SMELL: [
    { key: 'active', question: 'Do you still smell gas right now?' },
  ],
  SEWAGE_BACKUP: [
    { key: 'active', question: 'Is sewage actively backing up right now?' },
    { key: 'spreading', question: 'Is it spreading beyond one room?' },
  ],
  GENERAL: [
    { key: 'details', question: 'Can you describe exactly what’s happening?' },
    { key: 'when', question: 'When did this start?' },
    { key: 'photo', question: 'Can you send a photo to help us understand the issue?' },
  ],
};

// Always asked in addition to category-specific ones, for anything non-emergency.
const COMMON_FOLLOWUPS = [
  { key: 'availability', question: 'What times work for a vendor to come by?' },
  { key: 'entryPermission', question: 'Is it okay for a vendor to enter if you’re not home?' },
  { key: 'pets', question: 'Do you have any pets a vendor should know about?' },
];

function getDiagnosticQuestions(category) {
  return DIAGNOSTIC_QUESTIONS[category] || DIAGNOSTIC_QUESTIONS.GENERAL;
}

module.exports = {
  CATEGORIES,
  classifyCategory,
  detectEmergency,
  getDiagnosticQuestions,
  COMMON_FOLLOWUPS,
  EMERGENCY_RULES,
};
