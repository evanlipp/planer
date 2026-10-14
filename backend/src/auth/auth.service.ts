import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { LoginDto } from './dto/login.dto';
import { User, UserDocument } from '../users/user.schema';

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: { id: string; username: string };
};

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users
      .findOne({ username: dto.username.toLowerCase() })
      .select('+passwordHash');
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.createSession(user);
  }

  async refresh(
    refreshToken: string | undefined,
    csrfToken: string | undefined,
  ) {
    const user = await this.validateSession(refreshToken, csrfToken);
    return this.createSession(user);
  }

  async validateSession(
    refreshToken: string | undefined,
    csrfToken: string | undefined,
  ): Promise<UserDocument> {
    if (!refreshToken || !csrfToken)
      throw new UnauthorizedException('Session expired');
    const user = await this.users
      .findOne({ refreshTokenHash: this.hashToken(refreshToken) })
      .select('+csrfTokenHash');
    if (!user || !this.tokensMatch(user.csrfTokenHash, csrfToken)) {
      throw new UnauthorizedException('Session expired');
    }
    return user;
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.users.updateOne(
      { refreshTokenHash: this.hashToken(refreshToken) },
      { $unset: { refreshTokenHash: 1, csrfTokenHash: 1 } },
    );
  }

  private async createSession(user: UserDocument): Promise<AuthResult> {
    const refreshToken = randomBytes(48).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    await this.users.updateOne(
      { _id: user._id },
      {
        $set: {
          refreshTokenHash: this.hashToken(refreshToken),
          csrfTokenHash: this.hashToken(csrfToken),
        },
      },
    );
    const accessToken = this.jwt.sign({
      sub: user.id,
      username: user.username,
    });
    return {
      accessToken,
      refreshToken,
      csrfToken,
      user: { id: user.id, username: user.username },
    };
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private tokensMatch(expectedHash: string | undefined, actualToken: string) {
    if (!expectedHash) return false;
    return timingSafeEqual(
      Buffer.from(expectedHash),
      Buffer.from(this.hashToken(actualToken)),
    );
  }
}
