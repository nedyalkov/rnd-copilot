import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuthToken } from './oauth.schema';
import { AxiosError, AxiosResponse } from 'axios';
import { Configuration, CONFIGURATION_KEY } from './config/configuration';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface IntegrationSettings {
  secret?: string;
  [key: string]: any;
}

interface IntegrationResponse {
  settings?: IntegrationSettings;
  [key: string]: any;
}

interface AccountResponse {
  _id: string;
  name: string;
  slug: string;
}

interface FlexApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  accessToken?: string;
  query?: Record<string, string | number | boolean | undefined>;
  data?: any;
  version?: string;
}

const DEFAULT_OPTIONS: FlexApiOptions = {
  version: 'v2',
};

@Injectable()
export class OauthService {
  constructor(
    @InjectModel(OAuthToken.name) private oauthModel: Model<OAuthToken>,
    private readonly httpService: HttpService,
    @Inject(CONFIGURATION_KEY)
    private readonly cfg: Configuration, // Inject the configuration
  ) {}

  async connectIntegration(
    code: string,
    accountSlug?: string,
    integrationId?: string,
    locations?: string[],
  ): Promise<OAuthToken> {
    if (accountSlug && integrationId) {
      const token = await this.exchangeCodeForToken(code, accountSlug, integrationId, locations);
      await this.fetchAndStoreIntegrationDetails(token);
      return token;
    }
    throw new Error('Invalid accountSlug or integrationId');
  }

