/**
 * STEP 2 strip test: minimal layout for (app).
 * No hooks, no guards, no wrappers, no providers, no conditionals.
 */
import { Slot } from "expo-router";

export default function Layout() {
  console.log("APP_LAYOUT_STRIPPED");
  return <Slot />;
}
