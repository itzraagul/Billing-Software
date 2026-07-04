import { useState } from 'react';
import { storage } from '../utils/storage';
import { ClinicSettings, User, Medicine, MedicineType, SyrupSize, MEDICINE_TYPES, SYRUP_SIZES } from '../types';
import { Save, Upload, X, Shield, UserPlus, Trash2, Package, Plus, Edit2, Check, Download, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { maybeShowPrintTip } from '../components/printStyles';
import { DosageInput, NumInput } from '../components/FormInputs';
import ImageCropModal from '../components/ImageCropModal';

export default function SettingsPage() {
  const { currentUser, updateCurrentUser } = useAuth();
  // Photo crop modal — shared by both admin User Management photo upload and My Profile photo upload
  const [cropTarget, setCropTarget] = useState<'admin' | 'self' | null>(null);
  const [cropSource, setCropSource] = useState<string>('');

  const openCropFor = (target: 'admin' | 'self', file: File) => {
    const reader = new FileReader();
    reader.onload = ev => { setCropSource(ev.target?.result as string); setCropTarget(target); };
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (croppedDataUrl: string) => {
    if (cropTarget === 'admin') setUserForm(prev => ({ ...prev, profilePhotoUrl: croppedDataUrl }));
    else if (cropTarget === 'self') setProfileForm(prev => ({ ...prev, profilePhotoUrl: croppedDataUrl }));
    setCropTarget(null); setCropSource('');
  };
  const isAdmin = currentUser?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'clinic'|'profile'|'users'|'medicines'|'backup'>(isAdmin ? 'clinic' : 'profile');
  

  // Clinic settings (removed doctorName, doctorQualification, doctorSignatureUrl)
  const [settings, setSettings] = useState<ClinicSettings>(storage.getClinicSettings());
  const [saved, setSaved] = useState(false);

  // Users
  const [users, setUsers] = useState<User[]>(storage.getUsers());
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const emptyUser = { userId: '', email: '', password: '', fullName: '', role: 'receptionist' as 'admin'|'doctor'|'receptionist'|'expert', qualification: '', registrationNumber: '', specialization: '', signatureUrl: '', profilePhotoUrl: '' };
  const [userForm, setUserForm] = useState(emptyUser);

  // My Profile (self-service, non-admin roles)
  const [profileForm, setProfileForm] = useState({
    fullName: currentUser?.fullName || '',
    email: currentUser?.email || '',
    password: '',
    signatureUrl: currentUser?.signatureUrl || '',
    profilePhotoUrl: currentUser?.profilePhotoUrl || '',
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // Medicines
  const [medicines, setMedicines] = useState<Medicine[]>(storage.getMedicines());
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);
  const [showAddMed, setShowAddMed] = useState(false);
  const emptyMed: Partial<Medicine> = { name:'', type:'Tablet', manufacturerName:'', information:'', defaultDosage:'', minQuantity:1, tabsPerStrip:10, syrupSize:'Regular', stockCount:0, unitPrice:0, purchasedPrice:0, isFree:false };
  const [newMed, setNewMed] = useState<Partial<Medicine>>(emptyMed);

  // Backup date range
  const [billsFrom, setBillsFrom] = useState('');
  const [billsTo, setBillsTo] = useState('');

  const tabs = isAdmin
    ? [
        { id: 'clinic' as const, label: 'Clinic Settings' },
        { id: 'users' as const, label: 'User Management' },
        { id: 'medicines' as const, label: 'Medicines' },
        { id: 'backup' as const, label: 'Backup & Restore' },
      ]
    : [
        { id: 'profile' as const, label: 'My Profile' },
        { id: 'medicines' as const, label: 'Medicines' },
        { id: 'backup' as const, label: 'Backup & Restore' },
      ];

  /* ---- Image helpers ---- */
  /** Compress and resize an image file before base64 encoding.
   *  Resizes to max 400×400px and compresses to JPEG quality 0.7
   *  to keep localStorage usage well under the 5MB browser limit. */
  const compressImage = (file: File, maxSize = 400, quality = 0.75): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let { width, height } = img;
          if (width > maxSize || height > maxSize) {
            if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
            else { width = Math.round(width * maxSize / height); height = maxSize; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
          // Use PNG for images that may have transparency (signatures/seals),
          // JPEG otherwise — auto-detect by checking if original is PNG
          const isPng = file.type === 'image/png';
          resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', quality));
        };
        img.src = e.target!.result as string;
      };
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const b64 = await compressImage(f, 300, 0.8);
      const updated = { ...settings, clinicLogoUrl: b64 };
      setSettings(updated);
      storage.saveClinicSettings(updated);
    } catch(err) { alert('Failed to process image. Try a smaller file.'); }
    e.target.value = '';
  };

  const handleSealUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const b64 = await compressImage(f, 300, 0.8);
      const updated = { ...settings, clinicSealUrl: b64 };
      setSettings(updated);
      storage.saveClinicSettings(updated);
    } catch(err) { alert('Failed to process image. Try a smaller file.'); }
    e.target.value = '';
  };

  const handleSignatureUpload = async (userId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const b64 = await toBase64(f);
    // Update BOTH editingUser and userForm so the save handler keeps the new signature
    if (editingUser && editingUser.id === userId) {
      setEditingUser({ ...editingUser, signatureUrl: b64 });
    }
    setUserForm(prev => ({ ...prev, signatureUrl: b64 }));
  };

  /* ---- Save clinic ---- */
  const handleSaveClinic = () => {
    try {
      storage.saveClinicSettings(settings);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        alert('Storage is full. The logo or seal image may be too large. Try a smaller image file.');
      } else {
        alert('Failed to save settings: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  /* ---- Users ---- */
  const handleSaveUser = () => {
    const trimmedId = userForm.userId.trim();
    if (!userForm.fullName.trim()) { alert('Full Name is required.'); return; }
    if (!trimmedId) { alert('User ID is required.'); return; }
    if (!userForm.password.trim()) { alert('Password is required.'); return; }
    const duplicate = users.find(u => u.userId?.toLowerCase() === trimmedId.toLowerCase() && u.id !== editingUser?.id);
    if (duplicate) { alert('This User ID is already taken. Please choose another.'); return; }
    try {
      if (editingUser) {
        const updated = users.map(u => u.id === editingUser.id
          ? { ...editingUser, ...userForm, userId: trimmedId, signatureUrl: userForm.signatureUrl }
          : u);
        storage.saveUsers(updated); setUsers(updated);
      } else {
        const u: User = { id: storage.generateId(), isActive: true, ...userForm, userId: trimmedId };
        const updated = [...users, u]; storage.saveUsers(updated); setUsers(updated);
      }
      setShowAddUser(false); setEditingUser(null); setUserForm(emptyUser);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        alert('Storage is full. The signature image may be too large. Try a smaller or more compressed image file.');
      } else {
        alert('Failed to save: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  const startEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({ userId: u.userId||'', email: u.email, password: u.password, fullName: u.fullName, role: u.role, qualification: u.qualification||'', registrationNumber: u.registrationNumber||'', specialization: (u as any).specialization||'', signatureUrl: u.signatureUrl||'', profilePhotoUrl: u.profilePhotoUrl||'' });
    setShowAddUser(true);
  };

  const handleDeleteUser = (id: string) => {
    if (id === currentUser?.id) return alert("You can't delete yourself.");
    const updated = users.filter(u => u.id !== id); storage.saveUsers(updated); setUsers(updated);
  };

  const handleToggleUser = (id: string) => {
    const updated = users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u);
    storage.saveUsers(updated); setUsers(updated);
  };

  /* ---- My Profile (self-service, any logged-in user) ---- */
  const handleSaveProfile = () => {
    if (!currentUser) return;
    if (!profileForm.fullName.trim()) { alert('Full Name is required.'); return; }
    try {
      const allUsers = storage.getUsers();
      const updatedUser: User = {
        ...currentUser,
        fullName: profileForm.fullName.trim(),
        email: profileForm.email.trim(),
        password: profileForm.password.trim() ? profileForm.password.trim() : currentUser.password,
        signatureUrl: profileForm.signatureUrl,
        profilePhotoUrl: profileForm.profilePhotoUrl,
      };
      const updatedList = allUsers.map(u => u.id === currentUser.id ? updatedUser : u);
      storage.saveUsers(updatedList);
      setUsers(updatedList);
      updateCurrentUser(updatedUser);
      setProfileForm(prev => ({ ...prev, password: '' })); // clear password field after save
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err: any) {
      if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        alert('Storage is full. The photo or signature image may be too large. Try a smaller file.');
      } else {
        alert('Failed to save profile: ' + (err?.message || 'Unknown error'));
      }
    }
  };

  /* ---- Medicines ---- */
  const handleSaveMed = () => {
    if (!newMed.name?.trim()) return;
    const type = (newMed.type || 'Tablet') as MedicineType;
    const med: Medicine = {
      id: storage.generateId(), name: newMed.name!, type,
      manufacturerName: newMed.manufacturerName||'', information: newMed.information||'',
      defaultDosage: newMed.defaultDosage||'', minQuantity: newMed.minQuantity||1,
      tabsPerStrip: type === 'Tablet' ? (newMed.tabsPerStrip||10) : undefined,
      stripOnly: type === 'Tablet' ? (newMed.stripOnly||false) : undefined,
      syrupSize: (type === 'Syrup' || type === 'Ointment/Cream') ? (newMed.syrupSize as SyrupSize || 'Regular') : undefined,
      stockCount: newMed.stockCount||0,
      unitPrice: newMed.isFree ? 0 : (newMed.unitPrice||0), // strip selling price for Tablet
      purchasedPrice: newMed.isFree ? 0 : (newMed.purchasedPrice||0), isFree: newMed.isFree||false,
    };
    const updated = [...medicines, med]; storage.saveMedicines(updated); setMedicines(updated);
    setShowAddMed(false); setNewMed(emptyMed);
  };

  const handleUpdateMed = () => {
    if (!editingMed) return;
    const updated = medicines.map(m => m.id === editingMed.id ? editingMed : m);
    storage.saveMedicines(updated); setMedicines(updated); setEditingMed(null);
  };

  const handleDeleteMed = (id: string) => {
    if (!confirm('Delete this medicine?')) return;
    const updated = medicines.filter(m => m.id !== id); storage.saveMedicines(updated); setMedicines(updated);
  };

  /* ---- Backup ---- */
  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  /** Download a printable medicine stock list as HTML */
  const handleStockListPrint = () => {
    const meds = storage.getMedicines();
    const clinic = storage.getClinicSettings();
    const date = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const rows = meds.map((m, i) => `
      <tr style="background:${i%2===0?'#f9fafb':'#fff'}">
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${i+1}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600">${m.name}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${m.type || 'Tablet'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${m.manufacturerName||'—'}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;${m.stockCount<=10?'color:#dc2626;font-weight:700':''}">${m.stockCount ?? 0}${m.stockCount<=10?' ⚠':''}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${m.minQuantity ?? 1}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">
          ${(m.type||'Tablet')==='Tablet' ? `${m.tabsPerStrip||'—'} tabs${m.stripOnly?' (Strip Only)':''}` : (m.syrupSize||'—')}
        </td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right">${m.isFree?'FREE':`₹${m.purchasedPrice ?? 0}`}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:right">${m.isFree?'FREE':(m.type||'Tablet')==='Tablet'?`₹${m.unitPrice ?? 0}/strip`:`₹${m.unitPrice ?? 0}`}</td>
      </tr>`).join('');
    const lowStock = meds.filter(m => m.stockCount <= 10 && !m.isFree);
    const html = `<!DOCTYPE html><html><head><title>Medicine Stock — ${clinic.clinicName}</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}h1{font-size:20px;color:#065f46;margin:0}p{margin:2px 0;color:#6b7280;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#065f46;color:#fff;padding:7px 10px;text-align:left;font-size:11px}tr:hover{background:#f0fdf4}.low{background:#fef2f2!important}.footer{margin-top:12px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:6px}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #065f46;padding-bottom:10px;margin-bottom:4px">
      <div><h1>${clinic.clinicName}</h1><p>${clinic.clinicAddress}</p></div>
      <div style="text-align:right"><p style="font-size:14px;font-weight:700;color:#065f46">MEDICINE STOCK LIST</p><p>Generated: ${date}</p><p>Total Items: ${meds.length}</p></div>
    </div>
    ${lowStock.length>0?`<p style="color:#dc2626;font-weight:600;margin-bottom:6px">⚠ ${lowStock.length} item(s) running low on stock</p>`:''}
    <table>
      <thead><tr><th>#</th><th>Drug Name</th><th>Type</th><th>Manufacturer</th><th style="text-align:center">Stock</th><th style="text-align:center">Min Qty</th><th style="text-align:center">Pack Info</th><th style="text-align:right">Purchase ₹</th><th style="text-align:right">Selling ₹</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Total medicines: ${meds.length} | Low stock items: ${lowStock.length} | Printed on ${date}</div>
    <script>window.print();</script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(html); w.document.close();
    maybeShowPrintTip();
  };

  /** Download medicine stock as CSV for Excel */
  const handleStockCSV = () => {
    const meds = storage.getMedicines();
    const date = new Date().toISOString().slice(0,10);
    const header = ['#','Drug Name','Type','Manufacturer','Stock Count','Min Qty','Pack Info','Purchase Price','Selling Price','Free?','Default Dosage','Information'];
    const rows = meds.map((m, i) => [
      i+1, m.name, m.type, m.manufacturerName||'',
      m.stockCount, m.minQuantity,
      m.type==='Tablet' ? `${m.tabsPerStrip||''}tabs${m.stripOnly?' StripOnly':''}` : (m.syrupSize||''),
      m.purchasedPrice, m.unitPrice, m.isFree?'Yes':'No',
      m.defaultDosage||'', m.information||''
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `medicine-stock-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /** Download the master backup — ALL data in one JSON */
  const handleMasterBackup = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const clinic = storage.getClinicSettings();
    const payload = {
      _version: '1.0',
      _type: 'ARVI_CLINIC_MASTER_BACKUP',
      _createdAt: new Date().toISOString(),
      _clinicName: clinic.clinicName,
      patients: storage.getPatients(),
      visits: storage.getVisits(),
      medicines: storage.getMedicines(),
      users: storage.getUsers().map(u => ({ ...u })), // include all user data
      settings: clinic,
    };
    const totalPatients = payload.patients.length;
    const totalVisits = payload.visits.length;
    const totalMeds = payload.medicines.length;
    downloadJSON(payload, `ARVI-MASTER-BACKUP-${timestamp}.json`);
    alert(`✅ Master backup created!\n\nContains:\n• ${totalPatients} patients (with full medical history)\n• ${totalVisits} bills/visits\n• ${totalMeds} medicines\n• Clinic settings & user accounts\n\nFile saved as: ARVI-MASTER-BACKUP-${timestamp}.json`);
  };

  /** Restore from master backup */
  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (!window.confirm('⚠️ This will REPLACE all existing data with the backup. This cannot be undone.\n\nAre you sure you want to continue?')) {
      e.target.value = ''; return;
    }
    const r = new FileReader(); r.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        // Validate it's our backup format
        const isValid = data.patients !== undefined || data.visits !== undefined || data.medicines !== undefined;
        if (!isValid) { alert('Invalid backup file. Please select a valid clinic backup JSON file.'); return; }
        let restored = [];
        if (data.patients) { storage.savePatients(data.patients); restored.push(`${data.patients.length} patients`); }
        if (data.visits) { storage.saveVisits(data.visits); restored.push(`${data.visits.length} bills`); }
        if (data.medicines) { storage.saveMedicines(data.medicines); restored.push(`${data.medicines.length} medicines`); }
        if (data.users) { storage.saveUsers(data.users); restored.push(`${data.users.length} users`); }
        if (data.settings) { storage.saveClinicSettings(data.settings); }
        alert(`✅ Restore successful!\n\nRestored:\n• ${restored.join('\n• ')}\n\nThe page will now reload.`);
        window.location.reload();
      } catch(err) { alert('Failed to restore: Invalid or corrupted backup file.'); }
    };
    r.readAsText(f);
    e.target.value = '';
  };

  const handleFullBackup = handleMasterBackup; // alias for compatibility
  const handlePatientBackup = () => {
    downloadJSON({ patients: storage.getPatients(), exportedAt: new Date().toISOString() },
      `clinic-patients-${new Date().toISOString().slice(0,10)}.json`);
  };
  const handleBillsBackup = () => {
    let visits = storage.getVisits();
    if (billsFrom) visits = visits.filter(v => v.visitDate >= billsFrom);
    if (billsTo) visits = visits.filter(v => v.visitDate <= billsTo);
    downloadJSON({ visits, exportedAt: new Date().toISOString(), dateRange: { from: billsFrom||'all', to: billsTo||'all' } },
      `clinic-bills-${billsFrom||'all'}-to-${billsTo||'all'}.json`);
  };

  const inputCls = "w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab===tab.id?'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm':'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== MY PROFILE (self-service, non-admin) ===== */}
      {activeTab==='profile' && currentUser && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-600"/>My Profile
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Update your own account details. Your User ID and Role can only be changed by an admin.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column: photo + read-only info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile Photo</label>
                <div className="flex items-center gap-4">
                  {profileForm.profilePhotoUrl ? (
                    <div className="relative">
                      <img src={profileForm.profilePhotoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover ring-2 ring-emerald-400"/>
                      <button type="button" onClick={()=>setProfileForm({...profileForm,profilePhotoUrl:''})} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-2xl font-bold text-emerald-700 dark:text-emerald-400 ring-2 ring-gray-200 dark:ring-gray-600">
                      {profileForm.fullName?.charAt(0).toUpperCase() || '?'}
                    </div>
                  )}
                  <label className="cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                    <Upload className="w-4 h-4"/>{profileForm.profilePhotoUrl ? 'Change Photo' : 'Upload Photo'}
                    <input type="file" accept="image/*" onChange={e => {
                      const f = e.target.files?.[0]; if (!f) return;
                      openCropFor('self', f);
                      e.target.value = '';
                    }} className="hidden"/>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID</label>
                <div className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 font-mono text-sm">{currentUser.userId}</div>
                <p className="text-xs text-gray-400 mt-1">Contact an admin to change your User ID.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <div className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-sm capitalize">
                  {currentUser.role === 'expert' ? 'Expert / Technician' : currentUser.role}
                  {(currentUser as any).specialization ? ` — ${(currentUser as any).specialization}` : ''}
                </div>
              </div>
            </div>

            {/* Right column: editable account fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                <input value={profileForm.fullName} onChange={e=>setProfileForm({...profileForm,fullName:e.target.value})} className={inputCls}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="email" value={profileForm.email} onChange={e=>setProfileForm({...profileForm,email:e.target.value})} className={inputCls}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
                <input type="password" value={profileForm.password} onChange={e=>setProfileForm({...profileForm,password:e.target.value})} className={inputCls} placeholder="••••••••"/>
              </div>

              {(currentUser.role === 'doctor' || currentUser.role === 'expert') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Digital Signature</label>
                  <div className="flex items-center gap-3">
                    {profileForm.signatureUrl && (
                      <div className="relative">
                        <img src={profileForm.signatureUrl} alt="Signature" className="h-20 object-contain border border-gray-200 dark:border-gray-600 rounded p-1 bg-white max-w-[180px]"/>
                        <button type="button" onClick={()=>setProfileForm({...profileForm,signatureUrl:''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                      </div>
                    )}
                    <label className="cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                      <Upload className="w-4 h-4"/>{profileForm.signatureUrl ? 'Change Signature' : 'Upload Signature'}
                      <input type="file" accept="image/*" onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        try {
                          const b64 = await compressImage(f, 500, 0.85);
                          setProfileForm(prev => ({...prev, signatureUrl: b64}));
                        } catch(err) { alert('Failed to process image. Try a smaller file.'); }
                        e.target.value = '';
                      }} className="hidden"/>
                    </label>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">This appears on bills you generate. PNG with transparent background preferred.</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onClick={handleSaveProfile} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-medium">
              <Save className="w-4 h-4"/>{profileSaved ? 'Saved!' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}

      {/* ===== CLINIC SETTINGS ===== */}
      {activeTab==='clinic' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white">Clinic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinic Logo</label>
              <div className="flex items-center gap-4">
                {settings.clinicLogoUrl ? (
                  <div className="relative">
                    <img src={settings.clinicLogoUrl} alt="Logo" className="w-20 h-20 object-cover border border-gray-200 dark:border-gray-600 rounded-lg"/>
                    <button type="button" onClick={() => setSettings({...settings, clinicLogoUrl:''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                  </div>
                ) : (
                  <div className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-400"><Upload className="w-6 h-6"/></div>
                )}
                <div>
                  <label className="cursor-pointer px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                    <Upload className="w-4 h-4"/>Upload Logo
                    <input type="file" accept="image/*" onChange={e => { handleLogoUpload(e); e.target.value=''; }} className="hidden"/>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG recommended</p>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinic Digital Seal</label>
              <p className="text-xs text-gray-400 mb-2">Used on printed bills. PNG with transparent background preferred.</p>
              <div className="flex items-center gap-4">
                {settings.clinicSealUrl ? (
                  <div className="relative">
                    <img src={settings.clinicSealUrl} alt="Seal" className="w-24 h-24 object-contain border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 p-1"/>
                    <button type="button" onClick={() => setSettings({...settings, clinicSealUrl:''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                  </div>
                ) : (
                  <div className="w-24 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-400"><Upload className="w-6 h-6"/></div>
                )}
                <div>
                  <label className="cursor-pointer px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                    <Upload className="w-4 h-4"/>Upload Seal
                    <input type="file" accept="image/*" onChange={e => { handleSealUpload(e); e.target.value=''; }} className="hidden"/>
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Circular seal/stamp image</p>
                </div>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinic Name</label>
              <input value={settings.clinicName} onChange={e=>setSettings({...settings,clinicName:e.target.value})} className={inputCls}/>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinic Address</label>
              <textarea value={settings.clinicAddress} onChange={e=>setSettings({...settings,clinicAddress:e.target.value})} rows={2} className={inputCls}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <input value={settings.clinicPhone} onChange={e=>setSettings({...settings,clinicPhone:e.target.value})} className={inputCls}/>
            </div>
          </div>
          <button onClick={handleSaveClinic} className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg hover:bg-emerald-700 flex items-center gap-2 font-medium">
            <Save className="w-4 h-4"/>{saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ===== USER MANAGEMENT ===== */}
      {activeTab==='users' && isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Shield className="w-5 h-5 text-emerald-600"/>User Management</h2>
            <button onClick={()=>{setShowAddUser(true);setEditingUser(null);setUserForm(emptyUser);}} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium"><UserPlus className="w-4 h-4"/>Add User</button>
          </div>

          {showAddUser && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{editingUser ? 'Edit User' : 'Add User'}</h3>
                  <button onClick={()=>{setShowAddUser(false);setEditingUser(null);}} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Profile Photo</label>
                    <div className="flex items-center gap-3">
                      {userForm.profilePhotoUrl ? (
                        <div className="relative">
                          <img src={userForm.profilePhotoUrl} alt="Profile" className="w-16 h-16 rounded-full object-cover ring-2 ring-emerald-400"/>
                          <button type="button" onClick={()=>setUserForm({...userForm,profilePhotoUrl:''})} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 ring-2 ring-gray-200 dark:ring-gray-600">
                          <UserPlus className="w-6 h-6"/>
                        </div>
                      )}
                      <label className="cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                        <Upload className="w-4 h-4"/>{userForm.profilePhotoUrl ? 'Change Photo' : 'Upload Photo'}
                        <input type="file" accept="image/*" onChange={e => {
                          const f = e.target.files?.[0]; if (!f) return;
                          openCropFor('admin', f);
                          e.target.value = '';
                        }} className="hidden"/>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                    <input value={userForm.fullName} onChange={e=>setUserForm({...userForm,fullName:e.target.value})} className={inputCls} placeholder="e.g. Dr. Smith"/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID *</label>
                    <input value={userForm.userId} onChange={e=>setUserForm({...userForm,userId:e.target.value.replace(/\s/g,'')})} className={inputCls} placeholder="e.g. jdoe (used to log in)"/>
                    <p className="text-xs text-gray-400 mt-1">Used to log in alongside email. No spaces.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="email" value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})} className={inputCls}/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password *</label>
                    <input type="password" value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} className={inputCls}/>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                    <select value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value as any})} className={inputCls}>
                      <option value="admin">Admin</option>
                      <option value="doctor">Doctor</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="expert">Expert / Technician</option>
                    </select>
                  </div>
                  {userForm.role==='doctor' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Qualification</label>
                        <input value={userForm.qualification} onChange={e=>setUserForm({...userForm,qualification:e.target.value})} className={inputCls} placeholder="e.g. MBBS, MD"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Doctor Registration Number *</label>
                        <input value={userForm.registrationNumber} onChange={e=>setUserForm({...userForm,registrationNumber:e.target.value})} className={inputCls} placeholder="e.g. MCI-12345"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Digital Signature</label>
                        <div className="flex items-center gap-3">
                          {userForm.signatureUrl && (
                            <div className="relative">
                              <img src={userForm.signatureUrl} alt="Signature" className="h-24 object-contain border border-gray-200 dark:border-gray-600 rounded p-1 bg-white max-w-xs"/>
                              <button type="button" onClick={()=>setUserForm({...userForm,signatureUrl:''})} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"><X className="w-3 h-3"/></button>
                            </div>
                          )}
                          <div>
                            <label className="cursor-pointer px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 w-fit">
                              <Upload className="w-4 h-4"/>Upload Signature
                              <input type="file" accept="image/*" onChange={async e => {
                                const f = e.target.files?.[0]; if (!f) return;
                                try {
                                  const b64 = await compressImage(f, 500, 0.85);
                                  setUserForm(prev => ({...prev, signatureUrl: b64}));
                                } catch(err) { alert('Failed to process image. Try a smaller file.'); }
                                e.target.value = '';
                              }} className="hidden"/>
                            </label>
                            <p className="text-xs text-gray-400 mt-1">PNG with transparent background preferred</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {userForm.role==='expert' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Specialization *</label>
                        <input value={(userForm as any).specialization||''} onChange={e=>setUserForm({...userForm,specialization:e.target.value} as any)} className={inputCls} placeholder="e.g. Lab Technician, Physiotherapist"/>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Registration / Licence No. <span className="text-gray-400 font-normal">(optional)</span></label>
                        <input value={userForm.registrationNumber} onChange={e=>setUserForm({...userForm,registrationNumber:e.target.value})} className={inputCls} placeholder="e.g. PT-98765"/>
                      </div>
                    </>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={()=>{setShowAddUser(false);setEditingUser(null);setUserForm(emptyUser);}} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancel</button>
                    <button type="button" onClick={handleSaveUser} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">{editingUser ? 'Update' : 'Add User'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">User ID</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reg. No.</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        {u.profilePhotoUrl ? (
                          <img src={u.profilePhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-600"/>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {u.fullName?.charAt(0).toUpperCase() || '?'}
                          </div>
                        )}
                        {u.fullName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{u.userId || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${u.role==='admin'?'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400':u.role==='doctor'?'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400':u.role==='expert'?'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400':'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{u.role==='expert'?'Expert/Tech':u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{u.registrationNumber||'—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={()=>handleToggleUser(u.id)} className={`px-2 py-1 rounded-full text-xs font-medium ${u.isActive?'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400':'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{u.isActive?'Active':'Inactive'}</button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={()=>startEditUser(u)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"><Edit2 className="w-4 h-4"/></button>
                        {u.id!==currentUser?.id && <button onClick={()=>handleDeleteUser(u.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4"/></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== MEDICINES ===== */}
      {activeTab==='medicines' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600"/>Medicine Stock</h2>
            <button onClick={()=>{setShowAddMed(true);setNewMed(emptyMed);}} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm font-medium"><Plus className="w-4 h-4"/>Add Medicine</button>
          </div>

          {showAddMed && (
            <div className="mb-6 p-4 border border-emerald-200 dark:border-emerald-700 rounded-xl bg-emerald-50 dark:bg-emerald-900/10">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">New Medicine</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="col-span-2"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Drug Name *</label><input value={newMed.name||''} onChange={e=>setNewMed({...newMed,name:e.target.value})} className={inputCls} placeholder="e.g. Paracetamol 500mg"/></div>
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type *</label>
                  <select value={newMed.type||'Tablet'} onChange={e=>setNewMed({...newMed,type:e.target.value as MedicineType, stripOnly:false})} className={inputCls}>
                    {MEDICINE_TYPES.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Manufacturer</label><input value={newMed.manufacturerName||''} onChange={e=>setNewMed({...newMed,manufacturerName:e.target.value})} className={inputCls}/></div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Default Dosage {newMed.type==='Syrup' ? '(ml)' : ''}</label>
                  <DosageInput value={newMed.defaultDosage || '0-0-0-0'} type={(newMed.type || 'Tablet') as MedicineType} onChange={v=>setNewMed({...newMed,defaultDosage:v})}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Count</label>
                  <NumInput value={newMed.stockCount||0} min={0} onChange={v=>setNewMed({...newMed,stockCount:v})} className={inputCls}/>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Min Quantity</label>
                  <NumInput value={newMed.minQuantity||1} min={1} onChange={v=>setNewMed({...newMed,minQuantity:v})} className={inputCls}/>
                </div>
                {newMed.type === 'Tablet' && (<>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">No. of Tabs per Strip</label>
                    <NumInput value={newMed.tabsPerStrip||10} min={1} onChange={v=>setNewMed({...newMed,tabsPerStrip:v})} className={inputCls}/>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-3 mt-1">
                    <input type="checkbox" id="stripOnlyNew" checked={newMed.stripOnly||false} onChange={e=>setNewMed({...newMed,stripOnly:e.target.checked})} className="w-4 h-4 accent-emerald-600"/>
                    <label htmlFor="stripOnlyNew" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Strip Only — sell by full strips, not individual tablets
                    </label>
                  </div>
                </>)}
                {(newMed.type === 'Syrup' || newMed.type === 'Ointment/Cream') && (
                  <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Size</label>
                    <select value={newMed.syrupSize||'Regular'} onChange={e=>setNewMed({...newMed,syrupSize:e.target.value as SyrupSize})} className={inputCls}>
                      {SYRUP_SIZES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2 md:col-span-3"><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Information</label><input value={newMed.information||''} onChange={e=>setNewMed({...newMed,information:e.target.value})} className={inputCls} placeholder="Usage, side effects..."/></div>
                <div className="col-span-2 md:col-span-3 flex items-center gap-3">
                  <input type="checkbox" id="freeNew" checked={newMed.isFree||false} onChange={e=>setNewMed({...newMed,isFree:e.target.checked})} className="w-4 h-4 accent-emerald-600"/>
                  <label htmlFor="freeNew" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Free Medicine (no charge)</label>
                </div>
                {!newMed.isFree && (<>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Purchased Price (₹)</label>
                    <NumInput value={newMed.purchasedPrice||0} min={0} allowDecimal onChange={v=>setNewMed({...newMed,purchasedPrice:v})} className={inputCls}/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {newMed.type === 'Tablet' ? 'Strip Selling Price (₹)' : 'Selling Price (₹)'}
                    </label>
                    <NumInput value={newMed.unitPrice||0} min={0} allowDecimal onChange={v=>setNewMed({...newMed,unitPrice:v})} className={inputCls}/>
                    {newMed.type === 'Tablet' && newMed.unitPrice && newMed.tabsPerStrip ? (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                        Per tablet: ₹{(newMed.unitPrice / (newMed.tabsPerStrip||1)).toFixed(4)}
                      </p>
                    ) : null}
                  </div>
                </>)}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveMed} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2"><Check className="w-4 h-4"/>Save Medicine</button>
                <button onClick={()=>setShowAddMed(false)} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300">Cancel</button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b-2 border-gray-200 dark:border-gray-600">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Drug Name</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Mfr.</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Min Qty</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Pack Info</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Purchase ₹</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Selling ₹</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {medicines.map(med=>(
                  <tr key={med.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    {editingMed?.id===med.id ? (
                      <>
                        <td className="px-2 py-2"><input value={editingMed.name} onChange={e=>setEditingMed({...editingMed,name:e.target.value})} className="w-full px-2 py-1 border border-emerald-400 rounded text-sm dark:bg-gray-700 dark:text-white"/></td>
                        <td className="px-2 py-2 text-center"><select value={editingMed.type} onChange={e=>setEditingMed({...editingMed,type:e.target.value as MedicineType})} className="w-full px-1 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white">{MEDICINE_TYPES.map(t=><option key={t}>{t}</option>)}</select></td>
                        <td className="px-2 py-2 text-center"><input value={editingMed.manufacturerName} onChange={e=>setEditingMed({...editingMed,manufacturerName:e.target.value})} className="w-24 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/></td>
                        <td className="px-2 py-2 text-center"><NumInput value={editingMed.stockCount} min={0} onChange={v=>setEditingMed({...editingMed,stockCount:v})} className="w-16 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/></td>
                        <td className="px-2 py-2 text-center"><NumInput value={editingMed.minQuantity} min={1} onChange={v=>setEditingMed({...editingMed,minQuantity:v})} className="w-16 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/></td>
                        <td className="px-2 py-2 text-center">
                          {editingMed.type === 'Tablet' && (
                            <div className="flex flex-col gap-1 items-center">
                              <NumInput value={editingMed.tabsPerStrip||10} min={1} onChange={v=>setEditingMed({...editingMed,tabsPerStrip:v})} className="w-16 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/>
                              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                                <input type="checkbox" checked={editingMed.stripOnly||false} onChange={e=>setEditingMed({...editingMed,stripOnly:e.target.checked})} className="w-3 h-3 accent-emerald-600"/>
                                Strip Only
                              </label>
                            </div>
                          )}
                          {(editingMed.type === 'Syrup' || editingMed.type === 'Ointment/Cream') && (
                            <select value={editingMed.syrupSize||'Regular'} onChange={e=>setEditingMed({...editingMed,syrupSize:e.target.value as SyrupSize})} className="w-24 px-1 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white">
                              {SYRUP_SIZES.map(s=><option key={s}>{s}</option>)}
                            </select>
                          )}
                          {editingMed.type !== 'Tablet' && editingMed.type !== 'Syrup' && editingMed.type !== 'Ointment/Cream' && <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center"><NumInput value={editingMed.purchasedPrice} min={0} allowDecimal onChange={v=>setEditingMed({...editingMed,purchasedPrice:v})} className="w-20 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/></td>
                        <td className="px-2 py-2 text-center"><NumInput value={editingMed.unitPrice} min={0} allowDecimal onChange={v=>setEditingMed({...editingMed,unitPrice:v})} className="w-20 px-2 py-1 border border-gray-200 rounded text-sm dark:bg-gray-700 dark:text-white text-center"/></td>
                        <td className="px-2 py-2 text-center"><div className="flex gap-1 justify-center"><button onClick={handleUpdateMed} className="text-emerald-600 hover:text-emerald-800 p-1"><Check className="w-4 h-4"/></button><button onClick={()=>setEditingMed(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4"/></button></div></td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{med.name}</div>
                          {med.isFree && <span className="text-xs text-green-600 font-medium">FREE</span>}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 whitespace-nowrap">{med.type}</span>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-500 text-xs">{med.manufacturerName||'—'}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-semibold text-sm ${med.stockCount<=10?'text-red-500':'text-gray-900 dark:text-white'}`}>{med.stockCount}</span>
                          {med.stockCount<=10 && <div className="text-xs text-red-400 font-medium">Low</div>}
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{med.minQuantity}</td>
                        <td className="px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          {med.type === 'Tablet' && (
                            <div>
                              <div>{med.tabsPerStrip || '—'} tabs/strip</div>
                              {med.stripOnly && <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full">Strip Only</span>}
                            </div>
                          )}
                          {(med.type === 'Syrup' || med.type === 'Ointment/Cream') && (med.syrupSize || '—')}
                          {med.type !== 'Tablet' && med.type !== 'Syrup' && med.type !== 'Ointment/Cream' && '—'}
                        </td>
                        <td className="px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300">{med.isFree?'—':`₹${med.purchasedPrice}`}</td>
                        <td className="px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300">
                          {med.isFree ? <span className="text-green-600 font-medium">FREE</span> : (
                            <div>
                              <div className="font-medium">{med.type==='Tablet' ? `₹${med.unitPrice}/strip` : `₹${med.unitPrice}`}</div>
                              {med.type==='Tablet' && med.tabsPerStrip ? <div className="text-xs text-gray-400">₹{(med.unitPrice/(med.tabsPerStrip||1)).toFixed(2)}/tab</div> : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={()=>setEditingMed({...med})} className="p-1.5 text-blue-500 hover:text-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"><Edit2 className="w-4 h-4"/></button>
                            <button onClick={()=>handleDeleteMed(med.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== BACKUP & RESTORE ===== */}
      {activeTab==='backup' && (
        <div className="space-y-4">

          {/* MASTER BACKUP — most prominent */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Download className="w-5 h-5"/>Master Backup</h2>
                <p className="text-emerald-100 text-sm mb-1">Creates ONE complete backup file containing everything:</p>
                <ul className="text-emerald-100 text-sm space-y-0.5 list-disc list-inside">
                  <li>All patients with full medical history</li>
                  <li>All bills &amp; prescriptions</li>
                  <li>Medicine stock with prices</li>
                  <li>Clinic settings, logo &amp; seal</li>
                  <li>User accounts &amp; doctor signatures</li>
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={handleMasterBackup}
                  className="bg-white text-emerald-700 px-6 py-3 rounded-lg hover:bg-emerald-50 flex items-center gap-2 font-bold text-sm shadow-lg whitespace-nowrap">
                  <Download className="w-5 h-5"/>Download Master Backup
                </button>
                <p className="text-xs text-emerald-200 text-center">Recommended: take weekly</p>
              </div>
            </div>
          </div>

          {/* MEDICINE STOCK LIST */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-600"/>Medicine Stock List
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Export your current medicine stock. Print it for physical records or download as CSV to open in Excel.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleStockListPrint}
                className="bg-purple-600 text-white px-4 py-2.5 rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium text-sm">
                <Printer className="w-4 h-4"/>Print Stock List (A4)
              </button>
              <button onClick={handleStockCSV}
                className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 flex items-center gap-2 font-medium text-sm">
                <Download className="w-4 h-4"/>Download as CSV (Excel)
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              ⚠ Items with stock ≤ 10 are highlighted in red on the printed list.
            </p>
          </div>

          {/* INDIVIDUAL BACKUPS */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Individual Backups</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-1">Patient Records</h3>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">All patients with medical history</p>
                <button onClick={handlePatientBackup}
                  className="bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium">
                  <Download className="w-4 h-4"/>Download Patients
                </button>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <h3 className="font-medium text-amber-800 dark:text-amber-300 mb-1">Bills by Date Range</h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Leave empty to export all bills</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From</label>
                    <input type="date" value={billsFrom} onChange={e=>setBillsFrom(e.target.value)} className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To</label>
                    <input type="date" value={billsTo} onChange={e=>setBillsTo(e.target.value)} className="px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500"/>
                  </div>
                </div>
                <button onClick={handleBillsBackup}
                  className="bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 flex items-center gap-2 text-sm font-medium">
                  <Download className="w-4 h-4"/>Download Bills
                </button>
              </div>
            </div>
          </div>

          {/* RESTORE */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-800 p-6">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Upload className="w-4 h-4 text-red-500"/>Restore from Backup
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              Upload a previously downloaded backup file (.json). Works with Master Backup or any individual backup.
            </p>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                ⚠ Warning: Restoring will REPLACE all current data. Take a Master Backup first if you want to keep existing data.
              </p>
            </div>
            <label className="cursor-pointer bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center hover:border-red-400 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2"/>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Click to upload backup file (.json)</span>
              <span className="text-xs text-gray-400 mt-1">Supports Master Backup &amp; individual backup files</span>
              <input type="file" accept=".json" onChange={handleRestore} className="hidden"/>
            </label>
          </div>

        </div>
      )}

      {cropTarget && (
        <ImageCropModal
          imageSrc={cropSource}
          onCancel={() => { setCropTarget(null); setCropSource(''); }}
          onConfirm={handleCropConfirm}
          title="Adjust Profile Photo"
        />
      )}
    </div>
  );
}
