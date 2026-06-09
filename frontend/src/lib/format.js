export function formatRupiah(amount) {
  const n = Number(amount || 0);
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(n)));
  return `${n < 0 ? "-" : ""}Rp ${formatted}`;
}

export function formatNumber(amount) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(amount || 0)));
}

export function formatDate(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}
