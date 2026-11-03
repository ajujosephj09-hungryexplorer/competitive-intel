"use client";

import { useState } from "react";

interface TableRow {
  field: string;
  companyA: string;
  companyB: string;
}

interface CompareResult {
  ok: boolean;
  status: string;
  result?: { table: TableRow[]; summary: string };
  reason?: string;
  details?: string[];
}

export default function Home() {
  const [companyA, setCompanyA] = useState("");
  const [companyB, setCompanyB] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function compare() {
    if (!companyA.trim() || !companyB.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyA: companyA.trim(), companyB: companyB.trim() }),
      });
      const data: CompareResult = await res.json();
      if (data.ok && data.result) {
        setResult(data);
      } else {
        setError(data.details?.join("; ") || data.reason || "Unknown error");
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") compare();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Competitive Analysis</h1>
        <p className="text-gray-400 mb-8">
          Enter two company names to generate an evidence based comparison.
        </p>

        <div className="flex gap-4 mb-6">
          <input
            type="text"
            placeholder="Company A"
            value={companyA}
            onChange={(e) => setCompanyA(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Company B"
            value={companyB}
            onChange={(e) => setCompanyB(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={compare}
            disabled={loading || !companyA.trim() || !companyB.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
          >
            {loading ? "Analyzing..." : "Compare"}
          </button>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">
            Searching and analyzing... this takes 10-20 seconds.
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {result?.result && (
          <div>
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Field</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">{companyA}</th>
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">{companyB}</th>
                </tr>
              </thead>
              <tbody>
                {result.result.table.map((row, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-900/50">
                    <td className="py-3 px-4 font-medium text-gray-300">{row.field}</td>
                    <td className="py-3 px-4 text-gray-400">{row.companyA}</td>
                    <td className="py-3 px-4 text-gray-400">{row.companyB}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">Summary</h3>
              <p className="text-gray-300">{result.result.summary}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
