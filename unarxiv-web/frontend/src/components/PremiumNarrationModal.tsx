"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getPremiumEstimate,
  requestPremiumNarration,
  encryptKey,
  validateKey,
  getPaperVersions,
  type PremiumOptionEstimate,
  type PaperVersion,
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
// Quality labels & voice descriptions (client-side, keyed by option_id)
// ---------------------------------------------------------------------------

const QUALITY_INFO: Record<string, { label: string; voiceNote: string; providerName: string }> = {
  elevenlabs: { label: "Most Lifelike Voice", voiceNote: "Almost indistinguishable from a real narrator. The most human-sounding AI voice available. Plus Improved Script.", providerName: "ElevenLabs" },
  openai: { label: "More Polished Voice", voiceNote: "Expressive and pleasant. You can tell it's AI, but it's easy to listen to for long papers. Plus Improved Script.", providerName: "OpenAI" },
  free: { label: "Just Improved Script", voiceNote: "Same voice as the existing narration, but with a much-improved AI-enhanced script.", providerName: "Microsoft Edge" },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
  disabled,
  onClick,
}: {
  option: OptionConfig;
  estimate: PremiumOptionEstimate;
  selected: boolean;
  supported: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const qi = QUALITY_INFO[estimate.option_id];
  const qualityLabel = qi?.label ?? estimate.display_name;
  const voiceNote = qi?.voiceNote ?? estimate.tagline;
  const providerName = qi?.providerName ?? estimate.display_name;

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all ${
        disabled
          ? "border-stone-200 bg-stone-50 opacity-50 cursor-not-allowed"
          : selected
          ? "border-stone-700 bg-stone-50"
          : supported
          ? "border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50"
          : "border-stone-200 bg-white opacity-60 hover:opacity-80"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-sm font-semibold ${disabled ? "text-stone-400" : "text-stone-800"}`}>{qualityLabel}</span>
            {disabled && (
              <span data-testid="completed-badge" className="text-[10px] font-medium text-stone-400 bg-stone-100 border border-stone-200 rounded px-1.5 py-px flex items-center gap-0.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Upgraded
              </span>
            )}
            {!disabled && supported && (
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-px">
                Key saved
              </span>
            )}
          </div>
          <div className="mb-1">
            <Stars count={estimate.stars} />
          </div>
          <p className="text-xs text-stone-500 leading-snug">{voiceNote}</p>
          <p className="text-[10px] text-stone-400 mt-0.5">{providerName}</p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end">
          <span className={`text-sm font-semibold ${disabled ? "text-stone-400" : "text-stone-700"}`}>
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-test key after typing pause (800ms) or immediate on paste (value jump)
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (!value.trim()) return;
    if (testState === "testing" || testState === "ok") return;
    // If value length jumped by 10+ chars, likely a paste — test immediately
    const isPaste = value.length - prevLenRef.current >= 10;
    prevLenRef.current = value.length;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(onTest, isPaste ? 100 : 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusText = testState === "testing" ? "Checking…"
    : testState === "ok" ? "✓ Valid"
    : testState === "fail" ? "✗ Invalid"
    : null;

  const statusClass = testState === "ok"
    ? "text-emerald-600"
    : testState === "fail"
    ? "text-red-500"
    : "text-stone-400";

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
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "sk-..."}
          className="flex-1 border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono"
        />
        {statusText && (
          <span className={`text-xs font-medium shrink-0 ${statusClass}`}>
            {statusText}
          </span>
        )}
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
  const [selectedOptionId, setSelectedOptionId] = useState<string>(lastOption || "elevenlabs");

  // Step 2 key state
  const [ttsKeyRaw, setTtsKeyRaw] = useState("");
  const [ttsTestState, setTtsTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [llmProvider, setLlmProvider] = useState<string>(LLM_PROVIDERS[0].id);
  const [llmKeyRaw, setLlmKeyRaw] = useState("");
  const [llmTestState, setLlmTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  // Existing versions (to show completed badges)
  const [existingVersions, setExistingVersions] = useState<PaperVersion[]>([]);

  // Step 3 / submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const selectedConfig = ALL_OPTIONS.find((o) => o.id === selectedOptionId) ?? ALL_OPTIONS[1];
  const selectedEstimate = estimates.find((e) => e.option_id === selectedOptionId);

  // Determine the highest completed star tier (for cascading disable logic)
  // If elevenlabs (5★) purchased → all disabled. openai (4★) → openai+free disabled. etc.
  const TIER_STAR_MAP: Record<string, number> = { elevenlabs: 5, openai: 4, free: 3 };
  let highestCompletedStars = 0;
  for (const v of existingVersions) {
    if (v.version_type === "free" && v.quality_rank === 0) continue; // base narration
    const tier = v.tts_provider === "elevenlabs" ? "elevenlabs"
      : v.tts_provider === "openai" ? "openai" : "free";
    const stars = TIER_STAR_MAP[tier] ?? 0;
    if (stars > highestCompletedStars) highestCompletedStars = stars;
  }
  const isFullyUpgraded = highestCompletedStars >= 5;

  // Load estimates + existing versions on mount
  useEffect(() => {
    setLoading(true);
    setEstimateError(false);
    getPremiumEstimate(paper.id)
      .then((resp) => {
        const opts = (resp.options ?? buildFallbackEstimates()).filter((o: PremiumOptionEstimate) => o.option_id !== "google");
        setEstimates(opts);
        setLoading(false);
      })
      .catch(() => {
        setEstimateError(true);
        setLoading(false);
        setEstimates(buildFallbackEstimates());
      });
    getPaperVersions(paper.id)
      .then((resp) => setExistingVersions(resp.versions))
      .catch(() => {});
  }, [paper.id]);

  // Auto-select the first non-disabled option when current selection would be disabled
  useEffect(() => {
    if (estimates.length === 0) return;
    const currentEst = estimates.find((e) => e.option_id === selectedOptionId);
    if (currentEst && currentEst.stars <= highestCompletedStars) {
      const firstAvailable = estimates.find((e) => e.stars > highestCompletedStars);
      if (firstAvailable) setSelectedOptionId(firstAvailable.option_id);
    }
  }, [estimates, highestCompletedStars]); // eslint-disable-line react-hooks/exhaustive-deps

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
        storeEncryptedKey(provider as PremiumProvider, resp.encrypted_key);
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
        <div className="px-6 pt-5 pb-3 border-b border-stone-100">
          <div className="flex items-start justify-between">
            <h2 className="text-base font-semibold text-stone-900 flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-current shrink-0">
                <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
              </svg>
              Upgrade Narration
            </h2>
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
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* ── Step 1: Choose option ── */}
          {step === 1 && (
            <>
              <p className="text-xs text-stone-500 leading-snug">
                Every upgrade rewrites the narration script with AI — adding natural descriptions of figures
                and equations so you can actually follow along. Upgrade the voice too if you want something
                more human. You bring your own API key; we don&apos;t charge anything.
              </p>

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
                    const isDisabled = est.stars <= highestCompletedStars;
                    return (
                      <OptionCard
                        key={est.option_id}
                        option={cfg}
                        estimate={est}
                        selected={!isDisabled && selectedOptionId === est.option_id}
                        supported={isSupported}
                        disabled={isDisabled}
                        onClick={() => { if (!isDisabled) setSelectedOptionId(est.option_id); }}
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
              <p className="text-xs text-stone-500 leading-snug">
                unarXiv doesn&apos;t charge you — the only cost is what your API provider bills for usage.
                Your keys are encrypted and saved locally in your browser. They&apos;re sent encrypted to our server
                only during narration and are never stored on our end.{" "}
                <a href="https://github.com/unarxiv/unarxiv" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-700">
                  See for yourself on GitHub.
                </a>
              </p>

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
                disabled={
                  (selectedConfig.id !== "free" && ttsTestState !== "ok" && !hasTtsKey) ||
                  (selectedConfig.needsLlmKey && llmTestState !== "ok" && !hasLlmKeyStored(llmProvider))
                }
                className="px-5 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                Start Upgrade Narration
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
      option_id: "elevenlabs",
      display_name: "ElevenLabs",
      stars: 5,
      tagline: "Near-human voice quality.",
      estimated_cost_usd: 0.55,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.51,
      available: true,
    },
    {
      option_id: "openai",
      display_name: "OpenAI",
      stars: 4,
      tagline: "Natural-sounding, expressive voice.",
      estimated_cost_usd: 0.18,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.14,
      available: true,
    },
    {
      option_id: "free",
      display_name: "Same Voice, Better Script",
      stars: 3,
      tagline: "Same voice, AI-enhanced script.",
      estimated_cost_usd: 0.04,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0,
      available: true,
    },
  ];
}
