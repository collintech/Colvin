import { Buffer } from 'node:buffer';

import { z } from 'zod';

const email = z
  .string()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(12, 'Password must contain at least 12 characters')
  .max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password is too long for the configured password hashing algorithm',
  });

export const registerSchema = z.object({
  body: z.object({ email, password }).strict(),
});

export const loginSchema = z.object({
  body: z
    .object({
      email,
      password: z.string().min(1).max(128),
    })
    .strict(),
});
