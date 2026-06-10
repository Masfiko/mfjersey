import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import PeriodFilter, { periodToParams } from "@/components/PeriodFilter";
import JerseyImage from "@/components/JerseyImage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Edit, Layers } from "lucide-react";

export default function Pelloff() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [editItem, setEditItem] = useState(null);
  const [editValue, setEditValue] = useState(0);

  const load = async (p = period) => {
    try {
      const { data } = await api.get("/penjualan/pelloff", { params: periodToParams(p) });
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/penjualan/pelloff", { params: periodToParams("all") })
      .then(({ data }) => active && setItems(data))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const onPeriodChange = async (p) => {
    setPeriod(p);
    setLoading(true);
    await load(p);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditValue(item.pelloff);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    try {
      const v = Number(editValue) || 0;
      await api.put(`/penjualan/${editItem.id}/pelloff`, { pelloff: v });
      toast.success("Pelloff diperbarui");
      setEditItem(null);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const total = items.reduce((a, b) => a + Number(b.pelloff || 0), 0);

  return (
    <div className="p-8 sm:p-12 max-w-6xl">
      <PageHeader
        eyebrow="09.1 — Pelloff"
        title="Pelloff"
        description="Daftar biaya tambahan (peel-off) per penjualan. Nilai pelloff otomatis dimasukkan ke modal (COGS) item terjual sehingga laba bersih akurat."
        action={<PeriodFilter value={period} onChange={onPeriodChange} testid="pelloff-period" />}
      />

      <Card className="border border-gray-200 bg-white p-6 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-md bg-amber-50 text-amber-800 flex items-center justify-center">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Total Pelloff</div>
          <div className="font-heading text-2xl font-bold text-amber-800 tabular-nums" data-testid="pelloff-total">
            {formatRupiah(total)}
          </div>
        </div>
        <div className="text-xs text-gray-500 font-mono">{items.length} transaksi</div>
      </Card>

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="pelloff-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-gray-500 mb-2">Belum ada pelloff tercatat.</div>
            <div className="text-xs text-gray-400">
              Pelloff diisi saat mencatat penjualan baru di menu <span className="font-semibold text-blue-900">Penjualan</span>.
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Harga Jual</TableHead>
                <TableHead className="text-right">Pelloff</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-testid={`pelloff-row-${item.id}`}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{formatDate(item.sold_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <JerseyImage path={item.image_path} className="w-10 h-10 rounded-md object-cover border border-gray-200 bg-gray-50" />
                      <div className="font-medium text-gray-900">{item.item_name}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-800">{formatRupiah(item.sale_price)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-amber-800">{formatRupiah(item.pelloff)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`edit-pelloff-${item.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tight">Edit Pelloff</DialogTitle>
          </DialogHeader>
          {editItem && (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="text-sm text-gray-600">
                Item: <span className="font-semibold text-gray-900">{editItem.item_name}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Pelloff (Rp)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  required
                  data-testid="edit-pelloff-input"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditItem(null)}>Batal</Button>
                <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-pelloff-button">
                  Simpan
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
