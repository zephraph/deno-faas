import { Worker } from "./worker.ts";
import {
  Pool,
  type PoolConfiguration,
  type PoolFactory,
} from "npm:lightning-pool";

const workerPoolFactory: PoolFactory<Worker> = {
  create() {
    return Worker.create();
  },
  destroy(worker) {
    worker.shutdown();
  },
  reset(worker) {
    worker.restart();
  },
  async validate(worker) {
    await worker.healthCheck();
  },
};

export interface WorkerPoolEvents {
  /** Emitted when a worker is added to the pool. */
  create: [Worker];
  /** Emitted when `factory.create` fails. */
  ["create-error"]: [Error];
  /** Emitted when a worker is acquired. */
  acquire: [Worker];
  /** Emitted when a worker is returned to the pool. */
  return: [Worker];
  /** Emitted when a worker is destroyed and removed from the pool. */
  destroy: [Worker];
  /** Emitted when `factory.destroy` fails. */
  ["destroy-error"]: [Error, Worker];
  /** Emitted when a worker is reset. */
  reset: [Worker];
  /** Emitted when `factory.reset` fails. */
  ["reset-error"]: [Error];
  /** Emitted when a worker is validated. */
  validate: [Worker];
  /** Emitted when `factory.validate` fails. */
  ["validate-error"]: [Error];
  /** Emitted when the pool is started. */
  start: [];
  /** Emitted when before closing the Pool */
  closing: [];
  /** Emitted when the pool is closed. */
  close: [];
}

export class WorkerPool extends Pool<Worker> {
  #activeWorkers: Record<string, Worker> = {};

  get activeWorkerKeys() {
    return Object.keys(this.#activeWorkers);
  }

  get activeWorkers() {
    // Return a frozen copy of the active workers
    return Object.freeze({ ...this.#activeWorkers });
  }

  setWorkerActive(worker: Worker) {
    if (worker.module) {
      console.log("[worker-pool] set worker active", worker.module);
      this.#activeWorkers[worker.module] = worker;
    } else {
      throw new Error(
        "[worker-pool] setWorkerActive called with worker without module",
      );
    }
  }

  constructor(opts: PoolConfiguration) {
    super(workerPoolFactory, opts);

    this.on("start", () => {
      console.log("[worker-pool] started");
    });
    this.on("create", (worker) => {
      console.log("[worker-pool] created worker", worker.name);
      // If the worker shuts down and we've got a hold on it, ensure it's released
      worker.on("shutdown", () => {
        if (this.isAcquired(worker)) {
          this.release(worker);
        }
      });
    });
    this.on("create-error", (error) => {
      console.error("[worker-pool] create error", error);
    });
    this.on("acquire", (worker) => {
      console.log("[worker-pool] acquired worker", worker.name);
    });
    this.on("return", (worker) => {
      if (worker.module) {
        delete this.#activeWorkers[worker.module];
      } else {
        console.warn(
          "[worker-pool] worker returned without module",
          worker.name,
        );
      }
      console.log("[worker-pool] return worker", worker.name);
    });
    this.on("destroy", (worker) => {
      worker.shutdown();
      console.log("[worker-pool] destroy worker", worker.name);
    });
    this.on("destroy-error", (error, worker) => {
      console.error("[worker-pool] destroy error", error, worker.name);
    });
    this.on("reset", (worker) => {
      console.log("[worker-pool] reset worker", worker.name);
    });
    this.on("reset-error", (error) => {
      console.error("[worker-pool] reset error", error);
    });
    this.on("validate", (worker) => {
      console.log("[worker-pool] validate worker", worker.name);
    });
    this.on("validate-error", (error) => {
      console.error("[worker-pool] validate error", error);
    });
    this.on("close", () => {
      console.log("[worker-pool] closed");
      this.removeAllListeners();
    });
  }

  override on<E extends keyof WorkerPoolEvents>(
    event: E,
    listener: (...args: WorkerPoolEvents[E]) => void,
  ) {
    super.on(event, listener);
    return this;
  }

  override once<E extends keyof WorkerPoolEvents>(
    event: E,
    listener: (...args: WorkerPoolEvents[E]) => void,
  ) {
    super.once(event, listener);
    return this;
  }
}
