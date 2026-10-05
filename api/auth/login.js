import crypto from "node:crypto";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId) return res.status(500).send("Microsoft login is not configured yet. Add MICROSOFT_CLIENT_ID in Vercel.");

  const state = crypto.randomBytes(32).toString("hex");
  const redirectUri = getRedirectUri(req);
  const tenant = process.env.MICROSOFT_TENANT || "consumers";

  res.setHeader("Set-Cookie", `mc_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid profile email xboxlive.signin xboxlive.offline_access",
    state
  });

  res.writeHead(302, { Location: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}` });
  res.end();
}

function getRedirectUri(req) {
  const base = process.env.SITE_URL || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  return new URL("/api/auth/callback", base).toString();
}
