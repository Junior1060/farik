const { classifyIntent, INTENT, isHelpKeyword } = require('../../src/services/sms/inboundIntent');

describe('classifyIntent', () => {
  // Each case below is a message a tenant can realistically text in. The point of the
  // deterministic layer is that none of these need the AI to be reachable.
  const cases = [
    ['hi', INTENT.GREETING],
    ['Hello', INTENT.GREETING],
    ['hey', INTENT.GREETING],
    ['Hey there!', INTENT.GREETING],
    ['Good morning', INTENT.GREETING],

    ["What's that?", INTENT.CLARIFICATION_NEEDED],
    ['Can you help me?', INTENT.CLARIFICATION_NEEDED],
    ['I have a question', INTENT.CLARIFICATION_NEEDED],
    ['??', INTENT.CLARIFICATION_NEEDED],
    ['idk', INTENT.CLARIFICATION_NEEDED],

    ['My sink is leaking.', INTENT.MAINTENANCE],
    ["The heater isn't working.", INTENT.MAINTENANCE],
    ['There is water coming through the ceiling.', INTENT.MAINTENANCE],
    ['the toilet is clogged again', INTENT.MAINTENANCE],
    ['No hot water since yesterday', INTENT.MAINTENANCE],

    ['When is my rent due?', INTENT.PROPERTY_INFO],
    ['How much is my rent?', INTENT.PROPERTY_INFO],
    ['When does my lease end?', INTENT.PROPERTY_INFO],

    ['I need to speak to my landlord.', INTENT.HUMAN_REQUEST],
    ['Can the property manager call me?', INTENT.HUMAN_REQUEST],

    ['I smell gas in the kitchen', INTENT.URGENT],
    ['There is a fire in the building', INTENT.URGENT],
    ['the unit is flooding', INTENT.URGENT],
    ['the outlet is sparking', INTENT.URGENT],
  ];

  it.each(cases)('classifies %j as %s', (body, expected) => {
    expect(classifyIntent(body)).toBe(expected);
  });

  it('puts safety ahead of the generic repair path', () => {
    // Both a repair and an emergency — it must not be filed as a routine work order.
    expect(classifyIntent('water is pouring through the ceiling, the unit is flooding')).toBe(INTENT.URGENT);
  });

  it('treats a greeting with a real request as the request, not a hello', () => {
    expect(classifyIntent('hi my sink is leaking')).toBe(INTENT.MAINTENANCE);
    expect(classifyIntent('hello, when is my rent due?')).toBe(INTENT.PROPERTY_INFO);
  });

  it('logs a repair even when the tenant also asks to be called', () => {
    // The landlord is notified by the workflow either way, so the work order is not lost.
    expect(classifyIntent('the heater is broken, can you call me?')).toBe(INTENT.MAINTENANCE);
  });

  it('hands a substantive message it cannot place to the AI rather than guessing', () => {
    expect(classifyIntent('My neighbour has been playing loud music every night this week')).toBeNull();
    expect(classifyIntent('I want to dispute the cleaning fee you charged me last month')).toBeNull();
  });

  it('asks rather than guesses when there is almost nothing to go on', () => {
    expect(classifyIntent('hmm ok sure')).toBe(INTENT.CLARIFICATION_NEEDED);
    expect(classifyIntent('')).toBe(INTENT.CLARIFICATION_NEEDED);
    expect(classifyIntent(null)).toBe(INTENT.CLARIFICATION_NEEDED);
  });

  it('never returns UNKNOWN — that promotion needs conversation history, so it is the router\'s call', () => {
    const everyResult = cases.map(([body]) => classifyIntent(body));
    expect(everyResult).not.toContain(INTENT.UNKNOWN);
  });
});

describe('isHelpKeyword', () => {
  it('recognises the carrier-standard help keywords', () => {
    expect(isHelpKeyword('HELP')).toBe(true);
    expect(isHelpKeyword('INFO')).toBe(true);
    expect(isHelpKeyword('STOP')).toBe(false);
  });
});
