import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuthToken } from './oauth.schema';
import configuration from './config/configuration';
import * as qs from 'qs';

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
    const config = configuration().oauth;
    const clientId = config.clientId;
    const clientSecret = config.clientSecret;
    const redirectUri = config.redirectUri;
    const tokenUrl = config.tokenUrl;

    interface TokenResponse {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }
    const data = qs.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await this.httpService.axiosRef.post<TokenResponse>(tokenUrl, data, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
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
    const data = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    });
    const response = await this.httpService.axiosRef.post<TokenResponse>(tokenUrl, data, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
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
