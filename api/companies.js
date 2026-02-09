// api/companies.js
import { createClient } from "@supabase/supabase-js";
import { isAuthed, setNoCache } from "./me.js";

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

const TABLE = "aec_screener_state";
const ROW_ID = "global";

/* --------------------------- body parsing --------------------------- */
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

/* --------------------------- supabase client --------------------------- */
function getSupabase() {
  const url = process.env.SUPABASE_URL;

  // IMPORTANT: on serverless, prefer SERVICE ROLE. Do NOT use anon in production for writes.
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

/* --------------------------- normalization --------------------------- */
function normalizeCompany(input) {
  // Accepts shapes like:
  // { id, name, data: { revenueM, employees, ... } }
  // { id, name, revenueM, employees, ... }
  // and merges `data` into top-level, then removes `data`.
  const data = input?.data && typeof input.data === "object" ? input.data : {};
  const merged = { ...data, ...input };
  delete merged.data;

  if (!merged?.id || !merged?.name) return null;

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

function normalizePayload(obj) {
  // Supports:
  // 1) { state: { companies, activeId } }
  // 2) { companies, activeId }
  // 3) Single upsert: { company, activeId? } OR { id,name,... } OR { id,name,data:{...} }
  // 4) Delete: { deleteId }
  if (!obj || typeof obj !== "object") return null;

  // Delete
  if (obj.deleteId) return { _deleteId: String(obj.deleteId) };

  // Full state overwrite
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

  // Single upsert
  if (obj.company && typeof obj.company === "object") {
    const c = normalizeCompany(obj.company);
    if (!c) return null;
    return { _singleCompany: c, activeId: obj.activeId ?? null };
  }

  const single = normalizeCompany(obj);
  if (single) return { _singleCompany: single, activeId: obj.activeId ?? null };

  return null;
}

function sanitizeState(state) {
  const s = state && typeof state === "object" ? state : {};
  return {
    companies: Array.isArray(s.companies) ? s.companies : [],
    activeId: s.activeId ?? null,
  };
}

/* --------------------------- db helpers --------------------------- */
async function loadState(supabase) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("state")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) throw error;

  return sanitizeState(data?.state);
}

async function saveState(supabase, state) {
  const payload = { id: ROW_ID, state: sanitizeState(state) };

  // SELECT after UPSERT so we know the row exists and can return a normalized state
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: "id" })
    .select("state")
    .single();

  if (error) throw error;

  return sanitizeState(data?.state);
}

function upsertCompany(companies, company) {
  const next = Array.isArray(companies) ? companies.slice() : [];
  const idx = next.findIndex((c) => String(c?.id) === String(company?.id));
  if (idx >= 0) next[idx] = company;
  else next.unshift(company);
  return next;
}

/* --------------------------- handler --------------------------- */
export default async function handler(req, res) {
  setNoCache(res);

  // Auth gate
  if (!isAuthed(req)) {
    return res.status(401).json({ ok: false, error: "Not authorized" });
  }

  let supabase;
  try {
    supabase = getSupabase();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }

  try {
    if (req.method === "GET") {
      const state = await loadState(supabase);
      return res.status(200).json({ ok: true, state });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const norm = normalizePayload(body);

      if (!norm) {
        return res.status(400).json({
          ok: false,
          error:
            "Invalid payload. Send {state:{companies,activeId}} or {companies,activeId} or {company:{id,name,...}} or {id,name,...} or {deleteId}.",
        });
      }

      // A) full state overwrite
      if (Object.prototype.hasOwnProperty.call(norm, "companies")) {
        const next = await saveState(supabase, {
          companies: norm.companies,
          activeId: norm.activeId ?? null,
        });
        return res.status(200).json({ ok: true, state: next });
      }

      // B) delete one company
      if (norm._deleteId) {
        const current = await loadState(supabase);
        const nextCompanies = current.companies.filter(
          (c) => String(c?.id) !== norm._deleteId
        );
        const nextActive =
          current.activeId && String(current.activeId) === norm._deleteId
            ? nextCompanies[0]?.id ?? null
            : current.activeId;

        const next = await saveState(supabase, {
          companies: nextCompanies,
          activeId: nextActive,
        });
        return res.status(200).json({ ok: true, state: next });
      }

      // C) single company upsert (frontend expects company returned)
      if (norm._singleCompany) {
        const current = await loadState(supabase);

        const nextCompanies = upsertCompany(current.companies, norm._singleCompany);

        // honor explicit activeId if sent, else keep existing, else set to this company
        const nextActive = norm.activeId ?? current.activeId ?? norm._singleCompany.id;

        const next = await saveState(supabase, {
          companies: nextCompanies,
          activeId: nextActive,
        });

        // IMPORTANT: return `company` so UI doesn't show "save failed (no company returned)"
        return res.status(200).json({ ok: true, company: norm._singleCompany, state: next });
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
