import { useEffect, useState } from "react";
import api from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

export default function BalanceSheet() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/balance-sheet");
      setData(data);
    })();
  }, []);

  if (!data) return <div className="p-10 text-sm text-gray-500 font-mono uppercase tracking-widest">Memuat...</div>;

  const balanced = Math.abs(data.aktiva.total - data.pasiva.total) < 1;

  return (
    <div className="p-8 sm:p-12 max-w-6xl">
      <PageHeader
        eyebrow="06 — Posisi Keuangan"
        title="Neraca"
        description="Posisi keuangan: Aktiva (Apa yang dimiliki) versus Pasiva (Modal & laba ditahan)."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AKTIVA */}
        <Card className="border border-gray-200 bg-white p-6 sm:p-8" data-testid="aktiva-card">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-4 pb-3 border-b border-gray-200">
            Aktiva
          </div>
          <div className="space-y-3">
            <Row label="Kas & Bank" value={formatRupiah(data.aktiva.kas)} />
            <Row label="Piutang Usaha" value={formatRupiah(data.aktiva.piutang)} />
            <Row label="Persediaan Jersey" value={formatRupiah(data.aktiva.persediaan_jersey)} />
            <Row label="Perlengkapan Jersey" value={formatRupiah(data.aktiva.perlengkapan_jersey)} />
            <Row label="Perlengkapan" value={formatRupiah(data.aktiva.perlengkapan)} />
          </div>
          <div className="border-t-2 border-gray-900 mt-6 pt-4">
            <Row label="Total Aktiva" value={formatRupiah(data.aktiva.total)} bold testid="total-aktiva" />
          </div>
        </Card>

        {/* PASIVA */}
        <Card className="border border-gray-200 bg-white p-6 sm:p-8" data-testid="pasiva-card">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-4 pb-3 border-b border-gray-200">
            Pasiva
          </div>
          <div className="space-y-3">
            <Row label="Modal Awal" value={formatRupiah(data.pasiva.modal)} />
            <Row
              label="Laba Ditahan"
              value={formatRupiah(data.pasiva.laba_ditahan)}
              positive={data.pasiva.laba_ditahan >= 0}
              negative={data.pasiva.laba_ditahan < 0}
            />
          </div>
          <div className="border-t-2 border-gray-900 mt-6 pt-4">
            <Row label="Total Pasiva" value={formatRupiah(data.pasiva.total)} bold testid="total-pasiva" />
          </div>
        </Card>
      </div>

      <div className={`mt-6 p-4 border rounded-md ${balanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`} data-testid="balance-status">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-600">
              Status Neraca
            </div>
            <div className="text-sm text-gray-700 mt-1">
              {balanced ? "Neraca seimbang — Aktiva = Pasiva." : "Neraca belum seimbang. Periksa kembali entri saldo awal & transaksi."}
            </div>
          </div>
          <div className={`text-xs font-mono uppercase tracking-widest ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
            {balanced ? "BALANCED" : "UNBALANCED"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, positive, negative, testid }) {
  return (
    <div className="flex items-baseline justify-between">
      <div className={`text-sm ${bold ? "font-semibold text-gray-900 uppercase tracking-widest text-xs" : "text-gray-700"}`}>
        {label}
      </div>
      <div
        data-testid={testid}
        className={`tabular-nums ${bold ? "font-heading text-2xl font-bold text-gray-900" : "text-sm"} ${
          positive ? "text-emerald-800" : negative ? "text-red-800" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
