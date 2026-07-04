import { useState, useEffect, useRef } from 'react';
import { storage } from '../utils/storage';
import { Visit, Patient, User } from '../types';
import { formatCurrency, formatDate } from '../utils/helpers';
import { useParams, useNavigate, Link } from '../router';
import { Printer, ArrowLeft, Calendar, Trash2, Edit } from 'lucide-react';
import { buildPrintDocument, maybeShowPrintTip } from '../components/printStyles';

export default function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const printBottomRef = useRef<HTMLDivElement>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [doctor, setDoctor] = useState<User | null>(null);
  const [clinicSettings] = useState(storage.getClinicSettings());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const visits = storage.getVisits();
    const found = visits.find(v => v.id === id);
    if (found) {
      setVisit(found);
      const allPatients = storage.getPatients();
      setPatient(allPatients.find(p => p.id === found.patientId) || null);
      const users = storage.getUsers();
      const attending = users.find(u => u.id === found.attendingDoctorId);
      const legacyFallback = users.find(u => u.id === found.createdBy && u.role === 'doctor') || users.find(u => u.role === 'doctor');
      setDoctor(attending || legacyFallback || null);
    }
  }, [id]);

  const discountAmount = visit
    ? (visit.discountType === 'percent'
        ? ((visit.doctorFee + (visit.expertFee||0) + visit.medicineCharges + visit.additionalCharges) * visit.discount / 100)
        : visit.discount)
    : 0;

  const handlePrint = () => {
    if (!visit) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(buildPrintDocument(
      `Bill - ${visit.billNumber}`,
      printRef.current?.innerHTML || '',
      printBottomRef.current?.innerHTML || ''
    ));
    printWindow.document.close();
    printWindow.print();
    maybeShowPrintTip();
  };

  const handleDelete = () => {
    if (!visit) return;
    const visits = storage.getVisits().filter(v => v.id !== visit.id);
    storage.saveVisits(visits);
    navigate('/visits');
  };

  if (!visit) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400">Visit not found</p>
          <Link to="/visits" className="text-emerald-600 dark:text-emerald-400 hover:underline mt-2 inline-block">
            Back to Visits
          </Link>
        </div>
      </div>
    );
  }

  const dispName = visit.isQuickBill ? visit.patientName : patient?.name;
  const dispAge = visit.isQuickBill ? visit.patientAge : patient?.age;
  const dispSex = visit.isQuickBill ? visit.patientSex : patient?.sex;
  const dispMobile = visit.isQuickBill ? visit.patientMobile : patient?.mobile;
  const dispPatientId = visit.isQuickBill ? '(Quick Bill)' : patient?.patientId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link to="/visits" className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {visit.billNumber}
              {visit.isCancelled && <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full">Cancelled</span>}
              {visit.isQuickBill && <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full">Quick Bill</span>}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(visit.visitDate)} &bull; {visit.visitTime}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-medium">
            <Printer className="w-5 h-5" /> Print / PDF
          </button>
          {!visit.isCancelled && (
            <Link to={`/visits/${visit.id}/edit`} className="bg-amber-500 text-white px-4 py-2.5 rounded-lg hover:bg-amber-600 flex items-center gap-2 font-medium">
              <Edit className="w-5 h-5" /> Edit Bill
            </Link>
          )}
          <button onClick={() => setShowDeleteConfirm(true)} className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center gap-2 font-medium">
            <Trash2 className="w-5 h-5" /> Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Visit?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">This action cannot be undone. The visit record will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">
                Cancel
              </button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
        <div ref={printRef}>
          <div className="header text-center border-b-2 border-emerald-800 pb-4 mb-6">
            {clinicSettings.clinicLogoUrl && (
              <img src={clinicSettings.clinicLogoUrl} alt="Clinic Logo" className="logo" style={{ maxHeight: '70px', margin: '0 auto 8px', objectFit: 'cover' }} />
            )}
            <h1 className="text-2xl font-bold text-emerald-800 dark:text-emerald-300">{clinicSettings.clinicName}</h1>
            <p className="text-gray-500 text-sm">{clinicSettings.clinicAddress}</p>
            <p className="text-gray-500 text-sm">Phone: {clinicSettings.clinicPhone}</p>
            {doctor && (
              <p className="text-gray-600 text-sm mt-1 font-medium">
                {doctor.fullName}{(doctor as any).role === 'expert' ? ` (${(doctor as any).specialization || 'Expert'})` : doctor.qualification ? ` — ${doctor.qualification}` : ''}{doctor.registrationNumber ? ` | Reg: ${doctor.registrationNumber}` : ''}
              </p>
            )}
          </div>

          <div className="flex justify-between text-sm mb-6">
            <div>
              <p><span className="text-gray-500">Bill No:</span> <span className="font-semibold">{visit.billNumber}</span></p>
              <p><span className="text-gray-500">Patient ID:</span> <span className="font-semibold">{dispPatientId}</span></p>
            </div>
            <div className="text-right">
              <p><span className="text-gray-500">Date:</span> <span className="font-semibold">{visit.visitDate}</span></p>
              <p><span className="text-gray-500">Time:</span> <span className="font-semibold">{visit.visitTime}</span></p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="section-title text-sm font-semibold text-emerald-800 dark:text-emerald-400 border-b border-gray-200 pb-1 mb-2">Patient Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <p><span className="text-gray-500">Name:</span> <span className="font-medium">{dispName}</span></p>
              <p><span className="text-gray-500">Age/Sex:</span> <span className="font-medium">{dispAge} / {dispSex}</span></p>
              <p><span className="text-gray-500">Mobile:</span> <span className="font-medium">{dispMobile || '-'}</span></p>
              <p><span className="text-gray-500">Address:</span> <span className="font-medium">{visit.isQuickBill ? '—' : (patient?.address || '-')}</span></p>
            </div>
          </div>

          {(visit.illness || visit.diagnosis || visit.referringTo) && (
            <div className="mb-6">
              <h3 className="section-title text-sm font-semibold text-emerald-800 dark:text-emerald-400 border-b border-gray-200 pb-1 mb-2">Consultation Details</h3>
              <div className="space-y-1 text-sm">
                {visit.illness && <p><span className="text-gray-500">Illness:</span> <span className="font-medium">{visit.illness}</span></p>}
                {visit.diagnosis && <p><span className="text-gray-500">Diagnosis:</span> <span className="font-medium">{visit.diagnosis}</span></p>}
                {visit.referringTo && <p><span className="text-gray-500">Referring To:</span> <span className="font-medium">{visit.referringTo}</span></p>}
                {visit.notes && <p><span className="text-gray-500">Notes:</span> <span className="font-medium">{visit.notes}</span></p>}
              </div>
            </div>
          )}

          {visit.prescriptionItems?.length > 0 && (
            <div className="mb-6">
              <h3 className="section-title text-sm font-semibold text-emerald-800 dark:text-emerald-400 border-b border-gray-200 pb-1 mb-2">Prescription</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Medicine</th>
                    <th className="text-left p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Type</th>
                    <th className="text-left p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Dosage</th>
                    <th className="text-center p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Days</th>
                    <th className="text-center p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Qty</th>
                    <th className="text-right p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visit.prescriptionItems.map(item => (
                    <tr key={item.id}>
                      <td className="p-2 border border-gray-200">{item.medicineName}{item.isCustom && <span className="text-gray-400 text-xs"> (custom)</span>}</td>
                      <td className="p-2 border border-gray-200">{item.medicineType}</td>
                      <td className="p-2 border border-gray-200">{item.dosage}</td>
                      <td className="p-2 border border-gray-200 text-center">{item.days}</td>
                      <td className="p-2 border border-gray-200 text-center">{item.quantity}{item.medicineType === 'Syrup' ? 'ml' : ''}</td>
                      <td className="p-2 border border-gray-200 text-right">{item.isFree ? <span className="text-green-600">FREE</span> : formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mb-6">
            <h3 className="section-title text-sm font-semibold text-emerald-800 dark:text-emerald-400 border-b border-gray-200 pb-1 mb-2">Advised Tests</h3>
            {visit.advisedTests?.length > 0 ? (
              <div className="tests flex flex-wrap gap-2">
                {visit.advisedTests.map(test => (
                  <span key={test} className="test-badge bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">{test}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">NA</p>
            )}
          </div>

          <div className="mb-4">
            <h3 className="section-title text-sm font-semibold text-emerald-800 dark:text-emerald-400 border-b border-gray-200 pb-1 mb-2">Billing Summary</h3>
            <div className="max-w-xs ml-auto space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Doctor Fee</span><span>{formatCurrency(visit.doctorFee)}</span></div>
              {visit.expertFee > 0 && <div className="flex justify-between"><span className="text-gray-500">Expert / Technician Fee</span><span>{formatCurrency(visit.expertFee)}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Medicine Charges</span><span>{formatCurrency(visit.medicineCharges)}</span></div>
              {visit.additionalCharges > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Additional {visit.additionalChargesDesc ? `(${visit.additionalChargesDesc})` : 'Charges'}</span><span>{formatCurrency(visit.additionalCharges)}</span></div>
              )}
              {visit.discount > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Discount {visit.discountType === 'percent' ? `(${visit.discount}%)` : ''}</span><span className="text-red-600">-{formatCurrency(discountAmount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t-2 border-emerald-800 pt-2 mt-2 text-emerald-800 dark:text-emerald-400">
                <span>Grand Total</span><span>{formatCurrency(visit.grandTotal)}</span>
              </div>
            </div>
          </div>

          {visit.reviewDate && (
            <div className="mb-4 text-sm bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg inline-block">
              <Calendar className="w-4 h-4 inline mr-2 text-amber-600" />
              <span className="text-gray-500">Next Review Date:</span>{' '}
              <span className="font-semibold text-amber-800 dark:text-amber-300">{formatDate(visit.reviewDate)}</span>
            </div>
          )}
        </div>

        <div ref={printBottomRef} className="mt-10">
          <div className="flex justify-between items-end">
            {clinicSettings.clinicSealUrl ? (
              <img src={clinicSettings.clinicSealUrl} alt="Clinic Seal" style={{ height: '145px', width: '243px', objectFit: 'contain' }} />
            ) : <div />}
            <div className="text-right">
              {doctor?.signatureUrl && (
                <img src={doctor.signatureUrl} alt="Signature" style={{ height: '145px', width: '243px', marginLeft: 'auto', display: 'block', marginBottom: '4px', objectFit: 'contain' }} />
              )}
              <div className="border-b border-gray-400 inline-block pb-1 min-w-[180px] text-sm">
                {doctor?.fullName || ''}
              </div>
              <p className="text-xs text-gray-500 mt-1">{(doctor as any)?.role === 'expert' ? 'Expert Signature' : 'Doctor Signature'}</p>
            </div>
          </div>
          <div className="text-center text-xs text-gray-400 mt-6 border-t border-gray-200 pt-4">
            Thank you for visiting {clinicSettings.clinicName}.
          </div>
        </div>
      </div>
    </div>
  );
}
