#!/usr/bin/env node

const MIN_NODE_MAJOR = 24

const current = process.versions.node
const currentMajor = Number.parseInt(current.split('.')[0] || '', 10)

if (currentMajor < MIN_NODE_MAJOR) {
  console.error(
    [
      `error: Mission Control requires Node ${MIN_NODE_MAJOR}.x, but found ${current}.`,
      'use `nvm use 24` (or your version manager equivalent) before installing, building, or starting the app.',
    ].join('\n')
  )
  process.exit(1)
}
