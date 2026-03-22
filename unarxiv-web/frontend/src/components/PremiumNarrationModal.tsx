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
  setLastOption,
  hasKeyForProvider,
  type PremiumProvider,
} from "@/lib/premiumKeys";
import { track } from "@/lib/analytics";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import PlusIcons from "@/components/PlusIcons";

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
    providerLink: { label: "Get API Key →", url: "https://platform.openai.com/api-keys" },
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
    providerLink: { label: "Get API Key →", url: "https://elevenlabs.io/app/settings/api-keys" },
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
  const tier = VOICE_TIERS[estimate.option_id];
  const description = tier?.description ?? `${estimate.display_name}. ${estimate.tagline}`;
  const providerName = tier?.providerName ?? estimate.display_name;
  const plusCount = tier?.plusCount ?? 0;

  // Split description into bold lead phrase + rest
  const dotIdx = description.indexOf(".");
  const leadPhrase = dotIdx >= 0 ? description.slice(0, dotIdx + 1) : description;
  const rest = dotIdx >= 0 ? description.slice(dotIdx + 1).trim() : "";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative w-full text-left rounded-xl border-2 transition-all overflow-hidden ${
        disabled
          ? "border-stone-200 bg-stone-50 opacity-50 cursor-not-allowed"
          : selected
          ? "border-stone-700 bg-stone-50"
          : "border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50"
      }`}
    >
      {/* Key saved — corner triangle */}
      {!disabled && supported && (
        <div className="absolute top-0 left-0 w-7 h-7 z-10 opacity-50" title="API key saved">
          <div className="absolute inset-0 bg-stone-600" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute top-[3px] left-[3px]">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>
      )}
      {/* Upgraded — corner triangle */}
      {disabled && (
        <div className="absolute top-0 left-0 w-5 h-5 z-10" title="Already upgraded">
          <div className="absolute inset-0 bg-stone-400" style={{ clipPath: "polygon(0 0, 100% 0, 0 100%)" }} />
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="absolute top-[2px] left-[2px]">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}

      <div className="flex items-stretch">
        {/* Plus icons column — fixed width, horizontal layout */}
        <div
          className={`flex flex-col items-center justify-center rounded-l-[10px] border-r border-stone-200 bg-stone-50/50 px-3 shrink-0 ${disabled ? "opacity-40" : ""}`}
          style={{ width: "4rem" }}
        >
          {plusCount > 0 ? (
            <PlusIcons count={plusCount} size={15} className={disabled ? "text-stone-300" : "text-stone-600"} gap="gap-0.5" />
          ) : (
            <span className="text-stone-300 text-[10px]">—</span>
          )}
          <span className={`text-[7px] mt-1 ${disabled ? "text-stone-300" : "text-stone-400"} leading-tight text-center`}>
            {providerName}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-bold leading-snug ${disabled ? "text-stone-400" : "text-stone-700"}`}>{leadPhrase}</p>
            {rest && <p className="text-xs text-stone-500 leading-snug">{rest}</p>}
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
  // Start with fallback estimates so cards render immediately (no skeleton flash)
  const [loading, setLoading] = useState(false);
  const [estimates, setEstimates] = useState<PremiumOptionEstimate[]>(buildFallbackEstimates());
  const [estimateError, setEstimateError] = useState(false);

  // Step 1 selection — smart default computed once estimates + versions load
  const [selectedOptionId, setSelectedOptionId] = useState<string>("elevenlabs");
  const hasPickedDefault = useRef(false);

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

  // Determine the highest completed tier rank (for cascading disable logic)
  // If elevenlabs (rank 4) purchased → all disabled. openai (rank 3) → openai+free disabled. etc.
  let highestCompletedRank = 0;
  for (const v of existingVersions) {
    if (v.version_type === "free" && v.quality_rank === 0) continue; // base narration
    const tierId = v.tts_provider === "elevenlabs" ? "elevenlabs"
      : v.tts_provider === "openai" ? "openai" : "free";
    const rank = VOICE_TIERS[tierId]?.rank ?? 0;
    if (rank > highestCompletedRank) highestCompletedRank = rank;
  }
  const isFullyUpgraded = highestCompletedRank >= 4;

  // Load real estimates + existing versions on mount (fallbacks shown immediately)
  useEffect(() => {
    setEstimateError(false);
    getPremiumEstimate(paper.id)
      .then((resp) => {
        const opts = (resp.options ?? buildFallbackEstimates()).filter((o: PremiumOptionEstimate) => o.option_id !== "google");
        setEstimates(opts);
      })
      .catch(() => {
        setEstimateError(true);
      });
    getPaperVersions(paper.id)
      .then((resp) => setExistingVersions(resp.versions))
      .catch(() => {});
  }, [paper.id]);

  // Smart default: pick the highest-rank unpurchased tier the user has a key for,
  // or fall back to the highest unpurchased tier overall.
  useEffect(() => {
    if (estimates.length === 0 || hasPickedDefault.current) return;
    hasPickedDefault.current = true;

    // Sort available (unpurchased) options by rank descending
    const available = estimates
      .filter((e) => (VOICE_TIERS[e.option_id]?.rank ?? 0) > highestCompletedRank)
      .sort((a, b) => (VOICE_TIERS[b.option_id]?.rank ?? 0) - (VOICE_TIERS[a.option_id]?.rank ?? 0));

    if (available.length === 0) return;

    // Prefer highest tier where user already has all required API keys
    const cfg = (id: string) => ALL_OPTIONS.find((o) => o.id === id);
    const hasLlm = LLM_PROVIDERS.some((p) => hasKeyForProvider(p.id as PremiumProvider));
    const withKey = available.find((e) => {
      const c = cfg(e.option_id);
      if (!c) return false;
      if (c.id === "free") return hasLlm; // needs an LLM key
      if (c.unifiedKey) return hasKeyForProvider(c.provider);
      return hasKeyForProvider(c.provider) && hasLlm;
    });

    setSelectedOptionId((withKey ?? available[0]).option_id);
  }, [estimates, highestCompletedRank]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="text-stone-600 shrink-0">
                <rect x="8.5" y="2.5" width="3" height="15" rx="0.4" />
                <rect x="2.5" y="8.5" width="15" height="3" rx="0.4" />
                <rect x="7.5" y="1.8" width="5" height="1.2" rx="0.3" />
                <rect x="7.5" y="17" width="5" height="1.2" rx="0.3" />
                <rect x="1.8" y="7.5" width="1.2" height="5" rx="0.3" />
                <rect x="17" y="7.5" width="1.2" height="5" rx="0.3" />
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
                Every voice upgrade includes an improved script with AI narrations of figures, graphs, and math equations.
              </p>

              {loading ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-[4.5rem] rounded-xl bg-stone-100 animate-pulse" />
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
                    const isDisabled = (VOICE_TIERS[est.option_id]?.rank ?? 0) <= highestCompletedRank;
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
                  {/* estimate error handled silently — disclaimer shown in step 3 */}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: API Keys ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 leading-snug">
                You&apos;ll only need to enter these key(s) once. Keys are encrypted and saved locally in your browser.{" "}
                <a href="https://github.com/seanahrens/unarxiv" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-700">
                  See how on GitHub.
                </a>
              </p>

              {/* TTS key — shown for non-free options */}
              {selectedConfig.id !== "free" && (
                <KeyInputRow
                  label={selectedConfig.keyLabel}
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
                      label: "Get API Key →",
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
                {(() => {
                  const t = VOICE_TIERS[selectedEstimate.option_id];
                  const desc = t?.description ?? selectedEstimate.display_name;
                  const dotIdx = desc.indexOf(".");
                  const leadPhrase = dotIdx >= 0 ? desc.slice(0, dotIdx + 1) : desc;
                  const rest = dotIdx >= 0 ? desc.slice(dotIdx + 1).trim() : "";
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PlusIcons count={t?.plusCount ?? 0} size={12} />
                          <span className="text-sm font-semibold text-stone-800">{leadPhrase}</span>
                        </div>
                        <span className="text-xs text-stone-400">{t?.providerName ?? ""}</span>
                      </div>
                      {rest && <p className="text-xs text-stone-500">{rest}</p>}
                    </>
                  );
                })()}
                <div className="flex items-center justify-between pt-1 border-t border-stone-200 mt-1">
                  <span className="text-xs text-stone-500">Estimated cost</span>
                  <span className="text-sm font-semibold text-stone-700">
                    {totalCost === 0 ? "Free" : `~$${totalCost?.toFixed(2)}`}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-stone-400 text-center italic">
                Estimates are approximate — actual costs depend on the AI-generated script length.
              </p>

              <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                <p className="text-xs text-stone-500 leading-snug">
                  <span className="font-semibold text-stone-700">You&apos;re helping the community —</span>{" "}
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
                Start Narration Upgrade
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
      tagline: "Near-human voice quality.",
      estimated_cost_usd: 0.55,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.51,
      available: true,
    },
    {
      option_id: "openai",
      display_name: "OpenAI",
      tagline: "Natural-sounding, expressive voice.",
      estimated_cost_usd: 0.18,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0.14,
      available: true,
    },
    {
      option_id: "free",
      display_name: "Same Voice",
      tagline: "Same voice, AI-enhanced script.",
      estimated_cost_usd: 0.04,
      llm_cost_usd: 0.04,
      tts_cost_usd: 0,
      available: true,
    },
  ];
}
