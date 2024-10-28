import { resolve as resolvePath } from "node:path";
import { nanoid } from "npm:nanoid";
import type { Module } from "./modules.ts";
import { generateRandomName } from "./name-generator.ts";

export class Worker {
  #process: Deno.ChildProcess | null = null;

  name = generateRandomName();
  module: Module | null = null;
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
          this.name + "_" + nanoid(4),
          "-v",
          `./data/workers/${this.name}:/app/data`,
          `-p`,
          `${this.port}:8000`,
          "--cpus",
          "0.1",
          "--memory",
          "30m",
          "worker:latest",
        ],
      },
    ).spawn();

    this.#process.status.then((status) => {
      console.log(
        "[worker]",
        `${this.name}::module(${this.module?.name}@${this.module?.version})`,
        "stopped with",
        status.code,
      );
      this.#process = null;
    });
  }

  async run(req: Request, module: Module) {
    let loading = false;
    if (!this.module || module.version !== this.module.version) {
      loading = true;
      this.module = module;
      await this.linkModule();
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
    if (loading) {
      console.log("[worker]", `${this.name}`, "loading module", module);
      newReq.headers.set("x-load-module", module.version);
    } else {
      newReq.headers.delete("x-load-module");
    }
    return fetch(newReq);
  }

  private async linkModule() {
    if (!this.module) {
      throw new Error("No module to link");
    }
    try {
      // Make the module available to the worker
      await Deno.link(
        resolvePath(`./data/modules/${this.module.version}`),
        resolvePath(`./data/workers/${this.name}/${this.module.version}`),
      );
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw new Error(`Failed to share module with worker: ${error}`);
      }
    }
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
    if (this.#process === null) {
      return false;
    }
    const startTime = Date.now();
    while (Date.now() - startTime < 5000) {
      try {
        const res = await fetch(`http://localhost:${this.port}`, {
          headers: {
            "X-Health-Check": "true",
          },
        });
        if (res.ok) {
          return true;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    return false;
  }

  async shutdown() {
    console.log("[worker]", `${this.name}`, "shutting down");
    this.#process?.kill("SIGINT");
    await this.cleanupData();
  }

  private async cleanupData() {
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
}
