import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { errMsg } from "../lib/errmsg";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useNavigate(); // ensures navigation hook is mounted

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post<{ access_token: string }>("/api/auth/signin", {
        email,
        password,
        remember_me: rememberMe,
      });
      localStorage.setItem("token", r.data.access_token);
      window.location.href = "/";
    } catch (e: unknown) {
      setErr(errMsg(e, "Не удалось войти"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-700 to-brand-800">
      <form onSubmit={submit} className="w-full max-w-md card p-8">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">ЭкспоЛид</h1>
        <p className="text-sm text-slate-500 mb-6">Захват контактов на выставках</p>

        <label className="label">Email</label>
        <input
          className="input mb-4"
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <label className="label">Пароль</label>
        <input
          className="input mb-3"
          type="password"
          name="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-4 select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 accent-brand-700"
          />
          Запомнить меня на этом устройстве (30 дней)
        </label>
        {err && <div className="text-rose-600 text-sm mb-3">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Вход…" : "Войти"}
        </button>
        <p className="text-sm text-slate-500 mt-4 text-center">
          Нет аккаунта?{" "}
          <Link className="text-brand-700 font-medium" to="/signup">
            Регистрация
          </Link>
        </p>
      </form>
    </div>
  );
}
