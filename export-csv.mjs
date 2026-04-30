#!/usr/bin/env node
/**
 * export-csv.mjs — Export applications tracker to CSV for Excel / Google Sheets
 *
 * Reads data/applications.md and optionally enriches each row from its linked
 * evaluation report (archetype, seniority, domain, remote policy, score breakdown).
 *
 * Run: node export-csv.mjs                  (basic export, tracker columns only)
 *      node export-csv.mjs --enrich         (add report data: archetype, seniority, etc.)
 *      node export-csv.mjs --out custom.csv (custom output path)
 *      node export-csv.mjs --status applied,interview (filter by status)
 *
 * Output: output/applications-{YYYY-MM-DD}.csv
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const OUTPUT_DIR = join(CAREER_OPS, 'output');

// --- CLI args ---
const args = process.argv.slice(2);
const enrich = args.includes('--enrich');
const outIdx = args.indexOf('--out');
const statusIdx = args.indexOf('--status');

const today = new Date().toISOString().split('T')[0];
const defaultOut = join(OUTPUT_DIR, `applications-${today}.csv`);
const outputPath = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : defaultOut;

const statusFilter = statusIdx !== -1 && args[statusIdx + 1]
  ? new Set(args[statusIdx + 1].toLowerCase().split(',').map(s => s.trim()))
  : null;

// --- Status normalization ---
const ALIASES = {
  'evaluada': 'Evaluated', 'condicional': 'Evaluated', 'hold': 'Evaluated',
  'evaluar': 'Evaluated', 'verificar': 'Evaluated',
  'aplicado': 'Applied', 'enviada': 'Applied', 'aplicada': 'Applied',
  'applied': 'Applied', 'sent': 'Applied',
  'respondido': 'Responded',
  'entrevista': 'Interview',
  'oferta': 'Offer',
  'rechazado': 'Rejected', 'rechazada': 'Rejected',
  'descartado': 'Discarded', 'descartada': 'Discarded',
  'cerrada': 'Discarded', 'cancelada': 'Discarded',
  'no aplicar': 'SKIP', 'no_aplicar': 'SKIP', 'monitor': 'SKIP', 'geo blocker': 'SKIP',
};

function normalizeStatus(raw) {
  const clean = raw.replace(/\*\*/g, '').trim()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  const lower = clean.toLowerCase();
  return ALIASES[lower] || (clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase());
}

// --- CSV escaping ---
function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
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
    entries.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }
  return entries;
}

// --- Parse a report for enrichment data ---
function parseReport(reportPath) {
  if (!existsSync(reportPath)) return null;
  const content = readFileSync(reportPath, 'utf-8');
  const plain = content.replace(/\*\*/g, '');

  function extract(regex) {
    const m = plain.match(regex);
    return m ? m[1].trim() : '';
  }

  return {
    archetype: extract(/\|\s*(?:Archetype|Arquetipo)\s*\|\s*(.*?)\s*\|/i),
    seniority: extract(/\|\s*(?:Seniority|Nivel|Level)\s*\|\s*(.*?)\s*\|/i),
    remote: extract(/\|\s*(?:Remote|Remoto|Location)\s*\|\s*(.*?)\s*\|/i),
    domain: extract(/\|\s*(?:Domain|Dominio|Industry)\s*\|\s*(.*?)\s*\|/i),
    teamSize: extract(/\|\s*(?:Team|Team size|Equipo)\s*\|\s*(.*?)\s*\|/i),
    comp: extract(/\|\s*(?:Comp|Salary|Salario|Listed salary)\s*\|\s*(.*?)\s*\|/i),
    legitimacy: extract(/\*\*Legitimacy:\*\*\s*([^\n]+)/i) ||
                extract(/Legitimacy:\s*([^\n|]+)/i),
    url: extract(/\*\*URL:\*\*\s*([^\s\n]+)/i) ||
         extract(/URL:\s*([^\s\n]+)/i),
    scores: {
      cvMatch:   parseFloat((plain.match(/\|\s*(?:CV Match|Match con CV)\s*\|\s*([\d.]+)\/5/i) || [])[1]) || '',
      northStar: parseFloat((plain.match(/\|\s*North Star\s*\|\s*([\d.]+)\/5/i) || [])[1]) || '',
      comp:      parseFloat((plain.match(/\|\s*Comp\s*\|\s*([\d.]+)\/5/i) || [])[1]) || '',
      cultural:  parseFloat((plain.match(/\|\s*(?:Cultural signals?|Cultural)\s*\|\s*([\d.]+)\/5/i) || [])[1]) || '',
      redFlags:  parseFloat((plain.match(/\|\s*Red flags\s*\|\s*([-+]?[\d.]+)/i) || [])[1]) || '',
    },
  };
}

// --- Main ---
function run() {
  const entries = parseTracker();

  if (!entries.length) {
    console.error('No applications found in tracker.');
    process.exit(1);
  }

  // Apply status filter
  const filtered = statusFilter
    ? entries.filter(e => statusFilter.has(normalizeStatus(e.status).toLowerCase()))
    : entries;

  if (!filtered.length) {
    console.error(`No entries match status filter: ${[...statusFilter].join(', ')}`);
    process.exit(1);
  }

  // Build CSV rows
  const baseHeaders = ['#', 'Date', 'Company', 'Role', 'Score', 'Status', 'PDF', 'Report URL', 'Notes'];
  const enrichHeaders = enrich
    ? ['Archetype', 'Seniority', 'Remote', 'Domain', 'Team Size', 'Comp', 'Legitimacy',
       'Score: CV Match', 'Score: North Star', 'Score: Comp', 'Score: Cultural', 'Score: Red Flags',
       'Offer URL']
    : [];

  const headers = [...baseHeaders, ...enrichHeaders];
  const rows = [csvRow(headers)];

  for (const e of filtered) {
    const statusNorm = normalizeStatus(e.status);

    // Resolve report link
    const reportMatch = e.report.match(/\]\(([^)]+)\)/);
    const reportRelPath = reportMatch ? reportMatch[1] : null;
    const reportAbsPath = reportRelPath ? join(CAREER_OPS, reportRelPath) : null;
    const reportUrl = reportRelPath ? reportRelPath : '';

    const baseRow = [
      e.num,
      e.date,
      e.company,
      e.role,
      e.score,
      statusNorm,
      e.pdf.includes('✅') ? 'Yes' : 'No',
      reportUrl,
      e.notes,
    ];

    let enrichRow = [];
    if (enrich) {
      const rd = reportAbsPath ? parseReport(reportAbsPath) : null;
      enrichRow = [
        rd?.archetype  || '',
        rd?.seniority  || '',
        rd?.remote     || '',
        rd?.domain     || '',
        rd?.teamSize   || '',
        rd?.comp       || '',
        rd?.legitimacy || '',
        rd?.scores.cvMatch   ?? '',
        rd?.scores.northStar ?? '',
        rd?.scores.comp      ?? '',
        rd?.scores.cultural  ?? '',
        rd?.scores.redFlags  ?? '',
        rd?.url        || '',
      ];
    }

    rows.push(csvRow([...baseRow, ...enrichRow]));
  }

  // Write output
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(outputPath, rows.join('\n') + '\n', 'utf-8');

  const enrichedCount = enrich && filtered.some(e => {
    const m = e.report.match(/\]\(([^)]+)\)/);
    return m && existsSync(join(CAREER_OPS, m[1]));
  }) ? ' (enriched with report data)' : '';

  console.log(`Exported ${filtered.length} of ${entries.length} applications${enrichedCount}`);
  console.log(`Output: ${outputPath}`);
}

run();
