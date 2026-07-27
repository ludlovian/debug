import Debug from './src/index.mjs'
for (let i=0; i < 40; i++) {
  const debug = Debug('pix:' + (i%20))
  debug('hi')
  if (i%10 === 0) debug.error('Now passed %d', i)
}
// console.log(Debug.history.items)
