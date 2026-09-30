import {
  SocialConnectorService,
  UnavailableSocialConnectorProvider,
  type SocialConnectorServiceOptions,
} from '@me-zip/social-connectors';
import {
  XOfficialApiProvider,
  type XCredentialVault,
  type XFetch,
} from '@me-zip/social-connector-x';

/**
 * Explicit production composition for the X Connection Center.
 *
 * Missing configuration deliberately produces an unavailable X provider; it
 * never substitutes mock posts, a browser cookie, or a public bearer token.
 */
export interface XSocialIntegrationConfiguration {
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly credentialVault: XCredentialVault | undefined;
  readonly fetch?: XFetch;
}

export function createXEnabledSocialConnectorService(
  configuration: XSocialIntegrationConfiguration,
  options: Omit<SocialConnectorServiceOptions, 'providers'> = {},
): SocialConnectorService {
  const clientId = configuration.clientId?.trim();
  const clientSecret = configuration.clientSecret?.trim();
  const vault = configuration.credentialVault;
  const provider =
    clientId === undefined || clientId.length === 0 ||
    clientSecret === undefined || clientSecret.length === 0 ||
    vault === undefined
      ? new UnavailableSocialConnectorProvider('X')
      : new XOfficialApiProvider({
        clientId,
        clientSecret,
        credentialVault: vault,
        ...(configuration.fetch === undefined ? {} : { fetch: configuration.fetch }),
      });

  if (options.deploymentMode === 'PRODUCTION' && provider instanceof XOfficialApiProvider && !vault?.durable) {
    throw new Error('Production X integration requires a durable server-side X credential vault.');
  }

  return new SocialConnectorService({
    ...options,
    providers: { X: provider },
  });
}
