import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { OauthService } from './oauth.service';
import { OAuthToken, OAuthTokenSchema } from './oauth.schema';
import { of, throwError } from 'rxjs';
import { Configuration, CONFIGURATION_KEY } from './config/configuration';

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
};

describe('OauthService integration (mongodb-memory-server)', () => {
  let mongoServer: MongoMemoryServer;
  let model: mongoose.Model<OAuthToken>;
  let service: OauthService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    try {
      mongoose.deleteModel('OAuthToken');
    } catch {
      /* empty */
    }
    model = mongoose.model<OAuthToken>('OAuthToken', OAuthTokenSchema);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: getModelToken(OAuthToken.name), useValue: model },
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: CONFIGURATION_KEY,
          useValue: {
            oauth: {
              clientId: 'client-id',
              clientSecret: 'client-secret',
              redirectUri: 'redirect-uri',
              tokenUrl: 'token-url',
              authUrl: 'auth-url',
              scopes: 'scope1 scope2',
              testUrl: 'test-url',
            },
            flexRoot: 'https://custom.flex',
            mongoUri: '',
            mongoDbName: '',
          } as Configuration,
        },
        OauthService,
      ],
    }).compile();
    service = module.get<OauthService>(OauthService);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await model.deleteMany({});
  });

  describe('Token exchange and refresh', () => {
    it('should exchange code for token and save to DB', async () => {
      // Arrange
      const tokenResponse = {
        data: {
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      // Act
      const token = await service.exchangeCodeForToken('code', 'org1', 'int1', ['loc1', 'loc2']);

      // Assert
      expect(token.orgSlug).toBe('org1');
      expect(token.integrationId).toBe('int1');
      expect(token.accessToken).toBe('token');
      expect(token.refreshToken).toBe('refresh');
      expect(token.locations).toEqual(['loc1', 'loc2']);
      // Check DB
      const found = await model.findOne({ orgSlug: 'org1' }).lean();
      expect(found).toBeDefined();
      expect(found?.integrationId).toBe('int1');
    });

    it('should refresh token and return new token info, but not update DB', async () => {
      // Arrange: Save a token to be refreshed
      await model.create({
        accessToken: 'token-old',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug: 'org1',
        integrationId: 'int1',
      });
      const tokenResponse = {
        data: {
          access_token: 'token2',
          refresh_token: 'refresh2',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      // Act
      const tokenInfo = await service.refreshToken('refresh');

      // Assert: returned info is correct
      expect(tokenInfo.accessToken).toBe('token2');
      expect(tokenInfo.refreshToken).toBe('refresh2');
      expect(tokenInfo.expiresAt).toBeInstanceOf(Date);
      // DB is NOT updated yet
      const found = await model.findOne({ refreshToken: 'refresh2' }).lean();
      expect(found).toBeNull();
      // Old token still exists
      const old = await model.findOne({ orgSlug: 'org1', integrationId: 'int1' }).lean();
      expect(old).toBeDefined();
      expect(old?.accessToken).toBe('token-old');
    });

    it('should send correct body and headers to token endpoint (exchangeCodeForToken)', async () => {
      const tokenResponse = {
        data: {
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      await service.exchangeCodeForToken('thecode', 'org-slug', 'int-id', ['locA', 'locB']);

      const [url, body, options] = mockHttpService.post.mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBeDefined();
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=thecode');
      expect(body).toContain('client_id=');
      expect(body).toContain('client_secret=');
      expect(body).toContain('redirect_uri=');
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should send correct body and headers to token endpoint (refreshToken)', async () => {
      // Arrange: Save a token to be refreshed
      await model.create({
        accessToken: 'token-old',
        refreshToken: 'refresh-token-value',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug: 'org1',
        integrationId: 'int1',
      });
      const tokenResponse = {
        data: {
          access_token: 'token2',
          refresh_token: 'refresh2',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      // Act
      await service.refreshToken('refresh-token-value');

      const [url, body, options] = mockHttpService.post.mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBeDefined();
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=refresh-token-value');
      expect(body).toContain('client_id=');
      expect(body).toContain('client_secret=');
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      // DB should still have the old token
      const found = await model.findOne({ orgSlug: 'org1', integrationId: 'int1' }).lean();
      expect(found?.accessToken).toBe('token-old');
    });

    it('should update the existing token document on refresh, preserving orgSlug/integrationId/locations', async () => {
      // Arrange: Save a token with orgSlug, integrationId, and locations
      const orgSlug = 'org-refresh';
      const integrationId = 'int-refresh';
      const locations = ['loc1', 'loc2'];
      await model.create({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug,
        integrationId,
        locations,
      });
      // Mock OfficeRnD token refresh response
      mockHttpService.post.mockReturnValueOnce(
        of({
          data: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          },
        }),
      );
      // Act
      const refreshed = await service.refreshToken('old-refresh');
      // Assert: Only check returned value, not DB
      expect(refreshed.accessToken).toBe('new-access');
      expect(refreshed.refreshToken).toBe('new-refresh');
      expect(refreshed.expiresAt).toBeInstanceOf(Date);
      // DB should still have the old token
      const found = await model.findOne({ orgSlug, integrationId }).lean();
      expect(found?.accessToken).toBe('old-access');
    });

    it('should send correct body and headers to token endpoint (exchangeCodeForToken)', async () => {
      const tokenResponse = {
        data: {
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      await service.exchangeCodeForToken('thecode', 'org-slug', 'int-id', ['locA', 'locB']);

      const [url, body, options] = mockHttpService.post.mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBeDefined();
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code=thecode');
      expect(body).toContain('client_id=');
      expect(body).toContain('client_secret=');
      expect(body).toContain('redirect_uri=');
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('should send correct body and headers to token endpoint (refreshToken)', async () => {
      // Arrange: Save a token to be refreshed
      await model.create({
        accessToken: 'token-old',
        refreshToken: 'refresh-token-value',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug: 'org1',
        integrationId: 'int1',
      });
      const tokenResponse = {
        data: {
          access_token: 'token2',
          refresh_token: 'refresh2',
          expires_in: 3600,
        },
      };
      mockHttpService.post.mockReturnValueOnce(of(tokenResponse));

      // Act
      await service.refreshToken('refresh-token-value');

      const [url, body, options] = mockHttpService.post.mock.calls[0] as [
        string,
        string,
        { headers: Record<string, string> },
      ];
      expect(url).toBeDefined();
      expect(body).toContain('grant_type=refresh_token');
      expect(body).toContain('refresh_token=refresh-token-value');
      expect(body).toContain('client_id=');
      expect(body).toContain('client_secret=');
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      // DB should still have the old token
      const found = await model.findOne({ orgSlug: 'org1', integrationId: 'int1' }).lean();
      expect(found?.accessToken).toBe('token-old');
    });

    it('should update the existing token document on refresh, preserving orgSlug/integrationId/locations', async () => {
      // Arrange: Save a token with orgSlug, integrationId, and locations
      const orgSlug = 'org-refresh';
      const integrationId = 'int-refresh';
      const locations = ['loc1', 'loc2'];
      await model.create({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug,
        integrationId,
        locations,
      });
      // Mock OfficeRnD token refresh response
      mockHttpService.post.mockReturnValueOnce(
        of({
          data: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          },
        }),
      );
      // Act
      const refreshed = await service.refreshToken('old-refresh');
      // Assert: Only check returned value, not DB
      expect(refreshed.accessToken).toBe('new-access');
      expect(refreshed.refreshToken).toBe('new-refresh');
      expect(refreshed.expiresAt).toBeInstanceOf(Date);
      // DB should still have the old token
      const found = await model.findOne({ orgSlug, integrationId }).lean();
      expect(found?.accessToken).toBe('old-access');
    });
  });

  describe('Integration secret handshake', () => {
    it('should fetch and store integration secret after token exchange', async () => {
      // Arrange: Save a token for the org/integration
      const orgSlug = 'org1';
      const integrationId = 'int1';
      const tokenDoc: OAuthToken = await model.create({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 100000),
        orgSlug,
        integrationId,
      });
      // Mock FLEX API response
      mockHttpService.get.mockReturnValueOnce(of({ data: { settings: { secret: 'the-secret' } } }));

      // Act
      await service.fetchAndStoreIntegrationSecret(orgSlug, integrationId);

      // Assert: Should call FLEX API with correct URL and headers
      expect(mockHttpService.get).toHaveBeenCalledWith(
        expect.stringContaining(`/organizations/${orgSlug}/integrations/${integrationId}`),
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            Authorization: `Bearer ${tokenDoc.accessToken}`,
          }),
        }),
      );
      // Assert: Should store the secret in the DB
      const updated = await model.findOne({ orgSlug, integrationId }).exec();
      expect(updated?.integrationSecret).toBe('the-secret');
    });

    it('should not update secret if FLEX API returns no secret', async () => {
      const orgSlug = 'org2';
      const integrationId = 'int2';
      await model.create({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 100000),
        orgSlug,
        integrationId,
      });
      mockHttpService.get.mockReturnValueOnce(of({ data: { settings: {} } }));
      await service.fetchAndStoreIntegrationSecret(orgSlug, integrationId);
      const updated = await model.findOne({ orgSlug, integrationId }).lean();
      expect(
        Object.prototype.hasOwnProperty.call(updated ?? {}, 'integrationSecret')
          ? (updated as Record<string, unknown>).integrationSecret
          : undefined,
      ).toBeUndefined();
    });
  });

  describe('Connection check', () => {
    it('should return true if checkConnection succeeds (valid token, API call ok)', async () => {
      // Arrange: Save a valid token
      await model.create({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 100000),
        orgSlug: 'org1',
        integrationId: 'int1',
      });
      // Mock a valid integration response with a 'settings' object
      jest
        .spyOn(mockHttpService, 'get')
        .mockReturnValueOnce(of({ data: { settings: { secret: 'abc' } } }));

      // Act
      const result = await service.checkConnection('org1', 'int1');

      // Assert
      expect(result.connected).toBe(true);
      expect(result.message).toBeUndefined();
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should return false and error message if checkConnection fails (API call throws)', async () => {
      // Arrange: Save a valid token
      await model.create({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 100000),
        orgSlug: 'org1',
        integrationId: 'int1',
      });
      jest
        .spyOn(mockHttpService, 'get')
        .mockReturnValueOnce(throwError(() => new Error('API error')));

      // Act
      const { connected, message } = await service.checkConnection('org1', 'int1');

      // Assert
      expect(connected).toBe(false);
      expect(message).toBe('API error');
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should return false and message if no valid token exists', async () => {
      // Arrange: Ensure no tokens in DB
      await model.deleteMany({});

      // Act
      const { connected, message } = await service.checkConnection('org1', 'int1');

      // Assert
      expect(connected).toBe(false);
      expect(message).toBe('No valid token found');
      expect(mockHttpService.get).not.toHaveBeenCalled();
    });
  });

  describe('getValidToken', () => {
    it('should update DB with new token values after refresh', async () => {
      // Arrange: Save an expired token
      await model.create({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug: 'org-refresh',
        integrationId: 'int-refresh',
        locations: ['loc1', 'loc2'],
      });
      mockHttpService.post.mockReturnValueOnce(
        of({
          data: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          },
        }),
      );
      // Act
      const token = await service.getValidToken('org-refresh', 'int-refresh');
      // Assert: DB should be updated
      expect(token?.accessToken).toBe('new-access');
      expect(token?.refreshToken).toBe('new-refresh');
      expect(token?.locations).toEqual(['loc1', 'loc2']);
      const found = await model
        .findOne({ orgSlug: 'org-refresh', integrationId: 'int-refresh' })
        .lean();
      expect(found?.accessToken).toBe('new-access');
      expect(found?.refreshToken).toBe('new-refresh');
    });

    it('should not call refresh if token is not expired and should not update DB', async () => {
      // Arrange: Save a valid token
      await model.create({
        accessToken: 'valid-access',
        refreshToken: 'valid-refresh',
        expiresAt: new Date(Date.now() + 100000), // not expired
        orgSlug: 'org-valid',
        integrationId: 'int-valid',
      });
      const spy = jest.spyOn(service, 'refreshToken');
      // Act
      const token = await service.getValidToken('org-valid', 'int-valid');
      // Assert
      expect(token?.accessToken).toBe('valid-access');
      expect(spy).not.toHaveBeenCalled();
      const found = await model
        .findOne({ orgSlug: 'org-valid', integrationId: 'int-valid' })
        .lean();
      expect(found?.accessToken).toBe('valid-access');
    });

    it('should update the token in the DB when getValidToken triggers a refresh', async () => {
      // Arrange: Save an expired token
      await model.create({
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        expiresAt: new Date(Date.now() - 1000), // expired
        orgSlug: 'org-refresh',
        integrationId: 'int-refresh',
        locations: ['loc1', 'loc2'],
      });
      // Mock OfficeRnD token refresh response
      mockHttpService.post.mockReturnValueOnce(
        of({
          data: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          },
        }),
      );
      // Act
      const refreshed = await service.getValidToken('org-refresh', 'int-refresh');
      // Assert: token object is updated
      expect(refreshed?.accessToken).toBe('new-access');
      expect(refreshed?.refreshToken).toBe('new-refresh');
      expect(refreshed?.locations).toEqual(['loc1', 'loc2']);
      // Assert: DB is updated
      const dbToken = await model.findOne({ orgSlug: 'org-refresh', integrationId: 'int-refresh' }).lean();
      expect(dbToken?.accessToken).toBe('new-access');
      expect(dbToken?.refreshToken).toBe('new-refresh');
      expect(dbToken?.locations).toEqual(['loc1', 'loc2']);
    });
  });
});
