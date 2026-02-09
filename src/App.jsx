// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * AEC Acquisition Target Screener
 * - 3-column layout: Companies (left) / Score a company (middle) / Tier lists (right)
 * - Company fields: name, revenue, employees, HQ location
 * - 9 questions with granular responses (mapped to numeric scores)
 * - Auto tiering + CSV export
 * - Persistence:
 *    - localhost: LocalStorage
 *    - production: Supabase via /api/companies + /api/company-delete (gated by password cookie)
 * - Cross-browser sync:
 *    - Refresh button
 *    - Auto refresh every 10s (production only)
 */

/* ----------------------------- Environment Helpers ----------------------------- */
const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

/* ----------------------------- Auth Gate ----------------------------- */
function AuthGate({ children, onAuthedChange }) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function check() {
    if (isLocalhost) {
      setAuthed(true);
      setChecking(false);
      onAuthedChange?.(true);
      return;
    }

    setChecking(true);
    setErr("");
    try {
      const r = await fetch("/api/me", { credentials: "include" });
      const j = await r.json();
      const ok = !!j.authed;
      setAuthed(ok);
      onAuthedChange?.(ok);
    } catch {
      setAuthed(false);
      onAuthedChange?.(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(e) {
    e.preventDefault();
    setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!r.ok) {
        setErr("Wrong password.");
        return;
      }
      setPassword("");
      await check();
    } catch {
      setErr("Login failed. Try again.");
    }
  }

  async function logout() {
    if (isLocalhost) return;

    // Call server logout (clears cookie)
    try {
      await fetch("/api/logout", { credentials: "include" });
    } catch {
      // ignore network errors; still flip UI state
    }

    // IMPORTANT: force UI to login screen immediately
    setAuthed(false);
    setChecking(false);
    onAuthedChange?.(false);
  }

  if (checking) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        Checking access…
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={styles.authWrap}>
        <div style={styles.authCard}>
          <div style={styles.authTitle}>Enter password</div>
          <div style={styles.authSub}>This project is protected.</div>
          <form onSubmit={login} style={{ display: "grid", gap: 10 }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={styles.input}
            />
            {err ? <div style={styles.err}>{err}</div> : null}
            <button type="submit" style={styles.primaryBtn}>
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={styles.logoutWrap}>
        <button onClick={logout} style={styles.ghostBtn}>
          Logout
        </button>
      </div>
      {children}
    </>
  );
}

/* ----------------------------- Scoring Model ----------------------------- */
const DIMENSIONS = ["Fit", "Risk", "Momentum", "Readiness"];

