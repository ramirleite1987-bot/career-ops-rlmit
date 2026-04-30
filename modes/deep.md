# Mode: deep — Deep Company Research

Generate a structured research prompt across 6 axes. Run the searches directly using WebSearch and synthesize the findings — do not just output the prompt.

## Research axes

### 1. AI Strategy
- Which products/features use AI/ML?
- What is their AI stack? (models, infra, tooling)
- Do they have an engineering blog? What do they publish?
- Any published papers or conference talks on AI?

### 2. Recent moves (last 6 months)
- Relevant hires in AI/ML/product?
- Acquisitions or partnerships?
- Product launches or pivots?
- Funding rounds or leadership changes?

### 3. Engineering culture
- How do they ship? (deploy cadence, CI/CD practices)
- Mono-repo or multi-repo?
- Languages and frameworks in use?
- Remote-first or office-first?
- Glassdoor/Blind reviews on engineering culture?

### 4. Likely challenges
- What scaling problems are they facing?
- Reliability, cost, or latency challenges?
- Are they migrating anything? (infra, models, platforms)
- What pain points do employees mention in reviews?

### 5. Competitors and differentiation
- Who are their main competitors?
- What is their moat or differentiator?
- How do they position against the competition?

### 6. Candidate angle
Read `cv.md` and `config/profile.yml` for specific experience, then answer:
- What unique value does the candidate bring to this team?
- Which of the candidate's projects are most relevant?
- What story should they tell in the interview?

## Output format

Present findings in clean sections matching the axes above. Cite all sources. Flag anything that couldn't be verified.

Personalize each section with context from the evaluated offer report if one exists for this company in `reports/`.
