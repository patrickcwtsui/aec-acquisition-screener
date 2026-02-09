// api/me.js  (ESM)

export function isAuthed(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)aec_auth=([^;]+)/);
  if (!match) return false;

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const parts = decoded.split(":");
    const pw = parts.slice(1).join(":"); // in case password contains ":"
    return pw === expected;
  } catch {
    return false;
  }
}

export default function handler(req, res) {
  // disable caching so auth state updates immediately
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ ok: false, error: "APP_PASSWORD not set" });

  return res.status(200).json({ authed: isAuthed(req) });
}
