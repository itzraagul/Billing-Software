import { useEffect, useState } from 'react';
import { storage } from '../utils/storage';
import { Visit } from '../types';
import { formatCurrency, getCurrentDate, formatDate, getMonthName } from '../utils/helpers';
import { computeRevenueBreakdown } from '../utils/revenueAnalysis';
import { maybeShowPrintTip } from '../components/printStyles';
import { Users, Calendar, DollarSign, Clock, TrendingUp, Activity, ArrowRight, Stethoscope, Filter, X, PieChart, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Link } from '../router';

interface ChartData { name: string; patients: number; revenue: number; }

const presets = [
  { label: 'Today', getValue: () => { const t = getCurrentDate(); return { from: t, to: t }; } },
  { label: 'This Week', getValue: () => { const t = new Date(); const mon = new Date(t); mon.setDate(t.getDate() - t.getDay() + 1); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: mon.toISOString().slice(0,10), to: sun.toISOString().slice(0,10) }; } },
  { label: 'This Month', getValue: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth(), 1); const last = new Date(t.getFullYear(), t.getMonth()+1, 0); return { from: first.toISOString().slice(0,10), to: last.toISOString().slice(0,10) }; } },
  { label: 'Last Month', getValue: () => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth()-1, 1); const last = new Date(t.getFullYear(), t.getMonth(), 0); return { from: first.toISOString().slice(0,10), to: last.toISOString().slice(0,10) }; } },
  { label: 'Last 3 Months', getValue: () => { const t = new Date(); const from = new Date(t); from.setMonth(from.getMonth()-3); return { from: from.toISOString().slice(0,10), to: t.toISOString().slice(0,10) }; } },
  { label: 'This Year', getValue: () => { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
];

export default function DashboardPage() {
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [totalPatients, setTotalPatients] = useState(0);
  const [monthlyData, setMonthlyData] = useState<ChartData[]>([]);
  const [recentVisits, setRecentVisits] = useState<Visit[]>([]);
  const [upcomingReviews, setUpcomingReviews] = useState<Visit[]>([]);

  // Filter state
  const [filterFrom, setFilterFrom] = useState(() => { const t = new Date(); const first = new Date(t.getFullYear(), t.getMonth(), 1); return first.toISOString().slice(0,10); });
  const [filterTo, setFilterTo] = useState(getCurrentDate);
  const [activePreset, setActivePreset] = useState('This Month');

  const applyPreset = (preset: typeof presets[0]) => {
    const { from, to } = preset.getValue();
    setFilterFrom(from); setFilterTo(to); setActivePreset(preset.label);
  };

  const filteredVisits = allVisits.filter(v => !v.isCancelled && v.visitDate >= filterFrom && v.visitDate <= filterTo);

  // Revenue breakdown by category — analysis layer only, doesn't touch billing data
  const { lines: revenueLines, total: revenueTotal } = computeRevenueBreakdown(filteredVisits);
  const revenueColors = ['#059669','#0891b2','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#65a30d','#0d9488'];

  const revenueReportRows = () => revenueLines.map(l => ({
    category: l.category,
    bills: l.count,
    amount: l.amount,
    pct: revenueTotal > 0 ? (l.amount / revenueTotal * 100) : 0,
  }));

  const handleDownloadRevenuePDF = () => {
    const clinic = storage.getClinicSettings();
    const rows = revenueReportRows();
    const rowsHtml = rows.map((r, i) => `
      <tr style="background:${i%2===0?'#f9fafb':'#fff'}">
        <td style="padding:7px 10px;border:1px solid #e5e7eb"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${revenueColors[i%revenueColors.length]};margin-right:6px;vertical-align:middle"></span>${r.category}</td>
        <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center">${r.bills}</td>
        <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:600">₹${r.amount.toFixed(2)}</td>
        <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:right">${r.pct.toFixed(1)}%</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Revenue Breakdown — ${clinic.clinicName}</title>
    <style>@page{size:A4 portrait;margin:14mm}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}h1{font-size:20px;color:#065f46;margin:0}p{margin:2px 0;color:#6b7280;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#065f46;color:#fff;padding:8px 10px;text-align:left;font-size:11px}.total-row td{border-top:2px solid #065f46;font-weight:700;font-size:13px;padding:9px 10px}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #065f46;padding-bottom:10px;margin-bottom:6px">
      <div><h1>${clinic.clinicName}</h1><p>${clinic.clinicAddress||''}</p></div>
      <div style="text-align:right"><p style="font-size:14px;font-weight:700;color:#065f46">REVENUE BREAKDOWN REPORT</p><p>Period: ${filterFrom} to ${filterTo}</p><p>Generated: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</p></div>
    </div>
    <table>
      <thead><tr><th>Category</th><th style="text-align:center">Bills</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th></tr></thead>
      <tbody>${rowsHtml}
      <tr class="total-row"><td>Total Revenue</td><td style="text-align:center">${filteredVisits.length}</td><td style="text-align:right">₹${revenueTotal.toFixed(2)}</td><td style="text-align:right">100%</td></tr>
      </tbody>
    </table>
    <p style="margin-top:10px;font-size:10px;color:#9ca3af">Note: Additional-charge categories (Injection, Wound Dressing, etc.) are auto-detected from each bill's charge description. Amounts shown are gross per-category revenue before any bill-level discount.</p>
    <script>window.print();</script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return;
    w.document.write(html); w.document.close();
    maybeShowPrintTip();
  };

  const handleDownloadRevenueCSV = () => {
    const rows = revenueReportRows();
    const header = ['Category', 'Number of Bills', 'Amount (₹)', 'Percentage of Total'];
    const body = rows.map(r => [r.category, r.bills, r.amount.toFixed(2), r.pct.toFixed(1) + '%']);
    body.push(['Total', String(filteredVisits.length), revenueTotal.toFixed(2), '100%']);
    const csv = [header, ...body].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `revenue-breakdown-${filterFrom}-to-${filterTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadRevenueXLSX = async () => {
    const XLSX = await import('xlsx');
    const rows = revenueReportRows();
    const aoa: (string|number)[][] = [
      ['Revenue Breakdown Report'],
      [`Period: ${filterFrom} to ${filterTo}`],
      [],
      ['Category', 'Number of Bills', 'Amount (₹)', 'Percentage of Total'],
      ...rows.map(r => [r.category, r.bills, Number(r.amount.toFixed(2)), `${r.pct.toFixed(1)}%`]),
      ['Total', filteredVisits.length, Number(revenueTotal.toFixed(2)), '100%'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 38 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue Breakdown');
    XLSX.writeFile(wb, `revenue-breakdown-${filterFrom}-to-${filterTo}.xlsx`);
  };

  const stats = {
    periodPatients: filteredVisits.length,
    periodRevenue: filteredVisits.reduce((s, v) => s + v.grandTotal, 0),
    todayPatients: allVisits.filter(v => v.visitDate === getCurrentDate()).length,
    todayRevenue: allVisits.filter(v => v.visitDate === getCurrentDate() && !v.isCancelled).reduce((s,v) => s + v.grandTotal, 0),
    totalPatients,
    upcomingReviewsCount: upcomingReviews.length,
  };

  useEffect(() => {
    const patients = storage.getPatients();
    const visits = storage.getVisits();
    setTotalPatients(patients.length);
    setAllVisits(visits);

    // 6-month chart (always shows last 6 months regardless of filter)
    const monthData: ChartData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const m = d.getMonth(); const y = d.getFullYear();
      const mv = visits.filter(v => { const vd = new Date(v.visitDate); return !v.isCancelled && vd.getMonth()===m && vd.getFullYear()===y; });
      monthData.push({ name: getMonthName(m), patients: mv.length, revenue: mv.reduce((s,v)=>s+v.grandTotal,0) });
    }
    setMonthlyData(monthData);

    // Recent visits
    setRecentVisits([...visits].sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,5));

    // Upcoming reviews in next 14 days
    const now = new Date(); const twoWeeks = new Date(); twoWeeks.setDate(now.getDate()+14);
    setUpcomingReviews(
      visits.filter(v => v.reviewDate && new Date(v.reviewDate)>=now && new Date(v.reviewDate)<=twoWeeks && !v.isCancelled)
        .sort((a,b) => new Date(a.reviewDate).getTime()-new Date(b.reviewDate).getTime())
    );
  }, []);

  const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1);
  const maxPatients = Math.max(...monthlyData.map(d => d.patients), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(getCurrentDate())}</p>
      </div>

      {/* Filter Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-gray-200 dark:border-gray-600 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filter Statistics</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activePreset===p.label ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setActivePreset('Custom'); }}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setActivePreset('Custom'); }}
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500" />
          </div>
          <button onClick={() => applyPreset(presets[2])} className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-emerald-600 flex items-center gap-1 border border-gray-200 dark:border-gray-600 rounded-lg">
            <X className="w-3 h-3" />Reset
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Showing: <span className="font-medium text-emerald-600 dark:text-emerald-400">{filterFrom}</span> to <span className="font-medium text-emerald-600 dark:text-emerald-400">{filterTo}</span>
          {' — '}{filteredVisits.length} visits
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: "Today's Patients", value: String(stats.todayPatients), icon: Users, color: 'emerald' },
          { label: "Today's Revenue", value: formatCurrency(stats.todayRevenue), icon: DollarSign, color: 'teal' },
          { label: `${activePreset} Bills`, value: String(stats.periodPatients), icon: Activity, color: 'blue' },
          { label: `${activePreset} Revenue`, value: formatCurrency(stats.periodRevenue), icon: TrendingUp, color: 'cyan' },
          { label: 'Total Patients', value: String(stats.totalPatients), icon: Users, color: 'indigo' },
          { label: 'Upcoming Reviews', value: String(stats.upcomingReviewsCount), icon: Calendar, color: 'amber' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-2 border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 bg-${color}-100 dark:bg-${color}-900/30 rounded-lg flex items-center justify-center`}>
                <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 border-gray-200 dark:border-gray-600">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Monthly Revenue</h3>
          <p className="text-xs text-gray-400 mb-4">Last 6 months</p>
          <div className="flex items-end gap-2 h-40">
            {monthlyData.map((data, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{data.revenue > 0 ? '₹'+Math.round(data.revenue/1000)+'k' : ''}</span>
                <div className="w-full bg-gradient-to-t from-emerald-600 to-teal-500 rounded-t-lg transition-all duration-300"
                  style={{ height: `${(data.revenue / maxRevenue) * 100}%`, minHeight: data.revenue > 0 ? '6px' : '0' }} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{data.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 border-gray-200 dark:border-gray-600">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Monthly Patients</h3>
          <p className="text-xs text-gray-400 mb-4">Last 6 months</p>
          <div className="flex items-end gap-2 h-40">
            {monthlyData.map((data, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{data.patients > 0 ? data.patients : ''}</span>
                <div className="w-full bg-gradient-to-t from-cyan-600 to-blue-500 rounded-t-lg transition-all duration-300"
                  style={{ height: `${(data.patients / maxPatients) * 100}%`, minHeight: data.patients > 0 ? '6px' : '0' }} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{data.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Breakdown by Category */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border-2 border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PieChart className="w-5 h-5 text-emerald-600"/>Revenue Breakdown by Category
          </h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleDownloadRevenuePDF} className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1.5 text-xs font-medium">
              <FileText className="w-3.5 h-3.5"/>PDF
            </button>
            <button onClick={handleDownloadRevenueCSV} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-xs font-medium">
              <Download className="w-3.5 h-3.5"/>CSV
            </button>
            <button onClick={handleDownloadRevenueXLSX} className="px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 flex items-center gap-1.5 text-xs font-medium">
              <FileSpreadsheet className="w-3.5 h-3.5"/>Excel
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Doctor Fee, Medicine, and Expert/Technician Fee come from bill fields directly. Additional-charge items
          (Injection, Wound Dressing, Drips, Nebulizer, etc.) are auto-detected from each bill's charge description — no billing changes needed.
        </p>

        {revenueLines.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <PieChart className="w-10 h-10 mx-auto mb-2 opacity-30"/>
            <p className="text-sm">No revenue in the selected period.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between pb-2 border-b-2 border-gray-200 dark:border-gray-600">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Revenue ({activePreset})</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(revenueTotal)}</span>
            </div>
            {revenueLines.map((line, idx) => {
              const pct = revenueTotal > 0 ? (line.amount / revenueTotal) * 100 : 0;
              const color = revenueColors[idx % revenueColors.length];
              return (
                <div key={line.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      {line.category}
                      <span className="text-xs text-gray-400 font-normal">({line.count} bill{line.count !== 1 ? 's' : ''})</span>
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(line.amount)} <span className="text-xs text-gray-400 font-normal">({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent + Upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-gray-200 dark:border-gray-600">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Visits</h3>
            <Link to="/visits" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">View All <ArrowRight className="w-4 h-4"/></Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {recentVisits.length === 0 ? (
              <div className="p-6 text-center text-gray-500"><Stethoscope className="w-10 h-10 mx-auto mb-2 opacity-30"/><p>No recent visits</p></div>
            ) : recentVisits.map(visit => (
              <Link key={visit.id} to={`/visits/${visit.id}`} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-4 transition-colors">
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-emerald-600 dark:text-emerald-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{visit.billNumber}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(visit.visitDate)}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(visit.grandTotal)}</p>
                  <p className="text-xs text-gray-500">{visit.diagnosis || 'No diagnosis'}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 border-gray-200 dark:border-gray-600">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white">Upcoming Reviews <span className="text-xs text-gray-400 font-normal">(next 14 days)</span></h3>
            <Link to="/search" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">View All <ArrowRight className="w-4 h-4"/></Link>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {upcomingReviews.length === 0 ? (
              <div className="p-6 text-center text-gray-500"><Calendar className="w-10 h-10 mx-auto mb-2 opacity-30"/><p>No upcoming reviews</p></div>
            ) : upcomingReviews.map(visit => (
              <Link key={visit.id} to={`/visits/${visit.id}`} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-4 transition-colors">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">Review: {formatDate(visit.reviewDate)}</p>
                  <p className="text-sm text-gray-500">{visit.billNumber}</p>
                </div>
                <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  {new Date(visit.reviewDate).toLocaleDateString('en-IN',{weekday:'short'})}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
