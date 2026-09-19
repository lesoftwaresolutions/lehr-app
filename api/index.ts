import type { IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<any> | null = null;

function getApp() {
  if (!appPromise) {
    // @ts-ignore
    appPromise = import("../artifacts/api-server/dist/app.mjs").then((m) => m.default);
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  return app(req, res);
}
