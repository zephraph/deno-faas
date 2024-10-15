import { Agent, fetch as uFetch } from 'npm:undici';

class Worker {
  #socketFile: string;
  #process: Deno.ChildProcess;
  #agent: Agent;
  #running = true;

  constructor(public readonly name: string, code: string) {
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
    // this.#process.stdout.pipeTo(Deno.stdout.writable);
    this.#agent = new Agent({
      connect: {
        socketPath: this.#socketFile,
        keepAlive: true
      }
    })
    this.#process.status.then(() => {
      this.#running = false
    })
  }

  async run(req: Request) {
    let res = await uFetch(req.url, {
      dispatcher: this.#agent
    })

    console.log(res)

    let resJson = await res.json();
    return new Response(JSON.stringify(resJson), { headers: {"Content-Type": "application/json"}})
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
  #workers: Record<string, Worker>;
  #server: Deno.HttpServer;

  constructor() {
    this.#workers = {}
    this.#server = Deno.serve((req) => {
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
    const w = new Worker(name, code)
    this.#workers[name] = w
    return w.waitForSocket()
  }
}
