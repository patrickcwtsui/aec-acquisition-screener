export default function handler(req, res) {
  // Disable all caching (important for auth)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return res.status(500).json({ authed: false, error: "APP_PASSWORD not set" });
  }

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)aec_auth=([^;]+)/);
  if (!match) {
    return res.status(200).json({ authed: false });
  }

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const parts = decoded.split(":");
    const pw = parts.slice(1).join(":");
    return res.status(200).json({ authed: pw === expected });
  } catch {
    return res.status(200).json({ authed: false });
  }
}
