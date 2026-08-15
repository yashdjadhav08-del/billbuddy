/**
 * Money utilities.
 * All calculations use integer arithmetic on minor units (cents).
 * NEVER use floating-point as the authoritative source of truth for money.
 */

/** Convert a decimal dollar string/number to integer cents. */
export function toCents(dollars: number | string): number {
  const str = typeof dollars === 'string' ? dollars : dollars.toFixed(2)
  const [whole, frac = '00'] = str.split('.')
  const paddedFrac = frac.padEnd(2, '0').slice(0, 2)
  return parseInt(whole, 10) * 100 + parseInt(paddedFrac, 10)
}

/** Convert integer cents to a display string like "$32.50". */
export function formatCents(cents: number, symbol = '$'): string {
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const sign = cents < 0 ? '-' : ''
  return `${sign}${symbol}${dollars}.${String(remainder).padStart(2, '0')}`
}

/** Convert integer cents to a decimal number (for display only, not arithmetic). */
export function centsToDecimal(cents: number): number {
  return cents / 100
}

/** Convert cents to a plain decimal string like "32.50". */
export function centsToString(cents: number): string {
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const sign = cents < 0 ? '-' : ''
  return `${sign}${dollars}.${String(remainder).padStart(2, '0')}`
}

/**
 * Distribute `total` cents equally among `n` parties.
 * Remainder is distributed one cent at a time to the first parties.
 * Returns an array of integer cent amounts that sum exactly to total.
 */
export function equalSplit(total: number, n: number): number[] {
  if (n <= 0) throw new Error('Cannot split among 0 members')
  if (total < 0) throw new Error('Cannot split a negative amount')
  const base = Math.floor(total / n)
  const remainder = total % n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Validate that an array of cent amounts sums exactly to total.
 */
export function validateSplitSum(amounts: number[], total: number): boolean {
  const sum = amounts.reduce((a, b) => a + b, 0)
  return sum === total
}

/**
 * Convert percentage values (as integers, e.g. 25 for 25%) to cent amounts.
 * Percentages must sum to 100. Remainder is distributed to the first parties.
 */
export function percentageSplit(total: number, percentages: number[]): number[] {
  const sum = percentages.reduce((a, b) => a + b, 0)
  if (sum !== 100) throw new Error(`Percentages must sum to 100, got ${sum}`)

  const amounts = percentages.map(p => Math.floor((total * p) / 100))
  const allocated = amounts.reduce((a, b) => a + b, 0)
  let remainder = total - allocated

  // Distribute remainder (rounding error) one cent at a time
  for (let i = 0; i < amounts.length && remainder > 0; i++) {
    amounts[i]++
    remainder--
  }

  return amounts
}

/** Shorten a Stellar address for display: "GABC...XYZ9" */
export function shortenAddress(address: string, start = 4, end = 4): string {
  if (address.length <= start + end + 3) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}
