const originalEmit = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const text = typeof warning === 'string' ? warning : warning && warning.message;
  if (text && String(text).includes('SQLite')) return undefined;
  return originalEmit.call(process, warning, ...args);
};
