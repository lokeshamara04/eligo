const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreResumeWithFallback } = require('./geminiClient');

test('fallback analysis returns structured results without Gemini API key', () => {
  const result = scoreResumeWithFallback(
    'Experienced frontend engineer with React, Node.js, and TypeScript experience.',
    'Senior frontend engineer with React, TypeScript, and Node.js responsibilities.'
  );

  assert.equal(typeof result.ats_score, 'number');
  assert.equal(typeof result.eligible, 'boolean');
  assert.ok(result.matched_keywords.length >= 1);
  assert.ok(result.suggestions.length >= 1);
  assert.ok(result.section_scores.keyword_match >= 0);
});
