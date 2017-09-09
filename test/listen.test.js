'use strict'

const test = require('tap').test
const Fastify = require('..')
const fastify = Fastify()

test('listen accepts a port and a callback', t => {
  t.plan(2)
  fastify.listen(0, (err) => {
    fastify.server.unref()
    t.error(err)
    t.pass()
  })
})

test('listen accepts a port, address, and callback', t => {
  t.plan(2)
  fastify.listen(0, '127.0.0.1', (err) => {
    fastify.server.unref()
    t.error(err)
    t.pass()
  })
})

test('listen after Promise.resolve()', t => {
  t.plan(2)
  const f = Fastify()
  Promise.resolve()
    .then(() => {
      f.listen(0, (err) => {
        f.server.unref()
        t.error(err)
        t.pass()
      })
    })
})

test('register after listen using Promise.resolve()', t => {
  t.plan(2)
  const f = Fastify()

  const handler = (req, res) => res.send({})
  Promise.resolve()
    .then(() => {
      f.get('/', handler)
      f.register((f2, options, done) => {
        f2.get('/plugin', handler)
        done()
      })
    })
    .then(() => {
      f.listen(0, '127.0.0.1', (err) => {
        t.error(err)
        t.pass()
        f.close()
      })
    })
})
