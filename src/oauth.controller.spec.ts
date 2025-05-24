import { Test, TestingModule } from '@nestjs/testing';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

describe('OauthController', () => {
  let controller: OauthController;
  let service: OauthService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OauthController],
      providers: [
        {
          provide: OauthService,
          useValue: { exchangeCodeForToken: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'flexRoot') return 'https://custom.flex';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    controller = module.get<OauthController>(OauthController);
    service = module.get<OauthService>(OauthService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should redirect to flexRoot on successful connection', async () => {
    const req: any = {
      query: {
        code: 'thecode',
        org_slug: 'org1',
        integrationId: 'int1',
        locations: 'loc1,loc2',
      },
    };
    const res = { redirect: jest.fn() } as any as Response;
    (service.exchangeCodeForToken as jest.Mock).mockResolvedValueOnce({});
    await controller.oauthReturn(req, res);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://custom.flex/connect/external-integration/return',
    );
  });

  it('should use default flexRoot if not set in config', async () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'flexRoot') return undefined;
      return undefined;
    });
    const req: any = {
      query: {
        code: 'thecode',
        org_slug: 'org1',
        integrationId: 'int1',
        locations: 'loc1,loc2', // simulate query string value
      },
    };
    const res = { redirect: jest.fn() } as any as Response;
    (service.exchangeCodeForToken as jest.Mock).mockResolvedValueOnce({});
    await controller.oauthReturn(req, res);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://staging.officernd.com/connect/external-integration/return',
    );
  });
});
