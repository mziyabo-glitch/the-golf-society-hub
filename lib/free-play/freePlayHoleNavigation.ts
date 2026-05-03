export async function flushThenSetHole(
  flushPending: () => Promise<void>,
  setHole: (nextHole: number) => void,
  nextHole: number,
): Promise<void> {
  await flushPending();
  setHole(nextHole);
}
