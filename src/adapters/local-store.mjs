export class MemoryStore {
  #state;

  constructor(initialState = {}) {
    this.#state = structuredClone(initialState);
  }

  async get() {
    return structuredClone(this.#state);
  }

  async set(nextState) {
    this.#state = structuredClone(nextState);
    return this.get();
  }

  async update(mutator) {
    const draft = await this.get();
    const next = await mutator(draft);
    return this.set(next ?? draft);
  }

  async export() {
    return JSON.stringify(await this.get(), null, 2);
  }

  async import(json) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid OrbitOS state.");
    }
    return this.set(parsed);
  }
}

export function createBrowserStore(storage, key, fallback = {}) {
  if (!storage) throw new Error("A storage implementation is required.");

  return {
    async get() {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    },

    async set(nextState) {
      storage.setItem(key, JSON.stringify(nextState));
      return structuredClone(nextState);
    },

    async update(mutator) {
      const current = await this.get();
      const next = await mutator(structuredClone(current));
      return this.set(next ?? current);
    },

    async export() {
      return JSON.stringify(await this.get(), null, 2);
    },

    async import(json) {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid OrbitOS state.");
      }
      return this.set(parsed);
    },
  };
}
