import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  VEHICLE_CACHE_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  EMAIL_VERIFY_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(24),
  EMAIL_PROVIDER: z.enum(['test', 'resend']).default('test'),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM: z.string().min(3).max(320).optional(),
  ACCOUNT_WEB_URL: z.string().url().optional(),
  AUTH_LOGIN_ACCOUNT_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_LOGIN_IP_LIMIT: z.coerce.number().int().min(1).max(500).default(30),
  AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  AUTH_REGISTER_IP_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_REGISTER_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  AUTH_REFRESH_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(120),
  AUTH_REFRESH_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  AUTH_ACCOUNT_ACTION_ACCOUNT_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  AUTH_ACCOUNT_ACTION_IP_LIMIT: z.coerce.number().int().min(1).max(500).default(20),
  AUTH_ACCOUNT_ACTION_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(3600),
  AUTH_LIMIT_NAMESPACE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default('default'),
  INTERNAL_API_KEY: z.string().min(24),
  VIN_DECODER_URL: z.string().url(),
  HISTORY_SERVICE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const data = parsed.data;
if (data.NODE_ENV === 'production') {
  const deliveryErrors = {};
  if (data.EMAIL_PROVIDER !== 'resend')
    deliveryErrors.EMAIL_PROVIDER = ['Must be resend in production'];
  if (!data.RESEND_API_KEY) deliveryErrors.RESEND_API_KEY = ['Required in production'];
  if (!data.EMAIL_FROM) deliveryErrors.EMAIL_FROM = ['Required in production'];
  if (Object.keys(deliveryErrors).length > 0) {
    console.error('Invalid production email configuration', deliveryErrors);
    process.exit(1);
  }
}
export const env = { ...data, ACCOUNT_WEB_URL: data.ACCOUNT_WEB_URL ?? data.WEB_ORIGIN };
