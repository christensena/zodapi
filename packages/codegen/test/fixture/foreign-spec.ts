// A spec as a non-zodapi backend would publish it: numeric and boolean
// parameters, a plain application/json 400 on one operation and none on the
// other. Drives the checks on what route() adds to generated contracts.
export const foreignDoc = {
  openapi: '3.1.0',
  info: { title: 'foreign', version: '1.0.0' },
  paths: {
    '/items/{id}': {
      get: {
        operationId: 'getItem',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } },
          { name: 'verbose', in: 'query', schema: { type: 'boolean' } },
          { name: 'ratio', in: 'query', schema: { type: 'number', minimum: 0, maximum: 1 } },
        ],
        responses: {
          200: {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'integer' } } },
              },
            },
          },
        },
      },
    },
    '/items': {
      get: {
        operationId: 'listItems',
        responses: {
          200: { description: 'ok' },
          400: {
            description: 'the backend’s own bad request',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { message: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
} as const
