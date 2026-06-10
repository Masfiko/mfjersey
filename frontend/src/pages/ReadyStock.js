import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import JerseyImage from "@/components/JerseyImage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Upload, X } from "lucide-react";

const STATUSES = ["Tersedia", "Pre-Order", "Terjual"];

function statusBadge(s) {
  const v = (s || "").toLowerCase();
  if (v === "terjual") return "bg-gray-100 text-gray-700";
  if (v === "pre-order") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

const emptyForm = {
  item_name: "",
  purchase_price: 0,
  shipping_cost: 0,
  remake_cost: 0,
  status: "Tersedia",
  image_path: null,
  sale_price: 0,
  sold_date: "",
  supplies_used: [],
};

export default function ReadyStock() {
  const [items, setItems] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const [{ data: items }, { data: supplies }] = await Promise.all([
        api.get("/ready-stock"),
        api.get("/jersey-supplies"),
      ]);
      setItems(items);
      setSupplies(supplies);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([api.get("/ready-stock"), api.get("/jersey-supplies")])
      .then(([itemsRes, suppliesRes]) => {
        if (!active) return;
        setItems(itemsRes.data);
        setSupplies(suppliesRes.data);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      item_name: item.item_name,
      purchase_price: item.purchase_price,
      shipping_cost: item.shipping_cost,
      remake_cost: item.remake_cost,
      status: item.status,
      image_path: item.image_path,
      sale_price: item.sale_price || 0,
      sold_date: item.sold_date || "",
      supplies_used: item.supplies_used || [],
    });
    setOpen(true);
  };

  const addSupplyLine = () => {
    setForm((f) => ({ ...f, supplies_used: [...(f.supplies_used || []), { kode: "", qty: 1 }] }));
  };

  const updateSupplyLine = (idx, patch) => {
    setForm((f) => ({
      ...f,
      supplies_used: (f.supplies_used || []).map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const removeSupplyLine = (idx) => {
    setForm((f) => ({
      ...f,
      supplies_used: (f.supplies_used || []).filter((_, i) => i !== idx),
    }));
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((f) => ({ ...f, image_path: data.path }));
      toast.success("Gambar berhasil diunggah");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const cleanedSupplies = (form.supplies_used || [])
        .map((s) => ({
          kode: (s.kode || "").trim(),
          qty: parseInt(s.qty, 10) || 0,
        }))
        .filter((s) => s.kode && s.qty > 0);
      const payload = {
        ...form,
        purchase_price: Number(form.purchase_price) || 0,
        shipping_cost: Number(form.shipping_cost) || 0,
        remake_cost: Number(form.remake_cost) || 0,
        sale_price: Number(form.sale_price) || 0,
        supplies_used: form.status === "Terjual" ? cleanedSupplies : [],
      };
      if (editing) {
        await api.put(`/ready-stock/${editing.id}`, payload);
        toast.success("Item diperbarui");
      } else {
        await api.post("/ready-stock", payload);
        toast.success("Item ditambahkan");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Hapus item ini?")) return;
    try {
      await api.delete(`/ready-stock/${id}`);
      toast.success("Item dihapus");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const total = form.purchase_price && form.shipping_cost !== undefined ?
    Number(form.purchase_price || 0) + Number(form.shipping_cost || 0) + Number(form.remake_cost || 0) : 0;

  return (
    <div className="p-8 sm:p-12 max-w-7xl">
      <PageHeader
        eyebrow="02 — Inventaris"
        title="Ready Stock"
        description="Kelola koleksi jersey vintage Anda — biaya pembelian, ongkir, remake, dan status penjualan."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
                data-testid="add-stock-button"
              >
                <Plus className="w-4 h-4 mr-2" /> Tambah Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-heading text-2xl tracking-tight">
                  {editing ? "Edit Item" : "Tambah Item Jersey"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Nama Item</Label>
                  <Input
                    value={form.item_name}
                    onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                    placeholder="cth. Juventus Home 2002/03"
                    required
                    data-testid="item-name-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Gambar Jersey</Label>
                  <div className="flex items-center gap-3">
                    {form.image_path ? (
                      <JerseyImage path={form.image_path} className="w-16 h-16 rounded-md object-cover border border-gray-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-md border border-dashed border-gray-300 bg-gray-50" />
                    )}
                    <label className="flex-1 cursor-pointer">
                      <div className="border border-dashed border-gray-300 rounded-md px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        {uploading ? "Mengunggah..." : "Pilih file (PNG/JPG, max 5MB)"}
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleUpload}
                        data-testid="image-upload-input"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Harga Beli</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.purchase_price}
                      onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                      data-testid="purchase-price-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Ongkos Kirim</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.shipping_cost}
                      onChange={(e) => setForm({ ...form, shipping_cost: e.target.value })}
                      data-testid="shipping-cost-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Biaya Remake</Label>
                    <Input
                      type="number"
                      min="0"
                      value={form.remake_cost}
                      onChange={(e) => setForm({ ...form, remake_cost: e.target.value })}
                      data-testid="remake-cost-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger data-testid="status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {form.status === "Terjual" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Harga Jual</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.sale_price}
                        onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                        data-testid="sale-price-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Tanggal Terjual</Label>
                      <Input
                        type="date"
                        value={form.sold_date || ""}
                        onChange={(e) => setForm({ ...form, sold_date: e.target.value })}
                        data-testid="sold-date-input"
                      />
                    </div>
                  </div>
                )}

                {form.status === "Terjual" && (
                  <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50/50" data-testid="supplies-used-section">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">
                        Perlengkapan Dipakai
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addSupplyLine}
                        className="h-7 text-xs"
                        data-testid="add-supply-line"
                        disabled={supplies.length === 0}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Tambah
                      </Button>
                    </div>
                    {supplies.length === 0 ? (
                      <div className="text-xs text-gray-500 italic">
                        Belum ada perlengkapan tersedia. Tambahkan di menu Perlengkapan Jersey.
                      </div>
                    ) : (form.supplies_used || []).length === 0 ? (
                      <div className="text-xs text-gray-500 italic">
                        Opsional — tambah jika item ini memakai perlengkapan saat penjualan.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {(form.supplies_used || []).map((line, idx) => {
                          const supply = supplies.find((s) => s.kode === line.kode);
                          const sisa = supply ? supply.pcs_left : 0;
                          return (
                            <div key={idx} className="flex items-center gap-2" data-testid={`supply-line-${idx}`}>
                              <Select
                                value={line.kode}
                                onValueChange={(v) => updateSupplyLine(idx, { kode: v })}
                              >
                                <SelectTrigger className="flex-1 h-9 text-sm" data-testid={`supply-kode-select-${idx}`}>
                                  <SelectValue placeholder="Pilih kode barang" />
                                </SelectTrigger>
                                <SelectContent>
                                  {supplies.map((s) => (
                                    <SelectItem key={s.kode} value={s.kode}>
                                      <span className="font-mono text-xs">{s.kode}</span> — {s.name} (sisa {s.pcs_left})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                min="1"
                                value={line.qty}
                                onChange={(e) => updateSupplyLine(idx, { qty: parseInt(e.target.value, 10) || 0 })}
                                className="w-20 h-9"
                                placeholder="Qty"
                                data-testid={`supply-qty-input-${idx}`}
                              />
                              <span className="text-[10px] text-gray-500 font-mono w-16 text-right">
                                {supply ? `sisa ${sisa}` : ""}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => removeSupplyLine(idx)}
                                data-testid={`remove-supply-line-${idx}`}
                              >
                                <X className="w-4 h-4 text-red-700" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Total Modal</span>
                  <span className="font-heading text-lg font-bold tabular-nums">{formatRupiah(total)}</span>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-stock-button">
                    {editing ? "Simpan Perubahan" : "Tambah Item"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="ready-stock-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-gray-500 mb-3">Belum ada item ready stock.</div>
            <Button onClick={openCreate} variant="outline">Tambah item pertama</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Harga Beli</TableHead>
                <TableHead className="text-right">Ongkir</TableHead>
                <TableHead className="text-right">Remake</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} data-testid={`stock-row-${item.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <JerseyImage path={item.image_path} className="w-12 h-12 rounded-md object-cover border border-gray-200 bg-gray-50" />
                      <div>
                        <div className="font-medium text-gray-900">{item.item_name}</div>
                        {item.sale_price > 0 && item.status?.toLowerCase() === "terjual" && (
                          <div className="text-xs text-gray-500 font-mono">Jual: {formatRupiah(item.sale_price)}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(item.purchase_price)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(item.shipping_cost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(item.remake_cost)}</TableCell>
                  <TableCell>
                    <Badge className={`${statusBadge(item.status)} font-medium`}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatRupiah(item.total)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(item)}
                        data-testid={`edit-stock-${item.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id)}
                        data-testid={`delete-stock-${item.id}`}
                      >
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
