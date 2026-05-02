/**
 * Canonical trade type configuration.
 * Imported by both client (UI labels, form logic) and server (P&L direction, type derivation).
 */

export const TRADE_TYPES = {
  long_call: {
    openTx: "BTO" as const,
    label: "Long Call",
    shortLabel: "LONG CALL",
    badgeColor: "default" as const,
    type: "calls",
    multiplier: 100,
    category: "directional",
    hint: "Buy to open — profit when the call rises in value.",
  },
  long_put: {
    openTx: "BTO" as const,
    label: "Long Put",
    shortLabel: "LONG PUT",
    badgeColor: "secondary" as const,
    type: "puts",
    multiplier: 100,
    category: "directional",
    hint: "Buy to open — profit when the put rises in value.",
  },
  short_put_csp: {
    openTx: "STO" as const,
    label: "Cash-Secured Put",
    shortLabel: "CSP",
    badgeColor: "default" as const,
    type: "puts",
    multiplier: 100,
    category: "premium",
    hint: "Sell to open — enter the premium received as a positive number (e.g. 1.50). Profit when the option expires worthless or you buy it back cheaper.",
  },
  short_call_cc: {
    openTx: "STO" as const,
    label: "Covered Call",
    shortLabel: "CC",
    badgeColor: "secondary" as const,
    type: "calls",
    multiplier: 100,
    category: "premium",
    hint: "Sell to open — enter the premium received as a positive number. Profit when the call expires worthless or you buy it back cheaper.",
  },
  bull_put_spread: {
    openTx: "STO" as const,
    label: "Bull Put Spread",
    shortLabel: "BP SPRD",
    badgeColor: "default" as const,
    type: "puts",
    multiplier: 100,
    category: "credit_spread",
    hint: "Credit spread — enter the NET credit received (short premium − long premium). Strike fields: short (higher) strike and long (lower) strike added in a later phase.",
  },
  bear_call_spread: {
    openTx: "STO" as const,
    label: "Bear Call Spread",
    shortLabel: "BC SPRD",
    badgeColor: "secondary" as const,
    type: "calls",
    multiplier: 100,
    category: "credit_spread",
    hint: "Credit spread — enter the NET credit received. Profit when the underlying stays below the short strike.",
  },
  bull_call_spread: {
    openTx: "BTO" as const,
    label: "Bull Call Spread",
    shortLabel: "BC SPRD",
    badgeColor: "default" as const,
    type: "calls",
    multiplier: 100,
    category: "debit_spread",
    hint: "Debit spread — enter the NET debit paid (long premium − short premium). Profit when the underlying rises above the long strike.",
  },
  bear_put_spread: {
    openTx: "BTO" as const,
    label: "Bear Put Spread",
    shortLabel: "BP SPRD",
    badgeColor: "secondary" as const,
    type: "puts",
    multiplier: 100,
    category: "debit_spread",
    hint: "Debit spread — enter the NET debit paid. Profit when the underlying falls below the long strike.",
  },
  stock: {
    openTx: "BTO" as const,
    label: "Stock / Shares",
    shortLabel: "STOCK",
    badgeColor: "default" as const,
    type: "stock",
    multiplier: 1,
    category: "equity",
    hint: "Equity position — enter price per share. No options multiplier applied.",
  },
} as const;

export type TradeTypeKey = keyof typeof TRADE_TYPES;

export function getTradeTypeInfo(tradeType: string | null | undefined) {
  const key = (tradeType ?? "long_call") as TradeTypeKey;
  return TRADE_TYPES[key] ?? TRADE_TYPES.long_call;
}

/** Groups for the strategy picker UI */
export const TRADE_TYPE_GROUPS = [
  {
    label: "Directional",
    types: ["long_call", "long_put"] as TradeTypeKey[],
  },
  {
    label: "Short Premium",
    types: ["short_put_csp", "short_call_cc"] as TradeTypeKey[],
  },
  {
    label: "Credit Spreads",
    types: ["bull_put_spread", "bear_call_spread"] as TradeTypeKey[],
  },
  {
    label: "Debit Spreads",
    types: ["bull_call_spread", "bear_put_spread"] as TradeTypeKey[],
  },
  {
    label: "Equity",
    types: ["stock"] as TradeTypeKey[],
  },
] as const;
