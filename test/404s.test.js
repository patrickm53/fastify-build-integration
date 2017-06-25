'use strict'

const t = require('tap')
const test = t.test
const request = require('request')
const fastify = require('..')()

const opts = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  }
}

fastify.get('/', opts, function (req, reply) {
  reply.send({ hello: 'world' })
})

fastify.listen(0, err => {
  t.error(err)

  fastify.server.unref()

  test('404 on unsupported method', t => {
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

  test('404 on unsupported route', t => {
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
