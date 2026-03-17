/**
 * STEP 1 strip test: minimal layout for event/[id].
 * No hooks, no guards, no wrappers, no providers, no conditionals.
 */
import { Slot } from "expo-router";

export default function Layout() {
  console.log("EVENT_LAYOUT_STRIPPED");
  return <Slot />;
}
