import type {Request, Response} from "express";
import {SlackClient} from "./SlackClient.js";
import {SlackSignature} from "./SlackSignature.js";

export class CommandHandler {
  private readonly client: SlackClient;
  private readonly signature: SlackSignature;

  constructor(client: SlackClient, signature: SlackSignature) {
    this.client = client;
    this.signature = signature;
  }

  async handle(req: Request, res: Response): Promise<void> {
    const rawBody = (req.body as Buffer).toString("utf8");

    if (!this.signature.verify(rawBody, req.headers)) {
      res.status(401).send("invalid signature");
      return;
    }

    const params = new URLSearchParams(rawBody);
    const command = params.get("command");
    const triggerId = params.get("trigger_id");

    if (command !== "/create-project") {
      res.status(200).send("ok");
      return;
    }

    res.status(200).send("");

    try {
      await this.openCreateProjectModal(triggerId!);
    } catch (e: any) {
      console.error("views.open falló:", e?.message, e?.slack ?? e);
    }
  }

  private async openCreateProjectModal(triggerId: string): Promise<void> {
    await this.client.call("views.open", {
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "create_project_modal",
        title: { type: "plain_text", text: "Create project" },
        submit: { type: "plain_text", text: "Create" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "name_block",
            label: { type: "plain_text", text: "Project name" },
            element: {
              type: "plain_text_input",
              action_id: "name",
              placeholder: { type: "plain_text", text: "e.g., Huracán Stats MVP" },
            },
          },
          {
            type: "input",
            block_id: "desc_block",
            optional: true,
            label: { type: "plain_text", text: "Description" },
            element: {
              type: "plain_text_input",
              action_id: "description",
              multiline: true,
              placeholder: { type: "plain_text", text: "What is this project about?" },
            },
          },
        ],
      },
    });
  }
}
