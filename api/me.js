// api/me.js

function isAuthed(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;

  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)aec_auth=([^;]+)/);
  if (!match) return false;

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const parts = decoded.split(":");
    const pw = parts.slice(1).join(":");
    return pw === expected;
  } catch {
    return false;
  }
}

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  res.status(200).json({ authed: isAuthed(req) });
};

// allow other files to use it
module.exports.isAuthed = isAuthed;
