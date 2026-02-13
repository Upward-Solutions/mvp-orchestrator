export interface SlackApiResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export class SlackClient {
  private readonly botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  async call(method: string, payload: Record<string, unknown>): Promise<SlackApiResponse> {
    const resp = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const json = (await resp.json()) as SlackApiResponse;
    if (!json.ok) {
      const err = new Error(`Slack API error: ${method} => ${json.error ?? "unknown_error"}`);
      (err as any).slack = json;
      throw err;
    }
    return json;
  }
}
