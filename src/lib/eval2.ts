/**
 * Eval Phase 2 — Contract & Scoring
 * Port of the n8n Eval2_Contract & Scoring node
 *
 * Responsibilities:
 * 1) Claim extraction from AI output
 * 2) Citation integrity check
 * 3) Support scoring (token overlap + numeric match + company mention)
 * 4) Aggregate PASS / WARN / FAIL
 */

import type { IndexedEvidence } from "./evidence";

interface TableRow {
  field: string;
  companyA: string;
  companyB: string;
  companyA_citations?: string[];
  companyB_citations?: string[];
}

interface AnalysisResult {
  table: TableRow[];
  summary: string;
  summary_citations?: string[];
}

interface Claim {
  claim_id: string;
  companyKey: "A" | "B" | "BOTH";
  field: string;
  text: string;
  citations: string[];
}

export interface ClaimVerdict {
  claim_id: string;
  companyKey: string;
  field: string;
  text: string;
  citations: string[];
  support_score: number;
  verdict: string;
  matchedEvidence: { evidence_id: string; url: string; title: string; source_type: string }[];
}

export interface Eval2Result {
  run_id: string;
  run_started_at: string;
  ok: boolean;
  status: "PASS" | "WARN" | "FAIL";
  failedPhase: string | null;
  reason: string | null;
  details: string[];
  reasons: string[];
  result: AnalysisResult;
  companyA: string;
  companyB: string;
  evalPhase2: {
    contract: typeof CONTRACT;
    citationSummary: {
      missingCitationCount: number;
      badCitationCount: number;
      badCitations: { claim_id: string; field: string; url: string }[];
    };
    claimStats: {
      totalClaims: number;
      eligibleClaimCount: number;
      dataNotAvailableCount: number;
      supportedCount: number;
      unclearCount: number;
      notSupportedCount: number;
      supportRateStrict: number;
      supportRateWeighted: number;
    };
    claimVerdicts: ClaimVerdict[];
    evaluated_at: string;
  };
}

const CONTRACT = {
  requireCitations: true,
  passSupportRate: 0.8,
  warnSupportRate: 0.65,
} as const;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "their", "there", "about",
  "have", "has", "had", "been", "being", "were", "was", "are", "is", "its", "than", "then",
  "they", "them", "also", "such", "through", "across", "including", "include", "includes",
  "company", "companies", "market", "products", "services", "global",
]);

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(String(url));
    u.hash = "";
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return safeStr(url);
  }
}

function tokenize(text: string): string[] {
  return safeStr(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s.%/-]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length > 2 && !STOP_WORDS.has(t));
}

function extractNumericTokens(text: string): string[] {
  return safeStr(text).match(/\b\d+(?:\.\d+)?%?\b/g) || [];
}

function overlapRatio(claimText: string, evidenceText: string): number {
  const a = tokenize(claimText);
  const b = new Set(tokenize(evidenceText));
  if (!a.length) return 0;
  let matched = 0;
  for (const t of a) {
    if (b.has(t)) matched++;
  }
  return matched / a.length;
}

function numericMatchRatio(claimText: string, evidenceText: string): number | null {
  const claimNums = extractNumericTokens(claimText);
  if (!claimNums.length) return null;
  const evText = safeStr(evidenceText);
  let matched = 0;
  for (const n of claimNums) {
    if (evText.includes(n)) matched++;
  }
  return matched / claimNums.length;
}

function computeSupportScore(
  claimText: string,
  evidenceDoc: IndexedEvidence,
  companyName: string
): number {
  const combined = `${safeStr(evidenceDoc.title)} ${safeStr(evidenceDoc.content)}`;
  const overlap = overlapRatio(claimText, combined);
  const numMatch = numericMatchRatio(claimText, combined);
  const companyMention = companyName
    ? combined.toLowerCase().includes(companyName.toLowerCase()) ? 1 : 0
    : 0;

  let score: number;
  if (numMatch !== null) {
    score = 0.7 * overlap + 0.2 * numMatch + 0.1 * companyMention;
  } else {
    score = 0.85 * overlap + 0.15 * companyMention;
  }

  return Math.max(0, Math.min(1, Number(score.toFixed(4))));
}

