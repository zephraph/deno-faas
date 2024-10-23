import { EventEmitter } from "node:events";
import { Worker } from "./worker.ts";

export class DenoHttpSupervisor {
  #workers: Record<string, Worker>;
  #server: Deno.HttpServer;
  #emitter = new EventEmitter();

  constructor() {
    this.#workers = {};
    this.#server = Deno.serve({ port: 0 }, (req) => {
      const url = new URL(req.url);
      const name = url.pathname.slice(1);
      if (name in this.#workers) {
        const worker = this.#workers[name];
        return worker.run(req);
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
    return Object.keys(this.#workers);
  }

  on(event: "load", listener: (name: string, version: number) => void) {
    this.#emitter.on(event, listener);
    return () => {
      this.#emitter.removeListener(event, listener);
    };
  }

  async load(name: string, code: string) {
    let oldWorker: Worker | undefined;
    if (name in this.#workers) {
      oldWorker = this.#workers[name];
    }
    const newWorker = new Worker({
      name,
      code,
      version: (oldWorker?.version ?? 0) + 1,
    });
    const success = await newWorker.waitUntilReady();
    if (success && newWorker.running) {
      oldWorker?.shutdown();
      this.#workers[name] = newWorker;
      this.#emitter.emit("load", name);
    } else if (!newWorker.running) {
      console.error("worker stopped unexpectedly", name);
      return false;
    } else {
      console.error("failed to load", name);
      return false;
    }
    return true;
  }

  async shutdown() {
    console.log("[supervisor] shutting down");
    await this.#server.shutdown();
    for (const worker of Object.values(this.#workers)) {
      worker.shutdown();
    }
  }
}
