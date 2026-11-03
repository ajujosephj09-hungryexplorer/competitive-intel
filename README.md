# Competitive Intelligence System

Enter two company names, get an evidence backed comparison table with citations and quality scoring.

## What it does

The system takes two company names, searches for public information on each using Tavily, sends the evidence to Claude (Sonnet 4.6) with strict attribution rules, then validates the output through a two phase eval pipeline before returning results.

### Pipeline

1. Search. Parallel Tavily searches build an evidence set for each company
2. Evidence indexing. Results are classified by source type (reference publishers vs. other) and tagged with IDs
3. LLM analysis. Claude Sonnet compares the two companies across six fields (Industry, Target Market, Year Founded, Key Products, Market Position, Notable Achievements) using only the provided evidence. Every claim must cite a source URL
4. Eval Phase 1 (hard gate). Strips code fences, parses JSON, validates schema with Zod. Rejects malformed output
5. Eval Phase 2 (scoring). Extracts individual claims, checks citation integrity against the evidence set, scores each claim using token overlap, numeric matching, and company mention detection. Produces a PASS / WARN / FAIL verdict based on support rate thresholds

### What the eval catches

- Claims with no citations
- Citations pointing to URLs not in the evidence set
- Claims where the cited evidence does not actually support the text (low token overlap)
- Numeric claims not grounded in evidence
- Evidence misattributed between companies

## Stack

- Next.js 14 (App Router, TypeScript)
- Claude API (Sonnet 4.6) for structured analysis
- Tavily API for web search
- Zod for schema validation
- Tailwind CSS for styling
- Supabase (optional) for persisting run logs and claim verdicts
- Deployed on Vercel

## Running locally

```bash
git clone https://github.com/ajujosephj09-hungryexplorer/competitive-intel.git
cd competitive-intel
npm install
```

Create `.env.local`:

```
ANTHROPIC_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
```

```bash
npm run dev
```

Open http://localhost:3000 and enter two company names.

## Background

This started as a Vercel frontend plus n8n backend pipeline using Gemini. Rebuilt as a standalone Next.js app to eliminate the n8n dependency and switch to Claude for better structured output quality. The eval pipeline was the hard part: getting an LLM to produce claims that are actually grounded in the evidence it was given, and having a system that can measure that automatically.

## Author

Built by [Aju Joseph John](https://ajujosephjohn.com)
