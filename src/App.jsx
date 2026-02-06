import React, { useMemo, useState } from "react";

/**
 * AEC Acquisition Target Screener (Plain React) - Granular Responses Everywhere
 * - No Tailwind / no shadcn
 * - LocalStorage persistence
 * - CSV export
 * - 3-column layout: Companies (left) | Scoring (middle) | Tier lists (right)
 * - Data entry fields: Revenue, Employees, HQ Location in "Score a company"
 * - Left company list shows Revenue + Employees
 * - ALL questions use one of 4 granular dropdown sets:
 *    - fit5, risk5, momentum5, readiness5 (each has 6 options incl Unknown)
 */

const STORAGE_KEY = "aec-acq-screener:v4";

// ---------- Universal option sets (granular) ----------
const OPTION_SETS = {
  fit5: {
    label: "Fit",
    options: [
      { value: "ideal", label: "Ideal / Strong", score: 100 },
      { value: "good", label: "Good", score: 80 },
      { value: "ok", label: "Acceptable", score: 60 },
      { value: "weak", label: "Weak", score: 30 },
      { value: "red", label: "Red flag", score: 0 },
      { value: "unknown", label: "Unknown", score: 35 },
    ],
  },
  risk5: {
    label: "Risk",
    options: [
      { value: "low", label: "Low", score: 100 },
      { value: "med", label: "Medium", score: 75 },
      { value: "high", label: "High", score: 45 },
      { value: "critical", label: "Critical", score: 15 },
      { value: "deal", label: "Deal-breaker", score: 0 },
      { value: "unknown", label: "Unknown", score: 35 },
    ],
  },
  momentum5: {
    label: "Momentum",
    options: [
      { value: "strong", label: "Strong growth / expanding", score: 100 },
      { value: "solid", label: "Solid growth", score: 80 },
      { value: "stable", label: "Stable", score: 60 },
      { value: "decline", label: "Declining", score: 25 },
      { value: "struct", label: "Structural decline", score: 0 },
      { value: "unknown", label: "Unknown", score: 35 },
    ],
  },
  readiness5: {
    label: "Readiness",
    options: [
      { value: "active", label: "Actively exploring / clear intent", score: 100 },
      { value: "open", label: "Open to discussion", score: 80 },
      { value: "unclear", label: "Unclear", score: 60 },
      { value: "not", label: "Likely not for sale", score: 25 },
      { value: "explicit", label: "Explicitly not for sale", score: 0 },
      { value: "unknown", label: "Unknown", score: 35 },
    ],
  },
};

const DEFAULT_ANSWER = "unknown";

// ---------- Weights / thresholds ----------
const defaultWeights = {
  strategy_fit: 22,
  target_profile: 10,
  sell_readiness: 18,
  financial_quality: 16,
  talent_delivery: 12,
  culture_integration: 12,
  competitive_dynamics: 6,
  deal_feasibility: 4,
};

const defaultThresholds = { tier1: 78, tier2: 62 };

