import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import PeriodFilter, { periodToParams } from "@/components/PeriodFilter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Receipt } from "lucide-react";

const emptyForm = () => ({
  name: "",
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
});

export default function Beban() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [period, setPeriod] = useState("all");

  const load = async (p = period) => {
    try {
      const { data } = await api.get("/beban", { params: periodToParams(p) });
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/beban", { params: periodToParams("all") })
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name,
      amount: item.amount,
      date: item.date || new Date().toISOString().slice(0, 10),
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, amount: Number(form.amount) || 0 };
      if (editing) {
        await api.put(`/beban/${editing.id}`, payload);
        toast.success("Beban diperbarui");
      } else {
        await api.post("/beban", payload);
        toast.success("Beban tercatat");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Hapus beban ini?")) return;
    try {
      await api.delete(`/beban/${id}`);
      toast.success("Beban dihapus");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const total = items.reduce((a, b) => a + Number(b.amount || 0), 0);

  return (
    <div className="p-8 sm:p-12 max-w-6xl">
      <PageHeader
        eyebrow="07 — Operasional"
        title="Beban"
        description="Catat biaya-biaya operasional bisnis (listrik, transport, sewa, dll). Otomatis tersinkron ke Buku Kas Bank & Laporan Laba Rugi."
        action={
          <div className="flex items-center gap-3">
            <PeriodFilter value={period} onChange={onPeriodChange} testid="beban-period" />
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
                data-testid="add-beban-button"
              >
                <Plus className="w-4 h-4 mr-2" /> Tambah Beban
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl tracking-tight">
                  {editing ? "Edit Beban" : "Tambah Beban"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Nama Beban</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="cth. Listrik, Sewa toko, ATK"
                    required
                    data-testid="beban-name-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Harga (Rp)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      required
                      data-testid="beban-amount-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Tanggal</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                      data-testid="beban-date-input"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-beban-button">
                    {editing ? "Simpan" : "Tambah"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="border border-gray-200 bg-white p-6 mb-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-md bg-red-50 text-red-800 flex items-center justify-center">
          <Receipt className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Total Beban</div>
          <div className="font-heading text-2xl font-bold text-red-800 tabular-nums" data-testid="total-beban-value">
            {formatRupiah(total)}
          </div>
        </div>
        <div className="text-xs text-gray-500 font-mono">{items.length} entri</div>
      </Card>

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="beban-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-gray-500 mb-3">Belum ada beban tercatat.</div>
            <Button onClick={openCreate} variant="outline">Tambah beban pertama</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Nama Beban</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-testid={`beban-row-${item.id}`}>
                  <TableCell className="font-mono text-xs">{formatDate(item.date)}</TableCell>
                  <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-800 font-semibold">
                    {formatRupiah(item.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`edit-beban-${item.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} data-testid={`delete-beban-${item.id}`}>
                        <Trash2 className="w-4 h-4 text-red-700" />
                      </Button>
                    </div>
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
