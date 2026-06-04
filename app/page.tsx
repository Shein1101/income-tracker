"use client";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useMemo } from "react";

type Transaction = {
  id: string;
  amount: number;
  type: "income" | "expense";
  user_name: string;
  transaction_date: string;
  note?: string;
};

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0 });

// ── CSV export ────────────────────────────────────────────────────────────────
const exportCSV = (rows: Transaction[], filename: string) => {
  const header = "id,amount,type,user_name,transaction_date,note";
  const body = rows
    .map((r) => `${r.id},${r.amount},${r.type},${r.user_name},${r.transaction_date},"${r.note || ""}"`)
    .join("\n");
  const blob = new Blob([header + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Home() {
  // ── state ──────────────────────────────────────────────────────────────────
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [type, setType] = useState<"income" | "expense">("income");
  const [userName, setUserName] = useState("shein");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editType, setEditType] = useState<"income" | "expense">("income");
  const [editNote, setEditNote] = useState("");
  const [historyUser, setHistoryUser] = useState("shein");
  const [historyYear, setHistoryYear] = useState("2026");
  const [historyMonth, setHistoryMonth] = useState("06");
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [activeTab, setActiveTab] = useState<"dashboard" | "history" | "report">("dashboard");

  // ── load & realtime ────────────────────────────────────────────────────────
  const loadTransactions = async () => {
    const { data, error } = await supabase.from("transactions").select("*");
    if (error) { console.log(error); return; }
    setTransactions(data);
  };

  useEffect(() => {
    loadTransactions();
    const channel = supabase
      .channel("transactions-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, loadTransactions)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── dark mode body class ───────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.background = darkMode ? "#0f1117" : "#f5f6fa";
    document.body.style.color = darkMode ? "#e8e8f0" : "#1a1a2e";
  }, [darkMode]);

  // ── filtered / sorted transactions ────────────────────────────────────────
  const filteredTransactions = useMemo(() => {
    let list = transactions.filter((t) => {
      if (!t.transaction_date) return false;
      const [y, m] = t.transaction_date.split("-");
      return t.user_name === historyUser && y === historyYear && m === historyMonth;
    });
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.amount.toString().includes(q) ||
          t.type.includes(q) ||
          t.transaction_date.includes(q) ||
          (t.note || "").toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      if (sortBy === "date_desc") return b.transaction_date.localeCompare(a.transaction_date);
      if (sortBy === "date_asc") return a.transaction_date.localeCompare(b.transaction_date);
      if (sortBy === "amount_desc") return b.amount - a.amount;
      return a.amount - b.amount;
    });
    return list;
  }, [transactions, historyUser, historyYear, historyMonth, searchQuery, sortBy]);

  const income = filteredTransactions.filter((t) => t.type === "income").reduce((a, b) => a + b.amount, 0);
  const expense = filteredTransactions.filter((t) => t.type === "expense").reduce((a, b) => a + b.amount, 0);
  const balance = income - expense;

  // ── recent 5 (all users, all time) ────────────────────────────────────────
  const recentTransactions = useMemo(() =>
    [...transactions]
      .filter((t) => t.transaction_date != null)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
      .slice(0, 5),
    [transactions]
  );

  // ── monthly chart data ─────────────────────────────────────────────────────
  const monthlyReport = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const m = String(i + 1).padStart(2, "0");
      const rows = transactions.filter((t) => {
        if (!t.transaction_date) return false;
        const [ty, tm] = t.transaction_date.split("-");
        return t.user_name === historyUser && ty === historyYear && tm === m;
      });
      const inc = rows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const exp = rows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      return { month: MONTHS[i].slice(0, 3), income: inc, expense: exp, balance: inc - exp };
    }),
    [transactions, historyUser, historyYear]
  );

  // ── friend vs me comparison ────────────────────────────────────────────────
  const comparisonData = useMemo(() => {
    const calc = (user: string) => {
      const rows = transactions.filter((t) => {
        if (!t.transaction_date) return false;
        const [ty, tm] = t.transaction_date.split("-");
        return t.user_name === user && ty === historyYear && tm === historyMonth;
      });
      return {
        income: rows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        expense: rows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    };
    return { shein: calc("shein"), phyu: calc("phyu") };
  }, [transactions, historyYear, historyMonth]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const addTransaction = async () => {
    if (!amount) return;
    const { error } = await supabase.from("transactions").insert([{
      amount: Number(amount), type, user_name: userName, transaction_date: transactionDate, note: note.trim() || null,
    }]);
    if (error) { alert("Error saving data"); return; }
    setAmount("");
    setNote("");
  };

  const updateTransaction = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("transactions").update({
      amount: Number(editAmount), type: editType, note: editNote.trim() || null,
    }).eq("id", editingId);
    if (error) { alert("Update failed"); return; }
    setEditingId(null); setEditAmount(""); setEditNote("");
  };

  const deleteTransaction = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) alert("Delete failed");
  };

  // ── theme tokens ──────────────────────────────────────────────────────────
  const t = {
    bg: darkMode ? "#0f1117" : "#f5f6fa",
    surface: darkMode ? "#1a1d27" : "#ffffff",
    surfaceAlt: darkMode ? "#222536" : "#f0f2f8",
    border: darkMode ? "#2e3248" : "#e2e5ef",
    text: darkMode ? "#e8e8f0" : "#1a1a2e",
    muted: darkMode ? "#8b8fa8" : "#6b7280",
    accent: "#6c63ff",
    green: darkMode ? "#34d399" : "#059669",
    red: darkMode ? "#f87171" : "#dc2626",
    greenBg: darkMode ? "#0d2a1f" : "#ecfdf5",
    redBg: darkMode ? "#2a0d0d" : "#fef2f2",
    blueBg: darkMode ? "#0d1a2a" : "#eff6ff",
    blueText: darkMode ? "#60a5fa" : "#1d4ed8",
  };

  const card: React.CSSProperties = {
    background: t.surface,
    borderRadius: 16,
    border: `1px solid ${t.border}`,
    padding: "20px 24px",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: `1px solid ${t.border}`,
    background: t.surfaceAlt,
    color: t.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.surfaceAlt,
    color: t.text,
    fontSize: 13,
    cursor: "pointer",
  };

  const btn = (variant: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties => ({
    padding: "10px 20px",
    borderRadius: 10,
    border: variant === "ghost" ? `1px solid ${t.border}` : "none",
    background: variant === "primary" ? t.accent : variant === "danger" ? t.red : "transparent",
    color: variant === "ghost" ? t.text : "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  });

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "8px 20px",
    borderRadius: 8,
    border: "none",
    background: active ? t.accent : "transparent",
    color: active ? "#fff" : t.muted,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "all 0.15s",
  });

  const metricCard = (bg: string, textColor: string): React.CSSProperties => ({
    background: bg,
    borderRadius: 14,
    padding: "18px 20px",
    flex: 1,
    minWidth: 0,
  });

  // ── Chart canvas effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "report") return;
    const existing = (window as any).__chartInstance;
    if (existing) existing.destroy();

    const canvas = document.getElementById("monthlyChart") as HTMLCanvasElement | null;
    if (!canvas) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    (window as any).__chartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: monthlyReport.map((m) => m.month),
        datasets: [
          {
            label: "Income",
            data: monthlyReport.map((m) => m.income),
            backgroundColor: darkMode ? "#34d39966" : "#05966966",
            borderColor: darkMode ? "#34d399" : "#059669",
            borderWidth: 2,
            borderRadius: 6,
          },
          {
            label: "Expense",
            data: monthlyReport.map((m) => m.expense),
            backgroundColor: darkMode ? "#f8717166" : "#dc262666",
            borderColor: darkMode ? "#f87171" : "#dc2626",
            borderWidth: 2,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: t.muted, font: { size: 11 }, autoSkip: false },
            grid: { color: t.border },
          },
          y: {
            ticks: { color: t.muted, font: { size: 11 }, callback: (v: number) => fmt(v) },
            grid: { color: t.border },
          },
        },
      },
    });
  }, [activeTab, monthlyReport, darkMode]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Chart.js CDN */}
      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" async />

      <main style={{ background: t.bg, minHeight: "100vh", padding: "24px 16px", fontFamily: "'Inter', system-ui, sans-serif", color: t.text, transition: "background 0.2s, color 0.2s" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.5 }}>💰 Shared Tracker</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: t.muted }}>Income & expense — 👩‍❤️‍👨</p>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              style={{ ...btn("ghost"), padding: "8px 14px", fontSize: 18 }}
              title="Toggle dark mode"
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
          </div>

          {/* ── Layout: form left, main right ──────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>

            {/* ── Add Transaction Form ─────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={card}>
                <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Add Transaction</h2>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input style={input} type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />

                  {/* Note field */}
                  <input
                    style={input}
                    type="text"
                    placeholder="📝 Note (e.g. from work, food, rent...)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />

                  <input style={input} type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />

                  <select style={{ ...input, cursor: "pointer" }} value={userName} onChange={(e) => setUserName(e.target.value)}>
                    <option value="shein">🙋‍♂️ Shein</option>
                    <option value="phyu">🙋‍♀️ Phyu</option>
                  </select>

                  <div style={{ display: "flex", gap: 8 }}>
                    {(["income", "expense"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setType(opt)}
                        style={{
                          flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                          background: type === opt ? (opt === "income" ? "#059669" : "#dc2626") : t.surfaceAlt,
                          color: type === opt ? "#fff" : t.muted,
                          transition: "all 0.15s",
                        }}
                      >
                        {opt === "income" ? "↑ Income" : "↓ Expense"}
                      </button>
                    ))}
                  </div>

                  <button style={{ ...btn("primary"), width: "100%", padding: "11px" }} onClick={addTransaction}>
                    + Add Transaction
                  </button>
                </div>
              </div>

              {/* Edit form */}
              {editingId && (
                <div style={{ ...card, borderColor: t.accent }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: t.accent }}>✏️ Edit Transaction</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input style={input} type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                    <input
                      style={input}
                      type="text"
                      placeholder="📝 Note (optional)"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["income", "expense"] as const).map((opt) => (
                        <button key={opt} onClick={() => setEditType(opt)} style={{
                          flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                          background: editType === opt ? (opt === "income" ? "#059669" : "#dc2626") : t.surfaceAlt,
                          color: editType === opt ? "#fff" : t.muted,
                        }}>
                          {opt === "income" ? "↑ Income" : "↓ Expense"}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ ...btn("primary"), flex: 1, padding: "9px", fontSize: 13 }} onClick={updateTransaction}>Save</button>
                      <button style={{ ...btn("ghost"), flex: 1, padding: "9px", fontSize: 13 }} onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Transactions Widget */}
              <div style={card}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>🕐 Recent</h3>
                {recentTransactions.length === 0 && (
                  <p style={{ color: t.muted, fontSize: 13 }}>No transactions yet.</p>
                )}
                {recentTransactions.map((tx) => (
                  <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: tx.type === "income" ? t.green : t.red }}>
                        {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: t.muted }}>
                        {tx.user_name} · {tx.transaction_date}
                        {tx.note && <span style={{ color: t.accent }}> · {tx.note}</span>}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: tx.type === "income" ? t.greenBg : t.redBg, color: tx.type === "income" ? t.green : t.red, fontWeight: 600 }}>
                      {tx.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right Panel ──────────────────────────────────────────────── */}
            <div>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16, background: t.surfaceAlt, padding: 4, borderRadius: 12, width: "fit-content" }}>
                {(["dashboard", "history", "report"] as const).map((tab) => (
                  <button key={tab} style={tabBtn(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                    {tab === "dashboard" ? "📊 Dashboard" : tab === "history" ? "📜 History" : "📈 Report"}
                  </button>
                ))}
              </div>

              {/* ── DASHBOARD tab ─────────────────────────────────────────── */}
              {activeTab === "dashboard" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Filters */}
                  <div style={{ ...card, padding: "14px 20px" }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <select style={selectStyle} value={historyUser} onChange={(e) => setHistoryUser(e.target.value)}>
                        <option value="shein">🙋‍♂️ Shein</option>
                        <option value="phyu">🙋‍♀️ Phyu</option>
                      </select>
                      <select style={selectStyle} value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}>
                        {Array.from({length: 21}, (_, i) => String(2015 + i)).map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <select style={selectStyle} value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}>
                        {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={metricCard(t.greenBg, t.green)}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: t.green, textTransform: "uppercase", letterSpacing: 0.5 }}>Income</p>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: t.green }}>+{fmt(income)}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: t.green, opacity: 0.7 }}>
                        {filteredTransactions.filter((t) => t.type === "income").length} transactions
                      </p>
                    </div>
                    <div style={metricCard(t.redBg, t.red)}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: t.red, textTransform: "uppercase", letterSpacing: 0.5 }}>Expense</p>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: t.red }}>-{fmt(expense)}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: t.red, opacity: 0.7 }}>
                        {filteredTransactions.filter((t) => t.type === "expense").length} transactions
                      </p>
                    </div>
                    <div style={metricCard(t.blueBg, t.blueText)}>
                      <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: t.blueText, textTransform: "uppercase", letterSpacing: 0.5 }}>Balance</p>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: balance >= 0 ? t.green : t.red }}>
                        {balance >= 0 ? "+" : ""}{fmt(balance)}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: t.blueText, opacity: 0.7 }}>
                        {filteredTransactions.length} total
                      </p>
                    </div>
                  </div>

                  {/* Friend vs Me comparison */}
                  <div style={card}>
                    <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>
                      🙋‍♂️Shein vs 🙋‍♀️ Phyu — {MONTHS[parseInt(historyMonth) - 1]} {historyYear}
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {(["shein", "phyu"] as const).map((user) => {
                        const d = comparisonData[user as "shein" | "phyu"];
                        const bal = d.income - d.expense;
                        return (
                          <div key={user} style={{ background: t.surfaceAlt, borderRadius: 12, padding: "14px 16px" }}>
                            <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700 }}>{user === "shein" ? "🙋‍♂️ Shein" : "🙋‍♀️ Phyu"}</p>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                              <span style={{ color: t.muted }}>Income</span>
                              <span style={{ color: t.green, fontWeight: 600 }}>+{fmt(d.income)}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                              <span style={{ color: t.muted }}>Expense</span>
                              <span style={{ color: t.red, fontWeight: 600 }}>-{fmt(d.expense)}</span>
                            </div>
                            <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                              <span style={{ color: t.muted }}>Balance</span>
                              <span style={{ fontWeight: 700, color: bal >= 0 ? t.green : t.red }}>{bal >= 0 ? "+" : ""}{fmt(bal)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Transaction list */}
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Transactions</h3>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          style={{ ...input, width: 160, padding: "7px 12px" }}
                          placeholder="🔍 Search…"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <select style={selectStyle} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                          <option value="date_desc">Date ↓</option>
                          <option value="date_asc">Date ↑</option>
                          <option value="amount_desc">Amount ↓</option>
                          <option value="amount_asc">Amount ↑</option>
                        </select>
                        <button
                          style={{ ...btn("ghost"), padding: "7px 14px", fontSize: 12 }}
                          onClick={() => exportCSV(filteredTransactions, `transactions-${historyUser}-${historyYear}-${historyMonth}.csv`)}
                        >
                          ⬇ CSV
                        </button>
                      </div>
                    </div>

                    {filteredTransactions.length === 0 && (
                      <p style={{ color: t.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No transactions found.</p>
                    )}
                    {filteredTransactions.map((tx) => (
                      <div key={tx.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "12px 14px", marginBottom: 8, borderRadius: 12,
                        background: tx.type === "income" ? t.greenBg : t.redBg,
                        border: `1px solid ${tx.type === "income" ? t.green + "33" : t.red + "33"}`,
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: tx.type === "income" ? t.green : t.red }}>
                            {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 11, color: t.muted }}>
                            {tx.transaction_date}
                            {tx.note && <span style={{ color: t.accent, marginLeft: 6 }}>📝 {tx.note}</span>}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 14 }}
                            onClick={() => { setEditingId(tx.id); setEditAmount(tx.amount.toString()); setEditType(tx.type); setEditNote(tx.note || ""); }}
                          >✏️</button>
                          <button
                            style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 14 }}
                            onClick={() => deleteTransaction(tx.id)}
                          >🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── HISTORY tab ────────────────────────────────────────────── */}
              {activeTab === "history" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={card}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                      <select style={selectStyle} value={historyUser} onChange={(e) => setHistoryUser(e.target.value)}>
                        <option value="shein">🙋‍♂️ Shein</option>
                        <option value="phyu">🙋‍♀️ Phyu</option>
                      </select>
                      <select style={selectStyle} value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}>
                        {Array.from({length: 21}, (_, i) => String(2015 + i)).map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <select style={selectStyle} value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}>
                        {MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
                      </select>
                      <button
                        style={{ ...btn("ghost"), padding: "7px 14px", fontSize: 12 }}
                        onClick={() => exportCSV(filteredTransactions, `history-${historyUser}-${historyYear}-${historyMonth}.csv`)}
                      >⬇ Export CSV</button>
                    </div>

                    {/* Summary */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                      {[
                        { label: "Income", value: `+${fmt(income)}`, color: t.green, bg: t.greenBg },
                        { label: "Expense", value: `-${fmt(expense)}`, color: t.red, bg: t.redBg },
                        { label: "Balance", value: `${balance >= 0 ? "+" : ""}${fmt(balance)}`, color: balance >= 0 ? t.green : t.red, bg: t.blueBg },
                        { label: "Count", value: String(filteredTransactions.length), color: t.blueText, bg: t.blueBg },
                      ].map((s) => (
                        <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "12px 14px" }}>
                          <p style={{ margin: 0, fontSize: 11, color: s.color, opacity: 0.8, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</p>
                          <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Income list */}
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, color: t.green }}>↑ Income</h4>
                    {filteredTransactions.filter((t) => t.type === "income").map((tx) => (
                      <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
                        <div>
                          <span style={{ color: t.muted }}>{tx.transaction_date}</span>
                          {tx.note && <span style={{ color: t.accent, marginLeft: 8 }}>📝 {tx.note}</span>}
                        </div>
                        <span style={{ color: t.green, fontWeight: 600 }}>+{fmt(tx.amount)}</span>
                      </div>
                    ))}
                    {filteredTransactions.filter((t) => t.type === "income").length === 0 && (
                      <p style={{ color: t.muted, fontSize: 13 }}>No income records.</p>
                    )}

                    {/* Expense list */}
                    <h4 style={{ margin: "16px 0 8px", fontSize: 13, color: t.red }}>↓ Expense</h4>
                    {filteredTransactions.filter((t) => t.type === "expense").map((tx) => (
                      <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}`, fontSize: 13 }}>
                        <div>
                          <span style={{ color: t.muted }}>{tx.transaction_date}</span>
                          {tx.note && <span style={{ color: t.accent, marginLeft: 8 }}>📝 {tx.note}</span>}
                        </div>
                        <span style={{ color: t.red, fontWeight: 600 }}>-{fmt(tx.amount)}</span>
                      </div>
                    ))}
                    {filteredTransactions.filter((t) => t.type === "expense").length === 0 && (
                      <p style={{ color: t.muted, fontSize: 13 }}>No expense records.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── REPORT tab ────────────────────────────────────────────── */}
              {activeTab === "report" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>📊 Monthly Chart — {historyYear}</h3>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <select style={selectStyle} value={historyUser} onChange={(e) => setHistoryUser(e.target.value)}>
                          <option value="shein">🙋‍♂️ Shein</option>
                          <option value="phyu">🙋‍♀️ Phyu</option>
                        </select>
                        <select style={selectStyle} value={historyYear} onChange={(e) => setHistoryYear(e.target.value)}>
                          {Array.from({length: 21}, (_, i) => String(2015 + i)).map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Legend */}
                    <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.muted }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.green, display: "inline-block" }} />Income
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.muted }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: t.red, display: "inline-block" }} />Expense
                      </span>
                    </div>

                    <div style={{ position: "relative", width: "100%", height: 280 }}>
                      <canvas id="monthlyChart" role="img" aria-label="Monthly income and expense bar chart">Monthly income and expense data for each month of the year.</canvas>
                    </div>
                  </div>

                  {/* Year Table */}
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>📋 Year Report Table</h3>
                      <button
                        style={{ ...btn("ghost"), padding: "6px 12px", fontSize: 12 }}
                        onClick={() => {
                          const rows = monthlyReport.map((r) => ({
                            id: r.month, amount: r.income, type: "income" as const, user_name: historyUser, transaction_date: `${historyYear}-${MONTHS.indexOf(r.month) + 1}-01`,
                          }));
                          exportCSV(rows, `year-report-${historyUser}-${historyYear}.csv`);
                        }}
                      >⬇ Export</button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: t.surfaceAlt }}>
                            {["Month", "Income", "Expense", "Balance"].map((h) => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: h === "Month" ? "left" : "right", color: t.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyReport.map((r, i) => (
                            <tr key={r.month} style={{ borderBottom: `1px solid ${t.border}`, background: i % 2 === 0 ? "transparent" : t.surfaceAlt + "55" }}>
                              <td style={{ padding: "10px 14px", fontWeight: 500 }}>{MONTHS[i]}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", color: t.green, fontWeight: 600 }}>{r.income > 0 ? `+${fmt(r.income)}` : "—"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", color: r.expense > 0 ? t.red : t.muted, fontWeight: 600 }}>{r.expense > 0 ? `-${fmt(r.expense)}` : "—"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: r.balance >= 0 ? t.green : t.red }}>{r.balance >= 0 ? "+" : ""}{fmt(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile responsive */}
          <style>{`
            @media (max-width: 768px) {
              main > div > div:last-child {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>
      </main>
    </>
  );
}