// Deterministic intent classification for inbound tenant SMS, applied BEFORE the AI
// classifier in agentService.
//
// Why this is rules and not a model call:
//   - "hi" and "??" must not cost a model call, and must still be answerable when the
//     AI is down or misconfigured.
//   - URGENT must never depend on a model being reachable, which is the same reason
//     maintenanceDiagnostics.detectEmergency() exists. We reuse those rules rather than
//     keeping a second, drifting copy of them here.
//
// Anything this module cannot place returns null, meaning "no deterministic match — let
// the AI classifier decide". A null is NOT the same as UNKNOWN: UNKNOWN is a decision
// about a message we already failed to resolve once, which needs conversation history,
// so the router (not this pure function) promotes CLARIFICATION_NEEDED to UNKNOWN.

const diagnostics = require('../maintenanceDiagnostics');

const INTENT = {
  GREETING: 'GREETING',
  CLARIFICATION_NEEDED: 'CLARIFICATION_NEEDED',
  MAINTENANCE: 'MAINTENANCE',
  PROPERTY_INFO: 'PROPERTY_INFO',
  HUMAN_REQUEST: 'HUMAN_REQUEST',
  URGENT: 'URGENT',
  UNKNOWN: 'UNKNOWN',
};

// Sent verbatim. As with CONSENT_PROMPT, an exact match on the clarification text is what
// lets us tell "we already asked this tenant to clarify" without another table.
const REPLY = {
  GREETING: 'Hi! This is Farik, your property management assistant. I can help with '
    + 'maintenance, rent, leases, or other property questions. What can I help with?',

  CLARIFICATION: 'Of course. Tell me what you need help with — for example maintenance, '
    + 'rent, your lease, or another property issue.',

  // Deliberately does not say anyone has been called on the tenant's behalf. Telling them
  // to call emergency services themselves is the only safe claim we can make.
  URGENT_ACK: 'Thanks — this has been flagged as urgent and your property manager has been '
    + 'alerted now. If anyone is in danger or this is a life-safety emergency, call 911 '
    + 'yourself right away — we cannot call for you.',

  MAINTENANCE_LOGGED: 'Thanks — I have logged this repair request and your property manager '
    + 'has it. I may text you a couple of quick questions to help get it sorted.',

  // Urgent, but with no active lease there is no unit to file it against and no landlord
  // to route it to. Says exactly that instead of implying anyone was reached.
  URGENT_NO_CONTEXT: 'This sounds urgent. If anyone is in danger or this is a life-safety '
    + 'emergency, call 911 right away. I could not match this number to an active lease, so '
    + 'please contact your property manager directly as well.',

  // Only ever sent after an escalation row actually exists. See escalateWithHoldingText.
  ESCALATION_HOLDING: 'Thanks — we have passed this to your property manager and they will '
    + 'follow up with you directly.',

  // The honest version of the above for when we could NOT record anything: never claim a
  // handoff that did not happen.
  TEMPORARY_FAILURE: 'Sorry — I could not process that just now. Please try again in a few '
    + 'minutes, or reply HELP for options.',

  // A diagnostic answer that was saved but could not be reviewed. Distinct from
  // TEMPORARY_FAILURE because the tenant's reply is safely recorded — asking them to
  // resend would only duplicate it.
  DIAGNOSTIC_DEFERRED: 'Thanks — I have saved your answer. I could not finish reviewing it '
    + 'just now, so this may take a little longer than usual. No need to resend.',

  // Carrier-expected response to the HELP keyword.
  HELP: 'Farik property assistant. Text us about maintenance, rent or your lease and we will '
    + 'help or pass it to your property manager. Reply STOP to opt out. Msg & data rates may apply.',
};

const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

// A greeting only counts when the message is *nothing but* a greeting — "hi my sink is
// leaking" is a maintenance report, not a hello.
const GREETING_ONLY = /^(hi|hii+|hey+|hello+|yo|howdy|hiya|sup|good\s+(morning|afternoon|evening))(\s+(there|farik))?[\s!.,?]*$/i;

