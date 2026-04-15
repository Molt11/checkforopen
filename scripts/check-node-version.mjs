#!/usr/bin/env node

const REQUIRED_NODE_MAJOR = 24

const current = process.versions.node
const currentMajor = Number.parseInt(current.split('.')[0] || '', 10)

if (currentMajor !== REQUIRED_NODE_MAJOR) {
  console.error(
    [
      `error: Mission Control requires Node ${REQUIRED_NODE_MAJOR}.x, but found ${current}.`,
      'use `nvm use 24` (or your version manager equivalent) before installing, building, or starting the app.',
    ].join('\n')
  )
  process.exit(1)
}
