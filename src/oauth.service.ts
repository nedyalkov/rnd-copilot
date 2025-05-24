import { Inject, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuthToken } from './oauth.schema';
import { AxiosError } from 'axios';
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
    orgSlug?: string,
    integrationId?: string,
    locations?: string[],
  ): Promise<OAuthToken> {
    const token = await this.exchangeCodeForToken(code, orgSlug, integrationId, locations);
    if (orgSlug && integrationId) {
      await this.fetchAndStoreIntegrationSecret(orgSlug, integrationId);
    }
    return token;
  }

  async exchangeCodeForToken(
    code: string,
    orgSlug?: string,
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
        orgSlug,
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

  async fetchAndStoreIntegrationSecret(orgSlug: string, integrationId: string): Promise<void> {
    const flexRoot = this.cfg.flexRoot; // Use the injected configuration
    // Get the latest valid token for this orgSlug
    const token = await this.oauthModel
      .findOne({ orgSlug, integrationId })
      .sort({ expiresAt: -1 })
      .exec();
    if (!token) return;
    const { accessToken } = token;
    try {
      const integrationResp = await this.httpService
        .get<IntegrationResponse>(
          `${flexRoot}/api/v2/organizations/${orgSlug}/integrations/${integrationId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .toPromise();

      const secret = integrationResp?.data?.settings?.secret;
      // Store secret in the DB (extend schema/service as needed)
      if (secret) {
        await this.oauthModel.updateOne(
          { orgSlug, integrationId },
          { $set: { integrationSecret: secret } },
        );
      }
    } catch (error) {
      console.error('Failed to fetch integration secret', error);
      throw error; // Re-throw to handle it in the calling function
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const { clientId, clientSecret, tokenUrl } = this.cfg.oauth;

    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }
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
    const expiresAt = new Date(Date.now() + expires_in * 1000);
    const token = new this.oauthModel({
      accessToken: String(access_token),
      refreshToken: String(refresh_token),
      expiresAt,
    });
    await token.save();
    return token;
  }

  async getValidToken(): Promise<OAuthToken | null> {
    const token = await this.oauthModel.findOne().sort({ expiresAt: -1 }).exec();
    if (!token) return null;
    if (token.expiresAt.getTime() < Date.now()) {
      return this.refreshToken(token.refreshToken);
    }
    return token;
  }

  async checkConnection(
    orgSlug?: string,
    integrationId?: string,
  ): Promise<{ connected: boolean; message?: string }> {
    // If orgSlug and integrationId are provided, use them for token lookup
    let token: OAuthToken | null;
    if (orgSlug && integrationId) {
      token = await this.oauthModel
        .findOne({ orgSlug, integrationId })
        .sort({ expiresAt: -1 })
        .exec();
    } else {
      token = await this.getValidToken();
    }
    if (!token) return { connected: false, message: 'No valid token found' };
    const testUrl = `${this.cfg.flexRoot}/api/v2/organizations/${token.orgSlug}/integrations/${token.integrationId}`;
    try {
      await this.httpService
        .get(testUrl, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        })
        .toPromise();
      return { connected: true };
    } catch (err) {
      return { connected: false, message: (err as Error)?.message || 'Unknown error' };
    }
  }
}
