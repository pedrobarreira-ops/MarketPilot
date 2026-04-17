// src/middleware/errorHandler.js
// Global Fastify error handler — maps all errors to a safe { error, message } shape.
// Never exposes stack traces or raw error messages (which may contain API key values).

export function errorHandler(err, request, reply) {
  // Fastify validation errors (body/param schema failures) — 400
  if (err.statusCode === 400 || err.validation) {
    return reply.status(400).send({
      error: 'validation_error',
      message: err.message,
    })
  }

  // Log the error type and code — NEVER the full message (may contain API key details)
  request.log.error({
    error_type: err.constructor.name,
    error_code: err.code,
    status_code: err.statusCode ?? 500,
  }, 'Unhandled error')

  // All other errors → 500 with safe message
  return reply.status(err.statusCode ?? 500).send({
    error: 'internal_server_error',
    message: 'Erro interno. Tenta novamente ou contacta o suporte.',
  })
}
