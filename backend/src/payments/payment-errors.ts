import { HttpException, HttpStatus } from '@nestjs/common';

export type PaymentErrorCode =
  | 'INVALID_PAYMENT_AMOUNT'
  | 'PAYMENT_NOT_ALLOWED'
  | 'SALE_NOT_FOUND'
  | 'RELATED_ENTITY_NOT_FOUND'
  | 'PAYMENT_CONFLICT'
  | 'PAYMENT_PROCESSING_FAILED';

export class PaymentHttpException extends HttpException {
  constructor(
    statusCode: HttpStatus,
    code: PaymentErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super({ statusCode, code, message, details }, statusCode);
  }
}
