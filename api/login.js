// api/login.js (ESM)

export default async function handler(req, res) {
  // no caching
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ error: "APP_PASSWORD not set" });

  try {
    const { password } = req.body || {};
    if (password !== expected) return res.status(401).json({ ok: false });

    // simple signed-ish token for one-password gate
    const token = Buffer.from(`${Date.now()}:${expected}`).toString("base64");

    res.setHeader(
      "Set-Cookie",
      `aec_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(400).json({ error: "Bad JSON" });
  }
}
