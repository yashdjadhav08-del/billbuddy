/**
 * Friendly contract-error mapping.
 *
 * The Soroban SDK surfaces contract failures as a `HostError` whose message
 * includes `Error(Contract, #<code>)` (e.g. `#201`) plus a diagnostic event
 * log. These raw strings are useless in a toast, so we parse out the code and
 * translate it to a human-readable message using the contract's error codes
 * (see contracts/billbuddy/src/errors.rs).
 */

interface ContractCodeEntry {
  code: number
  name: string
  message: string
}

const CONTRACT_CODES: Record<number, ContractCodeEntry> = {
  100: { code: 100, name: 'HouseholdNotFound', message: 'Household not found.' },
  101: { code: 101, name: 'HouseholdAlreadyExists', message: 'A household with that ID already exists.' },
  102: { code: 102, name: 'HouseholdInactive', message: 'This household is inactive.' },
  103: { code: 103, name: 'PeriodAlreadyClosed', message: 'The period is already closed.' },
  104: { code: 104, name: 'OutstandingBalances', message: 'Cannot close the period — some members still have outstanding balances.' },

  200: { code: 200, name: 'MemberNotFound', message: 'Member not found in this household.' },
  201: { code: 201, name: 'MemberAlreadyExists', message: 'This person is already a member of the household.' },
  202: { code: 202, name: 'MemberInactive', message: 'This member is inactive.' },
  203: { code: 203, name: 'UnauthorizedMutation', message: 'Only the household owner can do that.' },
  204: { code: 204, name: 'CannotRemoveOwner', message: 'The household owner cannot be removed.' },

  300: { code: 300, name: 'BillNotFound', message: 'Bill not found.' },
  301: { code: 301, name: 'InvalidAmount', message: 'The amount is invalid (must be greater than zero).' },
  302: { code: 302, name: 'InvalidSplit', message: 'The split configuration is invalid.' },
  303: { code: 303, name: 'SplitMismatch', message: 'The shares do not add up to the total amount.' },
  304: { code: 304, name: 'BillAlreadySettled', message: 'This bill is already settled.' },
  305: { code: 305, name: 'UnauthorizedBillMutation', message: 'Only the bill creator or household owner can change this bill.' },
  306: { code: 306, name: 'NotBillParticipant', message: 'This member is not a participant of the bill.' },
  307: { code: 307, name: 'BillPaymentTooLarge', message: 'The payment is larger than this member owes.' },
  308: { code: 308, name: 'AlreadyPaidShare', message: 'This share has already been paid.' },
  309: { code: 309, name: 'CannotDeleteSettledBill', message: 'Settled bills cannot be deleted.' },

  400: { code: 400, name: 'SettlementNotFound', message: 'Settlement not found.' },
  401: { code: 401, name: 'SettlementAlreadyCompleted', message: 'This settlement is already completed.' },
  402: { code: 402, name: 'SettlementAlreadyFailed', message: 'This settlement is already marked as failed.' },
  403: { code: 403, name: 'UnauthorizedSettlement', message: 'Only the payer can complete or fail a settlement.' },
  404: { code: 404, name: 'SettlementAmountMismatch', message: 'The settlement amount does not match what is owed.' },
  405: { code: 405, name: 'DuplicateSettlement', message: 'A settlement between these members already exists.' },

  900: { code: 900, name: 'InternalError', message: 'An internal contract error occurred.' },
  901: { code: 901, name: 'InvalidInput', message: 'The contract rejected the input as invalid.' },
}

const CONTRACT_ERROR_PATTERN = /Error\(Contract,\s*#(\d+)\)/

/**
 * Extract a friendly message from any thrown Error. If the message contains a
 * Soroban `Error(Contract, #N)` code we translate it via the table above;
 * otherwise the raw (but event-log-stripped) message is returned.
 */
export function friendlyContractError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? 'Unknown error')
  const match = raw.match(CONTRACT_ERROR_PATTERN)
  if (match) {
    const entry = CONTRACT_CODES[Number(match[1])]
    if (entry?.message) return entry.message
  }
  // JS runtime errors from the SDK/Horizon (e.g. "Cannot read properties of undefined")
  if (raw.includes('Cannot read properties of undefined')) {
    return 'Unable to process the transaction — the wallet or network response was rejected. Please refresh the page, ensure both accounts are funded, and try again.'
  }
  // Strip the multi-line diagnostic event log so toasts stay readable.
  const single = raw.split('\n')[0] ?? raw
  return (single && single.trim()) || 'Something went wrong.'
}

/** Whether an error maps to a known contract error code (e.g. for special casing). */
export function contractErrorCode(err: unknown): number | undefined {
  const raw = err instanceof Error ? err.message : String(err)
  const match = raw.match(CONTRACT_ERROR_PATTERN)
  return match ? Number(match[1]) : undefined
}