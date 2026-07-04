import { useState, useRef } from 'react';
import { storage } from '../utils/storage';
import { Patient, Visit, PrescriptionItem, Medicine, MedicineType, TEST_OPTIONS } from '../types';
import { formatCurrency, getCurrentDate, getCurrentTime, calcTabletAmount, roundToHalf } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import { Search, Plus, Trash2, Save, Printer, X, FileText, Zap, Edit2, Check, AlertCircle } from 'lucide-react';
import { useNavigate } from '../router';
import { DosageInput, NumInput, NumTextInput, dosageDisplay, dosageSum } from '../components/FormInputs';
import { buildPrintDocument, maybeShowPrintTip } from '../components/printStyles';

type BillMode = 'registered' | 'quick';
type DiscountType = 'amount' | 'percent';

export default function NewVisitPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const printBottomRef = useRef<HTMLDivElement>(null);

  const [billMode, setBillMode] = useState<BillMode>('registered');
  const [quickPatient, setQuickPatient] = useState({ name: '', age: '', sex: 'Male' as 'Male'|'Female'|'Other', mobile: '' });
  const [patients] = useState<Patient[]>(storage.getPatients);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  // Doctor selection (Req 4): only admin/receptionist accounts choose a doctor; doctors bill under themselves
  const [allUsers] = useState(() => storage.getUsers());
  // Expert/Technician users can also generate standalone bills
  const doctorList = allUsers.filter(u => (u.role === 'doctor' || u.role === 'expert') && u.isActive);
  const canSelectDoctor = currentUser?.role === 'admin' || currentUser?.role === 'receptionist';
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    (currentUser?.role === 'doctor' || currentUser?.role === 'expert') ? currentUser.id : (doctorList[0]?.id || '')
  );
  // Expert/Technician Fee field is only relevant when the attending person is a Doctor
  // (bundling e.g. an X-ray tech or physio session into the doctor's own bill).
  const attendingIsDoctor = doctorList.find(d => d.id === selectedDoctorId)?.role === 'doctor';

  // Visit fields
  const [illness, setIllness] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [referringTo, setReferringTo] = useState('');
  const [reviewDate, setReviewDate] = useState('');
  const [advisedTests, setAdvisedTests] = useState<string[]>([]);
  const [doctorFee, setDoctorFee] = useState(0);
  const [expertFee, setExpertFee] = useState(0);
  const [additionalCharges, setAdditionalCharges] = useState(0);
  const [additionalChargesDesc, setAdditionalChargesDesc] = useState('');
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>('amount');
  const [notes, setNotes] = useState('');

  // Prescription
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>(storage.getMedicines);
  const [showMedDropdown, setShowMedDropdown] = useState(-1);
  const [stockErrors, setStockErrors] = useState<Record<number, string>>({});
  const [editingPriceIndex, setEditingPriceIndex] = useState(-1);

  const [savedVisit, setSavedVisit] = useState<Visit | null>(null);
  const [savedPatient, setSavedPatient] = useState<Patient | null>(null);

  const filteredPatients = patients.filter(p => {
    const q = patientSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.mobile.includes(q) || p.patientId.toLowerCase().includes(q);
  });

  const getMedSuggestions = (search: string) => {
    if (!search.trim()) return medicines;
    return medicines.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  };

  /* ---- Prescription operations ---- */
  const addPrescriptionRow = () => {
    setPrescriptionItems(prev => [...prev, {
      id: storage.generateId(), visitId: '', medicineId: '', medicineName: '',
      medicineType: 'Tablet', isCustom: false, dosage: '1-1-1-0',
      quantity: 3, days: 1, unitPrice: 0, amount: 0, isFree: false,
    }]);
  };

  /** Amount = unitPrice x Quantity. Quantity already represents the FULL course total (dosage-per-day x Days). */
  /** Get the medicine object for a prescription item */
  const getMedForItem = (item: PrescriptionItem) => medicines.find(m => m.id === item.medicineId);

  /** Calculate amount for a prescription item using strip-based pricing for tablets */
  const calcAmount = (item: PrescriptionItem, overrideMed?: Medicine): number => {
    if (item.isFree) return 0;
    const med = overrideMed || getMedForItem(item);
    if (!item.isCustom && med && med.type === 'Tablet' && med.tabsPerStrip && med.tabsPerStrip > 0) {
      const { amount } = calcTabletAmount(med.unitPrice, med.tabsPerStrip, item.quantity, med.stripOnly || false);
      return amount;
    }
    // Non-tablet or custom: unitPrice × qty (unitPrice is per-unit selling price)
    const price = isNaN(item.unitPrice) ? 0 : item.unitPrice;
    const qty = isNaN(item.quantity) ? 0 : item.quantity;
    return roundToHalf(price * qty);
  };

  /** For strip-only tablets, round qty up to next full strip */
  const effectiveQty = (item: PrescriptionItem, med?: Medicine): number => {
    const m = med || getMedForItem(item);
    if (!item.isCustom && m && m.type === 'Tablet' && m.stripOnly && m.tabsPerStrip) {
      const strips = Math.ceil(item.quantity / m.tabsPerStrip);
      return strips * m.tabsPerStrip;
    }
    return item.quantity;
  };

  const updateItem = (index: number, updates: Partial<PrescriptionItem>) => {
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      next[index].amount = calcAmount(next[index]);
      return next;
    });
  };

  /** Auto-populate Qty = (sum of dosage per day) x Days — tablets only; rounds up for strip-only */
  const recalcQtyFromDosageAndDays = (index: number, dosage: string, days: number) => {
    setPrescriptionItems(prev => {
      const next = [...prev];
      const isTablet = next[index]?.medicineType === 'Tablet';
      const safeDays = isNaN(days) ? 0 : days;
      if (isTablet) {
        const perDay = dosageSum(dosage);
        const rawQty = perDay * safeDays;
        const med = medicines.find(m => m.id === next[index]?.medicineId);
        // For strip-only: round up to full strips
        let qty = rawQty;
        if (med?.stripOnly && med.tabsPerStrip) {
          qty = Math.ceil(rawQty / med.tabsPerStrip) * med.tabsPerStrip;
        }
        next[index] = { ...next[index], dosage, days: safeDays, quantity: qty };
      } else {
        next[index] = { ...next[index], dosage, days: safeDays };
      }
      next[index].amount = calcAmount(next[index]);
      return next;
    });
    const med = medicines.find(m => m.id === prescriptionItems[index]?.medicineId);
    const isTablet = prescriptionItems[index]?.medicineType === 'Tablet';
    if (med && isTablet) {
      const rawQty = dosageSum(dosage) * (isNaN(days) ? 0 : days);
      const checkQty = med.stripOnly && med.tabsPerStrip
        ? Math.ceil(rawQty / med.tabsPerStrip) * med.tabsPerStrip : rawQty;
      validateStock(index, med, checkQty);
    }
  };

  const handleDosageChange = (index: number, dosage: string) => {
    const days = prescriptionItems[index]?.days || 1;
    recalcQtyFromDosageAndDays(index, dosage, days);
  };

  const handleDaysChange = (index: number, days: number) => {
    const dosage = prescriptionItems[index]?.dosage || '0-0-0-0';
    recalcQtyFromDosageAndDays(index, dosage, days);
  };

  const handleQtyChange = (index: number, qty: number) => {
    const item = prescriptionItems[index];
    const med = getMedForItem(item);
    // For strip-only: round up to full strips automatically
    let finalQty = qty;
    if (med?.stripOnly && med.tabsPerStrip && med.tabsPerStrip > 0) {
      finalQty = Math.ceil(qty / med.tabsPerStrip) * med.tabsPerStrip;
    }
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], quantity: finalQty };
      next[index].amount = calcAmount(next[index]);
      return next;
    });
    if (med) validateStock(index, med, finalQty);
  };

  const selectMedicine = (index: number, med: Medicine) => {
    const days = 1;
    const isTablet = med.type === 'Tablet';
    const perDay = dosageSum(med.defaultDosage || '0-0-0-0') || med.minQuantity;
    let qty = isTablet ? (med.defaultDosage ? perDay * days : med.minQuantity) : 1;
    // For strip-only tablets, round up to full strip immediately
    if (isTablet && med.stripOnly && med.tabsPerStrip) {
      qty = Math.ceil(qty / med.tabsPerStrip) * med.tabsPerStrip;
    }
    // unitPrice for display: show per-tablet price for tablets
    const displayUnitPrice = isTablet && med.tabsPerStrip
      ? med.unitPrice / med.tabsPerStrip  // per-tablet price for display column
      : med.unitPrice;
    const amount = med.isFree ? 0 : calcAmount(
      { quantity: qty, unitPrice: displayUnitPrice, isFree: false, isCustom: false } as PrescriptionItem, med
    );
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index], medicineId: med.id, medicineName: med.name,
        medicineType: med.type, isCustom: false, dosage: med.defaultDosage || '0-0-0-0',
        quantity: qty, days,
        unitPrice: displayUnitPrice,  // store per-tablet/per-unit for display
        isFree: med.isFree, amount: med.isFree ? 0 : calcAmount({ quantity: qty, unitPrice: displayUnitPrice, isFree: false, isCustom: false } as PrescriptionItem, med),
      };
      return next;
    });
    validateStock(index, med, qty);
    setShowMedDropdown(-1);
  };

  const useCustomMedicine = (index: number, name: string) => {
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], medicineName: name, medicineId: '', isCustom: true, medicineType: 'Tablet', dosage: '1-1-1-0', days: 1, quantity: 1, unitPrice: 0, amount: 0 };
      return next;
    });
    const errs = { ...stockErrors }; delete errs[index]; setStockErrors(errs);
    setShowMedDropdown(-1);
  };

  const validateStock = (index: number, med: Medicine | null, totalQty: number) => {
    const errs = { ...stockErrors };
    if (!med || med.isFree) { delete errs[index]; setStockErrors(errs); return; }
    if (totalQty > med.stockCount) {
      errs[index] = `Only ${med.stockCount} in stock. Needed: ${totalQty}`;
    } else { delete errs[index]; }
    setStockErrors(errs);
  };

  /* ---- Billing calcs ---- */
  const medicineCharges = prescriptionItems.reduce((s, i) => s + i.amount, 0);
  // Expert/Technician Fee only counts when the attending person is a Doctor
  const effectiveExpertFee = attendingIsDoctor ? expertFee : 0;
  const discountAmount = discountType === 'percent'
    ? ((doctorFee + effectiveExpertFee + medicineCharges + additionalCharges) * discount / 100)
    : discount;
  const grandTotal = Math.max(0, doctorFee + effectiveExpertFee + medicineCharges + additionalCharges - discountAmount);
  const isPatientReady = billMode === 'quick' ? quickPatient.name.trim() !== '' : selectedPatient !== null;
  const hasStockErrors = Object.keys(stockErrors).length > 0;

  /* ---- Save ---- */
  const handleSave = () => {
    if (!isPatientReady) { alert(billMode === 'quick' ? 'Enter patient name' : 'Select a patient'); return; }
    if (hasStockErrors) { alert('Please fix stock quantity errors before saving.'); return; }
    if (!selectedDoctorId) { alert('Please select the attending doctor.'); return; }
    const visits = storage.getVisits();
    const billNumber = storage.generateBillNumber(visits);
    const visit: Visit = {
      id: storage.generateId(), patientId: selectedPatient?.id || '',
      patientName: billMode === 'quick' ? quickPatient.name : undefined,
      patientAge: billMode === 'quick' ? parseFloat(quickPatient.age) || 0 : undefined,
      patientSex: billMode === 'quick' ? quickPatient.sex : undefined,
      patientMobile: billMode === 'quick' ? quickPatient.mobile : undefined,
      isQuickBill: billMode === 'quick',
      billNumber, visitDate: getCurrentDate(), visitTime: getCurrentTime(),
      illness, diagnosis, referringTo, reviewDate, advisedTests,
      doctorFee, expertFee: effectiveExpertFee, medicineCharges, additionalCharges, additionalChargesDesc,
      discount, discountType, grandTotal, notes, prescriptionItems,
      attendingDoctorId: selectedDoctorId,
      createdBy: currentUser?.id || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    storage.saveVisits([visit, ...visits]);
    storage.deductStock(prescriptionItems);
    if (billMode === 'registered' && selectedPatient) {
      storage.addMedicalHistoryFromVisit(selectedPatient.id, visit.visitDate, illness, diagnosis);
    }
    setMedicines(storage.getMedicines());
    setSavedVisit(visit);
    setSavedPatient(selectedPatient);
  };

  const toggleTest = (t: string) => setAdvisedTests(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  /* ---- Print ---- */
  const handlePrint = () => {
    const el = printRef.current; if (!el) return;
    const bottomEl = printBottomRef.current;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(buildPrintDocument(
      `Bill - ${savedVisit?.billNumber}`,
      el.innerHTML,
      bottomEl?.innerHTML || ''
    ));
    w.document.close(); w.print();
    maybeShowPrintTip();
  };

  const clinicSettings = storage.getClinicSettings();
  const users = storage.getUsers();
  const doctor = savedVisit ? users.find(u => u.id === savedVisit.attendingDoctorId) : users.find(u => u.id === selectedDoctorId);

  /* ====== BILL PREVIEW ====== */
  if (savedVisit) {
    const dispName = savedVisit.isQuickBill ? savedVisit.patientName : savedPatient?.name;
    const dispAge = savedVisit.isQuickBill ? savedVisit.patientAge : savedPatient?.age;
    const dispSex = savedVisit.isQuickBill ? savedVisit.patientSex : savedPatient?.sex;
    const dispMobile = savedVisit.isQuickBill ? savedVisit.patientMobile : savedPatient?.mobile;
    const dispId = savedVisit.isQuickBill ? '(Quick Bill)' : savedPatient?.patientId;
    const discAmt = savedVisit.discountType === 'percent'
      ? ((savedVisit.doctorFee + (savedVisit.expertFee||0) + savedVisit.medicineCharges + savedVisit.additionalCharges) * savedVisit.discount / 100)
      : savedVisit.discount;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bill Generated ✓</h1>
          <div className="flex gap-3">
            <button onClick={handlePrint} className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-medium"><Printer className="w-5 h-5"/>Print / PDF</button>
            <button onClick={() => navigate('/visits')} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-lg font-medium">View All Visits</button>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
          <div ref={printRef}>
            {/* Header */}
            <div style={{textAlign:'center',borderBottom:'2px solid #065f46',paddingBottom:'12px',marginBottom:'16px'}}>
              {clinicSettings.clinicLogoUrl && <img src={clinicSettings.clinicLogoUrl} alt="Logo" style={{maxHeight:'80px',margin:'0 auto 8px'}} />}
              <div style={{fontSize:'22px',fontWeight:'bold',color:'#065f46'}}>{clinicSettings.clinicName}</div>
              <div style={{fontSize:'12px',color:'#6b7280'}}>{clinicSettings.clinicAddress}</div>
              <div style={{fontSize:'12px',color:'#6b7280'}}>Ph: {clinicSettings.clinicPhone}</div>
              {doctor && <div style={{fontSize:'12px',color:'#374151',marginTop:'4px',fontWeight:'600'}}>{doctor.fullName}{doctor.role==='expert' ? ` (${(doctor as any).specialization||'Expert'})` : doctor.qualification ? ` — ${doctor.qualification}` : ''}{doctor.registrationNumber ? ` | Reg: ${doctor.registrationNumber}` : ''}</div>}
            </div>
            {/* Bill info */}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'12px',marginBottom:'12px'}}>
              <div><b>Bill No:</b> {savedVisit.billNumber}{savedVisit.isQuickBill && <span style={{background:'#fef3c7',color:'#92400e',padding:'1px 6px',borderRadius:'4px',marginLeft:'6px',fontSize:'10px'}}>Quick</span>}</div>
              <div style={{textAlign:'right'}}><div><b>Date:</b> {savedVisit.visitDate}</div><div><b>Time:</b> {savedVisit.visitTime}</div></div>
            </div>
            {/* Patient */}
            <div style={{marginBottom:'12px',padding:'8px',background:'#f9fafb',borderRadius:'6px',fontSize:'12px'}}>
              <b style={{color:'#065f46'}}>Patient Details</b>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 16px',marginTop:'4px'}}>
                <span><b>Name:</b> {dispName}</span>
                <span><b>Age/Sex:</b> {dispAge} / {dispSex}</span>
                {dispMobile && <span><b>Mobile:</b> {dispMobile}</span>}
                <span><b>Patient ID:</b> {dispId}</span>
              </div>
            </div>
            {/* Clinical */}
            {(savedVisit.illness || savedVisit.diagnosis || savedVisit.referringTo || savedVisit.advisedTests.length > 0) && (
              <div style={{marginBottom:'12px',fontSize:'12px'}}>
                <b style={{color:'#065f46'}}>Consultation Details</b>
                <div style={{marginTop:'4px',lineHeight:'1.6'}}>
                  {savedVisit.illness && <div><b>Illness:</b> {savedVisit.illness}</div>}
                  {savedVisit.diagnosis && <div><b>Diagnosis:</b> {savedVisit.diagnosis}</div>}
                  {savedVisit.referringTo && <div><b>Referring To:</b> {savedVisit.referringTo}</div>}
                  <div><b>Advised Tests:</b> {savedVisit.advisedTests.length > 0 ? savedVisit.advisedTests.join(', ') : 'NA'}</div>
                  {savedVisit.notes && <div><b>Notes:</b> {savedVisit.notes}</div>}
                  {savedVisit.reviewDate && <div><b>Review Date:</b> {savedVisit.reviewDate}</div>}
                </div>
              </div>
            )}
            {/* Prescription */}
            {savedVisit.prescriptionItems.length > 0 && (
              <div style={{marginBottom:'12px'}}>
                <b style={{color:'#065f46',fontSize:'12px'}}>Prescription</b>
                <table>
                  <thead><tr>
                    <th>#</th><th>Medicine</th><th>Type</th><th>Dosage</th>
                    <th style={{textAlign:'center'}}>Qty</th>
                    <th style={{textAlign:'center'}}>Days</th>
                    <th style={{textAlign:'right'}}>Amount</th>
                  </tr></thead>
                  <tbody>
                    {savedVisit.prescriptionItems.map((item, i) => (
                      <tr key={item.id}>
                        <td>{i+1}</td>
                        <td>{item.medicineName}{item.isCustom && <span style={{color:'#6b7280',fontSize:'10px'}}> (custom)</span>}</td>
                        <td>{item.medicineType}</td>
                        <td>{dosageDisplay(item.dosage, item.medicineType)}</td>
                        <td style={{textAlign:'center'}}>{item.quantity}{item.medicineType==='Syrup'?'ml':' tab'}</td>
                        <td style={{textAlign:'center'}}>{item.days}</td>
                        <td style={{textAlign:'right'}}>{item.isFree ? <span style={{color:'green'}}>FREE</span> : formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Billing summary */}
            <div style={{marginBottom:'12px',fontSize:'12px'}}>
              <b style={{color:'#065f46'}}>Billing Summary</b>
              <div style={{marginTop:'4px',lineHeight:'1.8'}}>
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Doctor Fee</span><span>{formatCurrency(savedVisit.doctorFee)}</span></div>
                {savedVisit.expertFee > 0 && <div style={{display:'flex',justifyContent:'space-between'}}><span>Expert / Technician Fee</span><span>{formatCurrency(savedVisit.expertFee)}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between'}}><span>Medicine Charges</span><span>{formatCurrency(savedVisit.medicineCharges)}</span></div>
                {savedVisit.additionalCharges > 0 && <div style={{display:'flex',justifyContent:'space-between'}}><span>Additional {savedVisit.additionalChargesDesc ? `(${savedVisit.additionalChargesDesc})` : ''}</span><span>{formatCurrency(savedVisit.additionalCharges)}</span></div>}
                {savedVisit.discount > 0 && <div style={{display:'flex',justifyContent:'space-between',color:'#dc2626'}}><span>Discount {savedVisit.discountType==='percent' ? `(${savedVisit.discount}%)` : ''}</span><span>-{formatCurrency(discAmt)}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:'bold',fontSize:'14px',borderTop:'2px solid #065f46',paddingTop:'6px',marginTop:'4px',color:'#065f46'}}><span>Grand Total</span><span>{formatCurrency(savedVisit.grandTotal)}</span></div>
              </div>
            </div>
          </div>
          {/* Signature + Seal — separate ref so it's not doubled in print */}
          <div ref={printBottomRef}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginTop:'16px'}}>
              {clinicSettings.clinicSealUrl
                ? <img src={clinicSettings.clinicSealUrl} alt="Clinic Seal" style={{height:'145px',width:'243px',maxWidth:'243px',objectFit:'contain'}}/>
                : <div/>}
              <div style={{textAlign:'right'}}>
                {doctor?.signatureUrl && <img src={doctor.signatureUrl} alt="Signature" style={{height:'145px',width:'243px',maxWidth:'243px',marginLeft:'auto',display:'block',marginBottom:'4px',objectFit:'contain'}}/>}
                <div style={{borderBottom:'1px solid #6b7280',display:'inline-block',paddingBottom:'2px',minWidth:'180px',fontSize:'12px'}}>{doctor?.fullName || ''}</div>
                <div style={{fontSize:'11px',color:'#6b7280',marginTop:'2px'}}>{doctor?.role==='expert'?'Expert Signature':'Doctor Signature'}</div>
              </div>
            </div>
            <div style={{textAlign:'center',color:'#9ca3af',fontSize:'11px',marginTop:'16px',borderTop:'1px solid #e5e7eb',paddingTop:'8px'}}>Thank you for visiting {clinicSettings.clinicName}.</div>
          </div>
        </div>
      </div>
    );
  }

  /* ====== FORM ====== */
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Visit / Bill</h1>

      {/* Mode Toggle */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
        <div className="flex gap-3">
          <button onClick={() => { setBillMode('registered'); setSelectedPatient(null); setPatientSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm ${billMode==='registered'?'bg-emerald-600 text-white':'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            <FileText className="w-4 h-4"/>Registered Patient
          </button>
          <button onClick={() => { setBillMode('quick'); setSelectedPatient(null); setPatientSearch(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm ${billMode==='quick'?'bg-amber-500 text-white':'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            <Zap className="w-4 h-4"/>Quick Bill
          </button>
        </div>
        {billMode==='quick' && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">Quick bills are for walk-in patients. No patient record created.</p>}
      </div>

      {/* Patient Section */}
      {billMode==='registered' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600"/>Select Patient</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
            <input type="text" value={patientSearch} onChange={e=>{setPatientSearch(e.target.value);setShowPatientDropdown(true);}} onFocus={()=>setShowPatientDropdown(true)}
              placeholder="Search by name, mobile, or patient ID..." className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
            {showPatientDropdown && patientSearch && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredPatients.length===0 ? (
                  <div className="p-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">No patient found</p>
                    <button onClick={()=>navigate('/patients')} className="text-sm text-emerald-600 flex items-center gap-1 mx-auto"><FileText className="w-4 h-4"/>Go to Patients to register</button>
                  </div>
                ) : filteredPatients.map(p => (
                  <button key={p.id} onClick={()=>{setSelectedPatient(p);setPatientSearch(p.name);setShowPatientDropdown(false);}}
                    className="w-full px-4 py-3 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-between text-sm">
                    <div><span className="font-medium text-gray-900 dark:text-white">{p.name}</span><span className="text-gray-500 ml-2">{p.age}/{p.sex}</span></div>
                    <span className="text-xs text-gray-400 font-mono">{p.patientId}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedPatient && (
            <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium text-emerald-800 dark:text-emerald-300">{selectedPatient.name}</span>
                <span className="text-emerald-600 ml-2">{selectedPatient.age}/{selectedPatient.sex}</span>
                <span className="text-emerald-500 ml-2">{selectedPatient.mobile}</span>
                {selectedPatient.medicalHistory && selectedPatient.medicalHistory.length > 0 && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{selectedPatient.medicalHistory.length} history entries</span>
                )}
              </div>
              <button onClick={()=>{setSelectedPatient(null);setPatientSearch('');}} className="text-emerald-400 hover:text-emerald-600"><X className="w-4 h-4"/></button>
            </div>
          )}
          {/* Show medical history if available */}
          {selectedPatient?.medicalHistory && selectedPatient.medicalHistory.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Medical History</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedPatient.medicalHistory.map((h, i) => (
                  <div key={i} className="text-xs text-amber-700 dark:text-amber-400">
                    <span className="font-medium">{h.date}</span> — {h.condition}{h.notes ? `: ${h.notes}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!selectedPatient && (
            <p className="mt-3 text-xs text-gray-400">Don't see the patient? Go to <button onClick={()=>navigate('/patients')} className="text-emerald-600 hover:underline">Patients</button> to register a new one.</p>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-700 p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500"/>Quick Bill — Patient Info</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Patient Name *</label>
              <input type="text" value={quickPatient.name} onChange={e=>setQuickPatient({...quickPatient,name:e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400" placeholder="Enter name"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age</label>
              <NumTextInput value={quickPatient.age} onChange={v=>setQuickPatient({...quickPatient,age:v})} allowDecimal className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400" placeholder="Age"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sex</label>
              <select value={quickPatient.sex} onChange={e=>setQuickPatient({...quickPatient,sex:e.target.value as any})} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400">
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile</label>
              <input type="tel" value={quickPatient.mobile} onChange={e=>setQuickPatient({...quickPatient,mobile:e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400" placeholder="Mobile"/>
            </div>
          </div>
        </div>
      )}


      {isPatientReady && (
        <>
          {/* Consultation Details */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Consultation Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {canSelectDoctor && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attending Doctor / Expert *</label>
                  {doctorList.length > 0 ? (
                    <select value={selectedDoctorId} onChange={e=>setSelectedDoctorId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500">
                      <option value="">Select...</option>
                      {doctorList.map(d => <option key={d.id} value={d.id}>{d.fullName}{d.role==='expert' ? ` (${(d as any).specialization || 'Expert'})` : d.qualification ? ` — ${d.qualification}` : ''}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">No doctor/expert accounts found. Add one under Settings → User Management.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Illness / Problem</label>
                <textarea value={illness} onChange={e=>setIllness(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="Describe the illness..."/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diagnosis</label>
                <textarea value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="Enter diagnosis..."/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referring To</label>
                <input type="text" value={referringTo} onChange={e=>setReferringTo(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="Doctor name or hospital (optional)"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review Date</label>
                <input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="Additional notes..."/>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Advised Tests <span className="text-gray-400 text-xs">(leave blank = NA printed)</span></label>
              <div className="flex flex-wrap gap-2">
                {TEST_OPTIONS.map(t => (
                  <button key={t} onClick={()=>toggleTest(t)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${advisedTests.includes(t)?'bg-emerald-600 text-white':'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Prescription */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900 dark:text-white">Prescription</h2>
              <button onClick={addPrescriptionRow} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium">
                <Plus className="w-4 h-4"/>Add Medicine
              </button>
            </div>
            {prescriptionItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase min-w-[180px]">Medicine</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Dosage (M-A-E-N)</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Days</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Qty (auto)</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Free?</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {prescriptionItems.map((item, index) => (
                      <tr key={item.id}>
                        {/* Medicine name with search */}
                        <td className="px-3 py-2 min-w-[200px] align-top">
                          <div className="relative">
                            <input
                              type="text" value={item.medicineName}
                              onChange={e => { updateItem(index, {medicineName: e.target.value, medicineId:'', isCustom:false}); setShowMedDropdown(index); }}
                              onFocus={() => setShowMedDropdown(index)}
                              placeholder="Search medicine..." className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500"/>
                            {showMedDropdown===index && (
                              <div className="absolute z-30 w-72 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                                {getMedSuggestions(item.medicineName).map(med => (
                                  <button key={med.id} onClick={()=>selectMedicine(index, med)}
                                    className="w-full px-3 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm border-b border-gray-50 dark:border-gray-700">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-gray-900 dark:text-white">{med.name}</span>
                                      <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">{med.type}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 flex gap-3 mt-0.5">
                                      <span>{med.isFree ? 'FREE' : `₹${med.unitPrice}/${med.type==='Syrup'?'ml':'tab'}`}</span>
                                      <span className={med.stockCount<=10?'text-red-500 font-medium':'text-gray-400'}>Stock: {med.stockCount}</span>
                                    </div>
                                  </button>
                                ))}
                                {item.medicineName.trim() && (
                                  <button onClick={()=>useCustomMedicine(index, item.medicineName)}
                                    className="w-full px-3 py-2.5 text-left text-sm text-emerald-600 dark:text-emerald-400 border-t border-gray-100 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2">
                                    <Plus className="w-3 h-3"/>Use "{item.medicineName}" as custom medicine
                                  </button>
                                )}
                                <button onClick={()=>setShowMedDropdown(-1)} className="w-full px-3 py-2 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                                  Close
                                </button>
                              </div>
                            )}
                          </div>
                          {item.isCustom && <span className="text-xs text-amber-500 mt-0.5 block">Custom (not from stock)</span>}
                          {stockErrors[index] && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-red-500">
                              <AlertCircle className="w-3 h-3"/>{stockErrors[index]}
                            </div>
                          )}
                        </td>
                        {/* Dosage */}
                        <td className="px-3 py-2 align-top">
                          <DosageInput value={item.dosage} type={item.medicineType} onChange={v=>handleDosageChange(index,v)}/>
                        </td>
                        {/* Days */}
                        <td className="px-3 py-2 align-top">
                          <NumInput value={item.days} min={1} onChange={v=>handleDaysChange(index,v)}
                            className="w-14 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:ring-1 focus:ring-emerald-500"/>
                        </td>
                        {/* Quantity (auto-calculated from Dosage x Days, editable) */}
                        <td className="px-3 py-2 align-top">
                          <NumInput value={item.quantity} min={0} onChange={v=>handleQtyChange(index,v)}
                            className="w-16 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:ring-1 focus:ring-emerald-500"/>
                          <div className="text-xs text-gray-400 text-center">{item.medicineType==='Syrup'?'ml':'tabs'}</div>
                          {(() => { const m = getMedForItem(item); return m?.stripOnly && m.tabsPerStrip ? <div className="text-xs text-orange-500 text-center">{Math.ceil(item.quantity/m.tabsPerStrip)} strips</div> : null; })()}
                        </td>
                        {/* Unit price per tablet/unit */}
                        <td className="px-3 py-2 align-top">
                          {editingPriceIndex===index ? (
                            <div className="flex items-center gap-1">
                              <NumInput value={item.unitPrice} min={0} allowDecimal onChange={v=>updateItem(index,{unitPrice:v, amount: v * item.quantity})}
                                className="w-20 px-2 py-1 border border-emerald-400 rounded text-sm text-right dark:bg-gray-700 dark:text-white" />
                              <button onClick={()=>setEditingPriceIndex(-1)} className="text-emerald-600"><Check className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              <span className={`text-sm font-medium ${item.isFree?'text-green-600':'text-gray-900 dark:text-white'}`}>
                                {item.isFree ? 'FREE' : formatCurrency(item.unitPrice)}
                              </span>
                              {!item.isFree && <button onClick={()=>setEditingPriceIndex(index)} className="text-gray-400 hover:text-emerald-600"><Edit2 className="w-3 h-3"/></button>}
                            </div>
                          )}
                          {(() => { const m = getMedForItem(item); return !item.isCustom && m?.type==='Tablet' && m.tabsPerStrip ? <div className="text-xs text-gray-400 text-right">₹{(m.unitPrice).toFixed(2)}/strip</div> : null; })()}
                        </td>
                        {/* Free */}
                        <td className="px-3 py-2 text-center align-top">
                          <input type="checkbox" checked={item.isFree} onChange={e=>updateItem(index,{isFree:e.target.checked,unitPrice:e.target.checked?0:item.unitPrice})} className="w-4 h-4 accent-emerald-600 cursor-pointer mt-1.5"/>
                        </td>
                        {/* Amount */}
                        <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white align-top">
                          <div className="py-1.5">{item.isFree ? <span className="text-green-600 text-sm">FREE</span> : formatCurrency(item.amount)}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <button onClick={()=>{ setPrescriptionItems(p=>p.filter((_,i)=>i!==index)); const e={...stockErrors}; delete e[index]; setStockErrors(e); }} className="text-red-400 hover:text-red-600 mt-1.5 block"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Click "Add Medicine" to add medicines to the prescription.</p>
            )}
            {prescriptionItems.length > 0 && <div className="mt-3 text-right text-sm font-medium text-gray-900 dark:text-white">Medicine Total: {formatCurrency(medicineCharges)}</div>}
          </div>

          {/* Billing */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Billing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor Fee</label>
                <NumInput value={doctorFee} min={0} allowDecimal onChange={setDoctorFee} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
              </div>
              {attendingIsDoctor && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Expert / Technician Fee <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <NumInput value={expertFee} min={0} allowDecimal onChange={setExpertFee} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
                  <p className="text-xs text-gray-400 mt-1">For a technician/expert service (e.g. X-ray, physio) bundled into this doctor visit.</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medicine Charges</label>
                <div className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 font-medium cursor-not-allowed">{formatCurrency(medicineCharges)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Charges Description</label>
                <input type="text" value={additionalChargesDesc} onChange={e=>setAdditionalChargesDesc(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" placeholder="e.g. Injection, Dressing"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Charges (₹)</label>
                <NumInput value={additionalCharges} min={0} allowDecimal onChange={setAdditionalCharges} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
              </div>
              {/* Discount with type toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount</label>
                <div className="flex gap-2">
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
                    <button onClick={()=>setDiscountType('amount')} className={`px-3 py-2 text-sm font-medium ${discountType==='amount'?'bg-emerald-600 text-white':'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>₹</button>
                    <button onClick={()=>setDiscountType('percent')} className={`px-3 py-2 text-sm font-medium ${discountType==='percent'?'bg-emerald-600 text-white':'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>%</button>
                  </div>
                  <NumInput value={discount} min={0} max={discountType==='percent'?100:undefined} allowDecimal onChange={setDiscount}
                    className="flex-1 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
                </div>
                {discount > 0 && <p className="text-xs text-gray-500 mt-1">Discount amount: {formatCurrency(discountAmount)}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grand Total</label>
                <div className="w-full px-3 py-2.5 border-2 border-emerald-500 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 font-bold text-lg">{formatCurrency(grandTotal)}</div>
              </div>
            </div>
          </div>

          {hasStockErrors && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"/>
              <div>
                <p className="font-medium text-red-800 dark:text-red-300">Stock quantity errors</p>
                <p className="text-sm text-red-600 dark:text-red-400">Please fix the medicine quantity errors above before saving.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={hasStockErrors} className={`px-8 py-3 rounded-lg flex items-center gap-2 font-semibold text-lg shadow-lg transition-colors ${hasStockErrors?'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed':'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/25'}`}>
              <Save className="w-5 h-5"/>Save & Generate Bill
            </button>
          </div>
        </>
      )}
    </div>
  );
}
