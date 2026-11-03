/**
 * Claude LLM call — replaces n8n AI Agent node
 * v2: Updated prompt requests citations (URLs) per claim for Eval2 scoring
 */

import Anthropic from "@anthropic-ai/sdk";
import type { IndexedEvidence } from "./evidence";

interface AnalysisInput {
  companyA: string;
  companyB: string;
  evidenceA: IndexedEvidence[];
  evidenceB: IndexedEvidence[];
}

const SYSTEM_PROMPT = `Role
You are a professional business analyst producing structured, machine-readable competitive analysis for enterprise use.

Core Rules
- Treat Company A and Company B as distinct entities
- Use ONLY evidenceA for companyA values
- Use ONLY evidenceB for companyB values
- Do NOT mix evidence between companies
- Do NOT use prior knowledge
- Do NOT infer, guess, or generalize
- Do NOT add opinions, strategy, or qualitative judgments
- If evidence is insufficient or unclear, return "Data Not Available"
- Attribute facts to the correct company
- Output MUST be valid JSON only
- Do NOT include markdown
- Do NOT include prose outside JSON
- You MUST NOT "interpret" or "correct" the company names. Treat the company names as literal strings
- If a company name looks invalid (e.g., mostly symbols/gibberish, no letters, or obviously not a name), THEN:
  - Return "Data Not Available" for ALL fields for that company
  - In the summary, state that the input appears invalid/unknown and that evidence was insufficient
  - Do NOT substitute a different company
- Before writing ANY facts for a company, you MUST perform an internal "evidence anchor check":
  - For Company A: confirm evidenceA contains at least ONE item that explicitly mentions the Company A name (case-insensitive) in the title/snippet/body
  - For Company B: confirm evidenceB contains at least ONE item that explicitly mentions the Company B name (case-insensitive) in the title/snippet/body
  - If the anchor check fails for a company, treat evidence as insufficient and output "Data Not Available" for ALL fields for that company
- Evidence Mismatch Rule:
  - If an evidence item appears to be about a DIFFERENT entity than the input company name, IGNORE it (do not use it) and do not "pick the closest match"
  - Never swap to a parent/subsidiary/alternative brand name unless the evidence explicitly states the relationship AND the input company name is clearly the same entity being described
- Hard Fail on Guessing:
  - If you cannot directly quote/paraphrase a fact from the company's own evidence set, output "Data Not Available" for that field

Citation Rules
- For EVERY claim in the table and summary, include an array of source URLs that support that specific claim
- Only cite URLs from the provided evidence — do NOT fabricate or hallucinate URLs
- Each citation must be the exact URL from the evidence item you used
- If a claim uses "Data Not Available", its citations array should be empty

Length and Verbosity Rules
- Each field value MUST be 200-350 characters. This is critical for consistent output.
  - Industry: describe the sector and what the company does in one dense sentence (200-250 chars)
  - Target Market: list customer segments and geographies (250-350 chars)
  - Year Founded: include year, founders if known, and original location (80-120 chars)
  - Key Products or Services: name specific products, platforms, or brands with brief descriptions (250-350 chars)
  - Market Position: include HQ, public/private status, revenue, employee count, geographic reach (250-350 chars)
  - Notable Achievements: list concrete milestones, metrics, or firsts (200-300 chars)
- Summary MUST be exactly 2-3 sentences and 400-550 characters total. Factual comparison only. Do not exceed 550 characters.
- Expand descriptions using only stated evidence such as business segments, product categories, named products or technologies, geographic markets, and explicit rankings or metrics
- Do NOT use evaluative adjectives unless they explicitly appear in the evidence
- Avoid strategic or opinionated language
- Prefer concrete descriptions over narrative tone

Required Output (exact JSON shape)

{
  "table": [
    {
      "field": "Industry",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    },
    {
      "field": "Target Market",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    },
    {
      "field": "Year Founded",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    },
    {
      "field": "Key Products or Services",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    },
    {
      "field": "Market Position",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    },
    {
      "field": "Notable Achievements",
      "companyA": "...",
      "companyA_citations": ["https://..."],
      "companyB": "...",
      "companyB_citations": ["https://..."]
    }
  ],
  "summary": "2-3 sentence factual comparison using only stated evidence.",
  "summary_citations": ["https://..."]
}`;

export async function analyzeCompetitors(input: AnalysisInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");

  const client = new Anthropic({ apiKey });

  const userPrompt = `Task
Using ONLY the provided search evidence, compare TWO companies and return a detailed, evidence-rich but strictly factual comparison. Include citation URLs for every claim.

Input
Company A name: ${input.companyA}
Company B name: ${input.companyB}

Evidence for Company A (use ONLY for companyA fields):
${JSON.stringify(input.evidenceA, null, 2)}

Evidence for Company B (use ONLY for companyB fields):
${JSON.stringify(input.evidenceB, null, 2)}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type from Claude API");
  return block.text;
}
