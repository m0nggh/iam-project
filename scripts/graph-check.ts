/**
 * Phase 3 checkpoint: proves the Azure setup works without MongoDB or the API.
 * Gets a token, prints its decoded JWT claims, then lists the security groups.
 *
 *   npm run graph:check
 */
import { createTokenProvider } from '../src/auth/graphAuth';
import { loadConfig } from '../src/config';
import { AppError } from '../src/errors';
import { createGraphService } from '../src/services/graphService';

/** A JWT is three base64url parts: header.payload.signature. Decoding is not verifying! */
function decodeJwtPart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.azure) {
    throw new Error('graph:check needs real credentials: set TENANT_ID, CLIENT_ID and CLIENT_SECRET in .env');
  }

  const getToken = createTokenProvider(config.azure);
  const token = await getToken();
  const [header = '', payload = ''] = token.split('.');
  const claims = decodeJwtPart(payload);

  console.log('JWT header:', decodeJwtPart(header));
  console.log('JWT key claims:', {
    aud: claims.aud, // who the token is for (Graph)
    iss: claims.iss, // who issued it (your tenant's Entra ID)
    appid: claims.appid, // your app registration's client id
    roles: claims.roles, // application permissions granted, e.g. ["Group.Read.All"]
    expires: new Date(Number(claims.exp) * 1000).toISOString(),
  });

  const graph = createGraphService({ getToken });
  const groups = await graph.listSecurityGroups();
  console.log(`\nFound ${groups.length} security group(s):`);
  for (const group of groups) console.log(`  - ${group.displayName} (${group.id})`);
}

main().catch((err: unknown) => {
  console.error('graph:check failed:', err instanceof Error ? err.message : err);
  if (err instanceof AppError && err.details) console.error(err.details);
  process.exitCode = 1;
});
