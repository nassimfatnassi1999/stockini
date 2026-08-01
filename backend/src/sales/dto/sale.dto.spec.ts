import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSaleDto } from './sale.dto';

describe('UpdateSaleDto', () => {
  it.each([undefined, false, true])('accepts acceptAsFullyPaid=%s', async (acceptAsFullyPaid) => {
    const dto = plainToInstance(UpdateSaleDto, { acceptAsFullyPaid });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-boolean acceptAsFullyPaid value', async () => {
    const dto = plainToInstance(UpdateSaleDto, { acceptAsFullyPaid: 'true' });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'acceptAsFullyPaid')).toBe(true);
  });

  it('accepts a positive paymentAmount and rejects a non numeric value', async () => {
    expect(await validate(plainToInstance(UpdateSaleDto, { paymentAmount: 40 }))).toHaveLength(0);
    const errors = await validate(plainToInstance(UpdateSaleDto, { paymentAmount: 'invalid' }));
    expect(errors.some((error) => error.property === 'paymentAmount')).toBe(true);
  });
});
