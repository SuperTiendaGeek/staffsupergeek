"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function VerifyTwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code })
      });
      const result = (await response.json()) as { success?: boolean; error?: string; redirectTo?: string };

      if (!response.ok || !result.success) {
        setError(result.error || "Código inválido o vencido.");
        return;
      }

      router.replace(result.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      setError("No se pudo verificar el código. Intenta de nuevo.");
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
          <h1 className="text-2xl font-semibold text-white">Verificación en dos pasos</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Ingresa el código de 6 dígitos enviado a tu correo.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-zinc-200">
            Código
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="mt-2 w-full rounded-md border border-white/10 bg-black/30 px-3 py-3 text-center text-xl font-semibold tracking-normal text-white outline-none transition placeholder:text-zinc-600 focus:border-geek-lime"
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
            className="block w-full rounded-md bg-geek-lime px-4 py-3 text-center text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Verificando..." : "Verificar"}
          </button>

          <Link
            href="/api/auth/logout"
            className="block rounded-md border border-white/10 px-4 py-3 text-center text-sm font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:bg-geek-lime/10 hover:text-geek-lime"
          >
            Volver al login
          </Link>
        </form>
      </section>
    </main>
  );
}
