import { spawn } from 'node:child_process'

const processes = [
  { name: 'bot', args: ['run', 'dev'] },
  { name: 'api', args: ['run', 'dev:api'] },
  { name: 'web', args: ['--prefix', 'web', 'run', 'dev'] },
]

let stopping = false
const children = processes.map(({ name, args }) => {
  const child = spawn('npm', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  const write = (stream, chunk) => stream.write(`[${name}] ${chunk}`)
  child.stdout.on('data', (chunk) => write(process.stdout, chunk))
  child.stderr.on('data', (chunk) => write(process.stderr, chunk))
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[stack] ${name} stopped unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'none'})`)
      shutdown(1)
    }
  })
  return child
})

function shutdown(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  setTimeout(() => process.exit(exitCode), 500)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('[stack] Starting bot, API, and web. Keep this terminal open.')
