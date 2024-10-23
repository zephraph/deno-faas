// Inspired by but heavily modified from https://github.com/val-town/deno-http-worker/blob/main/deno-bootstrap/index.ts

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

// This holds the user's code and should only be set once
let userCode: unknown;

const server = Deno.serve(
  {
    onListen: () => {},
    onError: (error) => {
      console.error(error);
      return new Response("Error", { status: 500 });
    },
  },
  async (req) => {
    if (req.headers.get("X-Health-Check")) {
      return new Response("OK", { status: 200 });
    }

    // SECURITY: This should be hardened. We don't want end users to be able
    // to overwrite deployed code with their own.
    if (
      req.headers.get("X-Load-Code") &&
      req.method === "POST" &&
      typeof userCode === "undefined"
    ) {
      try {
        const script = await req.text();
        userCode =
          (await import(`data:text/tsx,${encodeURIComponent(script)}`)).default;
      } catch (error) {
        userCode = undefined;
        return new Response(`Failed loading user code: ${error}`, {
          status: 400,
        });
      }
      return new Response("Loaded", { status: 200 });
    }
    // This could be expanded to support other types of exports
    if (typeof userCode !== "function") {
      throw new Error("No default export");
    }
    let timeout: number = 0;
    try {
      timeout = setTimeout(() => {
        throw new Error("Timeout");
      }, 60_000);
      return userCode(req);
    } catch (error) {
      if (error instanceof Deno.errors.NotCapable) {
        return new Response("Naughty, Naughty", { status: 401 });
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
