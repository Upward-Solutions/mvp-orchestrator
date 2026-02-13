import type {Request, Response} from "express";
import {SlackClient} from "./SlackClient.js";
import {SlackSignature} from "./SlackSignature.js";
import type {Project} from "./Project.js";

export class InteractionHandler {
  private readonly client: SlackClient;
  private readonly signature: SlackSignature;
  private readonly projectsChannel: string;

  private projectSeq = 1;
  private readonly projectsById = new Map<string, Project>();

  constructor(client: SlackClient, signature: SlackSignature, projectsChannel: string) {
    this.client = client;
    this.signature = signature;
    this.projectsChannel = projectsChannel;
  }

  async handle(req: Request, res: Response): Promise<void> {
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
