/**
 * Eval Phase 1 — Schema validation (hard gate)
 * Strips code fences, parses JSON, validates structure
 * v2: Accepts optional citation arrays per claim
 */

import { z } from "zod";

const REQUIRED_FIELDS = [
  "Industry",
  "Target Market",
  "Year Founded",
  "Key Products or Services",
  "Market Position",
  "Notable Achievements",
] as const;

const tableRowSchema = z.object({
  field: z.string(),
  companyA: z.string(),
  companyB: z.string(),
  companyA_citations: z.array(z.string()).optional(),
  companyB_citations: z.array(z.string()).optional(),
});

const analysisSchema = z.object({
  table: z.array(tableRowSchema),
  summary: z.string(),
  summary_citations: z.array(z.string()).optional(),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;

export type ValidationResult =
  | { ok: true; status: "PASS"; result: AnalysisResult }
  | { ok: false; status: "FAIL"; reason: string; details: string[]; rawOutput?: string };

function stripCodeFences(s: string): string {
  let t = (s ?? "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "");
  t = t.replace(/```$/i, "");
  return t.trim();
}

export function validateAndParse(rawOutput: string): ValidationResult {
  const cleaned = stripCodeFences(rawOutput);
  const normalized = cleaned.replace(/^\uFEFF/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch (e) {
    return {
      ok: false,
      status: "FAIL",
      reason: "invalid_json",
      details: [String((e as Error)?.message || e)],
      rawOutput: cleaned.slice(0, 20000),
    };
  }

  const errors: string[] = [];

  if (!parsed || typeof parsed !== "object") {
    errors.push("Top-level is not an object.");
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj?.table)) {
    errors.push('"table" must be an array.');
  }

  if (typeof obj?.summary !== "string") {
    errors.push('"summary" must be a string.');
  }

  if (Array.isArray(obj?.table)) {
    (obj.table as unknown[]).forEach((row, i) => {
      if (!row || typeof row !== "object") {
        errors.push(`table[${i}] is not an object.`);
        return;
      }
      const r = row as Record<string, unknown>;
      if (typeof r.field !== "string") errors.push(`table[${i}].field must be string.`);
      if (typeof r.companyA !== "string") errors.push(`table[${i}].companyA must be string.`);
      if (typeof r.companyB !== "string") errors.push(`table[${i}].companyB must be string.`);
    });

    const fieldsPresent = new Set(
      (obj.table as { field?: string }[]).map((r) => r?.field).filter(Boolean)
    );
    REQUIRED_FIELDS.forEach((f) => {
      if (!fieldsPresent.has(f)) errors.push(`Missing required field row: "${f}"`);
    });
  }

  if (errors.length) {
    return {
      ok: false,
      status: "FAIL",
      reason: "schema_invalid",
      details: errors,
      rawOutput: cleaned.slice(0, 20000),
    };
  }

  const result = analysisSchema.parse(parsed);
  return { ok: true, status: "PASS", result };
}
