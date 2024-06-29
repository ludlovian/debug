import process from 'node:process'
import { format } from 'node:util'

const isTTY = !!process.stdout && !!process.stdout.isTTY
const pfxDate = !isTTY && !process.env.DEBUG_HIDE_DATE
const sfxTime = isTTY

class LogHistory {
  max = 100
  items = []

  add (data) {
    const n = this.items.push(data)
    if (n > this.max) this.items.splice(0, n - this.max)
  }
}

class Logger {
  static history = new LogHistory()

  name
  #last
  #start
  #end
  #colour
  enabled

  static cache = new Map()

  // construction
  //
  static createDebug (name) {
    if (!this.cache.has(name)) this.cache.set(name, new Logger(name))
    return this.cache.get(name).log
  }

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
    console.log(pfx + name + str + sfx)
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

// -------------------------------------------
// Exports

const debug = Logger.createDebug.bind(Logger)
debug.history = Logger.history
export default debug
