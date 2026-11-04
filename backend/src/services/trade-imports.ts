import { parse } from 'csv-parse/sync';
import type { Db } from '../db/types.js';
import { withIdentity } from '../db/types.js';
import { ApiError, notFound } from '../lib/errors.js';
import type { ApiErrorDetail } from '../lib/errors.js';
import type { EvidenceInput, TradeCreateInput } from './trades.js';
import { insertTradeInTransaction } from './trades.js';

export const TRADE_CSV_HEADERS = [
  'symbol',
  'direction',
  'quantity',
  'entry_price',
  'exit_price',
  'fees',
  'currency',
  'opened_at',
  'closed_at',
  'initial_risk_amount',
  'setup_note',
  'emotional_state',
] as const;

const MAX_IMPORT_ROWS = 500;
const CSV_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i;

type CsvRow = {
  record: string[];
  info: { lines: number };
};

interface NormalizedCsvTrade extends Omit<TradeCreateInput, 'fees' | 'evidence'> {
  fees: number;
  evidence: EvidenceInput[];
  row_number: number;
}

function invalidCsv(details: ApiErrorDetail[]): never {
  throw new ApiError(400, 'validation_error', 'Correct the highlighted CSV value.', details);
}

function csvRows(csvText: string): CsvRow[] {
  try {
    return parse(csvText, {
      bom: true,
      info: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
    }) as unknown as CsvRow[];
  } catch (error) {
    const line = (error as { lines?: number }).lines;
    invalidCsv([
      {
        ...(typeof line === 'number' && line > 0 ? { row: line } : { row: 1 }),
        field: 'csv_text',
        message: 'Check the commas, quotation marks, and line breaks in this row.',
      },
    ]);
  }
}

function numberCell(
  value: string,
  row: number,
  field: string,
  details: ApiErrorDetail[],
  options: { optional?: boolean; minimum?: number; minimumInclusive?: boolean } = {},
): number | undefined {
  const text = value.trim();
  if (text === '' && options.optional) return undefined;
  const number = Number(text);
  if (!Number.isFinite(number)) {
    details.push({ row, field, message: 'Enter a valid number.' });
    return undefined;
  }
  if (
    options.minimum !== undefined &&
    (options.minimumInclusive ? number < options.minimum : number <= options.minimum)
  ) {
    details.push({
      row,
      field,
      message: options.minimumInclusive
        ? 'Enter a number greater than or equal to zero.'
        : 'Enter a number greater than zero.',
    });
    return undefined;
  }
  return number;
}

function dateCell(
  value: string,
  row: number,
  field: string,
  details: ApiErrorDetail[],
  optional = false,
): string | undefined {
  const text = value.trim();
  if (text === '' && optional) return undefined;
  if (!CSV_DATE_TIME.test(text) || !Number.isFinite(Date.parse(text))) {
    details.push({
      row,
      field,
      message: 'Enter a date and time with a timezone, such as 2026-11-03T09:15:00Z.',
    });
    return undefined;
  }
  return new Date(text).toISOString();
}

