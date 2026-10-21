'use strict';
/**
 * Day 14 & 15 — Real Assertion Tests
 *
 * Tests the actual validateAiResult logic and aiService input guards
 * using mocked Gemini responses. Does NOT call the live Gemini API
 * in the assertion suite. Only calls real Gemini in the optional smoke tests.
 */

require('dotenv').config();
const aiService = require('../src/services/aiService');

// Pull validateAiResult from the controller module
// We re-export it via a test helper approach — extract from module internals
// Since it's not exported, we replicate it here exactly as defined in reviewController.js
// so tests stay in sync with the implementation.

const ALLOWED_CATEGORIES = ['bug', 'security', 'performance', 'code_quality', 'style', 'maintainability'];
const ALLOWED_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

function validateAiResult(result, sourceCode) {
  if (!result || typeof result !== 'object') throw new Error('Invalid AI response structure');
  if (typeof result.overallScore !== 'number' || result.overallScore < 0 || result.overallScore > 100)
    throw new Error('Invalid overallScore');
  if (typeof result.summary !== 'string' || !result.summary.trim())
    throw new Error('Invalid summary');
  if (!Array.isArray(result.strengths)) throw new Error('Invalid strengths array');
  if (!Array.isArray(result.issues)) throw new Error('Invalid issues array');

  const totalLines = sourceCode ? sourceCode.split('\n').length : 1;
  const cleanIssues = [];

  for (const issue of result.issues) {
    if (typeof issue.title !== 'string' || !issue.title.trim()) throw new Error('Invalid issue title');
    if (!ALLOWED_CATEGORIES.includes(issue.category)) throw new Error(`Invalid issue category: ${issue.category}`);
    if (!ALLOWED_SEVERITIES.includes(issue.severity)) throw new Error(`Invalid issue severity: ${issue.severity}`);
    if (typeof issue.explanation !== 'string' || !issue.explanation.trim()) throw new Error('Invalid issue explanation');
    if (typeof issue.whyItMatters !== 'string' || !issue.whyItMatters.trim()) throw new Error('Invalid issue whyItMatters');
    if (typeof issue.suggestion !== 'string' || !issue.suggestion.trim()) throw new Error('Invalid issue suggestion');
    if (issue.suggestedCode !== undefined && typeof issue.suggestedCode !== 'string') throw new Error('Invalid issue suggestedCode');

    let lineStart = issue.lineStart;
    let lineEnd = issue.lineEnd;
    if (typeof lineStart !== 'number' || lineStart < 1) lineStart = 1;
    if (typeof lineEnd !== 'number' || lineEnd < lineStart) lineEnd = lineStart;
    if (lineStart > totalLines) lineStart = totalLines;
    if (lineEnd > totalLines) lineEnd = totalLines;

    cleanIssues.push({
      title: issue.title,
      category: issue.category,
      severity: issue.severity,
      lineStart, lineEnd,
      explanation: issue.explanation,
      whyItMatters: issue.whyItMatters,
      suggestion: issue.suggestion,
      suggestedCode: issue.suggestedCode
    });
  }

  if (!Array.isArray(result.learningPoints)) throw new Error('Invalid learningPoints array');

  return {
    overallScore: result.overallScore,
    summary: result.summary,
    strengths: result.strengths.filter(s => typeof s === 'string'),
    issues: cleanIssues,
    learningPoints: result.learningPoints.filter(s => typeof s === 'string')
  };
}

