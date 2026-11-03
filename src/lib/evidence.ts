/**
 * Evidence indexing — replaces the enhanced Shape Evidence node in v2
 * Creates indexed evidence with IDs and source classification
 */

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface IndexedEvidence {
  evidence_id: string;
  url: string;
  title: string;
  content: string;
  score: number;
  source_type: "reference_or_publisher" | "other";
}

const REFERENCE_DOMAINS = [
  "wikipedia.org",
  "forbes.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "nytimes.com",
  "ft.com",
  "bbc.com",
  "cnbc.com",
  "businessinsider.com",
  "techcrunch.com",
  "crunchbase.com",
  "sec.gov",
  "marketwatch.com",
  "yahoo.com",
  "investopedia.com",
  "statista.com",
];

function classifySource(url: string): "reference_or_publisher" | "other" {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    for (const domain of REFERENCE_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return "reference_or_publisher";
      }
    }
  } catch {
    // invalid URL
  }
  return "other";
}

export function buildEvidenceIndex(
  evidenceA: TavilyResult[],
  evidenceB: TavilyResult[]
): {
  indexedA: IndexedEvidence[];
  indexedB: IndexedEvidence[];
  allEvidence: IndexedEvidence[];
  allowedUrls: string[];
} {
  const indexedA = evidenceA.map((e, i) => ({
    evidence_id: `A${i + 1}`,
    url: e.url,
    title: e.title,
    content: e.content,
    score: e.score,
    source_type: classifySource(e.url),
  }));

  const indexedB = evidenceB.map((e, i) => ({
    evidence_id: `B${i + 1}`,
    url: e.url,
    title: e.title,
    content: e.content,
    score: e.score,
    source_type: classifySource(e.url),
  }));

  const allEvidence = [...indexedA, ...indexedB];
  const allowedUrls = allEvidence.map((e) => e.url);

  return { indexedA, indexedB, allEvidence, allowedUrls };
}
