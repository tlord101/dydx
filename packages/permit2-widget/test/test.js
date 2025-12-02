const assert = require('assert');
const path = require('path');

// Load the built CommonJS bundle if present.
const bundlePath = path.join(__dirname, '..', 'dist', 'index.cjs.js');
let sdk = null;
try {
  sdk = require(bundlePath);
} catch (e) {
  console.error('Failed to load bundle at', bundlePath, e.message);
  process.exit(2);
}

assert.ok(typeof sdk.open === 'function', 'open should be a function');
assert.ok(typeof sdk.attach === 'function', 'attach should be a function');
assert.ok(typeof sdk.verify === 'function', 'verify should be a function');

console.log('Basic export tests passed');
