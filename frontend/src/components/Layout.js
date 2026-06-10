import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Layers,
  Boxes,
  Receipt,
  Wallet,
  BookOpen,
  TrendingUp,
  FileBarChart2,
  LogOut,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboard, testid: "nav-summary" },
  { to: "/ready-stock", label: "Ready Stock", icon: Package, testid: "nav-ready-stock" },
  { to: "/penjualan", label: "Penjualan", icon: ShoppingBag, testid: "nav-penjualan" },
  { to: "/penjualan/pelloff", label: "Pelloff", icon: Layers, testid: "nav-pelloff", sub: true },
  { to: "/perlengkapan", label: "Perlengkapan Jersey", icon: Boxes, testid: "nav-supplies" },
  { to: "/beban", label: "Beban", icon: Receipt, testid: "nav-beban" },
  { to: "/saldo-awal", label: "Saldo Awal", icon: Wallet, testid: "nav-beginning-balance" },
  { to: "/buku-kas", label: "Buku Kas Bank", icon: BookOpen, testid: "nav-cash-book" },
  { to: "/laba-rugi", label: "Laba / Rugi", icon: TrendingUp, testid: "nav-profit-loss" },
  { to: "/neraca", label: "Neraca", icon: FileBarChart2, testid: "nav-balance-sheet" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-7 border-b border-gray-200">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800">
            Vintage Originals
          </div>
          <div className="font-heading text-2xl font-bold text-gray-900 mt-1 tracking-tight">
            MF.Jersey<span className="text-red-800">_id</span>
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">finance.dashboard</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
            Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/" || item.to === "/penjualan"}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 ${item.sub ? "pl-9" : "px-3"} py-2.5 rounded-md text-sm font-medium transition-colors ${
                    !item.sub ? "" : "pr-3"
                  } ${
                    isActive
                      ? "bg-blue-50 text-blue-900"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
              >
                <Icon className={`${item.sub ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
                <span className={item.sub ? "text-xs" : ""}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-200">
          <div className="px-3 py-2 mb-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-1">
              Pengguna
            </div>
            <div className="text-sm font-medium text-gray-900 truncate" data-testid="user-name">
              {user?.name || user?.email}
            </div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-button"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-red-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
