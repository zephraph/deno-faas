import { DenoHttpSupervisor } from "./src/supervisor.ts";

const supervisor = new DenoHttpSupervisor();

await supervisor.load(
  "test1",
  `
    import { Hono } from 'npm:hono'
    const app = new Hono()

    app.get('*', (c) => c.json({"msg": 'Hello Cloudflare Workers!'}))

    export default app.fetch
`,
);

await supervisor.load(
  "test2",
  `export default function main() {return Response.json({"test": "no"});}`,
);

await supervisor.load(
  "test3",
  `export default function main() {return fetch("https://example.com")}`,
);

Deno.addSignalListener("SIGINT", async () => {
    await supervisor.shutdown();
    Deno.exit(0);
});

Deno.addSignalListener("SIGTERM", async () => {
    await supervisor.shutdown();
    Deno.exit(0);
});
