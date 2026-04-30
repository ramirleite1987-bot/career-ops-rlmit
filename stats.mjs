#!/usr/bin/env node
/**
 * stats.mjs — Pipeline analytics and conversion funnel for career-ops
 *
 * Parses applications.md and produces aggregate metrics that are hard to
 * eyeball from the markdown table:
 *
 *   - Status breakdown (counts + share)
 *   - Conversion funnel: Evaluated → Applied → Responded → Interview → Offer
 *   - Stage-to-stage conversion rates
 *   - Score distribution and score-vs-outcome correlation
 *     (does AI-scored fit predict interviews?)
 *   - Weekly application cadence (last 8 ISO weeks)
 *
 * Read-only. Safe to run any time.
 *
 * Run: node stats.mjs              (JSON to stdout)
 *      node stats.mjs --summary    (human-readable dashboard)
 *      node stats.mjs --weeks 12   (override weekly window for --summary)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

// --- CLI args ---
const args = process.argv.slice(2);
const summaryMode = args.includes('--summary');
const weeksIdx = args.indexOf('--weeks');
const WEEKS_WINDOW = weeksIdx !== -1 && args[weeksIdx + 1] !== undefined
  ? (Number.isNaN(parseInt(args[weeksIdx + 1])) ? 8 : parseInt(args[weeksIdx + 1]))
  : 8;

// --- Status normalization (mirrors verify-pipeline.mjs / analyze-patterns.mjs) ---
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

const CANONICAL_STATUSES = [
  'evaluated', 'applied', 'responded', 'interview',
  'offer', 'rejected', 'discarded', 'skip',
];

function normalizeStatus(raw) {
  const clean = String(raw || '').replace(/\*\*/g, '').trim().toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  return ALIASES[clean] || clean;
}

// Statuses that imply the candidate has reached or passed an earlier stage.
// Used to compute funnel "reached at least" counts so a row sitting at "offer"
// also counts toward applied/responded/interview reach.
const REACHED_AT_LEAST = {
  evaluated:  new Set(['evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected']),
  applied:    new Set(['applied', 'responded', 'interview', 'offer']),
  responded:  new Set(['responded', 'interview', 'offer']),
  interview:  new Set(['interview', 'offer']),
  offer:      new Set(['offer']),
};

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
      status: normalizeStatus(parts[6]),
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }
  return entries;
}