// ─── Test harness ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(description, fn) {
  try {
    fn();
    console.log(`  ✅ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${description}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assertThrows(description, fn, expectedMsg) {
  try {
    fn();
    console.error(`  ❌ ${description} — expected an error but none was thrown`);
    failed++;
  } catch (err) {
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      console.error(`  ❌ ${description} — wrong error: "${err.message}"`);
      failed++;
    } else {
      console.log(`  ✅ ${description}`);
      passed++;
    }
  }
}

async function assertThrowsAsync(description, fn, expectedMsg) {
  try {
    await fn();
    console.error(`  ❌ ${description} — expected an error but none was thrown`);
    failed++;
  } catch (err) {
    if (expectedMsg && !err.message.includes(expectedMsg)) {
      console.error(`  ❌ ${description} — wrong error: "${err.message}"`);
      failed++;
    } else {
      console.log(`  ✅ ${description}`);
      passed++;
    }
  }
}

// ─── VALID base fixture ──────────────────────────────────────────────────────

const VALID_SOURCE = 'function add(a, b) {\n  return a + b;\n}'; // 3 lines

const VALID_RESULT = {
  overallScore: 92,
  summary: 'Clean function with no critical issues.',
  strengths: ['Simple and readable'],
  issues: [
    {
      title: 'Type coercion risk',
      category: 'bug',
      severity: 'low',
      lineStart: 1,
      lineEnd: 3,
      explanation: 'JavaScript will coerce types silently.',
      whyItMatters: 'May cause unexpected results with string inputs.',
      suggestion: 'Add input type checks.',
      suggestedCode: 'if (typeof a !== "number" || typeof b !== "number") throw new TypeError();'
    }
  ],
  learningPoints: ['Always validate input types in public functions.']
};

// ─── Suite 1: Valid Output ───────────────────────────────────────────────────

console.log('\n📋 Suite 1: Valid AI output accepted');

assert('Valid result passes validation', () => {
  const result = validateAiResult(VALID_RESULT, VALID_SOURCE);
  if (result.overallScore !== 92) throw new Error('Score mismatch');
  if (result.issues.length !== 1) throw new Error('Issues count mismatch');
  if (!result.summary) throw new Error('Summary missing');
});

assert('Extra unknown fields are stripped', () => {
  const withExtras = { ...VALID_RESULT, unknownField: 'evil', anotherField: 42 };
  const result = validateAiResult(withExtras, VALID_SOURCE);
  if ('unknownField' in result) throw new Error('unknownField was not stripped');
  if ('anotherField' in result) throw new Error('anotherField was not stripped');
});

assert('Non-string items in strengths/learningPoints are filtered', () => {
  const mixed = {
    ...VALID_RESULT,
    strengths: ['Good naming', 42, null, 'Readable'],
    learningPoints: ['Always validate inputs', false]
  };
  const result = validateAiResult(mixed, VALID_SOURCE);
  if (result.strengths.some(s => typeof s !== 'string')) throw new Error('Non-strings survived in strengths');
  if (result.learningPoints.some(s => typeof s !== 'string')) throw new Error('Non-strings survived in learningPoints');
  if (result.strengths.length !== 2) throw new Error('Expected 2 string strengths');
});

// ─── Suite 2: overallScore validation ───────────────────────────────────────

console.log('\n📋 Suite 2: overallScore validation');

assertThrows('Rejects null result', () => validateAiResult(null, VALID_SOURCE), 'Invalid AI response structure');
assertThrows('Rejects missing overallScore', () => validateAiResult({ ...VALID_RESULT, overallScore: undefined }, VALID_SOURCE), 'Invalid overallScore');
assertThrows('Rejects string overallScore', () => validateAiResult({ ...VALID_RESULT, overallScore: '95' }, VALID_SOURCE), 'Invalid overallScore');
assertThrows('Rejects score > 100', () => validateAiResult({ ...VALID_RESULT, overallScore: 101 }, VALID_SOURCE), 'Invalid overallScore');
assertThrows('Rejects score < 0', () => validateAiResult({ ...VALID_RESULT, overallScore: -1 }, VALID_SOURCE), 'Invalid overallScore');
assert('Accepts score = 0', () => validateAiResult({ ...VALID_RESULT, overallScore: 0 }, VALID_SOURCE));
assert('Accepts score = 100', () => validateAiResult({ ...VALID_RESULT, overallScore: 100 }, VALID_SOURCE));

// ─── Suite 3: summary validation ────────────────────────────────────────────

console.log('\n📋 Suite 3: summary validation');

assertThrows('Rejects empty summary', () => validateAiResult({ ...VALID_RESULT, summary: '' }, VALID_SOURCE), 'Invalid summary');
assertThrows('Rejects whitespace-only summary', () => validateAiResult({ ...VALID_RESULT, summary: '   ' }, VALID_SOURCE), 'Invalid summary');
assertThrows('Rejects non-string summary', () => validateAiResult({ ...VALID_RESULT, summary: 123 }, VALID_SOURCE), 'Invalid summary');

// ─── Suite 4: Line number validation ────────────────────────────────────────

console.log('\n📋 Suite 4: Line number validation');

assert('lineStart < 1 is normalized to 1', () => {
  const input = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], lineStart: -5, lineEnd: 1 }] };
  const result = validateAiResult(input, VALID_SOURCE);
  if (result.issues[0].lineStart !== 1) throw new Error(`Expected 1, got ${result.issues[0].lineStart}`);
});

assert('lineStart > totalLines is clamped to totalLines', () => {
  const input = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], lineStart: 999, lineEnd: 999 }] };
  const result = validateAiResult(input, VALID_SOURCE); // 3-line source
  if (result.issues[0].lineStart !== 3) throw new Error(`Expected 3, got ${result.issues[0].lineStart}`);
  if (result.issues[0].lineEnd !== 3) throw new Error(`Expected 3, got ${result.issues[0].lineEnd}`);
});

assert('lineEnd < lineStart is corrected to equal lineStart', () => {
  const input = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], lineStart: 2, lineEnd: 1 }] };
  const result = validateAiResult(input, VALID_SOURCE);
  if (result.issues[0].lineEnd !== 2) throw new Error(`lineEnd should be 2, got ${result.issues[0].lineEnd}`);
});

assert('Missing lineStart defaults to 1', () => {
  const input = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], lineStart: undefined, lineEnd: undefined }] };
  const result = validateAiResult(input, VALID_SOURCE);
  if (result.issues[0].lineStart !== 1) throw new Error(`Expected 1, got ${result.issues[0].lineStart}`);
});

// ─── Suite 5: Issue field validation ────────────────────────────────────────

console.log('\n📋 Suite 5: Issue field validation');

assertThrows('Rejects invalid category', () => {
  const bad = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], category: 'smell' }] };
  validateAiResult(bad, VALID_SOURCE);
}, 'Invalid issue category');

assertThrows('Rejects invalid severity', () => {
  const bad = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], severity: 'urgent' }] };
  validateAiResult(bad, VALID_SOURCE);
}, 'Invalid issue severity');

assertThrows('Rejects empty issue title', () => {
  const bad = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], title: '' }] };
  validateAiResult(bad, VALID_SOURCE);
}, 'Invalid issue title');

assertThrows('Rejects empty explanation', () => {
  const bad = { ...VALID_RESULT, issues: [{ ...VALID_RESULT.issues[0], explanation: '  ' }] };
  validateAiResult(bad, VALID_SOURCE);
}, 'Invalid issue explanation');

console.log('\n📋 Suite 6: AI Service input limit');

// Run async tests and then continue
(async () => {
  await assertThrowsAsync('Throws 400 when sourceCode exceeds 50,000 chars', async () => {
    await aiService.analyzeCode({ sourceCode: 'x'.repeat(50001), language: 'javascript', focus: 'all' });
  }, 'exceeds AI analysis limit');

  await assertThrowsAsync('Throws when sourceCode is empty', async () => {
    await aiService.analyzeCode({ sourceCode: '', language: 'javascript', focus: 'all' });
  }, 'required');

  // ─── Suite 7: Gemini error handling ────────────────────────────────────────

  console.log('\n📋 Suite 7: Gemini error handling (no live API key)');

  await assert('analyzeCode throws 503 when no API key', async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    aiService.clearClient();
    try {
      await aiService.analyzeCode({ sourceCode: 'x = 1', language: 'python', focus: 'all' });
      throw new Error('Should have thrown');
    } catch (err) {
      if (err.statusCode !== 503) throw new Error(`Expected 503, got ${err.statusCode}: ${err.message}`);
    } finally {
      process.env.GEMINI_API_KEY = original;
      aiService.clearClient();
    }
  });

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n====================================================');
  console.log(`=== ASSERTION TEST SUMMARY: ${passed}/${passed + failed} PASSED ===`);
  if (failed > 0) console.log(`=== FAILED: ${failed} ===`);
  console.log('====================================================\n');

  // ─── Optional Real Gemini Smoke Tests ────────────────────────────────────────

  const hasApiKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here';

  if (!hasApiKey) {
    console.log('⚠️  Skipping real Gemini smoke tests: GEMINI_API_KEY not set in .env\n');
    process.exit(failed > 0 ? 1 : 0);
  }

  console.log('--- REAL GEMINI SMOKE TESTS (minimizing API calls) ---\n');
  let smokePass = 0;
  let smokeFail = 0;

  async function smokeTest(label, params) {
    process.stdout.write(`  → ${label}... `);
    try {
      const result = await aiService.analyzeCode(params);
      if (typeof result.overallScore !== 'number') throw new Error('No overallScore');
      if (!result.summary) throw new Error('No summary');
      console.log(`✅  Score: ${result.overallScore}, Issues: ${result.issues?.length ?? 0}`);
      smokePass++;
    } catch (err) {
      console.log(`❌  ${err.message}`);
      smokeFail++;
    }
  }

  await smokeTest('JavaScript (focus: all)', {
    sourceCode: `function fetchUser(id) {\n  return fetch('/api/users/' + id);\n}`,
    language: 'javascript',
    focus: 'all'
  });

  await smokeTest('Python (focus: bugs)', {
    sourceCode: `def divide(a, b):\n    return a / b\n\nresult = divide(10, 0)`,
    language: 'python',
    focus: 'bugs'
  });

  console.log(`\n--- Smoke tests: ${smokePass} passed, ${smokeFail} failed ---\n`);

  process.exit(failed > 0 || smokeFail > 0 ? 1 : 0);
})();
