#!/usr/bin/env node

declare function require(moduleName: string): any;
declare const process: any;

const { readFileSync } = require('fs');
const { resolve } = require('path');
import { verifyPoPCertificate } from '../src/core/audit/PoPCertificateExporter';

function printUsage() {
  console.log(`
Plotailor Proof of Process (PoP) Verification CLI

Usage:
  node scripts/pop-verify.js <path-to-certificate.pop.json | .cbor>
  npx tsx scripts/pop-verify.ts <path-to-certificate.pop.json | .cbor>

Options:
  -h, --help    Display this help message
`);
}

export function runCLI(args: string[]): number {
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    return 0;
  }

  const filePath = resolve(process.cwd(), args[0]);

  try {
    const fileBuffer = readFileSync(filePath);
    let result;

    if (filePath.endsWith('.cbor')) {
      result = verifyPoPCertificate(new Uint8Array(fileBuffer));
    } else {
      const fileStr = fileBuffer.toString('utf-8');
      result = verifyPoPCertificate(fileStr);
    }

    if (result.valid) {
      console.log('✅ Proof of Process Certificate Verification PASSED!');
      console.log(`   - Chain Length: ${result.blockCount} blocks`);
      console.log(`   - Root Hash: ${result.calculatedRootHash}`);
      if (result.summary) {
        console.log(`   - HCIS Score: ${result.summary.hcisScore}`);
        console.log(`   - Keystroke Entropy: ${result.summary.keystrokeEntropy} bits`);
        console.log(`   - Final Char Count: ${result.summary.finalCharCount}`);
      }
      return 0;
    } else {
      console.error('❌ Proof of Process Certificate Verification FAILED!');
      console.error(`   - Error: ${result.error}`);
      if (result.expectedRootHash && result.calculatedRootHash) {
        console.error(`   - Expected Root Hash:   ${result.expectedRootHash}`);
        console.error(`   - Calculated Root Hash: ${result.calculatedRootHash}`);
      }
      return 1;
    }
  } catch (err: any) {
    console.error(`❌ Error reading or verifying file '${filePath}': ${err?.message || err}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('pop-verify.ts') || process.argv[1]?.endsWith('pop-verify.js')) {
  const exitCode = runCLI(process.argv.slice(2));
  if (typeof process.exit === 'function' && !process.env.VITEST) {
    process.exit(exitCode);
  }
}
