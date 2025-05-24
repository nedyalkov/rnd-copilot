import { Controller, Get, Inject, Post, Query, Res } from '@nestjs/common';
import { OauthService } from './oauth.service';
import { Response } from 'express';
import { Configuration, CONFIGURATION_KEY } from './config/configuration';

// DTO for OAuth return query params
export class OauthReturnQueryDto {
  code: string;
  org_slug: string;
  integrationId: string;
  locations?: string;
}

@Controller('oauth')
export class OauthController {
  constructor(
    private readonly oauthService: OauthService,
    @Inject(CONFIGURATION_KEY)
    private readonly cfg: Configuration,
  ) {}

  @Get('start')
  start(@Res() res: Response) {
    const { clientId, redirectUri, authUrl, scopes } = this.cfg.oauth;
    const url = `${authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&scope=${encodeURIComponent(scopes)}`;
    res.redirect(url);
  }

  @Get('return')
  async oauthReturn(@Query() query: OauthReturnQueryDto, @Res() res: Response) {
    const { code, org_slug, integrationId, locations } = query;
    const locationsArr = locations ? locations.split(',').filter(Boolean) : undefined;
    await this.oauthService.connectIntegration(code, org_slug, integrationId, locationsArr);

    // On successful connection:
    const flexRoot = this.cfg.flexRoot;
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
