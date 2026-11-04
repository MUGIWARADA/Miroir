import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

export default function TradeEntry() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [csvSuccess, setCsvSuccess] = useState(null);
  const [isPreviewingCsv, setIsPreviewingCsv] = useState(false);
  const [isCommittingCsv, setIsCommittingCsv] = useState(false);

  const strategyVersionId = localStorage.getItem('demo_strategy_version_id');

  const [formData, setFormData] = useState({
    instrument: 'BTC/USDT',
    side: 'long',
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    fees: '',
    initialStop: '',
    accountEquity: '50000',
    journalNote: '',
    emotionalState: 'calm',
  });

  const telemetry = useMemo(() => {
    const entry = parseFloat(formData.entryPrice);
    const exit = parseFloat(formData.exitPrice);
    const stop = parseFloat(formData.initialStop);
    const qty = parseFloat(formData.quantity);
    const equity = parseFloat(formData.accountEquity);

    let rMultiple = null;
    let riskPercentage = null;
    let netPnl = null;
    let isRiskBreached = false;

    if (entry && stop && qty && equity) {
      const riskAmount = Math.abs(entry - stop) * qty;
      riskPercentage = (riskAmount / equity) * 100;
      isRiskBreached = riskPercentage > 2.0;
      
      if (exit) {
        const rewardAmount = Math.abs(exit - entry) * qty;
        rMultiple = (rewardAmount / riskAmount).toFixed(2);
        const grossPnl = formData.side === 'long' ? (exit - entry) * qty : (entry - exit) * qty;
        netPnl = grossPnl - (parseFloat(formData.fees) || 0);
      }
    }

    return { rMultiple, riskPercentage, isRiskBreached, netPnl };
  }, [formData]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: null });
    setSubmitError(null);
  };

  const validateManualForm = () => {
    const newErrors = {};
    if (!formData.instrument) newErrors.instrument = 'Required.';
    if (!formData.entryPrice) newErrors.entryPrice = 'Required.';
    if (!formData.quantity) newErrors.quantity = 'Required.';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!validateManualForm()) return;
    
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      strategy_version_id: strategyVersionId,
      symbol: formData.instrument,
      direction: formData.side,
      quantity: parseFloat(formData.quantity),
      entry_price: parseFloat(formData.entryPrice),
      exit_price: formData.exitPrice ? parseFloat(formData.exitPrice) : undefined,
      fees: formData.fees ? parseFloat(formData.fees) : 0,
      currency: 'USD',
      opened_at: new Date().toISOString(),
      closed_at: formData.exitPrice ? new Date().toISOString() : undefined,
      initial_risk_amount: formData.initialStop ? Math.abs(parseFloat(formData.entryPrice) - parseFloat(formData.initialStop)) * parseFloat(formData.quantity) : undefined,
      evidence: []
    };

    if (formData.journalNote.trim()) {
      payload.evidence.push({ kind: 'note', payload: { setup_note: formData.journalNote } });
    }
    payload.evidence.push({ kind: 'state', payload: { emotional_state: formData.emotionalState } });

    try {
      const response = await api.createTrade(payload);
      navigate(`/review/${response.trade.id}`);
    } catch (err) {
      setSubmitError(err.message || 'Failed to save trade.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    setCsvSuccess(null);
    setCsvPreview(null);
    if (file.size > 700_000) {
      setCsvText('');
      setCsvError('CSV must be smaller than 700 KB.');
      return;
    }
    try {
      setCsvText(await file.text());
    } catch {
      setCsvText('');
      setCsvError('Could not read the selected CSV file.');
    }
  };

  const describeCsvError = (error) => {
    const details = error?.details || [];
    const detailText = details.map((detail) => {
      const location = [detail.row ? `row ${detail.row}` : null, detail.field].filter(Boolean).join(', ');
      return location ? `${location}: ${detail.message}` : detail.message;
    }).join(' ');
    return [error?.message || 'CSV request failed.', detailText].filter(Boolean).join(' ');
  };

  const handleCsvPreview = async () => {
    setCsvError(null);
    setCsvSuccess(null);
    if (!strategyVersionId) {
      setCsvError('Create a demo workspace before importing trades.');
      return;
    }
    if (!csvText.trim()) {
      setCsvError('Choose a CSV file before previewing.');
      return;
    }
    setIsPreviewingCsv(true);
    try {
      const preview = await api.previewTradeImport({
        strategy_version_id: strategyVersionId,
        csv_text: csvText,
      });
      setCsvPreview(preview);
    } catch (error) {
      setCsvError(describeCsvError(error));
    } finally {
      setIsPreviewingCsv(false);
    }
  };

  const handleCsvCommit = async () => {
    if (!csvPreview?.import_id) return;
    setCsvError(null);
    setCsvSuccess(null);
    setIsCommittingCsv(true);
    try {
      const result = await api.commitTradeImport(csvPreview.import_id);
      setCsvSuccess(`${result.imported_count} trades imported successfully.`);
      setCsvPreview(null);
      setCsvText('');
    } catch (error) {
      setCsvError(describeCsvError(error));
    } finally {
      setIsCommittingCsv(false);
    }
  };

  const inputClass = (fieldName) => `
    w-full bg-[#0B0F19]/50 border rounded-lg px-3 py-2.5 text-sm focus:outline-none text-text-primary transition-all
    ${errors[fieldName] ? 'border-adherence-broken focus:border-adherence-broken' : 'border-border-subtle focus:border-brand-primary'}
  `;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Log Trade</h1>
          <p className="text-sm text-text-secondary">Record execution and context for audit.</p>
        </div>
      </div>

      <div className="flex glass-card p-1 rounded-xl w-full max-w-sm mb-6">
        <button onClick={() => setActiveTab('manual')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'manual' ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-md' : 'text-text-secondary hover:text-text-primary'}`}>
          <span className="material-symbols-outlined text-[18px]">edit_note</span> Manual Entry
        </button>
        <button onClick={() => setActiveTab('csv')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'csv' ? 'bg-gradient-to-r from-brand-primary to-brand-secondary text-white shadow-md' : 'text-text-secondary hover:text-text-primary'}`}>
          <span className="material-symbols-outlined text-[18px]">table_chart</span> CSV Import
        </button>
      </div>

      {submitError && (
        <div className="mb-6 p-4 rounded-xl bg-adherence-broken/10 border border-adherence-broken/30 text-adherence-broken text-sm flex items-center gap-2">
          <span className="material-symbols-outlined">error</span>
          {submitError}
        </div>
      )}

      {activeTab === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-6">
          <div className="glass-card p-6">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Instrument</label>
                <input type="text" name="instrument" value={formData.instrument} onChange={handleChange} className={inputClass('instrument')} />
                {errors.instrument && <p className="text-[10px] text-adherence-broken mt-1">{errors.instrument}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFormData({...formData, side: 'long'})} className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${formData.side === 'long' ? 'bg-adherence-followed/10 border-adherence-followed text-adherence-followed' : 'bg-[#0B0F19]/50 border-border-subtle text-text-secondary'}`}>Long</button>
                  <button type="button" onClick={() => setFormData({...formData, side: 'short'})} className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${formData.side === 'short' ? 'bg-adherence-broken/10 border-adherence-broken text-adherence-broken' : 'bg-[#0B0F19]/50 border-border-subtle text-text-secondary'}`}>Short</button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Entry Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-text-tertiary">$</span>
                  <input type="number" name="entryPrice" value={formData.entryPrice} onChange={handleChange} className={`${inputClass('entryPrice')} pl-7`} />
                </div>
                {errors.entryPrice && <p className="text-[10px] text-adherence-broken mt-1">{errors.entryPrice}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Exit Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-text-tertiary">$</span>
                  <input type="number" name="exitPrice" value={formData.exitPrice} onChange={handleChange} className={`${inputClass('exitPrice')} pl-7`} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Quantity</label>
                <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} className={inputClass('quantity')} />
                {errors.quantity && <p className="text-[10px] text-adherence-broken mt-1">{errors.quantity}</p>}
              </div>
              
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Initial Stop Loss</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-text-tertiary">$</span>
                  <input type="number" name="initialStop" value={formData.initialStop} onChange={handleChange} className={`${inputClass('initialStop')} pl-7`} />
                </div>
              </div>
            </div>

            <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-secondary mt-8 mb-4">Evidence & Context</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Setup Note</label>
                <textarea name="journalNote" value={formData.journalNote} onChange={handleChange} rows="2" placeholder="Why did you enter?" className={`${inputClass('journalNote')} resize-none`} />
              </div>
                            <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Emotional State</label>
                <div className="relative">
                  <select 
                    name="emotionalState" 
                    value={formData.emotionalState} 
                    onChange={handleChange} 
                    className="w-full bg-[#0B0F19]/50 border border-border-subtle rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand-primary text-text-primary appearance-none cursor-pointer"
                    style={{ colorScheme: 'dark' }} 
                  >
                    <option value="calm">Calm</option>
                    <option value="anxious">Anxious</option>
                    <option value="fomo">FOMO</option>
                    <option value="revenge">Revenge</option>
                  </select>

                </div>
              </div>
            </div>

            {/* LIVE TELEMETRY PREVIEW */}
            <div className={`mt-8 p-4 rounded-xl border flex flex-col md:flex-row justify-between items-center gap-4 transition-colors ${telemetry.isRiskBreached ? 'bg-adherence-broken/10 border-adherence-broken/30' : 'bg-brand-primary/5 border-brand-primary/20'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${telemetry.isRiskBreached ? 'bg-adherence-broken/20 text-adherence-broken' : 'bg-brand-primary/20 text-brand-primary'}`}>
                  <span className="material-symbols-outlined">{telemetry.isRiskBreached ? 'warning' : 'calculate'}</span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">Risk Protocol Check</p>
                  <p className={`text-sm font-semibold ${telemetry.isRiskBreached ? 'text-adherence-broken' : 'text-adherence-followed'}`}>
                    {telemetry.riskPercentage !== null ? `${telemetry.riskPercentage.toFixed(2)}% Equity Risk` : 'Awaiting Data...'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">R-Multiple</p>
                  <p className="text-sm font-semibold tabular-nums">{telemetry.rMultiple ? `${telemetry.rMultiple}R` : '-'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-text-secondary">Net P&L</p>
                  <p className="text-sm font-semibold tabular-nums">{telemetry.netPnl ? `$${telemetry.netPnl.toFixed(2)}` : '-'}</p>
                </div>
              </div>
            </div>

          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting} className="px-8 py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-brand-primary to-brand-secondary text-white hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-brand-primary/25 disabled:opacity-50">
              {isSubmitting ? <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Auditing...</> : <><span className="material-symbols-outlined text-[18px]">psychology</span> Save & Request Review</>}
            </button>
          </div>
        </form>
      )}

            {/* --- CSV IMPORT TAB --- */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="material-symbols-outlined text-3xl text-brand-primary">upload_file</span>
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Import trades from CSV</h3>
                <p className="text-sm text-text-secondary mt-1">The backend validates the fixed template. Nothing is saved until you confirm the preview.</p>
              </div>
            </div>
            <label className="block text-xs font-medium text-text-secondary mb-2" htmlFor="trade-csv">CSV file (maximum 700 KB)</label>
            <input
              id="trade-csv"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              className="block w-full text-sm text-text-secondary file:mr-4 file:rounded-lg file:border file:border-border-subtle file:bg-surface-elevated file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-primary hover:file:border-brand-primary"
            />
            <p className="text-[10px] text-text-tertiary mt-3 leading-relaxed">
              Required header order: symbol,direction,quantity,entry_price,exit_price,fees,currency,opened_at,closed_at,initial_risk_amount,setup_note,emotional_state
            </p>
            {csvText && <p className="text-xs text-adherence-followed mt-3">CSV loaded and ready to validate.</p>}
            <button
              type="button"
              onClick={handleCsvPreview}
              disabled={!csvText || isPreviewingCsv}
              className="mt-5 px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPreviewingCsv ? 'Validating…' : 'Validate & Preview'}
            </button>
          </div>

          {csvError && <div role="alert" className="p-4 rounded-xl bg-adherence-broken/10 border border-adherence-broken/30 text-adherence-broken text-sm">{csvError}</div>}
          {csvSuccess && <div role="status" className="p-4 rounded-xl bg-adherence-followed/10 border border-adherence-followed/30 text-adherence-followed text-sm">{csvSuccess}</div>}

          {csvPreview && (
            <div className="glass-card p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold">Import preview</h3>
                  <p className="text-xs text-text-secondary mt-1">{csvPreview.row_count} valid rows · no trades saved yet</p>
                </div>
                <button
                  type="button"
                  onClick={handleCsvCommit}
                  disabled={isCommittingCsv}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isCommittingCsv ? 'Importing…' : 'Confirm & Import'}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-text-tertiary uppercase tracking-wider border-b border-border-subtle">
                    <tr>
                      <th className="py-2 pr-3">Row</th><th className="py-2 pr-3">Symbol</th><th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Qty</th><th className="py-2 pr-3">Entry</th><th className="py-2 pr-3">Exit</th><th className="py-2">Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map((row) => (
                      <tr key={row.row_number} className="border-b border-border-subtle/50">
                        <td className="py-2 pr-3">{row.row_number}</td><td className="py-2 pr-3">{row.symbol}</td><td className="py-2 pr-3 capitalize">{row.direction}</td>
                        <td className="py-2 pr-3">{row.quantity}</td><td className="py-2 pr-3">{row.entry_price}</td><td className="py-2 pr-3">{row.exit_price ?? 'Open'}</td><td className="py-2">{row.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    
  );
}