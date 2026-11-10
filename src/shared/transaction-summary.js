/**
 * The summary lines of a transaction as GET /transactions/{id} returns it (server TransactionDTO).
 *
 * The merchant and ISV status tools read `id`, `type`, `trData.amount`, `description`, `createdAt` and
 * `updatedAt`, none of which TransactionDTO has, so every summary line read N/A beside a full response
 * that had the values. The fields here are the DTO's; `created` and `finalized` are epoch milliseconds.
 */
const at = (millis) => (millis ? new Date(millis).toISOString() : null);

export function transactionSummary(tx = {}) {
  const lines = [
    `- ID: ${tx.transactionId || 'N/A'}`,
    `- Type: ${tx.transactionType || 'N/A'}${tx.initiatedBy ? ` (initiated by ${tx.initiatedBy})` : ''}`,
    `- Amount: ${tx.amount ?? 'N/A'} ${tx.currency || ''}`.trimEnd(),
    tx.fee !== undefined && tx.fee !== null ? `- Fee: ${tx.fee} ${tx.currency || ''}${tx.feeVat ? ` (VAT ${tx.feeVat} included)` : ''}` : null,
    tx.paymentMethod ? `- Payment method: ${tx.paymentMethod}` : null,
    `- Reason: ${tx.reasonL1 || 'N/A'}${tx.reasonL2 ? ` / ${tx.reasonL2}` : ''}`,
    tx.statusMessage ? `- Status message: ${tx.statusMessage}` : null,
    tx.payerFriendlyName ? `- Payer: ${tx.payerFriendlyName}` : null,
    `- Created: ${at(tx.created) || 'N/A'}`,
    tx.finalized ? `- Finalized: ${at(tx.finalized)}` : null,
    tx.timeToLive !== undefined && tx.timeToLive !== null ? `- Time to live: ${tx.timeToLive} seconds` : null
  ];
  return lines.filter(Boolean).join('\n');
}
