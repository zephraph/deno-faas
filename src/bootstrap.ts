// Copied from https://github.com/val-town/deno-http-worker/blob/main/deno-bootstrap/index.ts

const script = Deno.args[0];

{
  const oldLog = console.log;
  const oldInfo = console.info;
  const oldWarn = console.warn;
  const oldError = console.error;
  console.log = (...data) =>
    oldLog(`LOG  [${new Date().toISOString()}]`, ...data);
  console.info = (...data) =>
    oldInfo(`INFO [${new Date().toISOString()}]`, ...data);
  console.warn = (...data) =>
    oldWarn(`WARN [${new Date().toISOString()}]`, ...data);
  console.error = (...data) =>
    oldError(`ERROR [${new Date().toISOString()}]`, ...data);
  // Ensure console can't be further modified
  Object.freeze(console);
}

if (!script) {
  throw new Error("Script is required");
}

const mod = await import(`data:text/tsx,${encodeURIComponent(script)}`);
if (!mod.default) {
  throw new Error("No default export");
}

const { default: main } = mod;

if (typeof main !== "function") {
  throw new Error("Default export is not a function");
}

const server = Deno.serve(
  {
    onListen: () => {},
    onError: (error) => {
      console.error(error);
      return new Response("Error", { status: 500 });
    },
  },
  (req) => {
    if (req.headers.get("X-Health-Check")) {
      return new Response("OK", { status: 200 });
    }
    let timeout: number = 0;
    try {
      timeout = setTimeout(() => {
        throw new Error("Timeout");
      }, 60_000);
      return main(req);
    } catch (error) {
      if (error instanceof Deno.errors.NotCapable) {
        return new Response("Naughty", { status: 401 });
      }
      if (error instanceof Error && error.message === "Timeout") {
        return new Response("Timed out", { status: 408 });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
);

globalThis.onerror = (event) => {
  console.error(event);
  event.preventDefault();
};

Deno.addSignalListener("SIGINT", async () => {
  await server.shutdown();
  Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
  await server.shutdown();
  Deno.exit(0);
});
