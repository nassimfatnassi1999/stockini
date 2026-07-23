import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductQueryDto } from './product.dto';

describe('ProductQueryDto pagination', () => {
  it('utilise page=1 et limit=10 par défaut', async () => {
    const dto = plainToInstance(ProductQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(10);
  });

  it.each([10, 20, 30, 50, 100])('accepte la limite %i', async (limit) => {
    const dto = plainToInstance(ProductQueryDto, { page: '2', limit: String(limit) });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual(expect.objectContaining({ page: 2, limit }));
  });

  it.each([
    { page: '0', limit: '10' },
    { page: '-1', limit: '10' },
    { page: '1', limit: '5' },
    { page: '1', limit: '101' },
    { page: 'abc', limit: '10' },
  ])('refuse les paramètres invalides %#', async (input) => {
    const errors = await validate(plainToInstance(ProductQueryDto, input));
    expect(errors.length).toBeGreaterThan(0);
  });
});
