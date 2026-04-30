#!/usr/bin/env node
/**
 * weekly-digest.mjs — Weekly progress digest for career-ops
 *
 * Parses applications.md and computes velocity, pipeline health, score
 * distribution, stale applications, and action items for the past N days.
 *
 * Run: node weekly-digest.mjs             (JSON to stdout)
 *      node weekly-digest.mjs --summary   (human-readable dashboard)
 *      node weekly-digest.mjs --days 14   (look back 14 days instead of 7)
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
const daysIdx = args.indexOf('--days');
const LOOKBACK_DAYS = daysIdx !== -1 && args[daysIdx + 1] !== undefined
  ? (parseInt(args[daysIdx + 1]) || 7)
  : 7;

// Stale threshold: applied entries older than this get flagged
const STALE_THRESHOLD_DAYS = 14;

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
  const clean = raw.replace(/\*\*/g, '').trim().toLowerCase()
    .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  return ALIASES[clean] || clean;
}

// --- Date helpers ---
function parseDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null;
  return new Date(s.trim());
}

function today() {
  return new Date(new Date().toISOString().split('T')[0]);
}

function daysBetween(d1, d2) {
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function subtractDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

// --- Arithmetic helpers ---
function avg(arr) {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;
}

function pctDelta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
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
      score: parseFloat(parts[5]) || 0,
      status: parts[6],
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }
  return entries;
}

