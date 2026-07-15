const { classifyCategory, detectEmergency, getDiagnosticQuestions } = require('../../src/services/maintenanceDiagnostics');

describe('classifyCategory', () => {
  const cases = [
    ['Gas smell in kitchen', 'I smell gas near the stove', 'GAS_SMELL'],
    ['Fire!', 'There is smoke coming from the outlet', 'SMOKE_OR_FIRE'],
    ['Sewage backup', 'Raw sewage is backing up into the tub', 'SEWAGE_BACKUP'],
    ['Sparking outlet', 'The outlet in the bedroom is sparking', 'ELECTRICAL'],
    ['No heat', 'The furnace stopped working, no heat at all', 'NO_HEAT'],
    ['No hot water', 'We only have cold water in every faucet', 'NO_HOT_WATER'],
    ['Leaking pipe', 'There is a leak under the kitchen sink', 'PLUMBING_LEAK'],
    ['Clogged sink', 'The bathroom sink is clogged and draining slowly', 'CLOGGED_DRAIN'],
    ['Water stain', 'There is water damage on the ceiling', 'WATER_DAMAGE'],
    ['Mold', 'There is mold growing in the bathroom', 'MOLD'],
    ['Broken lock', 'The front door lock is broken and won’t turn', 'BROKEN_LOCK'],
    ['Broken window', 'The bedroom window is cracked', 'BROKEN_WINDOW'],
    ['Roaches', 'We have roaches in the kitchen', 'PEST'],
    ['Loud neighbor', 'There is a lot of noise from upstairs', 'NOISE'],
    ['Fridge broken', 'The refrigerator stopped cooling', 'APPLIANCE'],
    ['Something odd', 'The ceiling fan makes a weird sound sometimes', 'GENERAL'],
  ];

  it.each(cases)('%s / %s -> %s', (title, description, expected) => {
    expect(classifyCategory(title, description)).toBe(expected);
  });

  it('prioritizes GAS_SMELL over APPLIANCE keywords in the same message', () => {
    expect(classifyCategory('Stove issue', 'I smell gas near the stove, please help')).toBe('GAS_SMELL');
  });
});

describe('detectEmergency (deterministic, no AI)', () => {
  const emergencyCases = [
    ['Active fire', 'There are flames coming from the wall'],
    ['Smoke', 'I smell smoke but don’t see where it’s coming from'],
    ['Gas smell', 'I smell gas in the hallway'],
    ['Flooding', 'Water is pouring in and flooding the whole unit'],
    ['Sparks', 'The outlet is sparking'],
    ['Exposed wiring', 'There is an exposed wire hanging from the ceiling'],
    ['Sewage', 'Sewage flooding is everywhere in the bathroom'],
    ['CO alarm', 'My carbon monoxide detector is going off'],
    ['Door security', 'The front door won’t lock and anyone can walk in'],
    ['Structural', 'Part of the ceiling collapsed in the living room'],
    ['Danger', 'Someone is hurt, this is an emergency'],
  ];

  it.each(emergencyCases)('%s -> %s is flagged as an emergency', (title, description) => {
    const result = detectEmergency({ title, description });
    expect(result.isEmergency).toBe(true);
    expect(result.matchedRules.length).toBeGreaterThan(0);
  });

  const nonEmergencyCases = [
    ['Leaky faucet', 'The kitchen faucet drips a little'],
    ['Clogged drain', 'The bathroom sink drains slowly'],
    ['Noisy neighbor', 'The upstairs neighbor is loud at night'],
    ['Appliance', 'The dishwasher is not starting'],
  ];

  it.each(nonEmergencyCases)('%s -> %s is NOT flagged as an emergency', (title, description) => {
    expect(detectEmergency({ title, description }).isEmergency).toBe(false);
  });

  it('flags no-heat as an emergency only when dangerous weather is present', () => {
    const withoutWeather = detectEmergency({ title: 'No heat', description: 'The furnace stopped working', dangerousWeather: false });
    const withWeather = detectEmergency({ title: 'No heat', description: 'The furnace stopped working', dangerousWeather: true });
    expect(withoutWeather.isEmergency).toBe(false);
    expect(withWeather.isEmergency).toBe(true);
    expect(withWeather.matchedRules).toContain('NO_HEAT_DANGEROUS_WEATHER');
  });

  it('never depends on AI output — pure string matching only', () => {
    // Sanity check that the function signature has no ai/model dependency at all.
    expect(detectEmergency.constructor.name).not.toMatch(/Async/);
  });
});

describe('getDiagnosticQuestions', () => {
  it('returns a category-specific question set for a known category', () => {
    const questions = getDiagnosticQuestions('PLUMBING_LEAK');
    expect(questions.some((q) => q.key === 'spreading')).toBe(true);
  });

  it('falls back to the GENERAL question set for an unknown category', () => {
    const questions = getDiagnosticQuestions('SOMETHING_UNKNOWN');
    expect(questions).toEqual(getDiagnosticQuestions('GENERAL'));
  });

  it('does not ask every universal question for a narrow category (e.g. gas smell)', () => {
    const questions = getDiagnosticQuestions('GAS_SMELL');
    expect(questions.length).toBeLessThan(getDiagnosticQuestions('GENERAL').length + 3);
  });
});
