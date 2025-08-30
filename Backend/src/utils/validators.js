const { z } = require('zod');

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(100),
  password: z.string().min(6).max(72)
});

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(72)
});

const noteCreateSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(10000).optional().or(z.literal(''))
});

const noteUpdateSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(10000).optional().or(z.literal(''))
});

module.exports = {
  registerSchema,
  loginSchema,
  noteCreateSchema,
  noteUpdateSchema
};
