import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const children = [
  spawn(process.execPath, ['--watch', 'server/index.mjs'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: root, stdio: 'inherit' }),
]

let shuttingDown = false

function shutdown(signal = 'SIGTERM', exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  children.forEach((child) => {
    if (!child.killed) child.kill(signal)
  })
  setTimeout(() => process.exit(exitCode), 500).unref()
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown) shutdown('SIGTERM', code ?? (signal ? 1 : 0))
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
