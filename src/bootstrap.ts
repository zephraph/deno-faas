// Copied from https://github.com/val-town/deno-http-worker/blob/main/deno-bootstrap/index.ts

const socketFile = Deno.args[0];
const script = Deno.args[1];

if (!socketFile) {
  throw new Error("Socket file is required");
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
    path: socketFile,
    onListen: () => {},
    onError: (error) => {
      console.error(error);
      return new Response("Error", { status: 500 });
    },
  },
  (req) => {
    const headerUrl = req.headers.get("X-Deno-Worker-Url");
    if (!headerUrl) {
      return Response.json({ warming: true }, { status: 200 });
    }

    const url = new URL(headerUrl);
    req = new Request(url.toString(), req);
    req.headers.delete("host");
    req.headers.delete("connection");
    if (req.headers.has("X-Deno-Worker-Host")) {
      req.headers.set("host", req.headers.get("X-Deno-Worker-Host")!);
    }
    if (req.headers.has("X-Deno-Worker-Connection")) {
      req.headers.set(
        "connection",
        req.headers.get("X-Deno-Worker-Connection")!
      );
    }

    req.headers.delete("X-Deno-Worker-Url");
    req.headers.delete("X-Deno-Worker-Host");
    req.headers.delete("X-Deno-Worker-Connection");

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
