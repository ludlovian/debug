import process from 'node:process'
import { format } from 'node:util'

const isTTY = !!process.stdout && !!process.stdout.isTTY

class Logger {
  name = ''
  pfxDate = !isTTY && !process.env.DEBUG_HIDE_DATE
  sfxTime = isTTY
  start = ''
  end = ''
  enabled = false
  _colour = undefined

  constructor (name) {
    this.name = name
    this.colour = isTTY ? Logger.getColour() : undefined
    this.enabled = Logger.isEnabled(name)

    this.log = this.log.bind(this)
    Object.defineProperties(this.log, {
      config: {
        get: () => this,
        configurable: false,
        enumerable: false
      },
      enabled: {
        get: () => this.enabled,
        set: x => (this.enabled = !!x),
        configurable: false,
        enumerable: false
      }
    })
  }

  get colour () {
    return this._colour
  }

  set colour (c) {
    this._colour = c
    const { start, end } = Logger.getColourCodes(c)
    this.start = start
    this.end = end
  }

  log (...args) {
    if (!this.enabled) return
    const now = new Date()
    const last = this.last
    this.last = +now
    const useColour = this.colour != null
    const start = useColour ? this.start : ''
    const end = useColour ? this.end : ''
    const name = start + this.name + end + ' '
    const pfx = this.pfxDate ? now.toISOString() + ' ' : ''
    const sfx =
      this.sfxTime && last != null
        ? ` ${start}+${Logger.fmtTime(this.last - last)}${end}`
        : ''
    const str = format(...args)
    console.log(pfx + name + str + sfx)
  }

  // Logger creation

  static cache = new Map()

  static createDebug (name) {
    if (!this.cache.has(name)) this.cache.set(name, new Logger(name))
    return this.cache.get(name).log
  }

  // Static helper functions

  static isEnabled (name) {
    if (name.endsWith('*')) return true
    const env = process.env.DEBUG
    if (!env) return false
    let enabled = false

    for (const elem of env.split(',')) {
      enabled = enabled || Logger.match(elem, name)
      if (elem.startsWith('-') && Logger.match(elem.slice(1), name)) {
        enabled = false
      }
    }
    return enabled
  }

  static match (pattern, actual) {
    return (
      pattern === '*' ||
      pattern === actual ||
      (pattern.endsWith('*') && actual.startsWith(pattern.slice(0, -1)))
    )
  }

  static getColourCodes (c) {
    const CSI = '\x1b['
    const start = CSI + (c < 8 ? `${c + 30};1m` : `38;5;${c};1m`)
    const end = CSI + '39;22m'
    return { start, end }
  }

  static colours = '20,46,165,226,81,160,27,28,90,214,51,1,2,3,4,5,6'
    .split(',')
    .map(x => parseInt(x, 10))

  static _lastColourIndex = -1

  static getColour () {
    this._lastColourIndex = (this._lastColourIndex + 1) % this.colours.length
    return this.colours[this._lastColourIndex]
  }

  static SEC = 1e3
  static MIN = this.SEC * 60
  static HR = this.MIN * 60

  static fmtTime (ms) {
    if (ms < this.SEC) return ms + 'ms'
    if (ms < this.MIN) return ((ms / this.SEC + 0.5) | 0) + 's'
    if (ms < this.HR) return ((ms / this.MIN + 0.5) | 0) + 'm'
    return ((ms / this.HR + 0.5) | 0) + 'h'
  }
}

export default Logger.createDebug.bind(Logger)
