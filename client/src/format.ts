import type { Language } from "./i18n.js";

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new RangeError("Cents must be a safe integer.");
}

function groupInteger(value: number | bigint, language: Language): string {
  return new Intl.NumberFormat(language === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatMoney(cents: number, language: Language): string {
  assertCents(cents);
  const value = BigInt(cents);
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${groupInteger((absolute + 50n) / 100n, language)} $`;
}

export function formatMoneyExact(cents: number, language: Language): string {
  assertCents(cents);
  const value = BigInt(cents);
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  const dollars = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const separator = language === "ru" ? "," : ".";
  return `${sign}${groupInteger(dollars, language)}${separator}${fraction} $`;
}

export function formatMoneySigned(cents: number, language: Language): string {
  assertCents(cents);
  if (cents === 0) return formatMoney(0, language);
  return `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents), language)}`;
}

export function formatMoneySignedExact(cents: number, language: Language): string {
  assertCents(cents);
  if (cents === 0) return formatMoneyExact(0, language);
  return `${cents > 0 ? "+" : "−"}${formatMoneyExact(Math.abs(cents), language)}`;
}

export function formatPercent(bps: number, language: Language, signed = true): string {
  if (!Number.isSafeInteger(bps)) throw new RangeError("Basis points must be a safe integer.");
  const absolute = Math.abs(bps);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  const sign = bps < 0 ? "−" : signed && bps > 0 ? "+" : "";
  const separator = language === "ru" ? "," : ".";
  return `${sign}${whole}${fraction ? `${separator}${String(fraction).padStart(2, "0")}` : ""}%`;
}
