"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const genericError = "Correo o contraseña incorrectos.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });

      const result = (await response.json()) as {
        success?: boolean;
        requiresTwoFactor?: boolean;
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !result.success) {
        setError(result.error || genericError);
        return;
      }

      if (result.requiresTwoFactor) {
        router.push("/verificar-2fa");
      } else {
        router.replace(result.redirectTo || "/dashboard");
      }
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-geek-lime font-black text-geek-black shadow-glow">
            SG
          </div>
          <h1 className="text-2xl font-semibold text-white">Portal Staff</h1>
          <p className="mt-2 text-sm text-zinc-400">Acceso interno para el equipo SUPER GEEK.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-zinc-200">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@supergeek.local"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-geek-lime"
              required
            />
          </label>

          <label className="block text-sm font-medium text-zinc-200">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-geek-lime"
              required
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 block w-full rounded-md bg-geek-lime px-4 py-3 text-center text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Entrando..." : "Entrar al portal"}
          </button>
        </form>
      </section>
    </main>
  );
}
