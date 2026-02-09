// api/companies.js
import { createClient } from "@supabase/supabase-js";
import { isAuthed } from "./me.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Disable caching everywhere
function noCache(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

export default async function handler(req, res) {
  noCache(res);

  // Auth check
  if (!isAuthed(req)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // GET = load state
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("aec_screener_state")
      .select("state")
      .eq("id", "singleton")
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      state: data?.state ?? { companies: [], activeId: null },
    });
  }

  // POST = save state
  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }

    // STRICT validation (this was missing / wrong before)
    if (
      !parsed ||
      !Array.isArray(parsed.companies) ||
      !("activeId" in parsed)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload shape",
      });
    }

    const { error } = await supabase
      .from("aec_screener_state")
      .upsert(
        {
          id: "singleton",
          state: {
            companies: parsed.companies,
            activeId: parsed.activeId,
          },
        },
        { onConflict: "id" }
      );

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
