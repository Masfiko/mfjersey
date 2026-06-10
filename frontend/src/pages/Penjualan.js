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
import { Plus, Undo2, X, ShoppingBag, TrendingUp } from "lucide-react";

const emptyForm = () => ({
  ready_stock_id: "",
  sale_price: 0,
  sold_date: new Date().toISOString().slice(0, 10),
  supplies_used: [],
});

export default function Penjualan() {
  const [sales, setSales] = useState([]);
  const [available, setAvailable] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = async (p = period) => {
    try {
      const [salesRes, stockRes, suppliesRes] = await Promise.all([
        api.get("/penjualan", { params: periodToParams(p) }),
        api.get("/ready-stock"),
        api.get("/jersey-supplies"),
      ]);
      setSales(salesRes.data);
      setAvailable(stockRes.data.filter((i) => (i.status || "").toLowerCase() !== "terjual"));
      setSupplies(suppliesRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/penjualan", { params: periodToParams("all") }),
      api.get("/ready-stock"),
      api.get("/jersey-supplies"),
    ])
      .then(([salesRes, stockRes, suppliesRes]) => {
        if (!active) return;
        setSales(salesRes.data);
        setAvailable(stockRes.data.filter((i) => (i.status || "").toLowerCase() !== "terjual"));
        setSupplies(suppliesRes.data);
      })
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
    setForm(emptyForm());
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

  const submit = async (e) => {
    e.preventDefault();
    try {
      const cleanedSupplies = (form.supplies_used || [])
        .map((s) => ({ kode: (s.kode || "").trim(), qty: parseInt(s.qty, 10) || 0 }))
        .filter((s) => s.kode && s.qty > 0);
      const payload = {
        ready_stock_id: form.ready_stock_id,
        sale_price: Number(form.sale_price) || 0,
        sold_date: form.sold_date,
        supplies_used: cleanedSupplies,
      };
      if (!payload.ready_stock_id) {
        toast.error("Pilih item ready stock terlebih dahulu");
        return;
      }
      await api.post("/penjualan", payload);
      toast.success("Penjualan tercatat — stok diperbarui");
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleRevert = async (id) => {
    if (!window.confirm("Batalkan penjualan ini? Item akan kembali ke stok Tersedia.")) return;
    try {
      await api.delete(`/penjualan/${id}`);
      toast.success("Penjualan dibatalkan — item kembali tersedia");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const totalSales = sales.reduce((a, s) => a + Number(s.sale_price || 0), 0);
  const totalProfit = sales.reduce((a, s) => a + Number(s.profit || 0), 0);

  const selectedStock = available.find((i) => i.id === form.ready_stock_id);
  const stockCogs = selectedStock
    ? Number(selectedStock.purchase_price || 0) + Number(selectedStock.shipping_cost || 0) + Number(selectedStock.remake_cost || 0)
    : 0;
  const previewProfit = (Number(form.sale_price) || 0) - stockCogs;

  return (
    <div className="p-8 sm:p-12 max-w-7xl">
      <PageHeader
        eyebrow="09 — Sales"
        title="Penjualan"
        description="Catat setiap penjualan jersey. Ready Stock otomatis ditandai Terjual, perlengkapan dipakai otomatis mengurangi stok kode terkait, dan Buku Kas dapat catatan penjualan."
        action={
          <div className="flex items-center gap-3">
            <PeriodFilter value={period} onChange={onPeriodChange} testid="penjualan-period" />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={openCreate}
                  className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
                  data-testid="add-penjualan-button"
                  disabled={available.length === 0}
                >
                  <Plus className="w-4 h-4 mr-2" /> Catat Penjualan
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading text-2xl tracking-tight">Catat Penjualan</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Pilih Item Ready Stock</Label>
                    <Select
                      value={form.ready_stock_id}
                      onValueChange={(v) => setForm({ ...form, ready_stock_id: v })}
                    >
                      <SelectTrigger data-testid="penjualan-item-select">
                        <SelectValue placeholder={available.length ? "Pilih item..." : "Tidak ada item tersedia"} />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((i) => {
                          const cost = Number(i.purchase_price || 0) + Number(i.shipping_cost || 0) + Number(i.remake_cost || 0);
                          return (
                            <SelectItem key={i.id} value={i.id}>
                              {i.item_name} <span className="text-gray-400">— modal {formatRupiah(cost)}</span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Harga Jual</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.sale_price}
                        onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                        required
                        data-testid="penjualan-price-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Tanggal</Label>
                      <Input
                        type="date"
                        value={form.sold_date}
                        onChange={(e) => setForm({ ...form, sold_date: e.target.value })}
                        required
                        data-testid="penjualan-date-input"
                      />
                    </div>
                  </div>

                  {selectedStock && (
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-gray-600">Modal item</span><span className="tabular-nums font-mono">{formatRupiah(stockCogs)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Laba kotor</span><span className={`tabular-nums font-mono font-bold ${previewProfit >= 0 ? "text-emerald-800" : "text-red-800"}`}>{formatRupiah(previewProfit)}</span></div>
                    </div>
                  )}

                  <div className="border border-gray-200 rounded-md p-3 space-y-3 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Perlengkapan Dipakai</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addSupplyLine}
                        className="h-7 text-xs"
                        data-testid="penjualan-add-supply-line"
                        disabled={supplies.length === 0}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Tambah
                      </Button>
                    </div>
                    {supplies.length === 0 ? (
                      <div className="text-xs text-gray-500 italic">Belum ada perlengkapan terdaftar.</div>
                    ) : (form.supplies_used || []).length === 0 ? (
                      <div className="text-xs text-gray-500 italic">Opsional — pilih perlengkapan yang dipakai untuk penjualan ini.</div>
                    ) : (
                      <div className="space-y-2">
                        {(form.supplies_used || []).map((line, idx) => {
                          const supply = supplies.find((s) => s.kode === line.kode);
                          return (
                            <div key={idx} className="flex items-center gap-2" data-testid={`penjualan-supply-line-${idx}`}>
                              <Select value={line.kode} onValueChange={(v) => updateSupplyLine(idx, { kode: v })}>
                                <SelectTrigger className="flex-1 h-9 text-sm" data-testid={`penjualan-supply-kode-${idx}`}>
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
                                data-testid={`penjualan-supply-qty-${idx}`}
                              />
                              <span className="text-[10px] text-gray-500 font-mono w-16 text-right">
                                {supply ? `sisa ${supply.pcs_left}` : ""}
                              </span>
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeSupplyLine(idx)} data-testid={`penjualan-remove-supply-${idx}`}>
                                <X className="w-4 h-4 text-red-700" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                    <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-penjualan-button">
                      Catat Penjualan
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <Card className="border border-gray-200 bg-white p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-emerald-50 text-emerald-800 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Jumlah Penjualan</div>
            <div className="font-heading text-2xl font-bold tabular-nums" data-testid="penjualan-count">{sales.length}</div>
          </div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Total Penjualan</div>
          <div className="font-heading text-2xl font-bold tabular-nums mt-1 text-emerald-800" data-testid="penjualan-total-sales">
            {formatRupiah(totalSales)}
          </div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-blue-50 text-blue-900 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Total Laba Kotor</div>
            <div className={`font-heading text-2xl font-bold tabular-nums ${totalProfit >= 0 ? "text-blue-900" : "text-red-800"}`} data-testid="penjualan-total-profit">
              {formatRupiah(totalProfit)}
            </div>
          </div>
        </Card>
      </div>

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="penjualan-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : sales.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-sm text-gray-500 mb-3">Belum ada penjualan pada periode ini.</div>
            {available.length > 0 && (
              <Button onClick={openCreate} variant="outline">Catat penjualan pertama</Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Perlengkapan Dipakai</TableHead>
                <TableHead className="text-right">Modal</TableHead>
                <TableHead className="text-right">Harga Jual</TableHead>
                <TableHead className="text-right">Laba</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id} data-testid={`penjualan-row-${s.id}`}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{formatDate(s.sold_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <JerseyImage path={s.image_path} className="w-10 h-10 rounded-md object-cover border border-gray-200 bg-gray-50" />
                      <div className="font-medium text-gray-900">{s.item_name}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {(s.supplies_used || []).length === 0 ? (
                      <span className="text-xs text-gray-400 italic">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {s.supplies_used.map((u, i) => (
                          <Badge key={i} className="bg-blue-50 text-blue-900 border border-blue-200 font-medium text-[10px]">
                            <span className="font-mono">{u.kode}</span> × {u.qty}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-600">{formatRupiah(s.cogs)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-emerald-800">{formatRupiah(s.sale_price)}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${s.profit >= 0 ? "text-blue-900" : "text-red-800"}`}>
                    {formatRupiah(s.profit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRevert(s.id)}
                      title="Batalkan penjualan"
                      data-testid={`revert-penjualan-${s.id}`}
                    >
                      <Undo2 className="w-4 h-4 text-amber-700" />
                    </Button>
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
