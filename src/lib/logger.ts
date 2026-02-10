type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  [key: string]: unknown;
}

function formatLog(level: LogLevel, module: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    return `${base} ${JSON.stringify(context)}`;
  }
  return base;
}

function createLogger(module: string) {
  return {
    info(message: string, context?: LogContext) {
      console.log(formatLog('info', module, message, context));
    },
    warn(message: string, context?: LogContext) {
      console.warn(formatLog('warn', module, message, context));
    },
    error(message: string, error?: unknown, context?: LogContext) {
      const errorContext: LogContext = { ...context };
      if (error instanceof Error) {
        errorContext.errorMessage = error.message;
        errorContext.stack = error.stack;
      } else if (error !== undefined) {
        errorContext.error = String(error);
      }
      console.error(formatLog('error', module, message, errorContext));
    },
    debug(message: string, context?: LogContext) {
      if (process.env.NODE_ENV === 'development') {
        console.log(formatLog('debug', module, message, context));
      }
    },
  };
}

export default createLogger;
export type { LogContext };
