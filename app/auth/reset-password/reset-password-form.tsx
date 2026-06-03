"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setError("Invalid or missing reset token");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate
    if (!password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Error resetting password");
        return;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream-50 to-cream-100 p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl border border-gold/15 shadow-lg p-8">
            <div className="flex items-center justify-center mb-4">
              <AlertCircle size={32} className="text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-center text-ink mb-4">
              Invalid Link
            </h1>
            <p className="text-center text-ink/55 mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <a
              href="/login"
              className="block text-center bg-ink text-cream-50 py-2 px-4 rounded-lg hover:bg-ink-soft transition font-medium"
            >
              Back to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream-50 to-cream-100 p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl border border-gold/15 shadow-lg p-8">
          <h1 className="text-2xl font-bold text-center text-ink mb-2">
            Reset Password
          </h1>
          <p className="text-center text-ink/55 text-sm mb-6">
            Enter your new password below
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 mb-4">
              <CheckCircle size={16} />
              <span>Password reset successfully! Redirecting to login...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <label className="block">
              <span className="text-sm font-medium text-ink/65 mb-1.5 block">
                New Password
              </span>
              <div className="relative flex items-center">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-ink/10 rounded-lg bg-white/85 text-ink focus:border-gold/55 focus:outline-none"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-ink/55 hover:text-ink"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </label>

            {/* Confirm Password */}
            <label className="block">
              <span className="text-sm font-medium text-ink/65 mb-1.5 block">
                Confirm Password
              </span>
              <div className="relative flex items-center">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-ink/10 rounded-lg bg-white/85 text-ink focus:border-gold/55 focus:outline-none"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 text-ink/55 hover:text-ink"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || success}
              className="w-full mt-6 bg-ink text-cream-50 py-2 px-4 rounded-lg hover:bg-ink-soft transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <span>{loading ? "Resetting..." : "Reset Password"}</span>
            </button>
          </form>

          <p className="text-center text-ink/55 text-xs mt-6">
            Remember your password?{" "}
            <a href="/login" className="text-gold hover:underline font-medium">
              Back to Login
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
