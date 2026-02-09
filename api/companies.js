// api/companies.js
import { createClient } from "@supabase/supabase-js";
import { isAuthed } from "./me.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TABLE = "aec_companies";

export default async function handler(req, res) {
  // ✅ Prevent stale lists from being cached anywhere (browser/Vercel/edge)
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // ✅ Auth gate (skip on localhost only if you do that elsewhere; safest to enforce here)
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ companies: data || [] });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      const payload = {
        id: body.id || undefined, // allow insert without id
        name: body.name || "",
        data: body.data || {},
      };

      if (!payload.name.trim()) {
        return res.status(400).json({ error: "Company name is required" });
      }

      // If id is missing, let Supabase generate one (uuid default)
      if (!payload.id) delete payload.id;

      const { data, error } = await supabase
        .from(TABLE)
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      return res.status(200).json({ company: data });
    }

    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
