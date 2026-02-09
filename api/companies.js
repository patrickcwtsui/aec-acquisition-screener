import { supabaseAdmin } from "./_supabase.js";
import { isAuthed } from "./_auth.js";

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const supabase = supabaseAdmin();

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,data,created_at,updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ companies: data || [] });
    }

    if (req.method === "POST") {
      // NOTE: Vercel usually parses JSON automatically, but your login handler doesn’t.
      // To be safe, accept either.
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      const { id, name, data } = body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "Missing name" });
      }

      const payload = {
        ...(id ? { id } : {}),
        name: String(name).trim(),
        data: data ?? {},
      };

      const { data: saved, error } = await supabase
        .from("companies")
        .upsert(payload, { onConflict: "name" })
        .select("id,name,data,created_at,updated_at")
        .single();

      if (error) throw error;
      return res.status(200).json({ company: saved });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).send("Method Not Allowed");
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
res.setHeader("Pragma", "no-cache");
res.setHeader("Expires", "0");
res.setHeader("Surrogate-Control", "no-store");