const QUESTIONS = [
  {
    key: "q1",
    dimension: "Fit",
    title: "Strategic adjacency to our platform",
    prompt:
      "How directly does this target expand or strengthen our core AEC thesis?",
    options: [
      { label: "Direct core adjacency (same buyer + workflow)", score: 10 },
      { label: "Strong adjacency (shared buyer, nearby workflow)", score: 8 },
      { label: "Moderate adjacency (some overlap)", score: 6 },
      { label: "Weak adjacency (limited overlap)", score: 3 },
      { label: "Not aligned / unclear", score: 0 },
    ],
  },
  {
    key: "q2",
    dimension: "Fit",
    title: "Product differentiation / defensibility",
    prompt: "How unique is the product vs. alternatives?",
    options: [
      { label: "Category-defining + hard to replicate moat", score: 10 },
      { label: "Clear differentiation + defensible IP/data", score: 8 },
      { label: "Some differentiation, but copyable", score: 6 },
      { label: "Commodity-ish", score: 3 },
      { label: "No differentiation", score: 0 },
    ],
  },
  {
    key: "q3",
    dimension: "Momentum",
    title: "Market pull & growth",
    prompt: "What does demand look like right now?",
    options: [
      { label: "Explosive pull (high inbound, short sales cycles)", score: 10 },
      { label: "Strong pull (healthy pipeline + predictable growth)", score: 8 },
      { label: "Stable pull (steady but not accelerating)", score: 6 },
      { label: "Softening pull (growth slowing)", score: 3 },
      { label: "No pull / shrinking", score: 0 },
    ],
  },
  {
    key: "q4",
    dimension: "Momentum",
    title: "Go-to-market efficiency",
    prompt: "How efficient is the growth engine?",
    options: [
      { label: "Best-in-class unit economics (efficient + scalable)", score: 10 },
      { label: "Solid efficiency with scaling path", score: 8 },
      { label: "Mixed efficiency, improvements needed", score: 6 },
      { label: "Inefficient GTM", score: 3 },
      { label: "Broken GTM / unclear economics", score: 0 },
    ],
  },
  {
    key: "q5",
    dimension: "Risk",
    title: "Customer concentration / churn risk",
    prompt: "How risky is revenue concentration and retention?",
    options: [
      { label: "Low concentration + very sticky retention", score: 10 },
      { label: "Manageable concentration + good retention", score: 8 },
      { label: "Some concentration or churn concerns", score: 6 },
      { label: "High concentration or churn risk", score: 3 },
      { label: "Extreme concentration / unstable revenue", score: 0 },
    ],
  },
  {
    key: "q6",
    dimension: "Risk",
    title: "Technical / security / compliance risk",
    prompt: "How strong is engineering quality + security posture?",
    options: [
      { label: "Strong architecture + security best practices", score: 10 },
      { label: "Generally solid with small gaps", score: 8 },
      { label: "Mixed; needs medium remediation", score: 6 },
      { label: "Meaningful risk; major remediation", score: 3 },
      { label: "High risk / unknown / fragile", score: 0 },
    ],
  },
  {
    key: "q7",
    dimension: "Readiness",
    title: "Integration readiness",
    prompt: "How easy will it be to integrate product + data + teams?",
    options: [
      { label: "Integration-ready (APIs, docs, clean data)", score: 10 },
      { label: "Mostly ready; some work needed", score: 8 },
      { label: "Moderate effort; systems need cleanup", score: 6 },
      { label: "Hard integration; messy systems", score: 3 },
      { label: "Very hard / no readiness", score: 0 },
    ],
  },
  {
    key: "q8",
    dimension: "Readiness",
    title: "Team & execution reliability",
    prompt: "Can the team execute through transition and scale?",
    options: [
      { label: "Exceptional team (repeat winners)", score: 10 },
      { label: "Strong team with good track record", score: 8 },
      { label: "Solid but unproven in scale-up", score: 6 },
      { label: "Execution risk / leadership gaps", score: 3 },
      { label: "High risk / unstable team", score: 0 },
    ],
  },
  {
    key: "q9",
    dimension: "Fit",
    title: "Value creation path (synergies)",
    prompt: "How clear is the post-acquisition value creation plan?",
    options: [
      { label: "Obvious synergies + multiple value levers", score: 10 },
      { label: "Clear path with 1–2 strong levers", score: 8 },
      { label: "Some levers, not fully validated", score: 6 },
      { label: "Weak synergy story", score: 3 },
      { label: "No clear path", score: 0 },
    ],
  },
];

const DIMENSION_WEIGHTS = {
  Fit: 0.35,
  Risk: 0.25,
  Momentum: 0.20,
  Readiness: 0.20,
};

const TIERS = [
  { key: "tier1", name: "Tier 1", min: 78 },
  { key: "tier2", name: "Tier 2", min: 62 },
  { key: "watch", name: "Watchlist", min: 0 },
];

/* ----------------------------- Helpers ----------------------------- */
const LS_KEY = "aec_screener_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeNum(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

