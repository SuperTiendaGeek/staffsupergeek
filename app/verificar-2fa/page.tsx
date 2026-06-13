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
      <section className="w-full max-w-sm rounded-[1.25rem] border border-[#3A3A36] bg-[#1E1F1C] p-6 shadow-2xl shadow-black/40">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#D7FF4F] text-sm font-black text-[#10110E] shadow-glow">
            SG
          </div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">Verificación en dos pasos</h1>
          <p className="mt-1.5 text-sm leading-5 text-[#A7A7A7]">Ingresa el código de 6 dígitos enviado a tu correo.</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-[#CFCFCB]">
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
              className="mt-1.5 h-12 w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-center text-2xl font-bold tracking-widest text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/40 focus:border-[#D7FF4F]/70"
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
            className="h-10 w-full rounded-full border border-[#D7FF4F] bg-[#D7FF4F] text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Verificando..." : "Verificar"}
          </button>

          <Link
            href="/login"
            className="flex h-9 w-full items-center justify-center rounded-full border border-[#3A3A36] text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
          >
            Volver al login
          </Link>
        </form>
      </section>
    </main>
  );
}
