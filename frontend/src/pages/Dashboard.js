import { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, Wallet, Package, Coins, ArrowUpRight, ArrowDownRight } from "lucide-react";

function Stat({ label, value, sub, accent, icon: Icon, testid }) {
  return (
    <Card
      className="border border-gray-200 bg-white p-6 sm:p-8 hover:-translate-y-1 hover:shadow-lg hover:border-gray-300 transition-all duration-200"
      data-testid={testid}
    >
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
      </div>
      <div className={`font-heading text-2xl sm:text-3xl font-bold mt-3 tabular-nums ${accent || "text-gray-900"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-2 font-mono">{sub}</div>}
    </Card>
  );
}

function compactRupiah(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return `${v}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [chart, setChart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: summary }, { data: chartData }] = await Promise.all([
          api.get("/summary"),
          api.get("/dashboard-chart"),
        ]);
        setData(summary);
        setChart(chartData.months || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-10 text-sm text-gray-500 font-mono uppercase tracking-widest">
        Memuat ringkasan...
      </div>
    );
  }
  if (!data) return null;

  const netPositive = (data.net_profit || 0) >= 0;

  return (
    <div className="p-8 sm:p-12 max-w-7xl">
      <PageHeader
        eyebrow="01 — Ringkasan"
        title="Dashboard Finansial"
        description="Pandangan menyeluruh atas posisi keuangan bisnis jersey vintage Anda hari ini."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <Stat label="Total Aset" value={formatRupiah(data.total_assets)} icon={Wallet} testid="stat-total-assets" />
        <Stat
          label="Laba Bersih"
          value={formatRupiah(data.net_profit)}
          accent={netPositive ? "text-emerald-800" : "text-red-800"}
          sub={netPositive ? "Profitabel" : "Rugi"}
          icon={TrendingUp}
          testid="stat-net-profit"
        />
        <Stat label="Saldo Kas" value={formatRupiah(data.cash_balance)} icon={Coins} testid="stat-cash-balance" />
        <Stat
          label="Nilai Persediaan"
          value={formatRupiah(data.inventory_value)}
          sub={`${data.items?.available || 0} dari ${data.items?.total || 0} item tersedia`}
          icon={Package}
          testid="stat-inventory"
        />
      </div>

      {/* CHART */}
      <Card className="border border-gray-200 bg-white p-6 sm:p-8 mb-6" data-testid="chart-card">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Arus Kas — 6 Bulan</div>
            <div className="font-heading text-xl font-semibold text-gray-900 mt-1">Pemasukan vs Pengeluaran</div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
              <span className="text-gray-600 font-medium">Pemasukan</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-red-700 inline-block" />
              <span className="text-gray-600 font-medium">Pengeluaran</span>
            </div>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b91c1c" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={compactRupiah}
                width={50}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
                formatter={(v) => formatRupiah(v)}
                labelStyle={{ color: "#111827", fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#059669"
                strokeWidth={2}
                fill="url(#incomeGrad)"
                name="Pemasukan"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#b91c1c"
                strokeWidth={2}
                fill="url(#expenseGrad)"
                name="Pengeluaran"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border border-gray-200 p-6 sm:p-8 bg-white">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Ringkasan Laba Rugi</div>
              <div className="font-heading text-xl font-semibold text-gray-900 mt-1">Profit & Loss</div>
            </div>
          </div>
          <div className="space-y-3">
            <Row label="Penjualan" value={formatRupiah(data.sales)} positive />
            <Row label="HPP (Cost of Goods Sold)" value={`(${formatRupiah(data.cogs)})`} negative />
            <div className="border-t border-gray-200 pt-3">
              <Row label="Laba Kotor" value={formatRupiah(data.sales - data.cogs)} bold />
            </div>
            <div className="border-t border-gray-200 pt-3">
              <Row
                label="Laba Bersih"
                value={formatRupiah(data.net_profit)}
                bold
                positive={netPositive}
                negative={!netPositive}
              />
            </div>
          </div>
        </Card>

        <Card className="border border-gray-200 p-6 sm:p-8 bg-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Item</div>
          <div className="font-heading text-xl font-semibold text-gray-900 mt-1 mb-6">Status Stok</div>
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div className="text-sm text-gray-600">Total Item</div>
              <div className="font-heading text-2xl font-bold tabular-nums">{data.items?.total || 0}</div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-sm text-gray-600">Tersedia</div>
              <div className="font-heading text-2xl font-bold tabular-nums text-emerald-800">
                {data.items?.available || 0}
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="text-sm text-gray-600">Terjual</div>
              <div className="font-heading text-2xl font-bold tabular-nums text-gray-500">
                {data.items?.sold || 0}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6 border border-gray-200 bg-white">
        <div className="p-6 sm:p-8 border-b border-gray-200">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Aktivitas</div>
          <div className="font-heading text-xl font-semibold text-gray-900 mt-1">Transaksi Terbaru</div>
        </div>
        {(data.recent_transactions || []).length === 0 ? (
          <div className="p-8 text-sm text-gray-500 text-center">Belum ada transaksi.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right">Pemasukan</TableHead>
                <TableHead className="text-right">Pengeluaran</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_transactions.map((tx) => (
                <TableRow key={tx.id} data-testid={`recent-tx-${tx.id}`}>
                  <TableCell className="font-mono text-xs">{formatDate(tx.date)}</TableCell>
                  <TableCell>{tx.description}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-800">
                    {tx.income > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <ArrowUpRight className="w-3 h-3" />
                        {formatRupiah(tx.income)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-800">
                    {tx.expense > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <ArrowDownRight className="w-3 h-3" />
                        {formatRupiah(tx.expense)}
                      </span>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, positive, negative, bold }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className={`text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>{label}</div>
      <div
        className={`tabular-nums ${bold ? "font-heading text-lg font-bold" : "text-sm font-medium"} ${
          positive ? "text-emerald-800" : negative ? "text-red-800" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
