const memory = new Map<string, string>();

const store = {
  async getItem(key: string): Promise<string | null> {
    return memory.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
  },
  async clear(): Promise<void> {
    memory.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return [...memory.keys()];
  },
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return keys.map((k) => [k, memory.get(k) ?? null]);
  },
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    for (const [k, v] of keyValuePairs) memory.set(k, v);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) memory.delete(k);
  },
};

export default store;
