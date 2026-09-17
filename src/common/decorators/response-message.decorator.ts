import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'response_message';
export const BYPASS_INTERCEPTOR_KEY = 'bypass_interceptor';

export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

export const BypassInterceptor = () =>
  SetMetadata(BYPASS_INTERCEPTOR_KEY, true);
