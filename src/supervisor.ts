import { EventEmitter } from "node:events";
import { Worker } from "./worker.ts";
import { createModuleStore } from "./modules.ts";
import { Pool, type PoolFactory } from "npm:lightning-pool";

const modules = await createModuleStore({ modulePath: "./data/modules" });

const workerPoolFactory: PoolFactory<Worker> = {
  create() {
    return new Worker();
  },
  destroy(worker) {
    worker.shutdown();
  },
  reset(worker) {
    worker.restart();
  },
  async validate(worker) {
    await worker.healthCheck();
  },
};

interface SupervisorOptions {
  idleWorkers?: number;
  maxWorkers?: number;
  workerTimeout?: number;
}

export class DenoHttpSupervisor {
  #workerPool: Pool<Worker>;

  #activeWorkers: Record<string, Worker> = {};
  #server: Deno.HttpServer;
  #emitter = new EventEmitter();

  constructor(opts: SupervisorOptions = {}) {
    this.#workerPool = new Pool(workerPoolFactory, {
      max: opts.maxWorkers ?? 2,
      min: opts.idleWorkers ?? 1,
      minIdle: opts.idleWorkers ?? 1,
      acquireMaxRetries: 10,
      acquireRetryWait: 20,
    });

    this.#workerPool.on("acquire", (worker) => {
      console.log("[pool] acquired", worker.name);
      this.#activeWorkers[worker.name] = worker;
    });

    this.#workerPool.on("return", (worker) => {
      console.log("[pool] return", worker.name);
      delete this.#activeWorkers[worker.name];
    });

    this.#workerPool.start();

    this.#server = Deno.serve({ port: 0 }, async (req) => {
      const url = new URL(req.url);
      const name = url.pathname.slice(1);
      if (name in this.#activeWorkers) {
        const worker = this.#activeWorkers[name];
        return worker.run(req);
      } else if (await modules.has(name)) {
        const worker = await this.#workerPool.acquire();
        return worker.run(req, name);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
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
    return Object.keys(this.#activeWorkers);
  }

  on(event: "load", listener: (name: string, version: number) => void) {
    this.#emitter.on(event, listener);
    return () => {
      this.#emitter.removeListener(event, listener);
    };
  }

  load(name: string, code: string) {
    return modules.save(name, code);
  }

  async shutdown() {
    console.log("[supervisor] shutting down");
    await this.#server.shutdown();
    await this.#workerPool.closeAsync();
    for (const worker of Object.values(this.#activeWorkers)) {
      worker.shutdown();
    }
  }
}
