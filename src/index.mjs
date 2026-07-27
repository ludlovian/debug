import process from 'node:process'
import { format } from 'node:util'

//  -----------------------------------------------------------------------
//
//  Debug / writing module
//
//  There are two main objects used
//
//    - Debug       - the sole default export
//
//      This is a function to create named loggers. All loggers sharing the
//      same name are the same instance
//
//      It also contains environment level settings, and exposes the
//      actual writing function.
//
//    - debug       - a logger function, created by Debug(name)
//
//      This is actually the Logger.log bound function. The Logger instance
//      is available as debug.config
//
//    debug(...) acts like console.error(...) with these differences
//
//      - it is conditional on the logger being enabled
//      - the name is prepended
//      - if a tty, then colours the name
//      - if a tty, then the time between messages is added
//      - if under Systemd, then <6> is prepended to force note level
//
//    debug.error and Debug.error both point to a variant of console.error
//
//      - if under Systemd, then <3> is prepended to each line
//

export default function Debug (name) {
  if (!Logger.cache.has(name)) Logger.cache.set(name, new Logger(name))
  return Logger.cache.get(name).log
}

Debug.isTTY = !!process.stderr && !!process.stderr.isTTY
Debug.isUnderSystemd = !!process.env.INVOCATION_ID || process.env.JOURNAL_STREAM
Debug.addDatePrefix =
  !!process.env.DEBUG_ADD_DATE ||
  (!Debug.isTTY && !Debug.isUnderSystemd && !process.env.DEBUG_HIDE_DATE)
Debug.addTimeSuffix = Debug.isTTY && !Debug.addDatePrefix
Debug.prefix = Debug.isUnderSystemd
  ? { debug: '<6>', error: '<3>' }
  : { debug: '', error: '' }

Debug.write = function write (string) {
  process.stderr.write(`${string}\n`)
}

const rgx = /^<[0-7]>/
function addPrefix (string, pfx) {
  if (!pfx) return string
  return string
    .split('\n')
    .map(line => (line && !rgx.test(line) ? pfx + line : line))
    .join('\n')
}

function error (...args) {
  Debug.write(addPrefix(format(...args), Debug.prefix.error))
}
Debug.error = error

class Logger {
  static cache = new Map()

  name
  #last
  #start
  #end
  #colour
  enabled

  constructor (name) {
    this.name = name
    this.colour = Debug.isTTY ? getColour() : undefined
    this.enabled = isEnabled(name)
    this.log = this.log.bind(this)

    Object.defineProperties(this.log, {
      config: { get: () => this },
      enabled: { get: () => this.enabled, set: x => (this.enabled = !!x) },
      error: { get: () => Debug.error }
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
    const s = useColour ? this.#start : ''
    const e = useColour ? this.#end : ''
    const name = useColour ? `${s}${this.name}${e} ` : `[${this.name}] `
    const pfx = Debug.addDatePrefix ? now.toISOString() + ' ' : ''
    const sfx =
      Debug.addTimeSuffix && last != null
        ? ` ${s}+${fmtTime(this.#last - last)}${e}`
        : ''
    const str = format(...args)
    const output = pfx + name + str + sfx
    Debug.write(addPrefix(output, Debug.prefix.debug))
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

export function enableAll (onOff, pfx) {
  for (const logger of Logger.cache.values()) {
    if (pfx && !logger.name.startsWith(pfx)) continue //
    logger.enabled = !!onOff
  }
}

Debug.enableAll = enableAll
