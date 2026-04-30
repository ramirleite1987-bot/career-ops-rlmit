# Mode: negotiation — Offer Negotiation Strategy

Help the candidate negotiate an offer they've received. Generate a data-backed counter strategy, draft communication scripts, and identify walk-away thresholds — without being aggressive or burning the relationship.

## When to trigger

- User says they received an offer and wants to negotiate
- User says "they made me an offer", "I got an offer from X", "how do I negotiate this"
- Status in tracker is updated to `Offer`

## Inputs

1. **Offer details** (ask if not provided):
   - Base salary offered
   - Equity (options/RSUs, vesting schedule, cliff)
   - Signing bonus
   - Benefits (health, PTO, remote policy, equipment)
   - Start date
2. **Evaluation report** in `reports/` (if exists) — for archetype, domain, company context, legitimacy
3. **User profile** at `config/profile.yml` — target comp, location, priorities
4. **CV** at `cv.md` — for proof points to use in negotiation

## Step 1 — Establish the market range

Run WebSearch queries to benchmark compensation:

| Query | Purpose |
|-------|---------|
| `"{role title}" "{location or remote}" salary 2025 site:levels.fyi` | Engineering/AI/PM market data |
| `"{role title}" "{company}" compensation glassdoor 2025` | Company-specific comp reports |
| `"{role title}" salary range {domain} startup OR scaleup 2025` | Broader market context |
| `"{company}" offer negotiation OR compensation blind OR reddit 2025` | Candid candidate accounts |

Synthesize into:
- **P25 / P50 / P75** for base salary in this role at this company stage
- **Equity benchmarks** (% of company, or RSU value range for stage)
- **Signing bonus norms** for this level/company
- **Total comp** at each percentile (base + equity + bonus)

Flag clearly when data is sparse or outdated.

## Step 2 — Assess the offer

Compare the offer to market data:

| Component | Offered | Market P50 | Gap | Assessment |
|-----------|---------|-----------|-----|------------|
| Base salary | $X | $Y | +/-Z% | below / at / above |
| Equity | X RSUs | Y RSUs equiv. | +/-Z% | — |
| Signing bonus | $X | $Y | — | — |
| Total comp (yr 1) | $X | $Y | +/-Z% | — |

**Overall position:** below market / at market / above market

Read `config/profile.yml` for the user's target comp and priorities. Note whether the offer meets the target.

## Step 3 — Negotiation strategy

Choose the right approach based on the gap:

### If offer is >15% below market
**Aggressive counter warranted.** Counter at P75 and explain with market data. The gap is too wide for a soft counter.

### If offer is 5–15% below market
**Standard counter.** Target P60–P75, anchor to competing alternatives or strong proof points.

### If offer is at or above market
**Optimize, don't counter base.** Focus on equity acceleration, signing bonus, extra PTO, earlier review date, or remote flexibility. Still leaves value on the table without risking the offer.

### The counter offer

```
Counter base:    ${X}     (was ${Y}, +Z%)
Counter equity:  {X RSUs} (was {Y}, accelerated vesting or larger grant)
Signing bonus:   ${X}     (offset for unvested equity left at current company)
Other asks:      {specific: extra PTO days / equipment budget / earlier review}
```

**Justification bullets** (use these in the communication):
1. Market data: "Levels.fyi shows P50 for this role at this stage is $X"
2. Proof point from cv.md: one concrete achievement that de-risks the hire
3. Competing leverage (only if real): "I have one other process ongoing at a similar stage"

**Walk-away point:** State the minimum acceptable package. Below this, recommend declining. Do not share this with the employer.

## Step 4 — Communication scripts

### Email counter-offer (standard)

```
Subject: Re: [Role] Offer — [Your Name]

Hi [Name],

Thank you for the offer — I'm genuinely excited about [specific thing from JD or interview]. I've done my research and I'd like to discuss the compensation package before signing.

Based on market data for [role] at [company stage] companies, the P50 for total comp is around $[X]. Given my background in [specific proof point from cv.md], I'd like to propose:

- Base: $[counter] (currently $[offered])
- [Equity or signing ask if applicable]

I'm committed to making this work and I'm confident I can contribute at the level that justifies this. Would you have 15 minutes this week to discuss?

Best,
[Name from config/profile.yml]
```

**Rules for this email:**
- Specific numbers only — no "somewhere around" or "a bit more"
- One concrete proof point — not a list of accomplishments
- End with a question, not a statement — invites dialogue
- No ultimatums, no "or I'll have to decline"
- Keep it short (under 200 words)

### Phone / video call script

If the recruiter calls to discuss:

**Opening:** "Thanks for calling. I want to be transparent — I'm very interested in this role and I want to make it work. I've done some research on the market and wanted to share what I found."

**The data anchor:** "Based on [source], the P50 for [role] at companies at your stage is around $[X]. My current package is at $[X], so I was hoping we could close that gap."

**The proof point:** "Given [specific achievement from cv.md], I'm confident I can contribute at that level quickly."

**The ask:** "Is there flexibility to get to $[counter]?"

**If they push back:** "I understand there are constraints. What flexibility do you have on equity / signing / review date?"

**If they hold firm:** "Let me think about it and get back to you by [date]." — Never accept or decline on the call.

### Declining gracefully (if needed)

```
Hi [Name],

Thank you for the offer and for the conversations throughout the process. After careful consideration, I've decided not to move forward at this time — the compensation package isn't at the level I need to make a transition right now.

I have genuine respect for what you're building at [Company] and I hope our paths cross again in the future.

Best,
[Name]
```

## Step 5 — Timeline and tactics

| Day | Action |
|-----|--------|
| Day 0 | Receive offer verbally — do NOT accept on the call. "I'm excited, let me review and get back to you." |
| Day 1 | Read the written offer carefully. Run this mode. |
| Day 2–3 | Send counter via email (written is better than phone — creates a record) |
| Day 4–5 | Recruiter responds. If counter accepted: done. If not: decide to accept, counter again, or decline |
| Day 7 max | Don't leave an offer open more than 7 days without communication |

**If they give an exploding offer deadline:** "I want to give this the consideration it deserves. Can I have until [date 5–7 days out] to review?" Legitimate companies always say yes. If they don't, that's a red flag.

## Step 6 — Beyond salary

Things to ask for that often get overlooked:

| Item | Ask when... |
|------|------------|
| **Earlier performance review** | Base is non-negotiable — "Can we schedule a 3-month review with a salary adjustment if I hit [specific targets]?" |
| **Signing bonus** | You're leaving unvested equity at current employer |
| **Equipment budget** | Remote role — ask for home office stipend |
| **PTO flexibility** | You have a planned trip — get it agreed in writing before signing |
| **Remote flexibility** | Hybrid role — negotiate the office day count upfront |
| **Title upgrade** | If title affects future negotiating power (Senior vs Lead) |
| **Equity acceleration** | Double-trigger acceleration on acquisition |

## Output summary

Present the strategy as:

1. **Offer assessment** (1 paragraph: above/at/below market by X%)
2. **Counter recommendation** (specific numbers)
3. **Key justification bullets** (2–3 lines to use verbatim)
4. **Communication script** (ready to send/say)
5. **Walk-away point** (private, not for sharing)
6. **Timeline** (what to do each day)

Close with:
> "Remember: you have more leverage before signing than you ever will again. This is the only moment where they want you as much as you want them — use it."