// ---------- Sections & questions (all mapped to option sets) ----------
const SECTIONS = [
  {
    id: "strategy_fit",
    title: "Strategic Fit",
    description:
      "Does this target advance the acquisition thesis (capability, geography, clients, talent)?",
    questions: [
      { id: "thesis_alignment", label: "Alignment to thesis / target niche", set: "fit5" },
      { id: "capability_gap", label: "Closes a high-priority capability gap", set: "fit5" },
      { id: "client_access", label: "Improves access to priority clients / sectors", set: "fit5" },
      { id: "geo_value", label: "Adds priority geography / platform foothold", set: "fit5" },
    ],
  },
  {
    id: "target_profile",
    title: "Target Profile",
    description:
      "Does it fit your ideal target profile constraints (size, services, ownership structure)?",
    questions: [
      { id: "size_fit", label: "Size fit (revenue/headcount) vs ideal range", set: "fit5" },
      { id: "service_mix_fit", label: "Service mix fits desired portfolio", set: "fit5" },
      { id: "ownership_fit", label: "Ownership structure is workable (founder/ESOP/PE)", set: "fit5" },
      { id: "client_concentration_risk", label: "Client concentration risk", set: "risk5" },
    ],
  },
  {
    id: "sell_readiness",
    title: "Ownership & Sell-Readiness",
    description: "Signals that a sale is plausible in the next 6–24 months.",
    questions: [
      { id: "succession_driver", label: "Succession gap / founder dependence drives openness", set: "readiness5" },
      { id: "leadership_transition", label: "Leadership transition / succession planning underway", set: "readiness5" },
      { id: "liquidity_pressure", label: "Liquidity need / ESOP pressure / recap drivers", set: "readiness5" },
      { id: "signals_sale", label: "Direct/indirect signals of transaction appetite", set: "readiness5" },
    ],
  },
  {
    id: "financial_quality",
    title: "Financial Quality",
    description: "Is the business healthy and likely to meet return hurdles?",
    questions: [
      { id: "growth_trend", label: "Revenue growth trend", set: "momentum5" },
      { id: "profitability_quality", label: "Profitability & earnings quality (normalized)", set: "fit5" },
      { id: "backlog_strength", label: "Backlog / pipeline strength", set: "momentum5" },
      { id: "cyclicality_risk", label: "Cyclicality / sector exposure risk", set: "risk5" },
    ],
  },
  {
    id: "talent_delivery",
    title: "Talent & Delivery Strength",
    description: "Can delivery sustain post-close? Is key-person risk manageable?",
    questions: [
      { id: "bench_strength", label: "Depth beyond founder (leadership bench)", set: "fit5" },
      { id: "key_person_risk", label: "Key-person dependence risk", set: "risk5" },
      { id: "credential_strength", label: "Scarce credentials / niche expertise value", set: "fit5" },
      { id: "attrition_risk", label: "Attrition risk post-close", set: "risk5" },
    ],
  },
  {
    id: "culture_integration",
    title: "Culture & Integration",
    description: "Will integration work without breaking delivery or talent retention?",
    questions: [
      { id: "culture_fit", label: "Culture fit", set: "fit5" },
      { id: "operating_model_fit", label: "Operating model compatibility", set: "fit5" },
      { id: "tech_stack_fit", label: "Tech stack compatibility (BIM/CAD/ERP/CRM)", set: "fit5" },
      { id: "integration_complexity", label: "Integration complexity risk", set: "risk5" },
    ],
  },
  {
    id: "competitive_dynamics",
    title: "Competitive Dynamics",
    description: "How contested is this target and what is our strategic positioning?",
    questions: [
      { id: "competitive_interest", label: "Likelihood of competing buyers", set: "risk5" },
      { id: "best_home", label: "We are a compelling 'best home' vs alternatives", set: "fit5" },
    ],
  },
  {
    id: "deal_feasibility",
    title: "Deal Feasibility",
    description: "Is there a realistic approach path and deal structure?",
    questions: [
      { id: "intro_path", label: "Warm intro / approach path", set: "fit5" },
      { id: "structure_flex", label: "Structure flexibility (earnout/rollover/partial)", set: "fit5" },
    ],
  },
];

// ---------- Helpers ----------
function sectionScore(section, answers) {
  let total = 0;
  let count = 0;

  for (const q of section.questions) {
    const set = OPTION_SETS[q.set];
    const v = answers?.[q.id] ?? DEFAULT_ANSWER;

    const option = set.options.find((o) => o.value === v) || set.options.find((o) => o.value === "unknown");
    total += option ? option.score : 35;
    count += 1;
  }

  return count ? total / count : 0;
}

function weightedTotalScore(company, weights) {
  let sum = 0;
  let weightSum = 0;

  for (const section of SECTIONS) {
    const w = weights[section.id] ?? 0;
    const s = sectionScore(section, company.answers);
    sum += (s * w) / 100;
    weightSum += w;
  }

  return weightSum ? sum / (weightSum / 100) : 0; // normalize 0..100
}

