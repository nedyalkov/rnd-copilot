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

import { trim } from 'lodash';
import { Transform } from 'class-transformer';

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  @Transform(({ value }) => trim(value, '"'))
  organizationId: string;

  memberId: string;
  signature: string;
  userId: string;
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
    const { slug, organizationId, userId, memberId, signature } = query;

    const token = await this.oauthService.getRawToken(slug, organizationId);
    if (!token) {
      throw new NotFoundException('OAuth integration not found for this organization.');
    }

    const secret = token.integrationSecret;

    // const hash = crypto
    //   .createHmac('sha256', secret)
    //   .update(userId + memberId)
    //   .digest('hex');

    console.log(
      'Validating signature for userId:',
      userId,
      'memberId:',
      memberId,
      'signature:',
      signature,
      'secret:',
      secret,
    );
    // const { clientSecret } = this.cfg.oauth;
    // const hash = crypto.createHmac('sha256', clientSecret).update(userId + memberId).digest('hex');
    // return true;
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
