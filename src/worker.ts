interface WorkerOptions {
  name: string;
  code: string;
  version: number;
}

export class Worker {
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

    this.#process.status.then(({ code }) => {
      console.log(
        "[worker]",
        `${this.name}@${this.version}`,
        "stopped with",
        code,
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
