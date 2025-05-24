import { Controller, Get, Post, Query, Res } from '@nestjs/common';
import { OauthService } from './oauth.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Controller('oauth')
export class OauthController {
  constructor(
    private readonly oauthService: OauthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('start')
  start(@Res() res: Response) {
    const clientId = this.configService.get<string>('OAUTH_CLIENT_ID') ?? '';
    const redirectUri = this.configService.get<string>('OAUTH_REDIRECT_URI') ?? '';
    const authUrl = this.configService.get<string>('OAUTH_AUTH_URL') ?? '';
    const scopes = this.configService.get<string>('OAUTH_SCOPES') ?? '';
    const url = `${authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&scope=${encodeURIComponent(scopes)}`;
    res.redirect(url);
  }

  @Get('return')
  async oauthReturn(
    @Query('code') code: string,
    @Query('org_slug') orgSlug?: string,
    @Query('integrationId') integrationId?: string,
    @Query('locations') locations?: string,
  ) {
    const locationsArr = locations ? locations.split(',').filter(Boolean) : undefined;
    return this.oauthService.exchangeCodeForToken(code, orgSlug, integrationId, locationsArr);
  }

  @Get('check')
  async check() {
    return { valid: await this.oauthService.checkConnection() };
  }

  @Post('refresh')
  async refresh(@Query('refresh_token') refreshToken: string) {
    return this.oauthService.refreshToken(refreshToken);
  }
}
