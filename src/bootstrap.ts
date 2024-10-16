// Copied from https://github.com/val-town/deno-http-worker/blob/main/deno-bootstrap/index.ts

const port = Deno.args[0];
const script = Deno.args[1];

if (!port) {
  throw new Error("Port is required");
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
    port: parseInt(port),
    onListen: () => {},
    onError: (error) => {
      console.error(error);
      return new Response("Error", { status: 500 });
    },
  },
  (req) => {
    return main(req);
  }
);

globalThis.onerror = (event) => {
  console.error(event);
  event.preventDefault();
};

Deno.addSignalListener("SIGINT", async () => {
  await server.shutdown();
});
