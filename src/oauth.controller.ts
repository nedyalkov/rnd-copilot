import { Controller, Get, Post, Query, Res, Req } from '@nestjs/common';
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
  async oauthReturn(@Req() req, @Res() res: Response) {
    const { code, org_slug, integrationId, locations } = req.query;
    const locationsArr = locations ? (locations as string).split(',').filter(Boolean) : undefined;
    await this.oauthService.exchangeCodeForToken(
      code as string,
      org_slug as string,
      integrationId as string,
      locationsArr,
    );

    // On successful connection:
    const flexRoot = this.configService.get<string>('flexRoot') || 'https://staging.officernd.com';
    return res.redirect(302, `${flexRoot}/connect/external-integration/return`);
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
