import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatApiError } from "@/lib/api";
import { Shirt } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:block relative overflow-hidden bg-gray-900">
        <img
          src="https://images.pexels.com/photos/1657324/pexels-photo-1657324.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1200"
          alt="Stadium"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/90 via-blue-900/40 to-transparent" />
        <div className="relative z-10 flex flex-col justify-between h-full p-12 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-300">
              Original · Vintage · Authentic
            </div>
            <div className="font-heading text-5xl font-bold mt-3 tracking-tight">
              MF.Jersey<span className="text-red-400">_id</span>
            </div>
          </div>
          <div>
            <div className="font-heading text-3xl font-bold leading-tight max-w-md">
              Kelola keuangan koleksi jersey vintage dengan presisi.
            </div>
            <div className="text-sm text-blue-100 mt-4 max-w-md leading-relaxed">
              Pantau stok, kas, laba rugi, dan neraca dalam satu dashboard yang ringkas.
            </div>
            <div className="text-xs font-mono uppercase tracking-widest text-blue-200 mt-8">
              EST · finance.dashboard
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-blue-900 flex items-center justify-center text-white">
              <Shirt className="w-5 h-5" />
            </div>
            <div>
              <div className="font-heading text-xl font-bold tracking-tight">
                MF.Jersey<span className="text-red-800">_id</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-2">
            Masuk ke Dashboard
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl tracking-tight font-bold text-gray-900">
            Selamat datang kembali
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            Belum punya akun?{" "}
            <Link to="/register" className="text-blue-900 font-medium hover:underline" data-testid="link-register">
              Daftar di sini
            </Link>
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="login-form">
            {error && (
              <Alert variant="destructive" data-testid="login-error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-gray-600">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="anda@email.com"
                required
                data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-gray-600">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                data-testid="login-password-input"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-blue-900 hover:bg-blue-800 text-white font-medium"
            >
              {loading ? "Memproses..." : "Masuk"}
            </Button>
          </form>

          <div className="mt-8 p-4 border border-dashed border-gray-300 rounded-md bg-gray-50">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
              Demo Admin
            </div>
            <div className="text-xs text-gray-700 font-mono">admin@mfjersey.id · admin123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
