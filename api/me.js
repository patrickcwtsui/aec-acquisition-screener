export default function handler(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ ok: false, error: "APP_PASSWORD not set" });

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)aec_auth=([^;]+)/);
  if (!match) return res.status(200).json({ authed: false });

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const parts = decoded.split(":");
    const pw = parts.slice(1).join(":"); // handles ":" just in case
    return res.status(200).json({ authed: pw === expected });
  } catch {
    return res.status(200).json({ authed: false });
  }
}
