# Mode: digest — Weekly Progress Digest

## Purpose

Generate a weekly (or custom-period) summary of job search activity. Shows
velocity, pipeline health, score distribution, stale applications, and
prioritized action items. The "Monday morning briefing" for your job search.

## Inputs

- `data/applications.md` — Application tracker
- `config/profile.yml` — User profile (name, goals)

## When to Use

Trigger this mode when the user asks for:
- "weekly digest", "weekly summary", "weekly report"
- "how did I do this week", "what happened this week"
- "show me my pipeline", "job search summary"
- "progress update", "job search status"

## Step 1 — Run Digest Script

Execute:

```bash
node weekly-digest.mjs
```

Parse the JSON output. It contains:

| Key | Contents |
|-----|----------|
| `metadata` | Analysis date, lookback days, date range, total applications |
| `activity` | This period: evaluated, applied, interviews, offers, rejected, avg score |
| `previousPeriod` | Last period counts + delta percentages vs previous period |
| `pipeline` | Current counts per status stage (all time) |
| `scoreDistribution` | Avg/min/max score, count above/below thresholds |
| `winRate` | All-time applied → traction conversion % |
| `staleApplications` | Applied entries 14+ days old with no status change |
| `topOffers` | Score ≥ 4.0 evaluated this period |
| `actionItems` | Prioritized list (high/medium) of what needs attention |

To look back 14 days instead of 7: `node weekly-digest.mjs --days 14`

If the script returns `error`, tell the user and suggest they evaluate some
offers first with `/career-ops` (or paste a JD/URL to start).

## Step 2 — Present the Digest

Format the digest as a clean briefing. Use this structure:

```
## Weekly Digest — {from} to {to}
{N} total applications on record

### This Week
| Metric | Count | vs Last Week |
|--------|-------|-------------|
| Evaluated | {N} | {+/-X%} |
| Applied | {N} | {+/-X%} |
| Interviews | {N} | — |
| Avg score | {X.X}/5 | — |

### Pipeline Health
| Stage | Count |
|-------|-------|
| Evaluated | {N} |
| Applied | {N} |
| Responded | {N} |
| Interview | {N} |
| Offer | {N} |
| Rejected | {N} |

All-time response rate: **{X}%** (applied → traction)

### Score Distribution (this period)
{N} scored | Avg {X.X}/5 | Min {X.X} | Max {X.X}
≥4.0: {N} · 3.5–3.9: {N} · <3.5: {N}

### Top Offers This Week (score ≥ 4.0)
{list each with #, score, company, role, current status}

### Needs Attention
{numbered list of action items with priority and suggestion}
```

Omit sections that have no data (e.g., if no top offers, skip that section).

## Step 3 — Interpret the Data

After the tables, add 2–3 lines of interpretation. Use judgment:

- **Win rate < 20%** with ≥5 applications applied → suggest `/career-ops patterns` to diagnose rejection patterns
- **Avg score declining** vs previous period → suggest tightening portal keyword filters
- **Stale applications present** → recommend `/career-ops followup` to generate follow-up drafts
- **No evaluations this week** → recommend `/career-ops scan` to replenish pipeline
- **Many in Evaluated status** → remind user to decide on pending offers (apply or discard)
- **Interview or Offer present** → acknowledge and offer to prep (`/career-ops interview-prep`)

Keep interpretation concise — 1 sentence per insight, max 3 insights.

## Step 4 — Offer Next Steps

Close with a short menu of what to do next:

> **What would you like to do next?**
> - Follow up on stale applications → `/career-ops followup`
> - Find new offers → `/career-ops scan`
> - Analyze rejection patterns → `/career-ops patterns`
> - Review pending offers → show high-score Evaluated entries
> - Prep for an interview → `/career-ops interview-prep {company}`

Only show options that are relevant given the current digest data (e.g., only
offer "follow up" if there are stale applications, only offer "interview prep"
if there's an active interview).

## Output Example

```
## Weekly Digest — 2026-04-23 to 2026-04-30
142 total applications on record

### This Week
| Metric | Count | vs Last Week |
|--------|-------|-------------|
| Evaluated | 8 | +14% |
| Applied | 3 | -25% |
| Avg score | 3.8/5 | — |

### Pipeline Health
| Stage | Count |
|-------|-------|
| Evaluated | 27 |
| Applied | 12 |
| Responded | 2 |
| Interview | 1 |
| Rejected | 63 |
| Discarded | 37 |

All-time response rate: **19%** (applied → traction)

### Score Distribution (this period)
8 scored | Avg 3.8/5 | Min 2.9 | Max 4.6
≥4.0: 3 · 3.5–3.9: 3 · <3.5: 2

### Top Offers This Week
- **#142** 4.6/5 — Acme Corp — Head of AI [evaluated]
- **#139** 4.2/5 — TechCo — Staff Engineer [applied]
- **#137** 4.0/5 — DataFirm — ML Lead [evaluated]

### Needs Attention
1. **[HIGH]** 2 applications stale (14+ days): TechCo (#139), OldCo (#128)
   → Run `/career-ops followup`
2. **[MEDIUM]** 27 offers evaluated but not acted on
   → Review high-score entries and decide

---
Your response rate is at 19% — borderline. One more week of data should
clarify if patterns mode is warranted.

**What would you like to do next?**
- Follow up on stale applications → `/career-ops followup`
- Find new offers → `/career-ops scan`
- Review the 3 pending high-score offers
```
