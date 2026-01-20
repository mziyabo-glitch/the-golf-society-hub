import { getFirestore } from "firebase/firestore";
import { app } from "./app";

export { app } from "./app";
export const db = getFirestore(app);

// ✅ This is safe now because platformAuth no longer imports from index.ts
export { auth, ensureSignedIn } from "./platformAuth";
