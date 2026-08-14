import { defineConfig } from 'vitest/config'

// Deliberately no jsdom and no component rendering: what these tests cover is
// the pure logic that has actually gone wrong before — the API↔UI adapter, the
// portal gate, and the fetch wrapper's error mapping. Rendering tests would
// need a DOM, would be slower, and would mostly re-assert JSX. Interaction is
// covered by the manual checklist in docs/MANUAL_TEST_CHECKLIST.md instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
