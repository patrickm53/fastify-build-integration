'use strict'

const AjvStandaloneCompiler = require('@fastify/ajv-compiler/standalone')
const { _ } = require('ajv')
const fs = require('fs')
const path = require('path')

const factory = AjvStandaloneCompiler({
  readMode: false,
  storeFunction (routeOpts, schemaValidationCode) {
    const moduleCode = `// This file is autogenerated by ${__filename.replace(__dirname, 'build')}, do not edit
/* istanbul ignore file */
${schemaValidationCode}

module.exports.defaultInitOptions = ${JSON.stringify(defaultInitOptions)}
`

    const file = path.join(__dirname, '..', 'lib', 'configValidator.js')
    fs.writeFileSync(file, moduleCode)
    console.log(`Saved ${file} file successfully`)
  }
})

const defaultInitOptions = {
  connectionTimeout: 0, // 0 sec
  keepAliveTimeout: 72000, // 72 seconds
  forceCloseConnections: false, // keep-alive connections
  maxRequestsPerSocket: 0, // no limit
  requestTimeout: 0, // no limit
  bodyLimit: 1024 * 1024, // 1 MiB
  caseSensitive: true,
  disableRequestLogging: false,
  jsonShorthand: true,
  ignoreTrailingSlash: false,
  maxParamLength: 100,
  onProtoPoisoning: 'error',
  onConstructorPoisoning: 'error',
  pluginTimeout: 10000,
  requestIdHeader: 'request-id',
  requestIdLogLabel: 'reqId',
  http2SessionTimeout: 72000, // 72 seconds
  exposeHeadRoutes: true
}

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    connectionTimeout: { type: 'integer', default: defaultInitOptions.connectionTimeout },
    keepAliveTimeout: { type: 'integer', default: defaultInitOptions.keepAliveTimeout },
    forceCloseConnections: { type: 'boolean', default: defaultInitOptions.forceCloseConnections },
    maxRequestsPerSocket: { type: 'integer', default: defaultInitOptions.maxRequestsPerSocket, nullable: true },
    requestTimeout: { type: 'integer', default: defaultInitOptions.requestTimeout },
    bodyLimit: { type: 'integer', default: defaultInitOptions.bodyLimit },
    caseSensitive: { type: 'boolean', default: defaultInitOptions.caseSensitive },
    http2: { type: 'boolean' },
    https: {
      if: {
        not: {
          oneOf: [
            { type: 'boolean' },
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['allowHTTP1'],
              properties: {
                allowHTTP1: { type: 'boolean' }
              }
            }
          ]
        }
      },
      then: { setDefaultValue: true }
    },
    ignoreTrailingSlash: { type: 'boolean', default: defaultInitOptions.ignoreTrailingSlash },
    disableRequestLogging: {
      type: 'boolean',
      default: false
    },
    jsonShorthand: { type: 'boolean', default: defaultInitOptions.jsonShorthand },
    maxParamLength: { type: 'integer', default: defaultInitOptions.maxParamLength },
    onProtoPoisoning: { type: 'string', default: defaultInitOptions.onProtoPoisoning },
    onConstructorPoisoning: { type: 'string', default: defaultInitOptions.onConstructorPoisoning },
    pluginTimeout: { type: 'integer', default: defaultInitOptions.pluginTimeout },
    requestIdHeader: { type: 'string', default: defaultInitOptions.requestIdHeader },
    requestIdLogLabel: { type: 'string', default: defaultInitOptions.requestIdLogLabel },
    http2SessionTimeout: { type: 'integer', default: defaultInitOptions.http2SessionTimeout },
    exposeHeadRoutes: { type: 'boolean', default: defaultInitOptions.exposeHeadRoutes },
    // deprecated style of passing the versioning constraint
    versioning: {
      type: 'object',
      additionalProperties: true,
      required: ['storage', 'deriveVersion'],
      properties: {
        storage: { },
        deriveVersion: { }
      }
    },
    constraints: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['name', 'storage', 'validate', 'deriveConstraint'],
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          storage: { },
          validate: { },
          deriveConstraint: { }
        }
      }
    }
  }
}

const compiler = factory({}, {
  customOptions: {
    code: {
      source: true,
      lines: true,
      optimize: 3
    },
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    keywords: [
      {
        keyword: 'setDefaultValue',
        $data: true,
        // error: false,
        modifying: true,
        valid: true,
        code (keywordCxt) {
          const { gen, it, schemaValue } = keywordCxt
          const logicCode = gen.assign(_`${it.parentData}[${it.parentDataProperty}]`, schemaValue)
          return logicCode
        }
      }
    ]
  }
})

compiler({ schema })
