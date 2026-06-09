import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save } from "lucide-react";

const FIELDS = [
  { key: "kas", label: "Kas" },
  { key: "kas_bank", label: "Kas Bank" },
  { key: "piutang", label: "Piutang Usaha" },
  { key: "persediaan_jersey", label: "Persediaan Jersey" },
  { key: "perlengkapan_jersey", label: "Perlengkapan Jersey" },
  { key: "perlengkapan", label: "Perlengkapan" },
];

export default function BeginningBalance() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/beginning-balance");
      setData(data);
    })();
  }, []);

  if (!data) {
    return <div className="p-10 text-sm text-gray-500 font-mono uppercase tracking-widest">Memuat...</div>;
  }

  const total = FIELDS.reduce((acc, f) => acc + (Number(data[f.key]) || 0), 0);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = Object.fromEntries(FIELDS.map((f) => [f.key, Number(data[f.key]) || 0]));
      const { data: res } = await api.put("/beginning-balance", payload);
      setData(res);
      toast.success("Saldo awal tersimpan");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 sm:p-12 max-w-4xl">
      <PageHeader
        eyebrow="03 — Modal Awal"
        title="Saldo Awal"
        description="Catat posisi aset awal sebelum operasional dimulai. Nilai ini menjadi titik referensi neraca dan buku kas."
      />

      <form onSubmit={onSave}>
        <Card className="border border-gray-200 bg-white p-6 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">{f.label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={data[f.key] ?? 0}
                  onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
                  data-testid={`bb-input-${f.key}`}
                />
                <div className="text-xs text-gray-500 font-mono">
                  {formatRupiah(Number(data[f.key]) || 0)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 flex items-baseline justify-between">
            <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Total Aset Awal</div>
            <div className="font-heading text-3xl font-bold text-gray-900 tabular-nums" data-testid="total-assets-value">
              {formatRupiah(total)}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
              data-testid="save-bb-button"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Menyimpan..." : "Simpan Saldo Awal"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