function tierForScore(score, thresholds) {
  if (score >= thresholds.tier1) return "Tier 1";
  if (score >= thresholds.tier2) return "Tier 2";
  return "Watchlist";
}

function useLocalStorageState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setAndPersist = (updater) => {
    setState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  return [state, setAndPersist];
}

function makeDefaultAnswers() {
  const entries = [];
  for (const s of SECTIONS) {
    for (const q of s.questions) {
      entries.push([q.id, DEFAULT_ANSWER]);
    }
  }
  return Object.fromEntries(entries);
}

function starterCompany() {
  return {
    id: crypto.randomUUID(),
    name: "",
    website: "",
    hqLocation: "",
    revenue: "",
    employees: "",
    notes: "",
    answers: makeDefaultAnswers(),
  };
}

function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function badgeStyle(tier) {
  const base = {
    display: "inline-block",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: "#fff",
    whiteSpace: "nowrap",
  };
  if (tier === "Tier 1") return { ...base, borderColor: "#111", background: "#111", color: "#fff" };
  if (tier === "Tier 2") return { ...base, borderColor: "#666", background: "#f2f2f2", color: "#111" };
  return { ...base, borderColor: "#ddd", background: "#fff", color: "#111" };
}

function buildOptionsForSet(setKey) {
  const set = OPTION_SETS[setKey];
  return set ? set.options.map(({ value, label }) => ({ value, label })) : [];
}

