import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
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
import { Plus, Trash2, Edit, Boxes } from "lucide-react";

const emptyForm = () => ({ kode: "", name: "", harga: 0, pcs: 1 });

export default function JerseySupplies() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = async () => {
    try {
      const { data } = await api.get("/jersey-supplies");
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/jersey-supplies")
      .then(({ data }) => active && setItems(data))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ name: item.name, harga: item.harga, pcs: item.pcs });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        kode: (form.kode || "").trim(),
        name: form.name,
        harga: Number(form.harga) || 0,
        pcs: parseInt(form.pcs, 10) || 0,
      };
      if (editing) {
        await api.put(`/jersey-supplies/${editing.id}`, payload);
        toast.success("Perlengkapan diperbarui");
      } else {
        await api.post("/jersey-supplies", payload);
        toast.success("Perlengkapan ditambahkan");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Hapus perlengkapan ini?")) return;
    try {
      await api.delete(`/jersey-supplies/${id}`);
      toast.success("Perlengkapan dihapus");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const formTotal = (Number(form.harga) || 0) * (parseInt(form.pcs, 10) || 0);
  const grandTotal = items.reduce((a, b) => a + Number(b.total || 0), 0);
  const totalPcs = items.reduce((a, b) => a + (parseInt(b.pcs, 10) || 0), 0);

  return (
    <div className="p-8 sm:p-12 max-w-7xl">
      <PageHeader
        eyebrow="08 — Inventaris"
        title="Perlengkapan Jersey"
        description="Stok perlengkapan operasional (hanger, plastik, label, dll). Otomatis tersinkron ke Buku Kas (pembelian) dan Neraca (aktiva perlengkapan jersey)."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
                data-testid="add-supply-button"
              >
                <Plus className="w-4 h-4 mr-2" /> Tambah Perlengkapan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl tracking-tight">
                  {editing ? "Edit Perlengkapan" : "Tambah Perlengkapan"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Kode Barang</Label>
                    <Input
                      value={form.kode}
                      onChange={(e) => setForm({ ...form, kode: e.target.value.toUpperCase() })}
                      placeholder="cth. HNG-01"
                      required
                      data-testid="supply-kode-input"
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Nama Barang</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="cth. Hanger, Plastik kemasan, Label"
                      required
                      data-testid="supply-name-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Harga / Pcs (Rp)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.harga}
                      onChange={(e) => setForm({ ...form, harga: e.target.value })}
                      required
                      data-testid="supply-harga-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Pcs</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={form.pcs}
                      onChange={(e) => setForm({ ...form, pcs: e.target.value })}
                      required
                      data-testid="supply-pcs-input"
                    />
                  </div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Total</span>
                  <span className="font-heading text-lg font-bold tabular-nums" data-testid="form-total-preview">
                    {formatRupiah(formTotal)}
                  </span>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-supply-button">
                    {editing ? "Simpan" : "Tambah"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <Card className="border border-gray-200 bg-white p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-blue-50 text-blue-900 flex items-center justify-center">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Jenis Barang</div>
            <div className="font-heading text-2xl font-bold tabular-nums">{items.length}</div>
          </div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Total Pcs</div>
          <div className="font-heading text-2xl font-bold tabular-nums mt-1">{totalPcs}</div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Nilai Inventori</div>
          <div className="font-heading text-2xl font-bold tabular-nums mt-1" data-testid="supplies-grand-total">
            {formatRupiah(grandTotal)}
          </div>
        </Card>
      </div>

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="supplies-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-gray-500 mb-3">Belum ada perlengkapan tercatat.</div>
            <Button onClick={openCreate} variant="outline">Tambah perlengkapan pertama</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Kode</TableHead>
                <TableHead>Nama Barang</TableHead>
                <TableHead className="text-right">Harga / Pcs</TableHead>
                <TableHead className="text-right">Pcs</TableHead>
                <TableHead className="text-right">Terpakai</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-testid={`supply-row-${item.id}`}>
                  <TableCell className="font-mono text-xs font-semibold text-blue-900">{item.kode}</TableCell>
                  <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(item.harga)}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.pcs}</TableCell>
                  <TableCell className="text-right tabular-nums text-gray-500" data-testid={`pcs-used-${item.id}`}>
                    {item.pcs_used || 0}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${item.pcs_left === 0 ? "text-red-700" : item.pcs_left <= 5 ? "text-amber-700" : "text-emerald-800"}`} data-testid={`pcs-left-${item.id}`}>
                    {item.pcs_left ?? item.pcs}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatRupiah(item.total)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`edit-supply-${item.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} data-testid={`delete-supply-${item.id}`}>
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
