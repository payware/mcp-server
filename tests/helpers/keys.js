import { generateKeyPairSync } from 'node:crypto';

/**
 * An ephemeral RSA keypair, generated per test run.
 *
 * Tests must never read `keys/` - those are gitignored, absent on CI, and on a developer's machine
 * they are real sandbox credentials. A test that silently picks them up passes locally and fails in
 * CI for a reason that looks nothing like the cause.
 *
 * 2048 bits because that is what `payware_authentication_generate_rsa_keys` defaults to, and because
 * a larger key costs real seconds per test run for no extra coverage.
 */
export function generateTestKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}
