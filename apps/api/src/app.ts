import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './common/errors.js';
import { requestId } from './common/request-id.js';
import { healthRouter } from './modules/health/health.router.js';
import { authRouter } from './modules/auth/auth.router.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestId);
app.use(pinoHttp({ logger, genReqId: (req) => req.headers['x-request-id']?.toString() }));
app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/v1', (_req, res) => res.json({ data: { name: 'SupplyFlow API', version: 'v1' } }));
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', authRouter);
app.use(notFoundHandler);
app.use(errorHandler);

