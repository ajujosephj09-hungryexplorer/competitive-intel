/**
 * Database layer — Supabase writes for analysis_runs and claim_verdicts
 * Replaces the n8n analysis_runs and claim_verdicts table nodes
 *
 * Gracefully skips if SUPABASE_URL is not configured.
 */

import type { Eval2Result, ClaimVerdict } from "./eval2";

interface SupabaseConfig {
  url: string;
  key: string;
}

function getConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function supabaseInsert(
  config: SupabaseConfig,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const res = await fetch(`${config.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Supabase insert to ${table} failed (${res.status}):`, text);
  }
}

export async function persistAnalysisRun(eval2: Eval2Result): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const stats = eval2.evalPhase2.claimStats;

  await supabaseInsert(config, "analysis_runs", [
    {
      run_id: eval2.run_id,
      run_started_at: eval2.run_started_at,
      company_a: eval2.companyA,
      company_b: eval2.companyB,
      eval1_status: "PASS",
      eval2_status: eval2.status,
      final_status: eval2.status,
      total_claims: stats.totalClaims,
      eligible_claim_count: stats.eligibleClaimCount,
      data_not_available_count: stats.dataNotAvailableCount,
      supported_count: stats.supportedCount,
      unclear_count: stats.unclearCount,
      not_supported_count: stats.notSupportedCount,
      missing_citation_count: eval2.evalPhase2.citationSummary.missingCitationCount,
      bad_citation_count: eval2.evalPhase2.citationSummary.badCitationCount,
      support_rate_strict: stats.supportRateStrict,
      support_rate_weighted: stats.supportRateWeighted,
      reasons_json: JSON.stringify(eval2.reasons),
      details_json: JSON.stringify(eval2.details),
      result_json: JSON.stringify(eval2.result),
      eval2_json: JSON.stringify(eval2.evalPhase2),
    },
  ]);
}

export async function persistClaimVerdicts(
  runId: string,
  verdicts: ClaimVerdict[],
): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const rows = verdicts.map((cv) => ({
    run_id: runId,
    claim_id: cv.claim_id,
    company_key: cv.companyKey,
    field_name: cv.field,
    claim_text: cv.text,
    verdict: cv.verdict,
    support_score: cv.support_score,
    citations_json: JSON.stringify(cv.citations || []),
    matched_evidence_json: JSON.stringify(cv.matchedEvidence || []),
  }));

  await supabaseInsert(config, "claim_verdicts", rows);
}
