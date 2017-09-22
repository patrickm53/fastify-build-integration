'use strict'

const t = require('tap')
const test = t.test
const request = require('request')
const Fastify = require('..')

test('default 404', t => {
  t.plan(3)

  const test = t.test
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    test('unsupported method', t => {
      t.plan(2)
      request({
        method: 'PUT',
        uri: 'http://localhost:' + fastify.server.address().port,
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
      })
    })

    test('unsupported route', t => {
      t.plan(2)
      request({
        method: 'GET',
        uri: 'http://localhost:' + fastify.server.address().port + '/notSupported',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
      })
    })
  })
})

test('customized 404', t => {
  t.plan(3)

  const test = t.test
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    test('unsupported method', t => {
      t.plan(3)
      request({
        method: 'PUT',
        uri: 'http://localhost:' + fastify.server.address().port,
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found')
      })
    })

    test('unsupported route', t => {
      t.plan(3)
      request({
        method: 'GET',
        uri: 'http://localhost:' + fastify.server.address().port + '/notSupported',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found')
      })
    })
  })
})

test('encapsulated 404', t => {
  t.plan(7)

  const test = t.test
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })

  fastify.register(function (f, opts, next) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })
    next()
  }, { prefix: '/test' })

  fastify.register(function (f, opts, next) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 3')
    })
    next()
  }, { prefix: '/test2' })

  t.tearDown(fastify.close.bind(fastify))

  fastify.listen(0, err => {
    t.error(err)

    test('root unsupported method', t => {
      t.plan(3)
      request({
        method: 'PUT',
        uri: 'http://localhost:' + fastify.server.address().port,
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found')
      })
    })

    test('root insupported route', t => {
      t.plan(3)
      request({
        method: 'GET',
        uri: 'http://localhost:' + fastify.server.address().port + '/notSupported',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found')
      })
    })

    test('unsupported method', t => {
      t.plan(3)
      request({
        method: 'PUT',
        uri: 'http://localhost:' + fastify.server.address().port + '/test',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found 2')
      })
    })

    test('unsupported route', t => {
      t.plan(3)
      request({
        method: 'GET',
        uri: 'http://localhost:' + fastify.server.address().port + '/test/notSupported',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found 2')
      })
    })

    test('unsupported method bis', t => {
      t.plan(3)
      request({
        method: 'PUT',
        uri: 'http://localhost:' + fastify.server.address().port + '/test2',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found 3')
      })
    })

    test('unsupported route bis', t => {
      t.plan(3)
      request({
        method: 'GET',
        uri: 'http://localhost:' + fastify.server.address().port + '/test2/notSupported',
        json: {}
      }, (err, response, body) => {
        t.error(err)
        t.strictEqual(response.statusCode, 404)
        t.strictEqual(body, 'this was not found 3')
      })
    })
  })
})
