import { Test, TestingModule } from '@nestjs/testing';
import { OauthService } from './oauth.service';
import { Configuration, CONFIGURATION_KEY } from './config/configuration';
import { OauthController, FlexConfigureQueryDto } from './oauth.controller';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { serializeQueryParams } from './signature.helper';

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

describe('OauthController signature validation', () => {
  let controller: OauthController;
  let service: OauthService;
  const secret = 'test-secret';
  const slug = 'test-slug';
  const organizationId = 'org-id';
  const accountName = 'Test Org';
  let module: TestingModule;

  // Minimal mock token object
  const mockToken = {
    integrationSecret: secret,
    accessToken: '',
    refreshToken: '',
    expiresAt: new Date(),
    accountId: '',
    accountName: '',
    integrationId: '',
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [OauthController],
      providers: [
        {
          provide: OauthService,
          useValue: {
            getRawToken: jest.fn(),
            checkConnection: jest.fn(),
            getValidToken: jest.fn(),
            connectIntegration: jest.fn(),
          },
        },
        {
          provide: CONFIGURATION_KEY,
          useValue: { oauth: {}, flexRoot: '' },
        },
      ],
    }).compile();
    controller = module.get(OauthController);
    service = module.get(OauthService);
  });

  function makeQuery(overrides: Partial<FlexConfigureQueryDto> = {}, ts?: string, valid = true) {
    const timestamp = ts || Math.floor(Date.now() / 1000).toString();
    const base: Record<string, unknown> = {
      slug,
      organizationId,
      ...overrides,
    };
    delete base.signature;
    // Use the tested helper to generate a valid or invalid signature string
    const payload = serializeQueryParams(base);
    let sig = crypto.createHmac('sha256', secret).update(`${payload}.${timestamp}`).digest('hex');
    if (!valid) sig = 'bad' + sig.slice(3);
    const signature = `t=${timestamp},signature=${sig}`;
    return { ...base, signature } as FlexConfigureQueryDto & { signature: string };
  }

  it('should succeed with a valid signature and timestamp', async () => {
    jest.spyOn(service, 'getRawToken').mockResolvedValue(mockToken as any);
    jest.spyOn(service, 'checkConnection').mockResolvedValue({ accountName });
    const query = makeQuery();
    await expect(controller.check(query)).resolves.toEqual({ accountName });
  });

  it('should fail with an invalid signature', async () => {
    jest.spyOn(service, 'getRawToken').mockResolvedValue(mockToken as any);
    const query = makeQuery({}, undefined, false);
    await expect(controller.check(query)).rejects.toThrow(BadRequestException);
  });

  it('should fail with a missing timestamp', async () => {
    jest.spyOn(service, 'getRawToken').mockResolvedValue(mockToken as any);
    const query = makeQuery();
    // Remove the timestamp from the signature string
    const signature = query.signature.replace(/t=[^,]+,?/, '');
    const rest: Partial<typeof query> = { ...query, signature };
    await expect(controller.check(rest as any)).rejects.toThrow(BadRequestException);
  });

  it('should fail with an expired timestamp', async () => {
    jest.spyOn(service, 'getRawToken').mockResolvedValue(mockToken as any);
    const oldTs = (Math.floor(Date.now() / 1000) - 10000).toString();
    const query = makeQuery({}, oldTs);
    await expect(controller.check(query)).rejects.toThrow(BadRequestException);
  });

  it('should succeed with a realistic OfficeRnD input query (static payload and signature)', async () => {
    jest.spyOn(service, 'getRawToken').mockResolvedValue({
      ...mockToken,
      integrationSecret: '262ff0ec-f9f8-4a72-82b2-b60360beab4a',
    } as any);
    jest.spyOn(service, 'checkConnection').mockResolvedValue({ accountName });
    // Use the exact static request and signature from the user
    const query = {
      slug: 'billrun-test-miro',
      locations: '',
      organizationId: '5b5b68eb74565a0e0000b068',
      memberId: '5bcf48410467da0f003f474d',
      signature:
        't=1748248887,signature=50d1f1db40ca3cf23e80c5a5fc0233f0ea90b229e83cfe312af9fc7a4535fbc3',
    };
    // Fake the system time to match the timestamp in the signature
    jest.useFakeTimers().setSystemTime(1748248887 * 1000);
    await expect(controller.check(query as any)).resolves.toEqual({ accountName });
    jest.useRealTimers();
  });
});
