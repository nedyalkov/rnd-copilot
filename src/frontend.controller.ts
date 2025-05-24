import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { HttpService } from '@nestjs/axios';

@Controller(':orgSlug')
export class FrontendController {
  constructor(private readonly httpService: HttpService) {}

  @Get()
  async serveFrontend(@Param('orgSlug') orgSlug: string, @Res() res: Response) {
    // Serve the built Vite index.html from the client/dist directory
    const indexPath = join(process.cwd(), 'client', 'dist', 'index.html');
    if (existsSync(indexPath)) {
      return res.sendFile(indexPath);
    } else {
      // If not built, try to fetch from Vite dev server using HttpService
      try {
        const viteRes = await this.httpService.get('http://localhost:5173').toPromise();
        res.setHeader('Content-Type', 'text/html');
        return res.send(viteRes?.data);
      } catch {
        return res
          .status(503)
          .send(
            'Frontend not built and Vite dev server is not running. Please run `cd client && npm run dev` or `npm run build`.',
          );
      }
    }
  }
}
