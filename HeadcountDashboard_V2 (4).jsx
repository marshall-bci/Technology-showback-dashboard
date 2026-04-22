import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import { X, Trash2, FileSpreadsheet, TrendingUp, TrendingDown, Upload, Filter, ChevronLeft, ChevronRight, Sparkles, RefreshCw, Send, Maximize2, Lock, Unlock } from 'lucide-react';
import * as XLSX from 'xlsx';

const MONTHS_ORDER = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const BRAND_DARK = '#00365B';
const BRAND_CYAN = '#00ABBD';
const UPLOAD_PASSWORD = 'bci2026';

// Chart line colors
const CHART_LINE_ACTUAL = '#00365b';   // Navy - hero line
const CHART_LINE_BUDGET = '#808080';   // Gray - dashed line

export default function HeadcountDashboard() {
  const [monthlyData, setMonthlyData] = useState({});
  const [budgetData, setBudgetData] = useState({});
  const [priorDepartures, setPriorDepartures] = useState([]);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [selectedBranches, setSelectedBranches] = useState([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState(['Permanent', 'Early Talent Program']);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [fiscalYear, setFiscalYear] = useState('F2026');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [uploadStatus, setUploadStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  
  // Upload password protection
  const [uploadUnlocked, setUploadUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // AI Summary & Chat state
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = React.useRef(null);
  const modalChatEndRef = React.useRef(null);
  
  // Chart hover state for trend line depth effect
  const [hoveredLine, setHoveredLine] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const res = await window.storage.get('hc-monthly-data', true);
      if (res?.value) setMonthlyData(JSON.parse(res.value));
      const budRes = await window.storage.get('hc-budget-data', true);
      if (budRes?.value) setBudgetData(JSON.parse(budRes.value));
      const priorDepRes = await window.storage.get('hc-prior-departures', true);
      if (priorDepRes?.value) setPriorDepartures(JSON.parse(priorDepRes.value));
    } catch (e) { console.log('No existing data'); }
    setLoading(false);
  };

  const saveData = async (key, data) => {
    try { await window.storage.set(key, JSON.stringify(data), true); } 
    catch (e) { console.error('Save failed'); }
  };

  const extractMonthFromFilename = (filename) => {
    const name = filename.toLowerCase().replace(/\.[^/.]+$/, '');
    const fyMatch = name.match(/f(20\d{2})/i);
    if (fyMatch) return { type: 'fiscal', year: `F${fyMatch[1]}` };
    for (const month of MONTHS_ORDER) {
      if (name.includes(month.toLowerCase())) return { type: 'month', month };
    }
    return null;
  };

  const handleExcelUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    let successCount = 0;
    let errorFiles = [];
    let newMonthlyData = { ...monthlyData };
    let processedCount = 0;
    
    const processFile = (file) => {
      return new Promise((resolve) => {
        const parsed = extractMonthFromFilename(file.name);
        if (!parsed) {
          errorFiles.push(file.name);
          resolve();
          return;
        }
        
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
            const headers = jsonData[1].map(h => String(h).trim());
            const rows = jsonData.slice(2).filter(r => r.some(c => c !== ''));
            const employees = rows.map((row, i) => {
              const obj = {};
              headers.forEach((h, idx) => {
                const key = h.toLowerCase().replace(/\s+/g, '_').replace(/\?/g, '');
                let value = row[idx];
                if (value instanceof Date) {
                  value = value.toISOString().split('T')[0];
                }
                obj[key] = value;
              });
              return { id: `emp-${Date.now()}-${i}`, ...obj };
            });
            const dataKey = parsed.type === 'fiscal' ? parsed.year : parsed.month;
            newMonthlyData[dataKey] = employees;
            successCount++;
          } catch (err) {
            errorFiles.push(file.name);
          }
          resolve();
        };
        reader.onerror = () => {
          errorFiles.push(file.name);
          resolve();
        };
        reader.readAsArrayBuffer(file);
      });
    };
    
    // Process all files
    Promise.all(files.map(processFile)).then(() => {
      if (successCount > 0) {
        setMonthlyData(newMonthlyData);
        saveData('hc-monthly-data', newMonthlyData);
      }
      
      let statusMsg = '';
      if (successCount > 0) {
        statusMsg = `✓ Loaded ${successCount} file${successCount > 1 ? 's' : ''} successfully`;
      }
      if (errorFiles.length > 0) {
        statusMsg += `${statusMsg ? '. ' : ''}❌ Failed: ${errorFiles.join(', ')}`;
      }
      setUploadStatus(statusMsg);
      setTimeout(() => setUploadStatus(''), 4000);
    });
    
    e.target.value = '';
  };

  const handleBudgetUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const headers = jsonData[1].map(h => String(h).trim());
        const rows = jsonData.slice(2).filter(r => r.some(c => c !== ''));
        const deptColIndex = 9, branchCodeColIndex = 11, branchColIndex = 12, periodColIndex = 20, countColIndex = 21;
        if (headers.length <= countColIndex) {
          setUploadStatus(`❌ File doesn't have enough columns (needs at least ${countColIndex + 1} columns, has ${headers.length})`);
          return;
        }
        const budgetRows = rows.map((row, i) => {
          const obj = {};
          headers.forEach((h, idx) => {
            const key = h.toLowerCase().replace(/\s+/g, '_').replace(/\?/g, '');
            obj[key] = row[idx];
          });
          obj.department = String(row[deptColIndex] || '').trim();
          obj.branch_code = String(row[branchCodeColIndex] || '').trim();
          obj.branch = String(row[branchColIndex] || '').trim();
          obj.period = String(row[periodColIndex] || '').trim();
          const countValue = row[countColIndex];
          const parsedCount = parseFloat(countValue);
          obj.budget_count = !isNaN(parsedCount) ? parsedCount : 0;
          return { id: `budget-${Date.now()}-${i}`, ...obj };
        });
        const groupedByPeriod = {};
        budgetRows.forEach(row => {
          const period = row.period;
          if (period) {
            if (!groupedByPeriod[period]) groupedByPeriod[period] = [];
            groupedByPeriod[period].push(row);
          }
        });
        const periods = Object.keys(groupedByPeriod);
        const totalBudget = budgetRows.reduce((sum, row) => sum + row.budget_count, 0);
        const newData = { ...budgetData, ...groupedByPeriod };
        setBudgetData(newData);
        saveData('hc-budget-data', newData);
        setUploadStatus(`✓ Loaded budget: ${totalBudget.toFixed(1)} FTE across ${periods.length} periods (${periods.join(', ')})`);
        setTimeout(() => setUploadStatus(''), 4000);
      } catch (err) {
        setUploadStatus(`❌ Error: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handlePriorDeparturesUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const headers = jsonData[0].map(h => String(h).trim());
        const rows = jsonData.slice(1).filter(r => r.some(c => c !== ''));
        const departures = rows.map((row, i) => {
          const obj = {};
          headers.forEach((h, idx) => {
            const key = h.toLowerCase().replace(/\s+/g, '_').replace(/\?/g, '');
            obj[key] = String(row[idx] || '').trim();
          });
          obj.employee_id = obj.employee_id || obj.employee_number || obj.emp_id || '';
          obj.name = obj.name || '';
          obj.department = obj.department || '';
          obj.branch = obj.branch || '';
          obj.reason = obj.reason_to_leave || obj.reason || '';
          return obj;
        }).filter(d => d.name || d.employee_id);
        
        setPriorDepartures(departures);
        saveData('hc-prior-departures', departures);
        setUploadStatus(`✓ Loaded ${departures.length} prior year departure records`);
        setTimeout(() => setUploadStatus(''), 4000);
      } catch (err) {
        setUploadStatus(`❌ Error: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const clearAllData = async () => {
    setMonthlyData({});
    setBudgetData({});
    setPriorDepartures([]);
    await window.storage.delete('hc-monthly-data', true);
    await window.storage.delete('hc-budget-data', true);
    await window.storage.delete('hc-prior-departures', true);
    setUploadStatus('✓ All data cleared');
    setTimeout(() => setUploadStatus(''), 2000);
  };

  const deleteMonthData = async (key) => {
    const newData = { ...monthlyData };
    delete newData[key];
    setMonthlyData(newData);
    await saveData('hc-monthly-data', newData);
    setUploadStatus(`✓ Deleted ${key} data`);
    setTimeout(() => setUploadStatus(''), 2000);
  };

  const deleteBudgetData = async (key) => {
    const newData = { ...budgetData };
    delete newData[key];
    setBudgetData(newData);
    await saveData('hc-budget-data', newData);
    setUploadStatus(`✓ Deleted ${key} budget data`);
    setTimeout(() => setUploadStatus(''), 2000);
  };

  // Generate debug Excel with data inconsistencies
  const generateDebugReport = () => {
    if (Object.keys(monthlyData).length < 2) {
      setUploadStatus('⚠️ Need at least 2 months of data to check for inconsistencies');
      setTimeout(() => setUploadStatus(''), 3000);
      return;
    }

    // Collect all employee data across months
    const employeeNamesByMonth = {}; // { employeeId: { name: string, months: string[] }[] }
    const branchNamesByMonth = {};   // { branchCode: { name: string, months: string[] }[] }

    Object.entries(monthlyData).forEach(([month, employees]) => {
      employees.forEach(emp => {
        // Check employee names
        const empId = String(emp.employee_id || emp['Employee ID'] || emp['employee_id'] || '').trim();
        const empName = String(emp.name || emp['Name'] || '').trim();
        
        if (empId && empName) {
          if (!employeeNamesByMonth[empId]) {
            employeeNamesByMonth[empId] = [];
          }
          // Check if this name variation already exists
          const existingVariation = employeeNamesByMonth[empId].find(v => v.name === empName);
          if (existingVariation) {
            if (!existingVariation.months.includes(month)) {
              existingVariation.months.push(month);
            }
          } else {
            employeeNamesByMonth[empId].push({ name: empName, months: [month] });
          }
        }

        // Check branch names
        const branchCode = String(emp.branch_code || emp['Branch Code'] || emp['branch_co'] || '').trim();
        const branchName = String(emp.branch || emp['Branch'] || '').trim();
        
        if (branchCode && branchName) {
          if (!branchNamesByMonth[branchCode]) {
            branchNamesByMonth[branchCode] = [];
          }
          const existingBranchVariation = branchNamesByMonth[branchCode].find(v => v.name === branchName);
          if (existingBranchVariation) {
            if (!existingBranchVariation.months.includes(month)) {
              existingBranchVariation.months.push(month);
            }
          } else {
            branchNamesByMonth[branchCode].push({ name: branchName, months: [month] });
          }
        }
      });
    });

    // Find inconsistencies (where same ID has multiple name variations)
    const employeeMismatches = Object.entries(employeeNamesByMonth)
      .filter(([id, variations]) => variations.length > 1)
      .map(([id, variations]) => ({ id, variations }));

    const branchMismatches = Object.entries(branchNamesByMonth)
      .filter(([code, variations]) => variations.length > 1)
      .map(([code, variations]) => ({ code, variations }));

    if (employeeMismatches.length === 0 && branchMismatches.length === 0) {
      setUploadStatus('✓ No inconsistencies found! All employee names and branch names are consistent across months.');
      setTimeout(() => setUploadStatus(''), 4000);
      return;
    }

    // Create Excel workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Employee Name Mismatches
    if (employeeMismatches.length > 0) {
      const empData = [['Employee ID', 'Variation 1', 'Months', 'Variation 2', 'Months', 'Variation 3', 'Months']];
      employeeMismatches.forEach(({ id, variations }) => {
        const row = [id];
        variations.forEach(v => {
          row.push(v.name, v.months.join(', '));
        });
        empData.push(row);
      });
      const empSheet = XLSX.utils.aoa_to_sheet(empData);
      // Set column widths
      empSheet['!cols'] = [
        { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }, { wch: 25 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, empSheet, 'Employee Name Mismatches');
    }

    // Sheet 2: Branch Name Mismatches
    if (branchMismatches.length > 0) {
      const branchData = [['Branch Code', 'Variation 1', 'Months', 'Variation 2', 'Months', 'Variation 3', 'Months']];
      branchMismatches.forEach(({ code, variations }) => {
        const row = [code];
        variations.forEach(v => {
          row.push(v.name, v.months.join(', '));
        });
        branchData.push(row);
      });
      const branchSheet = XLSX.utils.aoa_to_sheet(branchData);
      branchSheet['!cols'] = [
        { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 20 }
      ];
      XLSX.utils.book_append_sheet(wb, branchSheet, 'Branch Name Mismatches');
    }

    // Sheet 3: Summary
    const summaryData = [
      ['Data Consistency Report'],
      [''],
      ['Generated', new Date().toLocaleString()],
      ['Months Analyzed', Object.keys(monthlyData).join(', ')],
      [''],
      ['Employee Name Mismatches', employeeMismatches.length],
      ['Branch Name Mismatches', branchMismatches.length],
      [''],
      ['Instructions:'],
      ['1. Review the mismatches in each sheet'],
      ['2. Decide which name variation is correct'],
      ['3. Update your source Excel files to use consistent names'],
      ['4. Re-upload the corrected files']
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Download the file
    XLSX.writeFile(wb, `Data_Consistency_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    setUploadStatus(`✓ Debug report generated: ${employeeMismatches.length} employee + ${branchMismatches.length} branch inconsistencies found`);
    setTimeout(() => setUploadStatus(''), 5000);
  };

  const categorizeJobType = (employee) => {
    const jobType = employee.job_type || employee['Job Type'] || employee.job_typ || '';
    const earlyTalent = employee.early_talent_program || employee['Early Talent Program'] || employee.early_talent || '';
    if (!jobType) return 'Permanent';
    const jt = jobType.toLowerCase();
    if (jt.includes('co-op') || jt.includes('intern')) return 'Co-op';
    if ((jt.includes('fixed term') || jt.includes('temporary')) && String(earlyTalent).trim().toLowerCase() === 'yes') return 'Early Talent Program';
    if (jt.includes('fixed term') || jt.includes('temporary')) return 'Fixed Term';
    return 'Permanent';
  };

  const getFilteredEmployees = (employees, isBudget = false) => {
    if (!employees) return [];
    return employees.filter(e => {
      if (selectedDepts.length) {
        const empDept = (e.department || e.Department || e.dept || '').trim();
        const deptMatch = selectedDepts.some(d => d.toLowerCase() === empDept.toLowerCase() || d === empDept);
        if (!deptMatch) return false;
      }
      if (selectedBranches.length) {
        const empBranch = (e.branch || e.Branch || e.branch_co || e['Branch Co'] || '').trim();
        const branchMatch = selectedBranches.some(b => b.toLowerCase() === empBranch.toLowerCase() || b === empBranch);
        if (!branchMatch) return false;
      }
      if (selectedJobTypes.length && !isBudget) {
        if (!selectedJobTypes.includes(categorizeJobType(e))) return false;
      }
      return true;
    });
  };

  // Filter employees by dept/branch only (no job type filter) - for breakdown columns
  const getFilteredEmployeesNoJobType = (employees) => {
    if (!employees) return [];
    return employees.filter(e => {
      if (selectedDepts.length) {
        const empDept = (e.department || e.Department || e.dept || '').trim();
        const deptMatch = selectedDepts.some(d => d.toLowerCase() === empDept.toLowerCase() || d === empDept);
        if (!deptMatch) return false;
      }
      if (selectedBranches.length) {
        const empBranch = (e.branch || e.Branch || e.branch_co || e['Branch Co'] || '').trim();
        const branchMatch = selectedBranches.some(b => b.toLowerCase() === empBranch.toLowerCase() || b === empBranch);
        if (!branchMatch) return false;
      }
      return true;
    });
  };

  const allEmployees = Object.values(monthlyData).flat();
  const departments = [...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort();
  const branches = [...new Set(
    allEmployees
      .filter(e => selectedDepts.length === 0 || selectedDepts.includes(e.department))
      .map(e => e.branch)
      .filter(Boolean)
  )].sort();

  useEffect(() => {
    if (selectedBranches.length > 0) {
      const validBranches = selectedBranches.filter(b => branches.includes(b));
      if (validBranches.length !== selectedBranches.length) setSelectedBranches(validBranches);
    }
  }, [selectedDepts]);

  const toggleFilter = (val, selected, setSelected) => {
    setSelected(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const getEmpId = (e) => String(e.employee_id || '').trim();

  const getMonthStats = () => {
    const stats = [];
    const currentFYNum = parseInt(fiscalYear.replace('F', ''));
    const prevFY = `F${currentFYNum - 1}`;
    
    if (monthlyData[prevFY]) {
      const data = monthlyData[prevFY];
      const filteredEmps = getFilteredEmployees(data); // For Actual FTE (respects job type filter)
      const allEmps = getFilteredEmployeesNoJobType(data); // For breakdown columns (no job type filter)
      
      // Breakdown columns - always unfiltered by job type
      const permanent = allEmps.filter(e => categorizeJobType(e) === 'Permanent').length;
      const fixedTerm = allEmps.filter(e => categorizeJobType(e) === 'Fixed Term').length;
      const coop = allEmps.filter(e => categorizeJobType(e) === 'Co-op').length;
      const earlyTalent = allEmps.filter(e => categorizeJobType(e) === 'Early Talent Program').length;
      const onLeave = allEmps.filter(e => (e.on_leave || '').toLowerCase() === 'yes').length;
      
      let budgetFTE = null;
      if (budgetData[prevFY]) {
        const budgetEmps = getFilteredEmployees(budgetData[prevFY], true);
        budgetFTE = budgetEmps.reduce((sum, e) => sum + (parseFloat(e.budget_count) || 0), 0);
      }
      stats.push({
        month: prevFY, isPrevFY: true, hasData: true, newHire: null, departure: null,
        actualFTE: filteredEmps.length, budgetFTE: null, permanent, temporary: fixedTerm, coop, earlyTalent, onLeave,
        netChange: null, changeFromPrevious: null
      });
    }
    
    MONTHS_ORDER.forEach((month, idx) => {
      const data = monthlyData[month];
      const hasData = data && data.length > 0;
      
      // Calculate budget for ALL months (even without actual data)
      // Try multiple possible keys since budget periods might be formatted differently
      let budgetFTE = null;
      const budgetKeys = Object.keys(budgetData);
      
      // Try exact month name match first
      if (budgetData[month]) {
        const budgetEmps = getFilteredEmployees(budgetData[month], true);
        budgetFTE = Math.round(budgetEmps.reduce((sum, e) => sum + (e.budget_count || 0), 0) * 10) / 10;
      } 
      // Try fiscal year key
      else if (budgetData[fiscalYear]) {
        const budgetEmps = getFilteredEmployees(budgetData[fiscalYear], true);
        budgetFTE = Math.round(budgetEmps.reduce((sum, e) => sum + (e.budget_count || 0), 0) * 10) / 10;
      }
      // Try previous fiscal year key
      else if (budgetData[prevFY]) {
        const budgetEmps = getFilteredEmployees(budgetData[prevFY], true);
        budgetFTE = Math.round(budgetEmps.reduce((sum, e) => sum + (e.budget_count || 0), 0) * 10) / 10;
      }
      // Try to find a matching period key (case-insensitive, partial match)
      else {
        const monthLower = month.toLowerCase();
        const matchingKey = budgetKeys.find(k => {
          const keyLower = k.toLowerCase();
          return keyLower.includes(monthLower) || monthLower.includes(keyLower.substring(0, 3));
        });
        if (matchingKey) {
          const budgetEmps = getFilteredEmployees(budgetData[matchingKey], true);
          budgetFTE = Math.round(budgetEmps.reduce((sum, e) => sum + (e.budget_count || 0), 0) * 10) / 10;
        }
      }
      
      // Debug logging for budget issues
      if (hasData && budgetFTE === null && budgetKeys.length > 0) {
        console.log(`Budget lookup failed for month "${month}". Available keys:`, budgetKeys);
      }
      
      if (!hasData) {
        // No actual data - still show budget
        stats.push({ month, hasData: false, newHire: null, departure: null, actualFTE: null, budgetFTE, permanent: null, temporary: null, coop: null, earlyTalent: null, onLeave: null, netChange: null, changeFromPrevious: null });
        return;
      }
      
      const filteredEmps = getFilteredEmployees(data); // For Actual FTE, New Hire, Departure (respects job type filter)
      const allEmps = getFilteredEmployeesNoJobType(data); // For breakdown columns (no job type filter)
      
      // Filtered comparison for New Hire/Departure/Net Change
      let prevEmps = [];
      let comparisonPeriod = '';
      if (idx === 0) {
        const prevFYData = monthlyData[prevFY];
        if (prevFYData) { prevEmps = getFilteredEmployees(prevFYData); comparisonPeriod = prevFY; }
      } else {
        const prevMonth = MONTHS_ORDER[idx - 1];
        const prevData = monthlyData[prevMonth];
        if (prevData) { prevEmps = getFilteredEmployees(prevData); comparisonPeriod = prevMonth; }
      }
      
      const currentIds = new Set(filteredEmps.map(getEmpId));
      const prevIds = new Set(prevEmps.map(getEmpId));
      const newHires = prevEmps.length > 0 ? filteredEmps.filter(e => !prevIds.has(getEmpId(e))).length : 0;
      const departures = prevEmps.length > 0 ? prevEmps.filter(e => !currentIds.has(getEmpId(e))).length : 0;
      const actualFTE = filteredEmps.length;
      const netChange = newHires - departures;
      const changeFromPrevious = prevEmps.length > 0 ? actualFTE - prevEmps.length : 0;
      
      // Breakdown columns - always unfiltered by job type
      const permanent = allEmps.filter(e => categorizeJobType(e) === 'Permanent').length;
      const fixedTerm = allEmps.filter(e => categorizeJobType(e) === 'Fixed Term').length;
      const coop = allEmps.filter(e => categorizeJobType(e) === 'Co-op').length;
      const earlyTalent = allEmps.filter(e => categorizeJobType(e) === 'Early Talent Program').length;
      const onLeave = allEmps.filter(e => (e.on_leave || '').toLowerCase() === 'yes').length;
      
      stats.push({ month, hasData: true, newHire: newHires, departure: departures, actualFTE, budgetFTE, permanent, temporary: fixedTerm, coop, earlyTalent, onLeave, netChange, changeFromPrevious, comparisonPeriod });
    });
    return stats;
  };

  const getMovementDetails = () => {
    const joiners = [], leavers = [], internalMoves = [], onLeaveEmployees = [], jobTypeConversions = [];
    const currentFYNum = parseInt(fiscalYear.replace('F', ''));
    const prevFY = `F${currentFYNum - 1}`;

    MONTHS_ORDER.forEach((month, idx) => {
      const data = monthlyData[month];
      if (!data) return;

      data.forEach(e => {
        if ((e.on_leave || '').toLowerCase() === 'yes') {
          if (selectedDepts.length && !selectedDepts.includes(e.department)) return;
          if (selectedBranches.length && !selectedBranches.includes(e.branch)) return;
          if (selectedJobTypes.length && !selectedJobTypes.includes(categorizeJobType(e))) return;
          onLeaveEmployees.push({ name: e.name, month, department: e.department, branch: e.branch, employee_id: e.employee_id, jobType: categorizeJobType(e), position: e.formatted_position || e.position || '-' });
        }
      });

      let prevData = null;
      if (idx === 0) prevData = monthlyData[prevFY];
      else { const prevMonth = MONTHS_ORDER[idx - 1]; prevData = monthlyData[prevMonth]; }
      if (!prevData) return;

      const allCurrent = data;
      const allPrev = prevData;
      const prevMap = new Map(allPrev.map(e => [getEmpId(e), e]));
      const allCurrentIds = new Set(allCurrent.map(getEmpId));
      const allPrevIds = new Set(allPrev.map(getEmpId));
      const movedIds = new Set();
      const jobTypeChangedIds = new Set();
      
      allCurrent.forEach(e => {
        const empId = getEmpId(e);
        const prevEmp = prevMap.get(empId);
        if (prevEmp) {
          const currentJobType = categorizeJobType(e);
          const prevJobType = categorizeJobType(prevEmp);
          if (currentJobType !== prevJobType) {
            jobTypeChangedIds.add(empId);
            const matchesFilter = (emp) => {
              if (selectedDepts.length && !selectedDepts.includes(emp.department)) return false;
              if (selectedBranches.length && !selectedBranches.includes(emp.branch)) return false;
              if (selectedJobTypes.length && !selectedJobTypes.includes(categorizeJobType(emp))) return false;
              return true;
            };
            if (matchesFilter(e) || matchesFilter(prevEmp)) {
              jobTypeConversions.push({ name: e.name, month, employee_id: e.employee_id, fromJobType: prevJobType, toJobType: currentJobType, department: e.department, branch: e.branch });
            }
          } else if (prevEmp.department !== e.department || prevEmp.branch !== e.branch) {
            movedIds.add(empId);
            const matchesFilter = (emp) => {
              if (selectedDepts.length && !selectedDepts.includes(emp.department)) return false;
              if (selectedBranches.length && !selectedBranches.includes(emp.branch)) return false;
              if (selectedJobTypes.length && !selectedJobTypes.includes(categorizeJobType(emp))) return false;
              return true;
            };
            if (matchesFilter(e) || matchesFilter(prevEmp)) {
              internalMoves.push({ name: e.name, month, employee_id: e.employee_id, jobType: categorizeJobType(e), fromDepartment: prevEmp.department, fromBranch: prevEmp.branch, toDepartment: e.department, toBranch: e.branch });
            }
          }
        }
      });

      allCurrent.forEach(e => {
        const empId = getEmpId(e);
        if (!allPrevIds.has(empId) && !movedIds.has(empId) && !jobTypeChangedIds.has(empId)) {
          if (selectedDepts.length && !selectedDepts.includes(e.department)) return;
          if (selectedBranches.length && !selectedBranches.includes(e.branch)) return;
          if (selectedJobTypes.length && !selectedJobTypes.includes(categorizeJobType(e))) return;
          joiners.push({ name: e.name, month, department: e.department, branch: e.branch, employee_id: e.employee_id, jobType: categorizeJobType(e) });
        }
      });

      allPrev.forEach(e => {
        const empId = getEmpId(e);
        if (!allCurrentIds.has(empId) && !movedIds.has(empId) && !jobTypeChangedIds.has(empId)) {
          if (selectedDepts.length && !selectedDepts.includes(e.department)) return;
          if (selectedBranches.length && !selectedBranches.includes(e.branch)) return;
          if (selectedJobTypes.length && !selectedJobTypes.includes(categorizeJobType(e))) return;
          // Departure attributed to current month (the month when absence is first detected)
          leavers.push({ name: e.name, month, department: e.department, branch: e.branch, employee_id: e.employee_id, jobType: categorizeJobType(e) });
        }
      });
    });

    return { joiners, leavers, internalMoves, onLeaveEmployees, jobTypeConversions };
  };

  // Generate dashboard context for AI summary
  const getDashboardContext = (forChat = false) => {
    const stats = getMonthStats();
    const { joiners, leavers, internalMoves, onLeaveEmployees, jobTypeConversions } = getMovementDetails();
    const currentMonth = selectedMonth || loadedMonths[loadedMonths.length - 1];
    const currentStats = stats.find(s => s.month === currentMonth);
    const prevMonthIdx = currentMonth ? MONTHS_ORDER.indexOf(currentMonth) - 1 : -1;
    const prevMonth = prevMonthIdx >= 0 ? MONTHS_ORDER[prevMonthIdx] : null;
    const prevStats = prevMonth ? stats.find(s => s.month === prevMonth) : null;
    
    // Get employee details for current month
    const currentEmployees = getFilteredEmployees(monthlyData[currentMonth] || []);
    
    // Job type distribution
    const jobTypeDistribution = {};
    currentEmployees.forEach(e => {
      const jt = categorizeJobType(e);
      jobTypeDistribution[jt] = (jobTypeDistribution[jt] || 0) + 1;
    });
    
    // Department distribution
    const deptDistribution = {};
    currentEmployees.forEach(e => {
      if (e.department) deptDistribution[e.department] = (deptDistribution[e.department] || 0) + 1;
    });
    
    // Branch distribution
    const branchDistribution = {};
    currentEmployees.forEach(e => {
      if (e.branch) branchDistribution[e.branch] = (branchDistribution[e.branch] || 0) + 1;
    });
    
    // ALL joiners and leavers with full details
    const allJoiners = joiners.map(j => ({ name: j.name, month: j.month, department: j.department, branch: j.branch, jobType: j.jobType }));
    const allLeavers = leavers.map(l => ({ name: l.name, month: l.month, department: l.department, branch: l.branch, jobType: l.jobType }));
    
    // Current month joiners and leavers - filter by current month
    const currentMonthJoiners = joiners.filter(j => j.month === currentMonth);
    const currentMonthLeavers = leavers.filter(l => l.month === currentMonth);
    const prevMonthJoiners = prevMonth ? joiners.filter(j => j.month === prevMonth) : [];
    const prevMonthLeavers = prevMonth ? leavers.filter(l => l.month === prevMonth) : [];
    
    // Job type conversions for current month (e.g., Fixed Term → Permanent)
    const currentMonthConversions = jobTypeConversions.filter(c => c.month === currentMonth);
    
    // Filter conversions based on selected job types
    // If viewing Permanent: show conversions TO Permanent (people joining Permanent pool)
    // If viewing Fixed Term: show conversions TO Fixed Term AND FROM Fixed Term
    // If viewing Co-op: NO conversions IN (co-ops are always new hires), only conversions OUT (to FT or Permanent)
    let relevantConversionsIn = [];  // People converting INTO the selected job type
    let relevantConversionsOut = []; // People converting OUT OF the selected job type
    
    if (selectedJobTypes.length === 0) {
      // No filter - show all conversions
      relevantConversionsIn = currentMonthConversions;
    } else if (selectedJobTypes.includes('Permanent') || selectedJobTypes.includes('Early Talent Program')) {
      // Viewing Permanent/ETP - show conversions TO Permanent/ETP
      relevantConversionsIn = currentMonthConversions.filter(c => 
        c.toJobType === 'Permanent' || c.toJobType === 'Early Talent Program'
      );
    } else if (selectedJobTypes.includes('Fixed Term')) {
      // Viewing Fixed Term - show conversions TO and FROM Fixed Term
      relevantConversionsIn = currentMonthConversions.filter(c => c.toJobType === 'Fixed Term');
      relevantConversionsOut = currentMonthConversions.filter(c => c.fromJobType === 'Fixed Term');
    } else if (selectedJobTypes.includes('Co-op')) {
      // Viewing Co-op - NO conversions IN (co-ops are always hired fresh, never converted to)
      // Only show conversions OUT (co-ops converting to Fixed Term or Permanent)
      relevantConversionsIn = []; // Co-ops don't get converted TO, only hired
      relevantConversionsOut = currentMonthConversions.filter(c => c.fromJobType === 'Co-op');
    }
    
    // On leave employees - filter for current month
    const currentMonthOnLeave = onLeaveEmployees.filter(e => e.month === currentMonth);
    
    // Determine job type filter description and budget comparison logic
    let jobTypeDescription = '';
    let showBudgetVariance = false;
    
    if (selectedJobTypes.length === 0) {
      jobTypeDescription = 'all employees (including Fixed Term and Co-op)';
      showBudgetVariance = false;
    } else if (selectedJobTypes.includes('Permanent') && !selectedJobTypes.includes('Fixed Term') && !selectedJobTypes.includes('Co-op')) {
      if (selectedJobTypes.includes('Early Talent Program')) {
        jobTypeDescription = 'Permanent employees (including Early Talent Program)';
      } else {
        jobTypeDescription = 'Permanent employees';
      }
      showBudgetVariance = true;
    } else if (selectedJobTypes.length === 1 && selectedJobTypes[0] === 'Early Talent Program') {
      jobTypeDescription = 'Early Talent Program employees only';
      showBudgetVariance = false;
    } else if (selectedJobTypes.length === 1 && selectedJobTypes[0] === 'Fixed Term') {
      jobTypeDescription = 'Fixed Term employees only';
      showBudgetVariance = false;
    } else if (selectedJobTypes.length === 1 && selectedJobTypes[0] === 'Co-op') {
      jobTypeDescription = 'Co-op employees only';
      showBudgetVariance = false;
    } else {
      jobTypeDescription = `filtered by: ${selectedJobTypes.join(', ')}`;
      showBudgetVariance = false;
    }

    // Base context
    const baseContext = {
      fiscalYear,
      currentMonth,
      previousMonth: prevMonth,
      showBudgetVariance,
      jobTypeDescription,
      // IMPORTANT: Budget FTE only includes Permanent employees (not Fixed Term or Co-op)
      budgetContext: 'Budget FTE represents Permanent employee headcount only. It does not include Fixed Term, Co-op, or ETP employees.',
      // Use stats from monthStats (matches the table)
      currentStats: currentStats ? {
        actualFTE: currentStats.actualFTE,
        budgetFTE: currentStats.budgetFTE,
        permanent: currentStats.permanent,
        fixedTerm: currentStats.temporary,
        earlyTalentProgram: currentStats.earlyTalent,
        coop: currentStats.coop,
        newHires: currentStats.newHire,
        departures: currentStats.departure,
        netChange: currentStats.netChange,
        onLeave: currentStats.onLeave
      } : null,
      previousStats: prevStats ? {
        actualFTE: prevStats.actualFTE,
        permanent: prevStats.permanent,
        fixedTerm: prevStats.temporary,
        earlyTalentProgram: prevStats.earlyTalent,
        coop: prevStats.coop,
        newHires: prevStats.newHire,
        departures: prevStats.departure,
        onLeave: prevStats.onLeave
      } : null,
      // Names for current month
      currentMonthJoinerNames: currentMonthJoiners.map(j => j.name),
      currentMonthLeaverNames: currentMonthLeavers.map(l => l.name),
      // Conversions INTO selected job type (appear as additions)
      conversionsIn: relevantConversionsIn.map(c => ({ name: c.name, from: c.fromJobType, to: c.toJobType })),
      // Conversions OUT OF selected job type (appear as departures from this category)
      conversionsOut: relevantConversionsOut.map(c => ({ name: c.name, from: c.fromJobType, to: c.toJobType })),
      onLeaveNames: currentMonthOnLeave.map(e => e.name),
      // What job type is being viewed
      viewingJobType: selectedJobTypes.length === 1 ? selectedJobTypes[0] : (selectedJobTypes.length > 1 ? 'multiple' : 'all'),
      jobTypeDistribution,
      deptDistribution,
      branchDistribution,
      activeFilters: {
        departments: selectedDepts,
        branches: selectedBranches,
        jobTypes: selectedJobTypes
      },
      loadedMonths
    };

    // For chat, include more detailed data
    if (forChat) {
      const employeeRoster = currentEmployees.map(e => ({
        name: e.name,
        department: e.department,
        branch: e.branch,
        position: e.formatted_position || e.position || '',
        jobType: categorizeJobType(e),
        reportsTo: e.reports_to || '',
        onLeave: (e.on_leave || '').toLowerCase() === 'yes'
      }));

      const allMonthsData = {};
      loadedMonths.forEach(month => {
        const employees = getFilteredEmployees(monthlyData[month] || []);
        allMonthsData[month] = employees.map(e => ({
          name: e.name,
          department: e.department,
          branch: e.branch,
          position: e.formatted_position || e.position || '',
          jobType: categorizeJobType(e)
        }));
      });

      return {
        ...baseContext,
        allJoiners,
        allLeavers,
        onLeaveEmployees: onLeaveEmployees.map(e => ({ name: e.name, month: e.month, department: e.department, branch: e.branch, position: e.position })),
        employeeRoster,
        totalEmployees: employeeRoster.length,
        allMonthsData,
        monthlyTrend: stats.filter(s => s.hasData).map(s => ({
          month: s.month,
          actualFTE: s.actualFTE,
          budgetFTE: s.budgetFTE,
          permanent: s.permanent,
          fixedTerm: s.temporary,
          earlyTalentProgram: s.earlyTalent,
          coop: s.coop,
          newHires: s.newHire,
          departures: s.departure,
          netChange: s.netChange,
          onLeave: s.onLeave
        }))
      };
    }

    return baseContext;
  };

  // Generate AI summary
  const generateSummary = async () => {
    setSummaryLoading(true);
    const context = getDashboardContext(false);
    
    // Get departure names from previous month too
    const { leavers } = getMovementDetails();
    const prevMonthLeaverNames = context.previousMonth 
      ? leavers.filter(l => l.month === context.previousMonth).map(l => l.name)
      : [];
    
    // Determine the entity name and scope based on filters
    let entityName = 'BCI';
    let scopeDescription = 'the organization';
    let includeETPNote = true; // Show "(including Early Talent Program)" for org-wide or PE department
    
    if (selectedDepts.length === 1 && selectedBranches.length === 0) {
      // Single department selected, no branch
      entityName = selectedDepts[0];
      scopeDescription = 'the department';
      // Only include ETP note for Private Equity department (ETP is PE-specific)
      includeETPNote = selectedDepts[0].toLowerCase().includes('private equity') || 
                       selectedDepts[0].toLowerCase().includes('pe');
    } else if (selectedDepts.length === 1 && selectedBranches.length === 1) {
      // Single department and single branch selected
      entityName = selectedBranches[0];
      scopeDescription = 'the selected branch';
      includeETPNote = false; // Don't mention ETP at branch level
    } else if (selectedDepts.length > 1) {
      // Multiple departments
      entityName = `${selectedDepts.length} departments`;
      scopeDescription = 'the selected departments';
      includeETPNote = selectedDepts.some(d => d.toLowerCase().includes('private equity') || d.toLowerCase().includes('pe'));
    } else if (selectedBranches.length > 0 && selectedDepts.length === 0) {
      // Only branches selected (no department filter)
      entityName = selectedBranches.length === 1 ? selectedBranches[0] : `${selectedBranches.length} branches`;
      scopeDescription = 'the selected branch(es)';
      includeETPNote = false;
    }
    
    // Build the ETP note string
    const etpNote = includeETPNote && context.showBudgetVariance ? ' (including Early Talent Program)' : '';
    
    // Debug logging for budget issues
    console.log('Summary context debug:', {
      currentMonth: context.currentMonth,
      currentStats: context.currentStats,
      budgetFTE: context.currentStats?.budgetFTE,
      actualFTE: context.currentStats?.actualFTE,
      permanent: context.currentStats?.permanent,
      showBudgetVariance: context.showBudgetVariance,
      jobTypeDescription: context.jobTypeDescription,
      selectedJobTypes: selectedJobTypes,
      budgetDataKeys: Object.keys(budgetData),
      entityName,
      etpNote
    });
    
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Write a clean, factual HR summary. Be direct - no corporate speak, no leadership tone, no "we welcomed" or "our team". Just state the facts.

CRITICAL TIMELINE CONTEXT:
- The data is for fiscal year ${fiscalYear} (April ${parseInt(fiscalYear.replace('F', '')) - 1} to March ${fiscalYear.replace('F', '')})
- The CURRENT/LATEST month in the data is ${context.currentMonth} ${fiscalYear.replace('F', '')}
- When calculating time periods (e.g., "X months ago"), use ${context.currentMonth} ${fiscalYear.replace('F', '')} as the reference point, NOT today's actual date
- For example, if viewing November 2025 data, September 2024 was 14 months ago, not 2 months ago

IMPORTANT CONTEXT:
- Budget FTE ONLY includes Permanent employees. It does NOT include Fixed Term, Co-op, or ETP employees.
- The Actual FTE column is filtered by job type selection (default is Permanent + ETP).
- The breakdown columns (Permanent, Fixed-Term, ETP, Co-op, On Leave) always show unfiltered totals for each category.

CURRENT FILTER CONTEXT:
- Entity Name: ${entityName}
- Scope: ${scopeDescription}
- Show ETP note: ${includeETPNote && context.showBudgetVariance}
- Departments selected: ${selectedDepts.length > 0 ? selectedDepts.join(', ') : 'None (all departments)'}
- Branches selected: ${selectedBranches.length > 0 ? selectedBranches.join(', ') : 'None (all branches)'}

DATA FOR ${context.currentMonth}:
- Actual FTE (filtered): ${context.currentStats?.actualFTE || 0}
- Budget FTE (Permanent only): ${context.currentStats?.budgetFTE || 0}
- Permanent: ${context.currentStats?.permanent || 0}
- Fixed-Term: ${context.currentStats?.fixedTerm || 0}
- ETP: ${context.currentStats?.earlyTalentProgram || 0}
- Co-op: ${context.currentStats?.coop || 0}
- New Hires: ${context.currentStats?.newHires || 0}
- Departures: ${context.currentStats?.departures || 0}
- On Leave: ${context.currentStats?.onLeave || 0}

PREVIOUS MONTH (${context.previousMonth || 'N/A'}):
- New Hires: ${context.previousStats?.newHires || 0}
- Departures: ${context.previousStats?.departures || 0}

CURRENTLY VIEWING JOB TYPE: ${context.viewingJobType}

NEW HIRE NAMES THIS MONTH (new to ${context.viewingJobType}): ${context.currentMonthJoinerNames.length > 0 ? context.currentMonthJoinerNames.join(', ') : 'None'}
CONVERSIONS INTO ${context.viewingJobType.toUpperCase()} THIS MONTH: ${context.conversionsIn.length > 0 ? context.conversionsIn.map(c => `${c.name} (from ${c.from})`).join(', ') : 'None'}
CONVERSIONS OUT OF ${context.viewingJobType.toUpperCase()} THIS MONTH: ${context.conversionsOut.length > 0 ? context.conversionsOut.map(c => `${c.name} (to ${c.to})`).join(', ') : 'None'}
DEPARTURE NAMES THIS MONTH (left organization): ${context.currentMonthLeaverNames.length > 0 ? context.currentMonthLeaverNames.join(', ') : 'None'}
DEPARTURE NAMES LAST MONTH: ${prevMonthLeaverNames.length > 0 ? prevMonthLeaverNames.join(', ') : 'None'}
ON LEAVE NAMES: ${context.onLeaveNames.length > 0 ? context.onLeaveNames.join(', ') : 'None'}

JOB TYPE FILTER APPLIED: ${context.jobTypeDescription}
SHOW BUDGET COMPARISON: ${context.showBudgetVariance}

IMPORTANT CONTEXT FOR JOB TYPE FILTERING:
- Currently viewing: ${context.viewingJobType}
- New joiners to this job type: ${context.currentMonthJoinerNames.length}
- Conversions INTO this job type: ${context.conversionsIn.length}
- Conversions OUT OF this job type: ${context.conversionsOut.length} (these count as "leavers" from this job type category)
- Actual departures from organization: ${context.currentMonthLeaverNames.length}

When viewing Fixed Term or Co-op:
- "Additions" = new hires + conversions INTO this job type
- "Leavers" = actual departures + conversions OUT OF this job type (e.g., promoted to Permanent)

Write exactly 4 bullets. Follow these templates based on the data:

BULLET 1 (Headcount):
${context.showBudgetVariance 
  ? `• ${entityName} stands at [actualFTE] Permanent employees${etpNote} this ${context.currentMonth}, which is [X] [above/below/meets] the budgeted target of [budgetFTE] Permanent FTE.`
  : context.viewingJobType === 'all' || context.viewingJobType === 'multiple'
    ? `• ${entityName} stands at [actualFTE] employees this ${context.currentMonth}. Total workforce breakdown: [Permanent] permanent, [Fixed-Term] fixed-term, [ETP] ETP, and [Co-op] co-op.`
    : `• ${entityName} stands at [actualFTE] ${context.viewingJobType} employees this ${context.currentMonth}.`}

BULLET 2 (Additions - new hires and conversions IN):
${context.currentMonthJoinerNames.length > 0 || context.conversionsIn.length > 0
  ? `Show additions to ${context.viewingJobType} category:
• [total] additions to ${entityName} this ${context.currentMonth}, [comparison to previous month]:
${context.currentMonthJoinerNames.length > 0 ? `  ‣ <u>New hires</u>: [list names]` : ''}
${context.conversionsIn.length > 0 ? `  ‣ <u>Converted to ${context.viewingJobType}</u>: [list names with their previous job type]` : ''}`
  : `• No additions to ${context.viewingJobType} this ${context.currentMonth}.`}

BULLET 3 (Departures - actual leavers and conversions OUT):
${context.currentMonthLeaverNames.length > 0 || context.conversionsOut.length > 0
  ? `Show departures from ${context.viewingJobType} category:
• [total] left ${scopeDescription} this month:
${context.currentMonthLeaverNames.length > 0 ? `  ‣ <u>Left organization</u>: [list names]` : ''}
${context.conversionsOut.length > 0 ? `  ‣ <u>Converted to ${context.conversionsOut[0]?.to || 'other job type'}</u>: [list names]` : ''}`
  : context.previousStats?.departures > 0
    ? `• No leavers from ${context.viewingJobType} this month, compared to [Y] in ${context.previousMonth}.`
    : `• No leavers from ${context.viewingJobType} this month or the previous month.`}

BULLET 4 (On Leave):
${context.onLeaveNames.length > 0 
  ? `• [X] employees on leave:
  ‣ [name1]
  ‣ [name2]
  (list each name on its own sub-bullet with ‣)`
  : `• No employees currently on leave.`}

IMPORTANT RULES:
- Always start the first bullet with "${entityName} stands at..."
- Use **bold** only for numbers
- Keep it factual and clean
- When budget equals actual, say "which meets the budgeted target"
- List ALL employee names as sub-bullets using ‣ character
- Each name should be on its own line with ‣ prefix and proper indentation`
          }]
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || 'Unable to generate summary.';
      setSummaryText(text);
    } catch (error) {
      console.error('Summary generation error:', error);
      setSummaryText('• Unable to generate summary at this time. Please try again.');
    }
    setSummaryLoading(false);
  };

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    
    const userMessage = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);
    
    // Get current month data
    const currentMonth = selectedMonth || loadedMonths[loadedMonths.length - 1];
    const currentEmployees = getFilteredEmployees(monthlyData[currentMonth] || []);
    const { joiners, leavers, onLeaveEmployees } = getMovementDetails();
    
    // Build a focused dataset for chat - include contract end date for fixed term employees
    const employeeList = currentEmployees.map(e => {
      const emp = {
        name: e.name,
        department: e.department,
        branch: e.branch,
        position: e.formatted_position || e.position || '',
        jobType: categorizeJobType(e),
        onLeave: (e.on_leave || '').toLowerCase() === 'yes',
        hireDate: e.last_hire_date || e['Last Hire Date'] || e['last_hire_date'] || e.hire_date || e['Hire Date'] || e.start_date || e['Start Date'] || '',
        reportsTo: e.reports_to || e['Reports To'] || ''
      };
      // Add end employment date if it exists (for fixed term/contract employees)
      const endDate = e.end_employment_date || e['End Employment Date'] || e['end_employment_date'] || '';
      if (endDate) {
        emp.contractEndDate = endDate;
      }
      return emp;
    });
    
    // Get hire dates for joiners from all monthly data (not just filtered)
    // The joiners list is already filtered by department/branch/jobType from getMovementDetails()
    const allMonthlyEmployees = Object.values(monthlyData).flat();
    const joinerDetails = joiners.map(j => {
      // Find the employee in all monthly data to get their hire date
      const empData = allMonthlyEmployees.find(e => 
        (e.name === j.name) || 
        (e.employee_id && String(e.employee_id).trim() === String(j.employee_id).trim())
      );
      const hireDate = empData ? (empData.last_hire_date || empData['Last Hire Date'] || empData['last_hire_date'] || empData.hire_date || empData['Hire Date'] || empData.start_date || empData['Start Date'] || '') : '';
      return { 
        name: j.name, 
        month: j.month, 
        department: j.department, 
        branch: j.branch, 
        jobType: j.jobType,
        hireDate: hireDate
      };
    });
    
    // Get job type conversions for chat context
    const { jobTypeConversions } = getMovementDetails();
    const currentMonthConversions = jobTypeConversions.filter(c => c.month === currentMonth);
    
    // Determine viewing job type for chat
    const viewingJobType = selectedJobTypes.length === 1 ? selectedJobTypes[0] : (selectedJobTypes.length > 1 ? 'multiple' : 'all');
    
    const chatData = {
      currentMonth,
      loadedMonths,
      totalEmployees: employeeList.length,
      employees: employeeList,
      allJoiners: joinerDetails,
      allLeavers: leavers.map(l => ({ name: l.name, month: l.month, department: l.department, branch: l.branch, jobType: l.jobType })),
      onLeave: onLeaveEmployees.map(e => ({ name: e.name, department: e.department, branch: e.branch, position: e.position })),
      jobTypeConversions: currentMonthConversions.map(c => ({ name: c.name, month: c.month, from: c.fromJobType, to: c.toJobType, department: c.department, branch: c.branch })),
      viewingJobType
    };
    
    // Determine current filter context for chat
    let filterContext = 'Viewing all of BCI (no filters applied)';
    let entityName = 'BCI';
    if (selectedDepts.length === 1 && selectedBranches.length === 0) {
      filterContext = `Viewing ${selectedDepts[0]} department`;
      entityName = selectedDepts[0];
    } else if (selectedDepts.length === 1 && selectedBranches.length === 1) {
      filterContext = `Viewing ${selectedBranches[0]} branch within ${selectedDepts[0]} department`;
      entityName = selectedBranches[0];
    } else if (selectedDepts.length > 1) {
      filterContext = `Viewing ${selectedDepts.length} departments: ${selectedDepts.join(', ')}`;
      entityName = 'the selected departments';
    } else if (selectedBranches.length > 0) {
      filterContext = `Viewing branches: ${selectedBranches.join(', ')}`;
      entityName = selectedBranches.length === 1 ? selectedBranches[0] : 'the selected branches';
    }
    
    const conversationHistory = chatMessages.map(msg => ({ role: msg.role, content: msg.content }));
    
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are an HR assistant for ${entityName}. Answer questions using this data. Be direct and concise - no markdown, no "according to the data", just answer the question naturally.

CRITICAL TIMELINE CONTEXT:
- The data is for fiscal year ${fiscalYear} (April ${parseInt(fiscalYear.replace('F', '')) - 1} to March ${fiscalYear.replace('F', '')})
- The CURRENT/LATEST month in the data is ${chatData.currentMonth} ${fiscalYear.replace('F', '')}
- When calculating time periods (e.g., "X months ago", "how long has someone been here"), use ${chatData.currentMonth} ${fiscalYear.replace('F', '')} as the reference point, NOT today's actual date
- For example, if the current data month is November 2025 and someone's hire date is September 2024, they have been with the company for about 14 months, not 4 months
- Always calculate tenure and time periods relative to the data month (${chatData.currentMonth}), not the current calendar date

CURRENT FILTER CONTEXT: ${filterContext}
${selectedDepts.length > 0 ? `Departments: ${selectedDepts.join(', ')}` : ''}
${selectedBranches.length > 0 ? `Branches: ${selectedBranches.join(', ')}` : ''}
${selectedJobTypes.length > 0 ? `Job Types: ${selectedJobTypes.join(', ')}` : ''}

IMPORTANT BUDGET CONTEXT:
- Budget FTE ONLY includes Permanent employees. It does NOT include Fixed Term, Co-op, or ETP employees.
- When comparing actual vs budget, only compare Permanent employees to Budget FTE.
- The breakdown columns (Permanent, Fixed-Term, ETP, Co-op, On Leave) always show unfiltered totals.

CURRENT MONTH: ${chatData.currentMonth}
LOADED MONTHS: ${chatData.loadedMonths.join(', ')}
VIEWING JOB TYPE: ${chatData.viewingJobType}

EMPLOYEES (${chatData.employees.length}):
Each employee has: name, department, branch, position, jobType, onLeave, hireDate, reportsTo, and contractEndDate (for fixed term/contract employees)
${JSON.stringify(chatData.employees, null, 1)}

NEW HIRES (${chatData.allJoiners.length}):
${JSON.stringify(chatData.allJoiners, null, 1)}

DEPARTURES (${chatData.allLeavers.length}):
${JSON.stringify(chatData.allLeavers, null, 1)}

JOB TYPE CONVERSIONS THIS MONTH (${chatData.jobTypeConversions.length}):
These are employees who changed job type (e.g., Fixed Term to Permanent, Co-op to Fixed Term)
${JSON.stringify(chatData.jobTypeConversions, null, 1)}

ON LEAVE (${chatData.onLeave.length}):
${JSON.stringify(chatData.onLeave, null, 1)}

${priorDepartures.length > 0 ? `PRIOR YEAR DEPARTURES (${priorDepartures.length}):
These are employees who left during the previous fiscal year, with their departure reasons.
Each record has: name, department, branch, reason (Resigned/Left/Retired).
Use this data when the user asks about prior year comparisons, year-over-year departure trends, or reasons for leaving in the previous year.
${JSON.stringify(priorDepartures.map(d => ({ name: d.name, department: d.department, branch: d.branch, reason: d.reason })), null, 1)}` : ''}

JOB TYPE CONVERSION CONTEXT:
- When viewing Permanent: conversions TO Permanent are "additions", people who left org are "departures"
- When viewing Fixed Term: conversions TO Fixed Term are "additions", conversions FROM Fixed Term (to Permanent) AND people who left org are "departures from Fixed Term"
- When viewing Co-op: ONLY new hires are "additions" (co-ops are never converted to, always hired fresh), conversions FROM Co-op (to Fixed Term or Permanent) AND people who left org are "departures from Co-op"
- Use this logic when answering questions about who joined or left a specific job type category

Rules:
- Do NOT use ** or any markdown formatting
- Do NOT say "according to the data" or "based on the data"
- Just answer directly, like "Larissa Manamel is from Investment Operations department, Investment Operations General branch."
- Be brief and helpful
- When discussing budget comparisons, remember Budget FTE = Permanent employees only
- If asked about the current view, reference the filter context above
- ALWAYS calculate time periods relative to ${chatData.currentMonth} ${fiscalYear.replace('F', '')}, not today's date
- Use natural language for zero values:
  - Say "No leavers" instead of "0 leavers"
  - Say "No employees on leave" instead of "0 employees on leave"
  - Say "No new hires" instead of "0 new hires"
- When referencing the current scope, use "${entityName}" not "BCI" (unless no filters are applied)
- CRITICAL: NEVER make up or guess dates. If an employee's hireDate field is empty or missing, say "hire date not available in the data" - do NOT invent a date
- Only state facts that are explicitly present in the data provided above. If information is not in the data, say so honestly
- The "month" field in joiners/leavers indicates which month they first appeared or disappeared in the data, NOT necessarily their exact hire/termination date
- When asked about replacements or who joined after someone left, consider BOTH new hires AND job type conversions as potential replacements`,
          messages: [...conversationHistory, { role: "user", content: userMessage }]
        })
      });
      
      const data = await response.json();
      const text = data.content?.[0]?.text || 'I apologize, but I was unable to process your question. Please try again.';
      setChatMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch (error) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    }
    setChatLoading(false);
  };

  // Auto-scroll chat
  React.useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      modalChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, [chatMessages, chatLoading]);

  // Generate summary when data loads initially
  React.useEffect(() => {
    if (Object.keys(monthlyData).length > 0 && !summaryText && !summaryLoading) {
      generateSummary();
    }
  }, []);

  // Regenerate summary when data or filters change
  React.useEffect(() => {
    if (Object.keys(monthlyData).length > 0) {
      // Clear chat messages and regenerate summary
      setChatMessages([]);
      generateSummary();
    }
  }, [monthlyData, selectedDepts, selectedBranches, selectedJobTypes, selectedMonth]);

  // Sort by month descending (most recent first)
  const sortByMonthDesc = (items) => {
    return [...items].sort((a, b) => {
      const aIdx = MONTHS_ORDER.indexOf(a.month);
      const bIdx = MONTHS_ORDER.indexOf(b.month);
      // Handle fiscal year entries (F2025, F2026, etc.)
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return -1; // FY entries come first
      if (bIdx === -1) return 1;
      return bIdx - aIdx; // Descending order
    });
  };

  const loadedMonths = MONTHS_ORDER.filter(m => monthlyData[m]);
  const monthStats = getMonthStats();
  
  // Show budget only when Permanent is selected in job type filter
  // Budget FTE only contains Permanent employees, so it's misleading to show when filtering by other job types
  const showBudget = selectedJobTypes.length === 0 || selectedJobTypes.includes('Permanent');
  const { joiners, leavers, internalMoves, onLeaveEmployees, jobTypeConversions } = getMovementDetails();
  
  // Sort all movement data by month descending
  const filteredJoiners = sortByMonthDesc(selectedMonth ? joiners.filter(j => j.month === selectedMonth) : joiners);
  const filteredLeavers = sortByMonthDesc(selectedMonth ? leavers.filter(l => l.month === selectedMonth) : leavers);
  const filteredMoves = sortByMonthDesc(selectedMonth ? internalMoves.filter(m => m.month === selectedMonth) : internalMoves);
  const filteredOnLeave = sortByMonthDesc(selectedMonth ? onLeaveEmployees.filter(o => o.month === selectedMonth) : onLeaveEmployees);
  const filteredConversions = sortByMonthDesc(selectedMonth ? jobTypeConversions.filter(c => c.month === selectedMonth) : jobTypeConversions);
  
  const loadedFYs = Object.keys(monthlyData).filter(k => k.startsWith('F'));
  const loadedBudgetMonths = MONTHS_ORDER.filter(m => budgetData[m]);
  const loadedBudgetFYs = Object.keys(budgetData).filter(k => k.startsWith('F'));

  const chartData = monthStats.filter(m => m.hasData).map(m => ({ name: m.month, 'Budget FTE': m.budgetFTE, 'Actual FTE': m.actualFTE }));
  const trendData = monthStats.filter(m => m.hasData).map((m) => ({ name: m.month, 'Actual FTE': m.actualFTE, 'Budget FTE': m.budgetFTE, 'Net Change': m.netChange }));

  // Load Inter font
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-100" style={{ fontFamily: "'Inter', sans-serif" }}>Loading...</div>;

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`}</style>
      <div className="min-h-screen bg-gray-100 text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* AI Summary Modal */}
      {summaryModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 54, 91, 0.3)' }}
          onClick={() => setSummaryModalOpen(false)}
        >
          <div 
            className="w-full max-w-2xl mx-4 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '80vh', backgroundColor: 'white' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div 
              className="flex justify-between items-center px-6 py-4 flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #004d80 100%)` }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Summary</h2>
                  <p className="text-xs text-white/70">AI-powered workforce insights</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); setChatMessages([]); generateSummary(); }}
                  className="p-2 rounded-full hover:bg-white/20 transition-all"
                  title="Refresh"
                >
                  <RefreshCw size={18} className={`text-white ${summaryLoading ? 'animate-spin' : ''}`} />
                </button>
                <button 
                  onClick={() => setSummaryModalOpen(false)}
                  className="p-2 rounded-full hover:bg-white/20 transition-all"
                >
                  <X size={18} className="text-white" />
                </button>
              </div>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ backgroundColor: '#f8fafc' }}>
              {/* Summary Box */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                {summaryLoading ? (
                  <div className="flex items-center gap-3 py-4 text-gray-400 justify-center">
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Analyzing workforce data...</span>
                  </div>
                ) : summaryText ? (
                  <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
                    {summaryText.split('\n').filter(line => line.trim()).map((line, i) => {
                      const isSubBullet = line.trim().startsWith('‣');
                      const isBullet = line.trim().startsWith('•');
                      // Convert **text** to bold and keep <u> tags for underline
                      const formattedLine = line
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/__(.*?)__/g, '<u>$1</u>');
                      return (
                        <p 
                          key={i} 
                          className={isSubBullet ? 'ml-4 text-gray-600' : isBullet ? 'mt-3 first:mt-0' : ''}
                          dangerouslySetInnerHTML={{ __html: formattedLine }} 
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-400 py-4 text-center">Click refresh to generate summary</p>
                )}
              </div>
              
              {/* Chat Messages */}
              {chatMessages.map((msg, i) => (
                <div 
                  key={`modal-msg-${i}-${msg.role}`} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'rounded-br-md text-white' 
                        : 'rounded-bl-md bg-white border border-gray-100 text-gray-700 shadow-sm'
                    }`}
                    style={msg.role === 'user' ? { backgroundColor: BRAND_DARK } : {}}
                  >
                    <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{msg.content}</span>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-md border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={modalChatEndRef} />
            </div>
            
            {/* Modal Chat Input */}
            <div className="px-6 py-4 border-t bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  placeholder="Ask me..."
                  className="flex-1 px-4 py-3 rounded-full border border-gray-200 focus:outline-none focus:border-[#00abbd] focus:ring-2 focus:ring-[#00abbd]/20 text-sm transition-all"
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-3 rounded-full text-white transition-all disabled:opacity-50 shadow-lg"
                  style={{ backgroundColor: chatInput.trim() && !chatLoading ? BRAND_DARK : '#9ca3af' }}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-800">Headcount Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {['F2025', 'F2026', 'F2027', 'F2028'].map(y => <option key={y}>{y}</option>)}
          </select>
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
            style={activeTab === 'dashboard' ? {backgroundColor: BRAND_DARK} : {}}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('upload')} 
            className={`p-1.5 rounded transition-all ${activeTab === 'upload' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}
            style={activeTab === 'upload' ? {backgroundColor: BRAND_DARK} : {}}
            title="Upload Data"
          >
            <Upload size={18} />
          </button>
        </div>
      </div>

      {uploadStatus && <div className={`mx-4 mt-2 p-2 rounded text-sm ${uploadStatus.startsWith('✓') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{uploadStatus}</div>}

      {activeTab === 'upload' ? (
        <div className="p-4 max-w-4xl mx-auto relative">
          {/* Password Overlay - shown when locked */}
          {!uploadUnlocked && (
            <div 
              className="absolute inset-0 z-10 flex items-start justify-center pt-16"
              style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(255, 255, 255, 0.7)', margin: '-1rem', padding: '1rem' }}
            >
              <div className="bg-white rounded-lg shadow-xl p-8 max-w-md border">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#F0F4F8' }}>
                    <Lock size={32} style={{ color: BRAND_DARK }} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-800">Upload Area Protected</h2>
                  <p className="text-sm text-gray-500 mt-2">Enter the password to access upload and data management features.</p>
                </div>
                <div className="space-y-4">
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (passwordInput === UPLOAD_PASSWORD) { setUploadUnlocked(true); setPasswordInput(''); setPasswordError(''); }
                        else { setPasswordError('Incorrect password'); }
                      }
                    }}
                    placeholder="Enter password"
                    className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00abbd] text-center"
                    autoFocus
                  />
                  {passwordError && <p className="text-red-500 text-sm text-center">{passwordError}</p>}
                  <button
                    onClick={() => {
                      if (passwordInput === UPLOAD_PASSWORD) { setUploadUnlocked(true); setPasswordInput(''); setPasswordError(''); }
                      else { setPasswordError('Incorrect password'); }
                    }}
                    className="w-full py-3 rounded-lg text-white font-medium transition-all hover:opacity-90"
                    style={{ backgroundColor: BRAND_DARK }}
                  >Unlock</button>
                </div>
                <p className="text-xs text-gray-400 text-center mt-4">Contact your administrator if you need access.</p>
              </div>
            </div>
          )}
          {/* Access Granted banner when unlocked */}
          {uploadUnlocked && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-green-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Unlock size={16} />
                <strong>Access Granted</strong> — You can upload, delete, and manage data.
              </div>
              <button onClick={() => setUploadUnlocked(false)} className="flex items-center gap-1 px-3 py-1 rounded text-sm font-medium hover:bg-green-100 transition-all" style={{ color: BRAND_DARK }}>
                <Lock size={14} /> Lock
              </button>
            </div>
          )}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
            <strong>📊 Shared Dashboard:</strong> Data uploaded here is visible to all users. Any user can upload new months or manage existing data.
          </div>
          {/* Data Status Badge */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Current Data:</span>
              <span className="text-xs px-2 py-1 rounded" style={{backgroundColor: BRAND_CYAN, color: 'white'}}>
                {fiscalYear}: {loadedMonths.length > 0 ? loadedMonths.join(', ') : 'no data'}
              </span>
              {loadedFYs.includes(`F${parseInt(fiscalYear.replace('F', '')) - 1}`) && (
                <span className="text-xs px-2 py-1 rounded" style={{backgroundColor: BRAND_DARK, color: 'white'}}>
                  Prior FY loaded
                </span>
              )}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Upload Monthly Data</h2>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="border-2 border-dashed rounded-lg p-6 text-center" style={{borderColor: BRAND_CYAN, backgroundColor: '#F0FDFF'}}>
                <FileSpreadsheet className="mx-auto mb-2" size={32} style={{color: BRAND_DARK}} />
                <p className="font-medium mb-2">Monthly HR Data (.xlsx)</p>
                <input type="file" accept=".xlsx,.xls" multiple onChange={handleExcelUpload} disabled={!uploadUnlocked} className="text-xs w-full" />
                <p className="text-xs text-gray-500 mt-3">Select multiple files at once. Name files: April.xlsx, May.xlsx, or F2025.xlsx</p>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center" style={{borderColor: BRAND_DARK, backgroundColor: '#F0F4F8'}}>
                <FileSpreadsheet className="mx-auto mb-2" size={32} style={{color: BRAND_CYAN}} />
                <p className="font-medium mb-2">Budget Data (.xlsx)</p>
                <input type="file" accept=".xlsx,.xls" onChange={handleBudgetUpload} disabled={!uploadUnlocked} className="text-xs w-full" />
                <p className="text-xs text-gray-500 mt-3">Single file with periods in Column U and FTE counts in Column V</p>
              </div>
              <div className="border-2 border-dashed rounded-lg p-6 text-center" style={{borderColor: '#9CA3AF', backgroundColor: '#F9FAFB'}}>
                <FileSpreadsheet className="mx-auto mb-2" size={32} style={{color: '#6B7280'}} />
                <p className="font-medium mb-2">Prior Year Departures (.xlsx)</p>
                <input type="file" accept=".xlsx,.xls" onChange={handlePriorDeparturesUpload} disabled={!uploadUnlocked} className="text-xs w-full" />
                <p className="text-xs text-gray-500 mt-3">Columns: Employee_ID, Name, Department, Branch, Reason To Leave</p>
              </div>
            </div>
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Loaded Data</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Actual HR Data:</p>
                  <div className="flex flex-wrap gap-2">
                    {loadedFYs.length > 0 && loadedFYs.map(fy => (
                      <span key={fy} className="px-3 py-1 rounded-full text-xs font-medium text-white group relative" style={{backgroundColor: BRAND_DARK}}>
                        {fy}: {monthlyData[fy]?.length} employees
                        {uploadUnlocked && <button onClick={() => deleteMonthData(fy)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300" title="Delete this data"><X size={14} className="inline" /></button>}
                      </span>
                    ))}
                    {loadedMonths.length > 0 ? loadedMonths.map(m => (
                      <span key={m} className="px-3 py-1 rounded-full text-xs font-medium text-white group relative" style={{backgroundColor: BRAND_CYAN}}>
                        {m}: {monthlyData[m]?.length}
                        {uploadUnlocked && <button onClick={() => deleteMonthData(m)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300" title="Delete this month"><X size={14} className="inline" /></button>}
                      </span>
                    )) : !loadedFYs.length && <span className="text-gray-400 text-sm">No data loaded</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Budget Data:</p>
                  <div className="flex flex-wrap gap-2">
                    {loadedBudgetFYs.length > 0 && loadedBudgetFYs.map(fy => {
                      const totalBudget = budgetData[fy]?.reduce((sum, e) => sum + (parseFloat(e.budget_count) || 0), 0) || 0;
                      return (
                        <span key={`budget-${fy}`} className="px-3 py-1 rounded-full text-xs font-medium text-white group relative" style={{backgroundColor: '#6B7280'}}>
                          {fy}: {totalBudget.toFixed(1)} FTE
                          {uploadUnlocked && <button onClick={() => deleteBudgetData(fy)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300" title="Delete this budget data"><X size={14} className="inline" /></button>}
                        </span>
                      );
                    })}
                    {loadedBudgetMonths.length > 0 ? loadedBudgetMonths.map(m => {
                      const totalBudget = budgetData[m]?.reduce((sum, e) => sum + (parseFloat(e.budget_count) || 0), 0) || 0;
                      return (
                        <span key={`budget-${m}`} className="px-3 py-1 rounded-full text-xs font-medium text-white group relative" style={{backgroundColor: '#9CA3AF'}}>
                          {m}: {totalBudget.toFixed(1)} FTE
                          {uploadUnlocked && <button onClick={() => deleteBudgetData(m)} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300" title="Delete this month"><X size={14} className="inline" /></button>}
                        </span>
                      );
                    }) : !loadedBudgetFYs.length && <span className="text-gray-400 text-sm">No budget loaded</span>}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Prior Year Departures:</p>
                  <div className="flex flex-wrap gap-2">
                    {priorDepartures.length > 0 ? (
                      <span className="px-3 py-1 rounded-full text-xs font-medium text-white group relative" style={{backgroundColor: '#6B7280'}}>
                        {priorDepartures.length} departure records
                        {uploadUnlocked && <button onClick={async () => { setPriorDepartures([]); await window.storage.delete('hc-prior-departures', true); setUploadStatus('✓ Deleted prior year departures'); setTimeout(() => setUploadStatus(''), 2000); }} className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300" title="Delete prior departures"><X size={14} className="inline" /></button>}
                      </span>
                    ) : <span className="text-gray-400 text-sm">No prior departures loaded</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                {uploadUnlocked && (
                  <button onClick={clearAllData} className="flex items-center gap-1 text-red-600 text-sm hover:underline">
                    <Trash2 size={14} /> Clear All Data
                  </button>
                )}
                <button 
                  onClick={generateDebugReport} 
                  className="flex items-center gap-1 text-sm hover:underline"
                  style={{ color: BRAND_DARK }}
                  title="Check for inconsistencies in employee names and branch names across months"
                >
                  <FileSpreadsheet size={14} /> Generate Data Consistency Report
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 flex gap-4">
          <div className="flex-1">
            {(() => {
              const currentMonth = selectedMonth || loadedMonths[loadedMonths.length - 1];
              const currentMonthStats = monthStats.find(m => m.month === currentMonth);
              if (currentMonthStats?.hasData) {
                return (
                  <div className="grid grid-cols-5 gap-3 mb-4">
                    <div className="bg-white rounded shadow p-3">
                      <div className="text-xs text-gray-600">Total Headcount</div>
                      <div className="text-2xl font-bold" style={{color: BRAND_DARK}}>{currentMonthStats.actualFTE}</div>
                      {currentMonthStats.changeFromPrevious !== null && currentMonthStats.changeFromPrevious !== 0 && (
                        <div className="text-xs mt-1" style={currentMonthStats.changeFromPrevious > 0 ? {color: '#00365b'} : {color: '#00abbd'}}>
                          {currentMonthStats.changeFromPrevious > 0 ? '+' : ''}{currentMonthStats.changeFromPrevious} from previous
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded shadow p-3">
                      <div className="text-xs text-gray-600">New Hires</div>
                      <div className="text-2xl font-bold" style={{color: '#457b96'}}>{currentMonthStats.newHire || 0}</div>
                      <div className="text-xs text-gray-500 mt-1">{currentMonth}</div>
                    </div>
                    <div className="bg-white rounded shadow p-3">
                      <div className="text-xs text-gray-600">Departures</div>
                      <div className="text-2xl font-bold" style={{color: '#457b96'}}>{currentMonthStats.departure || 0}</div>
                      <div className="text-xs text-gray-500 mt-1">{currentMonth}</div>
                    </div>
                    <div className="bg-white rounded shadow p-3">
                      <div className="text-xs text-gray-600">On Leave</div>
                      <div className="text-2xl font-bold" style={{color: '#457b96'}}>{currentMonthStats.onLeave || 0}</div>
                      <div className="text-xs text-gray-500 mt-1">Currently</div>
                    </div>
                    <div className="bg-white rounded shadow p-3">
                      <div className="text-xs text-gray-600">Net Change</div>
                      <div className="text-2xl font-bold" style={{color: currentMonthStats.netChange >= 0 ? '#00365b' : '#00abbd'}}>
                        {currentMonthStats.netChange > 0 ? '+' : ''}{currentMonthStats.netChange || 0}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">This period</div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            <div className="bg-white rounded shadow mb-4 overflow-hidden">
              <table className="w-full text-xs">
                <thead style={{backgroundColor: BRAND_DARK}} className="text-white">
                  <tr>
                    {['Month', 'New Hire', 'Departure', 'Net Change', 'Actual FTE', ...(showBudget ? ['Budget FTE'] : []), 'Permanent', 'Fixed-Term', 'ETP', 'Co-op', 'On Leave'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthStats.map((row, i) => (
                    <tr key={row.month} className={`${row.isPrevFY ? 'bg-gray-200 border-b-2 border-gray-400 font-semibold' : i % 2 ? 'bg-gray-50' : ''} ${!row.hasData && !row.isPrevFY ? 'text-gray-300' : ''}`} style={selectedMonth === row.month ? {backgroundColor: '#E6F7FA'} : {}}>
                      <td className={`px-3 py-1.5 font-medium ${row.hasData && !row.isPrevFY ? 'cursor-pointer hover:underline' : ''} ${row.isPrevFY ? 'text-gray-700' : ''}`} onClick={() => row.hasData && !row.isPrevFY && setSelectedMonth(selectedMonth === row.month ? null : row.month)}>
                        {row.month}
                        {row.isPrevFY && <span className="ml-1 text-xs text-gray-500">(Prior Year End)</span>}
                        {selectedMonth === row.month && <span className="ml-1" style={{color: BRAND_CYAN}}>✓</span>}
                      </td>
                      <td className="px-3 py-1.5">{row.newHire ?? ''}</td>
                      <td className="px-3 py-1.5">{row.departure ?? ''}</td>
                      <td className="px-3 py-1.5 font-medium" style={row.netChange > 0 ? {color: '#00365b'} : row.netChange < 0 ? {color: '#00abbd'} : {}}>
                        {row.netChange !== null && row.netChange !== undefined ? (
                          <span className="flex items-center gap-1">
                            {row.netChange > 0 && <TrendingUp size={12} />}
                            {row.netChange < 0 && <TrendingDown size={12} />}
                            {row.netChange > 0 ? '+' : ''}{row.netChange}
                          </span>
                        ) : ''}
                      </td>
                      <td className="px-3 py-1.5 font-semibold">
                        {row.actualFTE ?? ''}
                        {row.changeFromPrevious !== null && row.changeFromPrevious !== 0 && !row.isPrevFY && (
                          <span className="ml-1 text-xs" style={row.changeFromPrevious > 0 ? {color: '#00365b'} : {color: '#00abbd'}}>
                            ({row.changeFromPrevious > 0 ? '+' : ''}{row.changeFromPrevious})
                          </span>
                        )}
                      </td>
                      {showBudget && <td className="px-3 py-1.5">{row.budgetFTE ?? ''}</td>}
                      <td className="px-3 py-1.5">{row.permanent ?? ''}</td>
                      <td className="px-3 py-1.5">{row.temporary ?? ''}</td>
                      <td className="px-3 py-1.5">{row.earlyTalent ?? ''}</td>
                      <td className="px-3 py-1.5">{row.coop ?? ''}</td>
                      <td className="px-3 py-1.5">{row.onLeave ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {monthStats.some(m => m.comparisonPeriod) && (
                <div className="px-3 py-1 bg-gray-50 text-xs text-gray-600 border-t">
                  Note: April compares to Prior Year End. All other months compare to the previous month.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white rounded shadow p-4">
                <h3 className="text-sm font-semibold mb-3" style={{ color: BRAND_DARK }}>Headcount Trend - {fiscalYear}</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart 
                    data={(() => {
                      // Build data for all 12 months
                      return MONTHS_ORDER.map(month => {
                        const stat = monthStats.find(s => s.month === month);
                        return {
                          month: month.substring(0, 3),
                          actual: stat?.hasData ? stat.actualFTE : null,
                          budget: showBudget ? (stat?.budgetFTE || null) : null
                        };
                      });
                    })()}
                    onMouseLeave={() => setHoveredLine(null)}
                    style={{ cursor: 'pointer' }}
                    margin={{ top: 5, right: 60, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid stroke="#E5E5E5" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={{ stroke: '#E5E5E5' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    {/* Budget line - only show when Permanent is selected */}
                    {showBudget && (
                      <Line 
                        type="monotone" 
                        dataKey="budget" 
                        stroke={CHART_LINE_BUDGET} 
                        strokeWidth={hoveredLine === 'budget' ? 2.5 : 1.5} 
                        strokeDasharray="3 3" 
                        dot={false}
                        activeDot={{ r: 5, stroke: CHART_LINE_BUDGET, strokeWidth: 2, fill: '#fff' }}
                        name="Budget" 
                        connectNulls
                        strokeOpacity={hoveredLine && hoveredLine !== 'budget' ? 0.4 : 1}
                        style={{ transition: 'all 0.3s ease' }}
                        onMouseEnter={() => setHoveredLine('budget')}
                        label={({ x, y, index }) => {
                          // Show label at the last month (index 11 = March)
                          if (index === 11) {
                            return <text x={x + 8} y={y} dy={4} fontSize={10} fill={CHART_LINE_BUDGET}>Budget</text>;
                          }
                          return null;
                        }}
                      />
                    )}
                    {/* Actual line - rendered last (front layer) - HERO */}
                    <Line 
                      type="monotone" 
                      dataKey="actual" 
                      stroke={CHART_LINE_ACTUAL} 
                      strokeWidth={hoveredLine === 'actual' ? 3 : 2.5} 
                      dot={false}
                      activeDot={{ r: 6, stroke: CHART_LINE_ACTUAL, strokeWidth: 2, fill: '#fff' }}
                      name="Actual" 
                      connectNulls={false}
                      strokeOpacity={hoveredLine && hoveredLine !== 'actual' ? 0.4 : 1}
                      style={{ 
                        filter: hoveredLine === 'actual' ? 'drop-shadow(0 2px 4px rgba(0,54,91,0.3))' : 'none',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={() => setHoveredLine('actual')}
                      label={({ x, y, index, value }) => {
                        // Find last actual data point
                        const actualData = MONTHS_ORDER.map(month => {
                          const stat = monthStats.find(s => s.month === month);
                          return stat?.hasData ? stat.actualFTE : null;
                        });
                        const lastActualIndex = actualData.reduce((lastIdx, d, i) => d !== null ? i : lastIdx, -1);
                        if (index === lastActualIndex && value !== null) {
                          return <text x={x + 8} y={y} dy={4} fontSize={10} fontWeight="600" fill={CHART_LINE_ACTUAL}>Actual</text>;
                        }
                        return null;
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded shadow p-3">
                <h3 className="text-xs font-semibold mb-2">Net Change by Month</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData.filter(d => d['Net Change'] !== null)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Bar dataKey="Net Change">
                      {trendData.filter(d => d['Net Change'] !== null).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry['Net Change'] >= 0 ? '#00365b' : '#00abbd'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
              <div className="bg-white rounded shadow p-3">
                <h3 className="text-xs font-semibold mb-2">{showBudget ? 'Actual vs Budget' : 'Actual FTE'}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData.length ? chartData : [{name: 'No Data'}]} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ fontSize: 10 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {showBudget && <Bar dataKey="Budget FTE" fill={BRAND_CYAN} />}
                    <Bar dataKey="Actual FTE" fill={BRAND_DARK} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {[{key: 'temporary', title: 'Fixed-Term'}, {key: 'earlyTalent', title: 'Early Talent'}, {key: 'coop', title: 'Co-op'}, {key: 'onLeave', title: 'On Leave'}].map(c => (
                <div key={c.key} className="bg-white rounded shadow p-3">
                  <h3 className="text-xs font-semibold mb-2">{c.title}</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthStats.filter(m => m.hasData && !m.isPrevFY)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 9 }} />
                      <Tooltip contentStyle={{ fontSize: 10 }} />
                      <Bar dataKey={c.key} fill={BRAND_DARK} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              {[{title: 'New Hires', data: filteredJoiners, color: '#457b96'}, 
                {title: 'Departures', data: filteredLeavers, color: '#457b96'}, 
                {title: 'Internal Movements', data: filteredMoves, color: '#457b96'},
                {title: 'Job Type Conversions', data: filteredConversions, color: '#457b96'},
                {title: 'On Leave', data: filteredOnLeave, color: '#457b96'}].map(section => (
                <div key={section.title} className="bg-white rounded shadow">
                  <div className="text-white px-3 py-2 text-xs font-medium flex justify-between" style={{backgroundColor: section.color}}>
                    <span>{section.title}{selectedMonth && ` (${selectedMonth})`}</span>
                    <span className="px-2 py-0.5 rounded" style={{backgroundColor: 'rgba(255,255,255,0.2)'}}>{section.data.length}</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {section.data.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Name</th>
                            <th className="px-2 py-1 text-left">Month</th>
                            <th className="px-2 py-1 text-left">Job Type</th>
                            {section.title === 'Internal Movements' ? (
                              <>
                                <th className="px-2 py-1 text-left">Dept From → To</th>
                                <th className="px-2 py-1 text-left">Branch From → To</th>
                              </>
                            ) : section.title === 'Job Type Conversions' ? (
                              <>
                                <th className="px-2 py-1 text-left">Conversion</th>
                                <th className="px-2 py-1 text-left">Dept</th>
                                <th className="px-2 py-1 text-left">Branch</th>
                              </>
                            ) : (
                              <>
                                <th className="px-2 py-1 text-left">Dept</th>
                                <th className="px-2 py-1 text-left">Branch</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {section.data.map((e, i) => (
                            <tr key={`${e.employee_id}-${i}`} className={i % 2 ? 'bg-gray-50' : ''}>
                              <td className="px-2 py-1">{e.name}</td>
                              <td className="px-2 py-1 font-medium" style={{color: section.color}}>{e.month}</td>
                              <td className="px-2 py-1">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${e.jobType === 'Permanent' ? '' : e.jobType === 'Co-op' ? 'bg-purple-100 text-purple-700' : e.jobType === 'Early Talent Program' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`} style={e.jobType === 'Permanent' ? {backgroundColor: BRAND_DARK, color: 'white'} : {}}>
                                  {section.title === 'Job Type Conversions' ? e.toJobType : e.jobType}
                                </span>
                              </td>
                              {section.title === 'Internal Movements' ? (
                                <>
                                  <td className="px-2 py-1 text-gray-500 text-xs">{e.fromDepartment} → {e.toDepartment}</td>
                                  <td className="px-2 py-1 text-gray-500 text-xs">{e.fromBranch} → {e.toBranch}</td>
                                </>
                              ) : section.title === 'Job Type Conversions' ? (
                                <>
                                  <td className="px-2 py-1 text-gray-500 text-xs">{e.fromJobType} → {e.toJobType}</td>
                                  <td className="px-2 py-1 text-gray-500">{e.department}</td>
                                  <td className="px-2 py-1 text-gray-500">{e.branch}</td>
                                </>
                              ) : (
                                <>
                                  <td className="px-2 py-1 text-gray-500">{e.department}</td>
                                  <td className="px-2 py-1 text-gray-500">{e.branch}</td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <div className="px-3 py-4 text-gray-400 text-center">No data</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded shadow mt-4">
              <div style={{backgroundColor: BRAND_DARK}} className="text-white px-3 py-2 text-xs font-medium flex justify-between">
                <span>Employee Details</span>
                <span style={{backgroundColor: 'rgba(255,255,255,0.2)'}} className="px-2 py-0.5 rounded">{(() => {
                  const lastMonth = selectedMonth || loadedMonths[loadedMonths.length - 1];
                  return getFilteredEmployees(monthlyData[lastMonth] || []).length;
                })()}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {(() => {
                  const lastMonth = selectedMonth || loadedMonths[loadedMonths.length - 1];
                  const employees = getFilteredEmployees(monthlyData[lastMonth] || []);
                  const showEndDate = selectedJobTypes.some(jt => jt === 'Fixed Term' || jt === 'Co-op') || selectedJobTypes.length === 0;
                  return employees.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left">Branch</th>
                          <th className="px-2 py-1.5 text-left">Name</th>
                          <th className="px-2 py-1.5 text-left">Position</th>
                          <th className="px-2 py-1.5 text-left">Job Type</th>
                          {showEndDate && <th className="px-2 py-1.5 text-left">End Date</th>}
                          <th className="px-2 py-1.5 text-left">Reports To</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((e, i) => (
                          <tr key={`${e.employee_id}-${i}`} className={i % 2 ? 'bg-gray-50' : ''}>
                            <td className="px-2 py-1.5">{e.branch}</td>
                            <td className="px-2 py-1.5 font-medium">{e.name}</td>
                            <td className="px-2 py-1.5">{e.formatted_position || e.position || '-'}</td>
                            <td className="px-2 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${categorizeJobType(e) === 'Permanent' ? '' : categorizeJobType(e) === 'Co-op' ? 'bg-purple-100 text-purple-700' : categorizeJobType(e) === 'Early Talent Program' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`} style={categorizeJobType(e) === 'Permanent' ? {backgroundColor: BRAND_DARK, color: 'white'} : {}}>
                                {categorizeJobType(e)}
                              </span>
                            </td>
                            {showEndDate && <td className="px-2 py-1.5 text-gray-500">{e.end_employment_date || e['End Employment Date'] || e['end_employment_date'] || '-'}</td>}
                            <td className="px-2 py-1.5 text-gray-500">{e.reports_to || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="px-3 py-4 text-gray-400 text-center">No employees match filters</div>;
                })()}
              </div>
            </div>
          </div>

          <div className={`${(sidebarCollapsed && !summaryExpanded) ? 'w-10' : 'w-52'} transition-all duration-300 space-y-2 flex-shrink-0`}>
            {/* Filter Toggle Button */}
            <button
              onClick={() => { 
                if (sidebarCollapsed) {
                  setSidebarCollapsed(false);
                  setSummaryExpanded(false);
                } else {
                  setSidebarCollapsed(true);
                }
              }}
              className={`w-full bg-white rounded shadow p-2 flex items-center justify-center hover:bg-gray-50 transition-all ${!sidebarCollapsed && !summaryExpanded ? 'ring-2' : ''}`}
              style={{ color: BRAND_DARK, ringColor: BRAND_DARK }}
            >
              {sidebarCollapsed && !summaryExpanded ? (
                <div className="flex flex-col items-center gap-1">
                  <Filter size={16} />
                  <ChevronLeft size={14} />
                </div>
              ) : !sidebarCollapsed ? (
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Filter size={14} />
                  <span>Filters</span>
                  <ChevronRight size={14} />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Filter size={16} />
                  <ChevronLeft size={14} />
                </div>
              )}
            </button>

            {/* AI Summary Toggle Button - only show when sidebar collapsed */}
            {sidebarCollapsed && !summaryExpanded && (
              <button
                onClick={() => { setSummaryExpanded(true); setSidebarCollapsed(true); }}
                className="w-full bg-white rounded shadow p-2 flex items-center justify-center hover:bg-gray-50"
                style={{ color: BRAND_CYAN }}
                title="AI Summary & Chat"
              >
                <div className="flex flex-col items-center gap-1">
                  <Sparkles size={16} />
                  <ChevronLeft size={14} />
                </div>
              </button>
            )}

            {/* AI Summary Panel - Expanded */}
            {summaryExpanded && sidebarCollapsed && (
              <div className="bg-white rounded shadow overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
                {/* Header */}
                <div 
                  className="flex justify-between items-center px-3 py-2 flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${BRAND_DARK} 0%, #004d80 100%)` }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-white" />
                    <span className="text-xs font-semibold text-white">Summary</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setChatMessages([]); generateSummary(); }}
                      className="p-1 rounded hover:bg-white/20 transition-all"
                      title="Refresh"
                    >
                      <RefreshCw size={11} className={`text-white ${summaryLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button 
                      onClick={() => { setSummaryModalOpen(true); }}
                      className="p-1 rounded hover:bg-white/20 transition-all"
                      title="Maximize"
                    >
                      <Maximize2 size={11} className="text-white" />
                    </button>
                    <button 
                      onClick={() => { setSummaryExpanded(false); setChatMessages([]); }}
                      className="p-1 rounded hover:bg-white/20 transition-all"
                    >
                      <X size={11} className="text-white" />
                    </button>
                  </div>
                </div>
                
                {/* Summary + Chat Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                  {/* Summary */}
                  <div className="flex justify-start">
                    <div className="max-w-[95%] px-2 py-1.5 rounded-lg text-[10px] bg-gradient-to-br from-gray-50 to-gray-100 text-gray-700 border border-gray-200">
                      {summaryLoading ? (
                        <div className="flex items-center gap-2 py-2 text-gray-400 justify-center">
                          <RefreshCw size={12} className="animate-spin" />
                          <span>Analyzing...</span>
                        </div>
                      ) : summaryText ? (
                        <div className="space-y-1 leading-relaxed">
                          {summaryText.split('\n').filter(line => line.trim()).map((line, i) => {
                            const isSubBullet = line.trim().startsWith('‣');
                            const isBullet = line.trim().startsWith('•');
                            // Convert **text** to bold and keep <u> tags for underline
                            const formattedLine = line
                              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                              .replace(/__(.*?)__/g, '<u>$1</u>');
                            return (
                              <p 
                                key={i} 
                                className={isSubBullet ? 'ml-3 text-gray-600' : isBullet ? 'mt-2 first:mt-0' : ''}
                                dangerouslySetInnerHTML={{ __html: formattedLine }} 
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-400 py-2 text-center">Click refresh to generate summary</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Chat Messages */}
                  {chatMessages.map((msg, i) => (
                    <div 
                      key={`msg-${i}-${msg.role}`} 
                      style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginTop: '8px'
                      }}
                    >
                      <div 
                        style={{
                          maxWidth: '85%',
                          padding: '8px 10px',
                          borderRadius: msg.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                          fontSize: '10px',
                          backgroundColor: msg.role === 'user' ? BRAND_DARK : '#f3f4f6',
                          color: msg.role === 'user' ? '#ffffff' : '#374151',
                          border: msg.role === 'user' ? '1px solid #002845' : '1px solid #e5e7eb',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                      >
                        <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{msg.content}</span>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 px-2 py-1.5 rounded-lg">
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                {/* Chat Input */}
                <div className="px-2 py-2 border-t bg-white flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                      placeholder="Ask me..."
                      className="flex-1 px-2 py-1.5 rounded border border-gray-200 focus:outline-none focus:border-[#00abbd] text-[10px] transition-all"
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim() || chatLoading}
                      className="p-1.5 rounded text-white transition-all disabled:opacity-50"
                      style={{ background: chatInput.trim() && !chatLoading ? BRAND_DARK : '#9ca3af' }}
                    >
                      <Send size={12} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Filter Panels - only when filters expanded */}
            {!sidebarCollapsed && !summaryExpanded && (
              <>
                {[{title: 'Department', items: departments, selected: selectedDepts, setSelected: setSelectedDepts},
                  {title: 'Branch Detail', items: branches, selected: selectedBranches, setSelected: setSelectedBranches},
                  {title: 'Job Type', items: ['Permanent', 'Fixed Term', 'Co-op', 'Early Talent Program'], selected: selectedJobTypes, setSelected: setSelectedJobTypes}
                ].map(filter => (
                  <div key={filter.title} className="bg-white rounded shadow">
                    <div style={{backgroundColor: BRAND_DARK}} className="text-white px-2 py-1.5 text-xs font-medium flex justify-between items-center">
                      <span>{filter.title}</span>
                      {filter.selected.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded text-xs" style={{backgroundColor: 'rgba(255,255,255,0.3)'}}>{filter.selected.length}</span>
                          <button onClick={() => filter.setSelected([])} className="hover:opacity-70"><X size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto">
                      {filter.items.length > 0 ? filter.items.map(item => (
                        <div key={item} onClick={() => toggleFilter(item, filter.selected, filter.setSelected)}
                          className={`px-2 py-1 text-xs cursor-pointer hover:bg-gray-100 ${filter.selected.includes(item) ? 'font-medium' : ''}`}
                          style={filter.selected.includes(item) ? {backgroundColor: BRAND_CYAN, color: 'white'} : {}}>
                          {item}
                        </div>
                      )) : <div className="px-2 py-2 text-xs text-gray-400">No data</div>}
                    </div>
                  </div>
                ))}
                
                {/* Active Filters - only show when filters applied */}
                {(selectedDepts.length + selectedBranches.length + selectedJobTypes.length > 0) && (
                  <div className="bg-white rounded shadow p-2">
                    <h3 className="text-xs font-semibold mb-1 text-gray-700">Active Filters</h3>
                    <div className="flex flex-wrap gap-1">
                      {selectedDepts.map(d => <span key={d} style={{backgroundColor: BRAND_CYAN, color: 'white'}} className="px-1.5 py-0.5 rounded text-xs">{d}</span>)}
                      {selectedBranches.map(b => <span key={b} style={{backgroundColor: BRAND_DARK, color: 'white'}} className="px-1.5 py-0.5 rounded text-xs">{b}</span>)}
                      {selectedJobTypes.map(j => <span key={j} className={`px-1.5 py-0.5 rounded text-xs ${j === 'Early Talent Program' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>{j}</span>)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
