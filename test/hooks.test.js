'use strict'

const t = require('tap')
const test = t.test
const sget = require('simple-get').concat
const stream = require('stream')
const Fastify = require('..')
const fp = require('fastify-plugin')
const fs = require('fs')
const split = require('split2')
const symbols = require('../lib/symbols.js')

const payload = { hello: 'world' }

test('hooks', t => {
  t.plan(38)
  const fastify = Fastify()

  try {
    fastify.addHook('preHandler', function (request, reply, done) {
      t.is(request.test, 'the request is coming')
      t.is(reply.test, 'the reply has come')
      if (request.raw.method === 'HEAD') {
        done(new Error('some error'))
      } else {
        done()
      }
    })
    t.pass()
  } catch (e) {
    t.fail()
  }

  try {
    fastify.addHook('preParsing', function (request, reply, done) {
      request.preParsing = true
      t.is(request.test, 'the request is coming')
      t.is(reply.test, 'the reply has come')
      done()
    })
    t.pass()
  } catch (e) {
    t.fail()
  }

  try {
    fastify.addHook('preValidation', function (request, reply, done) {
      t.is(request.preParsing, true)
      t.is(request.test, 'the request is coming')
      t.is(reply.test, 'the reply has come')
      done()
    })
    t.pass()
  } catch (e) {
    t.fail()
  }

  try {
    fastify.addHook('preSerialization', function (request, reply, payload, done) {
      t.ok('preSerialization called')
      done()
    })
    t.pass()
  } catch (e) {
    t.fail()
  }

  try {
    fastify.addHook('onRequest', function (request, reply, done) {
      request.test = 'the request is coming'
      reply.test = 'the reply has come'
      if (request.raw.method === 'DELETE') {
        done(new Error('some error'))
      } else {
        done()
      }
    })
    t.pass()
  } catch (e) {
    t.fail()
  }

  fastify.addHook('onResponse', function (request, reply, done) {
    t.ok('onResponse called')
    done()
  })

  fastify.addHook('onSend', function (req, reply, thePayload, done) {
    t.ok('onSend called')
    done()
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: function (req, reply) {
      t.is(req.test, 'the request is coming')
      t.is(reply.test, 'the reply has come')
      reply.code(200).send(payload)
    },
    onResponse: function (req, reply, done) {
      t.ok('onResponse inside hook')
    },
    response: {
      200: {
        type: 'object'
      }
    }
  })

  fastify.head('/', function (req, reply) {
    reply.code(200).send(payload)
  })

  fastify.delete('/', function (req, reply) {
    reply.code(200).send(payload)
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'HEAD',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 500)
    })

    sget({
      method: 'DELETE',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 500)
    })
  })
})

