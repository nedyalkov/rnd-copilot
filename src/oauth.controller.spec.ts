import { Response } from 'express';
import { OauthService } from './oauth.service';
import { Configuration } from './config/configuration';

describe('OauthController', () => {
  let service: OauthService;
  let config: Configuration;

  beforeEach(() => {
    service = { connectIntegration: jest.fn().mockResolvedValue({}) } as unknown as OauthService;
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

  it('should redirect to flexRoot on successful connection', async () => {
    const { OauthController } = await import('./oauth.controller');
    const controller = new OauthController(service, config);
    const query = {
      code: 'thecode',
      org_slug: 'org1',
      integrationId: 'int1',
      locations: 'loc1,loc2',
    };
    const res = { redirect: jest.fn() } as unknown as Response;
    await controller.oauthReturn(query, res);
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://custom.flex/connect/external-integration/return',
    );
  });
});
