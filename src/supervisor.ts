import { EventEmitter } from "node:events";
import { WorkerPool } from "./worker-pool.ts";
import { Module, modules } from "./modules.ts";

interface SupervisorOptions {
  idleWorkers?: number;
  maxWorkers?: number;
  workerTimeout?: number;
}

export class DenoHttpSupervisor {
  #workerPool: WorkerPool;
  #server: Deno.HttpServer;
  #emitter = new EventEmitter();

  constructor(opts: SupervisorOptions = {}) {
    this.#workerPool = new WorkerPool({
      max: opts.maxWorkers ?? 30,
      min: opts.idleWorkers ?? 1,
      minIdle: opts.idleWorkers ?? 1,
      acquireMaxRetries: 10,
      acquireRetryWait: 20,
    });

    this.#workerPool.start();

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

      if (moduleName in this.#workerPool.activeWorkers) {
        const worker = this.#workerPool.activeWorkers[moduleName];
        return worker.run(req, module);
      }

      const worker = await this.#workerPool.acquire();
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
    return this.#workerPool.activeWorkerKeys;
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
    await this.#server.shutdown();
    // Wait for workers to shutdown gracefully, but close it forcefully after 3 seconds
    await this.#workerPool.closeAsync(3000);
    console.log("[supervisor] shutdown complete");
  }
}
