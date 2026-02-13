import express, { type Express, type Router } from "express";
import bodyParser from "body-parser";
import type { HttpModule } from "./types.js";

export interface HttpServerConfig {
  port: number;
}

export class HttpServer {
  private readonly app: Express;
  private readonly router: Router;
  private readonly config: HttpServerConfig;

  constructor(config: HttpServerConfig) {
    this.config = config;
    this.app = express();
    this.router = express.Router();

    this.setupMiddleware();
    this.setupBaseRoutes();
    this.app.use(this.router);
  }

  private setupMiddleware(): void {
    this.app.use(
      bodyParser.json({
        verify: (req, _res, buf) => {
          (req as any).rawBody = buf.toString("utf8");
        },
      })
    );
  }

  private setupBaseRoutes(): void {
    this.app.get("/health", (_req, res) => {
      res.status(200).send("ok");
    });
  }

  registerModule(module: HttpModule): void {
    module.registerRoutes(this.router);
    console.log(`Módulo registrado: ${module.name}`);
  }

  start(): void {
    this.app.listen(this.config.port, () => {
      console.log(`Servidor escuchando en :${this.config.port}`);
    });
  }
}
