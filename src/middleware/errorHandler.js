// src/middleware/errorHandler.js
// Global Fastify error handler — maps all errors to a safe { error, message } shape.
// Never exposes stack traces or raw error messages (which may contain API key values).

export function errorHandler(err, request, reply) {
  // Fastify schema validation errors (body/param/query failures) — 400.
  // err.validation is set by Fastify/Ajv; err.message here is framework-generated
  // (e.g. "body/name must be string") and does not contain user-supplied data.
  // Only use err.message when err.validation is set — never for manually thrown 400s
  // which may carry raw error messages with sensitive content.
  if (err.validation) {
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

  // All other errors → always 500 with a safe, generic message.
  // We do NOT pass through err.statusCode to avoid leaking internal status codes
  // from misbehaving plugins or manually thrown errors with unexpected statusCode values.
  return reply.status(500).send({
    error: 'internal_server_error',
    message: 'Erro interno. Tenta novamente ou contacta o suporte.',
  })
}
