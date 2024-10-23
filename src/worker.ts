import { EventEmitter } from "node:events";
interface WorkerEvents {
  listening: {
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
  #process: Deno.ChildProcess;
  #running = false;
  #emitter = new EventEmitter();

  name: string = "";
  version: number = 0;
  port: number;

  constructor() {
    this.port = this.findFreePort();
    this.#process = this.start();
  }

  start() {
    this.#process = new Deno.Command(
      "docker",
      {
        args: [
          "run",
          "-i",
          // "--rm",
          "-v",
          "./data:/app/data",
          `-p`,
          `${this.port}:8000`,
          "--cpus",
          "0.2",
          "--memory",
          "200m",
          "worker:latest",
        ],
        // stderr: "piped",
        // stdout: "piped",
      },
    ).spawn();
    this.#running = true;

    this.#process.status.then(({ code }) => {
      console.log(
        "[worker]",
        `${this.name}@${this.version}`,
        "stopped with",
        code,
      );
      this.#running = false;
    });

    return this.#process;
  }

  get running() {
    return this.#running;
  }

  run(req: Request, module?: string) {
    const url = new URL(req.url);
    const newReq = new Request(
      `http://localhost:${this.port}${url.pathname}`,
      req,
    );
    const reqId = crypto.randomUUID();
    newReq.headers.set("x-req-id", reqId);
    if (module) {
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
    this.shutdown();
    this.start();
  }

  shutdown() {
    console.log("[worker]", `${this.name}@${this.version}`, "shutting down");
    if (this.#running) {
      this.#process.kill("SIGINT");
    }
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
