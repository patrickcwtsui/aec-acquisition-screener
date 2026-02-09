// api/companies.js
import { createClient } from "@supabase/supabase-js";

/**
 * Expected Supabase table:
 * public.aec_screener_state (
 *   id text primary key,
 *   state jsonb not null default '{}'::jsonb,
 *   updated_at timestamptz not null default now()
 * )
 *
 * We store everything under a single row id = "global".
 */

const ROW_ID = "global";

function noCache(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function readCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function isAuthed(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;

  const token = readCookie(req, "aec_auth");
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const parts = decoded.split(":");
    const pw = parts.slice(1).join(":");
    return pw === expected;
  } catch {
    return false;
  }
}

async function readJsonBody(req) {
  // Vercel sometimes provides req.body already
  if (req.body && typeof req.body === "object") return req.body;

  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (preferred) / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function normalizeCompany(input) {
  // Your payload sometimes looks like:
  // { id, name, data: { revenueM, employees, ... } }
  // and sometimes also includes fields at top-level.
  const data = input?.data && typeof input.data === "object" ? input.data : {};

  const merged = {
    ...data,
    ...input,
  };

  // Don’t keep nested "data" object in stored row
  delete merged.data;

  // minimal guard
  if (!merged.id || !merged.name) return null;

  return {
    id: String(merged.id),
    name: String(merged.name),
    revenueM: merged.revenueM ?? "",
    employees: merged.employees ?? "",
    hq: merged.hq ?? "",
    notes: merged.notes ?? "",
    answers: merged.answers ?? {},
  };
}

function normalizeState(obj) {
  // supports:
  // { state: { companies, activeId } }
  // { companies, activeId }
  // { id, name, ... }  (single company upsert)
  if (!obj || typeof obj !== "object") return null;

  if (obj.state && typeof obj.state === "object") {
    const s = obj.state;
    return {
      companies: Array.isArray(s.companies) ? s.companies : [],
      activeId: s.activeId ?? null,
    };
  }

  if (Array.isArray(obj.companies)) {
    return {
      companies: obj.companies,
      activeId: obj.activeId ?? null,
    };
  }

  const single = normalizeCompany(obj);
  if (single) {
    return { _singleCompany: single };
  }

  if (obj.deleteId) {
    return { _deleteId: String(obj.deleteId) };
  }

  return null;
}

export default async function handler(req, res) {
  noCache(res);

  // Auth gate (same cookie as /api/me)
  if (!isAuthed(req)) {
    return res.status(401).json({ ok: false, error: "Not authorized" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  // Helper: read current state
  async function loadState() {
    const { data, error } = await supabase
      .from("aec_screener_state")
      .select("state")
      .eq("id", ROW_ID)
      .maybeSingle();

    if (error) throw error;

    const state = data?.state && typeof data.state === "object" ? data.state : {};
    return {
      companies: Array.isArray(state.companies) ? state.companies : [],
      activeId: state.activeId ?? null,
    };
  }

  // Helper: save state
  async function saveState(state) {
    const payload = {
      id: ROW_ID,
      state: {
        companies: Array.isArray(state.companies) ? state.companies : [],
        activeId: state.activeId ?? null,
      },
    };

    const { error } = await supabase
      .from("aec_screener_state")
      .upsert(payload, { onConflict: "id" });

    if (error) throw error;

    return payload.state;
  }

  try {
    if (req.method === "GET") {
      const state = await loadState();
      return res.status(200).json({ ok: true, state });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const norm = normalizeState(body);

      if (!norm) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid payload. Send {state:{companies,activeId}} or {companies,activeId} or a single company object {id,name,...}.",
        });
      }

      // Case A: full state overwrite
      if (norm.companies) {
        const next = await saveState({
          companies: norm.companies,
          activeId: norm.activeId ?? null,
        });
        return res.status(200).json({ ok: true, state: next });
      }

      // Case B: delete one company
      if (norm._deleteId) {
        const current = await loadState();
        const nextCompanies = current.companies.filter(
          (c) => String(c.id) !== norm._deleteId
        );
        const nextActive =
          current.activeId && String(current.activeId) === norm._deleteId
            ? nextCompanies[0]?.id ?? null
            : current.activeId;

        const next = await saveState({ companies: nextCompanies, activeId: nextActive });
        return res.status(200).json({ ok: true, state: next });
      }

      // Case C: single company upsert (YOUR CURRENT FRONTEND BEHAVIOR)
      if (norm._singleCompany) {
        const current = await loadState();

        const nextCompanies = current.companies.slice();
        const idx = nextCompanies.findIndex(
          (c) => String(c.id) === String(norm._singleCompany.id)
        );
        if (idx >= 0) nextCompanies[idx] = norm._singleCompany;
        else nextCompanies.unshift(norm._singleCompany);

        const nextActive = current.activeId ?? norm._singleCompany.id;

        const next = await saveState({ companies: nextCompanies, activeId: nextActive });
        return res.status(200).json({ ok: true, state: next });
      }

      return res.status(400).json({ ok: false, error: "Unhandled payload type" });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Server error",
    });
  }
}
