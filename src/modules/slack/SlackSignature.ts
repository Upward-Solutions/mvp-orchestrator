import crypto from "crypto";

export class SlackSignature {
  private readonly signingSecret: string;

  constructor(signingSecret: string) {
    this.signingSecret = signingSecret;
  }

  verify(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    const ts = headers["x-slack-request-timestamp"];
    const sig = headers["x-slack-signature"];
    if (typeof ts !== "string" || typeof sig !== "string") return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 60 * 5) return false;

    const base = `v0:${ts}:${rawBody}`;
    const hmac = crypto.createHmac("sha256", this.signingSecret).update(base).digest("hex");
    const expected = `v0=${hmac}`;

    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
