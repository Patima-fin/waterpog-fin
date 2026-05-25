/* page_daily_balance.jsx — บันทึกยอดธนาคารรายวัน
 *
 * บัญชี 'main' = หมุนเวียนรายวัน → ต้องบันทึกยอดทุกวัน (เตือนได้)
 * บัญชี 'dormant' = เงินนิ่ง (ฝากประจำ/ค้ำประกัน) → กรอกเมื่อเคลื่อนไหวเท่านั้น
 *
 * บันทึกลง sheet cashflowSnapshots — 1 row ต่อ (date × bankAc)
 * เปลี่ยน BALANCE ใน bankAccounts อัตโนมัติด้วย (ให้ตรงกัน)
 */
'use strict';

const { useState: dbState, useMemo: dbMemo, useEffect: dbEffect } = React;

// Helpers
function todayISO() { return new Date().toISOString().slice(0, 10); }
function isWeekend(iso) {
  const d = new Date(iso); const day = d.getDay();
  return day === 0 || day === 6;
}
function fmtDateInput(iso) {
  if (!iso) return '';
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

// Diff badge
function DiffBadge({ delta }) {
  if (delta == null || isNaN(delta)) return null;
  if (delta === 0) return <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>—</span>;
  const big = Math.abs(delta) >= 100000;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      color: delta > 0 ? 'var(--good)' : 'var(--bad)',
      background: big ? (delta > 0 ? 'var(--good-bg)' : 'var(--bad-bg)') : 'transparent',
      padding: big ? '1px 6px' : 0, borderRadius: 4,
    }}>
      {delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta), 2)}
    </span>
  );
}