  // Private method to call Flex API with error handling and authorization
  private async callFlexApi<T>(
    accountSlug: string,
    path: string,
    options: FlexApiOptions = DEFAULT_OPTIONS,
  ): Promise<T | undefined> {
    options = { ...DEFAULT_OPTIONS, ...options };
    const { flexRoot } = this.cfg;
    let url: string = `${flexRoot}/api/${options.version}/organizations/${accountSlug}${path}`;
    if (options.query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) params.append(key, String(value));
      }
      url += `?${params.toString()}`;
    }
    const method: string = options.method || 'GET';
    try {
      const reqOptions = {
        headers: { Authorization: `Bearer ${options.accessToken}` },
      };
      let response: AxiosResponse<T> | undefined;
      if (method === 'GET') {
        response = await this.httpService.get<T>(url, reqOptions).toPromise();
      } else if (method === 'POST') {
        response = await this.httpService.post<T>(url, options.data, reqOptions).toPromise();
      } else if (method === 'PUT') {
        response = await this.httpService.put<T>(url, options.data, reqOptions).toPromise();
      } else if (method === 'DELETE') {
        response = await this.httpService.delete<T>(url, reqOptions).toPromise();
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
      return response?.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error(
          `Flex API AxiosError [${method} ${url}]:`,
          JSON.stringify(error.response?.data, null, 2),
        );
        throw new Error(`Flex API error: ${JSON.stringify(error.response?.data)}`);
      }
      console.error(`Failed to call Flex API [${method} ${url}]:`, error);
      throw error;
    }
  }

  private async getAccountResponse(integration: OAuthToken): Promise<AccountResponse> {
    const { accountSlug, accessToken } = integration;
    const accountResponse = await this.callFlexApi<AccountResponse>(accountSlug || '', '', {
      version: 'v1',
      accessToken,
    });

    if (!accountResponse) {
      throw new NotFoundException('No response from account endpoint');
    }

    return accountResponse;
  }

  private async getIntegrationResponse(integration: OAuthToken): Promise<IntegrationResponse> {
    const { accountSlug, integrationId, accessToken } = integration;
    const integrationResponse = await this.callFlexApi<IntegrationResponse>(
      accountSlug || '',
      `/integrations/${integrationId}`,
      { accessToken },
    );

    if (!integrationResponse) {
      throw new NotFoundException('No response from integration endpoint');
    }

    return integrationResponse;
  }

  async exchangeCodeForToken(
    code: string,
    accountSlug?: string,
    integrationId?: string,
    locations?: string[],
  ): Promise<OAuthToken> {
    try {
      const { clientId, clientSecret, tokenUrl, redirectUri } = this.cfg.oauth;

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      const data = params.toString();
      const response = await this.httpService
        .post<TokenResponse>(tokenUrl, data, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        .toPromise();
      if (!response) throw new Error('No response from token endpoint');
      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);
      const token = new this.oauthModel({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt,
        accountSlug,
        integrationId,
        locations,
      });
      await token.save();

      return token;
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('Error exchanging code for token:', error.response?.data);
      }
      throw new Error('Failed to exchange code for token');
    }
  }

  async fetchAndStoreIntegrationDetails(token: OAuthToken): Promise<void> {
    try {
      console.log('Fetching integration secret for token:', token);
      const [accountResp, integrationResp] = await Promise.all([
        this.getAccountResponse(token),
        this.getIntegrationResponse(token),
      ]);

      if (!accountResp || !integrationResp) {
        throw new NotFoundException('No response from account or integration endpoint');
      }

      const secret = integrationResp?.settings?.secret;
      // Store secret in the DB (extend schema/service as needed)
      if (secret) {
        await this.oauthModel.updateOne(
          { _id: token._id },
          {
            $set: {
              integrationSecret: secret,
              accountId: accountResp._id,
              accountName: accountResp.name,
            },
          },
        );
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('Error fetching integration secret:', error.response?.data);
        throw new Error('Failed to fetch integration secret: ' + error.response?.data);
      } else {
        console.error('Failed to fetch integration secret', error);
        throw error; // Re-throw to handle it in the calling function
      }
    }
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const { clientId, clientSecret, tokenUrl } = this.cfg.oauth;

    console.log('Refreshing token with refreshToken:', refreshToken);

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      const data = params.toString();

      const response = await this.httpService
        .post<TokenResponse>(tokenUrl, data, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        .toPromise();
      if (!response) throw new Error('No response from token endpoint');
      const { access_token, refresh_token, expires_in } = response.data;

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        console.error('Error refreshing token:', error.response?.data);
        throw new Error('Failed to refresh token: ' + error.response?.data);
      } else {
        console.error('Error refreshing token:', error);
        throw new Error('Failed to refresh token');
      }
    }
  }

  private getSearchQuery(
    accountSlug?: string,
    accountId?: string,
  ): { accountId: string } | { accountSlug: string } {
    if (accountId) {
      return { accountId };
    } else if (accountSlug) {
      return { accountSlug };
    }
    throw new Error('Invalid accountSlug or accountId');
  }

  async getRawToken(accountSlug?: string, accountId?: string): Promise<OAuthToken | null> {
    console.log('Getting a token for accountSlug:', accountSlug, 'accountId:', accountId);
    const token = await this.oauthModel
      .findOne(this.getSearchQuery(accountSlug, accountId))
      .sort({ expiresAt: -1 })
      .exec();

    return token;
  }

  async getValidToken(accountSlug?: string, accountId?: string): Promise<OAuthToken | null> {
    const token = await this.getRawToken(accountSlug, accountId);
    if (!token) return null;
    if (token.expiresAt.getTime() < Date.now()) {
      const newTokenInfo = await this.refreshToken(token.refreshToken);

      token.accessToken = newTokenInfo.accessToken;
      token.refreshToken = newTokenInfo.refreshToken;
      token.expiresAt = newTokenInfo.expiresAt;

      await token.save();
      console.log('Token refreshed:', token);
    }
    return token;
  }

  async checkConnection(
    accountSlug?: string,
    accountId?: string,
  ): Promise<{
    accountName: string;
  }> {
    let token: OAuthToken | null = null;
    if (accountSlug && accountId) {
      token = await this.getValidToken(accountSlug, accountId);
    }
    // If no token found, return not connected
    if (!token) throw new NotFoundException('No valid token found');

    const account = await this.getAccountResponse(token);
    if (!account) throw new NotFoundException('No account found');

    return { accountName: token.accountName };
  }
}
