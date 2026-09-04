"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const PROGRESS_MESSAGES = [
  "Fetching page...",
  "Running SEO checks...",
  "Analyzing AI readiness...",
  "Analyzing accessibility...",
  "Scoring...",
];

export default function UrlInput() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setError(null);
    setLoading(true);
    setProgressIndex(0);
    intervalRef.current = setInterval(() => {
      setProgressIndex((i) => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 3500);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "We couldn't audit this site. Try another URL.");
        setLoading(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }
      router.push(`/results/${data.id}`);
    } catch {
      setError("Something went wrong on our end. Try again in a moment.");
      setLoading(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }

  if (loading) {
    return (
      <div className="bb-card w-full max-w-xl p-8 text-center">
        <p className="bb-eyebrow text-sm text-salmon mb-3">Auditing</p>
        <p className="font-display text-xl text-navy mb-2">{url}</p>
        <p className="text-blue">{PROGRESS_MESSAGES[progressIndex]}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          inputMode="url"
          placeholder="yourwebsite.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="bb-card flex-1 px-4 py-3 text-blue placeholder:text-blue/50 focus:outline-none focus:ring-2 focus:ring-navy"
          aria-label="Website URL to audit"
        />
        <button
          type="submit"
          className="bb-eyebrow bg-navy text-warm-white px-6 py-3 rounded-lg hover:bg-blue transition-colors"
        >
          Audit my site
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-navy">{error}</p>}
    </form>
  );
}
