import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: { input: { main: 'index.html', lab: 'lab/index.html' } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
