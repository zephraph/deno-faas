import { EventEmitter } from "node:events";
import { Module, modules } from "./modules.ts";
import { Worker } from "./worker.ts";

export class DenoHttpSupervisor {
  #workers: Record<string, Worker> = {};
  #server: Deno.HttpServer;
  #emitter = new EventEmitter();

  constructor() {
    // Ensure the workers directory exists
    Deno.mkdirSync("./data/workers", { recursive: true });

    this.#server = Deno.serve({ port: 0 }, async (req) => {
      const url = new URL(req.url);
      const moduleName = url.pathname.slice(1);
      console.log("[supervisor] request for", moduleName);
      const module = await Module.fromName(moduleName);

      if (!module) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }

      const worker = this.#workers[moduleName] ?? await Worker.create();
      this.#workers[moduleName] = worker;
      if (!await worker.healthCheck()) {
        return Response.json({ error: "Health Check Failed" }, { status: 500 });
      }
      return worker.run(req, module);
    });
    console.log(
      "[supervisor] listening on",
      (this.#server.addr as Deno.NetAddr).port,
    );
  }

  get url() {
    // @ts-expect-error it's fine
    return `http://${this.#server.addr.hostname}:${this.#server.addr.port}`;
  }

  get ids() {
    return Object.keys(this.#workers);
  }

  on(event: "load", listener: (name: string, version: number) => void) {
    this.#emitter.on(event, listener);
    return () => {
      this.#emitter.removeListener(event, listener);
    };
  }

  async load(name: string, code: string) {
    await modules.save(name, code);
    this.#emitter.emit("load", name);
  }

  async shutdown() {
    console.log("[supervisor] shutting down");
    Object.values(this.#workers).forEach((worker) => worker.shutdown());
    await this.#server.shutdown();
    console.log("[supervisor] shutdown success! 🎉");
  }
}
