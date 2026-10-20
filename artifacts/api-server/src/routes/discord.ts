import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { GetDiscordLinkResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const STATE_COOKIE = "rr_discord_state";

function setting(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function oauthConfigured(): boolean {
  return Boolean(
    setting("DISCORD_CLIENT_ID") &&
      setting("DISCORD_CLIENT_SECRET") &&
      setting("DISCORD_GUILD_ID") &&
      setting("DISCORD_BOT_TOKEN"),
  );
}

function appBaseUrl(req: { protocol: string; get: (name: string) => string | undefined }): string {
  const configured = setting("PUBLIC_APP_URL");
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

function redirectUri(req: { protocol: string; get: (name: string) => string | undefined }): string {
  return setting("DISCORD_REDIRECT_URI") ?? `${appBaseUrl(req)}/api/auth/discord/callback`;
}

function inviteUrl(): string | null {
  return setting("DISCORD_INVITE_URL");
}

router.get("/community/discord", (_req, res) => {
  const invite = inviteUrl();
  const oauth = oauthConfigured();
  res.setHeader("cache-control", "no-store");
  res.json(
    GetDiscordLinkResponse.parse({
      configured: Boolean(invite || oauth),
      inviteUrl: invite,
      oauth,
      // A direct invite always works, even before the OAuth callback is
      // registered in the Discord developer portal. The auto-join flow stays
      // available at /api/auth/discord/login when OAuth is configured.
      joinUrl: invite ?? (oauth ? "/api/auth/discord/login" : null),
      guildId: setting("DISCORD_GUILD_ID"),
    }),
  );
});

router.get("/auth/discord/login", (req, res) => {
  const clientId = setting("DISCORD_CLIENT_ID");
  if (!oauthConfigured() || !clientId) {
    const invite = inviteUrl();
    if (invite) {
      res.redirect(invite);
      return;
    }
    res.status(503).json({
      error: "Discord is not configured",
      message: "Set DISCORD_INVITE_URL, or the Discord OAuth credentials, on the API server.",
    });
    return;
  }

  const state = randomBytes(20).toString("hex");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.protocol === "https",
    maxAge: 10 * 60_000,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "identify guilds.join",
    state,
    prompt: "consent",
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

router.get("/auth/discord/callback", async (req, res) => {
  const base = appBaseUrl(req);
  const failure = (reason: string) => res.redirect(`${base}/?discord=error&reason=${encodeURIComponent(reason)}`);

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: "/" });

  if (!code) return failure("missing_code");
  if (!state || !expected || state !== expected) return failure("state_mismatch");

  const clientId = setting("DISCORD_CLIENT_ID");
  const clientSecret = setting("DISCORD_CLIENT_SECRET");
  const guildId = setting("DISCORD_GUILD_ID");
  const botToken = setting("DISCORD_BOT_TOKEN");
  if (!clientId || !clientSecret || !guildId || !botToken) {
    res.status(503).json({ error: "Discord credentials are not fully configured" });
    return;
  }

  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(req),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenResponse.ok) {
      console.error("[discord] token exchange failed", tokenResponse.status);
      return failure("token_exchange");
    }

    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) return failure("missing_token");

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!userResponse.ok) return failure("user_lookup");

    const user = (await userResponse.json()) as { id?: string };
    if (!user.id) return failure("missing_user");

    const memberResponse = await fetch(
      `https://discord.com/api/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(user.id)}`,
      {
        method: "PUT",
        headers: {
          authorization: `Bot ${botToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ access_token: token.access_token }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (memberResponse.ok) {
      return res.redirect(`${base}/?discord=success`);
    }

    const detail = await memberResponse.text().catch(() => "");
    if (memberResponse.status === 204 || /already/i.test(detail)) {
      return res.redirect(`${base}/?discord=already_joined`);
    }

    console.error("[discord] adding member failed", memberResponse.status, detail.slice(0, 300));
    return failure(`guild_${memberResponse.status}`);
  } catch (error) {
    console.error("[discord] oauth error", error instanceof Error ? error.message : error);
    return failure("exception");
  }
});

export default router;
