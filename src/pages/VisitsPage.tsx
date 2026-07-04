import { useState } from 'react';
import { storage } from '../utils/storage';
import { Visit, Patient } from '../types';
import { formatCurrency } from '../utils/helpers';
import { Search, Eye, Printer, Calendar, XCircle, Edit, AlertTriangle } from 'lucide-react';
import { useNavigate } from '../router';
import { buildPrintDocument, maybeShowPrintTip } from '../components/printStyles';
import { useAuth } from '../contexts/AuthContext';

export default function VisitsPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const allVisits = storage.getVisits();
  // Req 9/10: doctors & experts only see their own bills; admin & receptionist see all
  const visibleVisits = (() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'receptionist') return allVisits;
    // doctor or expert: only bills where attendingDoctorId === their id
    return allVisits.filter(v => v.attendingDoctorId === currentUser.id);
  })();
  const [visits, setVisits] = useState<Visit[]>(visibleVisits);
  const [patients] = useState<Patient[]>(storage.getPatients());
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);

  const getPatient = (id: string) => patients.find(p => p.id === id);
  const getDisplayName = (v: Visit) => v.isQuickBill ? (v.patientName || 'Quick Bill') : (getPatient(v.patientId)?.name || '—');
  const getDisplayMobile = (v: Visit) => v.isQuickBill ? (v.patientMobile || '') : (getPatient(v.patientId)?.mobile || '');

  const filteredVisits = visits.filter(v => {
    const q = searchQuery.toLowerCase();
    const matchSearch = v.billNumber.toLowerCase().includes(q) || getDisplayName(v).toLowerCase().includes(q) || getDisplayMobile(v).includes(q);
    const matchDate = !dateFilter || v.visitDate === dateFilter;
    return matchSearch && matchDate;
  });

  const handleCancel = (id: string) => {
    const updated = visits.map(v => v.id === id ? { ...v, isCancelled: true, cancelledAt: new Date().toISOString() } : v);
    storage.saveVisits(updated); setVisits(updated); setCancelConfirm(null);
  };

  const handlePrint = (visit: Visit) => {
    const patient = getPatient(visit.patientId);
    const clinicSettings = storage.getClinicSettings();
    const users = storage.getUsers();
    const doctor = users.find(u => u.id === visit.attendingDoctorId) || users.find(u => u.id === visit.createdBy && u.role === 'doctor') || users.find(u => u.role === 'doctor');
    const discAmt = visit.discountType === 'percent' ? ((visit.doctorFee + (visit.expertFee||0) + visit.medicineCharges + visit.additionalCharges) * visit.discount / 100) : visit.discount;
    const dispName = visit.isQuickBill ? visit.patientName : patient?.name;
    const dispAge = visit.isQuickBill ? visit.patientAge : patient?.age;
    const dispSex = visit.isQuickBill ? visit.patientSex : patient?.sex;
    const dispMobile = visit.isQuickBill ? visit.patientMobile : patient?.mobile;
    const bodyHtml = `
    ${visit.isCancelled ? '<div class="cancelled-banner">⚠ CANCELLED BILL</div>' : ''}
    <div class="header">
      ${clinicSettings.clinicLogoUrl ? `<img class="logo" src="${clinicSettings.clinicLogoUrl}"/>` : ''}
      <div style="font-size:18px;font-weight:bold;color:#065f46">${clinicSettings.clinicName}</div>
      <div style="font-size:10.5px;color:#6b7280">${clinicSettings.clinicAddress} | Ph: ${clinicSettings.clinicPhone}</div>
      ${doctor ? `<div style="font-size:10.5px;font-weight:600;margin-top:3px">${doctor.fullName}${doctor.role==='expert' ? ` (${(doctor as any).specialization||'Expert'})` : doctor.qualification ? ' — ' + doctor.qualification : ''}${doctor.registrationNumber ? ' | Reg: ' + doctor.registrationNumber : ''}</div>` : ''}
    </div>
    <div class="bill-info">
      <div><b>Bill No:</b> ${visit.billNumber}${visit.isQuickBill ? ' <span class="quick-badge">Quick</span>' : ''}</div>
      <div><b>Date:</b> ${visit.visitDate} &nbsp;<b>Time:</b> ${visit.visitTime}</div>
    </div>
    <div style="background:#f9fafb;padding:8px;border-radius:6px;font-size:11px;margin-bottom:10px">
      <b style="color:#065f46">Patient</b><br/>
      <span><b>Name:</b> ${dispName}</span> &nbsp; <span><b>Age/Sex:</b> ${dispAge}/${dispSex}</span> &nbsp; ${dispMobile ? `<span><b>Mobile:</b> ${dispMobile}</span>` : ''}
    </div>
    ${(visit.illness || visit.diagnosis || visit.referringTo || visit.advisedTests.length > 0) ? `
    <div class="section-title">Consultation</div>
    <div style="font-size:11px">
      ${visit.illness ? `<div><b>Illness:</b> ${visit.illness}</div>` : ''}
      ${visit.diagnosis ? `<div><b>Diagnosis:</b> ${visit.diagnosis}</div>` : ''}
      ${visit.referringTo ? `<div><b>Referring To:</b> ${visit.referringTo}</div>` : ''}
      <div><b>Advised Tests:</b> ${visit.advisedTests.length > 0 ? visit.advisedTests.join(', ') : 'NA'}</div>
      ${visit.notes ? `<div><b>Notes:</b> ${visit.notes}</div>` : ''}
      ${visit.reviewDate ? `<div><b>Review:</b> ${visit.reviewDate}</div>` : ''}
    </div>` : ''}
    ${visit.prescriptionItems.length > 0 ? `
    <div class="section-title">Prescription</div>
    <table><thead><tr><th>#</th><th>Medicine</th><th>Type</th><th>Dosage</th><th>Qty</th><th>Days</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${visit.prescriptionItems.map((item,i) => `<tr><td>${i+1}</td><td>${item.medicineName}${item.isCustom?'<span style="color:#9ca3af;font-size:10px"> (custom)</span>':''}</td><td>${item.medicineType}</td><td>${item.dosage}</td><td>${item.quantity}${item.medicineType==='Syrup'?'ml':' tab'}</td><td>${item.days}</td><td style="text-align:right">${item.isFree?'FREE':'₹'+item.amount.toFixed(2)}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="summary">
      <div class="section-title" style="margin-top:0">Billing Summary</div>
      <div class="summary-row"><span>Doctor Fee</span><span>₹${visit.doctorFee.toFixed(2)}</span></div>
      ${visit.expertFee > 0 ? `<div class="summary-row"><span>Expert / Technician Fee</span><span>₹${visit.expertFee.toFixed(2)}</span></div>` : ''}
      <div class="summary-row"><span>Medicine Charges</span><span>₹${visit.medicineCharges.toFixed(2)}</span></div>
      ${visit.additionalCharges > 0 ? `<div class="summary-row"><span>Additional${visit.additionalChargesDesc ? ' (' + visit.additionalChargesDesc + ')' : ''}</span><span>₹${visit.additionalCharges.toFixed(2)}</span></div>` : ''}
      ${visit.discount > 0 ? `<div class="summary-row" style="color:#dc2626"><span>Discount${visit.discountType === 'percent' ? ' (' + visit.discount + '%)' : ''}</span><span>-₹${discAmt.toFixed(2)}</span></div>` : ''}
      <div class="summary-row total"><span>Grand Total</span><span>₹${visit.grandTotal.toFixed(2)}</span></div>
    </div>`;

    const bottomHtml = `
    <div class="sig-row">
      ${clinicSettings.clinicSealUrl ? `<img class="seal" src="${clinicSettings.clinicSealUrl}"/>` : '<div></div>'}
      <div class="sig-block">
        ${doctor?.signatureUrl ? `<img class="sig" src="${doctor.signatureUrl}"/>` : ''}
        <div class="sig-line">${doctor?.fullName || ''}</div>
        <div class="sig-label">${(doctor as any)?.role==='expert' ? 'Expert Signature' : 'Doctor Signature'}</div>
      </div>
    </div>
    <div class="footer">Thank you for visiting ${clinicSettings.clinicName}.</div>`;

    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(buildPrintDocument(`Bill - ${visit.billNumber}`, bodyHtml, bottomHtml));
    w.document.close(); w.print();
    maybeShowPrintTip();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Visits & Bills</h1>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
          <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search by bill no, name, mobile..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-gray-400"/>
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}
            className="px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"/>
          {dateFilter && <button onClick={()=>setDateFilter('')} className="text-gray-400 hover:text-gray-600"><XCircle className="w-4 h-4"/></button>}
        </div>
      </div>

      {/* Cancel Confirm */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-3"><AlertTriangle className="w-6 h-6 text-red-500"/><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cancel Bill?</h3></div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will mark the bill as cancelled. Stock will NOT be restored automatically.</p>
            <div className="flex gap-3">
              <button onClick={()=>setCancelConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Keep Bill</button>
              <button onClick={()=>handleCancel(cancelConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Cancel Bill</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Bill No','Patient','Date','Doctor Fee','Med Charges','Total','Status','Actions'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredVisits.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">{searchQuery || dateFilter ? 'No visits found' : 'No visits yet'}</td></tr>
              ) : filteredVisits.map(visit => (
                <tr key={visit.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${visit.isCancelled ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm text-emerald-600 dark:text-emerald-400">{visit.billNumber}</div>
                    {visit.isQuickBill && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Quick</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm text-gray-900 dark:text-white">{getDisplayName(visit)}</div>
                    <div className="text-xs text-gray-500">{visit.isQuickBill ? `${visit.patientAge}/${visit.patientSex}` : getPatient(visit.patientId)?.patientId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{visit.visitDate}<div className="text-xs">{visit.visitTime}</div></td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatCurrency(visit.doctorFee)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatCurrency(visit.medicineCharges)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(visit.grandTotal)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${visit.isCancelled ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                      {visit.isCancelled ? 'Cancelled' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={()=>navigate(`/visits/${visit.id}`)} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="View"><Eye className="w-4 h-4"/></button>
                      <button onClick={()=>handlePrint(visit)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Print"><Printer className="w-4 h-4"/></button>
                      {!visit.isCancelled && <>
                        <button onClick={()=>navigate(`/visits/${visit.id}/edit`)} className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20" title="Edit Bill"><Edit className="w-4 h-4"/></button>
                        <button onClick={()=>setCancelConfirm(visit.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20" title="Cancel Bill"><XCircle className="w-4 h-4"/></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