function parseTradeRows(csvText: string): NormalizedCsvTrade[] {
  const records = csvRows(csvText);
  if (records.length === 0) {
    invalidCsv([
      { row: 1, field: 'header', message: 'Add the fixed CSV header and at least one trade row.' },
    ]);
  }

  const headerRecord = records[0];
  if (!headerRecord) {
    invalidCsv([
      { row: 1, field: 'header', message: 'Add the fixed CSV header and at least one trade row.' },
    ]);
  }
  const header = headerRecord.record.map((value) => value.trim());
  if (
    header.length !== TRADE_CSV_HEADERS.length ||
    TRADE_CSV_HEADERS.some((expected, index) => header[index] !== expected)
  ) {
    invalidCsv([
      {
        row: 1,
        field: 'header',
        message: `Use the supplied template with these columns in this order: ${TRADE_CSV_HEADERS.join(', ')}.`,
      },
    ]);
  }

  const dataRows = records.slice(1);
  if (dataRows.length === 0) {
    invalidCsv([
      { row: 2, field: 'csv_text', message: 'Add at least one trade row below the header.' },
    ]);
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    invalidCsv([
      {
        row: MAX_IMPORT_ROWS + 2,
        field: 'csv_text',
        message: `Import no more than ${MAX_IMPORT_ROWS} trades at once.`,
      },
    ]);
  }

  const details: ApiErrorDetail[] = [];
  const normalized: NormalizedCsvTrade[] = [];

  for (const [rowIndex, { record }] of dataRows.entries()) {
    const rowNumber = rowIndex + 2;
    if (record.length !== TRADE_CSV_HEADERS.length) {
      details.push({
        row: rowNumber,
        field: 'row',
        message: 'This row has a different number of values than the CSV template.',
      });
      continue;
    }
    const cells = Object.fromEntries(
      TRADE_CSV_HEADERS.map((key, index) => [key, record[index] ?? '']),
    ) as Record<(typeof TRADE_CSV_HEADERS)[number], string>;
    const symbol = cells.symbol.trim();
    const direction = cells.direction.trim().toLowerCase();
    const currency = cells.currency.trim().toUpperCase();

    if (!symbol) details.push({ row: rowNumber, field: 'symbol', message: 'Enter a symbol.' });
    else if (symbol.length > 32)
      details.push({ row: rowNumber, field: 'symbol', message: 'Use no more than 32 characters.' });
    if (direction !== 'long' && direction !== 'short') {
      details.push({ row: rowNumber, field: 'direction', message: 'Enter long or short.' });
    }
    if (!/^[A-Z0-9]{3,10}$/.test(currency)) {
      details.push({
        row: rowNumber,
        field: 'currency',
        message: 'Enter a 3 to 10 character currency code.',
      });
    }

    const quantity = numberCell(cells.quantity, rowNumber, 'quantity', details, { minimum: 0 });
    const entryPrice = numberCell(cells.entry_price, rowNumber, 'entry_price', details, {
      minimum: 0,
    });
    const exitPrice = numberCell(cells.exit_price, rowNumber, 'exit_price', details, {
      optional: true,
      minimum: 0,
    });
    const fees =
      numberCell(cells.fees, rowNumber, 'fees', details, {
        optional: true,
        minimum: 0,
        minimumInclusive: true,
      }) ?? 0;
    const initialRisk = numberCell(
      cells.initial_risk_amount,
      rowNumber,
      'initial_risk_amount',
      details,
      { optional: true, minimum: 0 },
    );
    const openedAt = dateCell(cells.opened_at, rowNumber, 'opened_at', details);
    const closedAt = dateCell(cells.closed_at, rowNumber, 'closed_at', details, true);

    if ((cells.exit_price.trim() === '') !== (cells.closed_at.trim() === '')) {
      details.push({
        row: rowNumber,
        field: cells.exit_price.trim() === '' ? 'exit_price' : 'closed_at',
        message: 'Enter both exit_price and closed_at to mark a trade as closed.',
      });
    }
    if (openedAt && closedAt && Date.parse(closedAt) < Date.parse(openedAt)) {
      details.push({
        row: rowNumber,
        field: 'closed_at',
        message: 'Close time cannot be before entry time.',
      });
    }

    const setupNote = cells.setup_note.trim();
    const emotionalState = cells.emotional_state.trim();
    if (setupNote.length > 1000) {
      details.push({
        row: rowNumber,
        field: 'setup_note',
        message: 'Use no more than 1000 characters.',
      });
    }
    if (emotionalState.length > 80) {
      details.push({
        row: rowNumber,
        field: 'emotional_state',
        message: 'Use no more than 80 characters.',
      });
    }

    const evidence: EvidenceInput[] = [];
    if (setupNote && setupNote.length <= 1000)
      evidence.push({ kind: 'note', payload: { setup_note: setupNote } });
    if (emotionalState && emotionalState.length <= 80) {
      evidence.push({ kind: 'state', payload: { emotional_state: emotionalState } });
    }

    normalized.push({
      row_number: rowNumber,
      strategy_version_id: '',
      symbol,
      direction: direction === 'short' ? 'short' : 'long',
      quantity: quantity ?? 0,
      entry_price: entryPrice ?? 0,
      ...(exitPrice !== undefined ? { exit_price: exitPrice } : {}),
      fees,
      currency,
      opened_at: openedAt ?? '',
      ...(closedAt !== undefined ? { closed_at: closedAt } : {}),
      ...(initialRisk !== undefined ? { initial_risk_amount: initialRisk } : {}),
      evidence,
    });
  }

  if (details.length > 0) invalidCsv(details);
  return normalized;
}

export async function previewTradeImport(
  db: Db,
  identityId: string,
  strategyVersionId: string,
  csvText: string,
) {
  const rows = parseTradeRows(csvText).map(({ row_number, ...trade }) => ({
    ...trade,
    strategy_version_id: strategyVersionId,
    row_number,
  }));

  return withIdentity(db, identityId, async (tx) => {
    const version = await tx.query(
      'SELECT id FROM strategy_versions WHERE id = $1 AND identity_id = $2',
      [strategyVersionId, identityId],
    );
    if (!version.rows[0]) notFound('Strategy version not found');

    const inserted = await tx.query(
      `INSERT INTO trade_imports (identity_id, strategy_version_id, status, normalized_rows)
       VALUES ($1, $2, 'ready', $3::jsonb)
       RETURNING id`,
      [identityId, strategyVersionId, JSON.stringify(rows)],
    );
    return {
      import_id: inserted.rows[0].id,
      status: 'ready' as const,
      row_count: rows.length,
      rows,
    };
  });
}

export async function commitTradeImport(db: Db, identityId: string, importId: string) {
  return withIdentity(db, identityId, async (tx) => {
    const selected = await tx.query(
      'SELECT * FROM trade_imports WHERE id = $1 AND identity_id = $2 FOR UPDATE',
      [importId, identityId],
    );
    const batch = selected.rows[0];
    if (!batch) notFound('Trade import not found');
    if (batch.status === 'committed') return { ...batch.result, cached: true };

    const rows = batch.normalized_rows as Array<NormalizedCsvTrade>;
    const trades = [];
    for (const row of rows) {
      const { row_number: _rowNumber, ...input } = row;
      trades.push(await insertTradeInTransaction(tx, identityId, input));
    }
    const response = {
      import_id: importId,
      status: 'committed' as const,
      imported_count: trades.length,
      trades,
      cached: false,
    };
    await tx.query(
      `UPDATE trade_imports
       SET status = 'committed', result = $3::jsonb, committed_at = now()
       WHERE id = $1 AND identity_id = $2`,
      [importId, identityId, JSON.stringify(response)],
    );
    return response;
  });
}
