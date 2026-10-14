import express from 'express';
import { NestFactory } from '@nestjs/core';
import { createApp } from './src/app.factory';

const server = express();
let initialized: Promise<void>;

// Vercel discovers Nest services from the entrypoint's direct imports.
void NestFactory;

// The gate keeps the first cold-start request from reaching Nest before it
// finished applying middleware and routes.
server.use((_, __, next) => {
  void initialized.then(() => next()).catch(next);
});

initialized = createApp(server).then(async (app) => {
  await app.init();
});

export default server;
