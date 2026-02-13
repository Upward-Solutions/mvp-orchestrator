import {type Request, type Response, type Router} from "express";
import bodyParser from "body-parser";
import type {HttpModule} from "../../http/types.js";
import {SlackClient} from "./SlackClient.js";
import {SlackSignature} from "./SlackSignature.js";
import {Project} from "./Project.js";
import {SlackModuleConfig} from "./SlackModuleConfig.js";

export class SlackModule implements HttpModule {
  readonly name = "slack";

  private readonly client: SlackClient;
  private readonly signature: SlackSignature;
  private readonly projectsChannel: string;

  private projectSeq = 1;
  private readonly projectsById = new Map<string, Project>();

  constructor(config: SlackModuleConfig) {
    this.client = new SlackClient(config.botToken);
    this.signature = new SlackSignature(config.signingSecret);
    this.projectsChannel = config.projectsChannel;
  }

  registerRoutes(router: Router): void {
    const rawParser = bodyParser.raw({ type: "application/x-www-form-urlencoded" });

    router.post("/slack/commands", rawParser, (req, res) => {
      void this.handleCommand(req, res);
    });

    router.post("/slack/interactions", rawParser, (req, res) => {
      void this.handleInteraction(req, res);
    });
  }

  private async handleCommand(req: Request, res: Response): Promise<void> {
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

  // ────── Interacciones ──────

  private async handleInteraction(req: Request, res: Response): Promise<void> {
    const rawBody = (req.body as Buffer).toString("utf8");

    if (!this.signature.verify(rawBody, req.headers)) {
      res.status(401).send("invalid signature");
      return;
    }

    const params = new URLSearchParams(rawBody);
    const payloadStr = params.get("payload");
    if (!payloadStr) {
      res.status(200).send("ok");
      return;
    }

    const payload = JSON.parse(payloadStr);

    if (payload.type === "view_submission" && payload.view?.callback_id === "create_project_modal") {
      await this.handleCreateProject(payload, res);
      return;
    }

    res.status(200).send("ok");
  }

  private async handleCreateProject(payload: any, res: Response): Promise<void> {
    const userId: string = payload.user?.id;
    const name: string = payload.view.state.values?.name_block?.name?.value?.trim() ?? "";
    const description: string = payload.view.state.values?.desc_block?.description?.value?.trim() ?? "";

    if (!name) {
      res.json({
        response_action: "errors",
        errors: { name_block: "Project name is required." },
      });
      return;
    }

    const project = this.createProject(name, description, userId);

    res.json({ response_action: "clear" });

    const text = [
      `📁 *Project created*`,
      `*${project.id}* — ${project.name}`,
      project.description ? `_${project.description}_` : "",
      `Created by <@${userId}>`,
    ].filter(Boolean).join("\n");

    try {
      const im = await this.client.call("conversations.open", { users: userId });
      await this.client.call("chat.postMessage", { channel: (im as any).channel.id, text });
    } catch (e: any) {
      console.error("DM falló:", e?.message, e?.slack ?? e);
    }

    try {
      await this.client.call("chat.postMessage", { channel: this.projectsChannel, text });
    } catch (e: any) {
      console.error("Anuncio falló:", e?.message, e?.slack ?? e);
    }
  }

  // ────── Proyectos (in-memory) ──────

  private createProject(name: string, description: string, createdBy: string): Project {
    const id = `PRJ-${String(this.projectSeq).padStart(3, "0")}`;
    this.projectSeq += 1;

    const project: Project = {
      id,
      name,
      description,
      createdBy,
      createdAt: new Date().toISOString(),
    };

    this.projectsById.set(id, project);
    return project;
  }
}
