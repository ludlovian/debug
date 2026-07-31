import Debug from './src/index.mjs'
Debug.on('message', x => console.log('%j',x))
for (let i=0; i < 40; i++) {
  const debug = Debug('pix:' + (i%20))
  debug('hi')
  if (i%10 === 9) debug.info('Now passed %d', i+1)
}
// console.log(Debug.history.items)
