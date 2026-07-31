import process from 'node:process'
import { format } from 'node:util'
import Emitter from '@ludlovian/emitter'

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
//    debug.info and Debug.info point to a variant of console.log
//
//  IPC and events
//
//  If a process.send available, then message objects will instead be sent
//  via IPC to the parent
//
//  In either case, message objects will be emitted on the 'message' event.
//  The main Debug function has .on .off .once and .emit
//
//  A message object has the following properties
//  - type:           'debug'
//  - level:          'debug', 'info', 'error'
//  - name:           the logger name (for debug)
//  - message:        the text of the message
//  - ms:             the unixepoch ms time
//

export default function Debug (name) {
  if (!Logger.cache.has(name)) Logger.cache.set(name, new Logger(name))
  return Logger.cache.get(name).log
}

// Emitter
const emitter = new Emitter()
Debug.on = emitter.on
Debug.once = emitter.once
Debug.off = emitter.off
Debug.emit = emitter.emit

// Debug configuration

Debug.isTTY = !!process.stderr && !!process.stderr.isTTY
Debug.isUnderSystemd =
  !!process.env.INVOCATION_ID || !!process.env.JOURNAL_STREAM
Debug.isIPC = !!process.send
Debug.addDatePrefix =
  !!process.env.DEBUG_ADD_DATE ||
  (!Debug.isTTY && !Debug.isUnderSystemd && !process.env.DEBUG_HIDE_DATE)
Debug.addTimeSuffix = Debug.isTTY && !Debug.addDatePrefix
Debug.prefix = Debug.isUnderSystemd
  ? { debug: '<7>', info: '<6>', error: '<3>' }
  : { debug: '', info: '', error: '' }

Debug.write = function write (string) {
  process.stderr.write(`${string}\n`)
}

// message object
function createMessage ({ name, message, level }) {
  const type = 'debug'
  const ms = Date.now()
  return { type, level, name, message, ms }
}

// add systemd prefix if not already set
const rgx = /^<[0-7]>/
function addPrefix (string, pfx) {
  if (!pfx) return string
  return string
    .split('\n')
    .map(line => (line && !rgx.test(line) ? pfx + line : line))
    .join('\n')
}

// Common message writing / sending

function outputMessage (msg, clr, last) {
  if (Debug.isIPC) {
    process.send(msg)
  } else if (msg.level === 'error') {
    Debug.write(addPrefix(msg.message, Debug.prefix.error))
  } else if (msg.level === 'info') {
    Debug.write(addPrefix(msg.message, Debug.prefix.info))
  } else {
    let str = ''
    let start = ''
    let end = ''
    if (Debug.addDatePrefix) str += new Date(msg.ms).toISOString() + ' '
    if (clr != null) {
      ;[start, end] = getColourCodes(clr)
      str += `${start}${msg.name}${end} `
    } else {
      str += `[${msg.name}]`
    }
    str += msg.message
    if (Debug.addTimeSuffix && last != null) {
      const tm = fmtTime(msg.ms - last)
      str += ` ${start}${tm}${end}`
    }
    Debug.write(addPrefix(str, Debug.prefix.debug))
  }
  Debug.emit('message', msg)
}

// console.error and console.log replacements

Debug.error = function error (...args) {
  const message = format(...args)
  outputMessage(createMessage({ level: 'error', message }))
}

Debug.info = function info (...args) {
  const message = format(...args)
  outputMessage(createMessage({ level: 'info', message }))
}

// The debug Logger objects
//
// Acts as the specific configuration for a named logger function
//

class Logger {
  static cache = new Map()

  name
  #last
  colour
  enabled

  constructor (name) {
    this.name = name
    this.colour = Debug.isTTY ? getColour() : undefined
    this.enabled = isEnabled(name)
    this.log = this.log.bind(this)

    Object.defineProperties(this.log, {
      config: { get: () => this },
      enabled: { get: () => this.enabled, set: x => (this.enabled = !!x) },
      colour: { get: () => this.colour, set: x => (this.colour = x) },
      error: { get: () => Debug.error },
      info: { get: () => Debug.info }
    })
  }

  log (...args) {
    if (!this.enabled) return undefined
    const message = format(...args)
    const msg = createMessage({ name: this.name, level: 'debug', message })
    const last = this.#last
    this.#last = msg.ms
    outputMessage(msg, this.colour, last)
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
  return [start, end]
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
