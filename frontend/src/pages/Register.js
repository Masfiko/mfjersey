import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatApiError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form.email, form.password, form.name);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5] p-6">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-8">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-2">
          Daftar Akun Baru
        </div>
        <h1 className="font-heading text-3xl tracking-tight font-bold text-gray-900">
          Mulai kelola finansial
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Sudah punya akun?{" "}
          <Link to="/login" className="text-blue-900 font-medium hover:underline" data-testid="link-login">
            Masuk
          </Link>
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5" data-testid="register-form">
          {error && (
            <Alert variant="destructive" data-testid="register-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Nama</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nama lengkap"
              required
              data-testid="register-name-input"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="anda@email.com"
              required
              data-testid="register-email-input"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest text-gray-600">Password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Minimal 4 karakter"
              required
              minLength={4}
              data-testid="register-password-input"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            data-testid="register-submit-button"
            className="w-full bg-blue-900 hover:bg-blue-800 text-white font-medium"
          >
            {loading ? "Memproses..." : "Daftar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
