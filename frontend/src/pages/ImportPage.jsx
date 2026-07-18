import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileSpreadsheet, ChevronRight, ChevronLeft, CheckCircle2,
  AlertCircle, AlertTriangle, Download, X, FileText, Users,
  Building2, CreditCard, Home, ArrowRight, RotateCcw, Info,
  Sparkles, Type,
} from 'lucide-react';
import {
  previewRows, uploadDocuments, confirmImport, aiImport,
} from '../services/importService';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Upload' },
  { n: 2, label: 'Review' },
  { n: 3, label: 'Documents' },
  { n: 4, label: 'Confirm' },
];

const REQUIRED_FIELDS = [
  { key: 'propertyName',   label: 'Property Name' },
  { key: 'propertyAddress',label: 'Property Address' },
  { key: 'unitNumber',     label: 'Unit Number' },
  { key: 'tenantFirstName',label: 'First Name' },
  { key: 'tenantLastName', label: 'Last Name' },
  { key: 'tenantEmail',    label: 'Email' },
  { key: 'leaseStartDate', label: 'Start Date' },
  { key: 'leaseEndDate',   label: 'End Date' },
  { key: 'monthlyRent',    label: 'Monthly Rent' },
  { key: 'paymentDueDay',  label: 'Due Day' },
];

const PREVIEW_COLS = [
  { key: 'propertyName',   label: 'Property',  w: 'min-w-[130px]' },
  { key: 'unitNumber',     label: 'Unit',       w: 'min-w-[80px]' },
  { key: 'tenantFirstName',label: 'First Name', w: 'min-w-[100px]' },
  { key: 'tenantLastName', label: 'Last Name',  w: 'min-w-[100px]' },
  { key: 'tenantEmail',    label: 'Email',      w: 'min-w-[180px]' },
  { key: 'leaseStartDate', label: 'Start',      w: 'min-w-[100px]' },
  { key: 'leaseEndDate',   label: 'End',        w: 'min-w-[100px]' },
  { key: 'monthlyRent',    label: 'Rent',       w: 'min-w-[80px]' },
  { key: 'paymentDueDay',  label: 'Due Day',    w: 'min-w-[70px]' },
];

// ─── Client-side validation ───────────────────────────────────────────────────

function validateRows(rows) {
  return rows.map((row) => {
    const errors = [];

    for (const { key, label } of REQUIRED_FIELDS) {
      if (!row[key] || !String(row[key]).trim()) {
        errors.push({ field: key, msg: `${label} is required` });
      }
    }

    if (row.tenantEmail && !/\S+@\S+\.\S+/.test(row.tenantEmail)) {
      errors.push({ field: 'tenantEmail', msg: 'Invalid email format' });
    }

    if (row.monthlyRent && isNaN(Number(row.monthlyRent))) {
      errors.push({ field: 'monthlyRent', msg: 'Must be a number' });
    }

    if (row.paymentDueDay) {
      const d = Number(row.paymentDueDay);
      if (isNaN(d) || d < 1 || d > 31) {
        errors.push({ field: 'paymentDueDay', msg: 'Must be 1–31' });
      }
    }

    if (row.leaseStartDate && row.leaseEndDate) {
      const s = new Date(row.leaseStartDate);
      const e = new Date(row.leaseEndDate);
      if (!isNaN(s) && !isNaN(e) && s >= e) {
        errors.push({ field: 'leaseEndDate', msg: 'End must be after start' });
      }
    }

    return { ...row, _errors: errors, _serverWarnings: row._serverWarnings || [], _valid: errors.length === 0 };
  });
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
              s.n < current
                ? 'bg-indigo-600 text-white'
                : s.n === current
                  ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                  : 'bg-slate-100 text-slate-400'
            }`}>
              {s.n < current ? <CheckCircle2 size={14} /> : s.n}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${
              s.n === current ? 'text-indigo-600' : s.n < current ? 'text-slate-600' : 'text-slate-400'
            }`}>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-3 ${s.n < current ? 'bg-indigo-300' : 'bg-slate-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Drag-drop upload zone ────────────────────────────────────────────────────

function DropZone({ accept, label, hint, multiple = false, onFiles, children }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  }, [multiple, onFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group cursor-pointer border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-150 ${
        dragging
          ? 'border-indigo-400 bg-indigo-50'
          : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onFiles(multiple ? files : [files[0]]);
          e.target.value = '';
        }}
      />
      <Upload size={32} className={`mx-auto mb-3 transition-colors ${dragging ? 'text-indigo-500' : 'text-slate-300 group-hover:text-indigo-400'}`} />
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
      {children}
    </div>
  );
}

