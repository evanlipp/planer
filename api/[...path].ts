import type { Express, Request, Response } from 'express';
import { createApp } from '../backend/src/app.factory';

let cachedServer: Promise<Express> | undefined;

async function getServer() {
  if (!cachedServer) {
    cachedServer = createApp().then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as Express;
    });
  }
  return cachedServer;
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: Request, res: Response) {
  const server = await getServer();
  return server(req, res);
}
