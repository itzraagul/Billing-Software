import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { Patient, Visit, PrescriptionItem, Medicine, TEST_OPTIONS } from '../types';
import { formatCurrency } from '../utils/helpers';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, Save, X, AlertCircle, Edit2, Check, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams, Link } from '../router';
import { DosageInput, NumInput, dosageSum } from '../components/FormInputs';

type DiscountType = 'amount' | 'percent';

export default function EditVisitPage() {
  const { currentUser } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Snapshot of the ORIGINAL prescription items as they were before editing,
  // so we can correctly restore their stock before applying the new deduction.
  const [originalItems, setOriginalItems] = useState<PrescriptionItem[]>([]);

  const [allUsers] = useState(() => storage.getUsers());
  const doctorList = allUsers.filter(u => (u.role === 'doctor' || u.role === 'expert') && u.isActive);
  const canSelectDoctor = currentUser?.role === 'admin' || currentUser?.role === 'receptionist';
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const attendingIsDoctor = doctorList.find(d => d.id === selectedDoctorId)?.role === 'doctor';

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

  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>(storage.getMedicines);
  const [showMedDropdown, setShowMedDropdown] = useState(-1);
  const [stockErrors, setStockErrors] = useState<Record<number, string>>({});
  const [editingPriceIndex, setEditingPriceIndex] = useState(-1);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const visits = storage.getVisits();
    const found = visits.find(v => v.id === id);
    if (!found) { setNotFound(true); return; }
    setVisit(found);
    setOriginalItems(found.prescriptionItems.map(i => ({ ...i })));
    const patients = storage.getPatients();
    setPatient(patients.find(p => p.id === found.patientId) || null);

    setSelectedDoctorId(found.attendingDoctorId || '');
    setIllness(found.illness);
    setDiagnosis(found.diagnosis);
    setReferringTo(found.referringTo || '');
    setReviewDate(found.reviewDate);
    setAdvisedTests(found.advisedTests);
    setDoctorFee(found.doctorFee);
    setExpertFee(found.expertFee || 0);
    setAdditionalCharges(found.additionalCharges);
    setAdditionalChargesDesc(found.additionalChargesDesc);
    setDiscount(found.discount);
    setDiscountType(found.discountType);
    setNotes(found.notes);
    setPrescriptionItems(found.prescriptionItems.map(i => ({ ...i })));
  }, [id]);

  const getMedSuggestions = (search: string) => {
    if (!search.trim()) return medicines;
    return medicines.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  };

  const calcAmount = (item: PrescriptionItem) => {
    if (item.isFree) return 0;
    const price = isNaN(item.unitPrice) ? 0 : item.unitPrice;
    const qty = isNaN(item.quantity) ? 0 : item.quantity;
    return price * qty;
  };

  const updateItem = (index: number, updates: Partial<PrescriptionItem>) => {
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      next[index].amount = calcAmount(next[index]);
      return next;
    });
  };

  /** Stock available for this row right now, treating any quantity already
   *  reserved by the ORIGINAL (pre-edit) version of this same row as still
   *  "available" to it — so editing a bill without changing a medicine's
   *  quantity never falsely reports a stock shortfall. */
  const availableStockFor = (med: Medicine, index: number) => {
    const original = originalItems[index];
    const reservedByThisRowOriginally = (original && original.medicineId === med.id && !original.isCustom)
      ? original.quantity : 0;
    return med.stockCount + reservedByThisRowOriginally;
  };

  const validateStock = (index: number, med: Medicine | null, totalQty: number) => {
    const errs = { ...stockErrors };
    if (!med || med.isFree) { delete errs[index]; setStockErrors(errs); return; }
    const available = availableStockFor(med, index);
    if (totalQty > available) {
      errs[index] = `Only ${available} in stock. Needed: ${totalQty}`;
    } else { delete errs[index]; }
    setStockErrors(errs);
  };

  const recalcQtyFromDosageAndDays = (index: number, dosage: string, days: number) => {
    setPrescriptionItems(prev => {
      const next = [...prev];
      const isTablet = next[index]?.medicineType === 'Tablet';
      const safeDays = isNaN(days) ? 0 : days;
      if (isTablet) {
        const perDay = dosageSum(dosage);
        next[index] = { ...next[index], dosage, days: safeDays, quantity: perDay * safeDays };
      } else {
        next[index] = { ...next[index], dosage, days: safeDays };
      }
      next[index].amount = calcAmount(next[index]);
      return next;
    });
    const med = medicines.find(m => m.id === prescriptionItems[index]?.medicineId);
    const isTablet = prescriptionItems[index]?.medicineType === 'Tablet';
    if (med && isTablet) validateStock(index, med, dosageSum(dosage) * (isNaN(days) ? 0 : days));
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
    updateItem(index, { quantity: qty });
    const med = medicines.find(m => m.id === prescriptionItems[index]?.medicineId);
    if (med) validateStock(index, med, qty);
  };

  const selectMedicine = (index: number, med: Medicine) => {
    const days = 1;
    const perDay = dosageSum(med.defaultDosage || '0-0-0-0') || med.minQuantity;
    const isTablet = med.type === 'Tablet';
    const qty = isTablet ? (med.defaultDosage ? perDay * days : med.minQuantity) : 1;
    const amount = med.isFree ? 0 : med.unitPrice * qty;
    setPrescriptionItems(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index], medicineId: med.id, medicineName: med.name,
        medicineType: med.type, isCustom: false, dosage: med.defaultDosage || '0-0-0-0',
        quantity: qty, days, unitPrice: med.isFree ? 0 : med.unitPrice,
        isFree: med.isFree, amount,
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

  const addPrescriptionRow = () => {
    setPrescriptionItems(prev => [...prev, {
      id: storage.generateId(), visitId: visit?.id || '', medicineId: '', medicineName: '',
      medicineType: 'Tablet', isCustom: false, dosage: '1-1-1-0',
      quantity: 3, days: 1, unitPrice: 0, amount: 0, isFree: false,
    }]);
  };

  const removeRow = (index: number) => {
    setPrescriptionItems(p => p.filter((_, i) => i !== index));
    const e = { ...stockErrors }; delete e[index]; setStockErrors(e);
  };

  const medicineCharges = prescriptionItems.reduce((s, i) => s + i.amount, 0);
  const effectiveExpertFee = attendingIsDoctor ? expertFee : 0;
  const discountAmount = discountType === 'percent'
    ? ((doctorFee + effectiveExpertFee + medicineCharges + additionalCharges) * discount / 100)
    : discount;
  const grandTotal = Math.max(0, doctorFee + effectiveExpertFee + medicineCharges + additionalCharges - discountAmount);
  const hasStockErrors = Object.keys(stockErrors).length > 0;

  const handleSave = () => {
    if (!visit) return;
    if (hasStockErrors) { alert('Please fix stock quantity errors before saving.'); return; }
    if (canSelectDoctor && !selectedDoctorId) { alert('Please select the attending doctor.'); return; }

    const updatedVisit: Visit = {
      ...visit,
      illness, diagnosis, referringTo, reviewDate, advisedTests,
      doctorFee, expertFee: effectiveExpertFee, medicineCharges, additionalCharges, additionalChargesDesc,
      discount, discountType, grandTotal, notes, prescriptionItems,
      attendingDoctorId: selectedDoctorId || visit.attendingDoctorId,
      updatedAt: new Date().toISOString(),
    };

    // Reconcile stock: give back what the original prescription reserved,
    // then deduct what the edited prescription now needs. Doing both in
    // one pass (rather than two separate storage writes) avoids any
    // intermediate state where stock briefly looks wrong.
    storage.restoreStock(originalItems);
    storage.deductStock(prescriptionItems);

    const visits = storage.getVisits();
    const saved_ = visits.map(v => v.id === visit.id ? updatedVisit : v);
    storage.saveVisits(saved_);

    if (!visit.isQuickBill && patient && (illness !== visit.illness || diagnosis !== visit.diagnosis)) {
      storage.addMedicalHistoryFromVisit(patient.id, visit.visitDate, illness, diagnosis);
    }

    setMedicines(storage.getMedicines());
    setSaved(true);
    setTimeout(() => navigate(`/visits/${visit.id}`), 900);
  };

  const toggleTest = (t: string) => setAdvisedTests(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Visit not found</p>
          <Link to="/visits" className="text-emerald-600 dark:text-emerald-400 hover:underline mt-2 inline-block">Back to Visits</Link>
        </div>
      </div>
    );
  }

  if (!visit) return null;

  const dispName = visit.isQuickBill ? visit.patientName : patient?.name;
  const dispAge = visit.isQuickBill ? visit.patientAge : patient?.age;
  const dispSex = visit.isQuickBill ? visit.patientSex : patient?.sex;
  const dispId = visit.isQuickBill ? '(Quick Bill)' : patient?.patientId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/visits/${visit.id}`} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Bill — {visit.billNumber}</h1>
          {visit.isCancelled && <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full">This bill is cancelled</span>}
        </div>
      </div>

      {/* Patient (read-only) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Patient</h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="font-medium text-gray-900 dark:text-white">{dispName}</span>
          <span className="text-gray-500 dark:text-gray-400">{dispAge} / {dispSex}</span>
          <span className="text-gray-400 font-mono text-xs">{dispId}</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Patient cannot be changed on an existing bill. Cancel this bill and create a new one if it was issued to the wrong patient.</p>
      </div>

      {/* Consultation Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Consultation Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {canSelectDoctor && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Attending Doctor *</label>
              {doctorList.length > 0 ? (
                <select value={selectedDoctorId} onChange={e=>setSelectedDoctorId(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500">
                  <option value="">Select a doctor...</option>
                  {doctorList.map(d => <option key={d.id} value={d.id}>{d.fullName}{d.role==='expert' ? ` (${(d as any).specialization||'Expert'})` : d.qualification ? ` — ${d.qualification}` : ''}</option>)}
                </select>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">No doctor accounts found.</p>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Illness / Problem</label>
            <textarea value={illness} onChange={e=>setIllness(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Diagnosis</label>
            <textarea value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referring To</label>
            <input type="text" value={referringTo} onChange={e=>setReferringTo(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Review Date</label>
            <input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Advised Tests</label>
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
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Selling Price</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Free?</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {prescriptionItems.map((item, index) => (
                  <tr key={item.id}>
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
                                  <span className={availableStockFor(med, index) <= 10 ? 'text-red-500 font-medium' : 'text-gray-400'}>Stock: {availableStockFor(med, index)}</span>
                                </div>
                              </button>
                            ))}
                            {item.medicineName.trim() && (
                              <button onClick={()=>useCustomMedicine(index, item.medicineName)}
                                className="w-full px-3 py-2.5 text-left text-sm text-emerald-600 dark:text-emerald-400 border-t border-gray-100 dark:border-gray-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2">
                                <Plus className="w-3 h-3"/>Use "{item.medicineName}" as custom medicine
                              </button>
                            )}
                            <button onClick={()=>setShowMedDropdown(-1)} className="w-full px-3 py-2 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">Close</button>
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
                    <td className="px-3 py-2 align-top">
                      <DosageInput value={item.dosage} type={item.medicineType} onChange={v=>handleDosageChange(index,v)}/>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <NumInput value={item.days} min={1} onChange={v=>handleDaysChange(index,v)}
                        className="w-14 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:ring-1 focus:ring-emerald-500"/>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <NumInput value={item.quantity} min={0} onChange={v=>handleQtyChange(index,v)}
                        className="w-16 px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center focus:ring-1 focus:ring-emerald-500"/>
                      <div className="text-xs text-gray-400 text-center">{item.medicineType==='Syrup'?'ml':'tabs'}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {editingPriceIndex===index ? (
                        <div className="flex items-center gap-1">
                          <NumInput value={item.unitPrice} min={0} allowDecimal onChange={v=>updateItem(index,{unitPrice:v})}
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
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      <input type="checkbox" checked={item.isFree} onChange={e=>updateItem(index,{isFree:e.target.checked,unitPrice:e.target.checked?0:item.unitPrice})} className="w-4 h-4 accent-emerald-600 cursor-pointer mt-1.5"/>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-white align-top">
                      <div className="py-1.5">{item.isFree ? <span className="text-green-600 text-sm">FREE</span> : formatCurrency(item.amount)}</div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button onClick={()=>removeRow(index)} className="text-red-400 hover:text-red-600 mt-1.5 block"><Trash2 className="w-4 h-4"/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No medicines on this bill. Click "Add Medicine" to add one.</p>
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
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medicine Charges</label>
            <div className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 font-medium cursor-not-allowed">{formatCurrency(medicineCharges)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Charges</label>
            <NumInput value={additionalCharges} min={0} allowDecimal onChange={setAdditionalCharges} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Charges Description</label>
            <input type="text" value={additionalChargesDesc} onChange={e=>setAdditionalChargesDesc(e.target.value)} className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          </div>
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

      <div className="flex justify-end gap-3">
        <Link to={`/visits/${visit.id}`} className="px-6 py-3 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium flex items-center gap-2">
          <X className="w-4 h-4"/>Discard Changes
        </Link>
        <button onClick={handleSave} disabled={hasStockErrors} className={`px-8 py-3 rounded-lg flex items-center gap-2 font-semibold text-lg shadow-lg transition-colors ${hasStockErrors?'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed':'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/25'}`}>
          {saved ? <><Check className="w-5 h-5"/>Saved!</> : <><Save className="w-5 h-5"/>Save Changes</>}
        </button>
      </div>
    </div>
  );
}
