import { ClientSecretCredential } from '@azure/identity';
import type { AzureCredentials } from '../config';
import { GraphApiError } from '../errors';

/** ".default" = "all application permissions an admin has consented to for this app". */
export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

export type TokenProvider = () => Promise<string>;

/**
 * OAuth 2.0 client credentials flow: the app authenticates as itself (no user) and Entra ID
 * returns a JWT access token. @azure/identity caches the token and refreshes it before expiry,
 * so calling this on every request is cheap.
 */
export function createTokenProvider({ tenantId, clientId, clientSecret }: AzureCredentials): TokenProvider {
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  return async () => {
    try {
      const { token } = await credential.getToken(GRAPH_SCOPE);
      return token;
    } catch (err) {
      throw new GraphApiError(
        'Could not get an access token from Entra ID (check TENANT_ID, CLIENT_ID and CLIENT_SECRET)',
        { status: 502, code: 'GRAPH_AUTH_FAILED', cause: err },
      );
    }
  };
}
