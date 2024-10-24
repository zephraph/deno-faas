import { join } from "node:path";

const DEFAULT_MODULE_PATH = "./data/modules";
const KV_FILE = "kv.sqlite";

const hash = (contentBytes: Uint8Array) =>
  crypto.subtle
    .digest("SHA-256", contentBytes)
    .then((b) => Array.from(new Uint8Array(b)))
    .then((a) => a.map((b) => b.toString(16).padStart(2, "0")).join(""));

interface ModuleStoreOptions {
  modulePath?: string;
  cleanup?: boolean;
}

export async function createModuleStore(ops: ModuleStoreOptions = {}) {
  const modulePath = ops.modulePath ?? DEFAULT_MODULE_PATH;
  await Deno.mkdir(modulePath, { recursive: true });
  const kv = await Deno.openKv(join(modulePath, KV_FILE));
  return new ModuleStore(kv, ops);
}

class ModuleStore {
  private cleanup: boolean;
  private modulePath: string;

  constructor(private readonly kv: Deno.Kv, ops: ModuleStoreOptions) {
    this.cleanup = ops.cleanup ?? false;
    this.modulePath = ops.modulePath ?? DEFAULT_MODULE_PATH;
  }

  /**
   * Gets the latest content hash version of a module from its name
   */
  async lookupVersion(name: string) {
    return (await this.kv.get<string>([name])).value;
  }

  /**
   * Saves a module to the store.
   *
   * @param name The name of the module.
   * @param content The content of the module.
   * @returns The hashed version of the module.
   */
  async save(name: string, content: string) {
    const contentBytes = new TextEncoder().encode(content);
    const version = await hash(contentBytes);
    await Deno.writeTextFile(join(this.modulePath, version), content);
    await this.kv.set([name], version);
    return version;
  }

  /**
   * Loads a module from the store.
   *
   * @param name The name of the module.
   * @returns The content of the module.
   */
  async loadByName(name: string) {
    const version = await this.lookupVersion(name);
    if (!version) {
      return null;
    }
    return this.loadByVersion(version);
  }

  loadByVersion(version: string) {
    return Deno.readTextFile(join(this.modulePath, version));
  }

  /**
   * Checks if a module exists by name.
   */
  async has(name: string) {
    const version = await this.lookupVersion(name);
    if (!version) {
      return false;
    }
    return (await Deno.lstat(join(this.modulePath, version))).isFile;
  }

  /**
   * Closes the module store.
   *
   * If the cleanup flag is set, the persistent store will be removed.
   */
  close() {
    this.kv.close();
    if (this.cleanup) {
      Deno.removeSync(this.modulePath, { recursive: true });
    }
  }

  [Symbol.dispose]() {
    this.close();
  }
}
