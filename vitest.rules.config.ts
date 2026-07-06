import { defineConfig } from 'vitest/config'

// Firestore security-rules tests. Run via `npm run test:rules`, which wraps
// vitest in `firebase emulators:exec` so a Firestore emulator is guaranteed.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