function formatRevenue(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  // still stored as $M in the data model
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}B`;
  return `$${n.toFixed(0)}M`;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function computeScores(company) {
  const answers = company.answers || {};
  const dimToScores = {};
  for (const d of DIMENSIONS) dimToScores[d] = [];

  for (const q of QUESTIONS) {
    const picked = answers[q.key];
    const option = q.options.find((o) => o.label === picked);
    const score = option ? option.score : null;
    if (score !== null) dimToScores[q.dimension].push(score);
  }

  const dimAvg10 = {};
  for (const d of DIMENSIONS) {
    const arr = dimToScores[d];
    dimAvg10[d] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  const weightSum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
  let total01 = 0;
  for (const d of DIMENSIONS) {
    const w = (DIMENSION_WEIGHTS[d] || 0) / (weightSum || 1);
    total01 += w * (dimAvg10[d] / 10);
  }
  const total100 = Math.round(clamp01(total01) * 100);

  let tier = "Watchlist";
  for (const t of TIERS) {
    if (total100 >= t.min) {
      tier = t.name;
      break;
    }
  }

  return { total100, tier, dimAvg10 };
}

function toCSV(rows) {
  const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ----------------------------- API (Supabase-backed) ----------------------------- */
function normalizeCompanyFromServer(row) {
  const d = row?.data || {};
  return {
    id: row.id,
    name: row.name ?? "",
    revenueM: d.revenueM ?? "",
    employees: d.employees ?? "",
    hq: d.hq ?? "",
    notes: d.notes ?? "",
    answers: d.answers ?? {},
  };
}

function toServerPayload(company) {
  return {
    id: company.id && String(company.id).length >= 10 ? company.id : undefined,
    name: (company.name || "").trim(),
    data: {
      revenueM: company.revenueM ?? "",
      employees: company.employees ?? "",
      hq: company.hq ?? "",
      notes: company.notes ?? "",
      answers: company.answers ?? {},
    },
  };
}

async function apiListCompanies() {
  const r = await fetch("/api/companies", { credentials: "include" });
  if (!r.ok) throw new Error(`Load failed (${r.status})`);
  const j = await r.json();
  return Array.isArray(j.companies) ? j.companies : [];
}

async function apiUpsertCompany(company) {
  const r = await fetch("/api/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(toServerPayload(company)),
  });
  if (!r.ok) throw new Error(`Save failed (${r.status})`);
  const j = await r.json();
  if (!j.company) throw new Error("Save failed (no company returned)");
  return j.company;
}

async function apiDeleteCompany(id) {
  const r = await fetch("/api/company-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id }),
  });
  if (!r.ok) throw new Error(`Delete failed (${r.status})`);
  const j = await r.json();
  if (!j.ok) throw new Error("Delete failed");
}

/* ----------------------------- App ----------------------------- */
export default function App() {
  const [companies, setCompanies] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const [newName, setNewName] = useState("");
  const [newRevenue, setNewRevenue] = useState("");
  const [newEmployees, setNewEmployees] = useState("");
  const [newHQ, setNewHQ] = useState("");

  const [authed, setAuthed] = useState(isLocalhost);
  const [loadingData, setLoadingData] = useState(false);
  const [dataErr, setDataErr] = useState("");

  const saveTimersRef = useRef(new Map());
  const latestCompaniesRef = useRef(companies);
  useEffect(() => {
    latestCompaniesRef.current = companies;
  }, [companies]);

  function clearSaveTimer(id) {
    const t = saveTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      saveTimersRef.current.delete(id);
    }
  }

  function scheduleSave(companyId, delayMs = 650) {
    if (isLocalhost) return;
    if (!authed) return;

    clearSaveTimer(companyId);

    const t = setTimeout(async () => {
      try {
        const c = latestCompaniesRef.current.find((x) => x.id === companyId);
        if (!c) return;

        const name = (c.name || "").trim();
        if (!name) return;

        const saved = await apiUpsertCompany(c);
        const normalized = normalizeCompanyFromServer(saved);

        setCompanies((prev) => {
          const idx = prev.findIndex((x) => x.id === companyId);
          if (idx === -1) return prev;
          const before = prev[idx];
          const nextId = normalized.id;
          const merged = { ...before, ...normalized, id: nextId };
          const out = prev.slice();
          out[idx] = merged;
          return out;
        });

        setActiveId((prevActive) =>
          prevActive === companyId ? normalized.id : prevActive
        );

        setDataErr("");
      } catch (e) {
        setDataErr(e.message || "Save failed.");
      }
    }, delayMs);

    saveTimersRef.current.set(companyId, t);
  }

  async function loadFromServer() {
    setLoadingData(true);
    setDataErr("");
    try {
      const rows = await apiListCompanies();
      const normalized = rows.map(normalizeCompanyFromServer);

      setCompanies(normalized);
      setActiveId((prev) => {
        if (prev && normalized.some((c) => c.id === prev)) return prev;
        return normalized[0]?.id || null;
      });
    } catch (e) {
      setDataErr(e.message || "Load failed.");
      setCompanies([]);
      setActiveId(null);
    } finally {
      setLoadingData(false);
    }
  }

  /* ---------- Localhost: LocalStorage ---------- */
  useEffect(() => {
    if (!isLocalhost) return;

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.companies)) {
          setCompanies(parsed.companies);
          setActiveId(parsed.activeId ?? (parsed.companies[0]?.id || null));
          return;
        }
      }
    } catch {}

    setCompanies([]);
    setActiveId(null);
  }, []);

  useEffect(() => {
    if (!isLocalhost) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ companies, activeId }));
    } catch {}
  }, [companies, activeId]);

  /* ---------- Production: load after auth ---------- */
  useEffect(() => {
    if (isLocalhost) return;
    if (!authed) return;
    loadFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  /* ---------- Production: auto refresh every 10s ---------- */
  useEffect(() => {
    if (isLocalhost) return;
    if (!authed) return;

    const t = setInterval(() => {
      loadFromServer();
    }, 10000);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeId) || null,
    [companies, activeId]
  );

  const scoredCompanies = useMemo(() => {
    return companies.map((c) => {
      const s = computeScores(c);
      return { ...c, _score: s.total100, _tier: s.tier, _dims: s.dimAvg10 };
    });
  }, [companies]);

  const tierBuckets = useMemo(() => {
    const buckets = { "Tier 1": [], "Tier 2": [], Watchlist: [] };
    for (const c of scoredCompanies) buckets[c._tier].push(c);
    for (const k of Object.keys(buckets)) {
      buckets[k].sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
    }
    return buckets;
  }, [scoredCompanies]);

  async function addCompany() {
    const name = newName.trim();
    if (!name) return;

    const tempId = uid();
    const c = {
      id: tempId,
      name,
      revenueM: safeNum(newRevenue) === "" ? "" : Number(newRevenue),
      employees: safeNum(newEmployees) === "" ? "" : Number(newEmployees),
      hq: newHQ.trim(),
      notes: "",
      answers: {},
    };

    setCompanies((prev) => [c, ...prev]);
    setActiveId(tempId);

    setNewName("");
    setNewRevenue("");
    setNewEmployees("");
    setNewHQ("");

    if (!isLocalhost) {
      try {
        const saved = await apiUpsertCompany(c);
        const normalized = normalizeCompanyFromServer(saved);

        setCompanies((prev) => {
          const idx = prev.findIndex((x) => x.id === tempId);
          if (idx === -1) return prev;
          const out = prev.slice();
          out[idx] = { ...out[idx], ...normalized, id: normalized.id };
          return out;
        });

        setActiveId((prevActive) =>
          prevActive === tempId ? normalized.id : prevActive
        );
      } catch (e) {
        setDataErr(e.message || "Save failed.");
      }
    }
  }

  async function removeCompany(id) {
    clearSaveTimer(id);

    setCompanies((prev) => prev.filter((c) => c.id !== id));

    setActiveId((prevActive) => {
      if (prevActive !== id) return prevActive;
      const remaining = companies.filter((c) => c.id !== id);
      return remaining[0]?.id || null;
    });

    if (!isLocalhost) {
      try {
        await apiDeleteCompany(id);
      } catch (e) {
        setDataErr(e.message || "Delete failed.");
      }
    }
  }

  function updateActive(patch) {
    if (!activeCompany) return;
    const id = activeCompany.id;

    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );

    scheduleSave(id);
  }

  function setAnswer(qKey, optionLabel) {
    if (!activeCompany) return;
    const nextAnswers = { ...(activeCompany.answers || {}) };
    nextAnswers[qKey] = optionLabel;
    updateActive({ answers: nextAnswers });
  }

  async function resetAll() {
    if (!confirm("Reset everything? This clears all companies + scores.")) return;

    if (isLocalhost) {
      setCompanies([]);
      setActiveId(null);
      localStorage.removeItem(LS_KEY);
      return;
    }

    setLoadingData(true);
    setDataErr("");
    try {
      const current = latestCompaniesRef.current.slice();
      await Promise.all(current.map((c) => apiDeleteCompany(c.id)));
      setCompanies([]);
      setActiveId(null);
    } catch (e) {
      setDataErr(e.message || "Reset failed.");
    } finally {
      setLoadingData(false);
    }
  }

  function exportCSV() {
    const header = [
      "Company",
      "Revenue",
      "Employees",
      "HQ",
      "Tier",
      "Total Score (0-100)",
      "Fit (0-10)",
      "Risk (0-10)",
      "Momentum (0-10)",
      "Readiness (0-10)",
      ...QUESTIONS.map((q) => q.title),
    ];

    const rows = scoredCompanies.map((c) => [
      c.name,
      c.revenueM === "" ? "" : c.revenueM,
      c.employees === "" ? "" : c.employees,
      c.hq || "",
      c._tier || "",
      c._score ?? "",
      (c._dims?.Fit ?? 0).toFixed(1),
      (c._dims?.Risk ?? 0).toFixed(1),
      (c._dims?.Momentum ?? 0).toFixed(1),
      (c._dims?.Readiness ?? 0).toFixed(1),
      ...QUESTIONS.map((q) => (c.answers || {})[q.key] || ""),
    ]);

    downloadText("aec_screener.csv", toCSV([header, ...rows]));
  }

  const activeScore = useMemo(() => {
    if (!activeCompany) return null;
    return computeScores(activeCompany);
  }, [activeCompany]);

  return (
    <AuthGate onAuthedChange={setAuthed}>
      <div style={styles.page}>
        <div style={styles.header}>
          <div>
            <div style={styles.h1}>AEC Acquisition Target Screener</div>
            <div style={styles.sub}>
              Granular scoring across all questions (Fit / Risk / Momentum / Readiness).{" "}
              {isLocalhost ? "Saved in this browser." : "Saved to the shared database."}
            </div>
          </div>

          <div style={styles.headerBtns}>
            {!isLocalhost ? (
              <button style={styles.ghostBtn} onClick={loadFromServer} disabled={loadingData}>
                Refresh data
              </button>
            ) : null}

            <button style={styles.ghostBtn} onClick={exportCSV} disabled={!companies.length}>
              Export CSV
            </button>
            <button style={styles.dangerBtn} onClick={resetAll} disabled={loadingData}>
              Reset
            </button>
          </div>
        </div>

        {!isLocalhost ? (
          <div style={{ marginBottom: 12 }}>
            {loadingData ? (
              <div style={styles.bannerInfo}>Loading/saving…</div>
            ) : dataErr ? (
              <div style={styles.bannerErr}>
                {dataErr}
                <button onClick={loadFromServer} style={styles.bannerBtn}>
                  Retry load
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={styles.grid3}>
          {/* LEFT: Companies */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Companies</div>

            <div style={styles.addBox}>
              <div style={styles.formGrid2}>
                <div>
                  <div style={styles.label}>Company name</div>
                  <input
                    style={styles.input}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., BuildFlow"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCompany();
                    }}
                  />
                </div>
                <div>
                  <div style={styles.label}>Revenue</div>
                  <input
                    style={styles.input}
                    value={newRevenue}
                    onChange={(e) => setNewRevenue(e.target.value)}
                    placeholder="e.g., 35"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <div style={styles.label}># Employees</div>
                  <input
                    style={styles.input}
                    value={newEmployees}
                    onChange={(e) => setNewEmployees(e.target.value)}
                    placeholder="e.g., 120"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <div style={styles.label}>HQ location</div>
                  <input
                    style={styles.input}
                    value={newHQ}
                    onChange={(e) => setNewHQ(e.target.value)}
                    placeholder="e.g., Austin, TX"
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button style={styles.primaryBtn} onClick={addCompany} disabled={loadingData}>
                  Add
                </button>
                <div style={styles.muted}>
                  Tip: Revenue stored as <b>$M</b> (e.g., “35” = $35M).
                </div>
              </div>
            </div>

            <div style={styles.list}>
              {!scoredCompanies.length ? (
                <div style={styles.muted}>No companies yet. Use “Add company”.</div>
              ) : (
                scoredCompanies.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      ...styles.companyRow,
                      ...(c.id === activeId ? styles.companyRowActive : {}),
                    }}
                    onClick={() => setActiveId(c.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={styles.companyName}>{c.name}</div>
                      <div style={styles.scorePill}>{c._score ?? 0}</div>
                    </div>

                    <div style={styles.companyMeta}>
                      <span style={styles.metaChip}>{c._tier}</span>
                      <span style={styles.metaChip}>
                        Rev: {c.revenueM === "" ? "—" : formatRevenue(c.revenueM)}
                      </span>
                      <span style={styles.metaChip}>
                        Emp: {c.employees === "" ? "—" : c.employees}
                      </span>
                    </div>

                    <div style={styles.companyMeta2}>
                      <span style={styles.mutedSmall}>HQ: {c.hq || "—"}</span>
                      <button
                        style={styles.tinyDanger}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCompany(c.id);
                        }}
                        title="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* MIDDLE: Score a company */}
          <div style={styles.card}>
            {!activeCompany ? (
              <div style={styles.muted}>Select or add a company to score.</div>
            ) : (
              <>
                <div style={styles.sectionHeader}>
                  <div>
                    <div style={styles.cardTitle}>Score a company</div>
                    <div style={styles.mutedSmall}>
                      {activeCompany.name} • Total:{" "}
                      <b>{activeScore?.total100 ?? 0}</b> • {activeScore?.tier}
                    </div>
                  </div>
                </div>

                <div style={styles.formGrid3}>
                  <div>
                    <div style={styles.label}>Revenue</div>
                    <input
                      style={styles.input}
                      value={activeCompany.revenueM === "" ? "" : String(activeCompany.revenueM)}
                      onChange={(e) =>
                        updateActive({
                          revenueM:
                            safeNum(e.target.value) === ""
                              ? ""
                              : Number(e.target.value),
                        })
                      }
                      placeholder="e.g., 35"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <div style={styles.label}># Employees</div>
                    <input
                      style={styles.input}
                      value={activeCompany.employees === "" ? "" : String(activeCompany.employees)}
                      onChange={(e) =>
                        updateActive({
                          employees:
                            safeNum(e.target.value) === ""
                              ? ""
                              : Number(e.target.value),
                        })
                      }
                      placeholder="e.g., 120"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <div style={styles.label}>HQ location</div>
                    <input
                      style={styles.input}
                      value={activeCompany.hq || ""}
                      onChange={(e) => updateActive({ hq: e.target.value })}
                      placeholder="e.g., Austin, TX"
                    />
                  </div>
                </div>

                <div style={styles.thresholdBox}>
                  <div style={styles.sectionTitle}>Dimension breakdown</div>
                  <div style={styles.dimRow}>
                    {DIMENSIONS.map((d) => (
                      <div key={d} style={styles.dimCard}>
                        <div style={styles.dimLabel}>{d}</div>
                        <div style={styles.dimValue}>
                          {(activeScore?.dimAvg10?.[d] ?? 0).toFixed(1)} / 10
                        </div>
                        <div style={styles.mutedSmall}>
                          Weight: {(DIMENSION_WEIGHTS[d] * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  {QUESTIONS.map((q) => {
                    const chosen = (activeCompany.answers || {})[q.key] || "";
                    const chosenObj = q.options.find((o) => o.label === chosen);
                    return (
                      <div key={q.key} style={styles.qCard}>
                        <div style={styles.qTop}>
                          <div>
                            <div style={styles.qTitle}>
                              {q.title}{" "}
                              <span style={styles.qDimPill}>{q.dimension}</span>
                            </div>
                            <div style={styles.mutedSmall}>{q.prompt}</div>
                          </div>
                          <div style={styles.qScore}>
                            {chosenObj ? `${chosenObj.score}/10` : "—"}
                          </div>
                        </div>

                        <select
                          style={styles.select}
                          value={chosen}
                          onChange={(e) => setAnswer(q.key, e.target.value)}
                        >
                          <option value="">Select response…</option>
                          {q.options.map((o) => (
                            <option key={o.label} value={o.label}>
                              {o.label} ({o.score}/10)
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={styles.label}>Notes</div>
                  <textarea
                    style={styles.textarea}
                    value={activeCompany.notes || ""}
                    onChange={(e) => updateActive({ notes: e.target.value })}
                    placeholder="Diligence notes, links, concerns, catalysts…"
                  />
                </div>
              </>
            )}
          </div>

          {/* RIGHT: Tier Lists */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Tier Lists</div>

            <div style={styles.tierSummary}>
              <div style={styles.tierSummaryRow}>
                <span style={styles.mutedSmall}>Tier 1 ≥ {TIERS[0].min}</span>
                <b>{tierBuckets["Tier 1"].length}</b>
              </div>
              <div style={styles.tierSummaryRow}>
                <span style={styles.mutedSmall}>Tier 2 ≥ {TIERS[1].min}</span>
                <b>{tierBuckets["Tier 2"].length}</b>
              </div>
              <div style={styles.tierSummaryRow}>
                <span style={styles.mutedSmall}>Watchlist</span>
                <b>{tierBuckets["Watchlist"].length}</b>
              </div>
            </div>

            {["Tier 1", "Tier 2", "Watchlist"].map((tierName) => (
              <div key={tierName} style={styles.tierBlock}>
                <div style={styles.tierHeader}>
                  <div style={styles.sectionTitle}>{tierName}</div>
                  <div style={styles.mutedSmall}>{tierBuckets[tierName].length}</div>
                </div>

                {tierBuckets[tierName].length ? (
                  <div style={styles.tierList}>
                    {tierBuckets[tierName].map((c) => (
                      <div
                        key={c.id}
                        style={styles.tierRow}
                        onClick={() => setActiveId(c.id)}
                        title="Click to open"
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ fontWeight: 800 }}>{c.name}</div>
                          <div style={styles.scorePillSmall}>{c._score}</div>
                        </div>
                        <div style={styles.mutedSmall}>
                          Rev: {c.revenueM === "" ? "—" : formatRevenue(c.revenueM)} • Emp:{" "}
                          {c.employees === "" ? "—" : c.employees} • HQ: {c.hq || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={styles.mutedSmall}>None yet.</div>
                )}
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <div style={styles.sectionTitle}>Full Matrix (quick)</div>
              {!scoredCompanies.length ? (
                <div style={styles.mutedSmall}>Add companies to see the matrix.</div>
              ) : (
                <div style={styles.miniTableWrap}>
                  <table style={styles.miniTable}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Company</th>
                        <th style={styles.th}>Tier</th>
                        <th style={styles.th}>Score</th>
                        <th style={styles.th}>Rev</th>
                        <th style={styles.th}>Emp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scoredCompanies
                        .slice()
                        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0))
                        .map((c) => (
                          <tr
                            key={c.id}
                            style={styles.tr}
                            onClick={() => setActiveId(c.id)}
                            title="Click to open"
                          >
                            <td style={styles.td}>{c.name}</td>
                            <td style={styles.td}>{c._tier}</td>
                            <td style={styles.td}>
                              <b>{c._score}</b>
                            </td>
                            <td style={styles.td}>
                              {c.revenueM === "" ? "—" : formatRevenue(c.revenueM)}
                            </td>
                            <td style={styles.td}>{c.employees === "" ? "—" : c.employees}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={styles.footerNote}>
          Tip: If you’re deploying under <b>/aecproject</b>, keep your app routing “relative” (this file does not assume any React Router).
        </div>
      </div>
    </AuthGate>
  );
}

/* ----------------------------- Styles ----------------------------- */
const styles = {
  page: {
    minHeight: "100vh",
    padding: 18,
    background: "#fafafa",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    color: "#111",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  h1: { fontSize: 26, fontWeight: 900, letterSpacing: -0.3 },
  sub: { color: "#666", marginTop: 4, fontSize: 13 },

  headerBtns: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },

  grid3: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1.8fr 1.1fr",
    gap: 12,
    alignItems: "start",
  },

  card: {
    border: "1px solid #eee",
    borderRadius: 16,
    padding: 14,
    background: "white",
    boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
  },
  cardTitle: { fontSize: 16, fontWeight: 900, marginBottom: 8 },
  muted: { color: "#666", fontSize: 13 },
  mutedSmall: { color: "#666", fontSize: 12 },

  addBox: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "#fff",
    marginBottom: 10,
  },

  formGrid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  formGrid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
    marginBottom: 10,
  },

  label: { fontSize: 12, color: "#444", marginBottom: 6, fontWeight: 800 },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    outline: "none",
  },
  select: {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    outline: "none",
    background: "white",
  },
  textarea: {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid #ccc",
    outline: "none",
    minHeight: 110,
    resize: "vertical",
  },

  primaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: 0,
    background: "black",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  ghostBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #eee",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ffe0e0",
    background: "#fff5f5",
    cursor: "pointer",
    fontWeight: 900,
    color: "#b00020",
    whiteSpace: "nowrap",
  },

  list: { display: "grid", gap: 10, marginTop: 10 },

  companyRow: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "#fff",
    cursor: "pointer",
  },
  companyRowActive: {
    border: "1px solid #ddd",
    boxShadow: "0 0 0 2px rgba(0,0,0,0.04)",
  },
  companyName: {
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  scorePill: {
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "4px 10px",
    fontWeight: 900,
    background: "#fafafa",
  },
  scorePillSmall: {
    border: "1px solid #eee",
    borderRadius: 999,
    padding: "2px 8px",
    fontWeight: 900,
    background: "#fafafa",
    fontSize: 12,
  },

  companyMeta: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  metaChip: {
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
  },
  companyMeta2: {
    marginTop: 8,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  tinyDanger: {
    border: "1px solid #ffe0e0",
    background: "#fff5f5",
    color: "#b00020",
    borderRadius: 999,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    fontWeight: 900,
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },

  thresholdBox: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa",
    marginTop: 10,
  },

  sectionTitle: { fontWeight: 900, marginBottom: 8 },

  dimRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  dimCard: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 10,
    background: "white",
  },
  dimLabel: { fontSize: 12, color: "#666", fontWeight: 900 },
  dimValue: { fontSize: 18, fontWeight: 900, marginTop: 4 },

  qCard: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 12,
    background: "white",
    marginBottom: 10,
  },
  qTop: { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  qTitle: { fontWeight: 900 },
  qDimPill: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
    marginLeft: 6,
    fontWeight: 900,
    color: "#444",
  },
  qScore: {
    fontWeight: 900,
    border: "1px solid #eee",
    borderRadius: 12,
    padding: "6px 10px",
    background: "#fafafa",
    height: "fit-content",
  },

  tierSummary: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 10,
    background: "#fafafa",
    marginBottom: 10,
  },
  tierSummaryRow: { display: "flex", justifyContent: "space-between", marginTop: 4 },

  tierBlock: {
    borderTop: "1px solid #f2f2f2",
    paddingTop: 10,
    marginTop: 10,
  },
  tierHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  tierList: { display: "grid", gap: 8, marginTop: 8 },
  tierRow: {
    border: "1px solid #eee",
    borderRadius: 14,
    padding: 10,
    background: "white",
    cursor: "pointer",
  },

  miniTableWrap: {
    border: "1px solid #eee",
    borderRadius: 14,
    overflow: "auto",
    maxHeight: 360,
    background: "white",
  },
  miniTable: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #eee",
    background: "#fafafa",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  td: { padding: 10, borderBottom: "1px solid #f2f2f2", verticalAlign: "top" },
  tr: { cursor: "pointer" },

  footerNote: { marginTop: 12, color: "#777", fontSize: 12 },

  authWrap: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#fafafa" },
  authCard: { width: "min(420px, 100%)", border: "1px solid #eee", borderRadius: 16, padding: 18, background: "white" },
  authTitle: { fontSize: 20, fontWeight: 900, marginBottom: 8 },
  authSub: { color: "#666", marginBottom: 14 },
  err: { color: "#b00020", fontSize: 13 },

  logoutWrap: { position: "fixed", top: 10, right: 10, zIndex: 9999 },

  bannerInfo: {
    border: "1px solid #eee",
    background: "#fff",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#333",
    fontSize: 13,
  },
  bannerErr: {
    border: "1px solid #ffe0e0",
    background: "#fff5f5",
    borderRadius: 12,
    padding: "10px 12px",
    color: "#b00020",
    fontSize: 13,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  bannerBtn: {
    border: "1px solid #ffd3d3",
    background: "white",
    borderRadius: 10,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 900,
    color: "#b00020",
    whiteSpace: "nowrap",
  },
};
