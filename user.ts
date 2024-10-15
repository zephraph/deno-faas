import { DenoHttpSupervisor } from "./src/supervisor.ts";

const supervisor = new DenoHttpSupervisor();

await supervisor.load("test1", `
    import { Hono } from 'npm:hono'
    const app = new Hono()

    app.get('*', (c) => c.json({"msg": 'Hello Cloudflare Workers!'}))

    export default app.fetch
`)

await supervisor.load("test2", `export default function main() {return Response.json({"test": "no"});}`)
