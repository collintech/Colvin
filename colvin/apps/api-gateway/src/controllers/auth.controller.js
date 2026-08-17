import * as authService from '../services/auth.service.js';
export async function register(req, res) {
  res.status(201).json({ success: true, data: await authService.register(req.body) });
}
export async function login(req, res) {
  res.json({ success: true, data: await authService.login(req.body) });
}
export async function refresh(req, res) {
  res.json({ success: true, data: await authService.refresh(req.body.refreshToken) });
}
export async function logout(req, res) {
  await authService.logout(req.body.refreshToken);
  res.status(204).send();
}
