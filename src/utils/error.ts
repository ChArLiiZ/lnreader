export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// --- Error classification ---

export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class PluginError extends AppError {
  pluginId?: string;
  constructor(message: string, pluginId?: string) {
    super(message);
    this.name = 'PluginError';
    this.pluginId = pluginId;
  }
}

export class ParseError extends AppError {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Classify an unknown error into a typed AppError.
 */
export function classifyError(error: unknown, pluginId?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = getErrorMessage(error);
  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('fetch') ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('unable to resolve host') ||
    lowerMsg.includes('network request failed')
  ) {
    return new NetworkError(message);
  }

  if (
    lowerMsg.includes('parse') ||
    lowerMsg.includes('json') ||
    lowerMsg.includes('unexpected token') ||
    lowerMsg.includes('invalid html')
  ) {
    return new ParseError(message);
  }

  if (pluginId) {
    return new PluginError(message, pluginId);
  }

  return new AppError(message);
}
