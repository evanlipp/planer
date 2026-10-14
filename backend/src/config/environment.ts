function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const jwtSecret = requireValue(
    'JWT_SECRET',
    config.JWT_SECRET as string | undefined,
  );
  if (jwtSecret.length < 32)
    throw new Error('JWT_SECRET must contain at least 32 characters');

  const frontendOrigins = requireValue(
    'FRONTEND_ORIGINS',
    config.FRONTEND_ORIGINS as string | undefined,
  );
  for (const origin of frontendOrigins
    .split(',')
    .map((value) => value.trim())) {
    try {
      const url = new URL(origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new Error(`FRONTEND_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  requireValue('MONGODB_URI', config.MONGODB_URI as string | undefined);

  const initialUsername = config.INITIAL_USERNAME as string | undefined;
  const initialPassword = config.INITIAL_PASSWORD as string | undefined;
  if (Boolean(initialUsername) !== Boolean(initialPassword)) {
    throw new Error(
      'INITIAL_USERNAME and INITIAL_PASSWORD must be set together',
    );
  }
  if (initialUsername && !/^[a-zA-Z0-9_.-]{3,32}$/.test(initialUsername)) {
    throw new Error('INITIAL_USERNAME has an invalid format');
  }
  if (initialPassword && initialPassword.length < 12) {
    throw new Error('INITIAL_PASSWORD must contain at least 12 characters');
  }
  return config;
}

export function getAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
