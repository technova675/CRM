// Indian GST for agency invoices: rates, the CGST+SGST / IGST split, GSTIN checks and amounts in words.

export const GST_RATES = [18, 12, 5, 0] as const;
/** SAC 998361: advertising services provided by advertising agencies; 998365: digital advertising space; 998313: IT consulting. */
export const DEFAULT_SAC = "998361";

/** State code is the first two digits of a GSTIN; the state name is matched for clients without a GSTIN. */
export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
  "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};
export const STATE_NAMES = Object.values(STATES).sort();

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const validGstin = (value?: string) => !value || GSTIN.test(value.trim().toUpperCase());
export const normalGstin = (value?: string) => value?.trim().toUpperCase() || undefined;

/** The state a party is in: from the GSTIN when present, else the state they entered. */
export function partyState(gstin?: string, state?: string) {
  const code = normalGstin(gstin)?.slice(0, 2);
  return (code && STATES[code]) || state?.trim() || "";
}

const paise = (n: number) => Math.round(n * 100) / 100;
/** Same state: half CGST, half SGST. Different states, or either state unknown: IGST. */
export function gstBreakdown(taxable: number, rate: number, supplierState: string, buyerState: string) {
  const tax = paise(taxable * rate / 100);
  const intra = !!supplierState && supplierState === buyerState;
  const half = paise(tax / 2);
  return { taxable: paise(taxable), rate, tax, total: paise(taxable + tax), intra, cgst: intra ? half : 0, sgst: intra ? paise(tax - half) : 0, igst: intra ? 0 : tax };
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n: number) => n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", below100(n % 100)].filter(Boolean).join(" ");
/** Indian numbering: 1,23,45,678.50 → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Fifty Paise Only". */
export function rupeesInWords(amount: number) {
  const rupees = Math.floor(amount), paisa = Math.round((amount - rupees) * 100);
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7), lakh = Math.floor(rupees / 1e5) % 100, thousand = Math.floor(rupees / 1e3) % 100, rest = rupees % 1000;
  if (crore) parts.push(`${crore >= 100 ? rupeesInWords(crore).replace(/ Rupees.*$/, "") : below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return `${parts.join(" ") || "Zero"} Rupees${paisa ? ` and ${below100(paisa)} Paise` : ""} Only`;
}
