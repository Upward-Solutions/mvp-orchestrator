import type {Router} from "express";
import bodyParser from "body-parser";
import type {HttpModule} from "../../http/types.js";
import {SlackClient} from "./SlackClient.js";
import {SlackSignature} from "./SlackSignature.js";
import {SlackModuleConfig} from "./SlackModuleConfig.js";
import {CommandHandler} from "./CommandHandler.js";
import {InteractionHandler} from "./InteractionHandler.js";

export class SlackModule implements HttpModule {
  readonly name = "slack";

  private readonly commandHandler: CommandHandler;
  private readonly interactionHandler: InteractionHandler;

  constructor(config: SlackModuleConfig) {
    const client = new SlackClient(config.botToken);
    const signature = new SlackSignature(config.signingSecret);

    this.commandHandler = new CommandHandler(client, signature);
    this.interactionHandler = new InteractionHandler(client, signature, config.projectsChannel);
  }

  registerRoutes(router: Router): void {
    const rawParser = bodyParser.raw({ type: "application/x-www-form-urlencoded" });

    router.post("/slack/commands", rawParser, (req, res) => {
      void this.commandHandler.handle(req, res);
    });

    router.post("/slack/interactions", rawParser, (req, res) => {
      void this.interactionHandler.handle(req, res);
    });
  }
}