test('onRequest hook should support encapsulation / 1', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('onRequest', (req, reply, done) => {
      t.strictEqual(req.raw.url, '/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })

  fastify.inject('/plugin', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('onRequest hook should support encapsulation / 2', t => {
  t.plan(3)
  const fastify = Fastify()
  var pluginInstance

  fastify.addHook('onRequest', () => {})

  fastify.register((instance, opts, done) => {
    instance.addHook('onRequest', () => {})
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    t.error(err)
    t.is(fastify[symbols.kHooks].onRequest.length, 1)
    t.is(pluginInstance[symbols.kHooks].onRequest.length, 2)
  })
})

test('onRequest hook should support encapsulation / 3', t => {
  t.plan(20)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('onRequest', function (req, reply, done) {
    t.ok(this.hello)
    t.ok(this.hello2)
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    t.ok(req.first)
    t.notOk(req.second)
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('onRequest', function (req, reply, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      t.ok(this.hello3)
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      t.ok(req.first)
      t.ok(req.second)
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('preHandler hook should support encapsulation / 5', t => {
  t.plan(17)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('preHandler', function (req, res, done) {
    t.ok(this.hello)
    req.first = true
    done()
  })

  fastify.get('/first', (req, reply) => {
    t.ok(req.first)
    t.notOk(req.second)
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('preHandler', function (req, res, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      t.ok(req.first)
      t.ok(req.second)
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('onRoute hook should be called / 1', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', () => {
      t.pass()
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should be called / 2', t => {
  t.plan(5)
  let firstHandler = 0
  let secondHandler = 0
  const fastify = Fastify()
  fastify.addHook('onRoute', (route) => {
    t.pass()
    firstHandler++
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      t.pass()
      secondHandler++
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })
    .after(() => {
      t.strictEqual(firstHandler, 1)
      t.strictEqual(secondHandler, 1)
    })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should be called / 3', t => {
  t.plan(5)
  const fastify = Fastify()

  function handler (req, reply) {
    reply.send()
  }

  fastify.addHook('onRoute', (route) => {
    t.pass()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      t.pass()
    })
    instance.get('/a', handler)
    done()
  })
    .after((err, done) => {
      t.error(err)
      setTimeout(() => {
        fastify.get('/b', handler)
        done()
      }, 10)
    })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should be called (encapsulation support) / 4', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.addHook('onRoute', () => {
    t.pass()
  })

  fastify.register((instance, opts, next) => {
    instance.addHook('onRoute', () => {
      t.pass()
    })
    instance.get('/nested', opts, function (req, reply) {
      reply.send()
    })
    next()
  })

  fastify.get('/', function (req, reply) {
    reply.send()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should be called (encapsulation support) / 5', t => {
  t.plan(2)
  const fastify = Fastify()

  fastify.get('/first', function (req, reply) {
    reply.send()
  })

  fastify.register((instance, opts, next) => {
    instance.addHook('onRoute', () => {
      t.pass()
    })
    instance.get('/nested', opts, function (req, reply) {
      reply.send()
    })
    next()
  })

  fastify.get('/second', function (req, reply) {
    reply.send()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should be called (encapsulation support) / 6', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.get('/first', function (req, reply) {
    reply.send()
  })

  fastify.addHook('onRoute', () => {
    t.fail('This should not be called')
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute should keep the context', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.decorate('test', true)
    instance.addHook('onRoute', onRoute)
    t.ok(instance.prototype === fastify.prototype)

    function onRoute (route) {
      t.ok(this.test)
      t.strictEqual(this, instance)
    }

    instance.get('/', opts, function (req, reply) {
      reply.send()
    })

    done()
  })

  fastify.close((err) => {
    t.error(err)
  })
})

test('onRoute hook should pass correct route', t => {
  t.plan(7)
  const fastify = Fastify()
  fastify.addHook('onRoute', (route) => {
    t.strictEqual(route.method, 'GET')
    t.strictEqual(route.url, '/')
    t.strictEqual(route.path, '/')
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      t.strictEqual(route.method, 'GET')
      t.strictEqual(route.url, '/')
      t.strictEqual(route.path, '/')
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should pass correct route with custom prefix', t => {
  t.plan(9)
  const fastify = Fastify()
  fastify.addHook('onRoute', function (route) {
    t.strictEqual(route.method, 'GET')
    t.strictEqual(route.url, '/v1/foo')
    t.strictEqual(route.path, '/v1/foo')
    t.strictEqual(route.prefix, '/v1')
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      t.strictEqual(route.method, 'GET')
      t.strictEqual(route.url, '/v1/foo')
      t.strictEqual(route.path, '/v1/foo')
      t.strictEqual(route.prefix, '/v1')
    })
    instance.get('/foo', opts, function (req, reply) {
      reply.send()
    })
    done()
  }, { prefix: '/v1' })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should pass correct route with custom options', t => {
  t.plan(6)
  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      t.strictEqual(route.method, 'GET')
      t.strictEqual(route.url, '/foo')
      t.strictEqual(route.logLevel, 'info')
      t.strictEqual(route.bodyLimit, 100)
      t.type(route.logSerializers.test, 'function')
    })
    instance.get('/foo', {
      logLevel: 'info',
      bodyLimit: 100,
      logSerializers: {
        test: value => value
      }
    }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should receive any route option', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      t.strictEqual(route.method, 'GET')
      t.strictEqual(route.url, '/foo')
      t.strictEqual(route.auth, 'basic')
    })
    instance.get('/foo', { auth: 'basic' }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should preserve system route configuration', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      t.strictEqual(route.method, 'GET')
      t.strictEqual(route.url, '/foo')
      t.strictEqual(route.handler.length, 2)
    })
    instance.get('/foo', { url: '/bar', method: 'POST' }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should preserve handler function in options of shorthand route system configuration', t => {
  t.plan(2)

  const handler = (req, reply) => {}

  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      t.strictEqual(route.handler, handler)
    })
    instance.get('/foo', { handler })
    done()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRoute hook should able to change the route url', t => {
  t.plan(5)

  const fastify = Fastify()

  fastify.register((instance, opts, next) => {
    instance.addHook('onRoute', (route) => {
      t.strictEqual(route.url, '/föö')
      route.url = encodeURI(route.url)
    })

    instance.get('/föö', (request, reply) => {
      reply.send('here /föö')
    })

    next()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + encodeURI('/föö')
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(body.toString(), 'here /föö')
    })
  })
})

test('onRoute hook that throws should be caught ', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register((instance, opts, next) => {
    instance.addHook('onRoute', () => {
      throw new Error('snap')
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    next()
  })

  fastify.ready(err => {
    t.ok(err)
  })
})

test('onResponse hook should log request error', t => {
  t.plan(4)

  let fastify = null
  const logStream = split(JSON.parse)
  try {
    fastify = Fastify({
      logger: {
        stream: logStream,
        level: 'error'
      }
    })
  } catch (e) {
    t.fail()
  }

  logStream.once('data', line => {
    t.equal(line.msg, 'request errored')
    t.equal(line.level, 50)
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    done(new Error('kaboom'))
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('onResponse hook should support encapsulation / 1', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('onResponse', (request, reply, done) => {
      t.strictEqual(reply.plugin, true)
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.plugin = true
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })

  fastify.inject('/plugin', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('onResponse hook should support encapsulation / 2', t => {
  t.plan(3)
  const fastify = Fastify()
  var pluginInstance

  fastify.addHook('onResponse', () => {})

  fastify.register((instance, opts, done) => {
    instance.addHook('onResponse', () => {})
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    t.error(err)
    t.is(fastify[symbols.kHooks].onResponse.length, 1)
    t.is(pluginInstance[symbols.kHooks].onResponse.length, 2)
  })
})

test('onResponse hook should support encapsulation / 3', t => {
  t.plan(16)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('onResponse', function (request, reply, done) {
    t.ok(this.hello)
    t.ok('onResponse called')
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('onResponse', function (request, reply, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      t.ok('onResponse called')
      done()
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('onSend hook should support encapsulation / 1', t => {
  t.plan(3)
  const fastify = Fastify()
  var pluginInstance

  fastify.addHook('onSend', () => {})

  fastify.register((instance, opts, done) => {
    instance.addHook('onSend', () => {})
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    t.error(err)
    t.is(fastify[symbols.kHooks].onSend.length, 1)
    t.is(pluginInstance[symbols.kHooks].onSend.length, 2)
  })
})

test('onSend hook should support encapsulation / 2', t => {
  t.plan(16)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    t.ok(this.hello)
    t.ok('onSend called')
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('onSend', function (request, reply, thePayload, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      t.ok('onSend called')
      done()
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('onSend hook is called after payload is serialized and headers are set', t => {
  t.plan(30)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    const thePayload = { hello: 'world' }

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.deepEqual(JSON.parse(payload), thePayload)
      t.strictEqual(reply[symbols.kReplyHeaders]['content-type'], 'application/json; charset=utf-8')
      done()
    })

    instance.get('/json', (request, reply) => {
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(payload, 'some text')
      t.strictEqual(reply[symbols.kReplyHeaders]['content-type'], 'text/plain; charset=utf-8')
      done()
    })

    instance.get('/text', (request, reply) => {
      reply.send('some text')
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    const thePayload = Buffer.from('buffer payload')

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(payload, thePayload)
      t.strictEqual(reply[symbols.kReplyHeaders]['content-type'], 'application/octet-stream')
      done()
    })

    instance.get('/buffer', (request, reply) => {
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    var chunk = 'stream payload'
    const thePayload = new stream.Readable({
      read () {
        this.push(chunk)
        chunk = null
      }
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(payload, thePayload)
      t.strictEqual(reply[symbols.kReplyHeaders]['content-type'], 'application/octet-stream')
      done()
    })

    instance.get('/stream', (request, reply) => {
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    const serializedPayload = 'serialized'

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(payload, serializedPayload)
      t.strictEqual(reply[symbols.kReplyHeaders]['content-type'], 'text/custom')
      done()
    })

    instance.get('/custom-serializer', (request, reply) => {
      reply
        .serializer(() => serializedPayload)
        .type('text/custom')
        .send('needs to be serialized')
    })

    done()
  })

  fastify.inject({
    method: 'GET',
    url: '/json'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
    t.strictEqual(res.headers['content-length'], '17')
  })

  fastify.inject({
    method: 'GET',
    url: '/text'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(res.payload, 'some text')
    t.strictEqual(res.headers['content-length'], '9')
  })

  fastify.inject({
    method: 'GET',
    url: '/buffer'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(res.payload, 'buffer payload')
    t.strictEqual(res.headers['content-length'], '14')
  })

  fastify.inject({
    method: 'GET',
    url: '/stream'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(res.payload, 'stream payload')
    t.strictEqual(res.headers['transfer-encoding'], 'chunked')
  })

  fastify.inject({
    method: 'GET',
    url: '/custom-serializer'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(res.payload, 'serialized')
    t.strictEqual(res.headers['content-type'], 'text/custom')
  })
})

test('modify payload', t => {
  t.plan(10)
  const fastify = Fastify()
  const payload = { hello: 'world' }
  const modifiedPayload = { hello: 'modified' }
  const anotherPayload = '"winter is coming"'

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    t.ok('onSend called')
    t.deepEqual(JSON.parse(thePayload), payload)
    thePayload = thePayload.replace('world', 'modified')
    done(null, thePayload)
  })

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    t.ok('onSend called')
    t.deepEqual(JSON.parse(thePayload), modifiedPayload)
    done(null, anotherPayload)
  })

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    t.ok('onSend called')
    t.strictEqual(thePayload, anotherPayload)
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.payload, anotherPayload)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['content-length'], '18')
  })
})

test('clear payload', t => {
  t.plan(6)
  const fastify = Fastify()

  fastify.addHook('onSend', function (request, reply, payload, done) {
    t.ok('onSend called')
    reply.code(304)
    done(null, null)
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 304)
    t.strictEqual(res.payload, '')
    t.strictEqual(res.headers['content-length'], undefined)
    t.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8')
  })
})

test('onSend hook throws', t => {
  t.plan(7)
  const fastify = Fastify()
  fastify.addHook('onSend', function (request, reply, payload, done) {
    if (request.raw.method === 'DELETE') {
      done(new Error('some error'))
      return
    }
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.delete('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()
    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
    sget({
      method: 'DELETE',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 500)
    })
  })
})

test('onSend hook should receive valid request and reply objects if onRequest hook fails', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addHook('onRequest', function (req, reply, done) {
    done(new Error('onRequest hook failed'))
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    t.strictEqual(request.testDecorator, 'testDecoratorVal')
    t.strictEqual(reply.testDecorator, 'testDecoratorVal')
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 500)
  })
})

test('onSend hook should receive valid request and reply objects if middleware fails', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.use(function (req, res, done) {
    done(new Error('middlware failed'))
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    t.strictEqual(request.testDecorator, 'testDecoratorVal')
    t.strictEqual(reply.testDecorator, 'testDecoratorVal')
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 500)
  })
})

test('onSend hook should receive valid request and reply objects if a custom content type parser fails', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addContentTypeParser('*', function (req, done) {
    done(new Error('content type parser failed'))
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    t.strictEqual(request.testDecorator, 'testDecoratorVal')
    t.strictEqual(reply.testDecorator, 'testDecoratorVal')
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: 'body'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 500)
  })
})

test('cannot add hook after binding', t => {
  t.plan(2)
  const instance = Fastify()

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen(0, err => {
    t.error(err)
    t.tearDown(instance.server.close.bind(instance.server))

    try {
      instance.addHook('onRequest', () => {})
      t.fail()
    } catch (e) {
      t.pass()
    }
  })
})

test('onRequest hooks should be able to block a request', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('onRequest', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.ok('called')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('preValidation hooks should be able to block a request', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preValidation', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preValidation', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.ok('called')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('preParsing hooks should be able to block a request', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preParsing', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preParsing', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.ok('called')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('preHandler hooks should be able to block a request', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.equal(payload, 'hello')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('onRequest hooks should be able to block a request (last hook)', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.ok('called')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('preHandler hooks should be able to block a request (last hook)', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.equal(payload, 'hello')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.payload, 'hello')
  })
})

test('onRequest respond with a stream', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    const stream = fs.createReadStream(process.cwd() + '/test/stream.test.js', 'utf8')
    // stream.pipe(res)
    // res.once('finish', done)
    reply.send(stream)
  })

  fastify.addHook('onRequest', (req, res, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.ok('called')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
  })
})

test('preHandler respond with a stream', t => {
  t.plan(7)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    t.ok('called')
    done()
  })

  // we are calling `reply.send` inside the `preHandler` hook with a stream,
  // this triggers the `onSend` hook event if `preHanlder` has not yet finished
  const order = [1, 2]

  fastify.addHook('preHandler', (req, reply, done) => {
    const stream = fs.createReadStream(process.cwd() + '/test/stream.test.js', 'utf8')
    reply.send(stream)
    reply.raw.once('finish', () => {
      t.is(order.shift(), 2)
      done()
    })
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    t.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    t.is(order.shift(), 1)
    t.is(typeof payload.pipe, 'function')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    t.ok('called')
    done()
  })

  fastify.get('/', function (request, reply) {
    t.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
  })
})

test('Register an hook after a plugin inside a plugin', t => {
  t.plan(6)
  const fastify = Fastify()

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    done()
  }))

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('Register an hook after a plugin inside a plugin (with preHandler option)', t => {
  t.plan(7)
  const fastify = Fastify()

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    instance.get('/', {
      preHandler: (req, reply, done) => {
        t.ok('called')
        done()
      }
    }, function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    instance.addHook('preHandler', function (req, reply, done) {
      t.ok('called')
      done()
    })

    done()
  }))

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('Register hooks inside a plugin after an encapsulated plugin', t => {
  t.plan(7)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      t.ok('called')
      done()
    })

    instance.addHook('preHandler', function (request, reply, done) {
      t.ok('called')
      done()
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.ok('called')
      done()
    })

    instance.addHook('onResponse', function (request, reply, done) {
      t.ok('called')
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.is(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('onRequest hooks should run in the order in which they are defined', t => {
  t.plan(9)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      t.strictEqual(req.previous, undefined)
      req.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      t.strictEqual(request.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onRequest', function (req, reply, done) {
        t.strictEqual(req.previous, 1)
        req.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      t.strictEqual(req.previous, 2)
      req.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onRequest', function (req, reply, done) {
        t.strictEqual(req.previous, 3)
        req.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onRequest', function (req, reply, done) {
      t.strictEqual(req.previous, 4)
      req.previous = 5
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('preHandler hooks should run in the order in which they are defined', t => {
  t.plan(9)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('preHandler', function (request, reply, done) {
      t.strictEqual(request.previous, undefined)
      request.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      t.strictEqual(request.previous, 5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('preHandler', function (request, reply, done) {
        t.strictEqual(request.previous, 1)
        request.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (request, reply, done) {
      t.strictEqual(request.previous, 2)
      request.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('preHandler', function (request, reply, done) {
        t.strictEqual(request.previous, 3)
        request.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('preHandler', function (request, reply, done) {
      t.strictEqual(request.previous, 4)
      request.previous = 5
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('onSend hooks should run in the order in which they are defined', t => {
  t.plan(8)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(request.previous, undefined)
      request.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({})
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onSend', function (request, reply, payload, done) {
        t.strictEqual(request.previous, 1)
        request.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(request.previous, 2)
      request.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onSend', function (request, reply, payload, done) {
        t.strictEqual(request.previous, 3)
        request.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onSend', function (request, reply, payload, done) {
      t.strictEqual(request.previous, 4)
      done(null, '5')
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), 5)
  })
})

test('onResponse hooks should run in the order in which they are defined', t => {
  t.plan(8)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onResponse', function (request, reply, done) {
      t.strictEqual(reply.previous, undefined)
      reply.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onResponse', function (request, reply, done) {
        t.strictEqual(reply.previous, 1)
        reply.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onResponse', function (request, reply, done) {
      t.strictEqual(reply.previous, 2)
      reply.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onResponse', function (request, reply, done) {
        t.strictEqual(reply.previous, 3)
        reply.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onResponse', function (request, reply, done) {
      t.strictEqual(reply.previous, 4)
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(JSON.parse(res.payload), { hello: 'world' })
  })
})

test('onRequest, preHandler, and onResponse hooks that resolve to a value do not cause an error', t => {
  t.plan(3)
  const fastify = Fastify()

  fastify
    .addHook('onRequest', () => Promise.resolve(1))
    .addHook('onRequest', () => Promise.resolve(true))
    .addHook('preValidation', () => Promise.resolve(null))
    .addHook('preValidation', () => Promise.resolve('a'))
    .addHook('preHandler', () => Promise.resolve(null))
    .addHook('preHandler', () => Promise.resolve('a'))
    .addHook('onResponse', () => Promise.resolve({}))
    .addHook('onResponse', () => Promise.resolve([]))

  fastify.get('/', (request, reply) => {
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.payload, 'hello')
  })
})

test('If a response header has been set inside an hook it shoulod not be overwritten by the final response handler', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.header('X-Custom-Header', 'hello')
    done()
  })

  fastify.get('/', (request, reply) => {
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['x-custom-header'], 'hello')
    t.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8')
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.payload, 'hello')
  })
})

test('If the content type has been set inside an hook it should not be changed', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.header('content-type', 'text/html')
    done()
  })

  fastify.get('/', (request, reply) => {
    t.ok(reply[symbols.kReplyHeaders]['content-type'])
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-type'], 'text/html')
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.payload, 'hello')
  })
})

test('request in onRequest, preParsing, preValidation and onResponse', t => {
  t.plan(18)
  const fastify = Fastify()

  fastify.addHook('onRequest', function (request, reply, done) {
    t.deepEqual(request.body, null)
    t.deepEqual(request.query, { key: 'value' })
    t.deepEqual(request.params, { greeting: 'hello' })
    t.deepEqual(request.headers, {
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('preParsing', function (request, reply, done) {
    t.deepEqual(request.body, null)
    t.deepEqual(request.query, { key: 'value' })
    t.deepEqual(request.params, { greeting: 'hello' })
    t.deepEqual(request.headers, {
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('preValidation', function (request, reply, done) {
    t.deepEqual(request.body, { hello: 'world' })
    t.deepEqual(request.query, { key: 'value' })
    t.deepEqual(request.params, { greeting: 'hello' })
    t.deepEqual(request.headers, {
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('onResponse', function (request, reply, done) {
    t.deepEqual(request.body, { hello: 'world' })
    t.deepEqual(request.query, { key: 'value' })
    t.deepEqual(request.params, { greeting: 'hello' })
    t.deepEqual(request.headers, {
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.post('/:greeting', function (req, reply) {
    reply.send('ok')
  })

  fastify.inject({
    method: 'POST',
    url: '/hello?key=value',
    headers: { 'x-custom': 'hello' },
    payload: { hello: 'world' }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('preValidation hook should support encapsulation / 1', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('preValidation', (req, reply, done) => {
      t.strictEqual(req.raw.url, '/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })

  fastify.inject('/plugin', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('preValidation hook should support encapsulation / 2', t => {
  t.plan(3)
  const fastify = Fastify()
  var pluginInstance

  fastify.addHook('preValidation', () => {})

  fastify.register((instance, opts, done) => {
    instance.addHook('preValidation', () => {})
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    t.error(err)
    t.is(fastify[symbols.kHooks].preValidation.length, 1)
    t.is(pluginInstance[symbols.kHooks].preValidation.length, 2)
  })
})

test('preValidation hook should support encapsulation / 3', t => {
  t.plan(20)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('preValidation', function (req, reply, done) {
    t.ok(this.hello)
    t.ok(this.hello2)
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    t.ok(req.first)
    t.notOk(req.second)
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('preValidation', function (req, reply, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      t.ok(this.hello3)
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      t.ok(req.first)
      t.ok(req.second)
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('onError hook', t => {
  t.plan(3)

  const fastify = Fastify()

  const err = new Error('kaboom')

  fastify.addHook('onError', (request, reply, error, done) => {
    t.match(error, err)
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.deepEqual(JSON.parse(res.payload), {
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
  })
})

test('reply.send should throw if called inside the onError hook', t => {
  t.plan(3)

  const fastify = Fastify()

  const err = new Error('kaboom')

  fastify.addHook('onError', (request, reply, error, done) => {
    try {
      reply.send()
      t.fail('Should throw')
    } catch (err) {
      t.is(err.code, 'FST_ERR_SEND_INSIDE_ONERR')
    }
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.deepEqual(JSON.parse(res.payload), {
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
  })
})

test('onError hook with setErrorHandler', t => {
  t.test('Send error', t => {
    t.plan(3)

    const fastify = Fastify()

    const err = new Error('ouch')

    fastify.setErrorHandler((_, req, reply) => {
      reply.send(err)
    })

    fastify.addHook('onError', (request, reply, error, done) => {
      t.match(error, err)
      done()
    })

    fastify.get('/', (req, reply) => {
      reply.send(new Error('kaboom'))
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, res) => {
      t.error(err)
      t.deepEqual(JSON.parse(res.payload), {
        error: 'Internal Server Error',
        message: 'ouch',
        statusCode: 500
      })
    })
  })

  t.test('Hide error', t => {
    t.plan(2)

    const fastify = Fastify()

    fastify.setErrorHandler((_, req, reply) => {
      reply.send({ hello: 'world' })
    })

    fastify.addHook('onError', (request, reply, error, done) => {
      t.fail('Should not be called')
    })

    fastify.get('/', (req, reply) => {
      reply.send(new Error('kaboom'))
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, res) => {
      t.error(err)
      t.deepEqual(
        JSON.parse(res.payload),
        { hello: 'world' }
      )
    })
  })
  t.end()
})

test('preParsing hook should support encapsulation / 1', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('preParsing', (req, reply, done) => {
      t.strictEqual(req.raw.url, '/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })

  fastify.inject('/plugin', (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('preParsing hook should support encapsulation / 2', t => {
  t.plan(3)
  const fastify = Fastify()
  var pluginInstance

  fastify.addHook('preParsing', function a () {})

  fastify.register((instance, opts, done) => {
    instance.addHook('preParsing', function b () {})
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    t.error(err)
    t.is(fastify[symbols.kHooks].preParsing.length, 1)
    t.is(pluginInstance[symbols.kHooks].preParsing.length, 2)
  })
})

test('preParsing hook should support encapsulation / 3', t => {
  t.plan(20)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('preParsing', function (req, reply, done) {
    t.ok(this.hello)
    t.ok(this.hello2)
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    t.ok(req.first)
    t.notOk(req.second)
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('preParsing', function (req, reply, done) {
      t.ok(this.hello)
      t.ok(this.hello2)
      t.ok(this.hello3)
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      t.ok(req.first)
      t.ok(req.second)
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world' })
    })
  })
})

test('preSerialization hook should run before serialization and be able to modify the payload', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'
    payload.world = 'ok'

    done(null, payload)
  })

  fastify.route({
    method: 'GET',
    url: '/first',
    handler: function (req, reply) {
      reply.send({ hello: 'world' })
    },
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            },
            world: {
              type: 'string'
            }
          },
          required: ['world'],
          additionalProperties: false
        }
      }
    }
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world1', world: 'ok' })
    })
  })
})

test('preSerialization hook should be able to throw errors which are not validated against schema response', t => {
  const fastify = Fastify()

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    done(new Error('preSerialization aborted'))
  })

  fastify.route({
    method: 'GET',
    url: '/first',
    handler: function (req, reply) {
      reply.send({ hello: 'world' })
    },
    schema: {
      response: {
        500: {
          type: 'object',
          properties: {
            world: {
              type: 'string'
            }
          },
          required: ['world'],
          additionalProperties: false
        }
      }
    }
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 500)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { error: 'Internal Server Error', message: 'preSerialization aborted', statusCode: 500 })
      t.end()
    })
  })
})

test('preSerialization hook which returned error should still run onError hooks', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    done(new Error('preSerialization aborted'))
  })

  fastify.addHook('onError', function (req, reply, payload, done) {
    t.pass()
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 500)
    })
  })
})

test('preSerialization hooks should run in the order in which they are defined', t => {
  t.plan(5)
  const fastify = Fastify()

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '2'

    done(null, payload)
  })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'

    done(null, payload)
  })

  fastify.get('/first', (req, reply) => {
    reply.send(payload)
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world21' })
    })
  })
})

test('preSerialization hooks should support encapsulation', t => {
  t.plan(9)
  const fastify = Fastify()

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'

    done(null, payload)
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('preSerialization', function (req, reply, payload, done) {
      payload.hello += '2'

      done(null, payload)
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.listen(0, err => {
    t.error(err)
    fastify.server.unref()

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/first'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world1' })
    })

    sget({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port + '/second'
    }, (err, response, body) => {
      t.error(err)
      t.strictEqual(response.statusCode, 200)
      t.strictEqual(response.headers['content-length'], '' + body.length)
      t.deepEqual(JSON.parse(body), { hello: 'world12' })
    })
  })
})

test('onRegister hook should be called / 1', t => {
  t.plan(3)
  const fastify = Fastify()

  fastify.addHook('onRegister', (instance, opts) => {
    // duck typing for the win!
    t.ok(instance.addHook)
    t.deepEquals(opts, pluginOpts)
  })

  const pluginOpts = { prefix: 'hello', custom: 'world' }
  fastify.register((instance, opts, next) => {
    next()
  }, pluginOpts)

  fastify.ready(err => { t.error(err) })
})

test('onRegister hook should be called / 2', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.addHook('onRegister', instance => {
    // duck typing for the win!
    t.ok(instance.addHook)
  })

  fastify.register((instance, opts, next) => {
    instance.register((instance, opts, next) => {
      next()
    })
    next()
  })

  fastify.register((instance, opts, next) => {
    next()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRegister hook should be called / 3', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.decorate('data', [])

  fastify.addHook('onRegister', instance => {
    instance.data = instance.data.slice()
  })

  fastify.register((instance, opts, next) => {
    instance.data.push(1)
    instance.register((instance, opts, next) => {
      instance.data.push(2)
      t.deepEqual(instance.data, [1, 2])
      next()
    })
    t.deepEqual(instance.data, [1])
    next()
  })

  fastify.register((instance, opts, next) => {
    t.deepEqual(instance.data, [])
    next()
  })

  fastify.ready(err => {
    t.error(err)
  })
})

test('onRegister hook should be called (encapsulation)', t => {
  t.plan(1)
  const fastify = Fastify()

  function plugin (instance, opts, next) {
    next()
  }
  plugin[Symbol.for('skip-override')] = true

  fastify.addHook('onRegister', (instance, opts) => {
    t.fail('This should not be called')
  })

  fastify.register(plugin)

  fastify.ready(err => {
    t.error(err)
  })
})

test('early termination, onRequest', t => {
  t.plan(3)

  const app = Fastify()

  app.addHook('onRequest', (req, reply) => {
    setImmediate(() => reply.send('hello world'))
    return reply
  })

  app.get('/', (req, reply) => {
    t.fail('should not happen')
  })

  app.inject('/', function (err, res) {
    t.error(err)
    t.is(res.statusCode, 200)
    t.is(res.body.toString(), 'hello world')
  })
})

test('reply.send should throw if undefined error is thrown', t => {
  /* eslint prefer-promise-reject-errors: ["error", {"allowEmptyReject": true}] */

  t.plan(3)
  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, reply, next) {
    return Promise.reject()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 500)
    t.deepEqual(JSON.parse(res.payload), {
      error: 'Internal Server Error',
      code: 'FST_ERR_SEND_UNDEFINED_ERR',
      message: 'Undefined error has occured',
      statusCode: 500
    })
  })
})
