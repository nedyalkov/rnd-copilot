import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuthToken } from './oauth.schema';
import configuration from './config/configuration';
import { AxiosError } from 'axios';

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
  ) {}

  async exchangeCodeForToken(
    code: string,
    orgSlug?: string,
    integrationId?: string,
    locations?: string[],
  ): Promise<OAuthToken> {
    try {
      const config = configuration().oauth;
      const clientId = config.clientId;
      const clientSecret = config.clientSecret;
      const redirectUri = config.redirectUri;
      const tokenUrl = config.tokenUrl;

      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      const data = params.toString();
      console.log('Executing: ', tokenUrl, data);
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
      // After saving the token, fetch and store the integration secret
      if (orgSlug && integrationId) {
        await this.fetchAndStoreIntegrationSecret(orgSlug, integrationId);
      }
      return token;
    } catch (error) {
      if (error instanceof AxiosError) {
        // console.error('Error exchanging code for token:', error.response);
        console.error('Error exchanging code for token:', error.response?.data);
      }
      throw new Error('Failed to exchange code for token');
    }
  }

  async fetchAndStoreIntegrationSecret(orgSlug: string, integrationId: string): Promise<void> {
    const config = configuration();
    const flexRoot = config.flexRoot;
    // Get the latest valid token for this orgSlug
    const token = await this.oauthModel
      .findOne({ orgSlug, integrationId })
      .sort({ expiresAt: -1 })
      .exec();
    if (!token) return;
    const accessToken = token.accessToken;
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
    } catch {
      // Handle error (log, fail, etc.)
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const config = configuration().oauth;
    const clientId = config.clientId;
    const clientSecret = config.clientSecret;
    const tokenUrl = config.tokenUrl;

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

  async checkConnection(): Promise<boolean> {
    const token = await this.getValidToken();
    if (!token) return false;
    const testUrl = configuration().oauth.testUrl;
    try {
      await this.httpService.axiosRef.get(testUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return true;
    } catch {
      return false;
    }
  }
}
