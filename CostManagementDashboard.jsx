// BCI Technology — Technology Showback Dashboard
// Reads from FastAPI backend (auto-refreshes every 30s).
// Finance updates data by running: python scripts/push_data.py "Cost Management.xlsm"
// SSO: users authenticate via Azure AD. Admin manages user access via the Admin tab.
//
// API URL config: set window.COST_API_URL before loading, or uses relative URLs (same origin).

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
  PieChart, Pie, Cell, Sector, ResponsiveContainer,
} from 'recharts';

// ─── Config ───────────────────────────────────────────────────────────────────
const API_URL = (typeof window !== 'undefined' && window.COST_API_URL)
  ? window.COST_API_URL
  : '';
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
  { key: 'cdo',        label: 'CD&O' },
  { key: 'corpOps',    label: 'Corp Ops' },
  { key: 'finance',    label: 'Finance' },
  { key: 'technology', label: 'Technology' },
  { key: 'io',         label: 'IO' },
  { key: 'irr',        label: 'IRR' },
  { key: 'isr',        label: 'ISR' },
  { key: 'cmci',       label: 'CM&CI' },
  { key: 'pe',         label: 'PE' },
];

const DEPT_LABEL_TO_KEY = {
  'ceo': 'ceo',
  'legal': 'legal',
  'hr': 'hr',
  'corporate risk and audit': 'audit', 'audit': 'audit',
  'corporate data & operations': 'cdo', "cd&o": 'cdo', 'cdo': 'cdo',
  'coo': 'corpOps', 'corp ops': 'corpOps', 'corporate operations': 'corpOps',
  'finance': 'finance',
  'technology': 'technology',
  'investment operations': 'io', 'io': 'io',
  'infrastructure & renewable resources': 'irr', 'irr': 'irr',
  'isr': 'isr',
  'capital markets & credit investments': 'cmci', 'cm&ci': 'cmci', 'cmci': 'cmci',
  'private equity': 'pe', 'pe': 'pe',
};

// BCI data-series palette — ordered sequence from the style guide
const DEPT_COLORS = [
  '#00365B', // 1  Midnight
  '#00ABBD', // 2  Ocean
  '#696F79', // 3  Gray
  '#457B96', // 4  Slate
  '#A6B38C', // 5  Khaki
  '#5B6ABF', // 6  Indigo (CD&O)
  '#4A317E', // 7  Purple (Corp Ops)
  '#FDB736', // 8  Yellow
  '#DC642B', // 9  Orange
  '#819F4D', // 10 Emerald
  '#57837B', // 11 Jade
  '#864C9E', // 12 Amethyst
  '#AE1E57', // 13 Garnet
];

const SHOWBACK_COLORS = {
  'None':        '#BFBFBF',
  'Headcount':   '#00365B',
  'Consumption': '#00ABBD',
  'Chargeback':  '#DC642B',
};
const getShowbackColor = (st) => {
  if (!st) return '#B0B8C4';
  const s = st.toLowerCase();
  if (s === 'technology own allocation') return '#457B96';
  if (s.includes('chargeback'))  return '#DC642B';
  if (s.includes('consumption')) return '#00ABBD';
  if (s.includes('headcount'))   return '#00365B';
  if (s.includes("technology's portion") || s.includes('direct allocation to technology')) return '#607D8B';
  if (s.startsWith('no showback')) return '#9E9E9E';
  return '#B0B8C4';
};

const PERIODS = [
  { key: 'actuals',   label: 'Actuals'    },
  { key: 'forecast1', label: 'Forecast 1' },
  { key: 'forecast2', label: 'Forecast 2' },
  { key: 'budget',    label: 'Budget'     },
];

const ALL_TABS = [
  { id: 'overview',        label: 'Overview'          },
  { id: 'costmanagement',  label: 'Cost Management',  techOnly: true },
  { id: 'showback',    label: 'By Showback Type'  },
  { id: 'quality',     label: 'Data Quality',     qualityOnly: true },
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

const exportToExcel = async (endpoint, filename) => {
  const res = await fetch(endpoint, { credentials: 'include' });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─── Tooltip / card styles ────────────────────────────────────────────────────
const TT   = { fontFamily: "'Open Sans', Calibri, sans-serif", fontSize: 12 };
const card = (extra = {}) => ({
  background: 'white', borderRadius: 8,
  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
  border: '1px solid rgba(0,0,0,0.06)',
  ...extra,
});

// ─── Table filter helpers ─────────────────────────────────────────────────────
const applyFilters = (rows, search, colFilters) => {
  let out = rows;
  const q = search.trim().toLowerCase();
  if (q) out = out.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)));
  Object.entries(colFilters).forEach(([k, v]) => { if (v) out = out.filter(r => String(r[k] ?? '') === v); });
  return out;
};
const colUniq = (rows, key) =>
  [...new Set(rows.map(r => String(r[key] ?? '')).filter(Boolean))].sort().slice(0, 80);

