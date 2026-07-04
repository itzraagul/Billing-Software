export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'expert';
export type MedicineType = 'Tablet' | 'Syrup' | 'Drug' | 'Non-Consumable' | 'Ointment/Cream' | 'Others';
export type SyrupSize = 'Small' | 'Medium' | 'Large' | 'Regular';

export interface User {
  id: string;
  userId: string;
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  // Doctor/Expert fields
  qualification?: string;
  registrationNumber?: string;
  signatureUrl?: string;
  specialization?: string; // for expert/technician
  profilePhotoUrl?: string; // account profile picture, any role
}

export interface ClinicSettings {
  id: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicLogoUrl: string;
  clinicSealUrl: string;  // digital seal
}

export interface MedicalHistory {
  date: string;
  condition: string;
  notes: string;
}

export interface Patient {
  id: string;
  patientId: string;
  name: string;
  dob?: string;        // ISO date string YYYY-MM-DD (optional)
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  mobile: string;
  address: string;
  bloodGroup?: string;
  allergies?: string;
  medicalHistory?: MedicalHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface Medicine {
  id: string;
  name: string;
  type: MedicineType;
  manufacturerName: string;
  information: string;
  defaultDosage: string;
  minQuantity: number;
  tabsPerStrip?: number;    // tablets per strip (Tablet only)
  stripOnly?: boolean;      // if true, sell by full strip only (Tablet only)
  syrupSize?: SyrupSize;    // bottle/tube size (Syrup + Ointment/Cream)
  stockCount: number;
  unitPrice: number;        // selling price per STRIP for Tablet; per unit for others
  purchasedPrice: number;
  isFree: boolean;
}

export interface PrescriptionItem {
  id: string;
  visitId: string;
  medicineId: string;
  medicineName: string;
  medicineType: MedicineType;
  isCustom: boolean;
  dosage: string;
  quantity: number;
  days: number;
  unitPrice: number;
  amount: number;
  isFree: boolean;
}

export interface Visit {
  id: string;
  patientId: string;
  patientName?: string;
  patientAge?: number;
  patientSex?: string;
  patientMobile?: string;
  isQuickBill: boolean;
  billNumber: string;
  visitDate: string;
  visitTime: string;
  illness: string;
  diagnosis: string;
  referringTo?: string;
  reviewDate: string;
  advisedTests: string[];
  doctorFee: number;
  expertFee: number; // optional add-on for Expert/Technician service bundled into a Doctor bill
  medicineCharges: number;
  additionalCharges: number;
  additionalChargesDesc: string;
  discount: number;
  discountType: 'amount' | 'percent';
  grandTotal: number;
  notes: string;
  prescriptionItems: PrescriptionItem[];
  attendingDoctorId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isCancelled?: boolean;
  cancelledAt?: string;
}

export interface DashboardStats {
  todayPatients: number;
  todayRevenue: number;
  periodRevenue: number;
  totalPatients: number;
  upcomingReviews: number;
}

export const TEST_OPTIONS = [
  'Blood Test', 'X-Ray', 'MRI', 'CT Scan', 'Ultrasound',
  'ECG', 'Urine Test', 'COVID-19 Test', 'Thyroid Test',
  'Liver Function Test', 'Kidney Function Test', 'Lipid Profile',
  'Blood Sugar', 'HbA1c',
];

export const MEDICINE_TYPES: MedicineType[] = ['Tablet', 'Syrup', 'Drug', 'Non-Consumable', 'Ointment/Cream', 'Others'];
export const SYRUP_SIZES: SyrupSize[] = ['Small', 'Medium', 'Large', 'Regular'];

export const DEFAULT_MEDICINES: Medicine[] = [
  { id: '1', name: 'Paracetamol 500mg', type: 'Tablet', manufacturerName: 'Generic', information: 'Fever and pain relief', defaultDosage: '1-1-1-0', minQuantity: 10, tabsPerStrip: 10, stockCount: 100, unitPrice: 2, purchasedPrice: 15, isFree: false },
  { id: '2', name: 'Amoxicillin 500mg', type: 'Tablet', manufacturerName: 'Generic', information: 'Antibiotic', defaultDosage: '1-1-1-0', minQuantity: 15, tabsPerStrip: 10, stockCount: 80, unitPrice: 5, purchasedPrice: 40, isFree: false },
  { id: '3', name: 'Cough Syrup 100ml', type: 'Syrup', manufacturerName: 'Generic', information: 'Cough relief', defaultDosage: '10-10-10-0', minQuantity: 1, syrupSize: 'Medium', stockCount: 30, unitPrice: 2, purchasedPrice: 60, isFree: false },
  { id: '4', name: 'Omeprazole 20mg', type: 'Tablet', manufacturerName: 'Generic', information: 'Acid reflux', defaultDosage: '0-0-1-0', minQuantity: 10, tabsPerStrip: 10, stockCount: 60, unitPrice: 8, purchasedPrice: 60, isFree: false },
  { id: '5', name: 'Cetirizine 10mg', type: 'Tablet', manufacturerName: 'Generic', information: 'Antihistamine', defaultDosage: '0-0-1-0', minQuantity: 5, tabsPerStrip: 10, stockCount: 70, unitPrice: 3, purchasedPrice: 22, isFree: false },
];

export const DEFAULT_USERS: User[] = [
  { id: 'admin-1', userId: 'admin', email: 'admin@clinic.com', password: 'admin123', fullName: 'Admin User', role: 'admin', isActive: true },
  { id: 'doctor-1', userId: 'doctor', email: 'doctor@clinic.com', password: 'doctor123', fullName: 'Dr. Smith', role: 'doctor', isActive: true, qualification: 'MBBS, MD', registrationNumber: 'MCI-12345', signatureUrl: '' },
  { id: 'receptionist-1', userId: 'reception', email: 'reception@clinic.com', password: 'reception123', fullName: 'Reception User', role: 'receptionist', isActive: true },
];

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  id: 'clinic-1',
  clinicName: 'My Clinic',
  clinicAddress: '123 Medical Street, City - 400001',
  clinicPhone: '+91 9876543210',
  clinicLogoUrl: '',
  clinicSealUrl: '',
};
