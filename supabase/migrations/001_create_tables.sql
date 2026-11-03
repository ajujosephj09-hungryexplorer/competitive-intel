-- Competitive Intelligence System — Eval tables
-- Derived from n8n internal tables (analysis_runs + claim_verdicts)

create table if not exists analysis_runs (
  id            bigint generated always as identity primary key,
  run_id        text not null unique,
  created_at    timestamptz not null default now(),
  run_started_at timestamptz,
  company_a     text not null,
  company_b     text not null,
  eval1_status  text,
  eval1_reason  text,
  eval2_status  text,
  final_status  text,
  total_claims            int default 0,
  eligible_claim_count    int default 0,
  data_not_available_count int default 0,
  supported_count         int default 0,
  unclear_count           int default 0,
  not_supported_count     int default 0,
  missing_citation_count  int default 0,
  bad_citation_count      int default 0,
  support_rate_strict     numeric(6,4) default 0,
  support_rate_weighted   numeric(6,4) default 0,
  reasons_json  jsonb default '[]'::jsonb,
  details_json  jsonb default '[]'::jsonb,
  result_json   jsonb default '{}'::jsonb,
  eval2_json    jsonb default '{}'::jsonb
);

create table if not exists claim_verdicts (
  id                      bigint generated always as identity primary key,
  run_id                  text not null references analysis_runs(run_id),
  created_at              timestamptz not null default now(),
  claim_id                text not null,
  company_key             text not null,
  field_name              text not null,
  claim_text              text,
  verdict                 text not null,
  support_score           numeric(6,4),
  citations_json          jsonb default '[]'::jsonb,
  matched_evidence_json   jsonb default '[]'::jsonb
);

-- Indexes for common queries
create index if not exists idx_analysis_runs_company_a on analysis_runs(company_a);
create index if not exists idx_analysis_runs_company_b on analysis_runs(company_b);
create index if not exists idx_analysis_runs_final_status on analysis_runs(final_status);
create index if not exists idx_claim_verdicts_run_id on claim_verdicts(run_id);
create index if not exists idx_claim_verdicts_verdict on claim_verdicts(verdict);

-- RLS: allow service role full access
alter table analysis_runs enable row level security;
alter table claim_verdicts enable row level security;

create policy "Service role full access on analysis_runs"
  on analysis_runs for all
  using (true)
  with check (true);

create policy "Service role full access on claim_verdicts"
  on claim_verdicts for all
  using (true)
  with check (true);
