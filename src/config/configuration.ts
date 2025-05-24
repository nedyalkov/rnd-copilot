export default () => ({
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017',
  mongoDbName: process.env.MONGO_DB_NAME || 'test',
  oauth: {
    clientId: process.env.OAUTH_CLIENT_ID || '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.OAUTH_REDIRECT_URI || '',
    tokenUrl: process.env.OAUTH_TOKEN_URL || '',
    authUrl: process.env.OAUTH_AUTH_URL || '',
    scopes: process.env.OAUTH_SCOPES || '',
    testUrl: process.env.OAUTH_TEST_URL || '',
  },
  flexRoot: process.env.FLEX_ROOT || 'https://staging.officernd.com',
});
