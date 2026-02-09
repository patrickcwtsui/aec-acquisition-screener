// api/logout.js (ESM)

export default function handler(req, res) {
  // no caching
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // expire cookie
  res.setHeader(
    "Set-Cookie",
    `aec_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  return res.status(200).json({ ok: true });
}