// ─── Inline-editable cell ─────────────────────────────────────────────────────

function EditableCell({ value, field, rowIdx, error, editing, onStartEdit, onCommit, editValue, setEditValue }) {
  const isEditing = editing?.rowIdx === rowIdx && editing?.field === field;

  if (isEditing) {
    return (
      <input
        autoFocus
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCommit(); }}
        className="w-full px-1.5 py-0.5 text-xs border border-indigo-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
      />
    );
  }

  return (
    <div
      onClick={() => onStartEdit(rowIdx, field, value)}
      title={error ? error.msg : value || ''}
      className={`cursor-text px-1.5 py-0.5 rounded-lg text-xs truncate min-h-[22px] transition-colors ${
        error
          ? 'bg-red-50 text-red-700 border border-red-200'
          : value
            ? 'hover:bg-indigo-50 text-slate-700'
            : 'text-slate-300 hover:bg-slate-100 border border-dashed border-slate-200'
      }`}
    >
      {value || (error ? `⚠ ${error.msg}` : <span className="italic">empty</span>)}
    </div>
  );
}

// ─── STEP 1: Upload spreadsheet ───────────────────────────────────────────────

function UploadStep({ onParsed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const canSubmit = !!selectedFile || pasteText.trim().length > 0;

  const handleFiles = (files) => {
    setSelectedFile(files[0]);
    setError('');
  };

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');
    try {
      let data;
      if (selectedFile) {
        const fd = new FormData();
        fd.append('file', selectedFile);
        data = await aiImport(fd);
      } else {
        data = await aiImport({ text: pasteText.trim() });
      }
      onParsed(data.rows, { summary: data.summary, warnings: data.warnings });
    } catch (err) {
      setError(err?.response?.data?.error || 'Farik could not read that. Try a clearer file, or paste your data as text.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-indigo-100 flex items-center justify-center">
          <Sparkles size={26} className="text-indigo-600 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Reading your data…</p>
        <p className="text-xs text-slate-400 mt-1">Farik is finding your properties, units, tenants, and leases. This takes a few seconds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI intro */}
      <div className="flex items-start gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Drop in your data — any format</p>
          <p className="text-xs text-slate-500 mt-0.5">
            A spreadsheet, a PDF rent roll, or a photo of your records. Farik reads it and sets up your whole account — you just review and confirm.
          </p>
        </div>
      </div>

      {/* Upload / paste */}
      {showPaste ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            rows={8}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Paste your tenant list here — however you keep it.\n\ne.g.\nMaple Court #101 — Alice Morgan, alice@email.com, $2,200/mo, lease Feb 2024–Feb 2025"}
            className="input resize-none font-mono text-xs leading-relaxed"
          />
          <button onClick={() => { setShowPaste(false); setPasteText(''); }} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
            <Upload size={12} /> Upload a file instead
          </button>
        </div>
      ) : selectedFile ? (
        <div className="border-2 border-indigo-300 bg-indigo-50 rounded-2xl p-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{selectedFile.name}</p>
            <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={() => setSelectedFile(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-white transition-colors">
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <DropZone
            accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc"
            label="Drag your file here — spreadsheet, Word doc, PDF, or image"
            hint="or click to browse · .xlsx, .csv, .docx, .pdf, .png, .jpg up to 20 MB"
            onFiles={handleFiles}
          />
          <button onClick={() => setShowPaste(true)} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5">
            <Type size={13} /> or paste your data as text instead
          </button>
        </>
      )}

      {error && (
        <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary px-6 py-2.5"
        >
          <Sparkles size={15} /> Read my data
        </button>
      </div>
    </div>
  );
}

// ─── STEP 2: Preview & edit ───────────────────────────────────────────────────

function PreviewStep({ rows, onRowsChange, onBack, onNext }) {
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [checking, setChecking] = useState(false);

  const errorCount = rows.filter((r) => !r._valid).length;
  const readyCount = rows.filter((r) => r._valid).length;

  const startEdit = (rowIdx, field, value) => {
    setEditing({ rowIdx, field });
    setEditValue(value || '');
  };

  const commitEdit = () => {
    if (!editing) return;
    const updated = rows.map((r, i) => {
      if (i !== editing.rowIdx) return r;
      const next = { ...r, [editing.field]: editValue };
      return validateRows([next])[0];
    });
    onRowsChange(updated);
    setEditing(null);
  };

  const handleNext = async () => {
    setChecking(true);
    try {
      const data = await previewRows(rows);
      onRowsChange(data.rows.map((r) => ({ ...r, _errors: r._errors || [], _valid: (r._errors || []).length === 0 })));
      onNext();
    } catch {
      onNext();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 size={13} className="text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-700">{readyCount} ready</span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={13} className="text-red-600" />
            <span className="text-xs font-semibold text-red-700">{errorCount} with errors</span>
          </div>
        )}
        <span className="text-xs text-slate-400">{rows.length} total rows · Click any cell to edit</span>
      </div>

      {/* Editable table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-3 text-left text-slate-400 font-medium w-8">#</th>
                {PREVIEW_COLS.map((c) => (
                  <th key={c.key} className={`px-2 py-3 text-left text-slate-500 font-semibold uppercase tracking-wide ${c.w}`}>
                    {c.label}
                    {REQUIRED_FIELDS.find((r) => r.key === c.key) && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-slate-500 font-semibold uppercase tracking-wide min-w-[90px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, rowIdx) => {
                const hasError = !row._valid;
                return (
                  <tr
                    key={row._id || rowIdx}
                    className={`transition-colors ${hasError ? 'bg-red-50/40 hover:bg-red-50/60' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-3 py-2 text-slate-400 font-medium">{rowIdx + 1}</td>
                    {PREVIEW_COLS.map((c) => {
                      const err = row._errors?.find((e) => e.field === c.key);
                      return (
                        <td key={c.key} className={`px-2 py-1.5 ${c.w}`}>
                          <EditableCell
                            value={row[c.key]}
                            field={c.key}
                            rowIdx={rowIdx}
                            error={err}
                            editing={editing}
                            onStartEdit={startEdit}
                            onCommit={commitEdit}
                            editValue={editValue}
                            setEditValue={setEditValue}
                          />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2">
                      {row._valid ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={9} /> Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <AlertCircle size={9} /> {row._errors.length} error{row._errors.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {row._serverWarnings?.map((w, i) => (
                        <span key={i} className="ml-1 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle size={9} /> {w.msg}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {errorCount > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>{errorCount} row{errorCount !== 1 ? 's' : ''}</strong> with errors will be skipped.
            Fix them above or continue — only valid rows will be imported.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">
          <ChevronLeft size={15} /> Back
        </button>
        <button onClick={handleNext} disabled={readyCount === 0 || checking} className="btn-primary px-6 py-2.5">
          {checking ? 'Checking…' : <>Continue <ChevronRight size={15} /></>}
        </button>
      </div>
    </div>
  );
}

// ─── STEP 3: Documents ────────────────────────────────────────────────────────

// Best-guess row match for a document's extracted tenant/unit info.
function guessRowId(extracted, rows) {
  if (!extracted || extracted.error) return '';
  const unit = (extracted.unitNumber || '').trim().toLowerCase();
  const name = (extracted.tenantName || '').trim().toLowerCase();
  if (!unit && !name) return '';

  const match = rows.find((r) => {
    const rowUnit = (r.unitNumber || '').trim().toLowerCase();
    const rowName = `${r.tenantFirstName || ''} ${r.tenantLastName || ''}`.trim().toLowerCase();
    if (unit && rowUnit && unit === rowUnit) return true;
    if (name && rowName && (rowName === name || rowName.includes(name) || name.includes(rowName))) return true;
    return false;
  });
  return match?._id || '';
}

function DocumentStep({ docs, onDocsChange, rows, onBack, onNext }) {
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files) => {
    setUploading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const data = await uploadDocuments(fd);
      const withMatches = data.documents.map((d) => ({ ...d, _rowId: guessRowId(d.extracted, rows) }));
      onDocsChange((prev) => [...prev, ...withMatches]);
    } catch {
      /* silent — documents are optional */
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = (id) => onDocsChange((prev) => prev.filter((d) => d.id !== id));

  const setRowLink = (id, rowId) =>
    onDocsChange((prev) => prev.map((d) => (d.id === id ? { ...d, _rowId: rowId } : d)));

  const formatBytes = (b) => b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;

  const rowLabel = (r) => `${r.unitNumber || 'Unit'} — ${r.tenantFirstName || ''} ${r.tenantLastName || ''}`.trim();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <Info size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600">
          Upload signed lease agreements, ID documents, or any relevant files. Farik will try to read
          the tenant, unit, and dates and attach the document to the matching unit.
          This step is <strong>optional</strong> — you can always add documents later.
        </p>
      </div>

      <DropZone
        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
        label={uploading ? 'Uploading…' : 'Drop lease documents here'}
        hint=".pdf, .docx, .jpg, .png — up to 25 MB each"
        multiple
        onFiles={handleFiles}
      />

      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText size={15} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{doc.originalName}</p>
                  <p className="text-xs text-slate-400">{formatBytes(doc.size)}</p>
                </div>
                <button onClick={() => removeDoc(doc.id)} className="text-slate-300 hover:text-red-500 p-1 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </div>

              {doc.extracted?.error ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  {doc.extracted.error}
                </p>
              ) : (
                <div className="text-xs text-slate-500 pl-11 flex flex-wrap gap-x-3 gap-y-0.5">
                  {doc.extracted?.tenantName && <span>{doc.extracted.tenantName}</span>}
                  {doc.extracted?.unitNumber && <span>Unit {doc.extracted.unitNumber}</span>}
                  {doc.extracted?.startDate && <span>{doc.extracted.startDate} → {doc.extracted.endDate || '?'}</span>}
                  {doc.extracted?.monthlyRent && <span>${doc.extracted.monthlyRent}/mo</span>}
                </div>
              )}

              {rows.length > 0 && (
                <div className="pl-11 flex items-center gap-2">
                  <span className="text-xs text-slate-400">Attach to:</span>
                  <select
                    value={doc._rowId || ''}
                    onChange={(e) => setRowLink(doc.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                  >
                    <option value="">None</option>
                    {rows.map((r) => (
                      <option key={r._id} value={r._id}>{rowLabel(r)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="btn-secondary">
          <ChevronLeft size={15} /> Back
        </button>
        <div className="flex gap-2">
          <button onClick={onNext} className="btn-secondary">
            Skip <ChevronRight size={15} />
          </button>
          <button onClick={onNext} className="btn-primary px-6">
            Continue <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 4: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({ rows, docs, onBack, onConfirm, confirming }) {
  const valid = rows.filter((r) => r._valid);
  const skipped = rows.filter((r) => !r._valid);

  const properties = [...new Set(valid.map((r) => r.propertyName))];
  const tenants = [...new Set(valid.map((r) => r.tenantEmail))];

  const summaryItems = [
    { icon: Home,         label: 'Properties', count: properties.length, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
    { icon: Building2,    label: 'Units',      count: valid.length,      color: 'text-violet-600',  bg: 'bg-violet-50' },
    { icon: Users,        label: 'Tenants',    count: tenants.length,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { icon: FileText,     label: 'Leases',     count: valid.length,      color: 'text-blue-600',    bg: 'bg-blue-50' },
    { icon: CreditCard,   label: 'Payments',   count: valid.length,      color: 'text-amber-600',   bg: 'bg-amber-50' },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Review what will be created, then click <strong>Import</strong> to save everything to Farik.
      </p>

      {/* Summary grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {summaryItems.map(({ icon: Icon, label, count, color, bg }) => (
          <div key={label} className="card py-4 text-center">
            <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center mx-auto mb-2`}>
              <Icon size={17} className={color} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{count}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Properties breakdown */}
      {properties.length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Properties to import</p>
          <div className="space-y-1.5">
            {properties.map((name) => {
              const propRows = valid.filter((r) => r.propertyName === name);
              return (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{name}</span>
                  <span className="text-slate-400 text-xs">{propRows.length} unit{propRows.length !== 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span><strong>{skipped.length} row{skipped.length !== 1 ? 's' : ''}</strong> with errors will be skipped and not imported.</span>
        </div>
      )}

      {docs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <FileText size={14} className="text-slate-400" />
          {docs.length} lease document{docs.length !== 1 ? 's' : ''} will be stored
          {docs.some((d) => d._rowId) && ', attached to their matched unit'}.
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="btn-secondary" disabled={confirming}>
          <ChevronLeft size={15} /> Back
        </button>
        <button
          onClick={onConfirm}
          disabled={valid.length === 0 || confirming}
          className="btn-primary px-7 py-2.5 text-sm"
        >
          {confirming ? 'Importing…' : `Import ${valid.length} row${valid.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── STEP 5: Success ──────────────────────────────────────────────────────────

function SuccessStep({ result }) {
  const navigate = useNavigate();

  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">Import complete!</h2>
      <p className="text-slate-500 text-sm mt-2">Your properties and tenants are now in Farik.</p>

      {result && (
        <div className="flex items-center justify-center gap-3 flex-wrap mt-5">
          {[
            { label: 'Properties', value: result.properties },
            { label: 'Units', value: result.units },
            { label: 'Tenants', value: result.tenants },
            { label: 'Leases', value: result.leases },
          ].map(({ label, value }) => value > 0 && (
            <div key={label} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-lg font-bold text-slate-900">{value}</span>
              <span className="text-xs text-slate-500 ml-1.5">{label}</span>
            </div>
          ))}
        </div>
      )}

      {result?.skipped > 0 && (
        <p className="text-xs text-slate-400 mt-3">{result.skipped} row{result.skipped !== 1 ? 's' : ''} were skipped due to errors or duplicates.</p>
      )}

      <div className="flex items-center justify-center gap-3 mt-7 flex-wrap">
        <button
          onClick={() => navigate('/tenants')}
          className="btn-primary px-5"
        >
          <Users size={15} /> View Tenants
        </button>
        <button
          onClick={() => navigate('/properties')}
          className="btn-secondary px-5"
        >
          <Home size={15} /> View Properties
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-secondary px-5"
        >
          <ArrowRight size={15} /> Dashboard
        </button>
      </div>

      <div className="mt-5">
        <button
          onClick={() => window.location.reload()}
          className="btn-ghost text-xs"
        >
          <RotateCcw size={12} /> Import more properties
        </button>
      </div>
    </div>
  );
}

// ─── Main wizard page ─────────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState(1);
  const [rows, setRows] = useState([]);
  const [docs, setDocs] = useState([]);
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [aiMeta, setAiMeta] = useState(null);

  const handleParsed = (rawRows, meta) => {
    setRows(validateRows(rawRows));
    setAiMeta(meta || null);
    setStep(2);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    setConfirmError('');
    try {
      const docByRowId = new Map(docs.filter((d) => d._rowId).map((d) => [d._rowId, d.id]));
      const rowsWithDocs = rows.map((r) =>
        docByRowId.has(r._id) ? { ...r, _documentId: docByRowId.get(r._id) } : r,
      );
      const data = await confirmImport(rowsWithDocs);
      setResult(data.results);
      setStep(5);
    } catch (err) {
      setConfirmError(err?.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const stepTitles = {
    1: 'Upload Your Data',
    2: 'Review & Fix Errors',
    3: 'Lease Documents',
    4: 'Confirm Import',
    5: 'Import Complete',
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-7">
        <h1 className="page-title">Import Properties</h1>
        <p className="text-slate-500 text-sm mt-1">
          Drop in whatever you have — a spreadsheet, PDF, or photo — and Farik sets up your properties, units, and tenants for you.
        </p>
      </div>

      <div className="card">
        {/* Step indicator (hide on success) */}
        {step < 5 && <StepBar current={step} />}

        {/* Step title */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-slate-900">{stepTitles[step]}</h2>
          {step === 2 && rows.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">Click any cell to edit inline before importing.</p>
          )}
        </div>

        {/* Steps */}
        {step === 1 && <UploadStep onParsed={handleParsed} />}
        {step === 2 && (
          <>
            {aiMeta?.summary && (
              <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 mb-5">
                <Sparkles size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">Farik read your data: {aiMeta.summary}</p>
                  {aiMeta.warnings?.length > 0 && (
                    <ul className="mt-1 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                      {aiMeta.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  <p className="text-xs text-slate-500 mt-1">Review below and fix anything highlighted, then continue.</p>
                </div>
              </div>
            )}
            <PreviewStep
              rows={rows}
              onRowsChange={setRows}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          </>
        )}
        {step === 3 && (
          <DocumentStep
            docs={docs}
            onDocsChange={setDocs}
            rows={rows}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <>
            {confirmError && (
              <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm mb-5">
                <AlertCircle size={15} className="flex-shrink-0" />
                {confirmError}
              </div>
            )}
            <ConfirmStep
              rows={rows}
              docs={docs}
              onBack={() => setStep(3)}
              onConfirm={handleConfirm}
              confirming={confirming}
            />
          </>
        )}
        {step === 5 && <SuccessStep result={result} />}
      </div>
    </div>
  );
}
