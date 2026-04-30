#!/usr/bin/env node
/**
 * verify-reports.mjs — Deep report file validation for career-ops
 *
 * Complements verify-pipeline.mjs (which only checks that the linked
 * report files exist). This script reads each report's content and
 * validates structure:
 *
 *   - Required header fields are present:
 *       **URL:**         (mandatory per CLAUDE.md rule 10)
 *       **Score:**       (must parse and match the tracker)
 *       **Legitimacy:**  (mandatory per Block G)
 *   - Block A–F sections are present (G is a warning if missing,
 *     since Block G was added in v1.3.0 and older reports lack it).
 *   - Tracker score and report score agree.
 *   - Orphan reports — files in reports/ not referenced from applications.md.
 *
 * Read-only. Safe to run any time.
 *
 * Run: node verify-reports.mjs                (human-readable)
 *      node verify-reports.mjs --json         (machine-readable)
 *      node verify-reports.mjs --orphans-only (skip per-report checks)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const REPORTS_DIR = join(CAREER_OPS, 'reports');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const ORPHANS_ONLY = args.includes('--orphans-only');

const isTTY = process.stdout.isTTY && !JSON_MODE;
const green  = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red    = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const yellow = (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s;
const dim    = (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s;

function parseScore(raw) {
  const s = String(raw || '').replace(/\*\*/g, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? null : n;
}

function extractReportPath(reportField) {
  const m = String(reportField || '').match(/\]\(([^)]+)\)/);
  return m ? m[1] : '';
}

function parseTracker() {
  if (!existsSync(APPS_FILE)) return [];
  const content = readFileSync(APPS_FILE, 'utf-8');
  const entries = [];
  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1]);
    if (isNaN(num)) continue;
    entries.push({
      num,
      company: parts[3],
      role: parts[4],
      score: parts[5].replace(/\*\*/g, '').trim(),
      report_path: extractReportPath(parts[8]),
    });
  }
  return entries;
}

// Required header regexes (case-insensitive, multi-line).
// `Score`, `URL`, and `Legitimacy` are mandatory; `Date`/`Archetype` are optional.
const REQUIRED_HEADERS = {
  url:        /^\*\*(?:URL|Url|Link)\s*:\*\*\s*(.+?)\s*$/im,
  score:      /^\*\*Score\s*:\*\*\s*(.+?)\s*$/im,
  legitimacy: /^\*\*Legitimacy\s*:\*\*\s*(.+?)\s*$/im,
};

// Block markers — language-agnostic (we only require the "## A)" prefix).
const BLOCK_PATTERNS = {
  A: /^##\s*A\)/m,
  B: /^##\s*B\)/m,
  C: /^##\s*C\)/m,
  D: /^##\s*D\)/m,
  E: /^##\s*E\)/m,
  F: /^##\s*F\)/m,
  G: /^##\s*G\)/m,
};

const REQUIRED_BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F'];

function validateReport(entry, content) {
  const errors = [];
  const warnings = [];

  // Header fields
  const urlMatch = content.match(REQUIRED_HEADERS.url);
  if (!urlMatch) {
    errors.push('missing **URL:** header');
  } else if (!/^https?:\/\//i.test(urlMatch[1].trim())) {
    warnings.push(`**URL:** does not look like a URL: "${urlMatch[1].trim().slice(0, 60)}"`);
  }

  const scoreMatch = content.match(REQUIRED_HEADERS.score);
  let reportScore = null;
  if (!scoreMatch) {
    errors.push('missing **Score:** header');
  } else {
    reportScore = parseScore(scoreMatch[1]);
    if (reportScore === null) {
      errors.push(`**Score:** does not parse as X/5: "${scoreMatch[1]}"`);
    }
  }

  if (!REQUIRED_HEADERS.legitimacy.test(content)) {
    errors.push('missing **Legitimacy:** header (Block G)');
  }

  // Score agreement with tracker
  const trackerScore = parseScore(entry.score);
  if (reportScore !== null && trackerScore !== null && reportScore !== trackerScore) {
    warnings.push(`score mismatch: tracker=${trackerScore} report=${reportScore}`);
  }

  // Required blocks
  for (const block of REQUIRED_BLOCKS) {
    if (!BLOCK_PATTERNS[block].test(content)) {
      errors.push(`missing Block ${block} section`);
    }
  }
  if (!BLOCK_PATTERNS.G.test(content)) {
    warnings.push('missing Block G — Posting Legitimacy (recommended since v1.3.0)');
  }

  return { errors, warnings };
}

function listAllReports() {
  if (!existsSync(REPORTS_DIR)) return [];
  return readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => `reports/${f}`);
}

// --- Run ---
const entries = parseTracker();
const allReports = new Set(listAllReports());
const referenced = new Set(entries.map(e => e.report_path).filter(Boolean));

const perReport = [];
let errorCount = 0;
let warningCount = 0;

if (!ORPHANS_ONLY) {
  for (const entry of entries) {
    if (!entry.report_path) continue;
    const fullPath = join(CAREER_OPS, entry.report_path);
    if (!existsSync(fullPath)) {
      // verify-pipeline.mjs already flags missing reports; skip here.
      continue;
    }
    const content = readFileSync(fullPath, 'utf-8');
    const { errors, warnings } = validateReport(entry, content);
    errorCount += errors.length;
    warningCount += warnings.length;
    perReport.push({
      num: entry.num,
      company: entry.company,
      role: entry.role,
      report_path: entry.report_path,
      errors,
      warnings,
    });
  }
}

const orphans = [...allReports].filter(p => !referenced.has(p)).sort();

// --- Output ---
if (JSON_MODE) {
  process.stdout.write(JSON.stringify({
    checked: perReport.length,
    error_count: errorCount,
    warning_count: warningCount,
    orphan_count: orphans.length,
    reports: perReport,
    orphans,
  }, null, 2) + '\n');
  process.exit(errorCount > 0 ? 1 : 0);
}

if (!entries.length && !allReports.size) {
  console.log('\n📋 No applications.md and no reports/ — nothing to verify.\n');
  process.exit(0);
}

console.log(`\n📋 Verifying ${perReport.length} report(s) referenced from applications.md\n`);

let cleanReports = 0;
for (const r of perReport) {
  if (!r.errors.length && !r.warnings.length) {
    cleanReports++;
    continue;
  }
  console.log(`#${r.num} ${r.company} — ${r.role}  ${dim(r.report_path)}`);
  for (const e of r.errors)   console.log(`  ${red('❌')} ${e}`);
  for (const w of r.warnings) console.log(`  ${yellow('⚠️ ')} ${w}`);
  console.log('');
}
if (cleanReports > 0) {
  console.log(`${green('✅')} ${cleanReports} report(s) clean`);
}

if (orphans.length > 0) {
  console.log(`\n${yellow('⚠️ ')} ${orphans.length} orphan report(s) — not referenced in applications.md:`);
  for (const o of orphans) console.log(`   ${dim(o)}`);
} else if (allReports.size > 0) {
  console.log(`${green('✅')} No orphan reports`);
}

console.log('\n' + '='.repeat(50));
console.log(`📊 Reports: ${errorCount} errors, ${warningCount} warnings, ${orphans.length} orphans`);
if (errorCount === 0 && warningCount === 0 && orphans.length === 0) {
  console.log('🟢 All reports validated cleanly!');
} else if (errorCount === 0) {
  console.log('🟡 Reports OK with warnings');
} else {
  console.log('🔴 Reports have errors — fix before relying on them');
}
console.log('');

process.exit(errorCount > 0 ? 1 : 0);
