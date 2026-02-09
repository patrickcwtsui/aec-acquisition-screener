// api/companies.js
// Shared persistence for the AEC Screener using Supabase.
//
// ✅ Works with ESM ("type": "module") on Vercel
// ✅ Protects endpoints behind your existing password gate (isAuthed)
// ✅ Accepts multiple payload shapes to avoid 400s
//
// REQUIRED ENV VARS (Vercel → Project → Settings → Environment Variables):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY   (recommended)  OR  SUPABASE_ANON_KEY (if you disabled RLS)
//
// REQUIRED TABLE (run once in Supabase SQL editor):
// create table if not exists aec_screener_state (
//   key text primary key,
//   state jsonb not null,
//   updated_at timestamptz not null default now()
// );
//
// NOTE: This stores ONE shared dataset under key='shared' (since you want one password, not per-user logins).

import { createClient } from "@supabase/supabase-js";
import { isAuthed } from "./me.js";

const STATE_KEY = "shared";

function noStore(res) {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.SUPABASE_ANON_KEY;

  if (!url) throw new Error("SUPABASE_URL not set");
  if (!service && !anon) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY not set");

  // Prefer service role for server-side writes.
  return createClient(url, service || anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readJson(req) {
  // Supports Vercel Node runtime where req is a stream
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function normalizeIncoming(body) {
  // Accepts any of:
  // 1) { companies: [...], activeId: "..." }
  // 2) { state: { companies: [...], activeId: "..." } }
  // 3) [...]   (companies array only)
  if (body == null) return { companies: [], activeId: null };

  if (Array.isArray(body)) return { companies: body, activeId: null };

  if (typeof body === "object") {
    if (body.state && typeof body.state === "object") {
      const { companies, activeId } = body.state;
      return { companies, activeId: activeId ?? null };
    }
    if ("companies" in body) {
      return { companies: body.companies, activeId: body.activeId ?? null };
    }
  }

  // Unknown shape
  return null;
}

function validateState(state) {
  if (!state) return { ok: false, error: "Invalid JSON shape" };

  const { companies, activeId } = state;

  if (!Array.isArray(companies)) {
    return { ok: false, error: "`companies` must be an array" };
  }

  // Light validation + cleanup (avoid saving garbage)
  const cleaned = companies
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      id: String(c.id ?? ""),
      name: String(c.name ?? "").trim(),
      revenue: c.revenue ?? c.revenueM ?? "", // allow either key (your UI changed label)
      employees: c.employees ?? "",
      hq: c.hq ?? "",
      notes: c.notes ?? "",
      answers: c.answers ?? {},
      // keep any other fields if you later add them
      ...c,
    }))
    .filter((c) => c.id && c.name);

  return {
    ok: true,
    value: {
      companies: cleaned,
      activeId: activeId ? String(activeId) : null,
      savedAt: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  noStore(res);

  // CORS preflight (if needed)
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    // Password gate
    if (!isAuthed(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = getSupabase();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("aec_screener_state")
        .select("state")
        .eq("key", STATE_KEY)
        .maybeSingle();

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      const state = data?.state ?? { companies: [], activeId: null };
      return res.status(200).json({ ok: true, state });
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const normalized = normalizeIncoming(body);
      const checked = validateState(normalized);

      if (!checked.ok) {
        return res.status(400).json({ ok: false, error: checked.error });
      }

      const { error } = await supabase
        .from("aec_screener_state")
        .upsert(
          {
            key: STATE_KEY,
            state: checked.value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const { error } = await supabase
        .from("aec_screener_state")
        .delete()
        .eq("key", STATE_KEY);

      if (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
}
