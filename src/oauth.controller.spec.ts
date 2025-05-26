import { OauthService } from './oauth.service';
import { Configuration } from './config/configuration';
import { OauthController } from './oauth.controller';

describe('OauthController', () => {
  let service: OauthService & { connectIntegration: jest.Mock };
  let config: Configuration;

  beforeEach(() => {
    service = {
      connectIntegration: jest.fn().mockResolvedValue({}),
    } as unknown as OauthService & { connectIntegration: jest.Mock };
    config = {
      oauth: {
        clientId: 'client-id',
        redirectUri: 'redirect-uri',
        authUrl: 'auth-url',
        scopes: 'scope1 scope2',
      },
      flexRoot: 'https://custom.flex',
    } as Configuration;
  });

  it('should return redirect object to flexRoot on successful connection', async () => {
    const controller = new OauthController(service, config);
    const query = {
      code: 'thecode',
      org_slug: 'org1',
      integrationId: 'int1',
      locations: 'loc1,loc2',
    };
    const result = await controller.oauthReturn(query);
    expect(result).toEqual({
      url: 'https://custom.flex/connect/external-integration/return',
      statusCode: 302,
    });
    expect(service.connectIntegration).toHaveBeenCalledWith('thecode', 'org1', 'int1', [
      'loc1',
      'loc2',
    ]);
  });
});
