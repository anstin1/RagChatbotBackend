// Simple utility to cap async operations with a timeout and optional fallback value
function withTimeout(promise, ms, onTimeoutValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(onTimeoutValue), ms))
  ]);
}

module.exports = { withTimeout };


