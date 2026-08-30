import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: { host: '127.0.0.1', port: 4173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
