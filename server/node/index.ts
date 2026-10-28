import { readConfig } from './app'
import { createProxyServer } from './server'

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
if (major < 20 || (major === 20 && minor < 19)) {
  console.error('Node.js 20.19 or later is required')
  process.exit(1)
}

try {
  const config = readConfig(process.env)
  const server = createProxyServer(config)
  server.on('error', (error: NodeJS.ErrnoException) => {
    console.error(`Proxy server error: ${error.code ?? 'unknown'}`)
    process.exitCode = 1
  })
  server.listen(config.port, config.host, () => {
    console.log(`S1 home proxy listening on ${config.host}:${config.port}`)
  })
  const shutdown = () => {
    server.close(() => process.exit(0))
    server.closeIdleConnections()
    setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 8000).unref()
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid proxy configuration')
  process.exitCode = 1
}
