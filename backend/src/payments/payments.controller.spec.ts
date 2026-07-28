import { ForbiddenException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';

describe('PaymentsController accepted difference permission', () => {
  const paymentsService = { paySale: jest.fn() } as any;
  const controller = new PaymentsController(paymentsService);
  const dto = {
    amountReceived: 90,
    method: 'CASH' as any,
    acceptAsFullyPaid: true,
  };

  beforeEach(() => jest.clearAllMocks());

  it('retourne 403 sans payments.accept_difference', () => {
    expect(() => controller.paySale('sale-1', dto, {
      id: 'cashier-1',
      email: 'cashier@example.test',
      role: 'CASHIER',
      permissions: ['payments.receive_client_payment'],
    })).toThrow(ForbiddenException);
    expect(paymentsService.paySale).not.toHaveBeenCalled();
  });

  it('autorise explicitement payments.accept_difference', () => {
    controller.paySale('sale-1', dto, {
      id: 'manager-1',
      email: 'manager@example.test',
      role: 'SELLER',
      permissions: ['payments.receive_client_payment', 'payments.accept_difference'],
    });
    expect(paymentsService.paySale).toHaveBeenCalledWith('sale-1', dto, 'manager-1');
  });
});
