#!/usr/bin/env node

import crypto from 'crypto';
import { getPrivateKey } from './src/config/env.js';

async function checkKeys() {
  // Get our private key
  const privateKey = getPrivateKey();
  console.log('=== PRIVATE KEY (first 100 chars) ===');
  console.log(privateKey.substring(0, 100) + '...');

  // Extract public key from our private key
  const keyObject = crypto.createPrivateKey(privateKey);
  const publicKey = crypto.createPublicKey(keyObject);
  const publicKeyFromPrivate = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyBase64 = publicKeyFromPrivate.toString('base64');

  console.log('\n=== OUR PUBLIC KEY (derived from private key) ===');
  console.log(publicKeyBase64);

  // The public key from payware DB
  const paywarePublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAi0h9c+0VASQ2BUvet/ScY6qBhf2NmIjHBm7SqxNoaHL8S9bwx2FPPsnmQRdlYrGHiQmdPaVG4hNa5Wefwf1jlDrjJDNXF5PoxHN3cUWdhhv1YWybGneyLdbWCEmWjG3M9BqkJrcgug+vsSIeswoophtk9woQ1gn/HhMzFKu4OYUdM7kqUbSVMJLzmx3Ja+XR4p32F73X6fzKJNhtjTkrxegsYXGyEOBoVVePlAEEjgF1Khmm1zct/bj/MjDiKuieFARNF5n9v+rVqj4a0KQTT0knBhTUJr4XfV346uSZt23U5dxlz+s/PJWXEKSIVuki5xXMKX1V0+U+To1wLbdBPQIDAQAB';

  console.log('\n=== PAYWARE DB PUBLIC KEY ===');
  console.log(paywarePublicKey);

  console.log('\n=== COMPARISON ===');
  const keysMatch = publicKeyBase64 === paywarePublicKey;
  console.log('Keys match:', keysMatch ? '✅ YES' : '❌ NO');

  if (!keysMatch) {
    console.log('\n=== 🔍 KEY MISMATCH DETECTED ===');
    console.log('This explains the ERR_INVALID_SIGNATURE error!');
    console.log('The private key we are using does not correspond to the public key in payware DB.');
    console.log('\n=== SOLUTION ===');
    console.log('Either:');
    console.log('1. Update payware DB with our public key:');
    console.log('   ' + publicKeyBase64);
    console.log('2. Get the correct private key that matches the DB public key');
    
    console.log('\n=== KEY DETAILS ===');
    console.log('Our public key length:', publicKeyBase64.length);
    console.log('DB public key length:', paywarePublicKey.length);
    console.log('First 50 chars - Ours:', publicKeyBase64.substring(0, 50));
    console.log('First 50 chars - DB  :', paywarePublicKey.substring(0, 50));
  } else {
    console.log('\n=== ✅ KEYS MATCH ===');
    console.log('The signature error must be caused by something else.');
  }
}

checkKeys().catch(console.error);