import { assert, assertEquals } from "jsr:@std/assert";
import { createModuleStore } from "./modules.ts";

Deno.test("module store", async () => {
  const modulePath = await Deno.makeTempDir();
  using modules = await createModuleStore({
    cleanup: true,
    modulePath,
  });
  const code = "console.log('test')";
  const version = await modules.save("test", code);
  assert(version, "expected version");
  const module = await modules.loadByName("test");
  const versionModule = await modules.loadByVersion(version);
  assertEquals(module, code);
  assertEquals(versionModule, code);
});
