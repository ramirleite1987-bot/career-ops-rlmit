# Mode: tracker — Application Tracker

Read and display `data/applications.md`.

**Tracker format:**
```markdown
| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
```

Canonical statuses: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` / `Rejected` / `Discarded` / `SKIP`

- `Applied` = candidate submitted the application
- `Responded` = a recruiter/company reached out and candidate replied (inbound)
- `Interview` = active interview process underway
- `Offer` = offer received
- `Rejected` = company said no
- `Discarded` = candidate decided not to proceed, or offer is closed
- `SKIP` = doesn't fit — do not apply

If the user asks to update a status, edit the corresponding row in-place.
Never add a new row for a company+role that already exists — update the existing entry instead.

## Statistics to show

After displaying the tracker, always compute and show:

| Metric | Value |
|--------|-------|
| Total applications | N |
| By status | count per canonical status |
| Average score | X.X/5 (exclude N/A entries) |
| PDF generated | N (X%) |
| Reports filed | N (X%) |

## Filtering

If the user asks to filter (e.g., "show me all interviews", "show offers above 4.0"), apply the filter and display only matching rows, then show filtered stats.

## Status Updates

When the user says things like:
- "Mark #42 as applied" → update the Status column for entry #42
- "Reject TechCorp" → find the TechCorp entry and set Status to `Rejected`
- "Set score to 4.2 for entry #37" → update the Score column

After updating, confirm the change and show the updated row.

## Health signals

Flag these automatically (as a note after the table, not as errors):

- More than 15 entries in `Evaluated` with no action → "You have {N} evaluated offers waiting for a decision."
- Any `Applied` entries older than 14 days → "Consider following up with: {companies}"
- Win rate (applied → interview/offer) below 20% with ≥5 applied entries → "Low response rate ({X}%). Run `/career-ops patterns` to diagnose."
