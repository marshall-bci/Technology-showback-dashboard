// BCI Technology — Technology Showback Dashboard
// Reads from FastAPI backend (auto-refreshes every 30s).
// Finance updates data by running: python scripts/push_data.py "Cost Management.xlsm"
// SSO: users authenticate via Azure AD. Admin manages user access via the Admin tab.
//
// API URL config: set window.COST_API_URL before loading, or defaults to localhost:8000.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  PieChart, Pie, Cell, Sector, ResponsiveContainer,
} from 'recharts';

// ─── Config ───────────────────────────────────────────────────────────────────
const API_URL = (typeof window !== 'undefined' && window.COST_API_URL)
  ? window.COST_API_URL
  : 'http://localhost:8000';
const POLL_MS = 30_000;

// ─── BCI Brand ────────────────────────────────────────────────────────────────
// Source: BCI Studio Data Visualization Style Guide v1.0
const NAVY     = '#00365B';  // Midnight
const CYAN     = '#00ABBD';  // Ocean
const SLATE    = '#457B96';  // Slate
const GRID     = '#D9D9D9';  // Gray 2 — chart gridlines
const BG       = '#F2F2F2';  // Gray 1 — page background

// ─── Departments ──────────────────────────────────────────────────────────────
const DEPTS = [
  { key: 'ceo',        label: 'CEO' },
  { key: 'legal',      label: 'Legal' },
  { key: 'hr',         label: 'HR' },
  { key: 'audit',      label: 'Audit' },
  { key: 'cdoCorpOps', label: 'CD&O + Corp Ops' },
  { key: 'finance',    label: 'Finance' },
  { key: 'technology', label: 'Technology' },
  { key: 'io',         label: 'IO' },
  { key: 'irr',        label: 'IRR' },
  { key: 'isr',        label: 'ISR' },
  { key: 'cmci',       label: 'CM&CI' },
  { key: 'pe',         label: 'PE' },
];

// BCI data-series palette — ordered sequence from the style guide
const DEPT_COLORS = [
  '#00365B', // 1  Midnight
  '#00ABBD', // 2  Ocean
  '#696F79', // 3  Gray
  '#457B96', // 4  Slate
  '#A6B38C', // 5  Khaki
  '#4A317E', // 6  Purple
  '#FDB736', // 7  Yellow
  '#DC642B', // 8  Orange
  '#819F4D', // 9  Emerald
  '#57837B', // 10 Jade
  '#864C9E', // 11 Amethyst
  '#AE1E57', // 12 Garnet
];

const SHOWBACK_COLORS = {
  'None':        '#BFBFBF',
  'Headcount':   '#00365B',
  'Consumption': '#00ABBD',
  'Chargeback':  '#DC642B',
};
const getShowbackColor = (st) => {
  if (!st) return '#BFBFBF';
  const s = st.toLowerCase();
  if (s.includes('chargeback'))  return '#DC642B';
  if (s.includes('consumption')) return '#00ABBD';
  if (s.includes('headcount'))   return '#00365B';
  return '#BFBFBF';
};

const PERIODS = [
  { key: 'actuals',   label: 'Actuals'    },
  { key: 'forecast1', label: 'Forecast 1' },
  { key: 'forecast2', label: 'Forecast 2' },
  { key: 'budget',    label: 'Budget'     },
];

const ALL_TABS = [
  { id: 'overview',    label: 'Overview'          },
  { id: 'departments', label: 'By Department'     },
  { id: 'showback',    label: 'By Showback Type'  },
  { id: 'technology',  label: 'Technology Detail' },
  { id: 'quality',     label: 'Data Quality'      },
  { id: 'userlisting', label: 'My User Listing',  canEditUL: true },
  { id: 'upload',      label: 'Upload (Test)',     adminOnly: true },
  { id: 'admin',       label: 'Admin',             adminOnly: true },
];

