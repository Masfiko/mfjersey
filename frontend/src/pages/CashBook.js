import { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { formatRupiah, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import PeriodFilter, { periodToParams } from "@/components/PeriodFilter";
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
import { Plus, Trash2, Edit, Sparkles } from "lucide-react";

const CATEGORIES = [
  { value: "penjualan", label: "Penjualan" },
  { value: "pembelian", label: "Pembelian Jersey" },
  { value: "biaya", label: "Biaya Operasional" },
  { value: "pendapatan_lain", label: "Pendapatan Lain" },
  { value: "lainnya", label: "Lainnya" },
];

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  description: "",
  income: 0,
  expense: 0,
  category: "lainnya",
});

export default function CashBook() {
  const [data, setData] = useState({ opening_balance: 0, transactions: [], closing_balance: 0 });
  const [period, setPeriod] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);

  const load = async (p = period) => {
    try {
      const { data } = await api.get("/cash-book", { params: periodToParams(p) });
      setData(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/cash-book", { params: periodToParams("all") })
      .then(({ data }) => active && setData(data))
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

  const openEdit = (tx) => {
    if (tx.auto) {
      toast.info("Transaksi otomatis dari Ready Stock. Ubah lewat halaman Ready Stock.");
      return;
    }
    setEditing(tx);
    setForm({
      date: tx.date,
      description: tx.description,
      income: tx.income || 0,
      expense: tx.expense || 0,
      category: tx.category || "lainnya",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        income: Number(form.income) || 0,
        expense: Number(form.expense) || 0,
      };
      if (editing) {
        await api.put(`/cash-book/${editing.id}`, payload);
        toast.success("Transaksi diperbarui");
      } else {
        await api.post("/cash-book", payload);
        toast.success("Transaksi tercatat");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const handleDelete = async (tx) => {
    if (tx.auto) {
      toast.info("Hapus item Ready Stock terkait untuk menghapus transaksi otomatis.");
      return;
    }
    if (!window.confirm("Hapus transaksi ini?")) return;
    try {
      await api.delete(`/cash-book/${tx.id}`);
      toast.success("Transaksi dihapus");
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  const totalIn = data.transactions.reduce((a, t) => a + Number(t.income || 0), 0);
  const totalOut = data.transactions.reduce((a, t) => a + Number(t.expense || 0), 0);

  return (
    <div className="p-8 sm:p-12 max-w-7xl">
      <PageHeader
        eyebrow="04 — Ledger"
        title="Buku Kas Bank"
        description="Catat seluruh arus kas masuk dan keluar. Saldo dihitung otomatis dari saldo awal."
        action={
          <div className="flex items-center gap-3">
            <PeriodFilter value={period} onChange={onPeriodChange} testid="cashbook-period" />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={openCreate}
                  className="bg-blue-900 hover:bg-blue-800 text-white font-medium"
                  data-testid="add-transaction-button"
                >
                  <Plus className="w-4 h-4 mr-2" /> Transaksi Baru
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading text-2xl tracking-tight">
                    {editing ? "Edit Transaksi" : "Tambah Transaksi"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Tanggal</Label>
                      <Input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                        required
                        data-testid="tx-date-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Kategori</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger data-testid="tx-category-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Deskripsi</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="cth. Penjualan jersey Milan"
                      required
                      data-testid="tx-description-input"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-emerald-700">Pemasukan</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.income}
                        onChange={(e) => setForm({ ...form, income: e.target.value })}
                        data-testid="tx-income-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-widest text-red-700">Pengeluaran</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.expense}
                        onChange={(e) => setForm({ ...form, expense: e.target.value })}
                        data-testid="tx-expense-input"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                    <Button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white" data-testid="save-tx-button">
                      {editing ? "Simpan" : "Tambah"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Saldo Awal Periode</div>
          <div className="font-heading text-2xl font-bold mt-2 tabular-nums" data-testid="opening-balance">
            {formatRupiah(data.opening_balance)}
          </div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">Total Pemasukan</div>
          <div className="font-heading text-2xl font-bold mt-2 tabular-nums text-emerald-800">
            {formatRupiah(totalIn)}
          </div>
        </Card>
        <Card className="border border-gray-200 bg-white p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-700">Total Pengeluaran</div>
          <div className="font-heading text-2xl font-bold mt-2 tabular-nums text-red-800">
            {formatRupiah(totalOut)}
          </div>
        </Card>
      </div>

      <Card className="border border-gray-200 bg-white overflow-hidden" data-testid="cash-book-table">
        {loading ? (
          <div className="p-8 text-sm text-gray-500 text-center font-mono uppercase tracking-widest">Memuat...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right">Pemasukan</TableHead>
                <TableHead className="text-right">Pengeluaran</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-gray-50">
                <TableCell colSpan={4} className="font-medium text-gray-600">Saldo Awal Periode</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatRupiah(data.opening_balance)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
              {data.transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                    Belum ada transaksi pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                data.transactions.map((tx) => (
                  <TableRow key={tx.id} data-testid={`tx-row-${tx.id}`}>
                    <TableCell className="font-mono text-xs">{formatDate(tx.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-gray-900">{tx.description}</div>
                          <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">
                            {(CATEGORIES.find((c) => c.value === tx.category) || {}).label || tx.category}
                          </div>
                        </div>
                        {tx.auto && (
                          <Badge className="bg-blue-50 text-blue-900 border border-blue-200 font-medium text-[10px]" data-testid={`auto-badge-${tx.id}`}>
                            <Sparkles className="w-3 h-3 mr-1" /> Otomatis
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-800">
                      {tx.income > 0 ? formatRupiah(tx.income) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-800">
                      {tx.expense > 0 ? formatRupiah(tx.expense) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatRupiah(tx.balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(tx)}
                          data-testid={`edit-tx-${tx.id}`}
                          disabled={tx.auto}
                          title={tx.auto ? "Auto — ubah lewat Ready Stock" : "Edit"}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(tx)}
                          data-testid={`delete-tx-${tx.id}`}
                          disabled={tx.auto}
                          title={tx.auto ? "Auto — hapus lewat Ready Stock" : "Hapus"}
                        >
                          <Trash2 className="w-4 h-4 text-red-700" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
              <TableRow className="bg-blue-50">
                <TableCell colSpan={4} className="font-semibold text-blue-900">Saldo Akhir</TableCell>
                <TableCell className="text-right tabular-nums font-heading font-bold text-blue-900" data-testid="closing-balance">
                  {formatRupiah(data.closing_balance)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
