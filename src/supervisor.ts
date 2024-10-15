import http from "node:http";

interface DenoHttpWorkerOptions {}

interface DenoHttpConstructor {
  socketFile: string;
}

class DenoHttpWorker {
  #socketFile: string;
  #agent: http.Agent;

  private constructor(opts: DenoHttpConstructor) {
    this.#socketFile = opts.socketFile;
    this.#agent = new http.Agent({
      keepAlive: true,
    });
  }

  static async start() {
    const worker = new DenoHttpWorker({
      socketFile: await Deno.makeTempFile({ suffix: "deno-http.sock" }),
    });
    worker.#warmup();
    return worker;
  }

  async #warmup() {
    http.request("http://deno", {
      agent: this.#agent,
      socketPath: this.#socketFile,
    });
  }

  [Symbol.dispose](): void {
    if (this.#socketFile) {
      Deno.remove(this.#socketFile);
    }
  }
}

Deno.serve(async (req) => {
  switch (`${req.method} ${req.url}`) {
    case "POST /run": {
      const { name, env, script } = await req.json();
      const socketFile = await Deno.makeTempFile({ suffix: "deno-http.sock" });
      const process = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--allow-net",
          `--lock=script-${name}.lock`,
          `./bootstrap.ts`,
          socketFile,
          script,
        ],
        env,
      });
      break;
    }
    default:
      return Response.json({ error: "Not found" }, { status: 404 });
  }
});

// // Proxy
// Deno.serve({ port: 4322 }, (req) => {
//   const url = new URL(req.url);
//   console.log(`[proxy] ${req.method} ${url}`);

//   // Print out the headers
//   console.log("[proxy] Headers:");
//   for (const [key, value] of req.headers) {
//     console.log(`  ${key}: ${value}`);
//   }

//   return fetch(req);
// });
