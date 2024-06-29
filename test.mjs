import Debug from './src/index.mjs'
for (let i=0; i < 20; i++) {
  const debug = Debug('pix:' + i)
  debug('hi')
}
console.log(Debug.history.items)
