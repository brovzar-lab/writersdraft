/**
 * Firebase bootstrap. In development (and in the emulator test suite) the
 * app talks to the local emulator suite with a demo project — no real
 * credentials required. Set VITE_FIREBASE_* env vars for production.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const env =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env ??
  {};

const useEmulator =
  env.VITE_USE_EMULATOR !== "false" && !env.VITE_FIREBASE_API_KEY;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ?? "writersdraft-demo.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "writersdraft-demo",
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ?? "writersdraft-demo.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "0",
  appId: env.VITE_FIREBASE_APP_ID ?? "demo-app-id",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    if (useEmulator) {
      try {
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
        connectAuthEmulator(auth, "http://127.0.0.1:9099", {
          disableWarnings: true,
        });
      } catch {
        // Already connected (hot reload) — fine.
      }
    }
  }
  return { app: app!, db: db!, auth: auth! };
}

export const isEmulator = useEmulator;
