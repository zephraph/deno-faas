interface WorkerOptions {
  name: string;
  code: string;
  version: number;
}

class Worker {
  #process: Deno.ChildProcess;
  #running = true;
  name: string;
  version: number;
  port: number;

  constructor({ name, code, version }: WorkerOptions) {
    this.name = name;
    this.version = version;
    this.port = this.findFreePort();
    this.#process = new Deno.Command(
      "docker",
      {
        args: [
          "run",
          "-i",
          "--rm",
          `-p`,
          `${this.port}:8000`,
          "--cpus",
          "0.2",
          "--memory",
          "200m",
          "worker",
          code,
        ],
        stderr: "piped",
        stdout: "piped",
      },
    ).spawn();

    this.#process.status.then((status) => {
      console.log(
        "[worker]",
        `${this.name}@${this.version}`,
        "stopped with",
        status,
      );
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
    let timedout = false;
    const timeout = setTimeout(() => {
      timedout = true;
    }, 5000);
    while (this.#running && !timedout) {
      try {
        const res = await fetch(`http://localhost:${this.port}`, {
          headers: {
            "X-Health-Check": "true",
          },
        });
        if (res.status === 200) {
          clearTimeout(timeout);
          return true;
        }
      } catch (_) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    clearTimeout(timeout);
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

  get ids() {
    return Object.keys(this.#workers);
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
