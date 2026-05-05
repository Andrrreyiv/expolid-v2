import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { errMsg } from "../lib/errmsg";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const r = await api.post<{ access_token: string }>("/api/auth/signup", {
        email,
        password,
        name,
        company_name: companyName.trim() || null,
      });
      localStorage.setItem("token", r.data.access_token);
      window.location.href = "/";
    } catch (e: unknown) {
      setErr(errMsg(e, "Не удалось зарегистрироваться"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-brand-700 to-brand-800">
      <form onSubmit={submit} className="w-full max-w-md card p-8">
        <h1 className="text-2xl font-bold text-brand-700 mb-1">Регистрация</h1>
        <p className="text-sm text-slate-500 mb-6">Создайте аккаунт компании</p>

        <label className="label">Имя</label>
        <input
          className="input mb-3"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <label className="label">Компания <span className="text-slate-400 font-normal">(опционально)</span></label>
        <input
          className="input mb-1"
          name="organization"
          placeholder="Можно заполнить позже в настройках"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          autoComplete="organization"
        />
        <p className="text-xs text-slate-400 mb-3">Если оставить пустым — создадим компанию «Моя компания», переименуете в Настройках.</p>
        <label className="label">Email</label>
        <input
          className="input mb-3"
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
        <label className="label">Пароль (мин. 6)</label>
        <input
          className="input mb-4"
          type="password"
          name="new-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        {err && <div className="text-rose-600 text-sm mb-3">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Создаём…" : "Создать аккаунт"}
        </button>
        <p className="text-sm text-slate-500 mt-4 text-center">
          Уже есть аккаунт?{" "}
          <Link className="text-brand-700 font-medium" to="/signin">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}
