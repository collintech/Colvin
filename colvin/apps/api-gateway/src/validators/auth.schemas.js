import { Buffer } from 'node:buffer';

import { z } from 'zod';

const email = z
  .string()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password must be at most 72 UTF-8 bytes',
  });

const accountToken = z.string().min(32).max(256);

export const registerSchema = z.object({
  body: z.object({ email, password }).strict(),
});

export const loginSchema = z.object({
  body: z.object({ email, password: z.string().min(1).max(128) }).strict(),
});

export const changePasswordSchema = z.object({
  body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(),
});

export const passwordResetRequestSchema = z.object({
  body: z.object({ email }).strict(),
});

export const passwordResetConfirmSchema = z.object({
  body: z.object({ token: accountToken, newPassword: password }).strict(),
});

export const verifyEmailSchema = z.object({
  body: z.object({ token: accountToken }).strict(),
});
