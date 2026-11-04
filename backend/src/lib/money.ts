import { Decimal } from 'decimal.js';

export function dec(value: unknown): Decimal {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value as Decimal.Value);
}

export function nullableDec(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  return new Decimal(value as Decimal.Value);
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return new Decimal(value as Decimal.Value).toNumber();
}

export function round(value: Decimal, places = 2): number {
  return value.toDecimalPlaces(places).toNumber();
}

export function realizedPnl(input: {
  direction: 'long' | 'short';
  quantity: Decimal.Value;
  entry_price: Decimal.Value;
  exit_price: Decimal.Value;
  fees: Decimal.Value;
}): Decimal {
  const qty = dec(input.quantity);
  const entry = dec(input.entry_price);
  const exit = dec(input.exit_price);
  const fees = dec(input.fees);
  const gross =
    input.direction === 'long' ? exit.minus(entry).times(qty) : entry.minus(exit).times(qty);
  return gross.minus(fees);
}
