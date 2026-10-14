import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User } from './user.schema';

@Injectable()
export class BootstrapUserService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BootstrapUserService.name);

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const username = this.config.get<string>('INITIAL_USERNAME');
    const password = this.config.get<string>('INITIAL_PASSWORD');
    if (!username || !password) return;

    const normalizedUsername = username.toLowerCase();
    if (await this.users.exists({ username: normalizedUsername })) return;

    try {
      await this.users.create({
        username: normalizedUsername,
        passwordHash: await bcrypt.hash(password, 12),
      });
      this.logger.log(`Initial user "${normalizedUsername}" was created`);
    } catch (error: unknown) {
      // Concurrent serverless cold starts can both pass the existence check.
      // The unique index is authoritative; another invocation created the user.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        return;
      }
      throw error;
    }
  }
}
