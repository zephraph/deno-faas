export class Mutex {
  #locked = false;
  #queue: Array<() => void> = [];

  lock() {
    if (!this.#locked) {
      this.#locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.#queue.push(resolve);
    });
  }

  unlock(): void {
    if (this.#queue.length > 0) {
      const next = this.#queue.shift();
      next?.();
    } else {
      this.#locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    try {
      await this.lock();
      return await fn();
    } finally {
      this.unlock();
    }
  }
}
