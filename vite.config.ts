import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.tools/**', '**/android/**', '**/artifacts/**', '**/releases/**', '**/docs/**'],
    },
  },
  build: { target: 'es2022' },
})
