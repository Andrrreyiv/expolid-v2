import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { login } from "@/api/auth";
import { useAuth } from "@/store/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const setUserFromToken = useAuth((s) => s.setUserFromToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } = await login({ email, password });
      await setUserFromToken(access_token);
      navigate("/");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail ?? "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
      >
        <h1 className="text-3xl font-bold text-center text-slate-900">ЭкспоЛид</h1>
        <p className="text-center text-slate-500 text-sm mt-1">
          Захват контактов на выставках
        </p>

        <div className="mt-6 space-y-3">
          <Input
            label="Email"
            type="email"
            id="email"
            autoComplete="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Пароль"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? "Вход..." : "Войти"}
          </Button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Нет аккаунта?{" "}
          <Link to="/register" className="text-brand font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  );
}
