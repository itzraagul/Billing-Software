import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import { Patient, MedicalHistory, Visit } from '../types';
import { formatDate, formatCurrency, calculateAgeFromDOB, dobDisplayToISO, dobISOToDisplay } from '../utils/helpers';
import { Search, UserPlus, Phone, Calendar, Edit, Trash2, X, Plus, ClipboardList, ChevronDown, ChevronUp, Eye, FileText } from 'lucide-react';
import { useNavigate } from '../router';
import { NumTextInput } from '../components/FormInputs';

const emptyForm = { name: '', dob: '', age: '', sex: 'Male' as 'Male'|'Female'|'Other', mobile: '', address: '', bloodGroup: '', allergies: '' };

export default function PatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [expandedPatient, setExpandedPatient] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [historyEntries, setHistoryEntries] = useState<MedicalHistory[]>([]);
  const [newHistory, setNewHistory] = useState<MedicalHistory>({ date: '', condition: '', notes: '' });
  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [allowDuplicatePhone, setAllowDuplicatePhone] = useState(false);

  useEffect(() => { loadPatients(); setAllVisits(storage.getVisits()); }, []);
  const loadPatients = () => setPatients(storage.getPatients());

  const filteredPatients = patients.filter(p => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.patientId.toLowerCase().includes(q) || p.mobile.includes(q);
  });

  const getPatientVisits = (patientId: string) =>
    allVisits.filter(v => v.patientId === patientId).sort((a, b) => (a.visitDate < b.visitDate ? 1 : -1));

  const resetForm = () => {
    setForm(emptyForm);
    setHistoryEntries([]);
    setNewHistory({ date: '', condition: '', notes: '' });
    setShowHistoryForm(false);
    setEditingPatient(null);
    setShowForm(false);
    setDuplicateError('');
    setAllowDuplicatePhone(false);
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      dob: patient.dob ? dobISOToDisplay(patient.dob) : '',
      age: String(patient.age),
      sex: patient.sex,
      mobile: patient.mobile,
      address: patient.address,
      bloodGroup: patient.bloodGroup || '',
      allergies: patient.allergies || '',
    });
    setHistoryEntries(patient.medicalHistory || []);
    setShowForm(true);
  };

  // DOB change → auto-calculate age in decimal years
  const handleDobChange = (raw: string) => {
    // Strip everything except digits, then reformat as DD/MM/YYYY automatically
    const digits = raw.replace(/\D/g, '').slice(0, 8); // max 8 digits: DDMMYYYY
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setForm(prev => {
      const isoDate = dobDisplayToISO(formatted);
      let newAge = prev.age;
      if (isoDate && isoDate.length === 10 && new Date(isoDate) < new Date()) {
        newAge = String(calculateAgeFromDOB(isoDate));
      }
      return { ...prev, dob: formatted, age: newAge };
    });
  };

  // Live phone duplicate check after 10 digits
  const handleMobileChange = (val: string) => {
    setForm(prev => ({ ...prev, mobile: val }));
    setAllowDuplicatePhone(false); // reset override when number changes
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 10) {
      const dup = storage.findPatientByPhone(patients, val, editingPatient?.id);
      setDuplicateError(dup ? `Phone already registered: ${dup.name} (${dup.patientId})` : '');
    } else {
      setDuplicateError('');
    }
  };

  const addHistoryEntry = () => {
    if (!newHistory.condition.trim()) return;
    setHistoryEntries(prev => [...prev, { ...newHistory, date: newHistory.date || new Date().toISOString().split('T')[0] }]);
    setNewHistory({ date: '', condition: '', notes: '' });
    setShowHistoryForm(false);
  };

  const removeHistoryEntry = (idx: number) => setHistoryEntries(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateError('');
    if (!allowDuplicatePhone) {
      const dup = storage.findPatientByPhone(patients, form.mobile, editingPatient?.id);
      if (dup) {
        setDuplicateError(`Phone already registered: ${dup.name} (${dup.patientId})`);
        return;
      }
    }
    const dobISO = form.dob ? dobDisplayToISO(form.dob) : '';
    const ageVal = parseFloat(form.age) || 0;
    if (editingPatient) {
      const updated = patients.map(p => p.id === editingPatient.id
        ? { ...p, name: form.name, dob: dobISO || undefined, age: ageVal, sex: form.sex, mobile: form.mobile, address: form.address, bloodGroup: form.bloodGroup, allergies: form.allergies, medicalHistory: historyEntries, updatedAt: new Date().toISOString() }
        : p);
      storage.savePatients(updated);
    } else {
      const p: Patient = {
        id: storage.generateId(), patientId: storage.generatePatientId(patients),
        name: form.name, dob: dobISO || undefined, age: ageVal, sex: form.sex,
        mobile: form.mobile, address: form.address, bloodGroup: form.bloodGroup,
        allergies: form.allergies, medicalHistory: historyEntries,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      storage.savePatients([p, ...patients]);
    }
    loadPatients(); resetForm();
  };

  const handleDelete = (id: string) => {
    storage.savePatients(patients.filter(p => p.id !== id));
    loadPatients(); setDeleteConfirm(null);
  };

  const cls = 'w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patients</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-medium">
          <UserPlus className="w-5 h-5" />New Patient
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search by name, patient ID, or mobile..."
          className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500" />
      </div>

      {/* Patient Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editingPatient ? 'Edit Patient' : 'Register New Patient'}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {duplicateError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                  {duplicateError}
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={cls} required />
                  </div>

                  {/* DOB first, then auto-fills Age */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Birth <span className="text-gray-400 font-normal">(DD/MM/YYYY, optional)</span></label>
                    <input
                      type="text" value={form.dob}
                      onChange={e => handleDobChange(e.target.value)}
                      placeholder="DD/MM/YYYY" maxLength={10}
                      className={cls}
                    />
                    {form.dob && dobDisplayToISO(form.dob) && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Age auto-calculated: {form.age} years</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Age (years) *</label>
                    <NumTextInput value={form.age} onChange={v => setForm({ ...form, age: v })} allowDecimal className={cls} required />
                    <p className="text-xs text-gray-400 mt-1">Enter manually or auto-filled from DOB</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sex *</label>
                    <select value={form.sex} onChange={e => setForm({ ...form, sex: e.target.value as any })} className={cls}>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
                    <select value={form.bloodGroup} onChange={e => setForm({ ...form, bloodGroup: e.target.value })} className={cls}>
                      <option value="">Unknown</option>
                      {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg => <option key={bg}>{bg}</option>)}
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile Number *</label>
                    <input type="tel" value={form.mobile}
                      onChange={e => handleMobileChange(e.target.value)}
                      className={`${cls} ${duplicateError && !allowDuplicatePhone ? 'border-red-400 dark:border-red-500 focus:ring-red-400' : ''}`} required />
                    {duplicateError && (
                      <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mb-2">
                          ⚠ {duplicateError}
                        </p>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowDuplicatePhone}
                            onChange={e => setAllowDuplicatePhone(e.target.checked)}
                            className="mt-0.5 w-4 h-4 accent-amber-600 flex-shrink-0"
                          />
                          <span className="text-xs text-amber-700 dark:text-amber-400">
                            I confirm this is a <strong>different patient</strong> sharing the same phone number (e.g. family member). Register anyway.
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                    <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} className={cls} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Known Allergies</label>
                    <input type="text" value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} className={cls} placeholder="e.g. Penicillin, Aspirin" />
                  </div>
                </div>
              </div>

              {/* Medical History */}
              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><ClipboardList className="w-4 h-4" />Medical History</h3>
                  <button type="button" onClick={() => setShowHistoryForm(true)} className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />Add Entry</button>
                </div>
                {showHistoryForm && (
                  <div className="mb-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-700">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
                        <input type="date" value={newHistory.date} onChange={e => setNewHistory({ ...newHistory, date: e.target.value })} className="w-full px-2 py-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Condition / Illness *</label>
                        <input type="text" value={newHistory.condition} onChange={e => setNewHistory({ ...newHistory, condition: e.target.value })} placeholder="e.g. Diabetes" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                        <input type="text" value={newHistory.notes} onChange={e => setNewHistory({ ...newHistory, notes: e.target.value })} placeholder="Treatment details..." className="w-full px-2 py-2 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={addHistoryEntry} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-sm font-medium">Add</button>
                      <button type="button" onClick={() => setShowHistoryForm(false)} className="text-gray-500 px-3 py-1.5 rounded text-sm border border-gray-200 dark:border-gray-600">Cancel</button>
                    </div>
                  </div>
                )}
                {historyEntries.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {historyEntries.map((h, i) => (
                      <div key={i} className="flex items-start justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{h.condition}</span>
                          {h.date && <span className="text-gray-500 ml-2 text-xs">{h.date}</span>}
                          {h.notes && <p className="text-xs text-gray-500 mt-0.5">{h.notes}</p>}
                        </div>
                        <button type="button" onClick={() => removeHistoryEntry(i)} className="text-red-400 hover:text-red-600 ml-2"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No medical history entries yet.</p>
                )}
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button type="button" onClick={resetForm} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">Cancel</button>
                <button type="submit" disabled={!!(duplicateError && !allowDuplicatePhone)} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingPatient ? 'Update Patient' : 'Register Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Delete Patient?</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* View Patient Modal */}
      {viewingPatient && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{viewingPatient.name}</h2>
                <p className="text-sm font-mono text-emerald-600 dark:text-emerald-400">{viewingPatient.patientId}</p>
              </div>
              <button onClick={() => setViewingPatient(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  {viewingPatient.dob && (
                    <div><span className="text-gray-500">Date of Birth</span><p className="font-medium text-gray-900 dark:text-white">{dobISOToDisplay(viewingPatient.dob)}</p></div>
                  )}
                  <div><span className="text-gray-500">Age / Sex</span><p className="font-medium text-gray-900 dark:text-white">{viewingPatient.age} yrs / {viewingPatient.sex}</p></div>
                  <div><span className="text-gray-500">Mobile</span><p className="font-medium text-gray-900 dark:text-white">{viewingPatient.mobile}</p></div>
                  <div><span className="text-gray-500">Blood Group</span><p className="font-medium text-gray-900 dark:text-white">{viewingPatient.bloodGroup || '—'}</p></div>
                  <div className="col-span-2 md:col-span-3"><span className="text-gray-500">Address</span><p className="font-medium text-gray-900 dark:text-white">{viewingPatient.address || '—'}</p></div>
                  <div className="col-span-2 md:col-span-3"><span className="text-gray-500">Registered On</span><p className="font-medium text-gray-900 dark:text-white">{formatDate(viewingPatient.createdAt)}</p></div>
                </div>
                {viewingPatient.allergies && (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg"><span className="font-semibold">⚠ Allergies:</span> {viewingPatient.allergies}</p>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2"><ClipboardList className="w-4 h-4" />Medical History</h3>
                {viewingPatient.medicalHistory && viewingPatient.medicalHistory.length > 0 ? (
                  <div className="space-y-2">
                    {viewingPatient.medicalHistory.slice().reverse().map((h, i) => (
                      <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white">{h.condition}</span>
                          <span className="text-xs text-gray-400">{h.date}</span>
                        </div>
                        {h.notes && <p className="text-xs text-gray-500 mt-1">{h.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400 italic">No medical history recorded.</p>}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2"><FileText className="w-4 h-4" />Visit History</h3>
                {getPatientVisits(viewingPatient.id).length > 0 ? (
                  <div className="space-y-2">
                    {getPatientVisits(viewingPatient.id).map(v => (
                      <button key={v.id} onClick={() => navigate(`/visits/${v.id}`)}
                        className="w-full p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-left">
                        <div>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400">{v.billNumber}</span>
                          <span className="text-gray-400 ml-2 text-xs">{v.visitDate}</span>
                          {v.isCancelled && <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Cancelled</span>}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(v.grandTotal)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p className="text-sm text-gray-400 italic">No visits recorded yet.</p>}
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button onClick={() => { setViewingPatient(null); handleEdit(viewingPatient); }} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium flex items-center justify-center gap-2">
                <Edit className="w-4 h-4" />Edit Patient
              </button>
              <button onClick={() => setViewingPatient(null)} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {['Patient ID','Name','DOB','Age/Sex','Mobile','Blood Group','History','Registered','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredPatients.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-500">{searchQuery ? 'No patients found' : 'No patients registered yet'}</td></tr>
              ) : filteredPatients.map(patient => (
                <>
                  <tr key={patient.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-sm font-mono text-emerald-600 dark:text-emerald-400">{patient.patientId}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{patient.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{patient.dob ? dobISOToDisplay(patient.dob) : '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{patient.age} / {patient.sex}</td>
                    <td className="px-4 py-3 text-sm text-gray-500"><span className="flex items-center gap-1"><Phone className="w-3 h-3" />{patient.mobile}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-500">{patient.bloodGroup || '—'}</td>
                    <td className="px-4 py-3">
                      {(patient.medicalHistory?.length ?? 0) > 0 ? (
                        <button onClick={() => setExpandedPatient(expandedPatient === patient.id ? null : patient.id)}
                          className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline">
                          <ClipboardList className="w-3 h-3" />{patient.medicalHistory!.length}
                          {expandedPatient === patient.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      ) : <span className="text-xs text-gray-400">None</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500"><span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(patient.createdAt)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewingPatient(patient)} className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="View"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(patient)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Edit"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteConfirm(patient.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedPatient === patient.id && patient.medicalHistory && patient.medicalHistory.length > 0 && (
                    <tr key={`${patient.id}-history`} className="bg-amber-50 dark:bg-amber-900/10">
                      <td colSpan={9} className="px-6 py-3">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Medical History</p>
                        <div className="space-y-1">
                          {patient.medicalHistory.map((h, i) => (
                            <div key={i} className="text-xs text-amber-700 dark:text-amber-400">
                              <span className="font-medium">{h.date || '—'}</span> — <span>{h.condition}</span>
                              {h.notes && <span className="text-amber-600 dark:text-amber-500"> · {h.notes}</span>}
                            </div>
                          ))}
                        </div>
                        {patient.allergies && <p className="text-xs text-red-600 mt-2"><span className="font-semibold">⚠ Allergies:</span> {patient.allergies}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
