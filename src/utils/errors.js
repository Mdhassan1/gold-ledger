export class AppError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (details) {
      Object.assign(this, details);
    }
  }
}

export function isAppError(error) {
  return Boolean(error && error.name === 'AppError');
}

export function userMessage(error) {
  if (isAppError(error)) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
