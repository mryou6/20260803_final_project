import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const deployCommit = String(process.env.COMMIT_REF ?? 'local').slice(0, 7)

export default defineConfig({
  define: {
    __DEPLOY_COMMIT__: JSON.stringify(deployCommit),
  },
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
