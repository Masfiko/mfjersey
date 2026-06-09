import { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import PeriodFilter, { periodToParams } from "@/components/PeriodFilter";
import { Card } from "@/components/ui/card";

export default function ProfitLoss() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    let active = true;
    api
      .get("/profit-loss", { params: periodToParams("all") })
      .then(({ data }) => active && setData(data));
    return () => {
      active = false;
    };
  }, []);

  const onPeriodChange = async (p) => {
    setPeriod(p);
    setData(null);
    const { data } = await api.get("/profit-loss", { params: periodToParams(p) });
    setData(data);
  };

  if (!data) return <div className="p-10 text-sm text-gray-500 font-mono uppercase tracking-widest">Memuat...</div>;

  const positive = (data.net_profit || 0) >= 0;

  return (
    <div className="p-8 sm:p-12 max-w-4xl">
      <PageHeader
        eyebrow="05 — Performansi"
        title="Laporan Laba Rugi"
        description="Ringkasan keuntungan dari penjualan jersey dikurangi biaya operasional."
        action={<PeriodFilter value={period} onChange={onPeriodChange} testid="pl-period" />}
      />

      <Card className="border border-gray-200 bg-white p-6 sm:p-10" data-testid="pl-card">
        <Section title="Pendapatan">
          <Row label="Penjualan Jersey" value={formatRupiah(data.sales)} />
          <Row label="Harga Pokok Penjualan (HPP)" value={`(${formatRupiah(data.cogs)})`} />
          <Divider />
          <Row
            label="Laba Kotor"
            value={formatRupiah(data.gross_profit)}
            bold
            positive={data.gross_profit >= 0}
            negative={data.gross_profit < 0}
          />
        </Section>

        <Section title="Biaya-Biaya Operasional">
          {data.expenses.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Belum ada biaya tercatat pada periode ini.</div>
          ) : (
            data.expenses.map((e, i) => (
              <Row key={i} label={`${e.description} · ${formatDate(e.date)}`} value={`(${formatRupiah(e.amount)})`} muted />
            ))
          )}
          <Divider />
          <Row label="Total Biaya" value={`(${formatRupiah(data.total_expenses)})`} bold negative />
        </Section>

        <Section title="Pendapatan Lain-Lain">
          {data.other_income_items.length === 0 ? (
            <div className="text-sm text-gray-500 italic">Tidak ada pendapatan lain pada periode ini.</div>
          ) : (
            data.other_income_items.map((e, i) => (
              <Row key={i} label={`${e.description} · ${formatDate(e.date)}`} value={formatRupiah(e.amount)} muted />
            ))
          )}
          <Divider />
          <Row label="Total Pendapatan Lain" value={formatRupiah(data.other_income)} bold positive />
        </Section>

        <div className={`mt-10 p-6 border-2 ${positive ? "border-emerald-700 bg-emerald-50" : "border-red-700 bg-red-50"} rounded-md`}>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-gray-600">
                {positive ? "Laba Bersih" : "Rugi Bersih"}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-mono">
                {data.items_sold_count} item terjual
              </div>
            </div>
            <div
              className={`font-heading text-3xl sm:text-4xl font-bold tabular-nums ${positive ? "text-emerald-800" : "text-red-800"}`}
              data-testid="net-profit-value"
            >
              {formatRupiah(data.net_profit)}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-4 pb-2 border-b border-gray-200">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, value, bold, positive, negative, muted }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className={`text-sm ${bold ? "font-semibold text-gray-900" : muted ? "text-gray-500" : "text-gray-700"}`}>{label}</div>
      <div
        className={`tabular-nums ${bold ? "font-heading text-lg font-bold" : "text-sm"} ${
          positive ? "text-emerald-800" : negative ? "text-red-800" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-200 my-2" />;
}
