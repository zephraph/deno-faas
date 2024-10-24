import { EventEmitter } from "node:events";
import { nanoid } from "npm:nanoid";
import { generateRandomName } from "./name-generator.ts";

interface WorkerEvents {
  listening: {
    id: string;
    port: number;
  };
  loading: {
    module: string;
  };
  shutdown: {
    code: number;
  };
}

export class Worker {
  #process: Deno.ChildProcess | null = null;
  #running = false;
  #emitter = new EventEmitter();

  name = generateRandomName();
  module: string | null = null;
  port: number;

  private constructor() {
    this.port = this.findFreePort();
  }

  static async create() {
    const worker = new Worker();
    await worker.start();
    return worker;
  }

  async start() {
    await Deno.mkdir(`./data/workers/${this.name}`, { recursive: true });
    this.#process = new Deno.Command(
      "docker",
      {
        args: [
          "run",
          "-i",
          "--rm",
          "--name",
          this.name,
          "-v",
          `./data/workers/${this.name}:/app/data`,
          `-p`,
          `${this.port}:8000`,
          "--cpus",
          "0.2",
          "--memory",
          "200m",
          "worker:latest",
        ],
      },
    ).spawn();
    this.#running = true;
    this.#emit("listening", { id: this.name, port: this.port });

    this.#process.status.then(({ code }) => {
      console.log(
        "[worker]",
        `${this.name}::module(${this.module})`,
        "stopped with",
        code,
      );
      this.#running = false;
      this.#emit("shutdown", { code });
    });
  }

  get running() {
    return this.#running;
  }

  run(req: Request, module?: string) {
    if (module) {
      this.module = module;
      this.#emit("loading", { module });
    }
    const url = new URL(req.url);
    // Remove the module address from the path, but preserve whatever else may be there
    const newPath = url.pathname.split("/").slice(2).join("/");
    const newReq = new Request(
      `http://localhost:${this.port}/${newPath}`,
      req,
    );
    const reqId = crypto.randomUUID();
    newReq.headers.set("x-req-id", reqId);
    if (module) {
      console.log("[worker]", `${this.name}`, "loading module", module);
      newReq.headers.set("x-load-module", module);
    } else {
      newReq.headers.delete("x-load-module");
    }
    return fetch(newReq);
  }

  private findFreePort(): number {
    const server = Deno.listen({ port: 0 });
    const { port } = server.addr as Deno.NetAddr;
    server.close();
    return port;
  }

  /**
   * @returns true if the worker is healthy, false otherwise
   */
  async healthCheck() {
    if (!this.#running) {
      return false;
    }
    const res = await fetch(`http://localhost:${this.port}`, {
      headers: {
        "X-Health-Check": "true",
      },
    });
    return res.ok;
  }

  restart() {
    if (this.#running) {
      this.#process?.kill("SIGINT");
    }
    this.#emitter.removeAllListeners();
    return this.start();
  }

  async shutdown() {
    console.log("[worker]", `${this.name}`, "shutting down");
    if (this.#running) {
      this.#process?.kill("SIGINT");
    }
    this.#emitter.removeAllListeners();
    try {
      await Deno.remove(`./data/workers/${this.name}`, { recursive: true });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        // Nothing to clean up
        return;
      }
      throw e;
    }
  }

  #emit<E extends keyof WorkerEvents>(
    event: E,
    payload: WorkerEvents[E],
  ) {
    this.#emitter.emit(event, payload);
  }

  on<E extends keyof WorkerEvents>(
    event: E,
    listener: (payload: WorkerEvents[E]) => void,
  ) {
    this.#emitter.on(event, listener);
  }

  once<E extends keyof WorkerEvents>(
    event: E,
    listener: (payload: WorkerEvents[E]) => void,
  ) {
    this.#emitter.once(event, listener);
  }
}
