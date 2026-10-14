import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type CookieOptions, type Request, type Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthResult } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.setSession(res, await this.auth.login(dto));
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.setSession(
      res,
      await this.auth.refresh(
        this.cookie(req, 'refresh_token'),
        req.get('x-csrf-token'),
      ),
    );
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = this.cookie(req, 'refresh_token');
    await this.auth.validateSession(refreshToken, req.get('x-csrf-token'));
    await this.auth.logout(refreshToken);
    res.clearCookie('refresh_token', this.cookieOptions(true, false));
    res.clearCookie('csrf_token', this.cookieOptions(false, false));
    return { success: true };
  }

  private setSession(res: Response, result: AuthResult) {
    res.cookie('refresh_token', result.refreshToken, this.cookieOptions(true));
    res.cookie('csrf_token', result.csrfToken, this.cookieOptions(false));
    return { accessToken: result.accessToken, user: result.user };
  }

  private cookieOptions(httpOnly: boolean, persistent = true): CookieOptions {
    return {
      httpOnly,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: httpOnly ? '/api/auth' : '/',
      ...(persistent ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
    };
  }

  private cookie(req: Request, name: string): string | undefined {
    const value = (req.cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
