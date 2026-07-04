export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const getCurrentDate = (): string => {
  return new Date().toISOString().split('T')[0];
};

export const getCurrentTime = (): string => {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

/** Smart numeric input: replaces leading zero when user types */
export const smartNumericChange = (
  val: string,
  setter: (n: number) => void,
  isFloat = false
) => {
  if (val === '' || val === '-') { setter(0); return; }
  const parsed = isFloat ? parseFloat(val) : parseInt(val, 10);
  if (!isNaN(parsed)) setter(parsed);
};

/** Build a dosage string for a medicine based on type */
export const buildDosageHint = (type: string): string => {
  if (type === 'Syrup') return 'ML: e.g. 10-10-10-0';
  return 'e.g. 1-1-1-0';
};

export const getMonthName = (month: number): string => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[month] || '';
};

/** Calculate age in decimal years from a date-of-birth ISO string to today.
 *  Returns value like 2.7 (years.months) rounded to 1 decimal.
 *  e.g. born 2023-11-25, today 2026-06-22  => 2 years 6 months ≈ 2.6
 */
export const calculateAgeFromDOB = (dobIso: string): number => {
  const dob = new Date(dobIso);
  const today = new Date();
  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  const days = today.getDate() - dob.getDate();
  if (days < 0) months--;
  if (months < 0) { years--; months += 12; }
  const decimal = Math.round((years + months / 12) * 10) / 10;
  return Math.max(0, decimal);
};

/** Convert a DD/MM/YYYY display string to an ISO YYYY-MM-DD string for storage. */
export const dobDisplayToISO = (display: string): string => {
  const [d, m, y] = display.split('/');
  if (!d || !m || !y || y.length < 4) return '';
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
};

/** Convert an ISO YYYY-MM-DD string to DD/MM/YYYY display format. */
export const dobISOToDisplay = (iso: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Calculate per-tablet price from strip selling price and tabs per strip.
 *  e.g. stripPrice=20, tabsPerStrip=15 → 1.3333...
 */
export const perTabletPrice = (stripPrice: number, tabsPerStrip: number): number => {
  if (!tabsPerStrip || tabsPerStrip <= 0) return stripPrice;
  return stripPrice / tabsPerStrip;
};

/** Round a currency amount to nearest 0.50 (standard pharmacy rounding).
 *  e.g. 13.333 → 13.50, 13.60 → 13.50, 13.75 → 14.00
 */
export const roundToHalf = (amount: number): number => {
  return Math.round(amount * 2) / 2;
};

/** Calculate total prescription cost for a Tablet medicine.
 *  If stripOnly: qty gets rounded up to full strips, charged by strips.
 *  Otherwise: per-tablet price × qty, rounded to nearest 0.50.
 */
export const calcTabletAmount = (
  stripPrice: number,
  tabsPerStrip: number,
  qty: number,
  stripOnly: boolean
): { amount: number; effectiveQty: number } => {
  const tabs = tabsPerStrip || 1;
  if (stripOnly) {
    const strips = Math.ceil(qty / tabs);
    const effectiveQty = strips * tabs;
    return { amount: strips * stripPrice, effectiveQty };
  }
  const perTab = stripPrice / tabs;
  return { amount: roundToHalf(perTab * qty), effectiveQty: qty };
};