// ─── Component ────────────────────────────────────────────────────────────────
export default function TechnologyShowbackDashboard() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [user,         setUser]         = useState(null);
  const [authChecked,  setAuthChecked]  = useState(false);
  const [authError,    setAuthError]    = useState('');

  // ── Data ────────────────────────────────────────────────────────────────────
  const [rows,          setRows]          = useState([]);
  const [updatedAt,     setUpdatedAt]     = useState(null);
  const [sheetName,     setSheetName]     = useState(null);
  const [serverOk,      setServerOk]      = useState(true);
  const [deptTechCost,  setDeptTechCost]  = useState(null);

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [activeTab,       setActiveTab]       = useState('overview');
  const [period,          setPeriod]          = useState('actuals');
  const [filterShowback,  setFilterShowback]  = useState('All');
  const [filterCostModel, setFilterCostModel] = useState('All');
  const [filterDept,      setFilterDept]      = useState('All');
  const [hoveredSegment,  setHoveredSegment]  = useState(null);
  const [selectedDept,    setSelectedDept]    = useState(null);

  // ── Upload ──────────────────────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading,    setUploading]    = useState(false);

  // ── Admin ───────────────────────────────────────────────────────────────────
  const [adminUsers,      setAdminUsers]      = useState([]);
  const [adminLogs,       setAdminLogs]       = useState([]);
  const [adminCostModel,  setAdminCostModel]  = useState([]);
  const [adminHeadcount,  setAdminHeadcount]  = useState([]);
  const [coverageTarget,  setCoverageTarget]  = useState(null);
  const [coverageTargetInput, setCoverageTargetInput] = useState('');
  const [adminUserList,   setAdminUserList]   = useState([]);
  const [adminTab,        setAdminTab]        = useState('users');
  const [shareConfigs,    setShareConfigs]    = useState([]);
  const [shareStatus,     setShareStatus]     = useState({});  // id → 'sending'|'ok'|'err:msg'
  // Search + column filters for each table
  const [cmSearch,        setCmSearch]        = useState('');
  const [cmColFilter,     setCmColFilter]     = useState({});
  const [ulSearch,        setUlSearch]        = useState('');
  const [ulColFilter,     setUlColFilter]     = useState({});
  const [hcSearch,        setHcSearch]        = useState('');
  const [hcColFilter,     setHcColFilter]     = useState({});
  const [cmtSearch,       setCmtSearch]       = useState('');
  const [cmtColFilter,    setCmtColFilter]    = useState({});
  const [cmtPinnedCols,   setCmtPinnedCols]   = useState(new Set(['branch']));
  const [userFormEmail,   setUserFormEmail]   = useState('');
  const [userFormName,    setUserFormName]    = useState('');
  const [userFormAdmin,         setUserFormAdmin]         = useState(false);
  const [userFormCanEditUL,     setUserFormCanEditUL]     = useState(false);
  const [userFormCanViewQuality,setUserFormCanViewQuality]= useState(false);
  const [userFormGLs,        setUserFormGLs]        = useState([]);
  const [userFormBranch,     setUserFormBranch]     = useState([]);
  const [userFormDepts,      setUserFormDepts]      = useState([]);
  const [glDropOpen,         setGlDropOpen]         = useState(false);
  const [branchDropOpen,     setBranchDropOpen]     = useState(false);
  const [deptsDropOpen,      setDeptsDropOpen]      = useState(false);
  const [loggingOut,      setLoggingOut]      = useState(false);
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
  const [heroModal,       setHeroModal]       = useState(null);
  const [cmdExpandLabel,  setCmdExpandLabel]  = useState(null);
  const [sbHoverCat,      setSbHoverCat]      = useState(null);
  const [recalcBaseYear,  setRecalcBaseYear]  = useState(() => parseInt(localStorage.getItem('hcBaseYear')) || 2026);
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

  // ── Fetch dept tech cost (BCI landscape) ────────────────────────────────────
  const fetchDeptTechCost = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/dept-tech-cost`, { credentials: 'include' });
      if (res.ok) setDeptTechCost(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchDeptTechCost();
  }, [user, fetchDeptTechCost]);

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
        fetchDeptTechCost();
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
  const handleLogout = () => {
    setLoggingOut(true);
    window.location.href = `${API_URL}/auth/logout?next=${encodeURIComponent(window.location.origin)}`;
  };

  // ── Settings ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    fetch(`${API_URL}/admin/settings`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.coverage_target) {
          const v = parseFloat(data.coverage_target);
          if (!isNaN(v)) { setCoverageTarget(v); setCoverageTargetInput(String(v)); }
        }
      })
      .catch(() => {});
  }, [user]);

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

  const loadShareConfigs = useCallback(async () => {
    const res = await fetch(`${API_URL}/admin/share`, { credentials: 'include' });
    if (res.ok) setShareConfigs(await res.json());
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
    if (adminTab === 'share') loadShareConfigs();
  }, [user, activeTab, adminTab, loadAdminCostModel, loadAdminHeadcount, loadAdminUserList]);

  useEffect(() => {
    if (activeTab === 'userlisting' && user?.can_edit_user_listing && !user?.is_admin) {
      loadAdminUserList();
    }
  }, [user, activeTab, loadAdminUserList]);

  const resetUserForm = () => {
    setUserFormEmail(''); setUserFormName(''); setUserFormAdmin(false);
    setUserFormCanEditUL(false);
    setUserFormCanViewQuality(false);
    setUserFormGLs([]); setUserFormBranch([]); setUserFormDepts([]);
    setGlDropOpen(false); setBranchDropOpen(false); setDeptsDropOpen(false);
    setEditingUser(null); setAdminMsg('');
  };

  const populateEditForm = (u) => {
    setUserFormEmail(u.email);
    setUserFormName(u.display_name || '');
    setUserFormAdmin(u.is_admin);
    setUserFormCanEditUL(u.can_edit_user_listing || false);
    setUserFormCanViewQuality(u.can_view_quality || false);
    setUserFormGLs(u.allowed_gl_codes || []);
    setUserFormBranch(u.allowed_branches || []);
    setUserFormDepts(u.allowed_departments || []);
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
      can_view_quality:       userFormCanViewQuality,
      allowed_gl_codes:       userFormGLs,
      allowed_branches:       userFormBranch,
      allowed_departments:    userFormDepts,
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
  const filteredRaw = rows.filter(r => {
    if (filterShowback !== 'All' && (r.showbackType || 'None') !== filterShowback) return false;
    if (filterCostModel !== 'All' && r.currentCostModel !== filterCostModel) return false;
    if (filterDept !== 'All' && !r[filterDept]) return false;
    return true;
  });
  // When a non-actuals period is selected, use the pre-computed per-period dept columns
  // stored by the backend (e.g. ceo_budget, ceo_forecast1, ceo_forecast2).
  const filtered = period === 'actuals' ? filteredRaw : filteredRaw.map(r => {
    const mapped = { ...r };
    DEPTS.forEach(d => { mapped[d.key] = r[`${d.key}_${period}`] ?? 0; });
    return mapped;
  });

  // ── Derived data ────────────────────────────────────────────────────────────
  const totalPeriod  = filtered.reduce((s, r) => s + (r[period] || 0), 0);
  const totalActuals = filtered.reduce((s, r) => s + r.actuals, 0);
  const totalBudget  = filtered.reduce((s, r) => s + r.budget, 0);
  const _isTechPortion = r => (r.showbackType || '').toLowerCase().includes("technology's portion");
  const _isDCB = r => { const st = (r.showbackType||'').toLowerCase(); const cm = (r.currentCostModel||'').toLowerCase(); return st !== 'no showback' && (st === 'chargeback' || (cm.includes('chargeback') && !st.includes('consumption') && !st.includes('headcount'))) && DEPTS.some(d => (r[d.key]||0) !== 0); };
  const techActuals  = filteredRaw
    .filter(r => _isTechPortion(r) && !_isDCB(r))
    .reduce((s, r) => s + (r[period] || 0), 0);
  const flaggedCount = filtered.filter(r => r.comments).length;

  const _deptRestrictedKeys = (user?.allowed_departments?.length && !user.allowed_departments.includes('Technology'))
    ? DEPTS.filter(d => user.allowed_departments.includes(d.label))
    : null;
  const _rowValue = r => _deptRestrictedKeys
    ? _deptRestrictedKeys.reduce((s, d) => s + (r[d.key] || 0), 0)
    : (r[period] || 0);
  const showbackPieData = Object.entries(
    filtered.reduce((acc, r) => {
      let st = r.showbackType || 'None';
      const stl = st.toLowerCase();
      const cm  = (r.currentCostModel || '').toLowerCase();
      if (_deptRestrictedKeys) {
        if (stl.startsWith('no showback')) return acc;
        if (cm.includes('chargeback') && !stl.startsWith('no showback')) st = 'Direct Chargeback';
      }
      // Recategorize Technology's Portion rows that are Direct Chargeback
      if (_isTechPortion(r) && _isDCB(r)) st = 'Direct Chargeback';
      // Exclude showback rows with no dept allocation yet (pending User Listing)
      if (stl.startsWith('showback') && DEPTS.every(d => (r[d.key] || 0) === 0)) return acc;
      // For admin/Technology users split Technology's own allocation into its own slice
      if (stl.startsWith('showback') && !_deptRestrictedKeys) {
        const techAmt  = r.technology || 0;
        const otherAmt = (_deptRestrictedKeys || DEPTS).filter(d => d.key !== 'technology')
          .reduce((s, d) => s + (r[d.key] || 0), 0);
        if (techAmt !== 0) {
          if (!acc['Technology Own Allocation']) acc['Technology Own Allocation'] = { value: 0, rows: [] };
          acc['Technology Own Allocation'].value += techAmt;
          acc['Technology Own Allocation'].rows.push(r);
        }
        if (otherAmt !== 0) {
          if (!acc[st]) acc[st] = { value: 0, rows: [] };
          acc[st].value += otherAmt;
          if (!acc[st].rows.includes(r)) acc[st].rows.push(r);
        }
        return acc;
      }
      if (!acc[st]) acc[st] = { value: 0, rows: [] };
      acc[st].value += _rowValue(r);
      acc[st].rows.push(r);
      return acc;
    }, {})
  ).map(([name, { value, rows }]) => ({ name, value, rows }))
   .sort((a, b) => {
     const order = [
       n => n.toLowerCase().includes('headcount'),
       n => n.toLowerCase().includes('consumption') && !n.toLowerCase().includes('chargeback'),
       n => n.toLowerCase().includes('consumption') && n.toLowerCase().includes('chargeback'),
       n => n === 'Technology Own Allocation',
       n => n.toLowerCase() === 'no showback',
       n => n.toLowerCase().includes("technology's portion"),
       n => n === 'Direct Chargeback',
       n => n.toLowerCase() === 'none',
     ];
     const ai = order.findIndex(p => p(a.name)); const bi = order.findIndex(p => p(b.name));
     return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
   });

  const _isApproachRow = r => {
    const st = (r.showbackType || '').toLowerCase();
    const cm = (r.currentCostModel || '').toLowerCase();
    return st.includes('headcount') || st.includes('consumption') ||
           st === 'chargeback' || (cm.includes('chargeback') && !st.includes('consumption') && !st.includes('headcount'));
  };
  const _isDirectCB = r => {
    const st = (r.showbackType || '').toLowerCase();
    const cm = (r.currentCostModel || '').toLowerCase();
    return !st.includes('headcount') && !st.includes('consumption') &&
           (st === 'chargeback' || (cm.includes('chargeback') && !st.includes('consumption') && !st.includes('headcount')));
  };
  const deptTotals = DEPTS.map((d, i) => ({
    name:   d.label,
    key:    d.key,
    value:  filtered
      .filter(r => _isApproachRow(r)
        && (_deptRestrictedKeys ? !_isDirectCB(r) : true)
        && DEPTS.some(dk => (r[dk.key] || 0) !== 0))
      .reduce((s, r) => s + Math.max(r[d.key] || 0, 0), 0),
    color:  DEPT_COLORS[i],
    isTech: d.key === 'technology',
  })).sort((a, b) => b.value - a.value);

  const _ocField = { actuals: 'actuals', budget: 'budget', forecast1: 'forecast1', forecast2: 'forecast2' }[period] || 'actuals';
  const deptOcBudgetMap = (() => {
    if (!deptTechCost?.loaded) return {};
    const m = {};
    (deptTechCost.departments || []).forEach(row => {
      const key = DEPT_LABEL_TO_KEY[(row.dept_label || '').toLowerCase()];
      if (key) m[key] = row[_ocField] || 0;
    });
    return m;
  })();
  const fullCostRows = (() => {
    if (!deptTechCost?.loaded) return [];
    const mapped = DEPTS
      .filter(d => d.key !== 'technology')
      .map(d => ({ ...d, ocBudget: deptOcBudgetMap[d.key] || 0, showbackAlloc: filtered.filter(r => (r.showbackType || '').toLowerCase().startsWith('showback')).reduce((s, r) => s + (r[d.key] || 0), 0) }))
      .map(d => ({ ...d, total: d.ocBudget + d.showbackAlloc }))
      .filter(d => d.ocBudget > 0 || d.showbackAlloc > 0);
    // Include dept_tech_cost rows that have no matching DEPTS key (e.g. Strategic Projects)
    const unmapped = (deptTechCost.departments || [])
      .filter(r => !DEPT_LABEL_TO_KEY[(r.dept_label || '').toLowerCase()] && (r[_ocField] || 0) > 0)
      .map(r => ({ key: r.dept_label, label: r.dept_label, ocBudget: r[_ocField] || 0, showbackAlloc: 0, total: r[_ocField] || 0 }));
    return [...mapped, ...unmapped].sort((a, b) => b.total - a.total);
  })();

  const showbackTypes   = [...new Set(rows.map(r => r.showbackType || 'None'))];
  const uniqueShowbacks = [...new Set(rows.map(r => r.showbackType || 'None'))];

  // ── Command strip (overview only) ───────────────────────────────────────────
  // Coverage = (Showback Headcount + Showback Consumption types that were successfully
  // allocated) / total actuals FY2026.
  // "startsWith showback" catches all three types; excludes "No showback*" and "None".
  // Bracket = subset stuck specifically because User Based Listing data is missing.
  const cmdCoverageBase    = totalPeriod;
  const _isShowbackRow     = r => (r.showbackType || '').toLowerCase().startsWith('showback');
  // For dept-restricted users sum only their dept columns; Technology/All users sum all depts.
  const _coverageDepts     = _deptRestrictedKeys || DEPTS;
  const cmdShownBack       = filtered
    .filter(r => _isShowbackRow(r) && _coverageDepts.some(d => (r[d.key] || 0) !== 0))
    .reduce((s, r) => s + _coverageDepts.reduce((ds, d) => ds + (r[d.key] || 0), 0), 0);
  const cmdPendingUserList = filteredRaw
    .filter(r => _isShowbackRow(r) && DEPTS.every(d => (r[d.key] || 0) === 0))
    .reduce((s, r) => s + (r[period] || 0), 0);
  // Technology's own allocation from the showback programme — excluded from Total Showback
  // and moved into the Technology tile (it's already in Technology's budget, not a real transfer out)
  const _nonTechDepts        = _coverageDepts.filter(d => d.key !== 'technology');
  const cmdTechOwnShowback   = filtered
    .filter(r => _isShowbackRow(r))
    .reduce((s, r) => s + (r.technology || 0), 0);
  const cmdShownBackExclTech = cmdShownBack - cmdTechOwnShowback;

  const cmdNotShownBack = filtered
    .filter(r => { const st = (r.showbackType || '').toLowerCase().trim(); return st === '' || st === 'none' || st.startsWith('no showback'); })
    .reduce((s, r) => s + _rowValue(r), 0);
  const cmdCoveragePct         = cmdCoverageBase > 0 ? Math.min(cmdShownBack         / cmdCoverageBase * 100, 100) : 0;
  const cmdCoveragePctExclTech = cmdCoverageBase > 0 ? Math.min(cmdShownBackExclTech / cmdCoverageBase * 100, 100) : 0;
  // Showback breakdown by method (for Total Showback tile)
  const _sbAmt = (pred) => filtered
    .filter(r => _isShowbackRow(r) && pred(r) && _coverageDepts.some(d => (r[d.key]||0) !== 0))
    .reduce((s, r) => s + _coverageDepts.reduce((ds, d) => ds + (r[d.key]||0), 0), 0);
  const cmdShowbackHC    = _sbAmt(r => (r.showbackType||'').toLowerCase().includes('headcount'));
  const cmdShowbackCon   = _sbAmt(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && !st.includes('chargeback'); });
  const cmdShowbackConCB = _sbAmt(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && st.includes('chargeback'); });
  // Exclude-Technology variants: denominate by cmdShownBackExclTech so pcts add to 100%
  const _sbAmtExclTech    = (pred) => filtered
    .filter(r => _isShowbackRow(r) && pred(r) && _nonTechDepts.some(d => (r[d.key]||0) !== 0))
    .reduce((s, r) => s + _nonTechDepts.reduce((ds, d) => ds + (r[d.key]||0), 0), 0);
  const cmdShowbackHCxt    = _sbAmtExclTech(r => (r.showbackType||'').toLowerCase().includes('headcount'));
  const cmdShowbackConxt   = _sbAmtExclTech(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && !st.includes('chargeback'); });
  const cmdShowbackConCBxt = _sbAmtExclTech(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && st.includes('chargeback'); });
  const cmdVariance            = totalBudget - totalPeriod;
  const showNotShownBackPanel  = !(user?.allowed_departments?.length) || user.allowed_departments.includes('Technology');
  const cmdTotalFlags     = rows.filter(r => r.comments).length;
  const cmdReadinessPct   = rows.length > 0 ? ((rows.length - cmdTotalFlags) / rows.length * 100) : 0;
  // Not-shown-back breakdown — four distinct categories
  const cmdNoShowback     = filteredRaw
    .filter(r => (r.showbackType || '').toLowerCase() === 'no showback')
    .reduce((s, r) => s + (r[period] || 0), 0);
  const cmdNoShowbackTech = filteredRaw
    .filter(r => _isTechPortion(r) && !_isDCB(r))
    .reduce((s, r) => s + (r[period] || 0), 0);
  const cmdNotConfigured  = filteredRaw
    .filter(r => { const st = (r.showbackType || '').toLowerCase().trim(); return st === '' || st === 'none'; })
    .reduce((s, r) => s + (r[period] || 0), 0);
  const cmdDirectCB       = filteredRaw
    .filter(r => _isDCB(r))
    .reduce((s, r) => s + (r[period] || 0), 0);

  const dynamicPeriods = [
    { key: 'actuals',   label: `FY${baseYear} (Actual)`   },
    { key: 'budget',    label: `FY${baseYear} (Budget)`   },
    { key: 'forecast1', label: `FY${baseYear + 1} (Forecast)` },
    { key: 'forecast2', label: `FY${baseYear + 2} (Forecast)` },
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

  const flaggedRows       = rows.filter(r => r.comments);
  const availableGLs      = [...new Set(rows.map(r => r.glCode).filter(Boolean))].sort();
  const availableBranches = [...new Set(rows.map(r => r.branchCode).filter(Boolean))].sort();
  const TABS = ALL_TABS.filter(t => {
    if (t.adminOnly)   return user?.is_admin;
    if (t.canEditUL)   return user?.can_edit_user_listing && !user?.is_admin;
    if (t.qualityOnly) return user?.is_admin || user?.can_view_quality;
    if (t.techOnly)    return !_deptRestrictedKeys;
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

          {window.location.hostname === 'localhost' && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #EEE' }}>
              <div style={{ fontSize: 11, color: '#BBB', marginBottom: 8, textAlign: 'center' }}>
                Local dev — no Azure AD needed
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={`${API_URL}/auth/dev-login?email=testadmin@bci.ca&next=${encodeURIComponent(window.location.origin)}`} style={{
                  flex: 1, textAlign: 'center', padding: '9px',
                  border: '1px dashed #CCC', borderRadius: 6, color: '#515254',
                  textDecoration: 'none', fontSize: 12,
                }}>Dev Admin</a>
                <a href={`${API_URL}/auth/dev-login?email=testviewer@bci.ca&next=${encodeURIComponent(window.location.origin)}`} style={{
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
      <div style={{ background: '#002847', color: 'white', padding: '16px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 0.3 }}>
              Technology Showback Dashboard
            </div>
            {user?.is_admin && <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>
              {sheetName
                ? `${sheetName} · Updated ${new Date(updatedAt).toLocaleString('en-CA')}`
                : 'No data loaded — upload a file or run the Finance script'}
            </div>}
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
            <form method="POST" action={`${API_URL}/auth/logout?next=${encodeURIComponent(window.location.origin)}`} style={{ display: 'inline' }}>
              <button type="submit" style={{
                background: 'rgba(255,255,255,0.12)', color: 'white',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
              }}>Sign out</button>
            </form>
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

      {/* ── BCI Technology Cost Landscape ─────────────────────────────────────── */}
      {activeTab === 'overview' && rows.length > 0 && showNotShownBackPanel && deptTechCost?.loaded && (() => {
        const bciTotal    = deptTechCost.total.actuals;
        const bciTotalBgt = deptTechCost.total.budget;
        const techActuals = deptTechCost.technology.actuals;
        const techBudget  = deptTechCost.technology.budget;
        const exclActuals = bciTotal - techActuals;
        const exclBudget  = bciTotalBgt - techBudget;
        const tile = (extra = {}) => ({
          padding: '14px 28px', borderRight: '1px solid rgba(255,255,255,.08)', ...extra,
        });
        const varPill = (budget, actual) => (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(105,240,174,.15)', color: '#69F0AE' }}>
            ▼ {cadShort(budget - actual)} under budget
          </span>
        );
        const allocationBar = (share, total) => (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.5)' }}>Budget Allocation</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>
                {(share / total * 100).toFixed(1)}%{' '}
                <span style={{ fontWeight: 400, color: 'rgba(255,255,255,.5)', fontSize: 10 }}>of {cadShort(total)} BCI budget</span>
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,.12)', borderRadius: 2 }}>
              <div style={{ height: '100%', background: 'rgba(255,255,255,.6)', borderRadius: 2, width: `${Math.min(share / total * 100, 100)}%` }} />
            </div>
          </div>
        );
        return (
          <div style={{ background: '#002847', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div style={tile()}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)', marginBottom: 6 }}>Total BCI Technology Cost · FY{baseYear} Actual</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: '-1px', lineHeight: 1, marginBottom: 5 }}>{cadShort(bciTotal)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {varPill(bciTotalBgt, bciTotal)}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>vs {cadShort(bciTotalBgt)} budget</span>
              </div>
            </div>
            <div style={tile()}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)', marginBottom: 6 }}>Excl. Technology Department</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#69F0AE', letterSpacing: '-1px', lineHeight: 1, marginBottom: 5 }}>{cadShort(exclActuals)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {varPill(exclBudget, exclActuals)}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>vs {cadShort(exclBudget)} budget</span>
              </div>
              {allocationBar(exclBudget, bciTotalBgt)}
            </div>
            <div style={tile({ borderRight: 'none' })}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)', marginBottom: 6 }}>Technology Department · Central Budget</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'white', letterSpacing: '-1px', lineHeight: 1, marginBottom: 5 }}>{cadShort(techActuals)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {varPill(techBudget, techActuals)}
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>vs {cadShort(techBudget)} budget</span>
              </div>
              {allocationBar(techBudget, bciTotalBgt)}
            </div>
          </div>
        );
      })()}

      {/* ── Technology Breakdown separator ─────────────────────────────────────── */}
      {activeTab === 'overview' && rows.length > 0 && showNotShownBackPanel && deptTechCost?.loaded && (
        <div style={{ background: 'linear-gradient(to bottom, #002847, #004C8C)', padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.35)' }} />
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,.7)' }}>Technology Breakdown</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.35)' }} />
        </div>
      )}

      {/* ── Command strip (Overview only) ────────────────────────────────────── */}
      {activeTab === 'overview' && rows.length > 0 && showNotShownBackPanel && (() => {
        const cmdTechNotShownBack = cmdNoShowbackTech + cmdNoShowback + cmdNotConfigured + cmdDirectCB + cmdTechOwnShowback;
        const tiles = [
          {
            label:     'Total Spend · ' + periodLabel,
            value:     cadShort(totalPeriod),
            valueColor: 'white',
            pill:      period === 'actuals' ? `▼ ${cadShort(cmdVariance)} under budget` : null,
            pillColor: cmdVariance >= 0 ? '#69F0AE' : '#EF9A9A',
            pillBg:    cmdVariance >= 0 ? 'rgba(105,240,174,.15)' : 'rgba(239,154,154,.15)',
            sub:       period === 'actuals' ? `vs ${cadShort(totalBudget)} budget` : null,
          },
          {
            label:      `Total Showback ${cadShort(cmdShownBackExclTech)} · Breakdown`,
            pendingAmt: cmdPendingUserList,
            pendingRows: filtered.filter(r => _isShowbackRow(r) && DEPTS.every(d => (r[d.key]||0) === 0)),
            breakdown: [
              { label: 'Headcount',   amount: cmdShowbackHCxt,    color: '#69F0AE',               pct: cmdShownBackExclTech > 0 ? cmdShowbackHCxt    / cmdShownBackExclTech * 100 : 0, section: 'Shown Back', expandByDept: true, rows: filtered.filter(r => _isShowbackRow(r) && (r.showbackType||'').toLowerCase().includes('headcount') && _nonTechDepts.some(d=>(r[d.key]||0)!==0)) },
              { label: 'Consumption', amount: cmdShowbackConxt,   color: 'rgba(255,255,255,.85)', pct: cmdShownBackExclTech > 0 ? cmdShowbackConxt   / cmdShownBackExclTech * 100 : 0, section: 'Shown Back', expandByDept: true, rows: filtered.filter(r => { const st=(r.showbackType||'').toLowerCase(); return _isShowbackRow(r) && st.includes('consumption') && !st.includes('chargeback') && _nonTechDepts.some(d=>(r[d.key]||0)!==0); }) },
              { label: 'Con → CB',    amount: cmdShowbackConCBxt, color: 'rgba(255,255,255,.85)', pct: cmdShownBackExclTech > 0 ? cmdShowbackConCBxt / cmdShownBackExclTech * 100 : 0, section: 'Shown Back', expandByDept: true, rows: filtered.filter(r => { const st=(r.showbackType||'').toLowerCase(); return _isShowbackRow(r) && st.includes('consumption') && st.includes('chargeback') && _nonTechDepts.some(d=>(r[d.key]||0)!==0); }) },
            ],
          },
          {
            label:    `Technology ${cadShort(cmdTechNotShownBack)} · Breakdown · No Showback`,
            breakdown: [
              { label: 'Tech Absorbed',     amount: cmdNoShowbackTech,   color: 'rgba(255,255,255,.85)', pct: totalPeriod > 0 ? cmdNoShowbackTech   / totalPeriod * 100 : 0, section: 'Not Shown Back', rows: filtered.filter(r => _isTechPortion(r) && !_isDCB(r)) },
              { label: 'Tech Owned',        amount: cmdNoShowback,       color: 'rgba(255,255,255,.85)', pct: totalPeriod > 0 ? cmdNoShowback       / totalPeriod * 100 : 0, section: 'Not Shown Back', rows: filtered.filter(r => (r.showbackType||'').toLowerCase() === 'no showback') },
              { label: 'Own Alloc',         amount: cmdTechOwnShowback,  color: 'rgba(255,255,255,.85)', pct: totalPeriod > 0 ? cmdTechOwnShowback  / totalPeriod * 100 : 0, section: 'Not Shown Back', expandByMethod: true, rows: filtered.filter(r => _isShowbackRow(r) && (r.technology || 0) !== 0) },
              { label: 'Direct Chargeback', amount: cmdDirectCB,         color: 'rgba(255,255,255,.85)', pct: totalPeriod > 0 ? cmdDirectCB         / totalPeriod * 100 : 0, section: 'Not Shown Back', rows: filtered.filter(r => _isDCB(r)) },
              { label: 'Not Configured',    amount: cmdNotConfigured,    color: '#FFD54F',               pct: totalPeriod > 0 ? cmdNotConfigured    / totalPeriod * 100 : 0, section: 'Not Shown Back', rows: filtered.filter(r => !(r.showbackType||'').trim()) },
            ],
          },
        ];
        const expandItem = cmdExpandLabel ? tiles.flatMap(t => t.breakdown || []).find(b => b.label === cmdExpandLabel) : null;
        const expandDepts = (expandItem && !expandItem.expandByMethod) ? DEPTS
          .filter(d => d.key !== 'technology')
          .map(d => ({
            ...d,
            amount: expandItem.rows.reduce((s, r) => s + (r[d.key] || 0), 0),
            deptRows: expandItem.rows.filter(r => (r[d.key] || 0) !== 0),
          })).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount) : [];
        const expandMax = expandDepts[0]?.amount || 1;
        const expandMethods = (expandItem?.expandByMethod) ? [
          { label: 'Headcount',   rows: expandItem.rows.filter(r => (r.showbackType||'').toLowerCase().includes('headcount')) },
          { label: 'Consumption', rows: expandItem.rows.filter(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && !st.includes('chargeback'); }) },
          { label: 'Con → CB',    rows: expandItem.rows.filter(r => { const st=(r.showbackType||'').toLowerCase(); return st.includes('consumption') && st.includes('chargeback'); }) },
        ].map(m => ({ ...m, amount: m.rows.reduce((s, r) => s + (r.technology || 0), 0) }))
         .filter(m => m.amount > 0)
         .sort((a, b) => b.amount - a.amount) : [];
        const expandMethodMax = expandMethods[0]?.amount || 1;
        return (
          <>
          <div style={{ background: '#004C8C', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: cmdExpandLabel ? 'none' : '1px solid rgba(255,255,255,.08)' }}>
            {tiles.map((c, i) => (
              <div key={i} style={{ padding: '14px 28px', borderRight: i < tiles.length - 1 ? '1px solid rgba(255,255,255,.25)' : 'none' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.75)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.label}
                  {c.pendingAmt > 0 && (
                    <span
                      onClick={() => setHeroModal({ section: 'Showback Coverage', title: 'Pending User Listing', note: 'Pending data', rows: c.pendingRows, total: c.pendingAmt })}
                      style={{ fontSize: 10, fontWeight: 600, color: '#FFD54F', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2, textTransform: 'none', letterSpacing: 0 }}
                    >· excl. {cadShort(c.pendingAmt)} pending</span>
                  )}
                </div>
                {c.breakdown ? (
                  <div style={{ display: 'flex', gap: 0 }}>
                    {c.breakdown.map((row, j) => (
                      <div key={j} style={{
                        flex: 1,
                        paddingRight: j < c.breakdown.length - 1 ? 12 : 0,
                        paddingLeft:  j > 0 ? 12 : 0,
                        borderRight:  j < c.breakdown.length - 1 ? '1px solid rgba(255,255,255,.07)' : 'none',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.6)', marginBottom: 3, whiteSpace: 'nowrap' }}>{row.label}</div>
                        <div
                          onClick={() => (row.expandByDept || row.expandByMethod)
                            ? setCmdExpandLabel(cmdExpandLabel === row.label ? null : row.label)
                            : setHeroModal({ section: row.section, title: row.label, note: `${row.pct.toFixed(1)}%`, rows: row.rows, total: row.amount })
                          }
                          style={{ fontSize: 17, fontWeight: 700, color: cmdExpandLabel === row.label ? '#00ABBD' : row.color, letterSpacing: '-0.5px', lineHeight: 1, marginBottom: 4, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                        >{cadShort(row.amount)}</div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: row.color === '#69F0AE' ? 'rgba(105,240,174,.15)' : 'rgba(255,255,255,.1)', color: row.color, display: 'inline-block', whiteSpace: 'nowrap' }}>
                          {row.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 28, fontWeight: 700, color: c.valueColor, letterSpacing: '-1px', lineHeight: 1, marginBottom: 5 }}>{c.value}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {c.pill != null && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: c.pillBg, color: c.pillColor }}>{c.pill}</span>}
                      {c.sub  != null && <span style={{ fontSize: 11, color: 'rgba(255,255,255,.65)' }}>{c.sub}</span>}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {expandItem && (
            <div style={{ background: '#004C8C', borderTop: '1px solid rgba(255,255,255,.2)', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '12px 28px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)', marginBottom: 10 }}>
                {cmdExpandLabel} — {expandItem.expandByMethod ? 'By Method' : 'By Department'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {expandItem.expandByMethod
                  ? expandMethods.map(m => (
                      <div key={m.label} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 6, padding: '10px 14px', minWidth: 110, flex: '0 0 auto' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.55)', marginBottom: 4, whiteSpace: 'nowrap' }}>{m.label}</div>
                        <div
                          onClick={() => setHeroModal({ section: 'Own Alloc', title: m.label, note: `${pct(m.amount, expandItem.amount)}`, rows: m.rows, total: m.amount, rowAmt: r => r.technology || 0 })}
                          style={{ fontSize: 16, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3, marginBottom: 6 }}
                        >{cadShort(m.amount)}</div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2, marginBottom: 4 }}>
                          <div style={{ height: '100%', borderRadius: 2, background: '#00ABBD', width: `${m.amount / expandMethodMax * 100}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.55)' }}>{pct(m.amount, expandItem.amount)}</div>
                      </div>
                    ))
                  : expandDepts.map(d => (
                      <div key={d.key} style={{ background: 'rgba(255,255,255,.08)', borderRadius: 6, padding: '10px 14px', minWidth: 110, flex: '0 0 auto' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,.55)', marginBottom: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
                        <div
                          onClick={() => setHeroModal({ section: cmdExpandLabel, title: d.label, note: `${pct(d.amount, expandItem.amount)}`, rows: d.deptRows, total: d.amount, rowAmt: r => r[d.key] || 0 })}
                          style={{ fontSize: 16, fontWeight: 700, color: 'white', letterSpacing: '-0.5px', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3, marginBottom: 6 }}
                        >{cadShort(d.amount)}</div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,.15)', borderRadius: 2, marginBottom: 4 }}>
                          <div style={{ height: '100%', borderRadius: 2, background: '#00ABBD', width: `${d.amount / expandMax * 100}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.55)' }}>{pct(d.amount, expandItem.amount)}</div>
                      </div>
                    ))
                }
              </div>
            </div>
          )}
          </>
        );
      })()}

      {/* ── Global Filters ─────────────────────────────────────────────────────── */}
      {!['upload', 'quality', 'admin', 'userlisting'].includes(activeTab) && showNotShownBackPanel && (
        <div style={{
          background: 'white', borderBottom: '1px solid #E8E8E8',
          padding: '10px 32px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Filters</span>
          {[
            { label: 'Period',   value: period,         setter: setPeriod,         options: dynamicPeriods.map(p => ({ value: p.key, label: p.label })) },
            { label: 'Showback', value: filterShowback, setter: setFilterShowback, options: [{ value: 'All', label: 'All' }, ...showbackFilterOpts.map(s => ({ value: s, label: s }))] },
          ].map(f => (
            <label key={f.label} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 500, color: '#515254' }}>{f.label}</span>
              <select value={f.value} onChange={e => f.setter(e.target.value)}
                style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '3px 8px', fontSize: 12, color: NAVY }}>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          ))}
          {costModelFilterOpts.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid #E8E8E8', paddingLeft: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#BFBFBF', textTransform: 'uppercase', letterSpacing: 1, marginRight: 2 }}>Cost Model</span>
              {[
                { value: 'All', label: 'All Models', count: rows.length },
                ...costModelFilterOpts.map(c => ({ value: c, label: c, count: rows.filter(r => r.currentCostModel === c).length })),
              ].map(opt => {
                const isActive = filterCostModel === opt.value;
                return (
                  <div key={opt.value} onClick={() => setFilterCostModel(opt.value)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                      background: isActive ? CYAN : '#F5F5F5',
                      color: isActive ? 'white' : '#515254',
                      fontWeight: isActive ? 700 : 400, fontSize: 12,
                      transition: 'background 0.15s',
                    }}>
                    {opt.label}
                    <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.8)' : '#BFBFBF', marginLeft: 2 }}>{opt.count}</span>
                  </div>
                );
              })}
            </div>
          )}
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
          const _deptRowAmt = _deptRestrictedKeys
            ? (r => _deptRestrictedKeys.reduce((s, d) => s + (r[d.key] || 0), 0))
            : null;
          const _deptTotal  = _deptRowAmt ? filtered.reduce((s, r) => s + _deptRowAmt(r), 0) : totalPeriod;
          const belowThresholdRows = filtered.filter(r => {
            const amt = _deptRowAmt ? _deptRowAmt(r) : (r[period] || 0);
            return amt > 0 && amt < 25_000 && (r.showbackType || '').toLowerCase().startsWith('showback');
          });
          const belowThresholdTotal = belowThresholdRows.reduce((s, r) => s + (_deptRowAmt ? _deptRowAmt(r) : DEPTS.reduce((ds, d) => ds + (r[d.key] || 0), 0)), 0);
          const selDeptInfo  = selectedDept ? DEPTS.find(d => d.key === selectedDept) : null;
          const selDeptRows  = selectedDept ? filtered.filter(r => _isApproachRow(r) && (r[selectedDept] || 0) > 0 && (_deptRestrictedKeys ? !_isDirectCB(r) : true)) : [];
          const selMethodAmt = (test) => selDeptRows.filter(r => test(r)).reduce((s, r) => s + (r[selectedDept] || 0), 0);
          const _isCbCm = r => (r.currentCostModel || '').toLowerCase().includes('chargeback') && !((r.showbackType||'').toLowerCase().startsWith('no showback'));
          const selHcTotal    = selMethodAmt(r => (r.showbackType || '').toLowerCase().includes('headcount') && (_deptRestrictedKeys ? !_isCbCm(r) : true));
          const selConTotal   = selMethodAmt(r => { const st = (r.showbackType||'').toLowerCase(); return st.includes('consumption') && !st.includes('chargeback') && (_deptRestrictedKeys ? !_isCbCm(r) : true); });
          const selConCbTotal = selMethodAmt(r => { const st = (r.showbackType||'').toLowerCase(); return st.includes('consumption') && st.includes('chargeback') && (_deptRestrictedKeys ? !_isCbCm(r) : true); });
          const selCbTotal    = _deptRestrictedKeys
            ? selMethodAmt(r => _isCbCm(r))
            : selMethodAmt(r => { const st = (r.showbackType||'').toLowerCase(); const cm = (r.currentCostModel||'').toLowerCase(); return !st.includes('headcount') && !st.includes('consumption') && (st === 'chargeback' || (cm.includes('chargeback') && !st.includes('consumption') && !st.includes('headcount'))); });
          const selDeptTotal  = selHcTotal + selConTotal + selConCbTotal + selCbTotal;
          const selTopItems   = [...selDeptRows].sort((a,b) => (b[selectedDept]||0) - (a[selectedDept]||0)).slice(0, 5);
          const selMethodLabel = (r) => { const st = (r.showbackType||'').toLowerCase(); if (st.includes('headcount')) return 'Headcount-based'; if (st.includes('consumption') && st.includes('chargeback')) return 'Consumption → Chargeback'; if (st.includes('consumption')) return 'Consumption-based'; if (st.includes('chargeback') || (r.currentCostModel||'').toLowerCase().includes('chargeback')) return 'Direct chargeback'; return 'Absorbed by Technology'; };
          const approaches = [
            {
              name: 'Headcount-Based Showback',
              badge: 'Primary model',
              color: NAVY,
              meta: `Shared across all 12 LOBs proportional to FY${{ actuals: baseYear, budget: baseYear, forecast1: baseYear + 1, forecast2: baseYear + 2 }[period] ?? baseYear} headcount`,
              rows: filtered.filter(r => (r.showbackType || '').toLowerCase().includes('headcount') && DEPTS.some(d => (r[d.key] || 0) !== 0)),
            },
            {
              name: 'Consumption-Based Showback',
              badge: 'Growing',
              color: CYAN,
              meta: 'Azure + on-prem metering · allocated by actual consumption',
              rows: filtered.filter(r => {
                const st = (r.showbackType || '').toLowerCase();
                return st.includes('consumption') && !st.includes('chargeback') && DEPTS.some(d => (r[d.key] || 0) !== 0);
              }),
            },
            {
              name: 'Consumption → Chargeback',
              badge: 'Transitioning',
              color: SLATE,
              meta: 'Consumption showback for 1 year, then transitions to direct chargeback',
              rows: filtered.filter(r => {
                const st = (r.showbackType || '').toLowerCase();
                return st.includes('consumption') && st.includes('chargeback') && DEPTS.some(d => (r[d.key] || 0) !== 0);
              }),
            },
            ...(!_deptRestrictedKeys ? [{
              name: 'Direct Chargeback',
              badge: 'LOB-specific',
              color: '#DC642B',
              meta: 'Hard-charged to owning LOB · confirmation required each cycle',
              rows: filtered.filter(r => {
                const st = (r.showbackType || '').toLowerCase();
                const cm = (r.currentCostModel || '').toLowerCase();
                return st !== 'no showback' && (st === 'chargeback' || (cm.includes('chargeback') && !st.includes('consumption') && !st.includes('headcount')))
                  && DEPTS.some(d => (r[d.key] || 0) !== 0);
              }),
            }] : []),
          ];
          return (
          <div>
            {/* Coverage + Donut row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, marginBottom: 20 }}>

              {/* Coverage card — CTO mock style */}
              <div style={card({ padding: '22px 26px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'center' })}>
                <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: `conic-gradient(${CYAN} 0deg ${cmdCoveragePctExclTech / 100 * 360}deg, #F0F0F0 ${cmdCoveragePctExclTech / 100 * 360}deg 360deg)`,
                  }} />
                  <div style={{
                    position: 'absolute', inset: 14,
                    background: 'white', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, fontWeight: 700, color: NAVY,
                  }}>
                    {cmdCoveragePctExclTech.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                    Showback Programme Coverage
                  </div>
                  <div style={{ fontSize: 13, color: '#696F79', lineHeight: 1.6 }}>
                    {(user?.allowed_departments?.length && !user.allowed_departments.includes('Technology')) ? (
                      <><strong style={{ color: NAVY }}>{cadShort(cmdShownBackExclTech)}</strong> is actively shown back or charged to {user.allowed_departments.join(', ')}.</>
                    ) : (
                      <><strong style={{ color: NAVY }}>{cadShort(cmdShownBackExclTech)}</strong> of the{' '}
                      <strong style={{ color: NAVY }}>{cadShort(cmdCoverageBase)}</strong> Technology budget
                      is actively shown back or charged to LOBs.</>
                    )}
                  </div>
                </div>
              </div>

              {/* Donut chart — hover elevates segment + dims rest; legend hover mirrors */}
              <div style={card({ padding: 22 })}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>Cost by Showback Type</div>
                <div style={{ fontSize: 13, color: '#696F78', marginBottom: 16 }}>{periodLabel}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ flexShrink: 0, width: 168, height: 168, position: 'relative' }} onMouseLeave={() => setHoveredSegment(null)}>
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
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, letterSpacing: '-0.5px', lineHeight: 1.1 }}>{cadShort(showbackPieData.reduce((s, e) => s + e.value, 0))}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.2px', color: '#8A929C', textTransform: 'uppercase', marginTop: 2 }}>TOTAL</div>
                    </div>
                  </div>
                  {/* BCI-style legend — hover here also focuses the donut */}
                  <div style={{ flex: 1, fontSize: 13 }}>
                    {showbackPieData.map((entry, i) => {
                      const isActive = hoveredSegment === entry.name;
                      const isDimmed = hoveredSegment !== null && !isActive;
                      const displayName = entry.name.toLowerCase() === 'no showback'
                        ? 'No Showback (Technology Owned)'
                        : entry.name.toLowerCase().includes("technology's portion")
                          ? 'No Showback (Technology Absorbed)'
                          : entry.name;
                      return (
                        <div key={i}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9,
                            opacity: isDimmed ? 0.25 : 1,
                            transition: 'opacity 0.2s ease',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={() => setHoveredSegment(entry.name)}
                          onMouseLeave={() => setHoveredSegment(null)}
                          onClick={() => setHeroModal({ section: 'Cost by Showback Type', title: displayName, note: `${pct(entry.value, totalPeriod)}`, rows: entry.rows, total: entry.value, rowAmt: entry.name === 'Technology Own Allocation' ? (r => r.technology || 0) : entry.name.toLowerCase().startsWith('showback') ? (r => (_deptRestrictedKeys || DEPTS).filter(d => d.key !== 'technology').reduce((s, d) => s + (r[d.key] || 0), 0)) : undefined })}
                        >
                          <span style={{
                            width: 12, height: 12,
                            borderRadius: 2, flexShrink: 0,
                            background: getShowbackColor(entry.name) || DEPT_COLORS[i % DEPT_COLORS.length],
                            transform: isActive ? 'scale(1.25)' : 'scale(1)',
                            transition: 'transform 0.2s ease',
                          }} />
                          <span style={{ flex: 1, color: '#515254', fontWeight: isActive ? 700 : 400 }}>{displayName}</span>
                          <span style={{ fontWeight: 700, color: NAVY, minWidth: 62, textAlign: 'right' }}>{cadShort(entry.value)}</span>
                          <span style={{ color: '#696F78', minWidth: 36, textAlign: 'right' }}>{pct(entry.value, totalPeriod)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {cmdPendingUserList > 0 && (
                  <div style={{ marginTop: 12, fontSize: 11, color: '#8A929C', borderTop: '1px solid #EAECEE', paddingTop: 8, fontStyle: 'italic' }}>
                    * Excludes {cadShort(cmdPendingUserList)} pending User Listing attribution — total will increase once allocation is complete.
                  </div>
                )}
              </div>

            </div>

            {/* Approach Breakdown — CTO mock style */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Showback Programme — Approach Breakdown</div>
              <div style={{ fontSize: 13, color: '#696F79', marginTop: 2 }}>
                How the {cadShort(cmdShownBack)} shown back is distributed across the four active allocation methods
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${_deptRestrictedKeys ? 3 : 4}, 1fr)`, gap: 14, marginBottom: 20 }}>
              {approaches.map((ap, i) => {
                const apTotal = ap.rows.reduce((s, r) => s + _coverageDepts.reduce((ds, d) => ds + (r[d.key] || 0), 0), 0);
                const apBase  = filtered.reduce((s, r) => s + _coverageDepts.reduce((ds, d) => ds + (r[d.key] || 0), 0), 0);
                const apPct = apBase > 0 ? apTotal / apBase * 100 : 0;
                return (
                  <div key={i} style={card({ padding: '18px 20px' })}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, paddingRight: 8 }}>{ap.name}</div>
                      <div style={{
                        fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, flexShrink: 0,
                        background: `${ap.color}1A`, color: ap.color,
                      }}>{ap.badge}</div>
                    </div>
                    <div
                      onClick={() => setHeroModal({ section: 'Showback Approach', title: ap.name, note: ap.badge, rows: ap.rows, total: apTotal, rowAmt: _deptRestrictedKeys ? (r => _deptRestrictedKeys.reduce((s, d) => s + (r[d.key] || 0), 0)) : undefined })}
                      style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: -0.5, marginBottom: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                    >
                      {cadShort(apTotal)}
                    </div>
                    <div style={{ fontSize: 13, color: '#696F79', marginBottom: 12 }}>
                      {apPct.toFixed(1)}% of total · {ap.rows.length} line items
                    </div>
                    <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', borderRadius: 3, background: ap.color, width: `${apPct}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#696F79' }}>
                      <span style={{ flex: 1 }}>{ap.meta}</span>
                      <span style={{ fontWeight: 700, color: ap.color, flexShrink: 0, paddingLeft: 6 }}>{apPct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* KPI cards — approach-card style */}
            {!_deptRestrictedKeys && (() => {
              const thresholdColor = belowThresholdRows.length > 0 ? '#FF9800' : '#43A047';
              const kpiCards = [
                {
                  name: periodLabel,
                  badge: 'Total Spend',
                  color: CYAN,
                  amount: cadShort(_deptTotal),
                  rawTotal: _deptTotal,
                  rows: filtered,
                  rowAmt: _deptRowAmt || undefined,
                  subLine: period === 'actuals' && totalBudget > 0
                    ? `${(_deptTotal / totalBudget * 100).toFixed(1)}% of budget · ${filtered.length} line items`
                    : `${filtered.length} line items`,
                  barPct: period === 'actuals' && totalBudget > 0 ? Math.min(_deptTotal / totalBudget * 100, 100) : 100,
                  meta: period === 'actuals' ? `Budget: ${cadShort(totalBudget)}` : `Actuals: ${cadShort(totalActuals)}`,
                  pctLabel: period === 'actuals' && totalBudget > 0 ? `${(_deptTotal / totalBudget * 100).toFixed(1)}%` : '—',
                },
                {
                  name: 'Technology, No Showback',
                  badge: 'Absorbed',
                  color: NAVY,
                  amount: cadShort(techActuals),
                  rawTotal: techActuals,
                  rows: filtered.filter(_isTechPortion),
                  subLine: `${pct(techActuals, totalPeriod)} of total · ${filteredRaw.filter(_isTechPortion).length} line items`,
                  barPct: totalPeriod > 0 ? techActuals / totalPeriod * 100 : 0,
                  meta: 'Costs absorbed by Technology, not yet shown back',
                  pctLabel: pct(techActuals, totalPeriod),
                },
                {
                  name: 'Technology, No Showback',
                  badge: 'Owned',
                  color: NAVY,
                  amount: cadShort(cmdNoShowback),
                  rawTotal: cmdNoShowback,
                  rows: filtered.filter(r => (r.showbackType||'').toLowerCase() === 'no showback'),
                  subLine: `${pct(cmdNoShowback, totalPeriod)} of total · ${filteredRaw.filter(r => (r.showbackType||'').toLowerCase() === 'no showback').length} line items`,
                  barPct: totalPeriod > 0 ? cmdNoShowback / totalPeriod * 100 : 0,
                  meta: 'Costs intentionally not shown back',
                  pctLabel: pct(cmdNoShowback, totalPeriod),
                },
                {
                  name: 'Below $25K Threshold',
                  badge: 'Materiality',
                  color: thresholdColor,
                  amount: cadShort(belowThresholdTotal),
                  rawTotal: belowThresholdTotal,
                  rows: belowThresholdRows,
                  rowAmt: _deptRowAmt || undefined,
                  subLine: `${_deptTotal > 0 ? (belowThresholdTotal / _deptTotal * 100).toFixed(1) : '—'}% of total · ${belowThresholdRows.length} line items`,
                  barPct: _deptTotal > 0 ? belowThresholdTotal / _deptTotal * 100 : 0,
                  meta: 'Already included in total showback — highlighted separately as these items fall below the $25K materiality threshold',
                  pctLabel: `${_deptTotal > 0 ? (belowThresholdTotal / _deptTotal * 100).toFixed(1) : '—'}%`,
                },
              ];
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                  {kpiCards.map((k, i) => (
                    <div key={i} style={card({ padding: '18px 20px' })}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, paddingRight: 8 }}>{k.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, flexShrink: 0, background: `${k.color}1A`, color: k.color }}>{k.badge}</div>
                      </div>
                      <div
                        onClick={() => setHeroModal({ section: 'Cost Summary', title: k.name, note: k.badge, rows: k.rows, total: k.rawTotal, rowAmt: k.rowAmt })}
                        style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: -0.5, marginBottom: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                      >{k.amount}</div>
                      <div style={{ fontSize: 13, color: '#696F79', marginBottom: 12 }}>{k.subLine}</div>
                      <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: k.color, width: `${k.barPct}%` }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#696F79' }}>
                        <span style={{ flex: 1 }}>{k.meta}</span>
                        <span style={{ fontWeight: 700, color: k.color, flexShrink: 0, paddingLeft: 6 }}>{k.pctLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Full Technology Cost by Department */}
            {deptTechCost?.loaded && (() => {
              const maxTotal        = fullCostRows[0]?.total || 1;
              const techOCBudget   = deptTechCost?.technology?.[_ocField] || totalPeriod;
              const deptOCTotal    = fullCostRows.reduce((s, d) => s + d.ocBudget, 0);
              const fullCostOCTotal = deptOCTotal + techOCBudget;
              const absorbedW      = cmdNoShowbackTech  / maxTotal * 100;
              const ownedW         = cmdNoShowback      / maxTotal * 100;
              const ownAllocW      = cmdTechOwnShowback / maxTotal * 100;
              const directCBW      = cmdDirectCB        / maxTotal * 100;
              const notConfigW     = cmdNotConfigured   / maxTotal * 100;
              return (
                <div style={{ ...card({ padding: '22px 24px' }), marginBottom: 20 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 3 }}>Full Technology Cost by Department</div>
                      <div style={{ fontSize: 12, color: '#696F79', maxWidth: 580, lineHeight: 1.5 }}>
                        Each department already carries technology costs in their own OC budget. Add the showback programme and you see the <em>true</em> cost of technology for each part of BCI — and why Technology isn't the inflated cost centre it appears to be.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#696F79', flexShrink: 0, alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, background: NAVY, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                        In OC Budget
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 10, height: 10, background: CYAN, borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                        Showback Allocated
                      </span>
                    </div>
                  </div>
                  {/* BCI totals summary row */}
                  {(() => {
                    const totalOC = deptOCTotal + techOCBudget;
                    const totalSB = cmdShownBackExclTech;
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px 96px', gap: '0 10px', padding: '0 0 12px', borderBottom: '1px solid #EBEBEB', alignItems: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#A0A8B0' }}>BCI Total</div>
                        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#F0F0F0' }}>
                          <div style={{ width: '100%', background: NAVY }} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{cadShort(totalOC)}</div>
                          <div style={{ fontSize: 10, color: '#A0A8B0', textTransform: 'uppercase', letterSpacing: '1px' }}>In OC Budget</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: CYAN }}>{cadShort(totalSB)}</div>
                          <div style={{ fontSize: 10, color: '#A0A8B0', textTransform: 'uppercase', letterSpacing: '1px' }}>Showback</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{cadShort(totalOC)}</div>
                          <div style={{ fontSize: 10, color: '#A0A8B0', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Cost</div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Column headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px 96px', gap: '0 10px', padding: '7px 0', borderBottom: '1px solid #F0F0F0', fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#A0A8B0' }}>
                    <span>Department</span>
                    <span />
                    <span style={{ textAlign: 'right' }}>In OC Budget</span>
                    <span style={{ textAlign: 'right' }}>Showback</span>
                    <span style={{ textAlign: 'right' }}>Total Cost</span>
                  </div>
                  {/* Data rows */}
                  {fullCostRows.map(d => (
                    <div key={d.key} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px 96px', gap: '0 10px', padding: '9px 0', borderBottom: '1px solid #F5F5F5', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: NAVY, fontWeight: 500 }}>{d.label}</span>
                      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#F0F0F0' }}>
                        <div style={{ width: `${d.ocBudget / maxTotal * 100}%`, background: NAVY }} />
                        <div style={{ width: `${d.showbackAlloc / maxTotal * 100}%`, background: CYAN }} />
                      </div>
                      <span style={{ textAlign: 'right', fontSize: 13, color: '#696F79' }}>{cadShort(d.ocBudget)}</span>
                      <span style={{ textAlign: 'right', fontSize: 13, color: d.showbackAlloc ? CYAN : '#696F79' }}>{cadShort(d.showbackAlloc)}</span>
                      <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: NAVY }}>{cadShort(d.total)}</span>
                    </div>
                  ))}
                  {/* Technology footer row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px 96px', gap: '0 10px', padding: '10px 8px', borderTop: '2px solid #E8E8E8', background: 'rgba(0,54,91,.04)', borderRadius: '0 0 6px 6px', alignItems: 'center', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, fontStyle: 'italic' }}>Technology</span>
                      <span style={{ fontSize: 9, background: NAVY, color: 'white', borderRadius: 3, padding: '1px 6px', fontWeight: 700, letterSpacing: '.5px' }}>Central</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#F0F0F0' }}>
                        <div style={{ width: `${absorbedW}%`,  background: 'rgba(0,54,91,0.38)' }} />
                        <div style={{ width: `${ownedW}%`,     background: NAVY }} />
                        <div style={{ width: `${ownAllocW}%`,  background: CYAN }} />
                        <div style={{ width: `${directCBW}%`,  background: '#DC642B' }} />
                        <div style={{ width: `${notConfigW}%`, background: '#FFD54F' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, color: '#A0A8B0', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: 'rgba(0,54,91,0.38)', borderRadius: 1, display: 'inline-block' }} />
                          Absorbed {cadShort(cmdNoShowbackTech)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: NAVY, borderRadius: 1, display: 'inline-block' }} />
                          Owned {cadShort(cmdNoShowback)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: CYAN, borderRadius: 1, display: 'inline-block' }} />
                          Own allocation {cadShort(cmdTechOwnShowback)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: '#DC642B', borderRadius: 1, display: 'inline-block' }} />
                          Direct CB {cadShort(cmdDirectCB)}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ width: 8, height: 8, background: '#FFD54F', borderRadius: 1, display: 'inline-block' }} />
                          Not configured {cadShort(cmdNotConfigured)}
                        </span>
                      </div>
                    </div>
                    <span style={{ textAlign: 'right', fontSize: 13, color: '#696F79' }}>{cadShort(techOCBudget)}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#DC642B' }}>-{cadShort(cmdShownBackExclTech)}</div>
                      <div style={{ fontSize: 10, color: '#A0A8B0' }}>distributed out</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{cadShort(techOCBudget - cmdShownBackExclTech)}</div>
                      <div style={{ fontSize: 10, color: '#A0A8B0' }}>net retained</div>
                    </div>
                  </div>
                  {/* Footer summary */}
                  <div style={{ marginTop: 14, padding: '10px 14px', background: '#F8F9FB', borderRadius: 6, display: 'flex', gap: '6px 16px', flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: '#696F79' }}>
                    <span><span style={{ color: NAVY, fontWeight: 700 }}>{cadShort(deptOCTotal)}</span>&nbsp;in dept OC budgets (excl. Technology)</span>
                    <span style={{ color: '#C8CDD2' }}>+</span>
                    <span><span style={{ color: NAVY, fontWeight: 700 }}>{cadShort(techOCBudget)}</span>&nbsp;Technology central budget</span>
                    <span style={{ color: '#C8CDD2' }}>=</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{cadShort(fullCostOCTotal)} total BCI technology cost</span>
                    <span style={{ marginLeft: 4, color: '#C8CDD2' }}>·</span>
                    <span style={{ fontSize: 10, color: '#A0A8B0' }}>
                      Showback: {cadShort(cmdShownBackExclTech)} to other depts · {cadShort(cmdTechOwnShowback)} Technology's own allocation = {cadShort(cmdShownBack)} total — internal transfer, not additional spend
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Department Allocations + detail panel */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedDept ? '1.2fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>

              {/* Custom bar list — matches viewer mock */}
              <div style={card({ padding: '22px 24px' })}>
                <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>How Departments Compare</div>
                <div style={{ fontSize: 13, color: '#696F79', marginBottom: 18 }}>
                  Allocated technology cost by department for {periodLabel} — includes headcount showback, consumption showback, and chargeback
                </div>
                {(() => {
                  const visibleDepts = _deptRestrictedKeys
                    ? deptTotals.filter(d => _deptRestrictedKeys.some(dk => dk.key === d.key))
                    : deptTotals.filter(d => !d.isTech);
                  const maxVal = visibleDepts[0]?.value || 1;
                  let rankIdx = 0;
                  return visibleDepts.map((d) => {
                    const rank     = d.isTech ? '—' : ++rankIdx;
                    const barPct   = d.value / maxVal * 100;
                    const isSel    = selectedDept === d.key;
                    const barColor = isSel ? CYAN : d.isTech ? NAVY : '#D0D0D0';
                    return (
                      <div key={d.key}
                        onClick={() => setSelectedDept(prev => prev === d.key ? null : d.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                          borderBottom: '1px solid #F8F8F8',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ width: 18, fontSize: 12, color: '#BFBFBF', textAlign: 'right', flexShrink: 0 }}>{rank}</div>
                        <div style={{ width: 124, fontSize: 13, fontWeight: isSel ? 700 : 400, fontStyle: d.isTech ? 'italic' : 'normal', color: isSel ? CYAN : d.isTech ? '#696F79' : NAVY, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.name}
                        </div>
                        <div style={{ flex: 1, height: 10, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 3, transition: 'background 0.15s' }} />
                        </div>
                        <div style={{ width: 54, textAlign: 'right', fontSize: 13, fontWeight: 700, color: isSel ? CYAN : NAVY, flexShrink: 0 }}>{cadShort(d.value)}</div>
                        <div style={{ width: 36, textAlign: 'right', fontSize: 13, color: '#696F79', flexShrink: 0 }}>{pct(d.value, totalPeriod)}</div>
                      </div>
                    );
                  });
                })()}
                {!_deptRestrictedKeys && (
                  <div style={{ marginTop: 14, fontSize: 13, color: '#BFBFBF' }}>
                    Technology's absorbed cost ({cadShort(deptTotals.find(d => d.isTech)?.value || 0)}) is not charged to any department
                  </div>
                )}
              </div>

              {/* Detail panel */}
              {selectedDept && selDeptInfo && (
                <div style={card({ padding: '22px 24px', borderTop: `3px solid ${CYAN}` })}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{selDeptInfo.label} Department</div>
                  <div style={{ fontSize: 13, color: '#696F79', marginBottom: 16 }}>Your allocated share for {periodLabel}</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: CYAN, letterSpacing: -1, marginBottom: 4 }}>{cadShort(selDeptTotal)}</div>
                  <div style={{ fontSize: 13, color: '#696F79', marginBottom: 20 }}>{pct(selDeptTotal, totalPeriod)} of total Technology spend</div>

                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#BFBFBF', marginBottom: 12 }}>Breakdown by Method</div>
                  {[
                    { label: 'Headcount showback',       amount: selHcTotal,    color: NAVY },
                    { label: 'Consumption showback',     amount: selConTotal,   color: CYAN },
                    { label: 'Consumption → Chargeback', amount: selConCbTotal, color: SLATE },
                    { label: 'Direct chargeback',        amount: selCbTotal,    color: '#DC642B' },
                  ].filter(m => m.amount > 0).map((m, i) => (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'inline-block' }} />
                          {m.label}
                        </span>
                        <span style={{ fontWeight: 700, color: NAVY }}>{cadShort(m.amount)}</span>
                      </div>
                      <div style={{ height: 5, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: m.color, borderRadius: 3, width: `${selDeptTotal > 0 ? m.amount / selDeptTotal * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}

                  {selTopItems.length > 0 && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '20px 0 4px' }}>What drives {selDeptInfo.label}'s bill</div>
                      <div
                        style={{ fontSize: 12, color: CYAN, marginBottom: 12, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                        onClick={() => setHeroModal({ section: selDeptInfo.label, title: 'All allocated line items', note: `${selDeptRows.length} items · ${periodLabel}`, rows: selDeptRows, total: selDeptTotal, amtKey: selectedDept, colHeader: `${selDeptInfo.label} Share` })}
                      >Top 5 of {selDeptRows.length} line items</div>
                      {selTopItems.map((r, i) => {
                        const amt = r[selectedDept] || 0;
                        const ml  = selMethodLabel(r);
                        const ic  = ml.includes('Headcount') ? '👥' : ml.includes('Consumption') ? '☁️' : ml.includes('chargeback') ? '💳' : '📦';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < selTopItems.length - 1 ? '1px solid #F0F0F0' : 'none' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: `${getShowbackColor(r.showbackType)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{ic}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description || r.glCategory || '—'}</div>
                              <div style={{ fontSize: 12, color: '#696F79', marginTop: 1 }}>{ml}</div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{cadShort(amt)}</div>
                              <div style={{ fontSize: 12, color: '#696F79' }}>{pct(amt, selDeptTotal)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* COST MANAGEMENT                                                    */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'costmanagement' && rows.length > 0 && (() => {
          const HL = {
            yellow:  { bg: '#FFCD15', text: '#000000', bold: false },
            pink:    { bg: '#FFB3B3', text: '#C00000', bold: true  },
            green:   { bg: '#DAF2D0', text: '#000000', bold: false },
            orange1: { bg: '#DC642B', text: '#FFFFFF', bold: false },
            khaki:   { bg: '#C1B64E', text: '#000000', bold: false },
            orange2: { bg: '#F68E47', text: '#000000', bold: false },
          };
          const getHL = (r) => {
            const c = r.comments || '';
            if (c.includes('no PD code'))              return 'yellow';
            if (c.includes('Missing in Cost Model'))   return 'pink';
            if (c.includes('two departments'))         return 'orange1';
            if (c.includes('User Based Listing'))      return 'orange2';
            if (c.includes('Check chargebacks'))       return 'khaki';
            if (c.includes('PID not found in previous')) return 'green';
            return null;
          };
          const LEGEND = [
            { color: '#FFCD15', text: 'No PID Code — check description and reason' },
            { color: '#FFB3B3', text: 'Missing master data in Cost Model — populate and rerun' },
            { color: '#DAF2D0', text: 'PID not found in Cost Model — check if technology specific' },
            { color: '#DC642B', text: 'Multiple absorber departments — check allocation logic' },
            { color: '#C1B64E', text: 'Chargeback — verify if correct' },
            { color: '#F68E47', text: 'User Based Listing not found — add user count' },
          ];
          const DEPT_COLS = [
            { key: 'ceo',        label: 'CEO'        },
            { key: 'legal',      label: 'Legal'      },
            { key: 'hr',         label: 'HR'         },
            { key: 'audit',      label: 'Audit'      },
            { key: 'cdo',        label: 'CD&O'       },
            { key: 'corpOps',    label: 'Corp Ops'   },
            { key: 'finance',    label: 'Finance'    },
            { key: 'technology', label: 'Technology' },
            { key: 'io',         label: 'IO'         },
            { key: 'irr',        label: 'IRR'        },
            { key: 'isr',        label: 'ISR'        },
            { key: 'cmci',       label: 'CM&CI'      },
            { key: 'pe',         label: 'PE'         },
          ];
          const FIN_COLS = [
            { key: 'actuals',   label: 'Actuals',                    year: `FY${baseYear}`      },
            { key: 'budget',    label: 'Budget',                     year: `FY${baseYear}`      },
            { key: 'forecast1', label: `FY${baseYear + 1} Forecast`, year: null                 },
            { key: 'forecast2', label: `FY${baseYear + 2} Forecast`, year: null                 },
          ];
          const TEXT_COLS = [
            { label:'Branch Name',        k:'branch',           minWidth:130, align:'left',  tdExtra:{},                               val:r=>r.branch||'—' },
            { label:'G/L Code',           k:'glCode',           minWidth:65,                 tdExtra:{fontFamily:'monospace'},          val:r=>r.glCode||'—' },
            { label:'Branch Code',        k:'branchCode',       minWidth:65,                 tdExtra:{fontFamily:'monospace'},          val:r=>r.branchCode||'—' },
            { label:'PID',                k:'pid',              minWidth:75,                 tdExtra:{fontFamily:'monospace'},          val:r=>r.pid||'—' },
            { label:'GL Category',        k:'glCategory',       minWidth:110,                tdExtra:{},                               val:r=>r.glCategory||'—' },
            { label:'Cost Model Category',k:'costModelCategory',minWidth:120,                tdExtra:{},                               val:r=>r.costModelCategory||'—' },
            { label:'Description',        k:'description',      minWidth:200, align:'left',  tdExtra:{whiteSpace:'normal',maxWidth:220},val:r=>r.description||'—' },
            { label:'Required',           k:'required',         minWidth:90,                 tdExtra:{},                               val:r=>r.required||'—' },
            { label:'Current Cost Model', k:'currentCostModel', minWidth:160, align:'left',  tdExtra:{whiteSpace:'normal',maxWidth:180},val:r=>r.currentCostModel||'—' },
            { label:'Allocation',         k:'allocation',       minWidth:80,                 tdExtra:{},                               val:r=>r.allocation||'—' },
            { label:'Future Cost Model',  k:'futureCostModel',  minWidth:150, align:'left',  tdExtra:{whiteSpace:'normal',maxWidth:180},val:r=>r.futureCostModel||'—' },
            { label:'Showback Type',      k:'showbackType',     minWidth:170, align:'left',  tdExtra:{whiteSpace:'normal',maxWidth:190},val:r=>r.showbackType||'—' },
          ];
          const togglePin = k => setCmtPinnedCols(prev => {
            const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next;
          });
          const getPinnedLeft = k => {
            let left = 0;
            for (const col of TEXT_COLS) {
              if (col.k === k) break;
              if (cmtPinnedCols.has(col.k)) left += col.minWidth;
            }
            return left;
          };
          const pinStyle = (k, baseZIndex = 1) => cmtPinnedCols.has(k) ? {
            position: 'sticky', left: getPinnedLeft(k), zIndex: baseZIndex,
            boxShadow: '2px 0 5px rgba(0,0,0,0.12)',
          } : {};
          const numFmt = (v) => v ? v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
          const th = (extra = {}) => ({
            background: NAVY, color: 'white', fontSize: 13, fontWeight: 700,
            padding: '7px 9px', whiteSpace: 'nowrap', textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.15)', position: 'sticky', top: 0, zIndex: 2,
            userSelect: 'none',
            ...extra,
          });
          const td = (hl, extra = {}) => ({
            fontSize: 13, padding: '4px 8px', border: '1px solid #EFEFEF',
            background: hl ? HL[hl].bg : 'white',
            color: hl ? HL[hl].text : '#2C2C2C',
            fontWeight: hl && HL[hl].bold ? 700 : 400,
            whiteSpace: 'nowrap',
            ...extra,
          });
          return (
            <div>
              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                {LEGEND.map(l => (
                  <div key={l.color} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#515254' }}>
                    <div style={{ width: 13, height: 13, background: l.color, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 2, flexShrink: 0 }} />
                    {l.text}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#696F79' }}>
                  {applyFilters(filtered, cmtSearch, cmtColFilter).length} of {filtered.length} rows · department allocations spread based on actuals
                </span>
                <input placeholder="Search all columns…" value={cmtSearch} onChange={e => setCmtSearch(e.target.value)}
                  style={{ border: `1px solid ${CYAN}`, borderRadius: 4, padding: '4px 10px', fontSize: 13, width: 220, outline: 'none' }} />
              </div>
              {/* Table */}
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', border: '1px solid #E0E0E0', borderRadius: 6 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {TEXT_COLS.map(col => {
                        const pinned = cmtPinnedCols.has(col.k);
                        return (
                        <th key={col.k} style={th({ minWidth: col.minWidth, textAlign: col.align||'center', verticalAlign:'top', paddingBottom:4, cursor:'pointer', ...pinStyle(col.k, 4), ...(pinned ? {borderBottom:'2px solid #FFD54F'} : {}) })}
                            title={pinned ? 'Click to unpin column' : 'Click to pin column'}>
                          <div style={{marginBottom:3, display:'flex', alignItems:'center', justifyContent:'center', gap:4}}>
                            {col.label}
                            <span style={{fontSize:9, opacity: pinned ? 1 : 0.35, transition:'opacity .15s'}}>{pinned ? '📌' : '📌'}</span>
                          </div>
                          <div onClick={e => { e.stopPropagation(); togglePin(col.k); }} style={{position:'absolute',inset:0,cursor:'pointer'}} />
                          <select value={cmtColFilter[col.k]||''} onChange={e=>{e.stopPropagation();setCmtColFilter(f=>({...f,[col.k]:e.target.value}));}}
                            onClick={e=>e.stopPropagation()}
                            style={{ width:'100%', fontSize:11, padding:'1px 2px', cursor:'pointer', position:'relative', zIndex:1,
                              border:'1px solid rgba(255,255,255,.3)', borderRadius:2,
                              background: cmtColFilter[col.k] ? CYAN : 'rgba(255,255,255,.12)', color:'white' }}>
                            <option value="" style={{background:'#1a3a5c'}}>All</option>
                            {colUniq(filtered, col.k).map(v=><option key={v} value={v} style={{background:'#1a3a5c'}}>{v}</option>)}
                          </select>
                        </th>
                        );
                      })}
                      {FIN_COLS.map(f => (
                        <th key={f.key} style={th({ minWidth: 95, background: period === f.key ? CYAN : NAVY })}>
                          {f.year ? (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.75, marginBottom: 1 }}>{f.year}</div>
                              <div>{f.label}</div>
                            </div>
                          ) : f.label}
                        </th>
                      ))}
                      {DEPT_COLS.map(d => (
                        <th key={d.key} style={th({ minWidth: 85 })}>{d.label}</th>
                      ))}
                      <th style={th({ minWidth: 260, textAlign: 'left' })}>Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applyFilters(filtered, cmtSearch, cmtColFilter).map((r, i) => {
                      const hl = getHL(r);
                      return (
                        <tr key={i}>
                          {TEXT_COLS.map(col => (
                            <td key={col.k} style={td(hl, { ...col.tdExtra, ...pinStyle(col.k, 1) })}>{col.val(r)}</td>
                          ))}
                          {FIN_COLS.map(f => (
                            <td key={f.key} style={td(hl, {
                              textAlign: 'right',
                              background: period === f.key ? (hl ? HL[hl].bg : `${CYAN}22`) : (hl ? HL[hl].bg : 'white'),
                            })}>{numFmt(r[f.key])}</td>
                          ))}
                          {DEPT_COLS.map(d => (
                            <td key={d.key} style={td(hl, { textAlign: 'right' })}>{numFmt(r[d.key])}</td>
                          ))}
                          <td style={td(hl, { whiteSpace: 'normal', maxWidth: 280, fontSize: 12, color: hl ? HL[hl].text : '#696F79' })}>{r.comments || ''}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BY DEPARTMENT                                                      */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BY SHOWBACK TYPE                                                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'showback' && rows.length > 0 && (() => {
          // ── Summary ────────────────────────────────────────────────────────
          const _showbackTotal = filtered.reduce((s, r) => s + _rowValue(r), 0);
          const movingToCB = filtered
            .filter(r => (r.showbackType || '').toLowerCase().includes('chargeback') && _coverageDepts.some(d => (r[d.key] || 0) !== 0))
            .reduce((s, r) => s + _coverageDepts.reduce((ds, d) => ds + (r[d.key] || 0), 0), 0);

          // ── Category breakdown ────────────────────────────────────────────
          const catMap = {};
          filtered.forEach(r => {
            const st = r.showbackType || 'None';
            if (_deptRestrictedKeys && st.toLowerCase().startsWith('no showback')) return;
            // Exclude showback rows with no dept allocation (pending User Listing)
            if (_isShowbackRow(r) && DEPTS.every(d => (r[d.key] || 0) === 0)) return;
            const cat = r.costModelCategory || 'Uncategorised';
            if (!catMap[cat]) catMap[cat] = { name: cat, total: 0, rows: [], segs: {} };
            const amt = _rowValue(r);
            catMap[cat].total += amt;
            catMap[cat].rows.push(r);
            catMap[cat].segs[st] = (catMap[cat].segs[st] || 0) + amt;
          });
          const catData = Object.values(catMap)
            .filter(c => c.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 9);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ── 1. Summary tiles ─────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${showNotShownBackPanel ? 3 : 2}, 1fr)`, gap: 16 }}>

                {/* Shown back */}
                <div style={card({ padding: '18px 20px' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Shown back to business</div>
                    <div style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${NAVY}1A`, color: NAVY }}>{cmdCoveragePctExclTech.toFixed(1)}%</div>
                  </div>
                  <div onClick={() => setHeroModal({ section: 'By Showback Type', title: 'Shown back to business', note: `${cmdCoveragePctExclTech.toFixed(1)}%`, rows: filtered.filter(r => _isShowbackRow(r) && _nonTechDepts.some(d => (r[d.key]||0) !== 0)), total: cmdShownBackExclTech, rowAmt: r => _nonTechDepts.reduce((s, d) => s + (r[d.key] || 0), 0) })}
                       style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: -0.5, marginBottom: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{cadShort(cmdShownBackExclTech)}</div>
                  <div style={{ fontSize: 13, color: '#696F79', marginBottom: 12 }}>{filtered.filter(r => _isShowbackRow(r) && _nonTechDepts.some(d => (r[d.key]||0) !== 0)).length} line items allocated to departments</div>
                  <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: NAVY, width: `${cmdCoveragePctExclTech}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#696F79' }}>
                    <span>Headcount + Consumption + Chargeback methods</span>
                    <span style={{ fontWeight: 700, color: NAVY, paddingLeft: 6 }}>{cmdCoveragePctExclTech.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Not shown back — with three-way breakdown */}
                {showNotShownBackPanel && <div style={card({ padding: '18px 20px' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Not shown back</div>
                    <div style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: '#DC642B1A', color: '#DC642B' }}>Needs decision</div>
                  </div>
                  <div onClick={() => setHeroModal({ section: 'By Showback Type', title: 'Not shown back', note: 'Needs decision', rows: filtered.filter(r => !_isShowbackRow(r)), total: cmdNotShownBack, rowAmt: _deptRestrictedKeys ? (r => _deptRestrictedKeys.reduce((s, d) => s + (r[d.key] || 0), 0)) : undefined })}
                       style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: -0.5, marginBottom: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{cadShort(cmdNotShownBack)}</div>
                  <div style={{ fontSize: 13, color: '#696F79', marginBottom: 12 }}>{filtered.filter(r => !_isShowbackRow(r)).length} line items · no department owner</div>
                  <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: '#DC642B', width: `${_showbackTotal > 0 ? cmdNotShownBack / _showbackTotal * 100 : 0}%` }} />
                  </div>
                  {/* Four-way breakdown */}
                  <div style={{ display: 'flex', gap: 0, paddingTop: 10, borderTop: '1px solid #F2F2F2' }}>
                    {[
                      { label: 'No Showback',          amount: cmdNoShowback,        note: 'Intentional',    rows: filtered.filter(r => (r.showbackType||'').toLowerCase() === 'no showback') },
                      { label: "Technology's Portion", amount: cmdNoShowbackTech,    note: 'Tech-specific',  rows: filtered.filter(r => (r.showbackType||'').toLowerCase().includes("technology's portion")) },
                      { label: 'Not Configured',       amount: cmdNotConfigured,     note: 'Needs decision', rows: filtered.filter(r => !(r.showbackType||'').trim()) },
                    ].map((row, j) => (
                      <div key={j} style={{ flex: 1, borderRight: j < 3 ? '1px solid #F2F2F2' : 'none', paddingRight: j < 3 ? 10 : 0, paddingLeft: j > 0 ? 10 : 0 }}>
                        <div style={{ fontSize: 11, color: '#A0A8B4', marginBottom: 3, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.5px' }}>{row.label}</div>
                        <div onClick={() => setHeroModal({ section: 'Not Shown Back', title: row.label, note: row.note, rows: row.rows, total: row.amount })}
                             style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 2 }}>{cadShort(row.amount)}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5, display: 'inline-block', background: '#F2F2F2', color: '#696F79' }}>{row.note}</div>
                      </div>
                    ))}
                  </div>
                </div>}

                {/* Moving to chargeback */}
                <div style={card({ padding: '18px 20px' })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Moving to chargeback</div>
                    <div style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${SLATE}1A`, color: SLATE }}>Transitioning</div>
                  </div>
                  <div onClick={() => setHeroModal({ section: 'By Showback Type', title: 'Moving to chargeback', note: 'Transitioning', rows: filtered.filter(r => (r.showbackType||'').toLowerCase().includes('chargeback') && _coverageDepts.some(d => (r[d.key]||0) !== 0)), total: movingToCB, rowAmt: _deptRestrictedKeys ? (r => _deptRestrictedKeys.reduce((s, d) => s + (r[d.key] || 0), 0)) : undefined })}
                       style={{ fontSize: 22, fontWeight: 700, color: NAVY, letterSpacing: -0.5, marginBottom: 2, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{cadShort(movingToCB)}</div>
                  <div style={{ fontSize: 13, color: '#696F79', marginBottom: 12 }}>{filtered.filter(r => (r.showbackType||'').toLowerCase().includes('chargeback') && _coverageDepts.some(d => (r[d.key]||0) !== 0)).length} items · transitions to direct chargeback</div>
                  <div style={{ height: 6, background: '#F0F0F0', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: SLATE, width: `${_showbackTotal > 0 ? movingToCB / _showbackTotal * 100 : 0}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#696F79' }}>
                    <span>Consumption showback for 1 year, then chargeback in FY{baseYear + 1}</span>
                    <span style={{ fontWeight: 700, color: SLATE, paddingLeft: 6 }}>{pct(movingToCB, _showbackTotal)}</span>
                  </div>
                </div>

              </div>

              {/* ── 2. Category breakdown ────────────────────────────────── */}
              <div style={card({ padding: '20px 22px' })}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 }}>By Cost Model Category</div>
                <div style={{ fontSize: 13, color: '#696F79', marginBottom: 20 }}>Hover a row to focus · shows showback method mix within each category</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {catData.map(cat => (
                    <div key={cat.name}
                         onMouseEnter={() => setSbHoverCat(cat.name)}
                         onMouseLeave={() => setSbHoverCat(null)}>
                      {/* Category label + total */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700,
                                      color: sbHoverCat === cat.name ? NAVY : '#696F79',
                                      transition: 'color .2s' }}>{cat.name}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: sbHoverCat === cat.name ? NAVY : '#A0A8B0',
                                      transition: 'color .2s' }}>{cadShort(cat.total)}</div>
                      </div>
                      {/* Stacked bar */}
                      <div style={{ height: sbHoverCat === cat.name ? 10 : 6, display: 'flex',
                                    borderRadius: 4, overflow: 'hidden',
                                    transition: 'height .2s ease' }}>
                        {Object.entries(cat.segs)
                          .filter(([, v]) => v > 0)
                          .sort(([, a], [, b]) => b - a)
                          .map(([st, val]) => (
                            <div key={st}
                                 title={`${st}: ${cad(val)} · ${pct(val, cat.total)}`}
                                 style={{
                                   height: '100%',
                                   width: `${val / cat.total * 100}%`,
                                   background: getShowbackColor(st),
                                   opacity: sbHoverCat === null ? 0.55 : sbHoverCat === cat.name ? 1 : 0.15,
                                   transition: 'opacity .2s, filter .2s',
                                   filter: sbHoverCat !== null && sbHoverCat !== cat.name ? 'saturate(0.2)' : 'none',
                                 }} />
                          ))}
                      </div>
                      {/* Method labels — only visible on hover */}
                      {sbHoverCat === cat.name && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 6 }}>
                          {Object.entries(cat.segs)
                            .filter(([, v]) => v > 0)
                            .sort(([, a], [, b]) => b - a)
                            .map(([st, val]) => (
                              <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#696F79' }}>
                                <div style={{ width: 7, height: 7, borderRadius: 2, background: getShowbackColor(st), flexShrink: 0 }} />
                                <span>{st || 'None'}</span>
                                <span style={{ fontWeight: 700, color: NAVY }}>{pct(val, cat.total)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Static legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 24, paddingTop: 14, borderTop: '1px solid #F2F2F2' }}>
                  {uniqueShowbacks.filter(st => !_deptRestrictedKeys || !st.toLowerCase().startsWith('no showback')).map(st => (
                    <div key={st} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#696F79' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: getShowbackColor(st), flexShrink: 0 }} />
                      {st || 'None'}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* DATA QUALITY                                                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'quality' && (() => {
          const belowMaterialityRows = rows.filter(r => {
            const amt = r[period] || 0;
            return amt > 0 && amt < 25_000 && r.showbackType && r.showbackType !== 'None';
          });
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
                        {['PID', 'Description', 'Showback Type', 'Cost Model', periodLabel].map((h, i) => (
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
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#FF9800' }}>{cad(r[period] || 0)}</td>
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
                <label style={{ fontSize: 13, color: '#515254', whiteSpace: 'nowrap' }}>Base fiscal year:</label>
                <select value={recalcBaseYear} onChange={e => setRecalcBaseYear(Number(e.target.value))}
                  style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '5px 10px', fontSize: 13, flex: 1 }}>
                  {[baseYear, baseYear + 1, baseYear + 2].map(yr => (
                    <option key={yr} value={yr}>FY{yr}</option>
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
                      body: JSON.stringify({ baseYear: recalcBaseYear }),
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

            {/* Showback coverage target */}
            <div style={{ marginBottom: 20, padding: '16px', background: '#F8F9FA', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Showback Coverage Target</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="number" min="1" max="100" step="1"
                  value={coverageTargetInput}
                  onChange={e => setCoverageTargetInput(e.target.value)}
                  placeholder="e.g. 85"
                  style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '6px 10px', fontSize: 13, width: 90 }}
                />
                <span style={{ fontSize: 13, color: '#696F79' }}>%</span>
                <button
                  onClick={async () => {
                    const v = parseFloat(coverageTargetInput);
                    if (isNaN(v) || v < 1 || v > 100) return;
                    const res = await fetch(`${API_URL}/admin/settings`, {
                      method: 'PUT', credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ coverage_target: v }),
                    });
                    if (res.ok) setCoverageTarget(v);
                  }}
                  style={{
                    background: NAVY, color: 'white', border: 'none', borderRadius: 6,
                    padding: '6px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >Save</button>
                {coverageTarget !== null && (
                  <span style={{ fontSize: 12, color: '#696F79' }}>Current: {coverageTarget}%</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#A0A8B4', marginTop: 6 }}>
                Shown as a badge on the Showback Coverage card in the Overview tab.
              </div>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              {[['users','Users'],['logs','Usage Logs'],['costmodel','Cost Model'],['headcount','Headcount'],['userlisting','User Listing'],['share','Share']].map(([id, label]) => (
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
                        {['Email', 'Name', 'Role', 'GL Codes', 'Branches', 'Departments', 'Status', ''].map((h, i) => (
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
                            {u.can_view_quality && !u.is_admin && (
                              <span style={{
                                background: '#E8F0FF', color: '#3949AB',
                                borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, marginLeft: 4,
                              }}>Data Quality</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(u.allowed_gl_codes || []).join(', ')}>
                            {(u.allowed_gl_codes || []).length === 0 ? <span style={{ color: '#BBB' }}>All</span> : (u.allowed_gl_codes || []).join(', ')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(u.allowed_branches || []).join(', ')}>
                            {(u.allowed_branches || []).length === 0 ? <span style={{ color: '#BBB' }}>All</span> : (u.allowed_branches || []).join(', ')}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#515254', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(u.allowed_departments || []).join(', ')}>
                            {(u.allowed_departments || []).length === 0 ? <span style={{ color: '#BBB' }}>All</span> : (u.allowed_departments || []).join(', ')}
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
                    { label: 'Email *',      value: userFormEmail, setter: setUserFormEmail, placeholder: 'name@bci.ca', disabled: !!editingUser },
                    { label: 'Display Name', value: userFormName,  setter: setUserFormName,  placeholder: 'First Last' },
                  ].map(f => (
                    <label key={f.label} style={{ display: 'block', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#515254', marginBottom: 4 }}>{f.label}</div>
                      <input
                        value={f.value}
                        onChange={e => f.setter(e.target.value)}
                        placeholder={f.placeholder}
                        disabled={f.disabled}
                        style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #D0D0D0', borderRadius: 4, padding: '7px 10px', fontSize: 13, background: f.disabled ? '#F5F5F5' : 'white' }}
                      />
                    </label>
                  ))}
                  {/* GL Codes multi-select */}
                  {[
                    { label: 'GL Codes',    open: glDropOpen,     setOpen: setGlDropOpen,     selected: userFormGLs,    setSelected: setUserFormGLs,    options: availableGLs,                        allLabel: 'All GL Codes'    },
                    { label: 'Branches',   open: branchDropOpen, setOpen: setBranchDropOpen, selected: userFormBranch, setSelected: setUserFormBranch, options: availableBranches,                   allLabel: 'All Branches'   },
                    { label: 'Departments',open: deptsDropOpen,  setOpen: setDeptsDropOpen,  selected: userFormDepts,  setSelected: setUserFormDepts,  options: DEPTS.map(d => d.label),             allLabel: 'All Departments' },
                  ].map(f => (
                    <div key={f.label} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#515254', marginBottom: 4 }}>{f.label}</div>
                      <div style={{ position: 'relative' }}>
                        <div
                          onClick={() => f.setOpen(v => !v)}
                          style={{ border: '1px solid #D0D0D0', borderRadius: 4, padding: '7px 10px', fontSize: 13, cursor: 'pointer', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
                        >
                          <span style={{ color: f.selected.length === 0 ? '#999' : NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90%' }}>
                            {f.selected.length === 0 ? f.allLabel : f.selected.join(', ')}
                          </span>
                          <span style={{ fontSize: 9, color: '#999', flexShrink: 0 }}>▼</span>
                        </div>
                        {f.open && (
                          <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => f.setOpen(false)} />
                            <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #D0D0D0', borderRadius: 4, marginTop: 2, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #F2F2F2', background: f.selected.length === 0 ? `${NAVY}0D` : 'white' }}>
                                <input type="checkbox" checked={f.selected.length === 0} onChange={() => f.setSelected([])} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{f.allLabel}</span>
                              </label>
                              {f.options.map(opt => (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', background: f.selected.includes(opt) ? `${CYAN}12` : 'white' }}>
                                  <input
                                    type="checkbox"
                                    checked={f.selected.includes(opt)}
                                    onChange={e => f.setSelected(v => e.target.checked ? [...v, opt] : v.filter(x => x !== opt))}
                                  />
                                  <span style={{ fontSize: 12 }}>{opt}</span>
                                </label>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" checked={userFormAdmin} onChange={e => setUserFormAdmin(e.target.checked)} />
                    <span style={{ fontSize: 13, color: '#515254' }}>Admin (can upload data &amp; manage users)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input type="checkbox" checked={userFormCanEditUL} onChange={e => setUserFormCanEditUL(e.target.checked)} disabled={userFormAdmin} />
                    <span style={{ fontSize: 13, color: userFormAdmin ? '#BFBFBF' : '#515254' }}>
                      Can edit User Listing (for their branches)
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <input type="checkbox" checked={userFormCanViewQuality} onChange={e => setUserFormCanViewQuality(e.target.checked)} disabled={userFormAdmin} />
                    <span style={{ fontSize: 13, color: userFormAdmin ? '#BFBFBF' : '#515254' }}>
                      Can view Data Quality tab
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                    Cost Model ({applyFilters(adminCostModel,cmSearch,cmColFilter).length} of {adminCostModel.length} rows)
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Search all columns…" value={cmSearch} onChange={e => setCmSearch(e.target.value)}
                      style={{ border: `1px solid ${CYAN}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, width: 200, outline: 'none' }} />
                    <button onClick={() => { setCmSearch(''); setCmColFilter({}); loadAdminCostModel(); }}
                      style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                    <button onClick={() => exportToExcel(`${API_URL}/admin/cost-model/export`, 'cost_model.xlsx')}
                      style={{ background: NAVY, border: 'none', color: 'white', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>⬇ Download</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {[
                          {h:'Branch Name',           k:'branchName'},
                          {h:'GL Code',               k:'glCode'},
                          {h:'Branch Code',           k:'branchCode'},
                          {h:'PID',                   k:'pid'},
                          {h:'GL Expense Category',   k:'glCategory'},
                          {h:'Cost Model Category',   k:'costModelCategory'},
                          {h:'Description',           k:'description'},
                          {h:'Required or Requested', k:'required'},
                          {h:'Current Cost Model',    k:'currentCostModel'},
                          {h:'Allocation',            k:'allocation'},
                          {h:'Future Cost Model',     k:'futureCostModel'},
                          {h:'Showback Type',         k:'showbackType'},
                          {h:'User Listing',          k:'userListingFlag'},
                          {h:'',                      k:null},
                        ].map(({h, k}, i) => (
                          <th key={i} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            <div>{h}</div>
                            {k && (
                              <select value={cmColFilter[k] || ''} onChange={e => setCmColFilter(f => ({...f, [k]: e.target.value}))}
                                style={{ width: '100%', marginTop: 3, fontSize: 9, padding: '1px 2px', cursor: 'pointer',
                                  border: '1px solid rgba(255,255,255,.3)', borderRadius: 2,
                                  background: cmColFilter[k] ? CYAN : 'rgba(255,255,255,.12)', color: 'white' }}>
                                <option value="" style={{background:'#1a3a5c'}}>All</option>
                                {colUniq(adminCostModel, k).map(v => <option key={v} value={v} style={{background:'#1a3a5c'}}>{v}</option>)}
                              </select>
                            )}
                          </th>
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
                        return applyFilters(adminCostModel, cmSearch, cmColFilter).map((r, i) => {
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                    Headcount ({applyFilters(adminHeadcount,hcSearch,hcColFilter).length} of {adminHeadcount.length} departments)
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Search…" value={hcSearch} onChange={e => setHcSearch(e.target.value)}
                      style={{ border: `1px solid ${CYAN}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, width: 180, outline: 'none' }} />
                    <button onClick={() => { setNewHcRow({ deptCode:'', shortCode:'', deptName:'', fy2026:0, fy2027:0, fy2028:0 }); setEditingHcId(null); }}
                      style={{ background: NAVY, color: 'white', border: 'none', borderRadius: 4, padding: '4px 14px', cursor: 'pointer', fontSize: 12 }}>+ Add Department</button>
                    <button onClick={() => { setHcSearch(''); setHcColFilter({}); loadAdminHeadcount(); }}
                      style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {[{h:'Dept Code',k:'deptCode'},{h:'Short Code',k:'shortCode'},{h:'Department',k:'deptName'}].map(({h,k})=>(
                          <th key={k} style={{ padding: '7px 14px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            <div>{h}</div>
                            <select value={hcColFilter[k]||''} onChange={e=>setHcColFilter(f=>({...f,[k]:e.target.value}))}
                              style={{ width:'100%', marginTop:3, fontSize:9, padding:'1px 2px', cursor:'pointer',
                                border:'1px solid rgba(255,255,255,.3)', borderRadius:2,
                                background: hcColFilter[k] ? CYAN : 'rgba(255,255,255,.12)', color:'white' }}>
                              <option value="" style={{background:'#1a3a5c'}}>All</option>
                              {colUniq(adminHeadcount,k).map(v=><option key={v} value={v} style={{background:'#1a3a5c'}}>{v}</option>)}
                            </select>
                          </th>
                        ))}
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
                      {applyFilters(adminHeadcount, hcSearch, hcColFilter).map((r, i) => {
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
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                    User Based Listing ({applyFilters(adminUserList,ulSearch,ulColFilter).length} of {adminUserList.length} rows)
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input placeholder="Search all columns…" value={ulSearch} onChange={e => setUlSearch(e.target.value)}
                      style={{ border: `1px solid ${CYAN}`, borderRadius: 4, padding: '4px 10px', fontSize: 11, width: 200, outline: 'none' }} />
                    <button onClick={() => { setUlSearch(''); setUlColFilter({}); loadAdminUserList(); }}
                      style={{ background: 'none', border: `1px solid ${CYAN}`, color: CYAN, borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>↻ Refresh</button>
                    <button onClick={() => exportToExcel(`${API_URL}/admin/user-listing/export`, 'user_listing.xlsx')}
                      style={{ background: NAVY, border: 'none', color: 'white', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>⬇ Download</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: NAVY, color: 'white' }}>
                        {[
                          {h:'Branch Name', k:'branchName'}, {h:'Branch Code', k:'branchCode'},
                          {h:'PID', k:'pid'}, {h:'Description', k:'description'},
                          {h:'CEO',k:null},{h:'Legal',k:null},{h:'Corp Ops',k:null},{h:'HR',k:null},
                          {h:'Audit',k:null},{h:'CD&O',k:null},{h:'Finance',k:null},{h:'Tech',k:null},
                          {h:'IO',k:null},{h:'IRR',k:null},{h:'PE',k:null},{h:'CM&CI',k:null},{h:'ISR',k:null},
                          {h:'',k:null},
                        ].map(({h, k}, i) => (
                          <th key={i} style={{ padding: '7px 10px', textAlign: i >= 4 && i <= 16 ? 'right' : 'left', fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                            <div>{h}</div>
                            {k && (
                              <select value={ulColFilter[k]||''} onChange={e=>setUlColFilter(f=>({...f,[k]:e.target.value}))}
                                style={{ width:'100%', marginTop:3, fontSize:9, padding:'1px 2px', cursor:'pointer',
                                  border:'1px solid rgba(255,255,255,.3)', borderRadius:2,
                                  background: ulColFilter[k] ? CYAN : 'rgba(255,255,255,.12)', color:'white' }}>
                                <option value="" style={{background:'#1a3a5c'}}>All</option>
                                {colUniq(adminUserList, k).map(v=><option key={v} value={v} style={{background:'#1a3a5c'}}>{v}</option>)}
                              </select>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {applyFilters(adminUserList, ulSearch, ulColFilter).map((r, i) => {
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

            {/* ── Share sub-tab ──────────────────────────────────────────── */}
            {adminTab === 'share' && (() => {
              const DEPT_OPTIONS = DEPTS.map(d => ({ key: d.key, label: d.label }));
              const SCHED_OPTIONS = [
                { value: 'manual',    label: 'Manual' },
                { value: 'monthly',   label: 'Monthly' },
                { value: 'quarterly', label: 'Quarterly' },
              ];

              const updateCfg = async (id, patch) => {
                const res = await fetch(`${API_URL}/admin/share/${id}`, {
                  method: 'PUT', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(patch),
                });
                if (res.ok) {
                  const updated = await res.json();
                  setShareConfigs(prev => prev.map(c => c.id === id ? updated : c));
                }
              };

              const addRow = async () => {
                const res = await fetch(`${API_URL}/admin/share`, {
                  method: 'POST', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ department: 'finance', emails: [], schedule: 'manual', period: 'actuals' }),
                });
                if (res.ok) { const cfg = await res.json(); setShareConfigs(prev => [...prev, cfg]); }
              };

              const deleteRow = async (id) => {
                await fetch(`${API_URL}/admin/share/${id}`, { method: 'DELETE', credentials: 'include' });
                setShareConfigs(prev => prev.filter(c => c.id !== id));
              };

              const sendNow = async (id) => {
                setShareStatus(s => ({ ...s, [id]: 'sending' }));
                const res = await fetch(`${API_URL}/admin/share/${id}/send`, {
                  method: 'POST', credentials: 'include',
                });
                if (res.ok) {
                  const d = await res.json();
                  setShareStatus(s => ({ ...s, [id]: `ok:${d.recipients}` }));
                } else {
                  const e = await res.json().catch(() => ({}));
                  setShareStatus(s => ({ ...s, [id]: `err:${e.detail || res.status}` }));
                }
                setTimeout(() => setShareStatus(s => { const n = {...s}; delete n[id]; return n; }), 5000);
              };

              const downloadPdf = async (id, dept) => {
                const res = await fetch(`${API_URL}/admin/share/${id}/pdf`, { credentials: 'include' });
                if (!res.ok) return;
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `showback_${dept}.pdf`; a.click();
                URL.revokeObjectURL(url);
              };

              const inputStyle = { border: '1px solid #D0D0D0', borderRadius: 4, padding: '4px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box' };
              const selectStyle = { ...inputStyle, background: 'white' };

              return (
                <div style={card({ overflow: 'hidden' })}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Share Reports</span>
                    <button onClick={addRow}
                      style={{ background: NAVY, border: 'none', color: 'white', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 12 }}>
                      + Add Row
                    </button>
                  </div>
                  {shareConfigs.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#696F79', fontSize: 13 }}>
                      No share configs yet. Click <strong>+ Add Row</strong> to create one.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: NAVY, color: 'white' }}>
                            {['Department', 'Emails (space or . separated)', 'Period', 'Schedule', 'Last Sent', 'Actions'].map(h => (
                              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shareConfigs.map((cfg, ri) => {
                            const status = shareStatus[cfg.id];
                            return (
                              <tr key={cfg.id} style={{ background: ri % 2 === 0 ? 'white' : '#F8F9FA', borderBottom: '1px solid #EEE' }}>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                  <select value={cfg.department} onChange={e => updateCfg(cfg.id, { department: e.target.value })} style={{ ...selectStyle, width: 130 }}>
                                    {DEPT_OPTIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top', minWidth: 260 }}>
                                  <textarea
                                    defaultValue={(cfg.emails || []).join(' ')}
                                    placeholder="email@bci.ca  email2@bci.ca"
                                    rows={2}
                                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
                                    onBlur={e => {
                                      const emails = e.target.value.split(/[\s.,;]+/).map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
                                      updateCfg(cfg.id, { emails });
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                  <select value={cfg.period} onChange={e => updateCfg(cfg.id, { period: e.target.value })} style={{ ...selectStyle, width: 140 }}>
                                    {dynamicPeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                  </select>
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                  <select value={cfg.schedule} onChange={e => updateCfg(cfg.id, { schedule: e.target.value })} style={{ ...selectStyle, width: 110 }}>
                                    {SCHED_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                  </select>
                                  {cfg.nextRun && (
                                    <div style={{ fontSize: 10, color: '#696F79', marginTop: 2 }}>Next: {new Date(cfg.nextRun).toLocaleDateString()}</div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap', color: '#696F79' }}>
                                  {cfg.lastSent ? new Date(cfg.lastSent).toLocaleDateString() : 'Never'}
                                </td>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button title="Download PDF preview" onClick={() => downloadPdf(cfg.id, cfg.department)}
                                      style={{ background: 'none', border: `1px solid ${NAVY}`, color: NAVY, borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>
                                      ⬇ PDF
                                    </button>
                                    <button title="Send email now" onClick={() => sendNow(cfg.id)} disabled={status === 'sending'}
                                      style={{ background: CYAN, border: 'none', color: 'white', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, opacity: status === 'sending' ? 0.6 : 1 }}>
                                      {status === 'sending' ? '…' : '✉ Send'}
                                    </button>
                                    <button title="Delete row" onClick={() => deleteRow(cfg.id)}
                                      style={{ background: 'none', border: '1px solid #EF9A9A', color: '#C62828', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12 }}>
                                      🗑
                                    </button>
                                  </div>
                                  {status && status !== 'sending' && (
                                    <div style={{ fontSize: 11, marginTop: 4, color: status.startsWith('ok') ? '#388E3C' : '#C62828' }}>
                                      {status.startsWith('ok') ? `✓ Sent to ${status.split(':')[1]} recipient(s)` : `✗ ${status.slice(4)}`}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #EEE', fontSize: 11, color: '#696F79' }}>
                    Emails sent via Microsoft 365 SMTP. Configure SMTP_USER, SMTP_PASSWORD, SMTP_FROM in the server .env file.
                  </div>
                </div>
              );
            })()}

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

      {/* ── Hero drilldown modal ─────────────────────────────────────────── */}
      {heroModal && (
        <div
          onClick={() => setHeroModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,18,40,.65)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 700, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,.35)' }}
          >
            {/* Header */}
            <div style={{ background: NAVY, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', marginBottom: 5 }}>{heroModal.section}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>{heroModal.title}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.6)' }}>{heroModal.note}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginBottom: 3 }}>{heroModal.rows.filter(r => Math.round((heroModal.rowAmt || (r => r[heroModal.amtKey || period] || 0))(r)) !== 0).length} line items</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: CYAN, letterSpacing: '-0.5px' }}>{cad(heroModal.total)}</div>
                </div>
                <button
                  onClick={() => setHeroModal(null)}
                  style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.2)', color: 'white', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >✕</button>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#F5F7FA', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: NAVY, fontWeight: 700, fontSize: 11 }}>Description</th>
                    <th style={{ padding: '10px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, fontSize: 11 }}>Branch</th>
                    <th style={{ padding: '10px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, fontSize: 11 }}>GL Code</th>
                    <th style={{ padding: '10px 10px', textAlign: 'left', color: NAVY, fontWeight: 700, fontSize: 11 }}>Showback Type</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', color: NAVY, fontWeight: 700, fontSize: 11 }}>{heroModal.colHeader || 'Actuals'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const getAmt = heroModal.rowAmt || (r => r[heroModal.amtKey || period] || 0);
                    const visibleRows = [...heroModal.rows].filter(r => Math.round(getAmt(r)) !== 0).sort((a, b) => getAmt(b) - getAmt(a));
                    return visibleRows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#FAFBFC', borderBottom: '1px solid #F0F0F0' }}>
                        <td style={{ padding: '9px 16px', color: '#2C2C2C', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description || r.pid}>{r.description || r.pid || '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#515254', fontFamily: 'monospace', fontSize: 11 }}>{r.branchCode}</td>
                        <td style={{ padding: '9px 10px', color: '#515254', fontFamily: 'monospace', fontSize: 11 }}>{r.glCode}</td>
                        <td style={{ padding: '9px 10px', color: '#696F78', fontSize: 11 }}>{r.showbackType || '—'}</td>
                        <td style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 600, color: NAVY }}>{cad(getAmt(r))}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#EEF2F7', borderTop: '2px solid #D0DAE8' }}>
                    <td colSpan={4} style={{ padding: '11px 16px', fontWeight: 700, color: NAVY, fontSize: 12 }}>Total — {heroModal.rows.filter(r => Math.round((heroModal.rowAmt || (r => r[heroModal.amtKey || period] || 0))(r)) !== 0).length} items</td>
                    <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: NAVY, fontSize: 13 }}>{cad(heroModal.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Attribution */}
      <div style={{ textAlign: 'center', padding: '20px 0 12px' }}>
        <span style={{ fontSize: 11, color: '#B0BAC6', letterSpacing: 0.2 }}>
          Concept, design &amp; development — <span style={{ fontWeight: 600 }}>Marshall Singh</span>, BCI Finance
        </span>
      </div>

    </div>
  );
}
