import type { OpenRouteHandler } from './open.type';
import { clientService } from '@services/client.service';
import { mobileService } from '@services/mobile.service';
import { userService } from '@services/user.common.service';
import { success } from '@utils/response.utils';

export const clientStatus: OpenRouteHandler<'clientStatus'> = async (c) => {
  const { clientCode } = c.req.valid('query');
  const data = await clientService.getClientByCode(clientCode);
  return c.json(success(data));
};

export const userInfo: OpenRouteHandler<'userInfo'> = async (c) => {
  const { username } = c.req.valid('query');
  const data = await userService.getUserDetailByUsername(username);
  return c.json(success(data));
};

export const codeSend: OpenRouteHandler<'codeSend'> = async (c) => {
  const { phoneNumber, usage } = c.req.valid('json');
  const data = await mobileService.sendCode(phoneNumber, usage);
  return c.json(success(data));
};

export const codeVerify: OpenRouteHandler<'codeVerify'> = async (c) => {
  const { phoneNumber, usage, code } = c.req.valid('json');
  const data = await mobileService.cehckVerificationCode(usage, phoneNumber, code);
  return c.json(success({ result: data }));
};

export const passwordReset: OpenRouteHandler<'passwordReset'> = async (c) => {
  const { username, phoneNumber, code, newPassword } = c.req.valid('json');
  const data = await userService.resetPassword(username, phoneNumber, code, newPassword);
  return c.json(success(data));
};
