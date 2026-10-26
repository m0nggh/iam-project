import pino, { type Logger } from 'pino';

export function createLogger(level = 'info'): Logger {
  // Never write bearer tokens to the logs.
  return pino({ level, redact: ['req.headers.authorization'] });
}
