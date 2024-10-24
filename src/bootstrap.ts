// Inspired by but heavily modified from https://github.com/val-town/deno-http-worker/blob/main/deno-bootstrap/index.ts
import { Mutex } from "./mutex.ts";

const moduleLoadMutex = new Mutex();

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
    const moduleToLoad = req.headers.get("X-Load-Module");
    if (moduleToLoad) {
      console.log("[bootstrap] loading module", moduleToLoad);
      try {
        const moduleCode = await Deno.readTextFile(moduleToLoad);
        console.log("[bootstrap] read code", moduleCode);
        if (!moduleCode) {
          return new Response("Module not found", { status: 404 });
        }
        await moduleLoadMutex.withLock(async () => {
          userCode =
            (await import(`data:text/tsx,${encodeURIComponent(moduleCode)}`))
              .default;
          console.log("[bootstrap] loaded code", userCode);
        });
      } catch (error) {
        userCode = undefined;
        return new Response(`Failed loading user code: ${error}`, {
          status: 400,
        });
      }
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
