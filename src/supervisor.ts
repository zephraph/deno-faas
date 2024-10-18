class Worker {
  #process: Deno.ChildProcess;
  #running = true;
  port: number;
  version: number;

  constructor(public readonly name: string, code: string, version: number = 0) {
    this.version = version;
    this.port = this.findFreePort();
    this.#process = new Deno.Command(
      "docker",
      {
        args: [
          "run",
          "--rm",
          "-it",
          `-p`,
          `${this.port}:8000`,
          "--cpus",
          "0.2",
          "--memory",
          "200m",
          "worker",
          code,
        ],
        stdout: "piped",
      },
    ).spawn();

    this.#process.status.then(() => {
      this.#running = false;
    });
  }

  get running() {
    return this.#running;
  }

  run(req: Request) {
    const url = new URL(req.url);
    const newReq = new Request(
      `http://localhost:${this.port}${url.pathname}`,
      req,
    );
    const reqId = crypto.randomUUID();
    newReq.headers.set("x-req-id", reqId);
    return fetch(newReq);
  }

  private findFreePort(): number {
    const server = Deno.listen({ port: 0 });
    const { port } = server.addr as Deno.NetAddr;
    server.close();
    return port;
  }

  async waitUntilReady() {
    while (this.#running) {
      try {
        const server = Deno.listen({ port: this.port });
        server.close();
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      } catch (e) {
        if (e instanceof Deno.errors.AddrInUse) {
          console.log("[worker]", `${this.name}@${this.version}`, "is ready");
          return true;
        }
        console.error("[worker]", `${this.name}@${this.version}`, "errored", e);
        throw e;
      }
    }
    return false;
  }

  shutdown() {
    console.log("[worker]", `${this.name}@${this.version}`, "shutting down");
    if (this.#running) {
      this.#process.kill("SIGINT");
    }
  }
}

export class DenoHttpSupervisor {
  #workers: Record<string, Worker>;
  #server: Deno.HttpServer;

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
    console.log("[supervisor] listening on", this.#server.addr);
  }

  get url() {
    // @ts-expect-error it's fine
    return `http://${this.#server.addr.hostname}:${this.#server.addr.port}`;
  }

  async load(name: string, code: string) {
    let oldWorker: Worker | undefined;
    if (name in this.#workers) {
      oldWorker = this.#workers[name];
    }
    const newWorker = new Worker(name, code, (oldWorker?.version ?? 0) + 1);
    const success = await newWorker.waitUntilReady();
    if (success && newWorker.running) {
      oldWorker?.shutdown();
      this.#workers[name] = newWorker;
    }
  }

  async shutdown() {
    console.log("[supervisor] shutting down");
    await this.#server.shutdown();
    for (const worker of Object.values(this.#workers)) {
      worker.shutdown();
    }
  }
}
