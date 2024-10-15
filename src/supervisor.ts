import http from "node:http";

class Worker {
  #socketFile: string;
  #process: Deno.ChildProcess;
  #agent: http.Agent;
  #running = true;

  constructor(public readonly name: string, code: string, agent: http.Agent) {
    this.#socketFile = `${name}-${crypto.randomUUID()}.sock`
    this.#process = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "./src/bootstrap.ts",
        this.#socketFile,
        code
      ],
      stdout: "piped",
    }).spawn()
    this.#process.stdout.pipeTo(Deno.stdout.writable);
    this.#agent = agent
    this.#process.status.then(() => {
      this.#running = false
    })
  }

  run(req: Request) {
    const {promise , resolve, reject} = Promise.withResolvers<Response>();
    const httpReq = http.request("http://deno", {
      // method: req.method,
      // headers: Object.fromEntries(req.headers),
      agent: this.#agent,
      socketPath: this.#socketFile // socketPath is not working on http.request (denoland/deno#17910)
    }, (res) => {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      res.on("error", reject)
      res.on("data", (chunk) => {
        writer.write(chunk);
      });

      res.on("end", () => {
        writer.close();
        resolve(new Response(readable, {
          headers: new Headers(res.headers as any),
          status: res.statusCode,
          statusText: res.statusMessage,
        }));
      });
    })

    if (req.body){
      httpReq.write(req.body);
    }

    httpReq.end();
    return promise;
  }

  async waitForSocket() {
    while (this.#running) {
      try {
        await Deno.lstat(this.#socketFile);
        break;
      } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)){
          throw e
        } 
        await new Promise((r) => setTimeout(r, 20))
      }
    }
  }
}

export class DenoHttpSupervisor {
  #agent: http.Agent;
  #workers: Record<string, Worker>;
  #server: Deno.HttpServer;

  constructor() {
    this.#agent = new http.Agent({
      keepAlive: true,
    });
    this.#workers = {}
    
    this.#server = Deno.serve(async (req) => {
      const url = new URL(req.url);
      const name = url.pathname.slice(1)
      if (name in this.#workers) {
        const worker = this.#workers[name]
        return worker.run(req)
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    });
  }

  load (name: string, code: string) {
    const w = new Worker(name, code, this.#agent)
    this.#workers[name] = w
    return w.waitForSocket()
  }
}
