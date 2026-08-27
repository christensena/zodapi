#!/usr/bin/env tsx
// Prints the OpenAPI 3.1 document to stdout without starting a server.
import { app, openApiDoc } from './server.js'

console.log(JSON.stringify(app.getOpenAPI31Document(openApiDoc), null, 2))
