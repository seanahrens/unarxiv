"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getPremiumEstimate,
  requestPremiumNarration,
  encryptKey,
  validateKey,
  type PremiumOptionEstimate,
  type Paper,
} from "@/lib/api";
import {
  storeEncryptedKey,
  getStoredKey,
  getLastOption,
  setLastOption,
  hasKeyForProvider,
  type PremiumProvider,
} from "@/lib/premiumKeys";
import { track } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

interface ProviderLink {
  label: string;
  url: string;
}

interface OptionConfig {
  id: string;
  provider: PremiumProvider;
  /** For dual-key options: the TTS key provider. For unified: same as id. */
  ttsProvider?: PremiumProvider;
  /** Whether this option needs a separate LLM key + provider selector */
  needsLlmKey: boolean;
  /** Whether this option uses a single key covering both LLM + TTS */
  unifiedKey: boolean;
  keyLabel: string;
  providerLink: ProviderLink;
  llmProviderLink?: ProviderLink;
}

// Providers that use a single key covering both scripting and voice
const UNIFIED_KEY_OPTIONS: OptionConfig[] = [
  {
    id: "openai",
    provider: "openai",
    needsLlmKey: false,
    unifiedKey: true,
    keyLabel: "OpenAI API Key",
    providerLink: { label: "Get OpenAI API Key →", url: "https://platform.openai.com/api-keys" },
  },
  {
    id: "google",
    provider: "google",
    needsLlmKey: false,
    unifiedKey: true,
    keyLabel: "Google Cloud API Key",
    providerLink: { label: "Get Google Cloud API Key →", url: "https://console.cloud.google.com/apis/credentials" },
  },
];

// Providers that need a TTS key + separate LLM provider
const DUAL_KEY_OPTIONS: OptionConfig[] = [
  {
    id: "elevenlabs",
    provider: "elevenlabs",
    needsLlmKey: true,
    unifiedKey: false,
    keyLabel: "ElevenLabs API Key",
    providerLink: { label: "Get ElevenLabs API Key →", url: "https://elevenlabs.io/app/settings/api-keys" },
  },
  {
    id: "polly",
    provider: "polly",
    needsLlmKey: true,
    unifiedKey: false,
    keyLabel: "AWS Access Key / Secret",
    providerLink: { label: "Get AWS Credentials →", url: "https://console.aws.amazon.com/iam/home#/users" },
  },
  {
    id: "azure",
    provider: "azure",
    needsLlmKey: true,
    unifiedKey: false,
    keyLabel: "Azure Speech API Key",
    providerLink: { label: "Get Azure Speech Key →", url: "https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices" },
  },
];

// unarXiv Voice — free TTS, just needs LLM key
const FREE_OPTION: OptionConfig = {
  id: "free",
  provider: "free",
  needsLlmKey: true,
  unifiedKey: false,
  keyLabel: "",
  providerLink: { label: "", url: "" },
};

const ALL_OPTIONS: OptionConfig[] = [FREE_OPTION, ...UNIFIED_KEY_OPTIONS, ...DUAL_KEY_OPTIONS];

const LLM_PROVIDERS = [
  { id: "openai", label: "OpenAI", link: "https://platform.openai.com/api-keys" },
  { id: "google", label: "Google Gemini", link: "https://aistudio.google.com/app/apikey" },
  { id: "anthropic", label: "Anthropic", link: "https://console.anthropic.com/settings/keys" },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timeout.current) clearTimeout(timeout.current);
    setOpen(true);
    timeout.current = setTimeout(() => setOpen(false), 4000);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={show}
        className="w-4 h-4 rounded-full border border-stone-400 text-stone-400 hover:text-stone-600 hover:border-stone-600 flex items-center justify-center text-[10px] font-bold leading-none transition-colors"
      >
        i
      </button>
      {open && (
        <span className="absolute left-6 top-1/2 -translate-y-1/2 bg-stone-800 text-white text-xs rounded-lg px-3 py-2 w-60 z-50 shadow-lg leading-snug">
          {text}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-stone-800" />
        </span>
      )}
    </span>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-px" aria-label={`${count} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill={i <= count ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          className={i <= count ? "text-amber-500" : "text-stone-300"}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </span>
  );
}

