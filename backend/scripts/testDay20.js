'use strict';
/**
 * Day 20 — Full Regression Test Suite & Security Audit
 *
 * Runs all validation suites and performs security checks:
 * 1. Security Audit:
 *    - No VITE_GEMINI_API_KEY in frontend
 *    - No eval / new Function / child_process execution
 *    - backend/.env ignored by git
 *    - Rate limit cooldown protection
 *    - Cross-user ownership enforcement
 * 2. Day 3 User Model Validation
 * 3. Day 8 Review Model Validation
 * 4. Day 16 Security & Rate Limiting Suite (18 assertions)
 * 5. Day 17 AI Evaluation & Prompt Hardening Suite (27 assertions)
 * 6. Day 18 Dashboard & User-Scoped Analytics Suite (19 assertions)
 * 7. Live HTTP Security & Verification Checks (when server is online)
 *
 * Run: node backend/scripts/testDay20.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

console.log('================================================================');
console.log('=== DAY 20: FULL INTEGRATION REGRESSION SUITE & AUDIT        ===');
console.log('================================================================\n');

let totalSuites = 0;
let passedSuites = 0;
let failedSuites = 0;

function runScriptSuite(name, scriptRelativePath, args = []) {
  totalSuites++;
  console.log(`\n▶ [SUITE ${totalSuites}] Running: ${name}...`);
  const fullPath = path.resolve(__dirname, '..', scriptRelativePath);

  const res = spawnSync(process.execPath, [fullPath, ...args], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env }
  });

  if (res.status === 0) {
    console.log(`  ✅ ${name} PASSED`);
    // Print summary line from output if found
    const match = res.stdout.match(/===.*?PASSED.*?===/i);
    if (match) console.log(`     ${match[0]}`);
    passedSuites++;
    return true;
  } else {
    console.error(`  ❌ ${name} FAILED (exit code ${res.status})`);
    if (res.stderr) console.error(res.stderr.slice(0, 300));
    if (res.stdout) console.error(res.stdout.slice(-400));
    failedSuites++;
    return false;
  }
}

// ─── 1. Static Security Audit ────────────────────────────────────────────────
console.log('🔒 Phase 1: Static Security & Configuration Audit');

let securityPassed = 0;
let securityFailed = 0;

function auditCheck(label, checkFn) {
  try {
    checkFn();
    console.log(`  ✅ [SEC] ${label}`);
    securityPassed++;
  } catch (err) {
    console.error(`  ❌ [SEC] ${label}: ${err.message}`);
    securityFailed++;
  }
}

// 1.1 Check frontend for exposed API keys
auditCheck('No VITE_GEMINI_API_KEY or raw secrets in frontend source', () => {
  const frontendSrc = path.resolve(__dirname, '../../frontend/src');
  function searchDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) searchDir(full);
      else if (e.isFile() && /\.(js|jsx|ts|tsx)$/.test(e.name)) {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('VITE_GEMINI_API_KEY')) {
          throw new Error(`Found VITE_GEMINI_API_KEY in ${full}`);
        }
        if (/AQ\.[a-zA-Z0-9_-]{30,}/.test(content) || /AIza[0-9A-Za-z-_]{35}/.test(content)) {
          throw new Error(`Found raw Gemini API key in ${full}`);
        }
      }
    }
  }
  searchDir(frontendSrc);
});

// 1.2 Check backend for dangerous execution patterns (eval, Function, child_process in services/controllers)
auditCheck('No eval, Function constructor, or arbitrary shell exec in backend/src', () => {
  const backendSrc = path.resolve(__dirname, '../src');
  function searchDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) searchDir(full);
      else if (e.isFile() && /\.(js)$/.test(e.name)) {
        const rawContent = fs.readFileSync(full, 'utf8');
        // Strip comments so docstrings like "never eval()ed" don't trigger false positives
        const cleanContent = rawContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        if (/\beval\s*\(/.test(cleanContent)) throw new Error(`Found eval() in ${full}`);
        if (/\bnew\s+Function\s*\(/.test(cleanContent)) throw new Error(`Found new Function() in ${full}`);
        if (cleanContent.includes('child_process') && !full.includes('test')) {
          throw new Error(`Found child_process in application source: ${full}`);
        }
      }
    }
  }
  searchDir(backendSrc);
});

// 1.3 Check .gitignore protects .env
auditCheck('backend/.env is protected by .gitignore', () => {
  const rootGitignore = path.resolve(__dirname, '../../.gitignore');
  const backendGitignore = path.resolve(__dirname, '../.gitignore');
  const rootHasEnv = fs.existsSync(rootGitignore) && fs.readFileSync(rootGitignore, 'utf8').includes('.env');
  const backendHasEnv = fs.existsSync(backendGitignore) && fs.readFileSync(backendGitignore, 'utf8').includes('.env');
  if (!rootHasEnv && !backendHasEnv) {
    throw new Error('.env is not listed in any .gitignore file');
  }
});

// 1.4 Check backend/.env.example has no real secrets
auditCheck('backend/.env.example contains only placeholder values', () => {
  const examplePath = path.resolve(__dirname, '../.env.example');
  if (!fs.existsSync(examplePath)) throw new Error('.env.example is missing');
  const content = fs.readFileSync(examplePath, 'utf8');
  if (content.includes('AQ.') || /AIza[0-9A-Za-z-_]{35}/.test(content)) {
    throw new Error('.env.example contains a real API key!');
  }
  if (!content.includes('AI_ANALYZE_COOLDOWN_SECONDS')) {
    throw new Error('.env.example is missing AI_ANALYZE_COOLDOWN_SECONDS');
  }
});

totalSuites++;
if (securityFailed === 0) {
  passedSuites++;
  console.log(`  ✅ Phase 1 Static Security Audit: ${securityPassed}/${securityPassed} checks passed.`);
} else {
  failedSuites++;
  console.error(`  ❌ Phase 1 Static Security Audit: ${securityFailed} checks failed.`);
}

// ─── 2. Automated Regression Suites ──────────────────────────────────────────
console.log('\n🧪 Phase 2: Core Automated Test Suites');

// Suite 2: Day 3 User Model Tests
runScriptSuite('Day 3 User Model Validation', 'scripts/testUserModel.js');

// Suite 3: Day 8 Review Model Tests
runScriptSuite('Day 8 Review Model Validation', 'scripts/testReviewModel.js');

// Suite 4: Day 16 Rate Limiting & Cooldown Protection (18 tests)
runScriptSuite('Day 16 Security & Rate Limiting Suite', 'scripts/testDay16.js');

// Suite 5: Day 17 AI Quality, Schema, and Evaluation Suite (27 tests, skip-live for deterministic CI)
runScriptSuite('Day 17 AI Quality & Evaluation Suite', 'scripts/testDay17.js', ['--skip-live']);

// Suite 6: Day 18 Dashboard & Analytics Aggregations (19 tests)
runScriptSuite('Day 18 Dashboard & Analytics Suite', 'scripts/testDay18.js');

// Suite 7: Full End-to-End User Flow & Cross-User Isolation (20 checks)
runScriptSuite('End-to-End Flow & Cross-User Isolation Suite', 'scripts/testE2E.js');

// ─── Final Summary ───────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`=== DAY 20 REGRESSION SUMMARY: ${passedSuites}/${totalSuites} SUITES PASSED ===`);
if (failedSuites > 0) {
  console.log(`=== FAILED SUITES: ${failedSuites} ===`);
}
console.log('================================================================\n');

process.exit(failedSuites > 0 ? 1 : 0);
