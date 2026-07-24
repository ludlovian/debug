import process from 'node:process'
import { format } from 'node:util'

const isTTY = !!process.stderr && !!process.stderr.isTTY
const isUnderSystemd = !!process.env.INVOCATION_ID || process.env.JOURNAL_STREAM
const pfxDate =
  !!process.env.DEBUG_ADD_DATE ||
  (!isTTY && !isUnderSystemd && !process.env.DEBUG_HIDE_DATE)
const sfxTime = isTTY && !pfxDate

const MSG_PREFIX = isUnderSystemd ? '<6>' : ''

class LogHistory {
  max = 100
  items = []

  add (data) {
    const n = this.items.push(data)
    if (n > this.max) this.items.splice(0, n - this.max)
  }
}

function Debug (name) {
  if (!Logger.cache.has(name)) Logger.cache.set(name, new Logger(name))
  return Logger.cache.get(name).log
}

Debug.write = console.error.bind(console)

class Logger {
  static history = new LogHistory()
  static cache = new Map()

  name
  #last
  #start
  #end
  #colour
  enabled

  constructor (name) {
    this.name = name
    this.colour = isTTY ? getColour() : undefined
    this.enabled = isEnabled(name)
    this.log = this.log.bind(this)

    Object.defineProperties(this.log, {
      config: { get: () => this },
      enabled: { get: () => this.enabled, set: x => (this.enabled = !!x) }
    })
  }

  get colour () {
    return this.#colour
  }

  set colour (c) {
    this.#colour = c
    const { start, end } = getColourCodes(c)
    this.#start = start
    this.#end = end
  }

  log (...args) {
    if (!this.enabled) return
    const now = new Date()
    const last = this.#last
    this.#last = +now
    const useColour = this.#colour != null
    const start = useColour ? this.#start : ''
    const end = useColour ? this.#end : ''
    const name = start + this.name + end + ' '
    const pfx = pfxDate ? now.toISOString() + ' ' : ''
    const sfx =
      sfxTime && last != null
        ? ` ${start}+${fmtTime(this.#last - last)}${end}`
        : ''
    const str = format(...args)
    Logger.history.add({ when: now, who: this.name, log: str })
    const output = MSG_PREFIX + pfx + name + str + sfx
    Debug.write(output)
  }
}

// -------------------------------------------
// Helper functions

function isEnabled (name) {
  if (name.endsWith('*')) return true
  const env = process.env.DEBUG
  if (!env) return false
  let enabled = false

  for (const elem of env.split(',')) {
    enabled = enabled || match(elem, name)
    if (elem.startsWith('-') && match(elem.slice(1), name)) {
      enabled = false
    }
  }
  return enabled
}

function match (pattern, actual) {
  return (
    pattern === '*' ||
    pattern === actual ||
    (pattern.endsWith('*') && actual.startsWith(pattern.slice(0, -1)))
  )
}

function getColourCodes (c) {
  const CSI = '\x1b['
  const start = CSI + (c < 8 ? `${c + 30};1m` : `38;5;${c};1m`)
  const end = CSI + '39;22m'
  return { start, end }
}

const colours = '20,46,165,226,81,160,27,28,90,214,51,1,2,3,4,5,6'
  .split(',')
  .map(x => parseInt(x, 10))

let lastColourIndex = -1

function getColour () {
  lastColourIndex = (lastColourIndex + 1) % colours.length
  return colours[lastColourIndex]
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

function enableAll (onOff, pfx) {
  for (const logger of Logger.cache.values()) {
    if (pfx && !logger.name.startsWith(pfx)) continue //
    logger.enabled = !!onOff
  }
}

// -------------------------------------------
// Exports

Debug.history = Logger.history
export { enableAll }
export default Debug
