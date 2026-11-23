import { activeDb } from '../database/connection';
import { AppError } from '../utils/errors';
import { createId } from '../utils/ids';
import { assertBusinessDate, nowIso } from '../utils/dateUtils';
import { cleanText } from '../utils/validation';
import {
  parsePositiveRupeesToPaise,
  previewConversion,
  toBigInt,
  toSafeNumber,
} from '../utils/goldCalculations';
import { assertActiveCustomer } from './customerService';
import { getAdvanceSummary } from './advanceService';
import { getGoldBalance, insertLedgerEntry } from './ledgerService';

const activeConversions = new Set();

function placeholders(count) {
  return new Array(count).fill('?').join(', ');
}

export async function convertGold(input) {
  const customerId = input?.customerId;
  if (!customerId) throw new AppError('VALIDATION', 'Customer is required.');
  if (activeConversions.has(customerId)) {
    throw new AppError('CONVERSION_IN_PROGRESS', 'A conversion is already running for this customer.');
  }

  const ratePaise = parsePositiveRupeesToPaise(input.ratePerGram, 'Gold rate');
  const conversionDate = assertBusinessDate(input.conversionDate);
  const notes = cleanText(input.notes, { max: 500, label: 'Notes' }) || null;
  const incomeIds = Array.isArray(input.incomeIds) ? [...new Set(input.incomeIds)] : [];
  const includeAdvance = Boolean(input.includeAdvance);
  const requestedAdvance = includeAdvance
    ? parsePositiveRupeesToPaise(input.advanceAmount, 'Advance amount')
    : 0n;

  if (input.failAfter && process.env.NODE_ENV !== 'test') {
    throw new AppError('VALIDATION', 'Invalid conversion option.');
  }

  activeConversions.add(customerId);
  try {
    const db = activeDb();
    return await db.withTransaction(async (tx) => {
      await assertActiveCustomer(customerId, tx);
      const previousScaled = toBigInt(await getGoldBalance(customerId, tx), 'Previous balance');
      if (
        input.expectedPreviousScaled !== undefined &&
        input.expectedPreviousScaled !== null &&
        toBigInt(input.expectedPreviousScaled) !== previousScaled
      ) {
        throw new AppError('BALANCE_CHANGED', 'The gold balance changed. Review the conversion and try again.');
      }

      let rows = [];
      if (incomeIds.length) {
        rows = await tx.all(
          `SELECT id, amount_paise, conversion_status
           FROM income_transactions
           WHERE customer_id = ? AND id IN (${placeholders(incomeIds.length)})`,
          [customerId, ...incomeIds],
        );
      }
      if (rows.length !== incomeIds.length) {
        throw new AppError('INCOME_CHANGED', 'Some selected payments are no longer available.');
      }
      if (rows.some((row) => row.conversion_status !== 'UNCONVERTED')) {
        throw new AppError('ALREADY_CONVERTED', 'One of the selected payments was already converted.');
      }
      const incomePaise = rows.reduce((sum, row) => sum + BigInt(row.amount_paise), 0n);
      if (
        input.expectedIncomePaise !== undefined &&
        input.expectedIncomePaise !== null &&
        toBigInt(input.expectedIncomePaise) !== incomePaise
      ) {
        throw new AppError('INCOME_CHANGED', 'The unconverted income changed. Review the conversion and try again.');
      }

      const advance = await getAdvanceSummary(customerId, tx);
      const available = BigInt(advance.availablePaise);
      if (
        includeAdvance &&
        input.expectedAvailablePaise !== undefined &&
        input.expectedAvailablePaise !== null &&
        toBigInt(input.expectedAvailablePaise) !== available
      ) {
        throw new AppError('ADVANCE_CHANGED', 'The available advance changed. Review the amount and try again.');
      }
      if (includeAdvance && requestedAdvance > available) {
        throw new AppError('ADVANCE_EXCEEDED', 'That amount is higher than the available advance.');
      }

      const preview = previewConversion({
        previousScaled,
        incomePaise,
        advancePaise: includeAdvance ? requestedAdvance : 0n,
        ratePaisePerGram: ratePaise,
      });

      const conversionId = createId();
      const timestamp = nowIso();
      await tx.run(
        `INSERT INTO gold_conversions (
          id, customer_id, previous_balance_scaled, income_amount_paise, advance_amount_paise,
          total_amount_paise, gold_rate_paise_per_gram, converted_grams_scaled, new_balance_scaled,
          conversion_date, notes, created_at, reversed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          conversionId,
          customerId,
          toSafeNumber(preview.previousScaled),
          toSafeNumber(preview.incomePaise),
          toSafeNumber(preview.advancePaise),
          toSafeNumber(preview.totalPaise),
          toSafeNumber(preview.ratePaisePerGram),
          toSafeNumber(preview.convertedScaled),
          toSafeNumber(preview.newBalanceScaled),
          conversionDate,
          notes,
          timestamp,
        ],
      );

      for (const incomeId of incomeIds) {
        const updated = await tx.run(
          `UPDATE income_transactions
           SET conversion_status = 'CONVERTED', conversion_id = ?
           WHERE id = ? AND customer_id = ? AND conversion_status = 'UNCONVERTED'`,
          [conversionId, incomeId, customerId],
        );
        if (updated.changes !== 1) {
          throw new AppError('ALREADY_CONVERTED', 'One of the selected payments was already converted.');
        }
      }

      if (input.failAfter === 'mark_income') {
        throw new Error('TEST_ROLLBACK');
      }

      if (preview.advancePaise > 0n) {
        await tx.run(
          `INSERT INTO advance_transactions (
            id, customer_id, transaction_type, amount_paise, transaction_date, conversion_id, payment_method, notes, created_at
          ) VALUES (?, ?, 'CONSUMPTION', ?, ?, ?, NULL, ?, ?)`,
          [
            createId(),
            customerId,
            toSafeNumber(preview.advancePaise),
            conversionDate,
            conversionId,
            'Used in gold conversion',
            timestamp,
          ],
        );
        const after = await getAdvanceSummary(customerId, tx);
        if (after.availablePaise < 0) {
          throw new AppError('ADVANCE_EXCEEDED', 'Advance balance cannot become negative.');
        }
      }

      await insertLedgerEntry({
        customerId,
        transactionType: 'CONVERSION',
        referenceId: conversionId,
        gramsDeltaScaled: -preview.convertedScaled,
        balanceAfterScaled: preview.newBalanceScaled,
        transactionDate: conversionDate,
        tx,
      });

      if (input.waitFor) {
        await input.waitFor;
      }

      return tx.get('SELECT * FROM gold_conversions WHERE id = ?', [conversionId]);
    });
  } finally {
    activeConversions.delete(customerId);
  }
}

export async function reverseConversion(conversionId) {
  const db = activeDb();
  return db.withTransaction(async (tx) => {
    const conversion = await tx.get('SELECT * FROM gold_conversions WHERE id = ?', [conversionId]);
    if (!conversion) throw new AppError('NOT_FOUND', 'Conversion not found.');
    if (conversion.reversed_at) {
      throw new AppError('ALREADY_REVERSED', 'This conversion has already been reversed.');
    }
    const current = BigInt(await getGoldBalance(conversion.customer_id, tx));
    const restored = current + BigInt(conversion.converted_grams_scaled);
    const timestamp = nowIso();
    await tx.run('UPDATE gold_conversions SET reversed_at = ? WHERE id = ? AND reversed_at IS NULL', [
      timestamp,
      conversionId,
    ]);
    await insertLedgerEntry({
      customerId: conversion.customer_id,
      transactionType: 'REVERSAL',
      referenceId: conversionId,
      gramsDeltaScaled: BigInt(conversion.converted_grams_scaled),
      balanceAfterScaled: restored,
      transactionDate: conversion.conversion_date,
      tx,
    });
    if (Number(conversion.advance_amount_paise) > 0) {
      await tx.run(
        `INSERT INTO advance_transactions (
          id, customer_id, transaction_type, amount_paise, transaction_date, conversion_id, payment_method, notes, created_at
        ) VALUES (?, ?, 'REVERSAL', ?, ?, ?, NULL, ?, ?)`,
        [
          createId(),
          conversion.customer_id,
          conversion.advance_amount_paise,
          conversion.conversion_date,
          conversionId,
          'Advance restored by conversion reversal',
          timestamp,
        ],
      );
    }
    await tx.run(
      `UPDATE income_transactions
       SET conversion_status = 'UNCONVERTED', conversion_id = NULL
       WHERE conversion_id = ?`,
      [conversionId],
    );
    return tx.get('SELECT * FROM gold_conversions WHERE id = ?', [conversionId]);
  });
}

export async function getConversion(conversionId, tx) {
  const db = activeDb(tx);
  const row = await db.get('SELECT * FROM gold_conversions WHERE id = ?', [conversionId]);
  if (!row) throw new AppError('NOT_FOUND', 'Conversion not found.');
  return row;
}

export function isConversionLocked(customerId) {
  return activeConversions.has(customerId);
}
