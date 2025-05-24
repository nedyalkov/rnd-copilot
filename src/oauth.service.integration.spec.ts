import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { OauthService } from './oauth.service';
import { OAuthToken, OAuthTokenSchema } from './oauth.schema';

const mockHttpService = {
  axiosRef: {
    post: jest.fn(),
    get: jest.fn(),
  },
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
    } catch {}
    model = mongoose.model<OAuthToken>('OAuthToken', OAuthTokenSchema);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OauthService,
        { provide: getModelToken(OAuthToken.name), useValue: model },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();
    service = module.get<OauthService>(OauthService);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should exchange code for token and save to DB', async () => {
    // Arrange
    const tokenResponse = {
      data: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_in: 3600,
      },
    };
    mockHttpService.axiosRef.post.mockResolvedValueOnce(tokenResponse);

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

  it('should refresh token and save to DB', async () => {
    // Arrange
    const tokenResponse = {
      data: {
        access_token: 'token2',
        refresh_token: 'refresh2',
        expires_in: 3600,
      },
    };
    mockHttpService.axiosRef.post.mockResolvedValueOnce(tokenResponse);

    // Act
    const token = await service.refreshToken('refresh');

    // Assert
    expect(token.accessToken).toBe('token2');
    expect(token.refreshToken).toBe('refresh2');
    // Check DB
    const found = await model.findOne({ refreshToken: 'refresh2' }).lean();
    expect(found).toBeDefined();
    expect(found?.accessToken).toBe('token2');
  });
});
