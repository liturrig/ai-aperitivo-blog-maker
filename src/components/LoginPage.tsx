import { useState } from "react";
import { LogIn, Sparkles, AlertCircle } from "lucide-react";

type Props = {
  onLogin: (username: string) => void;
};

const VALID = { username: "charles", password: "leclerc" };

export function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (username.trim().toLowerCase() === VALID.username && password === VALID.password) {
      onLogin(username.trim().toLowerCase());
    } else {
      setError("Credenziali non valide.");
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-ink-900 text-ink-100">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-brand/15 border border-brand/30 text-brand-400 text-xs font-bold uppercase tracking-widest mb-6">
              <Sparkles size={12} /> Editor blog AI Socratic
            </div>
            <h1
              className="font-bold tracking-tight leading-[0.95] mb-4"
              style={{
                fontSize: "clamp(48px, 8vw, 96px)",
                background: "linear-gradient(120deg, #ffffff 0%, #c4b8ff 45%, #5fffce 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.03em",
              }}
            >
              AI Aperitivo<br />Blog Maker
            </h1>
            <p className="text-ink-300 text-base max-w-md mx-auto">
              Riordina, modifica e personalizza un blog post di AI Socratic
              direttamente nel browser.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900
                       p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold mb-5 flex items-center gap-2">
              <LogIn size={18} className="text-brand-400" />
              Accedi
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-ink-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg bg-ink-800 border border-ink-600 text-sm
                             focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder=""
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest font-bold text-ink-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg bg-ink-800 border border-ink-600 text-sm
                             focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-sm">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-lg bg-gradient-to-r from-brand to-mint hover:brightness-110
                           text-ink-950 font-semibold flex items-center justify-center gap-2 transition"
              >
                <LogIn size={15} /> Accedi
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
