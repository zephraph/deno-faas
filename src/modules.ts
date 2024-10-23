console.log("test 123");

const hash = (contentBytes: Uint8Array) =>
  crypto.subtle
    .digest("SHA-256", contentBytes)
    .then((b) => Array.from(new Uint8Array(b)))
    .then((a) => a.map((b) => b.toString(16).padStart(2, "0")).join(""));

interface ModuleStoreOptions {
  modulePath?: string;
  cleanup?: boolean;
}

export async function createModuleStore(ops: ModuleStoreOptions) {
  const kv = await Deno.openKv(ops.modulePath ?? DEFAULT_MODULE_PATH);
  return new ModuleStore(kv, ops);
}

const DEFAULT_MODULE_PATH = "./data/modules";
class ModuleStore {
  private cleanup: boolean;
  private modulePath: string;

  constructor(private readonly kv: Deno.Kv, ops: ModuleStoreOptions) {
    this.cleanup = ops.cleanup ?? false;
    this.modulePath = ops.modulePath ?? DEFAULT_MODULE_PATH;
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
    await this.kv.set([name, version], content);
    return version;
  }

  /**
   * Loads a module from the store.
   *
   * @param name The name of the module.
   * @param version The version of the module.
   * @returns The content of the module.
   */
  async load(name: string, version?: string) {
    if (version) {
      const { value } = await this.kv.get<string>(
        [name, version],
      );
      return value;
    }
    const result = await this.kv.list<string>({
      prefix: [name],
    }, {
      limit: 1,
    })
      .next()!;
    return result.value?.value ?? null;
  }

  async has(name: string, version?: string) {
    if (version) {
      return await this.kv.get([name, version]) !== null;
    } else {
      for await (const _ of this.kv.list({ prefix: [name] }, { limit: 1 })) {
        return true;
      }
      return false;
    }
  }

  /**
   * Closes the module store.
   *
   * If the cleanup flag is set, the persistent store will be removed.
   */
  close() {
    this.kv.close();
    if (this.cleanup) {
      Deno.removeSync(this.modulePath);
    }
  }

  [Symbol.dispose]() {
    this.close();
  }
}
