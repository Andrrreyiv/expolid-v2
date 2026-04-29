import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { register } from "@/api/auth";
import { useAuth } from "@/store/auth";

export default function RegisterPage() {
  const navigate = useNavigate();
  const setUserFromToken = useAuth((s) => s.setUserFromToken);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token } = await register({
        name,
        email,
        password,
        organization_name: orgName || undefined,
      });
      await setUserFromToken(access_token);
      navigate("/");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail ?? "Не удалось зарегистрироваться");
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
        <p className="text-center text-slate-500 text-sm mt-1">Регистрация</p>

        <div className="mt-6 space-y-3">
          <Input
            label="Имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Input
            label="Название компании (необязательно)"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="ООО Ромашка"
          />
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? "Регистрация..." : "Зарегистрироваться"}
          </Button>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-brand font-medium">
            Войти
          </Link>
        </p>
      </form>
    </div>
  );
}
