import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Server-side PHI field encryption for data at rest
 * Uses encryption key stored securely on server
 * This is called by backend functions for additional encryption layer
 */

const ENCRYPTION_KEY = Deno.env.get('PHI_ENCRYPTION_KEY') || 'fallback-key-not-secure';

/**
 * Simple XOR-based encryption (for demo; use proper encryption in production)
 * In production, use TweetNaCl.js or libsodium via Deno
 */
function simpleEncrypt(data, key) {
  const encrypted = [];
  for (let i = 0; i < data.length; i++) {
    encrypted.push(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(String.fromCharCode(...encrypted));
}

function simpleDecrypt(encrypted, key) {
  const data = atob(encrypted);
  const decrypted = [];
  for (let i = 0; i < data.length; i++) {
    decrypted.push(String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return decrypted.join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { field_value, operation } = payload; // operation: 'encrypt' or 'decrypt'

    if (!field_value) {
      return Response.json({ error: 'No field value provided' }, { status: 400 });
    }

    let result;
    if (operation === 'encrypt') {
      result = simpleEncrypt(String(field_value), ENCRYPTION_KEY);
    } else if (operation === 'decrypt') {
      result = simpleDecrypt(field_value, ENCRYPTION_KEY);
    } else {
      return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }

    return Response.json({ result });
  } catch (error) {
    console.error('Error in PHI encryption:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});