export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (sanitized as Record<string, unknown>)[key] = value;
    }
  }

  return sanitized;
}
