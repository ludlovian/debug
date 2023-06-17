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
  Object.defineProperty(fn, 'config', {
    value: config,
    writable: false,
    configurable: false,
    enumerable: false
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

function getColour (name) {
  const allColours = (
    '20,21,26,27,32,33,38,39,40,41,42,43,44,45,56,57,62,63,68,69,74,75,76,' +
    '77,78,79,80,81,92,93,98,99,112,113,128,129,134,135,148,149,160,161,' +
    '162,163,164,165,166,167,168,169,170,171,172,173,178,179,184,185,196,' +
    '197,198,199,200,201,202,203,204,205,206,207,208,209,214,215,220,221'
  )
    .split(',')
    .map(x => parseInt(x, 10))
  const hash = s => Array.from(s).reduce(
    (h, ch) => ((h << 5) - h + ch.charCodeAt(0)) & 0xfffffff,
    0
  )
  return allColours[hash(name) % allColours.length]
}

function getColourCodes (c) {
  const CSI = '\x1b['
  const start = CSI + (c < 8 ? `${c + 30};22m` : `38;5;${c};1m`)
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
