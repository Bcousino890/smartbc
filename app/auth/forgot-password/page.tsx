"use client";

import { useState } from "react";
import { Loader2, AlertCircle, CheckCircle, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Error processing request");
        return;
      }

      setSubmitted(true);
      setEmail("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream-50 to-cream-100 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-gold/15 shadow-lg p-8">
          {!submitted ? (
            <>
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-gold/10 rounded-full">
                  <Mail size={32} className="text-gold" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-center text-ink mb-2">
                Reset Password
              </h1>
              <p className="text-center text-ink/55 text-sm mb-6">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-ink/65 mb-1.5 block">
                    Email Address
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-2 border border-ink/10 rounded-lg bg-white/85 text-ink focus:border-gold/55 focus:outline-none"
                    disabled={loading}
                  />
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 bg-ink text-cream-50 py-2 px-4 rounded-lg hover:bg-ink-soft transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  <span>{loading ? "Sending..." : "Send Reset Link"}</span>
                </button>
              </form>

              <p className="text-center text-ink/55 text-xs mt-6">
                Remember your password?{" "}
                <a href="/login" className="text-gold hover:underline font-medium">
                  Back to Login
                </a>
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle size={32} className="text-green-600" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-center text-ink mb-2">
                Check Your Email
              </h1>
              <p className="text-center text-ink/55 text-sm mb-4">
                We've sent a password reset link to <strong>{email}</strong>
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 mb-6">
                <p>
                  If you don't see the email, please check your spam folder or try again with a different email address.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setSubmitted(false)}
                  className="w-full bg-ink text-cream-50 py-2 px-4 rounded-lg hover:bg-ink-soft transition font-medium"
                >
                  Try Another Email
                </button>
                <a
                  href="/login"
                  className="block text-center border border-ink/15 text-ink py-2 px-4 rounded-lg hover:bg-ink/5 transition font-medium"
                >
                  Back to Login
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
