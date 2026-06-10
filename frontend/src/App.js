import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import ReadyStock from "@/pages/ReadyStock";
import BeginningBalance from "@/pages/BeginningBalance";
import CashBook from "@/pages/CashBook";
import ProfitLoss from "@/pages/ProfitLoss";
import BalanceSheet from "@/pages/BalanceSheet";
import Beban from "@/pages/Beban";
import JerseySupplies from "@/pages/JerseySupplies";
import Penjualan from "@/pages/Penjualan";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="ready-stock" element={<ReadyStock />} />
            <Route path="penjualan" element={<Penjualan />} />
            <Route path="perlengkapan" element={<JerseySupplies />} />
            <Route path="beban" element={<Beban />} />
            <Route path="saldo-awal" element={<BeginningBalance />} />
            <Route path="buku-kas" element={<CashBook />} />
            <Route path="laba-rugi" element={<ProfitLoss />} />
            <Route path="neraca" element={<BalanceSheet />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}

export default App;
