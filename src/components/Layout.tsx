import { Outlet, NavLink, useNavigate } from '../router';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { storage } from '../utils/storage';
import {
  LayoutDashboard, Users, FileText, Search, Settings,
  LogOut, Menu, X, Moon, Sun, Stethoscope, User,
} from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
  const { currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const clinicSettings = storage.getClinicSettings();

  const navItems = [
    { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/patients',   icon: Users,            label: 'Patients' },
    { to: '/new-visit',  icon: FileText,         label: 'New Visit' },
    { to: '/visits',     icon: FileText,         label: 'Visits & Bills' },
    { to: '/search',     icon: Search,           label: 'Search' },
    { to: '/settings',   icon: Settings,         label: 'Settings' },
  ];

  const roleLabel =
    currentUser?.role === 'admin'        ? 'Admin'        :
    currentUser?.role === 'doctor'       ? 'Doctor'       :
    currentUser?.role === 'expert'       ? 'Expert/Tech'  : 'Receptionist';

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">

      {/* ── Mobile Header ───────────────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40
                      bg-white dark:bg-gray-800
                      border-b-2 border-gray-300 dark:border-gray-600 shadow-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {clinicSettings.clinicLogoUrl ? (
              <img
                src={clinicSettings.clinicLogoUrl}
                alt="Logo"
                className="w-9 h-9 rounded-lg object-cover flex-shrink-0
                           ring-2 ring-emerald-400 dark:ring-emerald-500"
              />
            ) : (
              <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="font-bold text-gray-900 dark:text-white">{clinicSettings.clinicName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              {theme === 'dark'
                ? <Sun  className="w-5 h-5 text-amber-400" />
                : <Moon className="w-5 h-5 text-gray-500" />}
            </button>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              {sidebarOpen
                ? <X    className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                : <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Backdrop ─────────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-30" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className={`fixed inset-y-0 left-0 w-64 z-40
                       bg-white dark:bg-gray-800
                       border-r-2 border-gray-300 dark:border-gray-600 shadow-xl
                       transform transition-transform duration-300
                       ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="h-full flex flex-col">

          {/* Logo block */}
          <div className="p-4 border-b-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center gap-3">
              {clinicSettings.clinicLogoUrl ? (
                /* Fill the frame completely — no padding, no whitespace */
                <div className="w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden
                                ring-2 ring-emerald-500 shadow-md">
                  <img
                    src={clinicSettings.clinicLogoUrl}
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-teal-600
                                rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <Stethoscope className="w-7 h-7 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-gray-900 dark:text-white truncate leading-tight">
                  {clinicSettings.clinicName}
                </h1>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">Clinic Management</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item, idx) => (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </NavLink>
                {/* Visible separator between nav items */}
                {idx < navItems.length - 1 && (
                  <div className="mx-4 my-0.5 border-b border-gray-200 dark:border-gray-700" />
                )}
              </div>
            ))}
          </nav>

          {/* User & Controls footer */}
          <div className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50">
            {/* Theme toggle */}
            <div className="px-4 py-3 flex items-center justify-between
                            border-b border-gray-300 dark:border-gray-600">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Theme</span>
              <button
                onClick={toggleTheme}
                className={`relative w-12 h-6 rounded-full transition-colors duration-300
                            ${theme === 'dark' ? 'bg-emerald-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-300
                                 ${theme === 'dark' ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
            {/* Current user */}
            <div className="px-4 py-3 flex items-center gap-3
                            border-b border-gray-300 dark:border-gray-600">
              {currentUser?.profilePhotoUrl ? (
                <img
                  src={currentUser.profilePhotoUrl}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0
                             ring-2 ring-emerald-300 dark:ring-emerald-700"
                />
              ) : (
                <div className="w-9 h-9 bg-emerald-100 dark:bg-emerald-900/40 rounded-full
                                flex items-center justify-center ring-2 ring-emerald-300 dark:ring-emerald-700 flex-shrink-0">
                  <User className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {currentUser?.fullName}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{roleLabel}</p>
              </div>
            </div>
            {/* Sign out */}
            <div className="px-3 py-3">
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl
                           bg-red-50 dark:bg-red-900/20
                           text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-800
                           hover:bg-red-100 dark:hover:bg-red-900/40
                           font-semibold text-sm transition-colors"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="lg:pl-64 pt-16 lg:pt-0">
        <main className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
