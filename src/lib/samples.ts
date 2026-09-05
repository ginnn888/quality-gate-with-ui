// Bundled sample files so the console can be tried with one click.
export interface Sample {
  name: string;
  content: string;
}

export const SAMPLES: Sample[] = [
  {
    name: "math.js",
    content: `// Basic math utilities
function validateNumbers(...args) {
  for (const arg of args) {
    if (typeof arg !== 'number' || Number.isNaN(arg)) {
      throw new TypeError('Inputs must be valid numbers');
    }
  }
}

function add(a, b) {
  validateNumbers(a, b);
  const result = a + b;
  return Object.is(result, -0) ? 0 : result;
}

function divide(a, b) {
  validateNumbers(a, b);
  if (b === 0) throw new Error('Cannot divide by zero');
  const result = a / b;
  return Object.is(result, -0) ? 0 : result;
}

module.exports = { add, divide };
`,
  },
  {
    name: "security_vulnerable.js",
    content: `const { exec } = require('child_process');

const AWS_SECRET_KEY = "wJalrXUtnFEMI7K8s...B2C3d4E5f6G7h8I9";
const DB_PASSWORD = "Pr0d-Db-P4ss-9271";

function processInput(userInput) {
  // dangerous: evaluates attacker-controlled input
  return eval(userInput);
}

function runDiagnostic(command) {
  // dangerous: shell injection
  return exec('echo ' + command);
}

function generateToken() {
  // weak randomness for a security token
  return Math.random().toString(36).slice(2);
}

module.exports = { processInput, runDiagnostic, generateToken };
`,
  },
  {
    name: "utility.js",
    content: `const math = require('./math');

function calculateWeightedScore(scoreA, scoreB, weight) {
  const totalRaw = math.add(scoreA, scoreB);
  return math.multiply(totalRaw, weight);
}

function calculateTotalWithTax(price, taxRate) {
  const taxAmount = math.divide(math.multiply(price, taxRate), 100);
  return math.add(price, taxAmount);
}

module.exports = { calculateWeightedScore, calculateTotalWithTax };
`,
  },
];
