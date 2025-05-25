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

  async getIntegrationResponse(integration: OAuthToken): Promise<IntegrationResponse> {
    const { flexRoot } = this.cfg; // Use the injected configuration
    const { orgSlug, integrationId, accessToken } = integration; // Destructure to get orgSlug and integrationId
    const url = `${flexRoot}/api/v2/organizations/${orgSlug}/integrations/${integrationId}`;
    try {
      const response = await this.httpService
        .get<IntegrationResponse>(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .toPromise();

      if (!response || !response.data) {
        throw new Error('No response data from integration endpoint');
      }
      return response.data;
    } catch (error) {
      console.error('Failed to fetch integration response:', error);
      throw error; // Re-throw to handle it in the calling function
    }
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
    // Get the latest valid token for this orgSlug
    const token = await this.oauthModel
      .findOne({ orgSlug, integrationId })
      .sort({ expiresAt: -1 })
      .exec();
    if (!token) return;
    try {
      const integrationResp = await this.getIntegrationResponse(token);

      const secret = integrationResp?.settings?.secret;
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

    console.log('Refreshing token with refreshToken:', refreshToken);

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

  async getValidToken(orgSlug: string, integrationId: string): Promise<OAuthToken | null> {
    console.log('Getting valid token for orgSlug:', orgSlug, 'integrationId:', integrationId);
    const token = await this.oauthModel
      .findOne({
        orgSlug,
        integrationId,
      })
      .sort({ expiresAt: -1 })
      .exec();

    console.log('Retrieved token:', token);
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
    let token: OAuthToken | null = null;
    if (orgSlug && integrationId) {
      token = await this.getValidToken(orgSlug, integrationId);
    }
    // If no token found, return not connected
    if (!token) return { connected: false, message: 'No valid token found' };

    try {
      const response = await this.getIntegrationResponse(token);
      console.log('Integration response:', response);
      return { connected: true };
    } catch (err) {
      return { connected: false, message: (err as Error)?.message || 'Unknown error' };
    }
  }
}
