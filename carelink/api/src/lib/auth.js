// STUB AUTH — dev only.
//
// This issues and verifies a symmetric-key JWT locally. It exists so the
// scaffold is runnable without any cloud identity provider. It is NOT secure
// for real use and stores NO passwords (any password is accepted for a known
// seeded staff email — clearly a dev stub).
//
// MAPS TO AWS COGNITO LATER:
//   - Cognito issues JWTs signed with its own keys (RS256, verified via JWKS).
//   - The `sub` claim becomes the Cognito user id; we map it to
//     staff_members.auth_user_id (already modeled in the schema).
//   - Replace `signDevToken` with "redirect to Cognito Hosted UI" and
//     `verifyToken` with JWKS verification. The rest of the API (which reads
//     req.auth.staffId / authUid) does not change.
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const ISSUER = process.env.JWT_ISSUER || 'carelink-dev';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!process.env.JWT_SECRET) {
  console.warn(
    '[carelink-api] JWT_SECRET not set — using an INSECURE dev default. ' +
      'Set one in api/.env. This whole auth path is a stub for local dev only.'
  );
}

// authUid here is the staff_members.auth_user_id (a uuid we seed).
export function signDevToken({ authUid, staffId, email, name, isOrgAdmin }) {
  return jwt.sign(
    { sub: authUid, staffId, email, name, isOrgAdmin: !!isOrgAdmin },
    SECRET,
    { issuer: ISSUER, expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET, { issuer: ISSUER });
}

// Hono middleware: require a valid dev token; attach req auth context.
export function requireAuth() {
  return async (c, next) => {
    const header = c.req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return c.json({ error: 'Not authenticated' }, 401);
    try {
      const claims = verifyToken(token);
      c.set('auth', {
        authUid: claims.sub,
        staffId: claims.staffId,
        email: claims.email,
        name: claims.name,
        isOrgAdmin: !!claims.isOrgAdmin,
      });
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired session' }, 401);
    }
  };
}
