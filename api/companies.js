// api/companies.js (ESM)

import { isAuthed } from "./_auth.js";

let COMPANIES = [];

export default async function handler(req, res) {
  // no caching
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  if (!isAuthed(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "GET") {
    return res.status(200).json({ companies: COMPANIES });
  }

  if (req.method === "POST") {
    const { companies } = req.body || {};
    if (!Array.isArray(companies)) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    COMPANIES = companies;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).send("Method Not Allowed");
}
