import {
  Controller,
  Get,
  Inject,
  Query,
  Res,
  Redirect,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OauthService } from './oauth.service';
import { Response } from 'express';
import { Configuration, CONFIGURATION_KEY } from './config/configuration';
import { Transform } from 'class-transformer';
import { parseAndValidateSignature } from './signature.helper';
import { trim } from 'lodash';

export class FlexConfigureQueryDto {
  slug: string;

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',');
    }
    return [];
  })
  locations: string[];

  // HACK: Shouldn't be necessary but sometimes Flex sends us '"[value]"' instead of '[value]' due to
  // incorrect handling of ObjectId query params (e.g. happens for external integration dataSync).
  @Transform(({ value }) => trim(value as string, '"'))
  organizationId: string;

  memberId: string;
  userId: string;

  signature: string;
}

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

  private async validateSignature(query: FlexConfigureQueryDto): Promise<void> {
    const { slug, organizationId } = query;
    const token = await this.oauthService.getRawToken(slug, organizationId);
    if (!token) {
      throw new NotFoundException('OAuth integration not found for this organization.');
    }
    const secret = token.integrationSecret;
    const { signature, ...payload } = query;
    parseAndValidateSignature(payload, signature, secret);
  }

  @Get('start')
  start(@Res() res: Response) {
    const { clientId, redirectUri, authUrl, scopes } = this.cfg.oauth;
    const url = `${authUrl}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&scope=${encodeURIComponent(scopes)}`;
    res.redirect(url);
  }

  @Get('return')
  @Redirect()
  async oauthReturn(@Query() query: OauthReturnQueryDto) {
    const { code, org_slug, integrationId, locations } = query;
    const locationsArray = locations ? locations.split(',') : [];
    await this.oauthService.connectIntegration(code, org_slug, integrationId, locationsArray);

    // On successful connection:
    const flexRoot = this.cfg.flexRoot;
    return { url: `${flexRoot}/connect/external-integration/return`, statusCode: 302 };
  }

  @Get('check')
  async check(@Query() query: FlexConfigureQueryDto) {
    console.log('query', JSON.stringify(query));
    await this.validateSignature(query);
    return this.oauthService.checkConnection(query.slug, query.organizationId);
  }

  @Get('configure')
  @Redirect()
  async configure(@Query() query: FlexConfigureQueryDto) {
    try {
      await this.validateSignature(query);
      const { organizationId, slug } = query;
      // Check if OAuth item exists
      const token = await this.oauthService.getValidToken(slug, organizationId);

      if (!token) {
        throw new NotFoundException('OAuth integration not found for this organization');
      }
      return { url: `/${slug}`, statusCode: 302 };
    } catch (error) {
      console.error('Error during OAuth configuration:', error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('An error occurred while configuring the OAuth integration.');
    }
  }
}
