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
  .regex(/[A-Z]/, 'Password requires an uppercase letter')
  .regex(/[a-z]/, 'Password requires a lowercase letter')
  .regex(/[0-9]/, 'Password requires a number');

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

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(20).max(4096) }).strict(),
});
