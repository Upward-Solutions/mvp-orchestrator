import "dotenv/config";
import { HttpServer } from "./http/index.js";
import { SlackModule } from "./modules/slack/index.js";

const port = Number(process.env.PORT) || 3000;
const botToken = process.env.SLACK_BOT_TOKEN ?? "";
const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
const projectsChannel = process.env.SLACK_PROJECTS_CHANNEL || "#mvp-log";

if (!botToken) console.warn("⚠ Variable SLACK_BOT_TOKEN no definida");
if (!signingSecret) console.warn("⚠ Variable SLACK_SIGNING_SECRET no definida");

const server = new HttpServer({ port });

server.registerModule(
  new SlackModule({ botToken, signingSecret, projectsChannel })
);

server.start();
