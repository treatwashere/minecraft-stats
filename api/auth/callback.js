import crypto from "node:crypto";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).send("Method not allowed");

    const { code, state, error, error_description } = req.query;
    if (error) return res.redirect("/?login_error=" + encodeURIComponent(error_description || error));
    if (!code || !state) return res.redirect("/?login_error=Missing%20Microsoft%20login%20response");

    const cookies = parseCookies(req.headers.cookie || "");
    if (!cookies.mc_oauth_state || !timingSafeEqual(cookies.mc_oauth_state, state)) {
      return res.redirect("/?login_error=Invalid%20login%20state");
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send("Microsoft login is not configured.");

    const redirectUri = getRedirectUri(req);
    const tenant = process.env.MICROSOFT_TENANT || "consumers";

    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "openid profile email xboxlive.signin xboxlive.offline_access"
      })
    });

    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) {
      console.error("Microsoft token exchange failed", token);
      return res.redirect("/?login_error=Microsoft%20token%20exchange%20failed");
    }

    const minecraft = await exchangeForMinecraft(token.access_token);
    const session = encryptSession({
      minecraftAccessToken: minecraft.accessToken,
      minecraftRefreshToken: token.refresh_token || null,
      expiresAt: Date.now() + (token.expires_in || 3600) * 1000
    });

    res.setHeader("Set-Cookie", [
      `mc_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
      "mc_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ]);
    res.redirect("/");
  } catch (error) {
    console.error(error);
    res.redirect("/?login_error=Login%20failed");
  }
}

async function exchangeForMinecraft(microsoftAccessToken) {
  const xblResponse = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-xbl-contract-version": "1"
    },
    body: JSON.stringify({
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${microsoftAccessToken}`
      }
    })
  });
  const xbl = await xblResponse.json();
  if (!xblResponse.ok || !xbl.Token) throw new Error("Xbox Live authentication failed.");

  const xstsResponse = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-xbl-contract-version": "1"
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xbl.Token]
      },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT"
    })
  });
  const xsts = await xstsResponse.json();
  if (!xstsResponse.ok || !xsts.Token || !xsts.DisplayClaims?.xui?.[0]?.uhs) {
    throw new Error("Xbox XSTS authentication failed.");
  }

  const minecraftResponse = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identityToken: `XBL3.0 x=${xsts.DisplayClaims.xui[0].uhs};${xsts.Token}`
    })
  });
  const minecraft = await minecraftResponse.json();
  if (!minecraftResponse.ok || !minecraft.access_token) {
    throw new Error("Minecraft account authentication failed.");
  }

  return { accessToken: minecraft.access_token };
}

function getRedirectUri(req) {
  const base = process.env.SITE_URL || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
  return new URL("/api/auth/callback", base).toString();
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? [part.trim(), ""] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function encryptSession(data) {
  const key = crypto.createHash("sha256").update(process.env.SESSION_SECRET || "").digest();
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is missing.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