function verdictFromScore(score: number): string {
  if (score >= 0.55) return "SUPPORTED";
  if (score >= 0.3) return "UNCLEAR";
  return "NOT_SUPPORTED";
}

function isDataNotAvailable(text: string): boolean {
  const s = safeStr(text).toLowerCase();
  return s === "data not available" || s === "n/a" || s === "na" || s === "unknown";
}

function buildClaims(result: AnalysisResult): Claim[] {
  const claims: Claim[] = [];

  (result.table || []).forEach((row, i) => {
    claims.push({
      claim_id: `A_${i + 1}`,
      companyKey: "A",
      field: row.field,
      text: row.companyA,
      citations: Array.isArray(row.companyA_citations) ? row.companyA_citations : [],
    });
    claims.push({
      claim_id: `B_${i + 1}`,
      companyKey: "B",
      field: row.field,
      text: row.companyB,
      citations: Array.isArray(row.companyB_citations) ? row.companyB_citations : [],
    });
  });

  claims.push({
    claim_id: "S_1",
    companyKey: "BOTH",
    field: "Summary",
    text: result.summary,
    citations: Array.isArray(result.summary_citations) ? result.summary_citations : [],
  });

  return claims;
}

export function runEval2(input: {
  run_id: string;
  run_started_at: string;
  companyA: string;
  companyB: string;
  result: AnalysisResult;
  evidenceIndex: IndexedEvidence[];
  allowedCitationUrls: string[];
}): Eval2Result {
  const {
    run_id,
    run_started_at,
    companyA,
    companyB,
    result,
    evidenceIndex,
    allowedCitationUrls,
  } = input;

  const allowedSet = new Set(allowedCitationUrls.map(normalizeUrl));
  const evidenceByUrl = new Map<string, IndexedEvidence[]>();

  for (const ev of evidenceIndex) {
    const key = normalizeUrl(ev.url);
    if (!key) continue;
    if (!evidenceByUrl.has(key)) evidenceByUrl.set(key, []);
    evidenceByUrl.get(key)!.push(ev);
  }

  const claims = buildClaims(result);

  let missingCitationCount = 0;
  let badCitationCount = 0;
  let dataNotAvailableCount = 0;
  let supportedCount = 0;
  let unclearCount = 0;
  let notSupportedCount = 0;
  let eligibleClaimCount = 0;

  const badCitations: { claim_id: string; field: string; url: string }[] = [];
  const claimVerdicts: ClaimVerdict[] = [];

  for (const claim of claims) {
    const companyName =
      claim.companyKey === "A" ? companyA :
      claim.companyKey === "B" ? companyB :
      `${companyA} / ${companyB}`;

    const claimOut: ClaimVerdict = {
      claim_id: claim.claim_id,
      companyKey: claim.companyKey,
      field: claim.field,
      text: claim.text,
      citations: claim.citations,
      support_score: 0,
      verdict: "NOT_SUPPORTED",
      matchedEvidence: [],
    };

    if (isDataNotAvailable(claim.text)) {
      claimOut.verdict = "DATA_NOT_AVAILABLE";
      dataNotAvailableCount++;
      claimVerdicts.push(claimOut);
      continue;
    }

    eligibleClaimCount++;

    if (!Array.isArray(claim.citations) || claim.citations.length === 0) {
      missingCitationCount++;
      claimOut.verdict = "NOT_SUPPORTED";
      notSupportedCount++;
      claimVerdicts.push(claimOut);
      continue;
    }

    const normalizedClaimCitations = claim.citations.map(normalizeUrl).filter(Boolean);
    const invalid = normalizedClaimCitations.filter((u) => !allowedSet.has(u));

    if (invalid.length > 0) {
      badCitationCount += invalid.length;
      badCitations.push(
        ...invalid.map((u) => ({ claim_id: claim.claim_id, field: claim.field, url: u }))
      );
      claimOut.verdict = "INVALID_CITATIONS";
      notSupportedCount++;
      claimVerdicts.push(claimOut);
      continue;
    }

    const citedEvidenceDocs = normalizedClaimCitations.flatMap(
      (u) => evidenceByUrl.get(u) || []
    );
    if (!citedEvidenceDocs.length) {
      badCitationCount += normalizedClaimCitations.length;
      claimOut.verdict = "INVALID_CITATIONS";
      notSupportedCount++;
      claimVerdicts.push(claimOut);
      continue;
    }

    let bestScore = 0;
    for (const ev of citedEvidenceDocs) {
      const score = computeSupportScore(`${claim.field}: ${claim.text}`, ev, companyName);
      if (score > bestScore) bestScore = score;
    }

    const bestMatches = citedEvidenceDocs.map((ev) => ({
      evidence_id: ev.evidence_id,
      url: ev.url,
      title: ev.title,
      source_type: ev.source_type,
    }));

    const verdict = verdictFromScore(bestScore);
    claimOut.support_score = bestScore;
    claimOut.verdict = verdict;
    claimOut.matchedEvidence = bestMatches;

    if (verdict === "SUPPORTED") supportedCount++;
    else if (verdict === "UNCLEAR") unclearCount++;
    else notSupportedCount++;

    claimVerdicts.push(claimOut);
  }

  const supportRateStrict = eligibleClaimCount
    ? supportedCount / eligibleClaimCount
    : 0;
  const supportRateWeighted = eligibleClaimCount
    ? (supportedCount + 0.5 * unclearCount) / eligibleClaimCount
    : 0;

  let status: "PASS" | "WARN" | "FAIL" = "PASS";
  const reasons: string[] = [];

  if (evidenceIndex.length === 0) {
    status = "FAIL";
    reasons.push("No evidenceIndex was provided to Eval Phase 2.");
  }
  if (missingCitationCount > 0) {
    status = "FAIL";
    reasons.push(`${missingCitationCount} claim(s) had no citations.`);
  }
  if (badCitationCount > 0) {
    status = "FAIL";
    reasons.push(`${badCitationCount} citation(s) were not found in allowed evidence URLs.`);
  }
  if (supportRateWeighted < CONTRACT.warnSupportRate) {
    status = "FAIL";
    reasons.push(
      `Support rate ${supportRateWeighted.toFixed(2)} is below minimum threshold ${CONTRACT.warnSupportRate}.`
    );
  } else if (supportRateWeighted < CONTRACT.passSupportRate && status !== "FAIL") {
    status = "WARN";
    reasons.push(
      `Support rate ${supportRateWeighted.toFixed(2)} is below PASS threshold ${CONTRACT.passSupportRate}.`
    );
  }

  return {
    run_id,
    run_started_at,
    ok: status !== "FAIL",
    status,
    failedPhase: status === "FAIL" ? "eval_phase_2" : null,
    reason: status === "FAIL" ? "semantic_eval_failed" : null,
    details: status === "FAIL" ? reasons : [],
    reasons,
    result,
    companyA,
    companyB,
    evalPhase2: {
      contract: CONTRACT,
      citationSummary: { missingCitationCount, badCitationCount, badCitations },
      claimStats: {
        totalClaims: claims.length,
        eligibleClaimCount,
        dataNotAvailableCount,
        supportedCount,
        unclearCount,
        notSupportedCount,
        supportRateStrict: Number(supportRateStrict.toFixed(4)),
        supportRateWeighted: Number(supportRateWeighted.toFixed(4)),
      },
      claimVerdicts,
      evaluated_at: new Date().toISOString(),
    },
  };
}
