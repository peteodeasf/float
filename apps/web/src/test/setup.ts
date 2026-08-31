// Runs before every test file.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Each test starts on an empty page. Without this a component from the previous test is still
// mounted and queries match the wrong thing.
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
