#!/usr/bin/env node
/**
 * export-tracker.mjs — Export applications.md to CSV / JSON / TSV
 *
 * Pipes the tracker into a format any spreadsheet or BI tool can ingest.
 * With `--enrich`, also pulls URL, Legitimacy, and Archetype out of each
 * linked report file so the exported row is self-contained.
 *
 * Read-only. Safe to run any time.
 *
 * Usage:
 *   node export-tracker.mjs                          # CSV to stdout
 *   node export-tracker.mjs --format json            # JSON array to stdout
 *   node export-tracker.mjs --format tsv             # TSV to stdout
 *   node export-tracker.mjs --output tracker.csv     # write to file
 *   node export-tracker.mjs --enrich                 # add URL/Legitimacy/Archetype
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

// --- CLI args ---
const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const val = args[idx + 1];
  return val !== undefined && !val.startsWith('--') ? val : fallback;
}

const FORMAT = (flagValue('--format', 'csv') || 'csv').toLowerCase();
const OUTPUT_PATH = flagValue('--output', null);
const ENRICH = args.includes('--enrich');

const VALID_FORMATS = new Set(['csv', 'json', 'tsv']);
if (!VALID_FORMATS.has(FORMAT)) {
  console.error(`error: --format must be one of: csv, json, tsv (got "${FORMAT}")`);
  process.exit(2);
}

// --- Status normalization (mirrors verify-pipeline.mjs) ---
const ALIASES = {
  'evaluada': 'evaluated', 'condicional': 'evaluated', 'hold': 'evaluated',
  'evaluar': 'evaluated', 'verificar': 'evaluated',
  'aplicado': 'applied', 'enviada': 'applied', 'aplicada': 'applied',
  'applied': 'applied', 'sent': 'applied',
  'respondido': 'responded',
  'entrevista': 'interview',
  'oferta': 'offer',
  'rechazado': 'rejected', 'rechazada': 'rejected',
  'descartado': 'discarded', 'descartada': 'discarded',
  'cerrada': 'discarded', 'cancelada': 'discarded',
  'no aplicar': 'skip', 'no_aplicar': 'skip', 'monitor': 'skip', 'geo blocker': 'skip',
};

function normalizeStatus(raw) {
  const clean = String(raw || '').replace(/\*\*/g, '').trim().toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  return ALIASES[clean] || clean;
}

function parseScore(raw) {
  const s = String(raw || '').replace(/\*\*/g, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? null : n;
}

// Pull "[123](reports/123-foo-2026-04-01.md)" → "reports/123-foo-2026-04-01.md"
function extractReportPath(reportField) {
  const m = String(reportField || '').match(/\]\(([^)]+)\)/);
  return m ? m[1] : '';
}

// --- Parse applications.md ---
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
    const reportPath = extractReportPath(parts[8]);
    entries.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score_raw: parts[5].replace(/\*\*/g, '').trim(),
      score_numeric: parseScore(parts[5]),
      status: normalizeStatus(parts[6]),
      pdf: parts[7],
      report_path: reportPath,
      notes: parts[9] || '',
    });
  }
  return entries;
}

// --- Enrich a row with metadata from its report file ---
const HEADER_PATTERNS = {
  url:        /^\*\*(?:URL|Url|Link)\s*:\*\*\s*(.+?)\s*$/im,
  legitimacy: /^\*\*Legitimacy\s*:\*\*\s*(.+?)\s*$/im,
  archetype:  /^\*\*(?:Archetype|Arquetipo|Archétype|Archetyp)\s*:\*\*\s*(.+?)\s*$/im,
};

function enrichFromReport(entry) {
  const out = { url: '', legitimacy: '', archetype: '' };
  if (!entry.report_path) return out;
  const fullPath = join(CAREER_OPS, entry.report_path);
  if (!existsSync(fullPath)) return out;
  const content = readFileSync(fullPath, 'utf-8');
  for (const [key, re] of Object.entries(HEADER_PATTERNS)) {
    const m = content.match(re);
    if (m) out[key] = m[1].trim();
  }
  return out;
}

// --- Encoders ---
function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function tsvEscape(value) {
  // Strip tabs and newlines — TSV cannot escape them.
  const s = value === null || value === undefined ? '' : String(value);
  return s.replace(/[\t\r\n]+/g, ' ');
}

function toCsv(rows, headers) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function toTsv(rows, headers) {
  const lines = [headers.map(tsvEscape).join('\t')];
  for (const row of rows) {
    lines.push(headers.map(h => tsvEscape(row[h])).join('\t'));
  }
  return lines.join('\n') + '\n';
}

function toJson(rows) {
  return JSON.stringify(rows, null, 2) + '\n';
}

// --- Main ---
const entries = parseTracker();

const enriched = entries.map(e => {
  const base = {
    num: e.num,
    date: e.date,
    company: e.company,
    role: e.role,
    score: e.score_raw,
    score_numeric: e.score_numeric,
    status: e.status,
    pdf: e.pdf,
    report_path: e.report_path,
    notes: e.notes,
  };
  if (!ENRICH) return base;
  const extra = enrichFromReport(e);
  return { ...base, url: extra.url, legitimacy: extra.legitimacy, archetype: extra.archetype };
});

const HEADERS = [
  'num', 'date', 'company', 'role', 'score', 'score_numeric',
  'status', 'pdf', 'report_path', 'notes',
];
if (ENRICH) HEADERS.push('url', 'legitimacy', 'archetype');

let output;
if (FORMAT === 'json') output = toJson(enriched);
else if (FORMAT === 'tsv') output = toTsv(enriched, HEADERS);
else output = toCsv(enriched, HEADERS);

if (OUTPUT_PATH) {
  writeFileSync(OUTPUT_PATH, output);
  // Status to stderr so stdout stays a clean machine target if someone
  // writes a file AND pipes (rare, but cheap to support).
  console.error(`Wrote ${enriched.length} row(s) to ${OUTPUT_PATH} (format: ${FORMAT}${ENRICH ? ', enriched' : ''})`);
} else {
  process.stdout.write(output);
}
