export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { password } = JSON.parse(body || "{}");
      const expected = process.env.APP_PASSWORD;

      if (!expected) return res.status(500).json({ error: "APP_PASSWORD not set" });

      if (password !== expected) return res.status(401).json({ ok: false });

      // simple signed-ish token (good enough for one-password gate)
      const token = Buffer.from(`${Date.now()}:${expected}`).toString("base64");

      res.setHeader(
        "Set-Cookie",
        [
          // cookie works across /aecproject and /api
          `aec_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
        ]
      );
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(400).json({ error: "Bad JSON" });
    }
  });
}

