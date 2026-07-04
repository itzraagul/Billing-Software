import { Visit } from '../types';

/**
 * Keyword-based classifier for "Additional Charges Description" text.
 * This is purely an ANALYSIS layer for the Dashboard — it does not change
 * how bills are created. Each bill still has one additionalCharges amount
 * and one free-text description; we just bucket that description into a
 * category here so revenue can be reported by type.
 *
 * Order matters: more specific categories are checked before generic ones.
 */
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  { category: 'Injection',        keywords: ['injection', 'inj.', 'inj ', 'shot'] },
  { category: 'Wound Dressing',   keywords: ['dressing', 'wound', 'bandage', 'gauze'] },
  { category: 'IV Drips / Fluids',keywords: ['drip', 'iv fluid', 'iv ', 'saline', 'ringer'] },
  { category: 'Nebulizer',        keywords: ['nebuliz', 'nebulise', 'nebulizer'] },
  { category: 'Physiotherapy',    keywords: ['physio', 'physiotherapy'] },
  { category: 'Lab Test',         keywords: ['lab test', 'blood test', 'urine test', 'pathology', 'lab ', 'cbc', 'sugar test'] },
  { category: 'X-Ray',            keywords: ['x-ray', 'xray', 'x ray'] },
  { category: 'Suture / Stitching', keywords: ['suture', 'stitch'] },
  { category: 'Vaccination',      keywords: ['vaccination', 'vaccine', 'immuniz'] },
];

/** Classify a single additional-charge description into a category name. */
export function classifyAdditionalCharge(desc: string): string {
  const d = (desc || '').toLowerCase().trim();
  if (!d) return 'Other / Unspecified';
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some(k => d.includes(k))) return category;
  }
  return 'Other';
}

export interface RevenueLine {
  category: string;
  amount: number;
  count: number; // number of bills contributing to this line
}

/**
 * Compute a full revenue breakdown for a set of (already date-filtered,
 * non-cancelled) visits. Returns lines sorted by amount descending.
 * "Doctor Fee", "Expert / Technician Fee (Physiotherapy etc.)", and
 * "Medicine Charges" come from their own structured fields on the Visit.
 * Every "Additional Charges" amount is bucketed via keyword matching on
 * its description text.
 */
export function computeRevenueBreakdown(visits: Visit[]): { lines: RevenueLine[]; total: number } {
  const buckets = new Map<string, { amount: number; count: number }>();

  const add = (category: string, amount: number) => {
    if (!amount) return;
    const existing = buckets.get(category) || { amount: 0, count: 0 };
    existing.amount += amount;
    existing.count += 1;
    buckets.set(category, existing);
  };

  for (const v of visits) {
    add('Doctor Fee', v.doctorFee || 0);
    add('Expert / Technician Fee (Physiotherapy, etc.)', v.expertFee || 0);
    add('Medicine Charges', v.medicineCharges || 0);
    if (v.additionalCharges > 0) {
      const category = classifyAdditionalCharge(v.additionalChargesDesc);
      add(category, v.additionalCharges);
    }
  }

  const lines: RevenueLine[] = Array.from(buckets.entries())
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount);

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total };
}
