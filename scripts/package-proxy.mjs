#!/usr/bin/env node
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.join(root, 'dist-proxy')
const temporary = path.join(root, '.pi/tmp')
await Promise.all([mkdir(output, { recursive: true }), mkdir(temporary, { recursive: true })])
const staging = await mkdtemp(path.join(temporary, 'proxy-package-'))
try {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['server/node/index.ts'],
    outfile: path.join(staging, 'server.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20.19',
    metafile: true,
    legalComments: 'none',
  })
  const imports = Object.values(result.metafile.outputs).flatMap((item) => item.imports)
  if (imports.some((item) => !item.path.startsWith('node:'))) {
    throw new Error('Proxy bundle has unexpected non-builtin runtime dependencies')
  }
  await Promise.all([
    copyFile(path.join(root, 'deploy/s1-pwa-proxy.service'), path.join(staging, 's1-pwa-proxy.service')),
    copyFile(path.join(root, 'deploy/s1-pwa-proxy.env.example'), path.join(staging, 's1-pwa-proxy.env.example')),
    copyFile(path.join(root, 'docs/home-proxy.md'), path.join(staging, 'README.md')),
    writeFile(path.join(staging, 'build.json'), JSON.stringify({
      builtAt: new Date().toISOString(), node: '>=20.19',
      commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    }, null, 2) + '\n'),
  ])
  await Promise.all(['server.mjs', 's1-pwa-proxy.service', 's1-pwa-proxy.env.example', 'README.md', 'build.json']
    .map((name) => chmod(path.join(staging, name), 0o644)))
  const archive = path.join(output, 's1-pwa-proxy.tar.gz')
  execFileSync('tar', ['-czf', archive, '-C', staging, 'server.mjs', 's1-pwa-proxy.service', 's1-pwa-proxy.env.example', 'README.md', 'build.json'])
  console.log(`Packaged ${archive}\nRequires Node.js >=20.19; no npm install needed on the server.`)
} finally {
  await rm(staging, { recursive: true, force: true })
}
