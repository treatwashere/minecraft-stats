import crypto from "node:crypto";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const cookies = parseCookies(req.headers.cookie || "");
    if (!cookies.mc_session) return res.status(401).json({ authenticated: false });

    const session = decryptSession(cookies.mc_session);
    if (session.expiresAt < Date.now()) return res.status(401).json({ authenticated: false });

    const [profileResponse, entitlementsResponse] = await Promise.all([
      fetch("https://api.minecraftservices.com/minecraft/profile", {
        headers: { Authorization: `Bearer ${session.minecraftAccessToken}` }
      }),
      fetch("https://api.minecraftservices.com/entitlements/mcstore", {
        headers: { Authorization: `Bearer ${session.minecraftAccessToken}` }
      })
    ]);

    if (!profileResponse.ok) return res.status(401).json({ authenticated: false, error: "Minecraft profile unavailable" });

    const profile = await profileResponse.json();
    const entitlements = entitlementsResponse.ok ? await entitlementsResponse.json() : { items: [] };

    const cape = profile.capes?.[0] || null;
    res.json({
      authenticated: true,
      minecraft: {
        id: profile.id,
        name: profile.name,
        skinUrl: profile.skins?.find(s => s.state === "ACTIVE")?.url || profile.skins?.[0]?.url || null,
        cape: cape ? { id: cape.id, alias: cape.alias, url: cape.url } : null
      },
      entitlements: (entitlements.items || []).map(item => ({
        name: item.name,
        signature: item.signature || null
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ authenticated: false, error: "Unable to load Minecraft account data" });
  }
}

function parseCookies(header) {
  return Object.fromEntries(header.split(";").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? [part.trim(), ""] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}

function decryptSession(value) {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET is missing.");
  const key = crypto.createHash("sha256").update(process.env.SESSION_SECRET).digest();
  const raw = Buffer.from(value, "base64url");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}
