import { ConfigType, registerAs } from '@nestjs/config';
import * as path from 'path';

export const configurationLoader = registerAs('configuration', () => ({
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  mongoDbName: process.env.MONGO_DB_NAME || 'test',
  oauth: {
    clientId: process.env.OAUTH_CLIENT_ID || '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.OAUTH_REDIRECT_URI || '',
    tokenUrl: process.env.OAUTH_TOKEN_URL || '',
    authUrl: process.env.OAUTH_AUTH_URL || '',
    scopes: process.env.OAUTH_SCOPES || '',
  },
  flexRoot: process.env.FLEX_ROOT || 'https://staging.officernd.com',
  frontend: {
    indexPath: process.env.FRONTEND_INDEX_PATH || path.join(process.cwd(), 'ui', 'index.html'),
  },
}));

export const CONFIGURATION_KEY = configurationLoader.KEY;
export type Configuration = ConfigType<typeof configurationLoader>;
