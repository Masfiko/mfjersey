import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5]">
        <div className="text-gray-500 text-sm font-mono uppercase tracking-widest">Memuat...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
