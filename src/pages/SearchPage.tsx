import { useState } from 'react';
import { storage } from '../utils/storage';
import { Patient, Visit } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { Search, Printer, ChevronRight, Calendar, User, Clock, FileText, Phone } from 'lucide-react';
import { Link } from '../router';
import { buildPrintDocument, maybeShowPrintTip } from '../components/printStyles';

export default function SearchPage() {
  const [patients] = useState<Patient[]>(storage.getPatients);
  const [visits] = useState<Visit[]>(storage.getVisits);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const filteredPatients = searchQuery
    ? patients.filter(p => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.mobile.includes(q) ||
          p.patientId.toLowerCase().includes(q)
        );
      })
    : [];

  const patientVisits = selectedPatient
    ? visits.filter(v => v.patientId === selectedPatient.id).sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
    : [];

  const handlePrint = (visit: Visit) => {
    const patient = selectedPatient;
    if (!patient) return;
    const clinicSettings = storage.getClinicSettings();
    const users = storage.getUsers();
    const doctor = users.find(u => u.id === visit.attendingDoctorId) || users.find(u => u.id === visit.createdBy && u.role === 'doctor') || users.find(u => u.role === 'doctor');
    const discAmt = visit.discountType === 'percent'
      ? ((visit.doctorFee + (visit.expertFee||0) + visit.medicineCharges + visit.additionalCharges) * visit.discount / 100)
      : visit.discount;
    const bodyHtml = `
<div class="header">
${clinicSettings.clinicLogoUrl ? `<img class="logo" src="${clinicSettings.clinicLogoUrl}" />` : ''}
<h1>${clinicSettings.clinicName}</h1>
<p>${clinicSettings.clinicAddress || ''}</p>
<p>Phone: ${clinicSettings.clinicPhone || ''}</p>
${doctor ? `<p>${doctor.fullName}${doctor.role==='expert' ? ` (${(doctor as any).specialization||'Expert'})` : doctor.qualification ? ' - ' + doctor.qualification : ''}${doctor.registrationNumber ? ' | Reg: ' + doctor.registrationNumber : ''}</p>` : ''}
</div>
<div class="bill-info">
<div><p><strong>Bill No:</strong> ${visit.billNumber}</p><p><strong>Patient:</strong> ${patient.name}</p><p><strong>ID:</strong> ${patient.patientId}</p></div>
<div style="text-align:right;"><p><strong>Date:</strong> ${visit.visitDate}</p><p><strong>Time:</strong> ${visit.visitTime}</p><p><strong>Age/Sex:</strong> ${patient.age}/${patient.sex}</p></div>
</div>
${visit.illness || visit.diagnosis || visit.referringTo ? `<div class="section-title">Clinical Details</div>
<div style="font-size:11px;">${visit.illness ? `<p><strong>Illness:</strong> ${visit.illness}</p>` : ''}${visit.diagnosis ? `<p><strong>Diagnosis:</strong> ${visit.diagnosis}</p>` : ''}${visit.referringTo ? `<p><strong>Referring To:</strong> ${visit.referringTo}</p>` : ''}</div>` : ''}
${visit.prescriptionItems?.length > 0 ? `<div class="section-title">Prescription</div>
<table><thead><tr><th>Medicine</th><th>Dosage</th><th>Qty</th><th>Days</th><th>Amount</th></tr></thead>
<tbody>${visit.prescriptionItems.map(i => `<tr><td>${i.medicineName}</td><td>${i.dosage}</td><td style="text-align:center">${i.quantity}${i.medicineType==='Syrup'?'ml':''}</td><td style="text-align:center">${i.days}</td><td style="text-align:right">${i.isFree ? 'FREE' : formatCurrency(i.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="section-title">Advised Tests</div>
${visit.advisedTests?.length > 0 ? `<div class="tests">${visit.advisedTests.map(t => `<span class="test-badge">${t}</span>`).join('')}</div>` : '<p style="font-size:11px;">NA</p>'}
<div class="summary">
<div class="section-title" style="margin-top:0">Billing Summary</div>
<div class="summary-row"><span>Doctor Fee:</span><span>${formatCurrency(visit.doctorFee)}</span></div>
${visit.expertFee > 0 ? `<div class="summary-row"><span>Expert / Technician Fee:</span><span>${formatCurrency(visit.expertFee)}</span></div>` : ''}
<div class="summary-row"><span>Medicine:</span><span>${formatCurrency(visit.medicineCharges)}</span></div>
${visit.additionalCharges > 0 ? `<div class="summary-row"><span>Additional:</span><span>${formatCurrency(visit.additionalCharges)}</span></div>` : ''}
${visit.discount > 0 ? `<div class="summary-row"><span>Discount${visit.discountType==='percent' ? ' ('+visit.discount+'%)' : ''}:</span><span>-${formatCurrency(discAmt)}</span></div>` : ''}
<div class="summary-row total"><span>Grand Total:</span><span>${formatCurrency(visit.grandTotal)}</span></div>
</div>
${visit.reviewDate ? `<p style="margin-top:14px;font-size:11px;"><strong>Review Date:</strong> ${formatDate(visit.reviewDate)}</p>` : ''}`;

    const bottomHtml = `
<div class="sig-row">
  ${clinicSettings.clinicSealUrl ? `<img class="seal" src="${clinicSettings.clinicSealUrl}"/>` : '<div></div>'}
  <div class="sig-block">
    ${doctor?.signatureUrl ? `<img class="sig" src="${doctor.signatureUrl}" />` : ''}
    <div class="sig-line">${doctor?.fullName || ''}</div>
    <div class="sig-label">${(doctor as any)?.role==='expert' ? 'Expert Signature' : 'Doctor Signature'}</div>
  </div>
</div>
<div class="footer">Thank you for visiting ${clinicSettings.clinicName}.</div>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(buildPrintDocument(`Bill - ${visit.billNumber}`, bodyHtml, bottomHtml));
      printWindow.document.close();
      printWindow.print();
      maybeShowPrintTip();
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Search & Patient History</h1>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSelectedPatient(null); }}
          placeholder="Search by patient name, mobile number, or patient ID..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Search Results */}
      {searchQuery && !selectedPatient && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {filteredPatients.length} patient(s) found
            </h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredPatients.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No patients found matching "{searchQuery}"</p>
              </div>
            ) : (
              filteredPatients.map(patient => {
                const visitCount = visits.filter(v => v.patientId === patient.id).length;
                return (
                  <button
                    key={patient.id}
                    onClick={() => setSelectedPatient(patient)}
                    className="w-full p-4 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                        <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-white">{patient.name}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {patient.patientId} &bull; {patient.age}/{patient.sex} &bull;
                          <Phone className="w-3 h-3 inline ml-1" /> {patient.mobile}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{visitCount} visit(s)</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Patient History */}
      {selectedPatient && (
        <div className="space-y-6">
          {/* Patient Info Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                  <User className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedPatient.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {selectedPatient.patientId} &bull; {selectedPatient.age} years / {selectedPatient.sex}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    <Phone className="w-3 h-3 inline mr-1" /> {selectedPatient.mobile}
                    {selectedPatient.address && ` &bull; ${selectedPatient.address}`}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelectedPatient(null); setSearchQuery(''); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl">&times;</button>
            </div>
          </div>

          {/* Visit History */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Visit History ({patientVisits.length})
              </h3>
              <Link to="/new-visit" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
                + New Visit
              </Link>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {patientVisits.length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p>No visits recorded for this patient</p>
                </div>
              ) : (
                patientVisits.map(visit => (
                  <div key={visit.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Link to={`/visits/${visit.id}`} className="font-mono text-emerald-600 dark:text-emerald-400 font-medium hover:underline">
                            {visit.billNumber}
                          </Link>
                          <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <Calendar className="w-3 h-3" /> {formatDate(visit.visitDate)}
                          </span>
                          <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                            <Clock className="w-3 h-3" /> {visit.visitTime}
                          </span>
                        </div>
                        {visit.illness && (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            <span className="text-gray-400">Illness:</span> {visit.illness}
                          </p>
                        )}
                        {visit.diagnosis && (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            <span className="text-gray-400">Diagnosis:</span> {visit.diagnosis}
                          </p>
                        )}
                        {visit.prescriptionItems?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {visit.prescriptionItems.map(item => (
                              <span key={item.id} className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs text-gray-600 dark:text-gray-300">
                                {item.medicineName}
                              </span>
                            ))}
                          </div>
                        )}
                        {visit.advisedTests?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {visit.advisedTests.map(test => (
                              <span key={test} className="bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded text-xs text-blue-600 dark:text-blue-400">
                                {test}
                              </span>
                            ))}
                          </div>
                        )}
                        {visit.reviewDate && (
                          <p className="text-sm mt-1">
                            <span className="text-amber-600 dark:text-amber-400">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              Review: {formatDate(visit.reviewDate)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(visit.grandTotal)}</p>
                        <button onClick={() => handlePrint(visit)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          <Printer className="w-3 h-3" /> Print
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Diagnosis History */}
          {patientVisits.some(v => v.diagnosis) && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Diagnosis History</h3>
              <div className="space-y-2">
                {patientVisits.filter(v => v.diagnosis).map(visit => (
                  <div key={visit.id} className="flex items-center gap-4 text-sm">
                    <span className="text-gray-400 w-24 flex-shrink-0">{formatDate(visit.visitDate)}</span>
                    <span className="text-gray-900 dark:text-white">{visit.diagnosis}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
