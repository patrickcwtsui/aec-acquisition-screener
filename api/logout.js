export default function handler(req, res) {
  res.setHeader("Set-Cookie", [
    "aec_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ]);
  return res.status(200).json({ ok: true });
}