function DailyBalancePage({ data, setData, toast }) {
  // ── State ─────────────────────────────────────────────────────────
  const [entryDate, setEntryDate] = dbState(todayISO());
  const accounts = data.bankAccounts || [];
  const snapshots = data.cashflowSnapshots || [];

  // Split by accountType (default 'main' if unset — for backward compat)
  const accountsByType = dbMemo(() => {
    const main = [], dormant = [];
    accounts.forEach(a => {
      const t = (a.accountType || 'main').toLowerCase();
      if (t === 'closed') return;
      if (t === 'dormant') dormant.push(a);
      else main.push(a);
    });
    return { main, dormant };
  }, [accounts]);

  // Yesterday balance lookup — for each account, most recent snapshot BEFORE entryDate
  const yesterdayByAc = dbMemo(() => {
    const map = {};
    accounts.forEach(a => {
      const ac = a.Bank_AC;
      const past = snapshots
        .filter(s => s.bankAc === ac && s.date && s.date < entryDate)
        .sort((x, y) => (y.date || '').localeCompare(x.date || ''));
      map[ac] = past[0] || null;
    });
    return map;
  }, [snapshots, accounts, entryDate]);

  // Today's already-saved snapshots (so editing is supported)
  const todayByAc = dbMemo(() => {
    const map = {};
    snapshots.filter(s => s.date === entryDate).forEach(s => { map[s.bankAc] = s; });
    return map;
  }, [snapshots, entryDate]);

  // Input draft — text per account; pre-fill from today's snapshot if exists
  const [draft, setDraft] = dbState({});
  dbEffect(() => {
    const init = {};
    accounts.forEach(a => {
      const todays = todayByAc[a.Bank_AC];
      if (todays) init[a.Bank_AC] = String(todays.balance);
    });
    setDraft(init);
  }, [entryDate, accounts.length, snapshots.length]);

  const setDraftVal = (ac, v) => setDraft(d => ({ ...d, [ac]: v }));
  const useYesterday = (ac) => {
    const y = yesterdayByAc[ac];
    if (y) setDraftVal(ac, String(y.balance));
  };
  const useAllYesterday = () => {
    const next = { ...draft };
    accountsByType.main.forEach(a => {
      const y = yesterdayByAc[a.Bank_AC];
      if (y) next[a.Bank_AC] = String(y.balance);
    });
    setDraft(next);
  };

  // ── Compute totals + diff per row ─────────────────────────────────
  const rowsWithDiff = (list) => list.map(a => {
    const ac = a.Bank_AC;
    const yestBal = yesterdayByAc[ac] ? Number(yesterdayByAc[ac].balance) : null;
    const newBal  = draft[ac] !== undefined && draft[ac] !== '' ? Number(draft[ac]) : null;
    const delta   = (yestBal != null && newBal != null) ? (newBal - yestBal) : null;
    return { a, ac, yestBal, newBal, delta, saved: !!todayByAc[ac] };
  });

  const mainRows    = rowsWithDiff(accountsByType.main);
  const dormantRows = rowsWithDiff(accountsByType.dormant);

  const mainSavedCount = mainRows.filter(r => r.saved).length;
  const mainTotalCount = mainRows.length;
  const todayTotal     = mainRows.reduce((s, r) => s + (r.newBal != null ? r.newBal : 0), 0);
  const yestTotal      = mainRows.reduce((s, r) => s + (r.yestBal != null ? r.yestBal : 0), 0);
  const todayDelta     = todayTotal - yestTotal;

  // Mini history — last 7 days total balance
  const sevenDayTotal = dbMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(entryDate);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const total = accountsByType.main.reduce((sum, a) => {
        const snap = snapshots.find(s => s.bankAc === a.Bank_AC && s.date === iso);
        return sum + (snap ? Number(snap.balance) || 0 : 0);
      }, 0);
      days.push({ date: iso, total });
    }
    return days;
  }, [snapshots, accountsByType.main, entryDate]);

  // ── Save handlers ─────────────────────────────────────────────────
  const saveOne = (ac) => {
    if (draft[ac] === undefined || draft[ac] === '') {
      toast('กรอกยอดก่อน');
      return;
    }
    const balance = Number(draft[ac]);
    if (isNaN(balance)) { toast('กรอกตัวเลขให้ถูกต้อง'); return; }
    const a = accounts.find(x => x.Bank_AC === ac);
    const existing = todayByAc[ac];
    const session = JSON.parse(localStorage.getItem('wtp-session') || 'null');
    const row = {
      id: existing ? existing.id : WTPData.newId(),
      date: entryDate,
      bankAc: ac,
      bankName: a?.BANK_NAME || '',
      balance,
      takenAt: new Date().toISOString(),
      enteredBy: (session && session.username) || 'unknown',
      source: 'manual_daily',
      note: existing ? 'override ' + new Date().toLocaleTimeString('th-TH') : '',
    };
    setData(d => {
      const others = (d.cashflowSnapshots || []).filter(s => !(s.date === entryDate && s.bankAc === ac));
      // Also update bankAccounts.BALANCE so live balance stays in sync
      const updatedAccounts = (d.bankAccounts || []).map(acc =>
        acc.Bank_AC === ac ? { ...acc, BALANCE: balance, DATE: entryDate } : acc
      );
      return { ...d, cashflowSnapshots: [...others, row], bankAccounts: updatedAccounts };
    });
    toast(`บันทึก ${a?.BANK_NAME || ac} แล้ว`);
  };

  const saveAll = () => {
    const toSave = mainRows.filter(r => draft[r.ac] !== undefined && draft[r.ac] !== '');
    if (toSave.length === 0) { toast('ยังไม่มีรายการที่จะบันทึก'); return; }
    if (!confirm(`บันทึก ${toSave.length} บัญชี ที่ค่าวันที่ ${entryDate}?`)) return;
    const session = JSON.parse(localStorage.getItem('wtp-session') || 'null');
    const stamp = new Date().toISOString();
    const newRows = toSave.map(r => ({
      id: r.saved ? todayByAc[r.ac].id : WTPData.newId(),
      date: entryDate,
      bankAc: r.ac,
      bankName: r.a.BANK_NAME || '',
      balance: Number(draft[r.ac]),
      takenAt: stamp,
      enteredBy: (session && session.username) || 'unknown',
      source: 'manual_daily',
      note: '',
    }));
    const savedAcs = new Set(newRows.map(r => r.bankAc));
    setData(d => {
      const others = (d.cashflowSnapshots || []).filter(s => !(s.date === entryDate && savedAcs.has(s.bankAc)));
      const updatedAccounts = (d.bankAccounts || []).map(acc => {
        const newRow = newRows.find(r => r.bankAc === acc.Bank_AC);
        if (!newRow) return acc;
        return { ...acc, BALANCE: newRow.balance, DATE: entryDate };
      });
      return { ...d, cashflowSnapshots: [...others, ...newRows], bankAccounts: updatedAccounts };
    });
    toast(`บันทึกแล้ว ${newRows.length} บัญชี`);
  };

  // Permission gate — manager/staff can save; viewer/owner can't
  const canEdit = window.WTPAuth ? window.WTPAuth.can('canEdit') : true;

  const weekend = isWeekend(entryDate);

  return (
    <div className="page">
      <div className="page-head anim-in">
        <div>
          <h1 className="page-title">บันทึกยอดธนาคาร · {fmtDate(entryDate)}</h1>
          <div className="page-sub">
            {weekend && <span style={{ color: 'var(--warn)', marginRight: 10 }}>⚠️ วันหยุด — ธนาคารปิด</span>}
            {mainSavedCount === mainTotalCount && mainTotalCount > 0
              ? <span style={{ color: 'var(--good)', fontWeight: 600 }}>✓ บันทึกครบ {mainTotalCount}/{mainTotalCount} บัญชีหลักแล้ว</span>
              : <span style={{ color: 'var(--bad)' }}>⏳ บันทึกแล้ว {mainSavedCount}/{mainTotalCount} บัญชีหลัก — ค้าง {mainTotalCount - mainSavedCount}</span>}
          </div>
        </div>
        <div className="page-head-r">
          <input
            type="date" className="input"
            value={entryDate}
            onChange={e => setEntryDate(e.target.value || todayISO())}
            style={{ width: 160 }}
            title="เปลี่ยนวันที่บันทึก (ย้อนหลังได้)"
          />
          {canEdit && (
            <button className="btn btn-ghost" onClick={useAllYesterday} title="ใส่ค่ายอดเมื่อวานให้ทุกบัญชี">
              <Icon name="refresh" size={14} /> ใช้ค่าเมื่อวาน
            </button>
          )}
          <PrintButton />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-4 anim-stagger" style={{ marginBottom: 16 }}>
        <KpiTile animate={false} label="บัญชีที่บันทึก" value={mainSavedCount} unit={` / ${mainTotalCount}`} digits={0}
          accent={mainSavedCount === mainTotalCount ? 'var(--good)' : 'var(--bad)'} icon="check" />
        <KpiTile animate={false} label="รวมยอดวันนี้"   value={todayTotal}  accent="var(--brand-500)" icon="bank" />
        <KpiTile animate={false} label="รวมยอดเมื่อวาน" value={yestTotal}   accent="oklch(52% 0.16 220)" icon="bank" />
        <KpiTile animate={false} label="เปลี่ยนแปลง"     value={todayDelta}  accent={todayDelta >= 0 ? 'var(--good)' : 'var(--bad)'} icon={todayDelta >= 0 ? 'arrow_up' : 'arrow_down'} />
      </div>

      {/* 7-day mini-trend */}
      {sevenDayTotal.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>7 วันล่าสุด:</div>
          {sevenDayTotal.map((d, i) => {
            const isToday = d.date === entryDate;
            const has = d.total > 0;
            return (
              <div key={i} style={{
                padding: '6px 10px', borderRadius: 6,
                background: isToday ? 'var(--brand-50)' : 'var(--ink-50)',
                border: `1px solid ${isToday ? 'var(--brand-200)' : 'var(--line)'}`,
                minWidth: 100, textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, color: 'var(--ink-500)' }}>
                  {new Date(d.date).toLocaleDateString('th-TH', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: has ? 'var(--ink-800)' : 'var(--ink-300)', fontVariantNumeric: 'tabular-nums' }}>
                  {has ? fmtNum(d.total, 0) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MAIN accounts (daily-entry required) */}
      <div className="card anim-in" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '10px 16px', background: '#f0f9ff', borderBottom: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>🏦 บัญชีหลัก (หมุนเวียนรายวัน)</div>
          {canEdit && mainTotalCount > 0 && (
            <button className="btn btn-primary btn-sm" onClick={saveAll}>
              <Icon name="check" size={13} /> บันทึกทั้งหมด ({Object.keys(draft).filter(k => draft[k] !== '' && accountsByType.main.find(a => a.Bank_AC === k)).length})
            </button>
          )}
        </div>
        <table className="tbl" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>#</th>
              <th style={{ width: 110 }}>ธนาคาร</th>
              <th style={{ width: 160 }}>เลขที่บัญชี</th>
              <th style={{ width: 140, textAlign: 'right' }}>ยอดเมื่อวาน</th>
              <th style={{ width: 180, textAlign: 'right' }}>ยอดวันนี้</th>
              <th style={{ width: 110, textAlign: 'right' }}>Δ</th>
              <th style={{ width: 60 }}></th>
              <th style={{ width: 100, textAlign: 'center' }}>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {mainRows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center' }} className="muted">ยังไม่มีบัญชีหลัก — เพิ่มได้ที่หน้า DATA BANK</td></tr>
            )}
            {mainRows.map((r, i) => {
              const big = r.delta != null && Math.abs(r.delta) >= 100000;
              return (
                <tr key={r.ac} style={{ background: r.saved ? 'color-mix(in oklch, var(--good) 5%, transparent)' : undefined }}>
                  <td style={{ textAlign: 'center', color: 'var(--ink-400)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600, color: 'var(--brand-700)' }}>{r.a.BANK_NAME || '—'}</td>
                  <td style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>{r.ac}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-500)', fontSize: 12 }}>
                    {r.yestBal != null ? fmtNum(r.yestBal, 2) : <span className="muted">—</span>}
                    {r.yestBal != null && yesterdayByAc[r.ac] && (
                      <div style={{ fontSize: 10, color: 'var(--ink-400)' }}>{fmtDate(yesterdayByAc[r.ac].date)}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      placeholder={r.yestBal != null ? String(r.yestBal) : '0.00'}
                      value={draft[r.ac] !== undefined ? draft[r.ac] : ''}
                      onChange={e => setDraftVal(r.ac, e.target.value)}
                      disabled={!canEdit}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: '100%' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {big && <span title="เปลี่ยนแปลงเกิน 100,000 — ตรวจสอบอีกครั้ง" style={{ marginRight: 4 }}>⚠️</span>}
                    <DiffBadge delta={r.delta} />
                  </td>
                  <td>
                    {canEdit && r.yestBal != null && (
                      <button className="btn btn-ghost btn-sm" onClick={() => useYesterday(r.ac)}
                        title="ใช้ค่าเมื่อวาน" style={{ padding: '2px 6px', fontSize: 11 }}>
                        ↩️
                      </button>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {r.saved
                      ? <Badge kind="b-green" dot={false}>✓ บันทึกแล้ว</Badge>
                      : (draft[r.ac] !== undefined && draft[r.ac] !== ''
                          ? <button className="btn btn-primary btn-sm" onClick={() => saveOne(r.ac)} disabled={!canEdit}
                              style={{ padding: '3px 10px', fontSize: 11 }}>บันทึก</button>
                          : <span className="muted" style={{ fontSize: 11 }}>—</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {mainRows.length > 0 && (
            <tfoot>
              <tr style={{ background: 'var(--brand-50)', fontWeight: 700 }}>
                <td colSpan={3} style={{ textAlign: 'right', paddingRight: 14 }}>รวม</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(yestTotal, 2)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(todayTotal, 2)}</td>
                <td style={{ textAlign: 'right' }}><DiffBadge delta={todayDelta} /></td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* DORMANT accounts */}
      {dormantRows.length > 0 && (
        <div className="card anim-in" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>💰 บัญชีสำรอง (เงินนิ่ง — ฝากประจำ / ค้ำประกัน)</div>
            <div style={{ fontSize: 11, color: 'var(--ink-500)' }}>กรอกเมื่อมีเคลื่อนไหวเท่านั้น</div>
          </div>
          <table className="tbl" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>#</th>
                <th style={{ width: 110 }}>ธนาคาร</th>
                <th style={{ width: 160 }}>เลขที่บัญชี</th>
                <th style={{ width: 140, textAlign: 'right' }}>ยอดล่าสุด</th>
                <th style={{ width: 180, textAlign: 'right' }}>ยอดใหม่ (ถ้าเปลี่ยน)</th>
                <th style={{ width: 110, textAlign: 'right' }}>Δ</th>
                <th style={{ width: 100, textAlign: 'center' }}>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {dormantRows.map((r, i) => (
                <tr key={r.ac} style={{ background: r.saved ? 'color-mix(in oklch, var(--good) 5%, transparent)' : undefined }}>
                  <td style={{ textAlign: 'center', color: 'var(--ink-400)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.a.BANK_NAME || '—'}</td>
                  <td style={{ fontFamily: 'ui-monospace', fontSize: 12 }}>{r.ac}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-600)' }}>
                    {r.yestBal != null ? fmtNum(r.yestBal, 2) : <span className="muted">—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      className="input" type="number" step="0.01"
                      placeholder="ปล่อยว่างถ้าไม่เปลี่ยน"
                      value={draft[r.ac] !== undefined ? draft[r.ac] : ''}
                      onChange={e => setDraftVal(r.ac, e.target.value)}
                      disabled={!canEdit}
                      style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', width: '100%' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}><DiffBadge delta={r.delta} /></td>
                  <td style={{ textAlign: 'center' }}>
                    {r.saved
                      ? <Badge kind="b-green" dot={false}>✓</Badge>
                      : (draft[r.ac] !== undefined && draft[r.ac] !== ''
                          ? <button className="btn btn-primary btn-sm" onClick={() => saveOne(r.ac)} disabled={!canEdit}
                              style={{ padding: '3px 10px', fontSize: 11 }}>บันทึก</button>
                          : <span className="muted" style={{ fontSize: 11 }}>—</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Help */}
      <div className="card" style={{ marginTop: 14, padding: 14, background: '#fffbeb', borderLeft: '4px solid #f6ad55', fontSize: 12, color: 'var(--ink-700)' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>💡 หมายเหตุ</div>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>กรอกยอด balance ตามที่เห็นใน statement ธนาคารจริง — เพื่อให้ระบบตรงกับ statement ตลอดเวลา</li>
          <li>ปุ่ม "↩️" / "ใช้ค่าเมื่อวาน" = copy ยอดเมื่อวานมา (ถ้าบัญชีไม่เคลื่อนไหว)</li>
          <li>⚠️ จะขึ้นถ้าเปลี่ยนแปลงเกิน 100,000 บาท — ตรวจสอบอีกครั้งก่อนบันทึก</li>
          <li>บัญชีสำรอง (dormant) ไม่ต้องกรอกทุกวัน — กรอกเฉพาะเมื่อมีค่าธรรมเนียมตัด/โอนระหว่างบัญชี</li>
          <li>เมื่อบันทึก — ยอดใน "DATA BANK" จะ update ให้ตรงด้วยอัตโนมัติ</li>
          <li>ตั้งค่าใครจะได้รับเตือน — ไปที่ "จัดการผู้ใช้" → tick "🔔 เตือนบันทึกยอดรายวัน"</li>
        </ul>
      </div>
    </div>
  );
}

Object.assign(window, { DailyBalancePage });