function parseScore(raw) {
  const s = String(raw || '').replace(/\*\*/g, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  return n;
}

function isoWeekKey(dateStr) {
  // dateStr is YYYY-MM-DD (UTC-safe enough for weekly buckets)
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // ISO week: Thursday-anchored
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(
    ((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pct(num, denom) {
  if (!denom) return null;
  return num / denom;
}

function round(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

// --- Build stats ---
function buildStats(entries) {
  const total = entries.length;
  const statusCounts = Object.fromEntries(CANONICAL_STATUSES.map(s => [s, 0]));
  let nonCanonical = 0;
  for (const e of entries) {
    if (statusCounts[e.status] !== undefined) statusCounts[e.status]++;
    else nonCanonical++;
  }

  // Funnel: count rows that reached AT LEAST each stage.
  const funnelStages = ['evaluated', 'applied', 'responded', 'interview', 'offer'];
  const funnel = {};
  for (const stage of funnelStages) {
    const reachable = REACHED_AT_LEAST[stage];
    funnel[stage] = entries.filter(e => reachable.has(e.status)).length;
  }
  // Stage-to-stage conversion rates
  const conversion = {};
  for (let i = 1; i < funnelStages.length; i++) {
    const from = funnelStages[i - 1];
    const to = funnelStages[i];
    conversion[`${from}_to_${to}`] = round(pct(funnel[to], funnel[from]), 4);
  }

  // Score stats (only entries with a parseable score)
  const scored = entries
    .map(e => ({ ...e, scoreNum: parseScore(e.score) }))
    .filter(e => e.scoreNum !== null);
  const scoreValues = scored.map(e => e.scoreNum);

  // Score-vs-outcome buckets
  const buckets = {
    interview_or_offer: scored.filter(e => ['interview', 'offer'].includes(e.status)).map(e => e.scoreNum),
    responded:          scored.filter(e => e.status === 'responded').map(e => e.scoreNum),
    applied_pending:    scored.filter(e => e.status === 'applied').map(e => e.scoreNum),
    rejected:           scored.filter(e => e.status === 'rejected').map(e => e.scoreNum),
    evaluated_no_apply: scored.filter(e => ['evaluated', 'discarded', 'skip'].includes(e.status)).map(e => e.scoreNum),
  };

  const scoreByOutcome = {};
  for (const [name, vals] of Object.entries(buckets)) {
    scoreByOutcome[name] = {
      n: vals.length,
      mean: round(mean(vals)),
      median: round(median(vals)),
    };
  }

  // Weekly cadence — applications submitted per ISO week.
  // We use status === 'applied' or "reached applied" (anything past evaluated).
  const submitted = entries.filter(e => REACHED_AT_LEAST.applied.has(e.status));
  const byWeek = new Map();
  for (const e of submitted) {
    const key = isoWeekKey(e.date);
    if (!key) continue;
    byWeek.set(key, (byWeek.get(key) || 0) + 1);
  }
  const weekly = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, count]) => ({ week, count }));

  return {
    total,
    status_counts: statusCounts,
    non_canonical_count: nonCanonical,
    funnel,
    conversion_rates: conversion,
    score_stats: {
      n: scoreValues.length,
      mean: round(mean(scoreValues)),
      median: round(median(scoreValues)),
      min: scoreValues.length ? round(Math.min(...scoreValues)) : null,
      max: scoreValues.length ? round(Math.max(...scoreValues)) : null,
    },
    score_by_outcome: scoreByOutcome,
    weekly_applied: weekly,
  };
}

// --- Renderers ---
function renderJson(stats) {
  process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

function bar(value, max, width = 24) {
  if (!max) return '';
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmtPct(n) {
  if (n === null || n === undefined) return '   —  ';
  return `${(n * 100).toFixed(1)}%`.padStart(6);
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return String(n);
}

function renderSummary(stats) {
  const lines = [];
  lines.push('');
  lines.push('career-ops stats');
  lines.push('================');
  lines.push('');

  if (stats.total === 0) {
    lines.push('No applications found yet. Evaluate an offer to get started.');
    lines.push('');
    process.stdout.write(lines.join('\n'));
    return;
  }

  lines.push(`Total entries: ${stats.total}`);
  if (stats.non_canonical_count > 0) {
    lines.push(`(${stats.non_canonical_count} entries with non-canonical status — run \`npm run normalize\`)`);
  }
  lines.push('');

  // Status breakdown
  lines.push('Status breakdown');
  lines.push('----------------');
  const maxStatus = Math.max(...Object.values(stats.status_counts), 1);
  for (const [name, n] of Object.entries(stats.status_counts)) {
    if (n === 0) continue;
    const share = stats.total ? `${((n / stats.total) * 100).toFixed(1)}%` : '0%';
    lines.push(`  ${name.padEnd(11)} ${String(n).padStart(4)} ${bar(n, maxStatus)} ${share}`);
  }
  lines.push('');

  // Funnel
  lines.push('Conversion funnel');
  lines.push('-----------------');
  const stages = ['evaluated', 'applied', 'responded', 'interview', 'offer'];
  const maxFunnel = stats.funnel.evaluated || 1;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const n = stats.funnel[stage];
    const reach = stats.funnel.evaluated ? `${((n / stats.funnel.evaluated) * 100).toFixed(1)}%` : '—';
    lines.push(`  ${stage.padEnd(11)} ${String(n).padStart(4)} ${bar(n, maxFunnel)} ${reach.padStart(6)} of evaluated`);
    if (i < stages.length - 1) {
      const next = stages[i + 1];
      const rate = stats.conversion_rates[`${stage}_to_${next}`];
      lines.push(`              ${fmtPct(rate)}  →  ${next}`);
    }
  }
  lines.push('');

  // Score stats
  if (stats.score_stats.n > 0) {
    lines.push('Score stats (X/5)');
    lines.push('-----------------');
    const s = stats.score_stats;
    lines.push(`  n=${s.n}  mean=${fmtNum(s.mean)}  median=${fmtNum(s.median)}  min=${fmtNum(s.min)}  max=${fmtNum(s.max)}`);
    lines.push('');

    lines.push('Avg score by outcome (does fit predict outcome?)');
    lines.push('------------------------------------------------');
    const order = ['interview_or_offer', 'responded', 'applied_pending', 'rejected', 'evaluated_no_apply'];
    const labels = {
      interview_or_offer: 'interview/offer',
      responded:          'responded',
      applied_pending:    'applied (pending)',
      rejected:           'rejected',
      evaluated_no_apply: 'evaluated/skip/discard',
    };
    for (const k of order) {
      const b = stats.score_by_outcome[k];
      if (!b || b.n === 0) continue;
      lines.push(`  ${labels[k].padEnd(24)} n=${String(b.n).padStart(3)}  mean=${fmtNum(b.mean)}  median=${fmtNum(b.median)}`);
    }
    lines.push('');
  }

  // Weekly cadence — last N weeks
  if (stats.weekly_applied.length > 0) {
    const recent = stats.weekly_applied.slice(-WEEKS_WINDOW);
    lines.push(`Applications per week (last ${recent.length})`);
    lines.push('-'.repeat(`Applications per week (last ${recent.length})`.length));
    const maxWeek = Math.max(...recent.map(w => w.count), 1);
    for (const { week, count } of recent) {
      lines.push(`  ${week}  ${String(count).padStart(3)} ${bar(count, maxWeek, 30)}`);
    }
    lines.push('');
  }

  process.stdout.write(lines.join('\n'));
}

// --- Main ---
const entries = parseTracker();
const stats = buildStats(entries);

if (summaryMode) {
  renderSummary(stats);
} else {
  renderJson(stats);
}
