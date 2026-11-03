/**
 * POST /api/compare
 * Full v2 pipeline replacing all n8n nodes:
 *   Webhook → Code in JavaScript → SearchA/SearchB → Merge1 → Shape Evidence
 *   → AI Agent (Gemini) → Eval1 (schema) → Merge2 → Eval2 (contracts & scoring)
 *   → DB writes (analysis_runs + claim_verdicts) → Respond
 */

import { NextRequest, NextResponse } from "next/server";
import { tavilySearch } from "@/lib/tavily";
import { buildEvidenceIndex } from "@/lib/evidence";
import { analyzeCompetitors } from "@/lib/llm";
import { validateAndParse } from "@/lib/schema";
import { runEval2 } from "@/lib/eval2";
import { persistAnalysisRun, persistClaimVerdicts } from "@/lib/db";

function generateRunId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `run_${ts}_${rand}`;
}

export async function POST(req: NextRequest) {
  const run_id = generateRunId();
  const run_started_at = new Date().toISOString();

  try {
    const body = await req.json();

    // --- Node: Code in JavaScript (input normalization) ---
    const companyA = (body?.companyA ?? "").trim();
    const companyB = (body?.companyB ?? "").trim();

    if (!companyA || !companyB) {
      return NextResponse.json(
        { ok: false, status: "FAIL", reason: "missing_input", details: ["companyA and companyB are required"] },
        { status: 400 }
      );
    }

    const queryA = `${companyA} company overview business segments products revenue CEO founded`;
    const queryB = `${companyB} company overview business segments products revenue CEO founded`;

    // --- Nodes: SearchA + SearchB (parallel Tavily searches) ---
    const [rawEvidenceA, rawEvidenceB] = await Promise.all([
      tavilySearch(queryA),
      tavilySearch(queryB),
    ]);

    // --- Node: Shape Evidence + Evidence Index (v2) ---
    if (rawEvidenceA.length === 0 && rawEvidenceB.length === 0) {
      return NextResponse.json(
        { ok: false, status: "FAIL", reason: "no_evidence", details: ["Search returned no results for either company"] },
        { status: 422 }
      );
    }

    const { indexedA, indexedB, allEvidence, allowedUrls } = buildEvidenceIndex(
      rawEvidenceA,
      rawEvidenceB
    );

    // --- Node: AI Agent (Gemini Flash) ---
    const rawOutput = await analyzeCompetitors({
      companyA,
      companyB,
      evidenceA: indexedA,
      evidenceB: indexedB,
    });

    // --- Node: Eval1_Format and Schema validation (hard gate) ---
    const eval1 = validateAndParse(rawOutput);

    if (!eval1.ok) {
      return NextResponse.json(
        {
          run_id,
          ok: false,
          status: "FAIL",
          failedPhase: "hard_gate",
          reason: eval1.reason,
          details: eval1.details,
          rawOutput: eval1.rawOutput,
        },
        { status: 422 }
      );
    }

    // --- Node: Eval2_Contract & Scoring ---
    const eval2 = runEval2({
      run_id,
      run_started_at,
      companyA,
      companyB,
      result: eval1.result,
      evidenceIndex: allEvidence,
      allowedCitationUrls: allowedUrls,
    });

    // --- Nodes: DB writes (fire and forget, non-blocking) ---
    Promise.all([
      persistAnalysisRun(eval2),
      persistClaimVerdicts(run_id, eval2.evalPhase2.claimVerdicts),
    ]).catch((err) => console.error("DB write failed:", err));

    // --- Node: Respond to Webhook ---
    return NextResponse.json(eval2, { status: eval2.ok ? 200 : 422 });
  } catch (e) {
    return NextResponse.json(
      {
        run_id,
        ok: false,
        status: "FAIL",
        reason: "internal_error",
        details: [String((e as Error)?.message || e)],
      },
      { status: 500 }
    );
  }
}
