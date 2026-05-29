import { useState } from "react";
import { Radio, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function LoginGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-6 py-10"
      data-theme="festival"
    >
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--neon)] shadow-glow">
          <Radio className="h-7 w-7 text-background" />
        </div>
        <h1 className="text-3xl font-black tracking-tight">Pulse</h1>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Inicia sesión para vibrar con tu zona
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tú@email.com"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>

        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-2xl bg-[var(--neon)] py-3 text-sm font-black text-background disabled:opacity-40"
        >
          {mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          className="text-xs text-muted-foreground underline"
        >
          {mode === "signin" ? "¿Sin cuenta? Regístrate" : "¿Ya tienes cuenta? Entra"}
        </button>
      </form>
    </div>
  );
}
