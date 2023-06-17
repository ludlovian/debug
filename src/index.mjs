import process from 'node:process'
import { format } from 'node:util'

const cache = new Map()
const isTTY = !!process.stdout && !!process.stdout.isTTY

export default function createDebug (name) {
  if (!cache.has(name)) makeDebugger(name)
  return cache.get(name)
}

function makeDebugger (name) {
  const config = {
    name,
    ...getColourCodes(getColour(name)),
    pfxDate: !isTTY,
    sfxTime: isTTY,
    colour: isTTY,
    enabled: isEnabled(name)
  }
  const fn = logger.bind(config)
  Object.defineProperties(fn, {
    config: {
      value: config,
      writable: false,
      configurable: false,
      enumerable: false
    },
    enabled: {
      get: () => config.enabled,
      set: x => (config.enabled = !!x),
      configurable: false,
      enumerable: false
    }
  })
  cache.set(name, fn)
}

function logger (...args) {
  if (!this.enabled) return
  const now = new Date()
  const last = this.last
  this.last = +now
  const start = this.colour ? this.start : ''
  const end = this.colour ? this.end : ''
  const name = start + this.name + end + ' '
  const pfx = this.pfxDate ? now.toISOString() + ' ' : ''
  const sfx =
    this.sfxTime && last != null
      ? ` ${start} +${fmtTime(this.last - last)}${end}`
      : ''
  const str = format(...args)
  console.log(pfx + name + str + sfx)
}

function isEnabled (name) {
  if (name.endsWith('*')) return true
  const env = process.env.DEBUG
  if (!env) return false
  let enabled = false

  for (const elem of env.split(',')) {
    enabled = enabled || match(elem, name)
    if (elem.startsWith('-') && match(elem.slice(1), name)) enabled = false
  }
  return enabled

  function match (pattern, actual) {
    return (
      pattern === '*' ||
      pattern === actual ||
      (pattern.endsWith('*') && actual.startsWith(pattern.slice(0, -1)))
    )
  }
}

let lastColour = -1
function getColour (name) {
  const colours = '20,46,165,226,81,160,27,28,90,214,51,1,2,3,4,5,6'
    .split(',')
    .map(x => parseInt(x, 10))
  lastColour = (lastColour + 1) % colours.length
  return colours[lastColour]
}

function getColourCodes (c) {
  const CSI = '\x1b['
  const start = CSI + (c < 8 ? `${c + 30};1m` : `38;5;${c};1m`)
  const end = CSI + '39;22m'
  return { start, end }
}

const SEC = 1e3
const MIN = SEC * 60
const HR = MIN * 60

function fmtTime (ms) {
  if (ms < SEC) return ms + 'ms'
  if (ms < MIN) return ((ms / SEC + 0.5) | 0) + 's'
  if (ms < HR) return ((ms / MIN + 0.5) | 0) + 'm'
  return ((ms / HR + 0.5) | 0) + 'h'
}
