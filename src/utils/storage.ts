import { ClinicSettings, Patient, Visit, Medicine, User, DEFAULT_USERS, DEFAULT_CLINIC_SETTINGS, DEFAULT_MEDICINES } from '../types';

const KEYS = {
  users: 'clinic_users',
  clinicSettings: 'clinic_settings',
  patients: 'clinic_patients',
  visits: 'clinic_visits',
  medicines: 'clinic_medicines',
  currentUser: 'clinic_current_user',
  theme: 'clinic_theme',
};

export const storage = {
  init() {
    if (!localStorage.getItem(KEYS.users)) localStorage.setItem(KEYS.users, JSON.stringify(DEFAULT_USERS));
    if (!localStorage.getItem(KEYS.clinicSettings)) localStorage.setItem(KEYS.clinicSettings, JSON.stringify(DEFAULT_CLINIC_SETTINGS));
    if (!localStorage.getItem(KEYS.patients)) localStorage.setItem(KEYS.patients, JSON.stringify([]));
    if (!localStorage.getItem(KEYS.visits)) localStorage.setItem(KEYS.visits, JSON.stringify([]));
    if (!localStorage.getItem(KEYS.medicines)) localStorage.setItem(KEYS.medicines, JSON.stringify(DEFAULT_MEDICINES));
    this.migrateUserIds();
    this.migrateClinicSettings();
    this.migrateMedicines();
    this.migrateVisits();
  },
  /** Backfill expertFee: 0 on visits saved by an older version of the app
   *  that predates the Expert/Technician Fee field. */
  migrateVisits() {
    const visits = this.getVisits();
    let changed = false;
    const fixed = visits.map(v => {
      if ((v as any).expertFee === undefined) { changed = true; return { ...v, expertFee: 0 }; }
      return v;
    });
    if (changed) this.saveVisits(fixed);
  },
  /** Backfill missing type/minQuantity/stockCount on medicines saved by an older
   *  version of the app where these fields could end up undefined. */
  migrateMedicines() {
    const meds = this.getMedicines();
    let changed = false;
    const fixed = meds.map(m => {
      const next = { ...m };
      if (!next.type) { next.type = 'Tablet'; changed = true; }
      if (next.minQuantity === undefined || next.minQuantity === null) { next.minQuantity = 1; changed = true; }
      if (next.stockCount === undefined || next.stockCount === null) { next.stockCount = 0; changed = true; }
      if (next.unitPrice === undefined || next.unitPrice === null) { next.unitPrice = 0; changed = true; }
      if (next.purchasedPrice === undefined || next.purchasedPrice === null) { next.purchasedPrice = 0; changed = true; }
      return next;
    });
    if (changed) this.saveMedicines(fixed);
  },
  /** Backfill clinicSealUrl for existing saved settings that predate this field */
  migrateClinicSettings() {
    const s = this.getClinicSettings();
    if (s.clinicSealUrl === undefined) {
      this.saveClinicSettings({ ...s, clinicSealUrl: '' });
    }
  },
  /** Backfill a userId for any existing saved user that predates this field */
  migrateUserIds() {
    const users = this.getUsers();
    let changed = false;
    const used = new Set(users.map(u => u.userId).filter(Boolean));
    const updated = users.map(u => {
      if (u.userId && u.userId.trim()) return u;
      changed = true;
      let base = (u.email.split('@')[0] || u.fullName.replace(/\s+/g, '').toLowerCase() || 'user').toLowerCase();
      let candidate = base;
      let n = 1;
      while (used.has(candidate)) { candidate = `${base}${n}`; n++; }
      used.add(candidate);
      return { ...u, userId: candidate };
    });
    if (changed) this.saveUsers(updated);
  },
  getUsers(): User[] { const d = localStorage.getItem(KEYS.users); return d ? JSON.parse(d) : DEFAULT_USERS; },
  saveUsers(u: User[]) { localStorage.setItem(KEYS.users, JSON.stringify(u)); },
  getClinicSettings(): ClinicSettings { const d = localStorage.getItem(KEYS.clinicSettings); return d ? JSON.parse(d) : DEFAULT_CLINIC_SETTINGS; },
  saveClinicSettings(s: ClinicSettings) { localStorage.setItem(KEYS.clinicSettings, JSON.stringify(s)); },
  getPatients(): Patient[] { const d = localStorage.getItem(KEYS.patients); return d ? JSON.parse(d) : []; },
  savePatients(p: Patient[]) { localStorage.setItem(KEYS.patients, JSON.stringify(p)); },
  getVisits(): Visit[] { const d = localStorage.getItem(KEYS.visits); return d ? JSON.parse(d) : []; },
  saveVisits(v: Visit[]) { localStorage.setItem(KEYS.visits, JSON.stringify(v)); },
  getMedicines(): Medicine[] { const d = localStorage.getItem(KEYS.medicines); return d ? JSON.parse(d) : DEFAULT_MEDICINES; },
  saveMedicines(m: Medicine[]) { localStorage.setItem(KEYS.medicines, JSON.stringify(m)); },
  getCurrentUser(): User | null { const d = localStorage.getItem(KEYS.currentUser); return d ? JSON.parse(d) : null; },
  setCurrentUser(u: User | null) { u ? localStorage.setItem(KEYS.currentUser, JSON.stringify(u)) : localStorage.removeItem(KEYS.currentUser); },
  getTheme(): 'light' | 'dark' { return localStorage.getItem(KEYS.theme) === 'dark' ? 'dark' : 'light'; },
  setTheme(t: 'light' | 'dark') { localStorage.setItem(KEYS.theme, t); },
  generateId(): string { return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; },
  generatePatientId(patients: Patient[]): string {
    const d = new Date().toISOString().slice(0, 7).replace('-', '');
    const n = patients.filter(p => p.patientId.startsWith(`PAT-${d}`)).length + 1;
    return `PAT-${d}-${n.toString().padStart(4, '0')}`;
  },
  /** Normalize a phone number for comparison: digits only, last 10 kept (drops country code variance) */
  normalizePhone(phone: string): string {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  },
  /** Find an existing patient with the same phone number, excluding a given patient id (for edit flows) */
  findPatientByPhone(patients: Patient[], phone: string, excludePatientId?: string): Patient | null {
    const target = this.normalizePhone(phone);
    if (!target) return null;
    return patients.find(p => p.id !== excludePatientId && this.normalizePhone(p.mobile) === target) || null;
  },
  generateBillNumber(visits: Visit[]): string {
    // Continuous sequential series: CLN-00001, CLN-00002, ... never resets
    const maxNum = visits.reduce((max, v) => {
      const match = v.billNumber.match(/CLN-(\d+)$/);
      if (match) return Math.max(max, parseInt(match[1], 10));
      return max;
    }, 0);
    return `CLN-${String(maxNum + 1).padStart(5, '0')}`;
  },
  /** Deduct stock for prescription items after saving a bill */
  /** Deduct stock for prescription items after saving a bill. `quantity` already represents
   *  the full course total (dosage-per-day x days), so it is NOT multiplied by days again. */
  deductStock(prescriptionItems: { medicineId: string; quantity: number; isCustom: boolean }[]) {
    const medicines = this.getMedicines();
    let changed = false;
    for (const item of prescriptionItems) {
      if (item.isCustom || !item.medicineId) continue;
      const idx = medicines.findIndex(m => m.id === item.medicineId);
      if (idx !== -1) {
        medicines[idx].stockCount = Math.max(0, medicines[idx].stockCount - item.quantity);
        changed = true;
      }
    }
    if (changed) this.saveMedicines(medicines);
  },
  /** Restore stock previously deducted for a set of prescription items (used when editing/cancelling a bill). */
  restoreStock(prescriptionItems: { medicineId: string; quantity: number; isCustom: boolean }[]) {
    const medicines = this.getMedicines();
    let changed = false;
    for (const item of prescriptionItems) {
      if (item.isCustom || !item.medicineId) continue;
      const idx = medicines.findIndex(m => m.id === item.medicineId);
      if (idx !== -1) {
        medicines[idx].stockCount = medicines[idx].stockCount + item.quantity;
        changed = true;
      }
    }
    if (changed) this.saveMedicines(medicines);
  },
  /** Append a medical-history entry to a patient's record based on a saved visit */
  addMedicalHistoryFromVisit(patientId: string, visitDate: string, illness: string, diagnosis: string) {
    if (!patientId || (!illness && !diagnosis)) return;
    const patients = this.getPatients();
    const idx = patients.findIndex(p => p.id === patientId);
    if (idx === -1) return;
    const entry = {
      date: visitDate,
      condition: diagnosis || illness || 'Consultation',
      notes: illness && diagnosis ? `Illness: ${illness}` : '',
    };
    const history = patients[idx].medicalHistory || [];
    patients[idx] = { ...patients[idx], medicalHistory: [...history, entry], updatedAt: new Date().toISOString() };
    this.savePatients(patients);
  },
  /** Returns estimated localStorage usage in KB */
  getStorageUsageKB(): number {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += (localStorage.getItem(key)?.length || 0) * 2;
      }
    }
    return Math.round(total / 1024);
  },
};