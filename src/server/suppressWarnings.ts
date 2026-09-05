// Suppress Node.js runtime experimental warnings for clean logs
const origEmitWarning = process.emitWarning;

process.emitWarning = function (warning: any, ...args: any[]) {
  if (
    typeof warning === 'string' &&
    (warning.includes('ExperimentalWarning') ||
      warning.includes('SQLite is an experimental feature') ||
      warning.includes('Web Crypto API') ||
      args[0] === 'ExperimentalWarning')
  ) {
    return;
  }
  if (warning && typeof warning === 'object' && warning.name === 'ExperimentalWarning') {
    return;
  }
  return origEmitWarning.apply(process, [warning, ...args] as any);
};
