// delivery-service/src/utils/logger.ts
import pino from 'pino';

const redactPaths = [
  'req.body.password',
  'req.body.token',
  'req.body.creditCard',
  'req.headers.authorization',
  'user.password'
];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]'
  },
  serializers: {
    req: (r: any) => ({
      method: r?.method,
      url: r?.url,
      params: r?.params,
      query: r?.query
    })
  }
});

export default logger;
