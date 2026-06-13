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
      <section className="w-full max-w-sm rounded-[1.25rem] border border-[#3A3A36] bg-[#1E1F1C] p-6 shadow-2xl shadow-black/40">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#D7FF4F] text-sm font-black text-[#10110E] shadow-glow">
            SG
          </div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">Portal Staff</h1>
          <p className="mt-1.5 text-sm text-[#A7A7A7]">Acceso interno para el equipo SUPER GEEK.</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-[#CFCFCB]">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@supergeek.local"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70"
              required
            />
          </label>

          <label className="block text-sm font-medium text-[#CFCFCB]">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70"
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 h-10 w-full rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Entrando..." : "Entrar al portal"}
          </button>
        </form>
      </section>
    </main>
  );
}
