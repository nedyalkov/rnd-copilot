import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { OAuthToken, OAuthTokenSchema } from './oauth.schema';

describe('OAuthToken Model with mongodb-memory-server (NestJS)', () => {
  let mongoServer: MongoMemoryServer;
  let model: mongoose.Model<OAuthToken>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    try {
      mongoose.deleteModel('OAuthToken');
    } catch {
      // ignore if model does not exist
    }
    model = mongoose.model<OAuthToken>('OAuthToken', OAuthTokenSchema);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('should add a new entity and find it', async () => {
    const mockDoc = {
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: new Date(),
      accountSlug: 'org1',
      integrationId: 'int1',
    };

    const created = await model.create(mockDoc);
    const createdObj = created.toObject();
    expect(createdObj.accountSlug).toBe('org1');
    expect(createdObj.integrationId).toBe('int1');
    expect(createdObj.accessToken).toBe('token');
    expect(createdObj.refreshToken).toBe('refresh');

    const found = await model.findOne({ accountSlug: 'org1' }).lean();
    expect(found).toBeDefined();
    expect(found?.integrationId).toBe('int1');
    expect(found?.accessToken).toBe('token');
    expect(found?.refreshToken).toBe('refresh');
  });
});
