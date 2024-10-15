import { DenoHttpSupervisor } from "./src/supervisor.ts";

const supervisor = new DenoHttpSupervisor();

await supervisor.load("test", `export default function main() {return new Response("yo");}`)