// --- Main analysis ---
function analyze() {
  const raw = parseTracker();
  if (!raw.length) {
    return { error: 'No applications found in tracker.' };
  }

  const now = today();
  const periodStart = subtractDays(now, LOOKBACK_DAYS);
  const prevStart = subtractDays(periodStart, LOOKBACK_DAYS);

  // Enrich with parsed dates and normalized status
  const entries = raw.map(e => ({
    ...e,
    parsedDate: parseDate(e.date),
    normalizedStatus: normalizeStatus(e.status),
  }));

  // Partition by time window
  const thisWeek = entries.filter(e =>
    e.parsedDate && e.parsedDate >= periodStart && e.parsedDate <= now
  );
  const lastWeek = entries.filter(e =>
    e.parsedDate && e.parsedDate >= prevStart && e.parsedDate < periodStart
  );

  const ACTIVE_STATUSES = ['applied', 'responded', 'interview', 'offer'];
  const TRACTION_STATUSES = ['responded', 'interview', 'offer'];

  // --- This period activity ---
  const activity = {
    evaluated: thisWeek.length,
    applied: thisWeek.filter(e => ACTIVE_STATUSES.includes(e.normalizedStatus)).length,
    interviews: thisWeek.filter(e => e.normalizedStatus === 'interview').length,
    offers: thisWeek.filter(e => e.normalizedStatus === 'offer').length,
    rejected: thisWeek.filter(e => e.normalizedStatus === 'rejected').length,
    discarded: thisWeek.filter(e => e.normalizedStatus === 'discarded').length,
    skip: thisWeek.filter(e => e.normalizedStatus === 'skip').length,
    avgScore: avg(thisWeek.filter(e => e.score > 0).map(e => e.score)),
  };

  // --- Previous period for delta ---
  const prevActivity = {
    evaluated: lastWeek.length,
    applied: lastWeek.filter(e => ACTIVE_STATUSES.includes(e.normalizedStatus)).length,
  };

  // --- Current pipeline snapshot ---
  const STATUS_ORDER = ['evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected', 'discarded', 'skip'];
  const pipeline = Object.fromEntries(STATUS_ORDER.map(s => [s, 0]));
  for (const e of entries) {
    const s = e.normalizedStatus;
    if (s in pipeline) pipeline[s]++;
    else pipeline[s] = (pipeline[s] || 0) + 1;
  }

  // --- All-time win rate (applied → traction) ---
  const appliedTotal = entries.filter(e =>
    [...ACTIVE_STATUSES, 'rejected'].includes(e.normalizedStatus)
  ).length;
  const tractionTotal = entries.filter(e =>
    TRACTION_STATUSES.includes(e.normalizedStatus)
  ).length;
  const winRate = appliedTotal > 0
    ? Math.round((tractionTotal / appliedTotal) * 100)
    : 0;

  // --- Score distribution for this period ---
  const scores = thisWeek.filter(e => e.score > 0).map(e => e.score);
  const scoreDistribution = {
    count: scores.length,
    avg: avg(scores),
    min: scores.length ? Math.min(...scores) : 0,
    max: scores.length ? Math.max(...scores) : 0,
    above4: scores.filter(s => s >= 4).length,
    between35_4: scores.filter(s => s >= 3.5 && s < 4).length,
    below35: scores.filter(s => s < 3.5).length,
  };

  // --- Stale applied applications ---
  const staleApplications = entries
    .filter(e => e.normalizedStatus === 'applied' && e.parsedDate)
    .filter(e => daysBetween(e.parsedDate, now) >= STALE_THRESHOLD_DAYS)
    .sort((a, b) => a.parsedDate - b.parsedDate)
    .map(e => ({
      num: e.num,
      company: e.company,
      role: e.role,
      date: e.date,
      daysSince: daysBetween(e.parsedDate, now),
      score: e.score,
    }));

  // --- Top offers this period (score ≥ 4.0) ---
  const topOffers = [...thisWeek]
    .filter(e => e.score >= 4.0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(e => ({
      num: e.num,
      company: e.company,
      role: e.role,
      score: e.score,
      status: e.normalizedStatus,
    }));

  // --- Action items ---
  const actionItems = [];

  if (staleApplications.length > 0) {
    const sample = staleApplications.slice(0, 3).map(s => `${s.company} (#${s.num})`).join(', ');
    actionItems.push({
      priority: 'high',
      action: `${staleApplications.length} applied application${staleApplications.length > 1 ? 's' : ''} stale (${STALE_THRESHOLD_DAYS}+ days, no update)`,
      detail: `Follow up or close: ${sample}`,
      suggestion: '/career-ops followup',
    });
  }

  const pendingEvaluation = pipeline['evaluated'] || 0;
  if (pendingEvaluation > 10) {
    actionItems.push({
      priority: 'medium',
      action: `${pendingEvaluation} evaluated offers waiting for a decision`,
      detail: 'Review high-score offers and decide to apply or discard.',
      suggestion: '/career-ops tracker',
    });
  }

  if (activity.evaluated === 0 && LOOKBACK_DAYS <= 7) {
    actionItems.push({
      priority: 'medium',
      action: 'No new offers evaluated this week',
      detail: 'Search portals for new opportunities to keep the pipeline moving.',
      suggestion: '/career-ops scan',
    });
  } else if (activity.applied === 0 && pendingEvaluation > 0) {
    actionItems.push({
      priority: 'medium',
      action: 'Offers evaluated but no applications sent this week',
      detail: `${pendingEvaluation} evaluated offers waiting for a decision.`,
      suggestion: '/career-ops tracker',
    });
  }

  if (winRate < 20 && appliedTotal >= 5) {
    actionItems.push({
      priority: 'medium',
      action: `Low response rate: ${winRate}% applied → traction`,
      detail: 'Analyze rejection patterns to improve targeting.',
      suggestion: '/career-ops patterns',
    });
  }

  return {
    metadata: {
      analysisDate: now.toISOString().split('T')[0],
      lookbackDays: LOOKBACK_DAYS,
      dateRange: {
        from: periodStart.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
      },
      totalApplications: entries.length,
    },
    activity,
    previousPeriod: {
      evaluated: prevActivity.evaluated,
      applied: prevActivity.applied,
      deltaEvaluated: pctDelta(activity.evaluated, prevActivity.evaluated),
      deltaApplied: pctDelta(activity.applied, prevActivity.applied),
    },
    pipeline,
    scoreDistribution,
    winRate,
    staleApplications,
    topOffers,
    actionItems,
  };
}

// --- Summary mode (human-readable) ---
function printSummary(result) {
  if (result.error) {
    console.log(`\n${result.error}\n`);
    return;
  }

  const {
    metadata, activity, previousPeriod, pipeline,
    scoreDistribution, winRate, staleApplications, topOffers, actionItems,
  } = result;

  const SEP = '='.repeat(62);
  const LINE = '-'.repeat(62);

  console.log(`\n${SEP}`);
  console.log(`  Weekly Digest — ${metadata.dateRange.from} to ${metadata.dateRange.to}`);
  console.log(`  ${metadata.totalApplications} total applications on record`);
  console.log(`${SEP}\n`);

  // Activity this period
  const fmtDelta = d => d === null ? '' : d > 0 ? ` (+${d}% vs prev)` : d < 0 ? ` (${d}% vs prev)` : ' (= prev)';
  console.log('THIS PERIOD');
  console.log(LINE);
  console.log(`  Evaluated     ${String(activity.evaluated).padStart(3)}${fmtDelta(previousPeriod.deltaEvaluated)}`);
  console.log(`  Applied       ${String(activity.applied).padStart(3)}${fmtDelta(previousPeriod.deltaApplied)}`);
  if (activity.interviews) console.log(`  Interviews    ${String(activity.interviews).padStart(3)}`);
  if (activity.offers)     console.log(`  Offers        ${String(activity.offers).padStart(3)}`);
  if (activity.rejected)   console.log(`  Rejected      ${String(activity.rejected).padStart(3)}`);
  if (activity.avgScore)   console.log(`  Avg score     ${activity.avgScore}/5`);

  // Pipeline snapshot
  console.log('\nPIPELINE SNAPSHOT');
  console.log(LINE);
  const order = ['evaluated', 'applied', 'responded', 'interview', 'offer', 'rejected', 'discarded', 'skip'];
  for (const s of order) {
    if (pipeline[s]) {
      const bar = '█'.repeat(Math.min(pipeline[s], 20));
      console.log(`  ${s.padEnd(12)} ${String(pipeline[s]).padStart(3)}  ${bar}`);
    }
  }
  console.log(`  Applied → traction (all time): ${winRate}%`);

  // Score distribution
  if (scoreDistribution.count > 0) {
    console.log('\nSCORE DISTRIBUTION (this period)');
    console.log(LINE);
    console.log(`  Avg ${scoreDistribution.avg}/5   Min ${scoreDistribution.min}   Max ${scoreDistribution.max}   (${scoreDistribution.count} scored)`);
    console.log(`  ≥4.0: ${scoreDistribution.above4}  |  3.5–3.9: ${scoreDistribution.between35_4}  |  <3.5: ${scoreDistribution.below35}`);
  }

  // Top offers
  if (topOffers.length > 0) {
    console.log('\nTOP OFFERS THIS PERIOD (score ≥ 4.0)');
    console.log(LINE);
    for (const o of topOffers) {
      console.log(`  #${String(o.num).padEnd(4)} ${o.score}/5  ${o.company} — ${o.role}  [${o.status}]`);
    }
  }

  // Stale applications
  if (staleApplications.length > 0) {
    console.log(`\nSTALE (applied, ${STALE_THRESHOLD_DAYS}+ days with no update)`);
    console.log(LINE);
    for (const s of staleApplications) {
      console.log(`  #${String(s.num).padEnd(4)} ${String(s.daysSince).padStart(2)}d  ${s.company} — ${s.role}`);
    }
  }

  // Action items
  if (actionItems.length > 0) {
    console.log('\nACTION ITEMS');
    console.log(SEP);
    for (const item of actionItems) {
      console.log(`  [${item.priority.toUpperCase()}] ${item.action}`);
      console.log(`    → ${item.detail}`);
      if (item.suggestion) console.log(`    Run: ${item.suggestion}`);
    }
  }

  console.log('');
}

// --- Run ---
const result = analyze();

if (summaryMode) {
  printSummary(result);
} else {
  console.log(JSON.stringify(result, null, 2));
}

if (result.error) process.exit(1);
