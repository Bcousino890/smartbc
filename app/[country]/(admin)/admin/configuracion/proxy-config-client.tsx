"use client";

import { useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProxyProvider = "evomi" | "smartproxy" | "geonode" | "decodo";

export interface ProxyConfig {
  provider: ProxyProvider;
  url: string;
  enabled: boolean;
  notes?: string;
}

interface ProxyConfigClientProps {
  configs: ProxyConfig[];
  activeProvider: ProxyProvider;
  onConfigsChange: (configs: ProxyConfig[]) => void;
  onActiveProviderChange: (provider: ProxyProvider) => void;
}

const PROVIDER_INFO: Record<ProxyProvider, { label: string; placeholder: string; format: string }> = {
  evomi: {
    label: "Evomi",
    placeholder: "http://usuario:password@core-residential.evomi.com:1000",
    format: "http://usuario:password@host:puerto",
  },
  smartproxy: {
    label: "Smartproxy",
    placeholder: "http://user:pass@eu.smartproxy.net:3120",
    format: "http://user:pass@host:puerto",
  },
  geonode: {
    label: "Geonode",
    placeholder: "host:puerto:usuario:password",
    format: "host:puerto:usuario:password",
  },
  decodo: {
    label: "Decodo",
    placeholder: "http://user:pass@dc.decodo.com:10001",
    format: "http://user:pass@host:puerto",
  },
};

export function ProxyConfigClient({
  configs,
  activeProvider,
  onConfigsChange,
  onActiveProviderChange,
}: ProxyConfigClientProps) {
  const [showDetailModal, setShowDetailModal] = useState<ProxyProvider | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<ProxyProvider>>(
    new Set()
  );

  const toggleReveal = (provider: ProxyProvider) => {
    const next = new Set(revealedPasswords);
    if (next.has(provider)) {
      next.delete(provider);
    } else {
      next.add(provider);
    }
    setRevealedPasswords(next);
  };

  const getConfigForProvider = (provider: ProxyProvider): ProxyConfig | undefined => {
    return configs.find((c) => c.provider === provider);
  };

  const updateConfig = (provider: ProxyProvider, updates: Partial<ProxyConfig>) => {
    const newConfigs = configs.map((c) =>
      c.provider === provider ? { ...c, ...updates } : c
    );
    onConfigsChange(newConfigs);
  };

  const addConfig = (provider: ProxyProvider) => {
    if (!getConfigForProvider(provider)) {
      onConfigsChange([
        ...configs,
        { provider, url: "", enabled: false, notes: "" },
      ]);
    }
  };

  const removeConfig = (provider: ProxyProvider) => {
    onConfigsChange(configs.filter((c) => c.provider !== provider));
  };

  const toggleEnabled = (provider: ProxyProvider) => {
    const config = getConfigForProvider(provider);
    if (config) {
      updateConfig(provider, { enabled: !config.enabled });
      if (!config.enabled) {
        onActiveProviderChange(provider);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Provider List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(Object.keys(PROVIDER_INFO) as ProxyProvider[]).map((provider) => {
          const config = getConfigForProvider(provider);
          const info = PROVIDER_INFO[provider];
          const isActive = activeProvider === provider;

          return (
            <div
              key={provider}
              className={cn(
                "rounded-lg border-2 p-4 transition-all",
                config
                  ? isActive
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white"
                  : "border-dashed border-gray-300 bg-gray-50"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-sm">{info.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">Format: {info.format}</p>
                </div>
                {isActive && config && (
                  <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">
                    Active
                  </span>
                )}
              </div>

              {config ? (
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 truncate bg-gray-100 px-2 py-1 rounded font-mono">
                    {revealedPasswords.has(provider)
                      ? config.url
                      : config.url.replace(/:[^@]+@/, ":***@")}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleReveal(provider)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                      title={revealedPasswords.has(provider) ? "Hide" : "Show"}
                    >
                      {revealedPasswords.has(provider) ? (
                        <EyeOff size={14} className="inline" />
                      ) : (
                        <Eye size={14} className="inline" />
                      )}
                    </button>
                    <button
                      onClick={() => setShowDetailModal(provider)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleEnabled(provider)}
                      className={cn(
                        "text-xs px-2 py-1 rounded",
                        config.enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-200 text-gray-600"
                      )}
                    >
                      {config.enabled ? "✓ On" : "Off"}
                    </button>
                    <button
                      onClick={() => removeConfig(provider)}
                      className="text-xs text-red-600 hover:text-red-800 ml-auto"
                      title="Delete"
                    >
                      <Trash2 size={14} className="inline" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => addConfig(provider)}
                  className="text-xs text-gray-600 hover:text-gray-800 w-full py-2 border border-dashed border-gray-300 rounded hover:bg-gray-100"
                >
                  <Plus size={14} className="inline mr-1" />
                  Add {info.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {showDetailModal && getConfigForProvider(showDetailModal) && (
        <ProxyDetailModal
          provider={showDetailModal}
          config={getConfigForProvider(showDetailModal)!}
          onUpdate={(updates) => {
            updateConfig(showDetailModal, updates);
            setShowDetailModal(null);
          }}
          onClose={() => setShowDetailModal(null)}
        />
      )}

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        <p className="font-semibold mb-1">💡 Tip:</p>
        <ul className="list-disc list-inside space-y-1 text-blue-700">
          <li>Paste only the <strong>base credentials</strong> (no country, session, or lifetime modifiers)</li>
          <li>Only one provider can be active at a time</li>
          <li>Enable a provider to test if it works better against DataDome</li>
          <li>The system auto-detects the provider and applies sticky sessions</li>
        </ul>
      </div>

      <PhoneExtractionTester />
    </div>
  );
}

function PhoneExtractionTester() {
  const [url, setUrl] = useState("https://www.idealista.com/inmueble/102383577/");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/particulares/extract-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-sm">Testear extracción de teléfono (Idealista)</h3>
        <p className="text-xs text-gray-500">
          Corre el flujo real (proxy + CapSolver + fallback Playwright) contra un anuncio concreto.
          Puede tardar hasta 40s.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.idealista.com/inmueble/XXXXXXXX/"
          className="flex-1 px-3 py-2 border rounded text-sm font-mono"
        />
        <button
          onClick={runTest}
          disabled={loading}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? "Probando..." : "Test"}
        </button>
      </div>
      {error && (
        <div className="rounded bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          Error: {error}
        </div>
      )}
      {result && (
        <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ProxyDetailModal({
  provider,
  config,
  onUpdate,
  onClose,
}: {
  provider: ProxyProvider;
  config: ProxyConfig;
  onUpdate: (updates: Partial<ProxyConfig>) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(config.url);
  const [notes, setNotes] = useState(config.notes || "");
  const [showPassword, setShowPassword] = useState(false);
  const info = PROVIDER_INFO[provider];

  const handleSave = () => {
    onUpdate({ url, notes });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full">
        <div className="border-b p-4">
          <h2 className="font-semibold text-lg">{info.label} Configuration</h2>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium">Proxy URL</label>
            <p className="text-xs text-gray-500 mb-2">Format: {info.format}</p>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={info.placeholder}
                className="w-full px-3 py-2 border rounded text-sm font-mono"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., 'Mobile pool - for testing', 'Residential - primary'"
              className="w-full px-3 py-2 border rounded text-sm"
              rows={2}
            />
          </div>

          <div className="bg-gray-50 p-2 rounded text-xs text-gray-600 space-y-1">
            <p>
              <strong>Note:</strong> Paste only base credentials without country, session, or lifetime modifiers.
              The system adds these automatically.
            </p>
          </div>
        </div>

        <div className="border-t p-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
