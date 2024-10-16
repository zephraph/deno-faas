class Worker {
  #process: Deno.ChildProcess;
  #running = true;
  port: number;

  constructor(public readonly name: string, code: string) {
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
    this.#process.status.then(() => {
      this.#running = false;
    });
  }

  run(req: Request) {
    const url = new URL(req.url);
    const newReq = new Request(
      `http://localhost:${this.port}${url.pathname}`,
      req
    );
    console.log("[worker]", newReq);
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
          console.log("[worker]", this.name, "is ready");
          break;
        }
        console.error("[worker]", this.name, "errored", e);
        throw e;
      }
    }
  }
}

export class DenoHttpSupervisor {
  #workers: Record<string, Worker>;
  #server: Deno.HttpServer;

  constructor() {
    this.#workers = {};
    this.#server = Deno.serve((req) => {
      const url = new URL(req.url);
      const name = url.pathname.slice(1);
      if (name in this.#workers) {
        const worker = this.#workers[name];
        return worker.run(req);
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    });
  }

  load(name: string, code: string) {
    this.#workers[name] = new Worker(name, code);
    return this.#workers[name].waitUntilReady();
  }
}
