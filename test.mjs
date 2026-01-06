import Debug from './src/index.mjs'
for (let i=0; i < 40; i++) {
  const debug = Debug('pix:' + (i%20))
  debug('hi')
}
// console.log(Debug.history.items)