// ---------- UI ----------
export default function App() {
  const [data, setData] = useLocalStorageState(STORAGE_KEY, {
    companies: [],
    weights: defaultWeights,
    thresholds: defaultThresholds,
  });

  const [activeCompanyId, setActiveCompanyId] = useState(
    data.companies?.[0]?.id ?? null
  );

  const activeCompany = useMemo(
    () => data.companies.find((c) => c.id === activeCompanyId) ?? null,
    [data.companies, activeCompanyId]
  );

  const computed = useMemo(() => {
    const rows = data.companies.map((c) => {
      const total = weightedTotalScore(c, data.weights);
      const tier = tierForScore(total, data.thresholds);
      const sections = Object.fromEntries(
        SECTIONS.map((s) => [s.id, sectionScore(s, c.answers)])
      );
      return { ...c, total, tier, sections };
    });

    const byTier = {
      "Tier 1": rows.filter((r) => r.tier === "Tier 1").sort((a, b) => b.total - a.total),
      "Tier 2": rows.filter((r) => r.tier === "Tier 2").sort((a, b) => b.total - a.total),
      Watchlist: rows.filter((r) => r.tier === "Watchlist").sort((a, b) => b.total - a.total),
    };

    return { rows, byTier };
  }, [data.companies, data.weights, data.thresholds]);

  const weightTotal = useMemo(
    () => Object.values(data.weights).reduce((a, b) => a + b, 0),
    [data.weights]
  );

  const addCompany = () => {
    const c = starterCompany();
    setData((prev) => ({ ...prev, companies: [c, ...prev.companies] }));
    setActiveCompanyId(c.id);
  };

  const updateCompany = (id, patch) => {
    setData((prev) => ({
      ...prev,
      companies: prev.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const updateAnswer = (companyId, qid, value) => {
    setData((prev) => ({
      ...prev,
      companies: prev.companies.map((c) =>
        c.id === companyId ? { ...c, answers: { ...c.answers, [qid]: value } } : c
      ),
    }));
  };

  const deleteCompany = (id) => {
    setData((prev) => ({ ...prev, companies: prev.companies.filter((c) => c.id !== id) }));
    if (activeCompanyId === id) {
      const next = data.companies.find((c) => c.id !== id)?.id ?? null;
      setActiveCompanyId(next);
    }
  };

  const exportCSV = () => {
    const header = [
      "Tier",
      "Total Score",
      "Company",
      "Website",
      "HQ Location",
      "Revenue",
      "Employees",
      ...SECTIONS.map((s) => `${s.title} (0-100)`),
      "Notes",
    ];

    const rows = computed.rows
      .slice()
      .sort((a, b) => {
        const order = { "Tier 1": 0, "Tier 2": 1, Watchlist: 2 };
        return order[a.tier] - order[b.tier] || b.total - a.total;
      })
      .map((r) => [
        r.tier,
        r.total.toFixed(1),
        r.name,
        r.website,
        r.hqLocation,
        r.revenue,
        r.employees,
        ...SECTIONS.map((s) => (r.sections?.[s.id] ?? 0).toFixed(1)),
        r.notes,
      ]);

    downloadText(`aec-targets_${new Date().toISOString().slice(0, 10)}.csv`, toCSV([header, ...rows]));
  };

  const resetAll = () => {
    setData({ companies: [], weights: defaultWeights, thresholds: defaultThresholds });
    setActiveCompanyId(null);
  };

  const activeTotal = activeCompany ? weightedTotalScore(activeCompany, data.weights) : 0;
  const activeTier = activeCompany ? tierForScore(activeTotal, data.thresholds) : "Watchlist";

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>AEC Acquisition Target Screener</h1>
            <div style={styles.sub}>
              Granular scoring across all questions (Fit / Risk / Momentum / Readiness). Saved in this browser.
            </div>
          </div>

          <div style={styles.headerButtons}>
            <button style={styles.primaryBtn} onClick={addCompany}>+ Add company</button>
            <button style={styles.btn} onClick={exportCSV} disabled={data.companies.length === 0}>
              Export CSV
            </button>
            <button style={styles.ghostBtn} onClick={resetAll}>
              Reset
            </button>
          </div>
        </div>

        <div style={styles.smallNote}>
          Weights total: <b>{weightTotal}%</b> (scores normalized automatically)
        </div>

        <div style={styles.grid}>
          {/* Left: Companies */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Companies</div>
            {computed.rows.length === 0 ? (
              <div style={styles.muted}>No companies yet. Click “Add company”.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {computed.rows
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCompanyId(c.id)}
                      style={{
                        ...styles.companyRow,
                        borderColor: c.id === activeCompanyId ? "#333" : "#ddd",
                        background: c.id === activeCompanyId ? "#f7f7f7" : "white",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={styles.companyName}>
                            {c.name?.trim() ? c.name : "(Unnamed company)"}
                          </div>

                          <div style={styles.smallMuted}>
                            Score <b>{c.total.toFixed(1)}</b> • {c.hqLocation || "HQ unknown"} • {c.tier}
                          </div>

                          <div style={styles.smallMuted}>
                            {c.revenue ? `Rev: ${c.revenue}` : "Rev: —"}
                            {" • "}
                            {c.employees ? `Emp: ${c.employees}` : "Emp: —"}
                          </div>
                        </div>

                        <div style={badgeStyle(c.tier)}>{c.tier}</div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Middle: Scoring */}
          <div style={styles.card}>
            {!activeCompany ? (
              <div style={styles.muted}>Select or add a company to score.</div>
            ) : (
              <div>
                <div style={styles.cardTitle}>Score a company</div>

                <div style={styles.formGrid3}>
                  <div>
                    <div style={styles.label}>Company name</div>
                    <input
                      style={styles.input}
                      value={activeCompany.name}
                      onChange={(e) => updateCompany(activeCompany.id, { name: e.target.value })}
                      placeholder="e.g., ABC Structural Engineers"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Website</div>
                    <input
                      style={styles.input}
                      value={activeCompany.website}
                      onChange={(e) => updateCompany(activeCompany.id, { website: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>

                  <div>
                    <div style={styles.label}>HQ location</div>
                    <input
                      style={styles.input}
                      value={activeCompany.hqLocation}
                      onChange={(e) => updateCompany(activeCompany.id, { hqLocation: e.target.value })}
                      placeholder="e.g., Denver, CO"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Revenue (optional)</div>
                    <input
                      style={styles.input}
                      value={activeCompany.revenue}
                      onChange={(e) => updateCompany(activeCompany.id, { revenue: e.target.value })}
                      placeholder="e.g., $25M"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Employees (optional)</div>
                    <input
                      style={styles.input}
                      value={activeCompany.employees}
                      onChange={(e) => updateCompany(activeCompany.id, { employees: e.target.value })}
                      placeholder="e.g., 120"
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 10 }}>
                    <div style={styles.smallMuted}>
                      Total: <b>{activeTotal.toFixed(1)}</b> •{" "}
                      <span style={badgeStyle(activeTier)}>{activeTier}</span>
                    </div>
                    <button style={styles.dangerBtn} onClick={() => deleteCompany(activeCompany.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={styles.label}>Notes</div>
                  <textarea
                    style={styles.textarea}
                    value={activeCompany.notes}
                    onChange={(e) => updateCompany(activeCompany.id, { notes: e.target.value })}
                    placeholder="Key takeaways, diligence questions, contact path, etc."
                  />
                </div>

                <hr style={{ margin: "16px 0" }} />

                {SECTIONS.map((section) => {
                  const secScore = sectionScore(section, activeCompany.answers);
                  const weight = data.weights[section.id] ?? 0;

                  return (
                    <div key={section.id} style={{ marginBottom: 18 }}>
                      <div style={styles.sectionHeader}>
                        <div style={{ minWidth: 0 }}>
                          <div style={styles.sectionTitle}>{section.title}</div>
                          <div style={styles.smallMuted}>{section.description}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800 }}>{secScore.toFixed(1)}</div>
                          <div style={styles.smallMuted}>Weight {weight}%</div>
                        </div>
                      </div>

                      <div style={styles.qGrid}>
                        {section.questions.map((q) => {
                          const v = activeCompany.answers?.[q.id] ?? DEFAULT_ANSWER;
                          const setLabel = OPTION_SETS[q.set]?.label ?? "Set";

                          return (
                            <div key={q.id} style={styles.qCard}>
                              <div style={{ fontWeight: 800, marginBottom: 6 }}>{q.label}</div>
                              <div style={styles.microMuted}>Response type: {setLabel}</div>

                              <select
                                style={{ ...styles.input, marginTop: 8 }}
                                value={v}
                                onChange={(e) => updateAnswer(activeCompany.id, q.id, e.target.value)}
                              >
                                {buildOptionsForSet(q.set).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Tier lists */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Tier Lists</div>

            <div style={styles.thresholdBox}>
              <div style={styles.smallMuted}>
                Tier 1 ≥ <b>{data.thresholds.tier1}</b>
                <br />
                Tier 2 ≥ <b>{data.thresholds.tier2}</b>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <TierColumn title="Tier 1" rows={computed.byTier["Tier 1"]} />
              <TierColumn title="Tier 2" rows={computed.byTier["Tier 2"]} />
              <TierColumn title="Watchlist" rows={computed.byTier["Watchlist"]} />
            </div>

            <hr style={{ margin: "14px 0" }} />

            <div style={styles.cardTitle}>Full Matrix (quick)</div>
            {computed.rows.length === 0 ? (
              <div style={styles.smallMuted}>Add companies to see the matrix.</div>
            ) : (
              <div style={styles.miniTableWrap}>
                <table style={styles.miniTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Tier</th>
                      <th style={styles.th}>Company</th>
                      <th style={styles.th}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.rows
                      .slice()
                      .sort((a, b) => {
                        const order = { "Tier 1": 0, "Tier 2": 1, Watchlist: 2 };
                        return order[a.tier] - order[b.tier] || b.total - a.total;
                      })
                      .map((r) => (
                        <tr key={r.id}>
                          <td style={styles.td}>
                            <span style={badgeStyle(r.tier)}>{r.tier}</span>
                          </td>
                          <td style={styles.td}>
                            <span style={{ fontWeight: 800 }}>
                              {r.name?.trim() ? r.name : "(Unnamed)"}
                            </span>
                            <div style={styles.smallMuted}>{r.hqLocation || "—"}</div>
                            <div style={styles.smallMuted}>
                              {r.revenue ? `Rev: ${r.revenue}` : "Rev: —"}{" • "}
                              {r.employees ? `Emp: ${r.employees}` : "Emp: —"}
                            </div>
                          </td>
                          <td style={styles.td}><b>{r.total.toFixed(1)}</b></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TierColumn({ title, rows }) {
  return (
    <div style={styles.tierCol}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <div style={styles.smallMuted}>{rows.length}</div>
      </div>

      {rows.length === 0 ? (
        <div style={styles.smallMuted}>None yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={styles.tierRow}>
              <div style={{ fontWeight: 900 }}>{r.name?.trim() ? r.name : "(Unnamed)"}</div>
              <div style={styles.smallMuted}>
                Score <b>{r.total.toFixed(1)}</b> • {r.hqLocation || "—"}
              </div>
              <div style={styles.smallMuted}>
                {r.revenue ? `Rev: ${r.revenue}` : "Rev: —"}{" • "}
                {r.employees ? `Emp: ${r.employees}` : "Emp: —"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Styles ----------
const styles = {
  page: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    background: "#fafafa",
    minHeight: "100vh",
  },
  container: { maxWidth: 1400, margin: "0 auto", padding: 20 },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    flexWrap: "wrap",
  },
  h1: { margin: 0, fontSize: 26 },
  sub: { color: "#555", marginTop: 6, maxWidth: 950 },
  headerButtons: { display: "flex", gap: 10, flexWrap: "wrap" },

  btn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ccc",
    background: "white",
    cursor: "pointer",
  },
  ghostBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #eee",
    background: "#f6f6f6",
    cursor: "pointer",
  },
  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #333",
    background: "#111",
    color: "white",
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #b00",
    background: "#b00",
    color: "white",
    cursor: "pointer",
  },

  smallNote: { marginTop: 10, color: "#666", fontSize: 12 },
  smallMuted: { color: "#666", fontSize: 12, marginTop: 4 },
  microMuted: { color: "#777", fontSize: 11 },

  grid: {
    display: "grid",
    gridTemplateColumns: "320px 1fr 380px",
    gap: 14,
    marginTop: 14,
    alignItems: "start",
  },

  card: { background: "white", border: "1px solid #e5e5e5", borderRadius: 14, padding: 14 },
  cardTitle: { fontWeight: 900, marginBottom: 10 },

  muted: { color: "#666", padding: 10, background: "#f5f5f5", borderRadius: 12 },

  companyRow: {
    textAlign: "left",
    width: "100%",
    borderRadius: 12,
    border: "1px solid #ddd",
    padding: 10,
    background: "white",
    cursor: "pointer",
  },
  companyName: {
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  formGrid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 },

  label: { fontSize: 12, color: "#444", marginBottom: 6, fontWeight: 800 },
  input: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc" },
  textarea: { width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", minHeight: 80 },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
  },
  sectionTitle: { fontWeight: 900 },

  qGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  qCard: { border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" },

  tierCol: { border: "1px solid #eee", borderRadius: 12, padding: 10, background: "#fff" },
  tierRow: { border: "1px solid #f0f0f0", borderRadius: 10, padding: 8, background: "#fafafa" },

  thresholdBox: {
    border: "1px solid #eee",
    borderRadius: 12,
    padding: 10,
    background: "#fafafa",
    marginBottom: 12,
  },

  miniTableWrap: {
    border: "1px solid #eee",
    borderRadius: 12,
    overflow: "auto",
    maxHeight: 360,
  },
  miniTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    position: "sticky",
    top: 0,
  },
  td: { padding: 10, borderBottom: "1px solid #f2f2f2", verticalAlign: "top" },
};
