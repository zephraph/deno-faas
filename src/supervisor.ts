class Worker {
  #process: Deno.ChildProcess;
  #running = true;
  port: number;
  version: number;

  constructor(public readonly name: string, code: string, version: number = 0) {
    this.version = version;
    this.port = this.findFreePort();
    this.#process = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "--allow-net",
        `--lock=./store/${name}/deno.lock`,
        "./src/bootstrap.ts",
        this.port.toString(),
        code,
      ],
      stdout: "piped",
    }).spawn();

    Deno.mkdirSync(`store/${this.name}`, { recursive: true });

    // Setup logging
    const logFile = Deno.openSync(`store/${this.name}/stdout.log`, {
      write: true,
      create: true,
    });
    this.#process.stdout.pipeTo(logFile.writable);

    this.#process.status.then(() => {
      this.#running = false;
    });
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
          break;
        }
        console.error("[worker]", `${this.name}@${this.version}`, "errored", e);
        throw e;
      }
    }
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
    return `http://${this.#server.addr.hostname}:${this.#server.addr.port}`;
  }

  async load(name: string, code: string) {
    let oldWorker: Worker | undefined;
    if (name in this.#workers) {
      oldWorker = this.#workers[name];
    }
    this.#workers[name] = new Worker(name, code, (oldWorker?.version ?? 0) + 1);
    await this.#workers[name].waitUntilReady();
    oldWorker?.shutdown();
  }

  async shutdown() {
    console.log("[supervisor] shutting down");
    await this.#server.shutdown();
    for (const worker of Object.values(this.#workers)) {
      worker.shutdown();
    }
  }
}
