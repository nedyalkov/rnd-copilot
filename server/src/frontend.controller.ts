import { Controller, Get, Param, Res, Inject } from '@nestjs/common';
import { Response } from 'express';
import { existsSync } from 'fs';
import { CONFIGURATION_KEY, Configuration } from './config/configuration';

@Controller(':orgSlug')
export class FrontendController {
  constructor(@Inject(CONFIGURATION_KEY) private readonly cfg: Configuration) {}

  @Get()
  serveFrontend(@Param('orgSlug') orgSlug: string, @Res() res: Response) {
    // Serve the built Vite index.html from the client/dist directory
    const indexPath = this.cfg.frontend.indexPath;
    if (existsSync(indexPath)) {
      return res.sendFile(indexPath);
    } else {
      return res
        .status(503)
        .send(
          'Frontend not built and Vite dev server is not running. Please run `cd ../rnd-copilot-client && npm run dev` or `npm run build`.',
        );
    }
  }
}
