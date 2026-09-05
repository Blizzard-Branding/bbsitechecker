"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeadForm({ auditId }: { auditId: string }) {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId, email, businessName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't unlock the report. Try again.");
        setLoading(false);
        return;
      }
      router.push(`/report/${auditId}`);
    } catch {
      setError("Something went wrong on our end. Try again in a moment.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-md">
      <input
        type="email"
        required
        placeholder="Business email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bb-card px-4 py-3 text-blue placeholder:text-blue/50 focus:outline-none focus:ring-2 focus:ring-navy"
      />
      <input
        type="text"
        required
        placeholder="Business name"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        className="bb-card px-4 py-3 text-blue placeholder:text-blue/50 focus:outline-none focus:ring-2 focus:ring-navy"
      />
      <button
        type="submit"
        disabled={loading}
        className="bb-eyebrow bg-navy text-warm-white px-6 py-3 rounded-lg hover:bg-blue transition-colors disabled:opacity-60"
      >
        {loading ? "Signing up..." : "Subscribe and see the report"}
      </button>
      <p className="text-xs text-blue/80">
        You will be added to the Blizzard Branding newsletter. Unsubscribe any time.
      </p>
      {error && <p className="text-sm text-navy">{error}</p>}
    </form>
  );
}
