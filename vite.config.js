import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        student: resolve(process.cwd(), 'student.html'),
        teacher: resolve(process.cwd(), 'teacher.html'),
      },
    },
  },
})
