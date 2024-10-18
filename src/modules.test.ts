import { assert, assertEquals } from "jsr:@std/assert";
import { createModuleStore } from "./modules.ts";

Deno.test("module store", async () => {
  using modules = await createModuleStore({
    cleanup: true,
    modulePath: "./moduleTest",
  });
  const code = "console.log('test')";
  const version = await modules.save("test", code);
  assert(version, "expected version");
  const module = await modules.load("test");
  assertEquals(module, code);
});