const AUTH_ERROR_MESSAGES = {
  not_authorised:         'Your account has not been granted access. Contact your Technology admin.',
  account_inactive:       'Your account has been deactivated. Contact your Technology admin.',
  token_exchange_failed:  'Sign-in failed — please try again.',
  invalid_state:          'Sign-in session expired — please try again.',
  no_email:               'Could not retrieve your email from Microsoft. Please try again.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cad = (v) =>
  v == null ? '—'
  : new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(v);

const pct = (num, denom) =>
  denom ? `${((num / denom) * 100).toFixed(1)}%` : '—';

const cadShort = (v) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${(v / 1_000).toFixed(0)}k`;
};

// ─── Tooltip / card styles ────────────────────────────────────────────────────
const TT   = { fontFamily: "'Open Sans', Calibri, sans-serif", fontSize: 12 };
const card = (extra = {}) => ({
  background: 'white', borderRadius: 8,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  ...extra,
});

// ─── Component ────────────────────────────────────────────────────────────────
export default function TechnologyShowbackDashboard() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [user,         setUser]         = useState(null);
  const [authChecked,  setAuthChecked]  = useState(false);
  const [authError,    setAuthError]    = useState('');

  // ── Data ────────────────────────────────────────────────────────────────────
  const [rows,       setRows]       = useState([]);
  const [updatedAt,  setUpdatedAt]  = useState(null);
  const [sheetName,  setSheetName]  = useState(null);
  const [serverOk,   setServerOk]   = useState(true);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState('overview');
  const [period,          setPeriod]          = useState('actuals');
  const [filterShowback,  setFilterShowback]  = useState('All');
  const [filterCostModel, setFilterCostModel] = useState('All');
  const [filterDept,      setFilterDept]      = useState('All');
  const [hoveredSegment,  setHoveredSegment]  = useState(null);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading,    setUploading]    = useState(false);

  // ── Admin ───────────────────────────────────────────────────────────────────
  const [adminUsers,      setAdminUsers]      = useState([]);
  const [adminLogs,       setAdminLogs]       = useState([]);
  const [adminCostModel,  setAdminCostModel]  = useState([]);
  const [adminHeadcount,  setAdminHeadcount]  = useState([]);
  const [adminUserList,   setAdminUserList]   = useState([]);
  const [adminTab,        setAdminTab]        = useState('users');
  const [userFormEmail,   setUserFormEmail]   = useState('');
  const [userFormName,    setUserFormName]    = useState('');
  const [userFormAdmin,      setUserFormAdmin]      = useState(false);
  const [userFormCanEditUL,  setUserFormCanEditUL]  = useState(false);
  const [userFormGLs,        setUserFormGLs]        = useState('');
  const [userFormBranch,  setUserFormBranch]  = useState('');
  const [adminMsg,        setAdminMsg]        = useState('');
  const [editingUser,     setEditingUser]     = useState(null);
  const [editingCmId,     setEditingCmId]     = useState(null);
  const [editingCmData,   setEditingCmData]   = useState({});
  const [openCombo,       setOpenCombo]       = useState(null);
  const [comboQuery,      setComboQuery]      = useState('');
  const [editingHcId,     setEditingHcId]     = useState(null);
  const [editingHcData,   setEditingHcData]   = useState({});
  const [deletingHcId,    setDeletingHcId]    = useState(null);
  const [newHcRow,        setNewHcRow]        = useState(null);
  const [editingUlId,     setEditingUlId]     = useState(null);
  const [editingUlData,   setEditingUlData]   = useState({});
  const [recalcStatus,    setRecalcStatus]    = useState('');
  const [recalcing,       setRecalcing]       = useState(false);
  const [recalcHcYear,    setRecalcHcYear]    = useState('fy2026');
  const [hcYearTypes,     setHcYearTypes]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('hcYearTypes')) || {}; } catch { return {}; }
  });
  const [baseYear,        setBaseYear]        = useState(() => {
    const y = parseInt(localStorage.getItem('hcBaseYear'));
    return isNaN(y) ? 2026 : y;
  });
  const [resetModalOpen,  setResetModalOpen]  = useState(false);
  const [resetTyped,      setResetTyped]      = useState('');

  const pollRef = useRef(null);

  // ── Auth check on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const errCode = params.get('auth_error');
    const ok      = params.get('auth_success');
    if (errCode) setAuthError(errCode);
    if (errCode || ok) window.history.replaceState({}, '', window.location.pathname);

    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setAuthChecked(true); })
      .catch(() => setAuthChecked(true));
  }, []);

  // ── Fetch cost data ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/data`, { credentials: 'include' });
      if (res.status === 401) { setUser(null); return; }
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.rows || []);
      setUpdatedAt(data.updatedAt);
      setSheetName(data.sheetName);
      setServerOk(true);
    } catch {
      setServerOk(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [user, fetchData]);

  // ── Upload state ─────────────────────────────────────────────────────────────
  const [updateRefs, setUpdateRefs] = useState(false);

  // ── File upload (admin — sends raw file to /api/upload) ─────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus('Uploading and running allocation…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = `${API_URL}/api/upload?update_refs=${updateRefs}`;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        const refNote = data.refsUpdated ? ' (reference tables refreshed)' : '';
        setUploadStatus(`✓ ${data.rowCount} rows calculated${refNote}.`);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        setUploadStatus(`Error: ${err.detail || err.error || res.status}`);
      }
    } catch (err) {
      setUploadStatus(`Error: ${err.message}`);
    }
    setUploading(false);
    e.target.value = '';
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setRows([]);
  };

  // ── Admin helpers ────────────────────────────────────────────────────────────
  const loadAdminUsers = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/users`, { credentials: 'include' });
    if (res.ok) setAdminUsers(await res.json());
  }, []);

  const loadAdminLogs = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/logs`, { credentials: 'include' });
    if (res.ok) setAdminLogs(await res.json());
  }, []);

  const loadAdminCostModel = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/cost-model`, { credentials: 'include' });
    if (res.ok) setAdminCostModel(await res.json());
  }, []);

  const loadAdminHeadcount = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/headcount`, { credentials: 'include' });
    if (res.ok) setAdminHeadcount(await res.json());
  }, []);

  const loadAdminUserList = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/user-listing`, { credentials: 'include' });
    if (res.ok) setAdminUserList(await res.json());
  }, []);

  useEffect(() => {
    if (!user?.is_admin || activeTab !== 'admin') return;
    loadAdminUsers();
    loadAdminLogs();
  }, [user, activeTab, loadAdminUsers, loadAdminLogs]);

  // Load reference tables on login (powers filter dropdowns for all tabs)
  useEffect(() => {
    if (!user?.is_admin) return;
    loadAdminCostModel();
    loadAdminHeadcount();
  }, [user, loadAdminCostModel, loadAdminHeadcount]);

  useEffect(() => {
    if (!user?.is_admin || activeTab !== 'admin') return;
    if (adminTab === 'costmodel') { loadAdminCostModel(); if (!adminHeadcount.length) loadAdminHeadcount(); }
    if (adminTab === 'headcount') loadAdminHeadcount();
    if (adminTab === 'userlisting') loadAdminUserList();
  }, [user, activeTab, adminTab, loadAdminCostModel, loadAdminHeadcount, loadAdminUserList]);

  useEffect(() => {
    if (activeTab === 'userlisting' && user?.can_edit_user_listing && !user?.is_admin) {
      loadAdminUserList();
    }
  }, [user, activeTab, loadAdminUserList]);

  const resetUserForm = () => {
    setUserFormEmail(''); setUserFormName(''); setUserFormAdmin(false);
    setUserFormCanEditUL(false);
    setUserFormGLs(''); setUserFormBranch(''); setEditingUser(null); setAdminMsg('');
  };

  const populateEditForm = (u) => {
    setUserFormEmail(u.email);
    setUserFormName(u.display_name || '');
    setUserFormAdmin(u.is_admin);
    setUserFormCanEditUL(u.can_edit_user_listing || false);
    setUserFormGLs((u.allowed_gl_codes || []).join(', '));
    setUserFormBranch((u.allowed_branches || []).join(', '));
    setEditingUser(u.email);
    setAdminMsg('');
  };

  const submitUserForm = async () => {
    if (!userFormEmail.trim()) { setAdminMsg('Email is required.'); return; }
    const payload = {
      email:                  userFormEmail.trim().toLowerCase(),
      display_name:           userFormName.trim() || undefined,
      is_admin:               userFormAdmin,
      can_edit_user_listing:  userFormCanEditUL,
      allowed_gl_codes:       userFormGLs.split(',').map(s => s.trim()).filter(Boolean),
      allowed_branches:       userFormBranch.split(',').map(s => s.trim()).filter(Boolean),
    };
    const url    = editingUser ? `${API_URL}/admin/users/${encodeURIComponent(editingUser)}` : `${API_URL}/admin/users`;
    const method = editingUser ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method, credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setAdminMsg(editingUser ? '✓ User updated.' : '✓ User created.');
      resetUserForm();
      loadAdminUsers();
    } else {
      const err = await res.json().catch(() => ({}));
      setAdminMsg(`Error: ${err.detail || res.status}`);
    }
  };

  const deactivateUser = async (email) => {
    if (!window.confirm(`Deactivate ${email}?`)) return;
    const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(email)}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    if (res.ok) { setAdminMsg(`✓ ${email} deactivated.`); loadAdminUsers(); }
  };

  const deleteUser = async (email) => {
    if (!window.confirm(`Permanently delete ${email}?`)) return;
    const res = await fetch(`${API_URL}/admin/users/${encodeURIComponent(email)}`, {
      method: 'DELETE', credentials: 'include',
    });
    if (res.ok) { setAdminMsg(`✓ ${email} deleted.`); loadAdminUsers(); }
  };

  // ── Filtered rows ───────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filterShowback !== 'All' && (r.showbackType || 'None') !== filterShowback) return false;
    if (filterCostModel !== 'All' && r.currentCostModel !== filterCostModel) return false;
    if (filterDept !== 'All' && !r[filterDept]) return false;
    return true;
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const totalPeriod  = filtered.reduce((s, r) => s + (r[period] || 0), 0);
  const totalActuals = filtered.reduce((s, r) => s + r.actuals, 0);
  const totalBudget  = filtered.reduce((s, r) => s + r.budget, 0);
  const techActuals  = filtered.reduce((s, r) => s + r.technology, 0);
  const flaggedCount = filtered.filter(r => r.comments).length;

  const showbackPieData = Object.entries(
    filtered.reduce((acc, r) => {
      const st = r.showbackType || 'None';
      acc[st] = (acc[st] || 0) + (r[period] || 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }))
   .sort((a, b) => b.value - a.value); // largest → smallest, clockwise from top

  const deptTotals = DEPTS.map((d, i) => ({
    name:   d.label,
    key:    d.key,
    value:  filtered.reduce((s, r) => s + (r[d.key] || 0), 0),
    color:  DEPT_COLORS[i],
    isTech: d.key === 'technology',
  })).sort((a, b) => b.value - a.value);

  const showbackTypes   = [...new Set(rows.map(r => r.showbackType || 'None'))];
  const uniqueShowbacks = [...new Set(rows.map(r => r.showbackType || 'None'))];

  const dynamicPeriods = [
    { key: 'actuals',   label: `FY${baseYear} (${hcYearTypes['fy2026'] || 'Actual'})` },
    { key: 'forecast1', label: `FY${baseYear + 1} (${hcYearTypes['fy2027'] || 'Forecast'})` },
    { key: 'forecast2', label: `FY${baseYear + 2} (${hcYearTypes['fy2028'] || 'Forecast'})` },
    { key: 'budget',    label: 'Budget' },
  ];
  const periodLabel = dynamicPeriods.find(p => p.key === period)?.label || period;

  const showbackFilterOpts = adminCostModel.length > 0
    ? [...new Set(adminCostModel.map(r => r.showbackType).filter(Boolean))].sort()
    : uniqueShowbacks;

  const costModelFilterOpts = adminCostModel.length > 0
    ? [...new Set(adminCostModel.map(r => r.currentCostModel).filter(Boolean))].sort()
    : [...new Set(rows.map(r => r.currentCostModel).filter(Boolean))].sort();

  const deptFilterOpts = DEPTS.map(d => {
    const hc = adminHeadcount.find(h => h.shortCode?.toLowerCase() === d.key?.toLowerCase());
    return { value: d.key, label: hc ? (hc.deptName || d.label) : d.label };
  });

  const showbackChartData = Object.values(
    filtered.reduce((acc, r) => {
      const cat = r.costModelCategory || 'Uncategorised';
      const st  = r.showbackType || 'None';
      if (!acc[cat]) acc[cat] = { name: cat };
      acc[cat][st] = (acc[cat][st] || 0) + (r[period] || 0);
      return acc;
    }, {})
  );

  const techRows    = filtered.filter(r => r.technology > 0 || r.currentCostModel.toLowerCase().includes('chargeback'));
  const flaggedRows = rows.filter(r => r.comments);
  const TABS = ALL_TABS.filter(t => {
    if (t.adminOnly) return user?.is_admin;
    if (t.canEditUL) return user?.can_edit_user_listing && !user?.is_admin;
    return true;
  });

  // ─── Login screen ────────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ fontFamily: "'Open Sans', Calibri, sans-serif", background: BG, minHeight: '100vh',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ color: '#BFBFBF', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!user) {
    const errMsg = AUTH_ERROR_MESSAGES[authError] || (authError ? authError.replace(/_/g, ' ') : '');
    return (
      <div style={{
        fontFamily: "'Open Sans', Calibri, sans-serif",
        background: 'linear-gradient(135deg, #00365B 0%, #005a8e 100%)',
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div style={{
          background: 'white', borderRadius: 12, padding: '48px 40px', width: 400,
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: NAVY, letterSpacing: 1, marginBottom: 4 }}>
            BCI
          </div>
          <div style={{ fontSize: 13, color: '#696F78', marginBottom: 32 }}>
            British Columbia Investment Management Corporation
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
            Technology Showback Dashboard
          </div>
          <div style={{ fontSize: 13, color: '#515254', marginBottom: 28, lineHeight: 1.6 }}>
            Sign in with your BCI account to view cost allocations and showback reports.
          </div>

          {errMsg && (
            <div style={{
              background: '#FFF0F0', border: '1px solid #FFCCCC', borderRadius: 6,
              padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#C62828', textAlign: 'left',
            }}>
              {errMsg}
            </div>
          )}

          <a
            href={`${API_URL}/auth/login`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: NAVY, color: 'white', borderRadius: 8, width: '100%', boxSizing: 'border-box',
              padding: '14px 24px', textDecoration: 'none', fontSize: 14, fontWeight: 600,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 21 21" fill="none" style={{ flexShrink: 0 }}>
              <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7fba00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Sign in with BCI (Microsoft SSO)
          </a>

          {API_URL.includes('localhost') && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #EEE' }}>
              <div style={{ fontSize: 11, color: '#BBB', marginBottom: 8, textAlign: 'center' }}>
                Local dev — no Azure AD needed
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`${API_URL}/auth/dev-login?email=testadmin@bci.ca`} style={{
                  flex: 1, textAlign: 'center', padding: '9px',
                  border: '1px dashed #CCC', borderRadius: 6, color: '#515254',
                  textDecoration: 'none', fontSize: 12,
                }}>Dev Admin</a>
                <a href={`${API_URL}/auth/dev-login?email=testviewer@bci.ca`} style={{
                  flex: 1, textAlign: 'center', padding: '9px',
                  border: '1px dashed #CCC', borderRadius: 6, color: '#515254',
                  textDecoration: 'none', fontSize: 12,
                }}>Dev Viewer</a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main dashboard ───────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Open Sans', Calibri, sans-serif", background: BG, minHeight: '100vh' }}>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ background: NAVY, color: 'white', padding: '16px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.3 }}>
              Technology Showback Dashboard
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
              {sheetName
                ? `${sheetName} · Updated ${new Date(updatedAt).toLocaleString('en-CA')}`
                : 'No data loaded — upload a file or run the Finance script'}
            </div>
            {!serverOk && (
              <div style={{ fontSize: 11, marginTop: 4, color: '#FFB3B3' }}>
                ⚠ Cannot reach API at {API_URL} — server may be offline
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{user.name || user.email}</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {user.is_admin ? 'Admin' : 'Viewer'}
                {user.email !== user.name && ` · ${user.email}`}
              </div>
            </div>
            <button
              onClick={fetchData}
              style={{
                background: CYAN, color: 'white', border: 'none',
                borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
            >↻ Refresh</button>
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(255,255,255,0.12)', color: 'white',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}
            >Sign out</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginTop: 18, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: activeTab === t.id ? CYAN : 'transparent',
                color: 'white',
                border: `1px solid ${activeTab === t.id ? CYAN : 'rgba(255,255,255,0.25)'}`,
                borderBottom: 'none',
                borderRadius: '4px 4px 0 0',
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === t.id ? 600 : 400,
              }}
            >
              {t.label}
              {t.id === 'quality' && flaggedCount > 0 && (
                <span style={{
                  background: '#FF4444', color: 'white', borderRadius: 10,
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', marginLeft: 6,
                }}>{flaggedCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Global Filters ─────────────────────────────────────────────────────── */}
      {!['upload', 'quality', 'admin', 'userlisting'].includes(activeTab) && (
        <div style={{
          background: 'white', borderBottom: '1px solid #E8E8E8',
          padding: '10px 32px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Filters</span>
          {[
            { label: 'Period',     value: period,          setter: setPeriod,          options: dynamicPeriods.map(p => ({ value: p.key, label: p.label })) },
            { label: 'Showback',   value: filterShowback,  setter: setFilterShowback,  options: [{ value: 'All', label: 'All' }, ...showbackFilterOpts.map(s => ({ value: s, label: s }))] },
            { label: 'Cost Model', value: filterCostModel, setter: setFilterCostModel, options: [{ value: 'All', label: 'All' }, ...costModelFilterOpts.map(c => ({ value: c, label: c }))] },
            { label: 'Department', value: filterDept,      setter: setFilterDept,      options: [{ value: 'All', label: 'All' }, ...deptFilterOpts] },
          ].map(f => (
            <label key={f.label} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 500, color: '#515254' }}>{f.label}</span>
              <select value={f.value} onChange={e => f.setter(e.target.value)}
                style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '3px 8px', fontSize: 12, color: NAVY }}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#696F78' }}>
            {filtered.length} of {rows.length} line items
          </span>
        </div>
      )}

      {/* ── Tab Content ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px' }}>

        {/* Empty state */}
        {rows.length === 0 && !['upload', 'admin'].includes(activeTab) && (
          <div style={{ textAlign: 'center', padding: 80, color: '#BFBFBF' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: NAVY }}>No data loaded</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>
              {user.is_admin
                ? <>Use the <button onClick={() => setActiveTab('upload')} style={{ color: CYAN, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Upload tab</button> to load data.</>
                : 'An admin has not yet loaded data. Check back later.'}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW                                                           */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && rows.length > 0 && (() => {
          const belowThresholdRows = filtered.filter(r =>
            r.actuals > 0 && r.actuals < 25_000 &&
            r.showbackType && r.showbackType !== 'None'
          );
          const frameworkTiles = [
            {
              label: 'Chargeback',
              sub: 'LOB-specific costs billed directly to departments',
              color: '#DC642B',
              rows: filtered.filter(r => (r.showbackType || '').toLowerCase() === 'chargeback' ||
                                         (r.currentCostModel || '').toLowerCase().includes('chargeback')),
            },
            {
              label: 'Showback — Consumption',
              sub: 'Cloud & usage-based costs shown back by actual consumption',
              color: CYAN,
              rows: filtered.filter(r => (r.showbackType || '').toLowerCase().includes('consumption')),
            },
            {
              label: 'Showback — Headcount',
              sub: 'Technology assets allocated proportional to headcount',
              color: NAVY,
              rows: filtered.filter(r => (r.showbackType || '').toLowerCase().includes('headcount')),
            },
            {
              label: 'Direct / No Showback',
              sub: 'Costs absorbed by Technology, not yet shown back',
              color: '#696F79',
              rows: filtered.filter(r => {
                const st = (r.showbackType || '').toLowerCase();
                return !r.showbackType || st === 'none' || st.includes('no showback');
              }),
            },
          ];
          return (
          <div>
            {/* PPT Framework tiles — mirrors Slide 4 (4-approach framework) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {frameworkTiles.map((tile, i) => {
                const tileTotal = tile.rows.reduce((s, r) => s + (r[period] || 0), 0);
                return (
                  <div key={i} style={card({ padding: '14px 18px', borderTop: `3px solid ${tile.color}` })}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tile.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>{tile.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '6px 0 3px' }}>{cadShort(tileTotal)}</div>
                    <div style={{ fontSize: 10, color: '#696F78', lineHeight: 1.4, marginBottom: 4 }}>{tile.sub}</div>
                    <div style={{ fontSize: 10, color: '#BFBFBF' }}>{tile.rows.length} items · {pct(tileTotal, totalPeriod)}</div>
                  </div>
                );
              })}
            </div>

            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Total Actuals',        value: cadShort(totalActuals), sub: `Budget: ${cadShort(totalBudget)}`,                               accent: CYAN },
                { label: 'Technology Share',     value: cadShort(techActuals),  sub: `${pct(techActuals, totalActuals)} of total actuals`,             accent: NAVY },
                { label: 'Below $25K Threshold', value: belowThresholdRows.length,
                  sub: belowThresholdRows.length > 0
                    ? `${cadShort(belowThresholdRows.reduce((s,r)=>s+r.actuals,0))} shown back below materiality`
                    : 'No items below threshold',
                  accent: belowThresholdRows.length > 0 ? '#FF9800' : '#43A047' },
              ].map((kpi, i) => (
                <div key={i} style={card({ padding: '20px 22px', borderTop: `3px solid ${kpi.accent}` })}>
                  <div style={{ fontSize: 11, color: '#696F78', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: '8px 0 4px' }}>{kpi.value}</div>
                  <div style={{ fontSize: 11, color: '#696F78' }}>{kpi.sub}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, marginBottom: 20 }}>

              {/* Donut chart — hover elevates segment + dims rest; legend hover mirrors */}
              <div style={card({ padding: 22 })}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>Cost by Showback Type</div>
                <div style={{ fontSize: 11, color: '#696F78', marginBottom: 16 }}>{periodLabel}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flexShrink: 0, width: 168, height: 168 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={showbackPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%" cy="50%"
                          outerRadius={68}
                          innerRadius={44}
                          startAngle={90}
                          endAngle={-270}
                          stroke="white"
                          strokeWidth={2}
                          onMouseEnter={(_, i) => setHoveredSegment(showbackPieData[i].name)}
                          onMouseLeave={() => setHoveredSegment(null)}
                        >
                          {showbackPieData.map((entry, i) => {
                            const isActive = hoveredSegment === entry.name;
                            const isDimmed = hoveredSegment !== null && !isActive;
                            return (
                              <Cell key={i}
                                fill={getShowbackColor(entry.name) || DEPT_COLORS[i % DEPT_COLORS.length]}
                                style={{
                                  opacity: isDimmed ? 0.2 : 1,
                                  filter: isActive ? 'brightness(1.08) drop-shadow(0 2px 8px rgba(0,0,0,0.28))' : 'none',
                                  transition: 'opacity 0.2s ease, filter 0.2s ease',
                                  cursor: 'pointer',
                                }}
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip formatter={(v) => cad(v)} contentStyle={TT} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* BCI-style legend — hover here also focuses the donut */}
                  <div style={{ flex: 1, fontSize: 11 }}>
                    {showbackPieData.map((entry, i) => {
                      const isActive = hoveredSegment === entry.name;
                      const isDimmed = hoveredSegment !== null && !isActive;
                      return (
                        <div key={i}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9,
                            opacity: isDimmed ? 0.25 : 1,
                            transition: 'opacity 0.2s ease',
                            cursor: 'default',
                          }}
                          onMouseEnter={() => setHoveredSegment(entry.name)}
                          onMouseLeave={() => setHoveredSegment(null)}
                        >
                          <span style={{
                            width: 12, height: 12,
                            borderRadius: 2, flexShrink: 0,
                            background: getShowbackColor(entry.name) || DEPT_COLORS[i % DEPT_COLORS.length],
                            transform: isActive ? 'scale(1.25)' : 'scale(1)',
                            transition: 'transform 0.2s ease',
                          }} />
                          <span style={{ flex: 1, color: '#515254', fontWeight: isActive ? 700 : 400 }}>{entry.name}</span>
                          <span style={{ fontWeight: 700, color: NAVY, minWidth: 62, textAlign: 'right' }}>{cadShort(entry.value)}</span>
                          <span style={{ color: '#696F78', minWidth: 36, textAlign: 'right' }}>{pct(entry.value, totalPeriod)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Horizontal bar chart — BCI style: Midnight highlight, Gray 3 de-emphasis, value labels at bar end */}
              <div style={card({ padding: 22 })}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>Department Allocations</div>
                <div style={{ fontSize: 11, color: '#696F78', marginBottom: 16 }}>{periodLabel}</div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={deptTotals} layout="vertical" margin={{ left: 0, right: 56 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                    <XAxis type="number" tickFormatter={v => cadShort(v)} style={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" style={{ fontSize: 11 }} width={110} />
                    <Tooltip cursor={false} formatter={(v) => cad(v)} contentStyle={TT} />
                    <Bar dataKey="value" stroke="white" strokeWidth={1}
                      activeBar={{ fill: CYAN, stroke: 'white', strokeWidth: 1 }}>
                      {deptTotals.map((d, i) => (
                        <Cell key={i} fill={d.isTech ? NAVY : '#BFBFBF'} />
                      ))}
                      <LabelList dataKey="value" position="right"
                        formatter={v => cadShort(v)}
                        style={{ fontSize: 10, fill: '#515254' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BY DEPARTMENT                                                      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'departments' && rows.length > 0 && (
          <div>
            <div style={card({ padding: 24, marginBottom: 24 })}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Allocated Cost by Department</div>
              <div style={{ fontSize: 12, color: '#696F78', marginBottom: 16 }}>{periodLabel}</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptTotals} margin={{ bottom: 48, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" style={{ fontSize: 11 }} interval={0} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} style={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => cad(v)} contentStyle={TT} />
                  <Bar dataKey="value" stroke="white" strokeWidth={1}>
                    {deptTotals.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={card({ overflow: 'hidden' })}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: NAVY, color: 'white' }}>
                    {['Department', 'Amount', '% of Total', '# Line Items'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: i > 0 ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptTotals.map((d, i) => {
                    const lineCount  = filtered.filter(r => (r[d.key] || 0) > 0).length;
                    const grandTotal = deptTotals.reduce((s, x) => s + x.value, 0);
                    return (
                      <tr key={d.key} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ padding: '9px 16px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                            {d.name}
                            {d.isTech && <span style={{ background: CYAN, color: 'white', fontSize: 10, borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>You</span>}
                          </span>
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600 }}>{cad(d.value)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: '#515254' }}>{pct(d.value, grandTotal)}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', color: '#515254' }}>{lineCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BY SHOWBACK TYPE                                                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'showback' && rows.length > 0 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
              {uniqueShowbacks.map(st => {
                const stRows = filtered.filter(r => (r.showbackType || 'None') === st);
                const total  = stRows.reduce((s, r) => s + (r[period] || 0), 0);
                return (
                  <div key={st} style={card({ padding: 20, borderLeft: `4px solid ${getShowbackColor(st)}` })}>
                    <div style={{ fontSize: 12, color: '#515254', fontWeight: 500 }}>{st || 'None'}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: '4px 0' }}>{cad(total)}</div>
                    <div style={{ fontSize: 12, color: '#696F78' }}>{stRows.length} line items · {pct(total, totalPeriod)}</div>
                  </div>
                );
              })}
            </div>
            <div style={card({ padding: 24, marginBottom: 24 })}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Showback Type across Cost Model Categories</div>
              <div style={{ fontSize: 12, color: '#696F78', marginBottom: 16 }}>{periodLabel} · stacked</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={showbackChartData} margin={{ bottom: 40, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" style={{ fontSize: 11 }} interval={0} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} style={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => cad(v)} contentStyle={TT} />
                  <Legend />
                  {showbackTypes.map((st, i) => (
                    <Bar key={st} dataKey={st} stackId="a" fill={getShowbackColor(st) || DEPT_COLORS[i % DEPT_COLORS.length]} stroke="white" strokeWidth={1} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* TECHNOLOGY DETAIL                                                  */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'technology' && rows.length > 0 && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              {[
                { label: `Technology (${periodLabel})`,     value: cad(techRows.reduce((s, r) => s + (r[period] || 0), 0)), color: NAVY },
                { label: 'Technology Column Allocation',    value: cad(techRows.reduce((s, r) => s + r.technology, 0)),     color: CYAN },
                { label: 'Line Items',                      value: techRows.length,                                         color: SLATE },
              ].map((stat, i) => (
                <div key={i} style={card({ padding: '16px 24px', borderLeft: `3px solid ${stat.color}` })}>
                  <div style={{ fontSize: 11, color: '#696F78' }}>{stat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginTop: 4 }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={card({ overflow: 'hidden' })}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: NAVY, color: 'white' }}>
                      {['PID', 'Description', 'GL Category', 'Showback', 'Cost Model', 'Actuals', 'Budget', 'Technology $'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: i >= 5 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {techRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F2F2F2' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#515254' }}>{r.pid || '—'}</td>
                        <td style={{ padding: '8px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                        <td style={{ padding: '8px 12px', color: '#515254' }}>{r.glCategory}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {r.showbackType && (
                            <span style={{ background: getShowbackColor(r.showbackType), color: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>{r.showbackType}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#515254', fontSize: 11 }} title={r.currentCostModel}>{r.currentCostModel}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{cad(r.actuals)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#696F78' }}>{cad(r.budget)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: NAVY }}>{cad(r.technology)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* DATA QUALITY                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'quality' && (() => {
          const belowMaterialityRows = rows.filter(r =>
            r.actuals > 0 && r.actuals < 25_000 &&
            r.showbackType && r.showbackType !== 'None'
          );
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {flaggedRows.length === 0 ? (
              <div style={card({ padding: 64, textAlign: 'center' })}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: NAVY }}>No data quality issues</div>
                <div style={{ fontSize: 13, color: '#696F78', marginTop: 4 }}>All rows have complete cost model data.</div>
              </div>
            ) : (
              <div style={card({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{flaggedRows.length} flagged rows</span>
                  <span style={{ fontSize: 12, color: '#696F78' }}>from allocation engine comments</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {['PID', 'Branch', 'GL Code', 'Description', 'Actuals', 'Flag / Comment'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 12px', fontWeight: 600, textAlign: i === 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedRows.map((r, i) => {
                        const isChargeback = r.comments.toLowerCase().includes('chargeback');
                        const isMissing    = r.comments.toLowerCase().includes('missing');
                        const rowBg = isChargeback ? 'rgba(193,182,78,0.12)' : isMissing ? 'rgba(229,115,115,0.12)' : i % 2 === 0 ? '#FAFAFA' : 'white';
                        return (
                          <tr key={i} style={{ background: rowBg, borderBottom: '1px solid #F0F0F0' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.pid || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>{r.branch}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.glCode}</td>
                            <td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>{cad(r.actuals)}</td>
                            <td style={{ padding: '8px 12px', color: '#C62828', fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.comments}>{r.comments}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Below $25K materiality threshold — PPT Slide 8, Action 3 */}
            <div style={card({ overflow: 'hidden' })}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Below $25K Materiality Threshold</span>
                  <span style={{ background: '#FF9800', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{belowMaterialityRows.length}</span>
                </div>
                <div style={{ fontSize: 12, color: '#696F78', marginTop: 3 }}>
                  Items currently shown back with actuals below $25K — consider whether showback overhead is justified (ref: Cost Management Strategy Action 3)
                </div>
              </div>
              {belowMaterialityRows.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>
                  No showback items below the $25K threshold.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {['PID', 'Description', 'Showback Type', 'Cost Model', 'Actuals'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 12px', fontWeight: 600, textAlign: i === 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {belowMaterialityRows.map((r, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.pid || '—'}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ background: getShowbackColor(r.showbackType), color: 'white', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 500 }}>{r.showbackType}</span>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.currentCostModel}>{r.currentCostModel}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#FF9800' }}>{cad(r.actuals)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* UPLOAD (admin only)                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'upload' && (
          <div style={{ maxWidth: 560 }}>
            <div style={card({ padding: 32 })}>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Upload Cost Management XLSM</div>

              {/* How it works */}
              <div style={{ background: '#F0F7FF', border: '1px solid #C8DFF5', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 12, lineHeight: 1.7, color: '#515254' }}>
                <strong style={{ color: NAVY }}>How this works:</strong><br />
                The dashboard maintains its own copy of the <strong>Cost Model</strong>, <strong>Headcount</strong>, and <strong>User Listing</strong> tables in the database.
                You can edit those tables directly in the <strong>Admin → Cost Model / Headcount / User Listing</strong> tabs — edits are saved immediately.<br /><br />
                For day-to-day updates, just upload the XLSM and the system will use the stored reference data to run the allocation.
                Only tick <em>"Refresh reference tables"</em> when the Cost Model, Headcount or User Listing sheets themselves have changed.
              </div>

              {/* Checkbox — refresh refs */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={updateRefs}
                  onChange={e => setUpdateRefs(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: '#515254', lineHeight: 1.5 }}>
                  <strong>Refresh reference tables from file</strong><br />
                  <span style={{ fontSize: 11, color: '#696F78' }}>
                    Re-reads Cost Model, Headcount &amp; User Listing sheets and replaces stored data.
                    Tick this only when those sheets have changed — it will overwrite any edits made in the Admin panel.
                  </span>
                </span>
              </label>

              <div style={{ border: '2px dashed #D0D0D0', borderRadius: 8, padding: '28px 24px', textAlign: 'center', background: '#FAFAFA' }}>
                <input type="file" id="cm-file-input" accept=".xlsx,.xlsm,.xls" onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} />
                <label htmlFor="cm-file-input" style={{
                  background: uploading ? '#AAA' : NAVY, color: 'white', padding: '10px 28px',
                  borderRadius: 6, cursor: uploading ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-block',
                }}>
                  {uploading ? 'Running allocation…' : 'Choose File & Run Allocation'}
                </label>
                <div style={{ marginTop: 10, fontSize: 11, color: '#696F78' }}>
                  Reads OC Data Refresh · uses {updateRefs ? 'file' : 'stored'} reference data · results available to all users instantly
                </div>
              </div>
              {uploadStatus && (
                <div style={{
                  marginTop: 16, padding: '10px 16px', borderRadius: 6, fontSize: 13,
                  background: uploadStatus.startsWith('Error') ? '#FFF0F0' : '#F0FFF4',
                  color:      uploadStatus.startsWith('Error') ? '#C62828' : '#2E7D32',
                }}>
                  {uploadStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MY USER LISTING (branch managers only)                            */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'userlisting' && (
          <div style={card({ overflow: 'hidden' })}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>My User Listing ({adminUserList.length} rows)</span>
                <span style={{ fontSize: 12, color: '#696F78', marginLeft: 12 }}>Branches: {(user?.allowed_branches || []).join(', ') || 'All'}</span>
              </div>
              <button onClick={loadAdminUserList} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: NAVY, color: 'white' }}>
                    {['Branch Name','Branch Code','PID','Description','CEO','Legal','Corp Ops','HR','Audit','CD&O','Finance','Tech','IO','IRR','PE','CM&CI','ISR',''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', textAlign: i >= 4 && i <= 16 ? 'right' : 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adminUserList.slice(0, 300).map((r, i) => {
                    const isEditing = editingUlId === r.id;
                    const ulFields = ['ceo','legal','corpOps','hr','audit','cdo','finance','technology','io','irr','pe','cmci','isr'];
                    return (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{r.branchName}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.branchCode}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 10 }}>{r.pid}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                        {ulFields.map(f => (
                          <td key={f} style={{ padding: '6px 10px', textAlign: 'right' }}>
                            {isEditing
                              ? <input type="number" step="1" min="0"
                                  value={editingUlData[f] ?? r[f] ?? 0}
                                  onChange={e => setEditingUlData(d => ({...d, [f]: parseFloat(e.target.value) || 0}))}
                                  style={{ width: 50, border: '1px solid #D0D0D0', borderRadius: 3, padding: '2px 4px', fontSize: 10, textAlign: 'right' }} />
                              : (r[f] || 0)}
                          </td>
                        ))}
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {isEditing ? (
                            <>
                              <button onClick={async () => {
                                await fetch(`${API_URL}/admin/user-listing/${r.id}`, {
                                  method: 'PUT', credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(editingUlData),
                                });
                                setEditingUlId(null); setEditingUlData({});
                                loadAdminUserList();
                              }} style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Save</button>
                              <button onClick={() => { setEditingUlId(null); setEditingUlData({}); }} style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>✕</button>
                            </>
                          ) : (
                            <button onClick={() => { setEditingUlId(r.id); setEditingUlData({...r}); }} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>Edit</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {adminUserList.length === 0 && (
                    <tr><td colSpan={18} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No data loaded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {adminUserList.length > 300 && (
              <div style={{ padding: '10px 20px', fontSize: 12, color: '#696F78', borderTop: '1px solid #EEE' }}>
                Showing first 300 of {adminUserList.length} rows.
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ADMIN                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'admin' && (
          <div>
            {/* Danger zone — reset */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setResetModalOpen(true); setResetTyped(''); }}
                style={{
                  background: 'white', color: '#C62828',
                  border: '1px solid #C62828', borderRadius: 6,
                  padding: '7px 16px', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                }}
              >
                Reset to clean slate
              </button>
            </div>

            {adminMsg && (
              <div style={{
                marginBottom: 16, padding: '9px 14px', borderRadius: 5, fontSize: 13,
                background: adminMsg.startsWith('✓') ? '#F0FFF4' : '#FFF0F0',
                color:      adminMsg.startsWith('✓') ? '#2E7D32' : '#C62828',
              }}>{adminMsg}</div>
            )}

            {/* Recalculate button */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <label style={{ fontSize: 13, color: '#515254', whiteSpace: 'nowrap' }}>Headcount year:</label>
                <select value={recalcHcYear} onChange={e => setRecalcHcYear(e.target.value)}
                  style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '5px 10px', fontSize: 13, flex: 1 }}>
                  {['fy2026','fy2027','fy2028'].map((yr, idx) => (
                    <option key={yr} value={yr}>
                      FY{baseYear + idx} — {hcYearTypes[yr] || 'Actual'}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={async () => {
                  setRecalcing(true);
                  setRecalcStatus('');
                  try {
                    const res = await fetch(`${API_URL}/api/recalculate`, {
                      method: 'POST', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ period, headcountYear: recalcHcYear }),
                    });
                    if (res.ok) {
                      const d = await res.json();
                      setRecalcStatus(`✓ Recalculated — ${d.rowCount} rows updated.`);
                      fetchData();
                    } else {
                      const e = await res.json().catch(() => ({}));
                      setRecalcStatus(`Error: ${e.detail || res.status}`);
                    }
                  } catch (err) {
                    setRecalcStatus(`Error: ${err.message}`);
                  }
                  setRecalcing(false);
                }}
                disabled={recalcing}
                style={{
                  width: '100%', background: recalcing ? '#BFBFBF' : NAVY, color: 'white',
                  border: 'none', borderRadius: 6, padding: '12px', cursor: recalcing ? 'default' : 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                {recalcing ? 'Recalculating…' : '↻ Recalculate Allocations'}
              </button>
              {recalcStatus && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 5, fontSize: 13,
                  background: recalcStatus.startsWith('Error') ? '#FFF0F0' : '#F0FFF4',
                  color:      recalcStatus.startsWith('Error') ? '#C62828' : '#2E7D32',
                }}>{recalcStatus}</div>
              )}
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {[['users','Users'],['logs','Usage Logs'],['costmodel','Cost Model'],['headcount','Headcount'],['userlisting','User Listing']].map(([id, label]) => (
                <button key={id} onClick={() => setAdminTab(id)} style={{
                  padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: adminTab === id ? NAVY : 'white',
                  color:      adminTab === id ? 'white' : NAVY,
                  border:     `1px solid ${adminTab === id ? NAVY : '#D0D0D0'}`,
                }}>{label}</button>
              ))}
            </div>

            {/* ── Users sub-tab ─────────────────────────────────────────── */}
            {adminTab === 'users' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

                {/* User list */}
                <div style={card({ overflow: 'hidden' })}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', fontSize: 14, fontWeight: 700, color: NAVY }}>
                    Users ({adminUsers.length})
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {['Email', 'Name', 'Role', 'GL Codes', 'Branches', 'Status', ''].map((h, i) => (
                          <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminUsers.map((u, i) => (
                        <tr key={u.email} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>{u.email}</td>
                          <td style={{ padding: '8px 12px' }}>{u.display_name || '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              background: u.is_admin ? NAVY : '#E8F4F8', color: u.is_admin ? 'white' : NAVY,
                              borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                            }}>{u.is_admin ? 'Admin' : 'Viewer'}</span>
                            {u.can_edit_user_listing && !u.is_admin && (
                              <span style={{
                                background: '#E8F4E8', color: '#2E7D32',
                                borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, marginLeft: 4,
                              }}>UL Editor</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(u.allowed_gl_codes || []).join(', ')}>
                            {(u.allowed_gl_codes || []).length === 0 ? <span style={{ color: '#BBB' }}>All</span> : (u.allowed_gl_codes || []).join(', ')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(u.allowed_branches || []).join(', ')}>
                            {(u.allowed_branches || []).length === 0 ? <span style={{ color: '#BBB' }}>All</span> : (u.allowed_branches || []).join(', ')}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ color: u.is_active ? '#2E7D32' : '#C62828', fontWeight: 600, fontSize: 11 }}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                            <button onClick={() => populateEditForm(u)} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Edit</button>
                            {u.is_active && u.email !== user.email && (
                              <button onClick={() => deactivateUser(u.email)} style={{ background: 'none', border: '1px solid #FF9800', color: '#FF9800', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Deactivate</button>
                            )}
                            {u.email !== user.email && (
                              <button onClick={() => deleteUser(u.email)} style={{ background: 'none', border: '1px solid #E53935', color: '#E53935', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {adminUsers.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No users yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add / edit user form */}
                <div style={card({ padding: 24 })}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>
                    {editingUser ? `Edit: ${editingUser}` : 'Add User'}
                  </div>
                  {[
                    { label: 'Email *',        value: userFormEmail,  setter: setUserFormEmail,  placeholder: 'name@bci.ca',        disabled: !!editingUser },
                    { label: 'Display Name',   value: userFormName,   setter: setUserFormName,   placeholder: 'First Last' },
                    { label: 'GL Codes',       value: userFormGLs,    setter: setUserFormGLs,    placeholder: '71100, 72000 (comma-sep, blank = all)' },
                    { label: 'Branches',       value: userFormBranch, setter: setUserFormBranch, placeholder: 'TECH, FIN (comma-sep, blank = all)' },
                  ].map(f => (
                    <label key={f.label} style={{ display: 'block', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#515254', marginBottom: 4 }}>{f.label}</div>
                      <input
                        value={f.value}
                        onChange={e => f.setter(e.target.value)}
                        placeholder={f.placeholder}
                        disabled={f.disabled}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          border: '1px solid #D0D0D0', borderRadius: 4,
                          padding: '7px 10px', fontSize: 13,
                          background: f.disabled ? '#F5F5F5' : 'white',
                        }}
                      />
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" checked={userFormAdmin} onChange={e => setUserFormAdmin(e.target.checked)} />
                    <span style={{ fontSize: 13, color: '#515254' }}>Admin (can upload data &amp; manage users)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <input type="checkbox" checked={userFormCanEditUL} onChange={e => setUserFormCanEditUL(e.target.checked)} disabled={userFormAdmin} />
                    <span style={{ fontSize: 13, color: userFormAdmin ? '#BFBFBF' : '#515254' }}>
                      Can edit User Listing (for their branches)
                    </span>
                  </label>
                  {adminMsg && (
                    <div style={{
                      marginBottom: 12, padding: '8px 12px', borderRadius: 5, fontSize: 13,
                      background: adminMsg.startsWith('Error') ? '#FFF0F0' : '#F0FFF4',
                      color:      adminMsg.startsWith('Error') ? '#C62828' : '#2E7D32',
                    }}>{adminMsg}</div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={submitUserForm} style={{
                      flex: 1, background: NAVY, color: 'white', border: 'none',
                      borderRadius: 6, padding: '10px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>{editingUser ? 'Save Changes' : 'Add User'}</button>
                    {editingUser && (
                      <button onClick={resetUserForm} style={{
                        background: 'white', color: '#515254', border: '1px solid #D0D0D0',
                        borderRadius: 6, padding: '10px 14px', cursor: 'pointer', fontSize: 13,
                      }}>Cancel</button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Logs sub-tab ──────────────────────────────────────────── */}
            {adminTab === 'logs' && (
              <div style={card({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Usage Log (last 500)</span>
                  <button onClick={loadAdminLogs} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {['Time', 'User', 'Action', 'Resource', 'IP'].map((h, i) => (
                          <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminLogs.map((l, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F2F2F2' }}>
                          <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: '#515254' }}>{new Date(l.timestamp).toLocaleString('en-CA')}</td>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11 }}>{l.user_email}</td>
                          <td style={{ padding: '7px 12px' }}>
                            <span style={{
                              background: l.action.includes('upload') || l.action.includes('push') || l.action.includes('recalc') ? '#E8F4F8' : '#F5F5F5',
                              color: NAVY, borderRadius: 3, padding: '2px 6px', fontSize: 11,
                            }}>{l.action}</span>
                          </td>
                          <td style={{ padding: '7px 12px', color: '#515254', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.resource}>{l.resource}</td>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11, color: '#696F78' }}>{l.ip_address}</td>
                        </tr>
                      ))}
                      {adminLogs.length === 0 && (
                        <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No log entries yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Cost Model sub-tab ────────────────────────────────────── */}
            {adminTab === 'costmodel' && (
              <div style={card({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Cost Model ({adminCostModel.length} rows)</span>
                  <button onClick={loadAdminCostModel} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {[
                          'Branch Name', 'GL Code', 'Branch Code', 'PID',
                          'GL Expense Category', 'Cost Model Category', 'Description',
                          'Required or Requested', 'Current Cost Model', 'Allocation',
                          'Future Cost Model', 'Showback Type', 'User Listing', ''
                        ].map((h, i) => (
                          <th key={i} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const BASE_CM_OPTS = ['Direct Allocation to CEO','Direct Allocation to Legal','Direct Allocation to HR',
                          'Direct Allocation to Audit','Direct Allocation to CD&O','Direct Allocation to Corp Ops',
                          'Direct Allocation to Finance','Direct Allocation to Technology','Direct Allocation to IO',
                          'Direct Allocation to IRR','Direct Allocation to ISR','Direct Allocation to CM&CI',
                          'Direct Allocation to PE','Chargeback','Spread Allocation'];
                        const existingVals = adminCostModel.flatMap(r => [r.currentCostModel, r.futureCostModel]).filter(Boolean);
                        const CM_OPTS = [...new Set([...BASE_CM_OPTS, ...existingVals])].sort();
                        const CAT_OPTS = [...new Set(adminCostModel.map(r => r.costModelCategory).filter(Boolean))].sort();
                        const SB_OPTS  = [...new Set(adminCostModel.map(r => r.showbackType).filter(Boolean))].sort();
                        const ALLOC_OPTS = adminHeadcount.length > 0
                          ? ['All', ...adminHeadcount.map(r => r.shortCode).filter(Boolean).sort()]
                          : ['All','CEO','Legal','HR','Audit','CD&O','Corp Ops','Finance','Technology','IO','IRR','ISR','CM&CI','PE'];
                        return adminCostModel.slice(0, 200).map((r, i) => {
                        const isEditing = editingCmId === r.id;
                        const inp = (field, width) => (
                          <input
                            value={editingCmData[field] ?? r[field] ?? ''}
                            onChange={e => setEditingCmData(d => ({...d, [field]: e.target.value}))}
                            style={{ width: width || 120, border: '1px solid #D0D0D0', borderRadius: 3, padding: '3px 5px', fontSize: 11 }}
                          />
                        );
                        const sel = (field, options) => (
                          <select
                            value={editingCmData[field] ?? r[field] ?? ''}
                            onChange={e => setEditingCmData(d => ({...d, [field]: e.target.value}))}
                            style={{ border: '1px solid #D0D0D0', borderRadius: 3, padding: '3px 5px', fontSize: 11 }}
                          >
                            {options.map(v => <option key={v} value={v}>{v || '—'}</option>)}
                          </select>
                        );
                        const multiCombo = (field, opts, width) => {
                          const val = editingCmData[field] ?? r[field] ?? '';
                          const comboKey = `${r.id}-${field}`;
                          const isOpen = openCombo === comboKey;
                          const selected = new Set(
                            val.trim() === 'All' ? ['All']
                            : val.split(',').map(s => s.trim()).filter(Boolean)
                          );
                          const toggle = (opt) => {
                            let next;
                            if (opt === 'All') {
                              next = selected.has('All') ? '' : 'All';
                            } else {
                              const s = new Set(selected); s.delete('All');
                              s.has(opt) ? s.delete(opt) : s.add(opt);
                              next = [...s].join(', ');
                            }
                            setEditingCmData(d => ({...d, [field]: next}));
                          };
                          const filtered = comboQuery
                            ? opts.filter(o => o.toLowerCase().includes(comboQuery.toLowerCase()))
                            : opts;
                          return (
                            <div style={{ position: 'relative', display: 'inline-flex' }}>
                              <input
                                value={val}
                                onChange={e => { setEditingCmData(d => ({...d, [field]: e.target.value})); setComboQuery(e.target.value); setOpenCombo(comboKey); }}
                                onFocus={() => { setComboQuery(''); setOpenCombo(comboKey); }}
                                onBlur={() => setTimeout(() => setOpenCombo(c => c === comboKey ? null : c), 150)}
                                style={{ width: width || 140, border: '1px solid #D0D0D0', borderRadius: '3px 0 0 3px', borderRight: 'none', padding: '3px 5px', fontSize: 11 }}
                              />
                              <button type="button"
                                onMouseDown={e => { e.preventDefault(); if (!isOpen) setComboQuery(''); setOpenCombo(isOpen ? null : comboKey); }}
                                style={{ border: '1px solid #D0D0D0', borderRadius: '0 3px 3px 0', background: '#F5F5F5', padding: '0 6px', cursor: 'pointer', fontSize: 9, color: '#555' }}
                              >▼</button>
                              {isOpen && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'white',
                                  border: '1px solid #D0D0D0', borderRadius: 4, boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
                                  maxHeight: 240, overflowY: 'auto', minWidth: '100%', whiteSpace: 'nowrap' }}>
                                  {filtered.map(o => (
                                    <label key={o}
                                      onMouseDown={e => { e.preventDefault(); toggle(o); }}
                                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', cursor: 'pointer',
                                        fontSize: 11, background: selected.has(o) ? '#EBF4FF' : 'white' }}
                                      onMouseEnter={e => { if (!selected.has(o)) e.currentTarget.style.background = '#F5F5F5'; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = selected.has(o) ? '#EBF4FF' : 'white'; }}
                                    >
                                      <input type="checkbox" checked={selected.has(o)} onChange={() => {}} style={{ margin: 0 }} />
                                      {o}
                                    </label>
                                  ))}
                                  {filtered.length === 0 && <div style={{ padding: '6px 12px', color: '#999', fontSize: 11 }}>No matches</div>}
                                </div>
                              )}
                            </div>
                          );
                        };
                        const combo = (field, opts, width) => {
                          const val = editingCmData[field] ?? r[field] ?? '';
                          const comboKey = `${r.id}-${field}`;
                          const isOpen = openCombo === comboKey;
                          const filtered = (isOpen && comboQuery)
                            ? opts.filter(o => o.toLowerCase().includes(comboQuery.toLowerCase()))
                            : opts;
                          return (
                            <div style={{ position: 'relative', display: 'inline-flex' }}>
                              <input
                                value={val}
                                onChange={e => {
                                  setEditingCmData(d => ({...d, [field]: e.target.value}));
                                  setComboQuery(e.target.value);
                                  setOpenCombo(comboKey);
                                }}
                                onFocus={() => { setComboQuery(''); setOpenCombo(comboKey); }}
                                onBlur={() => setTimeout(() => setOpenCombo(c => c === comboKey ? null : c), 150)}
                                style={{ width: width || 150, border: '1px solid #D0D0D0', borderRadius: '3px 0 0 3px', borderRight: 'none', padding: '3px 5px', fontSize: 11 }}
                              />
                              <button
                                type="button"
                                onMouseDown={e => {
                                  e.preventDefault();
                                  if (!isOpen) { setComboQuery(''); }
                                  setOpenCombo(isOpen ? null : comboKey);
                                }}
                                style={{ border: '1px solid #D0D0D0', borderRadius: '0 3px 3px 0', background: '#F5F5F5', padding: '0 6px', cursor: 'pointer', fontSize: 9, color: '#555' }}
                              >▼</button>
                              {isOpen && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'white',
                                  border: '1px solid #D0D0D0', borderRadius: 4, boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
                                  maxHeight: 220, overflowY: 'auto', minWidth: '100%', whiteSpace: 'nowrap' }}>
                                  {filtered.map(o => (
                                    <div key={o}
                                      onMouseDown={() => { setEditingCmData(d => ({...d, [field]: o})); setComboQuery(''); setOpenCombo(null); }}
                                      style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 11 }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#EBF4FF'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                    >{o}</div>
                                  ))}
                                  {filtered.length === 0 && <div style={{ padding: '6px 12px', color: '#999', fontSize: 11 }}>No matches</div>}
                                </div>
                              )}
                            </div>
                          );
                        };
                        return (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{r.branchName}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.glCode}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.branchCode}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>{r.pid}</td>
                            <td style={{ padding: '6px 10px', color: '#515254', whiteSpace: 'nowrap' }}>{r.glCategory}</td>
                            <td style={{ padding: '6px 10px' }}>
                              {isEditing ? combo('costModelCategory', CAT_OPTS, 130) : r.costModelCategory}
                            </td>
                            <td style={{ padding: '6px 10px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>
                              {isEditing ? inp('description', 160) : r.description}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              {isEditing
                                ? sel('required', ['', 'Required', 'Requested'])
                                : r.required}
                            </td>
                            <td style={{ padding: '6px 10px', maxWidth: 240, overflow: 'visible' }}>
                              {isEditing ? combo('currentCostModel', CM_OPTS, 180) : <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.currentCostModel}>{r.currentCostModel}</span>}
                            </td>
                            <td style={{ padding: '6px 10px', overflow: 'visible' }}>
                              {isEditing ? multiCombo('allocation', ALLOC_OPTS, 140) : r.allocation}
                            </td>
                            <td style={{ padding: '6px 10px', maxWidth: 240, overflow: 'visible' }}>
                              {isEditing ? combo('futureCostModel', CM_OPTS, 180) : <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.futureCostModel}>{r.futureCostModel}</span>}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              {isEditing
                                ? combo('showbackType', SB_OPTS, 160)
                                : r.showbackType
                                  ? <span style={{ background: getShowbackColor(r.showbackType), color: 'white', borderRadius: 3, padding: '2px 7px', fontSize: 11 }}>{r.showbackType}</span>
                                  : null}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              {isEditing
                                ? sel('userListingFlag', ['', 'Cost allocated based on user listing'])
                                : r.userListingFlag}
                            </td>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <>
                                  <button onClick={async () => {
                                    await fetch(`${API_URL}/admin/cost-model/${r.id}`, {
                                      method: 'PUT', credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(editingCmData),
                                    });
                                    setEditingCmId(null); setEditingCmData({});
                                    loadAdminCostModel();
                                  }} style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Save</button>
                                  <button onClick={() => { setEditingCmId(null); setEditingCmData({}); }} style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                </>
                              ) : (
                                <button onClick={() => { setEditingCmId(r.id); setEditingCmData({}); }} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                              )}
                            </td>
                          </tr>
                        );
                      });
                      })()}
                      {adminCostModel.length === 0 && (
                        <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No data — upload a workbook first</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {adminCostModel.length > 200 && (
                  <div style={{ padding: '10px 20px', fontSize: 12, color: '#696F78', borderTop: '1px solid #EEE' }}>
                    Showing first 200 of {adminCostModel.length} rows.
                  </div>
                )}
              </div>
            )}

            {/* ── Headcount sub-tab ─────────────────────────────────────── */}
            {adminTab === 'headcount' && (
              <div style={card({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Headcount ({adminHeadcount.length} departments)</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setNewHcRow({ deptCode:'', shortCode:'', deptName:'', fy2026:0, fy2027:0, fy2028:0 }); setEditingHcId(null); }}
                      style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: 12 }}>+ Add Department</button>
                    <button onClick={loadAdminHeadcount} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Dept Code</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600 }}>Short Code</th>
                        <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600 }}>Department</th>
                        {['fy2026','fy2027','fy2028'].map((yr, idx) => {
                          const displayYear = baseYear + idx;
                          return (
                          <th key={yr} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, minWidth: 140 }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12 }}>FY</span>
                              {idx === 0 ? (
                                <input
                                  type="number"
                                  value={baseYear}
                                  onChange={e => {
                                    const y = parseInt(e.target.value);
                                    if (!isNaN(y) && y > 2000 && y < 2100) {
                                      setBaseYear(y);
                                      localStorage.setItem('hcBaseYear', y);
                                    }
                                  }}
                                  style={{ width: 56, background: 'transparent', color: 'white',
                                    border: '1px solid rgba(255,255,255,0.4)', borderRadius: 3,
                                    padding: '2px 4px', fontSize: 13, textAlign: 'center' }}
                                />
                              ) : (
                                <span style={{ fontSize: 13 }}>{displayYear}</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                              <select
                                value={hcYearTypes[yr] || 'Actual'}
                                onChange={e => {
                                  const next = {...hcYearTypes, [yr]: e.target.value};
                                  setHcYearTypes(next);
                                  localStorage.setItem('hcYearTypes', JSON.stringify(next));
                                }}
                                style={{ fontSize: 11, border: '1px solid rgba(255,255,255,0.35)',
                                  borderRadius: 3, background: 'rgba(255,255,255,0.15)', color: 'white',
                                  padding: '2px 4px', cursor: 'pointer' }}
                              >
                                {['Actual','Forecast','Budget'].map(t => (
                                  <option key={t} value={t} style={{ color: '#000', background: 'white' }}>{t}</option>
                                ))}
                              </select>
                            </div>
                          </th>
                          );
                        })}
                        <th style={{ padding: '9px 14px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminHeadcount.map((r, i) => {
                        const isEditing = editingHcId === r.id;
                        const isDeleting = deletingHcId === r.id;
                        const txtInp = (field, placeholder, w) => (
                          <input value={editingHcData[field] ?? ''}
                            onChange={e => setEditingHcData(d => ({...d, [field]: e.target.value}))}
                            placeholder={placeholder}
                            style={{ width: w, border: '1px solid #D0D0D0', borderRadius: 3, padding: '3px 6px', fontSize: 12 }} />
                        );
                        return (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                            <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                              {isEditing ? txtInp('deptCode', 'Code', 70) : r.deptCode}
                            </td>
                            <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                              {isEditing ? txtInp('shortCode', 'Short code', 90) : r.shortCode}
                            </td>
                            <td style={{ padding: '8px 14px' }}>
                              {isEditing ? txtInp('deptName', 'Department name', 170) : r.deptName}
                            </td>
                            {['fy2026','fy2027','fy2028'].map(yr => (
                              <td key={yr} style={{ padding: '8px 14px', textAlign: 'right' }}>
                                <input type="number" step="1" min="0"
                                  defaultValue={r[yr] ?? 0}
                                  key={`${r.id}-${yr}-${r[yr]}`}
                                  onBlur={async (e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val !== r[yr]) {
                                      await fetch(`${API_URL}/admin/headcount/${r.id}`, {
                                        method: 'PUT', credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ [yr]: val }),
                                      });
                                      loadAdminHeadcount();
                                    }
                                  }}
                                  style={{ width: 80, border: '1px solid #D0D0D0', borderRadius: 4, padding: '4px 8px', fontSize: 13, textAlign: 'right' }} />
                              </td>
                            ))}
                            <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <>
                                  <button onClick={async () => {
                                    await fetch(`${API_URL}/admin/headcount/${r.id}`, {
                                      method: 'PUT', credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(editingHcData),
                                    });
                                    setEditingHcId(null); setEditingHcData({});
                                    loadAdminHeadcount();
                                  }} style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Save</button>
                                  <button onClick={() => { setEditingHcId(null); setEditingHcData({}); }}
                                    style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                                </>
                              ) : isDeleting ? (
                                <>
                                  <span style={{ fontSize: 11, color: '#C62828', marginRight: 6 }}>Delete?</span>
                                  <button onClick={async () => {
                                    await fetch(`${API_URL}/admin/headcount/${r.id}`, { method: 'DELETE', credentials: 'include' });
                                    setDeletingHcId(null); loadAdminHeadcount();
                                  }} style={{ background: '#C62828', color: 'white', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Yes</button>
                                  <button onClick={() => setDeletingHcId(null)}
                                    style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>No</button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => { setEditingHcId(r.id); setDeletingHcId(null); setEditingHcData({ deptCode: r.deptCode, shortCode: r.shortCode, deptName: r.deptName }); }}
                                    style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Edit</button>
                                  <button onClick={() => { setDeletingHcId(r.id); setEditingHcId(null); }}
                                    style={{ background: 'none', border: '1px solid #C62828', color: '#C62828', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {newHcRow && (
                        <tr style={{ background: '#F0FFF4', borderBottom: '1px solid #C6F6D5' }}>
                          <td style={{ padding: '8px 14px' }}>
                            <input value={newHcRow.deptCode} onChange={e => setNewHcRow(r => ({...r, deptCode: e.target.value}))}
                              placeholder="Code" style={{ width: 70, border: '1px solid #68D391', borderRadius: 3, padding: '3px 6px', fontSize: 12 }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <input value={newHcRow.shortCode} onChange={e => setNewHcRow(r => ({...r, shortCode: e.target.value}))}
                              placeholder="Short code" style={{ width: 90, border: '1px solid #68D391', borderRadius: 3, padding: '3px 6px', fontSize: 12 }} />
                          </td>
                          <td style={{ padding: '8px 14px' }}>
                            <input value={newHcRow.deptName} onChange={e => setNewHcRow(r => ({...r, deptName: e.target.value}))}
                              placeholder="Department name" style={{ width: 170, border: '1px solid #68D391', borderRadius: 3, padding: '3px 6px', fontSize: 12 }} />
                          </td>
                          {['fy2026','fy2027','fy2028'].map(yr => (
                            <td key={yr} style={{ padding: '8px 14px', textAlign: 'right' }}>
                              <input type="number" step="1" min="0" value={newHcRow[yr] ?? 0}
                                onChange={e => setNewHcRow(r => ({...r, [yr]: parseFloat(e.target.value) || 0}))}
                                style={{ width: 80, border: '1px solid #68D391', borderRadius: 4, padding: '4px 8px', fontSize: 13, textAlign: 'right' }} />
                            </td>
                          ))}
                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                            <button onClick={async () => {
                              await fetch(`${API_URL}/admin/headcount`, {
                                method: 'POST', credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(newHcRow),
                              });
                              setNewHcRow(null); loadAdminHeadcount();
                            }} style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>Add</button>
                            <button onClick={() => setNewHcRow(null)}
                              style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}>Cancel</button>
                          </td>
                        </tr>
                      )}
                      {adminHeadcount.length === 0 && !newHcRow && (
                        <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No data — upload a workbook first</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── User Listing sub-tab ──────────────────────────────────── */}
            {adminTab === 'userlisting' && (
              <div style={card({ overflow: 'hidden' })}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>User Based Listing ({adminUserList.length} rows)</span>
                  <button onClick={loadAdminUserList} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {['Branch Name','Branch Code','PID','Description','CEO','Legal','Corp Ops','HR','Audit','CD&O','Finance','Tech','IO','IRR','PE','CM&CI','ISR',''].map((h, i) => (
                          <th key={i} style={{ padding: '8px 10px', textAlign: i >= 4 && i <= 16 ? 'right' : 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adminUserList.slice(0, 200).map((r, i) => {
                        const isEditing = editingUlId === r.id;
                        const ulFields = ['ceo','legal','corpOps','hr','audit','cdo','finance','technology','io','irr','pe','cmci','isr'];
                        return (
                          <tr key={r.id} style={{ background: i % 2 === 0 ? '#FAFAFA' : 'white', borderBottom: '1px solid #F0F0F0' }}>
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontSize: 11 }}>{r.branchName}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.branchCode}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 10 }}>{r.pid}</td>
                            <td style={{ padding: '6px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description}</td>
                            {ulFields.map(f => (
                              <td key={f} style={{ padding: '6px 10px', textAlign: 'right' }}>
                                {isEditing
                                  ? <input type="number" step="1" min="0"
                                      value={editingUlData[f] ?? r[f] ?? 0}
                                      onChange={e => setEditingUlData(d => ({...d, [f]: parseFloat(e.target.value) || 0}))}
                                      style={{ width: 50, border: '1px solid #D0D0D0', borderRadius: 3, padding: '2px 4px', fontSize: 10, textAlign: 'right' }} />
                                  : (r[f] || 0)}
                              </td>
                            ))}
                            <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                              {isEditing ? (
                                <>
                                  <button onClick={async () => {
                                    await fetch(`${API_URL}/admin/user-listing/${r.id}`, {
                                      method: 'PUT', credentials: 'include',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(editingUlData),
                                    });
                                    setEditingUlId(null); setEditingUlData({});
                                    loadAdminUserList();
                                  }} style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10, marginRight: 4 }}>Save</button>
                                  <button onClick={() => { setEditingUlId(null); setEditingUlData({}); }} style={{ background: 'none', border: '1px solid #D0D0D0', color: '#515254', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>✕</button>
                                </>
                              ) : (
                                <button onClick={() => { setEditingUlId(r.id); setEditingUlData({...r}); }} style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 10 }}>Edit</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {adminUserList.length === 0 && (
                        <tr><td colSpan={18} style={{ padding: 24, textAlign: 'center', color: '#BFBFBF', fontSize: 13 }}>No data — upload a workbook first</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {adminUserList.length > 200 && (
                  <div style={{ padding: '10px 20px', fontSize: 12, color: '#696F78', borderTop: '1px solid #EEE' }}>
                    Showing first 200 of {adminUserList.length} rows.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Reset confirmation modal ─────────────────────────────────────────── */}
      {resetModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'white', borderRadius: 10, padding: '32px 28px', width: 420,
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#C62828', marginBottom: 8 }}>
              Reset to Clean Slate
            </div>
            <div style={{ fontSize: 13, color: '#515254', lineHeight: 1.6, marginBottom: 20 }}>
              This will permanently delete:
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#515254' }}>
                <li>All OC Data rows</li>
                <li>Cost Model table</li>
                <li>Headcount table</li>
                <li>User Listing table</li>
                <li>Calculated allocation results</li>
              </ul>
            </div>
            <label style={{ display: 'block', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#515254', marginBottom: 6 }}>
                Type <span style={{ fontFamily: 'monospace', background: '#F5F5F5', padding: '1px 6px', borderRadius: 3 }}>RESET</span> to confirm
              </div>
              <input
                autoFocus
                value={resetTyped}
                onChange={e => setResetTyped(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && resetTyped === 'RESET') e.currentTarget.form?.querySelector('button[data-reset]')?.click();
                }}
                placeholder="RESET"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: `1px solid ${resetTyped === 'RESET' ? '#C62828' : '#D0D0D0'}`,
                  borderRadius: 5, padding: '8px 12px', fontSize: 14,
                  fontFamily: 'monospace', letterSpacing: 2,
                  outline: resetTyped === 'RESET' ? '2px solid rgba(198,40,40,0.2)' : 'none',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setResetModalOpen(false); setResetTyped(''); }}
                style={{
                  background: 'white', color: '#515254', border: '1px solid #D0D0D0',
                  borderRadius: 6, padding: '9px 20px', cursor: 'pointer', fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                data-reset
                disabled={resetTyped !== 'RESET'}
                onClick={async () => {
                  setResetModalOpen(false);
                  setResetTyped('');
                  const res = await fetch(`${API_URL}/api/reset`, {
                    method: 'POST', credentials: 'include',
                  });
                  if (res.ok) {
                    setRows([]);
                    setUpdatedAt(null);
                    setSheetName(null);
                    setAdminCostModel([]);
                    setAdminHeadcount([]);
                    setAdminUserList([]);
                    fetchData();
                    setAdminMsg('✓ All data cleared. Upload a new workbook to start fresh.');
                  } else {
                    const e = await res.json().catch(() => ({}));
                    setAdminMsg(`Reset failed: ${e.detail || res.status}`);
                  }
                }}
                style={{
                  background: resetTyped === 'RESET' ? '#C62828' : '#E0E0E0',
                  color: resetTyped === 'RESET' ? 'white' : '#BFBFBF',
                  border: 'none', borderRadius: 6, padding: '9px 20px',
                  cursor: resetTyped === 'RESET' ? 'pointer' : 'default',
                  fontSize: 13, fontWeight: 600,
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
