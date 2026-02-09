// api/login.js (ESM)

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

export default async function handler(req, res) {
  noStore(res);

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const expected = process.env.APP_PASSWORD;
  if (!expected) return res.status(500).json({ error: "APP_PASSWORD not set" });

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { password } = JSON.parse(body || "{}");

      if (password !== expected) return res.status(401).json({ ok: false });

      // simple token
      const token = Buffer.from(`${Date.now()}:${expected}`).toString("base64");

      res.setHeader(
        "Set-Cookie",
        `aec_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
      );

      return res.status(200).json({ ok: true });
    } catch {
      return res.status(400).json({ error: "Bad JSON" });
    }
  });
}
