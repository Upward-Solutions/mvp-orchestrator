import type { Router } from "express";

export interface HttpModule {
  readonly name: string;
  registerRoutes(router: Router): void;
}