// Explicit low-information openers. Matched regardless of length, because "I have a
// question" is longer than the generic short-message fallback allows for.
const CLARIFICATION_PATTERNS = [
  /^[\s?!.]*\?+[\s?!.]*$/,
  /\bwhat['’]?s\s+that\b/i,
  /\bwhat\s+do\s+you\s+mean\b/i,
  /\bcan\s+you\s+help\b/i,
  /\b(i\s+)?(have|got)\s+a\s+question\b/i,
  /^\s*(idk|ok|okay|k|maybe|thanks|thank\s+you|ty|hm+|huh)[\s!.?]*$/i,
];

const HUMAN_REQUEST_PATTERNS = [
  /\b(speak|talk|chat)\s+(to|with)\b/i,
  /\b(call|phone|contact)\s+me\b/i,
  /\breal\s+(person|human)\b/i,
  /\b(a|an)\s+human\b/i,
  /\bsomeone\s+(to\s+)?(call|contact|ring)\b/i,
];

const PROPERTY_INFO_PATTERN =
  /\b(rent|lease|deposit|balance|invoice|payment|pay|owe|owing|due|renew|renewal|move[\s-]?out|notice\s+period)\b/i;

// classifyCategory() matches literal phrases from the intake table, which was written for
// form-filled titles ("heater not working"). People text differently — "the heater isn't
// working", "water coming through the ceiling" — and none of those literals match. These
// patterns cover conversational phrasing without editing the shared intake table that the
// web portal also depends on.
const MAINTENANCE_PATTERNS = [
  /\b(is|are|ai)\s*n['’]?t\s+working\b/i,
  /\b(is|are)\s+not\s+working\b/i,
  /\b(wo|do|does|ca)\s*n['’]?t\s+(work|turn\s+on|start|stop|heat|cool|drain|flush|close|open|lock|shut)\b/i,
  /\bwater\s+(coming|leaking|dripping|pouring|running|seeping)\b/i,
  /\b(coming|leaking|dripping|pouring)\s+(through|from|out\s+of)\b/i,
  /\bno\s+(heat|hot\s+water|power|water|electricity|air|ac)\b/i,
  /\b(broken|broke|cracked|stuck|jammed|clogged|blocked)\b/i,
  /\b(toilet|sink|shower|tub|faucet|drain|heater|furnace|boiler|radiator|air\s+con(ditioner|ditioning)?|fridge|refrigerator|stove|oven|dishwasher|washer|dryer|outlet|breaker|window|roof|ceiling|pipe)\b/i,
];

/** Word count ignoring punctuation — used only for the short-message fallback. */
function wordCount(text) {
  return (text.trim().match(/[\p{L}\p{N}']+/gu) || []).length;
}

/**
 * Deterministic maintenance check, reusing the intake category table so SMS and the web
 * portal agree on what counts as a repair, plus the conversational patterns above.
 *
 * NOISE is excluded on purpose: "my neighbour is loud" is a complaint about a person, and
 * routing it into a repair workflow would both create a meaningless work order and skip
 * the TENANT_COMPLAINT escalation the AI classifier exists to catch.
 */
function isMaintenance(body) {
  const category = diagnostics.classifyCategory(body, body);
  if (category !== 'GENERAL' && category !== 'NOISE') return true;
  return MAINTENANCE_PATTERNS.some((re) => re.test(body));
}

function isUrgent(body) {
  return diagnostics.detectEmergency({ title: body, description: body }).isEmergency;
}

/**
 * @param {string} body raw inbound SMS text
 * @returns {string|null} an INTENT value, or null when nothing matched and the message is
 *   substantive enough to be worth an AI classification.
 */
function classifyIntent(body) {
  const text = (body || '').trim();
  if (!text) return INTENT.CLARIFICATION_NEEDED;

  // Safety first, and ahead of maintenance: an emergency must win over the generic repair
  // path even though both create a request.
  if (isUrgent(text)) return INTENT.URGENT;

  // Ahead of HUMAN_REQUEST so "the heater is dead, can you call me?" still gets a work
  // order — the landlord is notified by the workflow either way.
  if (isMaintenance(text)) return INTENT.MAINTENANCE;

  if (HUMAN_REQUEST_PATTERNS.some((re) => re.test(text))) return INTENT.HUMAN_REQUEST;
  if (PROPERTY_INFO_PATTERN.test(text)) return INTENT.PROPERTY_INFO;
  if (GREETING_ONLY.test(text)) return INTENT.GREETING;
  if (CLARIFICATION_PATTERNS.some((re) => re.test(text))) return INTENT.CLARIFICATION_NEEDED;

  // Nothing matched and there is barely anything to go on — ask rather than guess.
  if (wordCount(text) <= 3) return INTENT.CLARIFICATION_NEEDED;

  return null;
}

function isHelpKeyword(keyword) {
  return HELP_KEYWORDS.has(keyword);
}

module.exports = { INTENT, REPLY, classifyIntent, isHelpKeyword };