function OptionCard({
  option,
  estimate,
  selected,
  supported,
  onClick,
}: {
  option: OptionConfig;
  estimate: PremiumOptionEstimate;
  selected: boolean;
  supported: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
        selected
          ? "border-stone-700 bg-stone-50"
          : supported
          ? "border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50"
          : "border-stone-200 bg-white opacity-60 hover:opacity-80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-stone-800">{estimate.display_name}</span>
            <Stars count={estimate.stars} />
            {supported && (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-px">
                Key saved
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500 leading-snug">{estimate.tagline}</p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-sm font-semibold text-stone-700">
            {estimate.estimated_cost_usd === 0 ? "Free" : `~$${estimate.estimated_cost_usd.toFixed(2)}`}
          </span>
          {estimate.estimated_cost_usd > 0 && (
            <p className="text-[10px] text-stone-400">for this paper</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Key Input Row
// ---------------------------------------------------------------------------

function KeyInputRow({
  label,
  value,
  onChange,
  providerLink,
  onTest,
  testState,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  providerLink: { label: string; url: string };
  onTest: () => void;
  testState: "idle" | "testing" | "ok" | "fail";
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-stone-700">{label}</label>
        {providerLink.url && (
          <a
            href={providerLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-stone-500 hover:text-stone-700 underline"
          >
            {providerLink.label}
          </a>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "sk-..."}
          className="flex-1 border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={!value.trim() || testState === "testing"}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
            testState === "ok"
              ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
              : testState === "fail"
              ? "bg-red-50 text-red-600 border border-red-300"
              : "bg-stone-100 text-stone-600 border border-stone-300 hover:bg-stone-200 disabled:opacity-50"
          }`}
        >
          {testState === "testing" ? "Testing…" : testState === "ok" ? "✓ Valid" : testState === "fail" ? "✗ Invalid" : "Test"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

interface PremiumNarrationModalProps {
  paper: Paper;
  onClose: () => void;
  onSuccess?: (updatedPaper: Paper) => void;
}

export default function PremiumNarrationModal({
  paper,
  onClose,
  onSuccess,
}: PremiumNarrationModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [estimates, setEstimates] = useState<PremiumOptionEstimate[]>([]);
  const [estimateError, setEstimateError] = useState(false);

  // Step 1 selection
  const lastOption = getLastOption();
  const [selectedOptionId, setSelectedOptionId] = useState<string>(lastOption || "openai");

  // Step 2 key state
  const [ttsKeyRaw, setTtsKeyRaw] = useState("");
  const [ttsTestState, setTtsTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [llmProvider, setLlmProvider] = useState<string>(LLM_PROVIDERS[0].id);
  const [llmKeyRaw, setLlmKeyRaw] = useState("");
  const [llmTestState, setLlmTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [rememberKeys, setRememberKeys] = useState(true);

  // Step 3 / submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // AI scripting tooltip text
  const scriptingInfoText =
    "AI-enhanced scripting adds: natural descriptions of figures and equations, improved readability for math notation, and smooth section transitions. This makes the narration much easier to follow.";

  const selectedConfig = ALL_OPTIONS.find((o) => o.id === selectedOptionId) ?? ALL_OPTIONS[1];
  const selectedEstimate = estimates.find((e) => e.option_id === selectedOptionId);

  // Load estimates on mount
  useEffect(() => {
    setLoading(true);
    setEstimateError(false);
    getPremiumEstimate(paper.id)
      .then((resp) => {
        setEstimates(resp.options ?? buildFallbackEstimates());
        setLoading(false);
      })
      .catch(() => {
        setEstimateError(true);
        setLoading(false);
        // Fallback estimates so the UI is still usable
        setEstimates(buildFallbackEstimates());
      });
  }, [paper.id]);

  // When option changes, reset key state and pre-fill from stored keys
  useEffect(() => {
    setTtsKeyRaw("");
    setTtsTestState("idle");
    setLlmKeyRaw("");
    setLlmTestState("idle");
  }, [selectedOptionId]);

  // Check if user has keys for selected config
  const hasTtsKey = selectedConfig.ttsProvider
    ? hasKeyForProvider(selectedConfig.ttsProvider)
    : selectedConfig.unifiedKey
    ? hasKeyForProvider(selectedConfig.provider)
    : false;

  const hasLlmKeyStored = (prov: string) => hasKeyForProvider(prov as PremiumProvider);

  // Determine if we can skip step 2 (returning user with stored keys)
  const canSkipKeys = (() => {
    if (selectedConfig.id === "free") {
      return hasLlmKeyStored(llmProvider);
    }
    if (selectedConfig.unifiedKey) {
      return hasTtsKey;
    }
    return hasTtsKey && hasLlmKeyStored(llmProvider);
  })();

  const handleStep1Next = () => {
    setLastOption(selectedOptionId);
    if (canSkipKeys) {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleTestKey = async (
    type: "tts" | "llm",
    rawKey: string,
    provider: string
  ) => {
    const setState = type === "tts" ? setTtsTestState : setLlmTestState;
    setState("testing");
    try {
      const encrypted = await encryptKey(provider, rawKey);
      const result = await validateKey(provider, encrypted.encrypted_key);
      setState(result.valid ? "ok" : "fail");
    } catch {
      setState("fail");
    }
  };

  const handleStep2Next = async () => {
    // Encrypt and store any provided keys
    const storeKey = async (rawKey: string, provider: string) => {
      if (!rawKey.trim()) return null;
      try {
        const resp = await encryptKey(provider, rawKey.trim());
        if (rememberKeys) {
          storeEncryptedKey(provider as PremiumProvider, resp.encrypted_key);
        }
        return resp.encrypted_key;
      } catch {
        return null;
      }
    };

    if (selectedConfig.unifiedKey && !ttsKeyRaw.trim() && !hasTtsKey) {
      setSubmitError("Please provide an API key.");
      return;
    }
    if (selectedConfig.id === "free" && !llmKeyRaw.trim() && !hasLlmKeyStored(llmProvider)) {
      setSubmitError("Please provide an LLM API key.");
      return;
    }

    await storeKey(ttsKeyRaw, selectedConfig.provider);
    await storeKey(llmKeyRaw, llmProvider);

    setSubmitError("");
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");

    const encryptedKeys: Record<string, string> = {};

    // Collect stored encrypted keys
    const storedTts = getStoredKey(selectedConfig.provider);
    if (storedTts) encryptedKeys[selectedConfig.provider] = storedTts;

    if (selectedConfig.needsLlmKey) {
      const storedLlm = getStoredKey(llmProvider as PremiumProvider);
      if (storedLlm) encryptedKeys[llmProvider] = storedLlm;
    }

    try {
      const updatedPaper = await requestPremiumNarration(paper.id, {
        option_id: selectedOptionId,
        encrypted_keys: encryptedKeys,
        llm_provider: selectedConfig.needsLlmKey ? llmProvider : undefined,
      });

      track("premium_narration_requested", {
        arxiv_id: paper.id,
        option_id: selectedOptionId,
        estimated_cost: selectedEstimate?.estimated_cost_usd ?? 0,
      });

      onSuccess?.(updatedPaper);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const totalCost = selectedEstimate?.estimated_cost_usd ?? null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-lg mx-auto overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-stone-100">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-stone-900 flex items-center gap-1.5">
                <span>✨</span>
                Premium Narration
              </h2>
              <p className="text-xs text-stone-500 mt-0.5 line-clamp-1" title={paper.title}>
                {paper.title}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-stone-400 hover:text-stone-600 transition-colors ml-4 shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mt-4">
            {([1, 2, 3] as const).map((s) => (
              <div
                key={s}
                className={`h-1 rounded-full transition-all ${
                  s === step ? "flex-1 bg-stone-700" : s < step ? "w-8 bg-stone-400" : "w-8 bg-stone-200"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* ── Step 1: Choose option ── */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <span>All options include AI-enhanced scripting</span>
                <InfoTooltip text={scriptingInfoText} />
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-stone-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {estimates.map((est) => {
                    const cfg = ALL_OPTIONS.find((o) => o.id === est.option_id);
                    if (!cfg) return null;
                    const isSupported = cfg.unifiedKey
                      ? hasKeyForProvider(cfg.provider)
                      : cfg.id === "free"
                      ? hasLlmKeyStored(llmProvider)
                      : hasKeyForProvider(cfg.provider);
                    return (
                      <OptionCard
                        key={est.option_id}
                        option={cfg}
                        estimate={est}
                        selected={selectedOptionId === est.option_id}
                        supported={isSupported}
                        onClick={() => setSelectedOptionId(est.option_id)}
                      />
                    );
                  })}
                  {estimateError && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      Estimates are approximate — costs may vary depending on paper length.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: API Keys ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <span>Key storage policy</span>
                <InfoTooltip text="Your API keys are encrypted server-side before being stored. They are never logged or shared. You can clear them at any time from My Papers." />
              </div>

              {/* TTS key — shown for non-free options */}
              {selectedConfig.id !== "free" && (
                <KeyInputRow
                  label={`${selectedConfig.keyLabel}${selectedConfig.unifiedKey ? " (covers scripting + voice)" : ""}`}
                  value={ttsKeyRaw}
                  onChange={(v) => { setTtsKeyRaw(v); setTtsTestState("idle"); }}
                  providerLink={selectedConfig.providerLink}
                  onTest={() => handleTestKey("tts", ttsKeyRaw, selectedConfig.provider)}
                  testState={ttsTestState}
                />
              )}

              {/* LLM key — shown for free + dual-key options */}
              {selectedConfig.needsLlmKey && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-stone-700">
                      LLM Provider{" "}
                      <span className="text-stone-400 font-normal">(for AI scripting)</span>
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {LLM_PROVIDERS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setLlmProvider(p.id); setLlmTestState("idle"); }}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            llmProvider === p.id
                              ? "border-stone-700 bg-stone-100 text-stone-800 font-medium"
                              : "border-stone-200 text-stone-600 hover:border-stone-400"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <KeyInputRow
                    label={`${LLM_PROVIDERS.find((p) => p.id === llmProvider)?.label ?? "LLM"} API Key`}
                    value={llmKeyRaw}
                    onChange={(v) => { setLlmKeyRaw(v); setLlmTestState("idle"); }}
                    providerLink={{
                      label: `Get ${LLM_PROVIDERS.find((p) => p.id === llmProvider)?.label ?? ""} Key →`,
                      url: LLM_PROVIDERS.find((p) => p.id === llmProvider)?.link ?? "",
                    }}
                    onTest={() => handleTestKey("llm", llmKeyRaw, llmProvider)}
                    testState={llmTestState}
                  />
                </>
              )}

              {/* Remember keys checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberKeys}
                  onChange={(e) => setRememberKeys(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-stone-700"
                />
                <span className="text-xs text-stone-600">Remember my keys on this device</span>
              </label>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {step === 3 && selectedEstimate && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-stone-800">{selectedEstimate.display_name}</span>
                  <div className="flex items-center gap-1.5">
                    <Stars count={selectedEstimate.stars} />
                  </div>
                </div>
                <p className="text-xs text-stone-500">{selectedEstimate.tagline}</p>
                <div className="flex items-center justify-between pt-1 border-t border-stone-200 mt-1">
                  <span className="text-xs text-stone-500">Estimated cost</span>
                  <span className="text-sm font-semibold text-stone-700">
                    {totalCost === 0 ? "Free" : `~$${totalCost?.toFixed(2)}`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-800 leading-snug">
                  <span className="font-semibold">You&apos;re helping the community —</span>{" "}
                  everyone benefits from the upgraded narration of this paper. Thank you!
                </p>
              </div>

              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </div>
          )}

          {/* Fallback if no estimate found in step 3 */}
          {step === 3 && !selectedEstimate && (
            <p className="text-sm text-stone-500">Loading estimate…</p>
          )}
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-stone-100 flex gap-2 justify-end">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStep1Next}
                disabled={loading || !selectedEstimate}
                className="px-5 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {canSkipKeys ? "Review & Confirm" : "Continue"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleStep2Next}
                className="px-5 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors"
              >
                Review & Confirm
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep(canSkipKeys ? 1 : 2)}
                className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && (
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                Start Premium Narration
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Fallback estimates when the API is unavailable
// ---------------------------------------------------------------------------

function buildFallbackEstimates(): PremiumOptionEstimate[] {
  return [
    {
      option_id: "free",
      display_name: "unarXiv Voice",
      stars: 3,
      tagline: "Same voice, smarter script.",
      estimated_cost_usd: 0.04,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0,
      available: true,
    },
    {
      option_id: "openai",
      display_name: "OpenAI TTS",
      stars: 4,
      tagline: "Natural-sounding, expressive voices.",
      estimated_cost_usd: 0.18,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.14,
      available: true,
    },
    {
      option_id: "google",
      display_name: "Google Cloud TTS",
      stars: 4,
      tagline: "High-quality, multilingual voices.",
      estimated_cost_usd: 0.12,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.08,
      available: true,
    },
    {
      option_id: "elevenlabs",
      display_name: "ElevenLabs",
      stars: 5,
      tagline: "Near-human voice quality. Best for long papers.",
      estimated_cost_usd: 0.55,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.51,
      available: true,
    },
    {
      option_id: "polly",
      display_name: "Amazon Polly",
      stars: 4,
      tagline: "Reliable, low-latency AWS voice synthesis.",
      estimated_cost_usd: 0.1,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.06,
      available: true,
    },
    {
      option_id: "azure",
      display_name: "Azure Speech",
      stars: 4,
      tagline: "Crisp neural voices from Microsoft Azure.",
      estimated_cost_usd: 0.14,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.10,
      available: true,
    },
  ];
}
