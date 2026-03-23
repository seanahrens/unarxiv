"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  getStoredKeys,
  setLastOption,
  hasKeyForProvider,
  getDefaultScriptingProvider,
  setDefaultScriptingProvider,
  clearKeys,
  type PremiumProvider,
} from "@/lib/premiumKeys";
import { track } from "@/lib/analytics";
import { VOICE_TIERS, estimateProcessingSeconds, formatProcessingTime } from "@/lib/voiceTiers";
import { getHighestCompletedTierRank } from "@/lib/versionUtils";
import { useAudio } from "@/contexts/AudioContext";
import PlusIcons from "@/components/PlusIcons";

// ---------------------------------------------------------------------------
// Voice sample audio URLs (static files in public/samples/)
// ---------------------------------------------------------------------------

/** Round up to the nearest cent so sub-penny costs don't display as $0.00. */
function ceilCents(usd: number): string {
  return (Math.ceil(usd * 100) / 100).toFixed(2);
}

const SAMPLE_URLS: Record<string, string> = {
  plus3: "/samples/elevenlabs-sample.mp3",
  plus2: "/samples/openai-sample.mp3",
  plus1: "/samples/free-sample.mp3",
};

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
    id: "plus2",
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
    id: "plus3",
    provider: "elevenlabs",
    needsLlmKey: true,
    unifiedKey: false,
    keyLabel: "ElevenLabs API Key",
    providerLink: { label: "Get API Key →", url: "https://elevenlabs.io/app/settings/api-keys" },
  },
];

// unarXiv Voice — free TTS, just needs LLM key
const FREE_OPTION: OptionConfig = {
  id: "plus1",
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
  inProgress,
  onClick,
  isPlayingSample,
  onToggleSample,
  hasSample,
  scriptCharCount,
  hasExistingScript,
}: {
  option: OptionConfig;
  estimate: PremiumOptionEstimate;
  selected: boolean;
  supported: boolean;
  disabled: boolean;
  inProgress?: boolean;
  onClick: () => void;
  isPlayingSample: boolean;
  onToggleSample: () => void;
  hasSample: boolean;
  scriptCharCount: number;
  hasExistingScript: boolean;
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
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={`relative w-full text-left rounded-xl border-2 transition-all overflow-hidden ${
        disabled
          ? "border-stone-200 bg-stone-50 opacity-50 cursor-not-allowed"
          : selected
          ? "border-stone-700 bg-stone-50"
          : "border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50 cursor-pointer"
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
          {/* Voice sample play button — left of text */}
          {hasSample && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSample(); }}
              className="w-7 h-7 flex items-center justify-center rounded-full border border-stone-300 hover:border-stone-500 hover:bg-stone-100 transition-colors shrink-0"
              title={isPlayingSample ? "Stop sample" : "Play voice sample"}
            >
              {isPlayingSample ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-stone-600">
                  <rect x="1" y="1" width="8" height="8" rx="1" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-stone-600 ml-0.5">
                  <polygon points="1,0 10,5 1,10" />
                </svg>
              )}
            </button>
          )}
          <div className="flex-1 min-w-0 whitespace-nowrap">
            <p className={`text-xs font-bold leading-snug ${disabled ? "text-stone-400" : "text-stone-700"}`}>{leadPhrase}</p>
            {rest && <p className="text-xs text-stone-500 leading-snug">{rest}</p>}
          </div>
          <div className="text-right flex flex-col items-end shrink-0">
            {inProgress ? (
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">In Progress</span>
            ) : disabled ? (
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Unlocked</span>
            ) : (
              <>
                <span className="text-sm font-semibold text-stone-700">
                  {estimate.estimated_cost_usd === 0 ? "Free" : `~$${ceilCents(estimate.estimated_cost_usd)}`}
                </span>
                {tier && scriptCharCount > 0 && (
                  <p className="text-[11px] text-stone-500">
                    {formatProcessingTime(estimateProcessingSeconds(tier, scriptCharCount, hasExistingScript))} to process
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
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
  testState: "idle" | "testing" | "ok" | "fail" | "needs-credits";
  placeholder?: string;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-test key after typing pause (800ms) or immediate on paste (value jump)
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (!value.trim()) return;
    if (testState === "testing" || testState === "ok" || testState === "needs-credits") return;
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
    : testState === "needs-credits" ? "⚠ Valid key — needs credits"
    : null;

  const statusClass = testState === "ok"
    ? "text-emerald-600"
    : testState === "fail"
    ? "text-red-500"
    : testState === "needs-credits"
    ? "text-amber-500"
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
// All providers that can hold an API key (displayed in key management)
// ---------------------------------------------------------------------------

const KEY_MGMT_PROVIDERS: {
  id: PremiumProvider;
  label: string;
  link: string;
  placeholder: string;
  isScriptingCapable: boolean;
}[] = [
  { id: "openai", label: "OpenAI", link: "https://platform.openai.com/api-keys", placeholder: "sk-...", isScriptingCapable: true },
  { id: "google", label: "Google Gemini", link: "https://aistudio.google.com/app/apikey", placeholder: "AIza...", isScriptingCapable: true },
  { id: "anthropic", label: "Anthropic", link: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-...", isScriptingCapable: true },
  { id: "elevenlabs", label: "ElevenLabs", link: "https://elevenlabs.io/app/settings/api-keys", placeholder: "sk_...", isScriptingCapable: false },
];

// ---------------------------------------------------------------------------
// Key Management Panel
// ---------------------------------------------------------------------------

function KeyManagementPanel({ onBack }: { onBack: () => void }) {
  // Track which keys are stored (by presence of encrypted ciphertext)
  const storedKeys = getStoredKeys();

  // Local draft values — empty string means "unchanged". We never show the real key.
  const [drafts, setDrafts] = useState<Partial<Record<PremiumProvider, string>>>({});
  // Track which rows the user has actively modified
  const [modified, setModified] = useState<Set<PremiumProvider>>(new Set());
  // Validation states per provider
  const [testStates, setTestStates] = useState<Partial<Record<PremiumProvider, "idle" | "testing" | "ok" | "fail">>>({});
  // Default scripting provider
  const [defaultProv, setDefaultProv] = useState<string | null>(getDefaultScriptingProvider);
  // Saving indicator
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleChange = (provider: PremiumProvider, value: string) => {
    setDrafts((d) => ({ ...d, [provider]: value }));
    setModified((m) => { const s = new Set(m); s.add(provider); return s; });
    setTestStates((s) => ({ ...s, [provider]: "idle" }));
  };

  const handleClear = (provider: PremiumProvider) => {
    clearKeys(provider);
    setDrafts((d) => { const n = { ...d }; delete n[provider]; return n; });
    setModified((m) => { const s = new Set(m); s.delete(provider); return s; });
    setTestStates((s) => { const n = { ...s }; delete n[provider]; return n; });
    // If this was the default scripting provider, reassign to next available
    if (defaultProv === provider) {
      const fallback = KEY_MGMT_PROVIDERS.find(
        (p) => p.isScriptingCapable && p.id !== provider && hasKeyForProvider(p.id)
      );
      const next = fallback?.id ?? null;
      setDefaultProv(next);
      setDefaultScriptingProvider(next);
    }
  };

  const handleDefaultChange = (provider: string) => {
    const next = defaultProv === provider ? null : provider;
    setDefaultProv(next);
    setDefaultScriptingProvider(next);
  };

  // Save error message (shown when any key fails validation)
  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    const failed: string[] = [];
    // Only encrypt + store providers that were actually modified
    for (const provider of modified) {
      const raw = drafts[provider]?.trim();
      if (!raw) continue;
      try {
        const resp = await encryptKey(provider, raw);
        const result = await validateKey(provider, resp.encrypted_key);
        if (result.valid) {
          storeEncryptedKey(provider, resp.encrypted_key);
          setTestStates((s) => ({ ...s, [provider]: "ok" }));
          // Clear draft so it shows as stored masked key
          setDrafts((d) => { const n = { ...d }; delete n[provider]; return n; });
          setModified((m) => { const s = new Set(m); s.delete(provider); return s; });
        } else {
          setTestStates((s) => ({ ...s, [provider]: "fail" }));
          failed.push(KEY_MGMT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider);
        }
      } catch {
        setTestStates((s) => ({ ...s, [provider]: "fail" }));
        failed.push(KEY_MGMT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider);
      }
    }
    // If the current scripting default no longer has a valid stored key, reassign
    const currentDefault = getDefaultScriptingProvider();
    if (currentDefault && !hasKeyForProvider(currentDefault as PremiumProvider)) {
      const fallback = KEY_MGMT_PROVIDERS.find(
        (p) => p.isScriptingCapable && hasKeyForProvider(p.id)
      );
      const next = fallback?.id ?? null;
      setDefaultProv(next);
      setDefaultScriptingProvider(next);
    }

    setSaving(false);
    if (failed.length > 0) {
      setSaveError(`Invalid key for ${failed.join(", ")} — existing key unchanged.`);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const hasChanges = modified.size > 0 && [...modified].some((p) => (drafts[p]?.trim() ?? "").length > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500 leading-snug">
        Manage your API keys. Stored keys are encrypted locally in your browser.
      </p>

      {KEY_MGMT_PROVIDERS.map((prov) => {
        const hasKey = !!storedKeys[prov.id];
        const isModified = modified.has(prov.id);
        const draft = drafts[prov.id] ?? "";
        const testState = testStates[prov.id];

        // Placeholder-length masked value so it fills the field like a real key
        const MASKED_VALUE = "••••••••••••••••••••••••••••••••••••••••";

        return (
          <div key={prov.id} className="space-y-1.5">
            <div className="flex items-center justify-between pr-7">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-stone-700">{prov.label}</label>
                {prov.isScriptingCapable && (
                  <button
                    type="button"
                    onClick={() => handleDefaultChange(prov.id)}
                    title="Choose which AI provider generates the narration script (the transcript fed to text-to-speech)"
                    disabled={!hasKey && !(isModified && draft) && defaultProv !== prov.id}
                    className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border transition-colors ${
                      !(hasKey || (isModified && draft) || defaultProv === prov.id)
                        ? "border-transparent text-transparent pointer-events-none"
                        : defaultProv === prov.id
                        ? "border-stone-600 bg-stone-100 text-stone-700 font-medium"
                        : "border-stone-200 text-stone-400 hover:border-stone-400 hover:text-stone-600"
                    }`}
                    aria-hidden={!(hasKey || (isModified && draft) || defaultProv === prov.id)}
                  >
                    {defaultProv === prov.id ? "✓ Scripting Default" : "Make Scripting Default"}
                  </button>
                )}
              </div>
              <a
                href={prov.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-stone-400 hover:text-stone-600 underline shrink-0"
              >
                Get Key →
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={isModified ? draft : (hasKey ? MASKED_VALUE : "")}
                onChange={(e) => handleChange(prov.id, e.target.value)}
                onFocus={() => {
                  // Clear masked dots on focus so user can type a new key
                  if (hasKey && !isModified) {
                    handleChange(prov.id, "");
                  }
                }}
                onBlur={() => {
                  // If user focused then left without typing, restore unmodified state
                  if (isModified && !draft) {
                    setDrafts((d) => { const n = { ...d }; delete n[prov.id]; return n; });
                    setModified((m) => { const s = new Set(m); s.delete(prov.id); return s; });
                  }
                }}
                placeholder={prov.placeholder}
                className="flex-1 border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 font-mono"
              />
              {/* Fixed-width status column so inputs never shift */}
              <span className="w-5 text-center text-xs font-medium shrink-0">
                {hasKey && !isModified ? (
                  <button
                    type="button"
                    onClick={() => handleClear(prov.id)}
                    title="Remove key"
                    className="text-stone-300 hover:text-red-400 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                ) : testState === "ok" ? (
                  <span className="text-emerald-600">✓</span>
                ) : testState === "fail" ? (
                  <span className="text-red-500">✗</span>
                ) : testState === "testing" ? (
                  <span className="text-stone-400">…</span>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}

      {saveError && (
        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{saveError}</p>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-stone-100">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="px-4 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
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
  const [scriptCharCount, setScriptCharCount] = useState(0);

  // Voice sample playback (independent of global media player)
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null);
  const [availableSamples, setAvailableSamples] = useState<Set<string>>(new Set());
  const { actions: audioActions } = useAudio();

  // Check which sample MP3 files actually exist on mount
  useEffect(() => {
    const entries = Object.entries(SAMPLE_URLS);
    Promise.all(
      entries.map(([id, url]) =>
        fetch(url, { method: "HEAD" })
          .then((r) => (r.ok ? id : null))
          .catch(() => null)
      )
    ).then((results) => {
      setAvailableSamples(new Set(results.filter(Boolean) as string[]));
    });
  }, []);

  const stopSample = useCallback(() => {
    if (sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current.currentTime = 0;
    }
    setPlayingSampleId(null);
  }, []);

  const toggleSample = useCallback((optionId: string) => {
    // If already playing this sample, stop it
    if (playingSampleId === optionId) {
      stopSample();
      return;
    }
    // Pause the global media player first
    audioActions.pause();
    // Stop any other playing sample
    stopSample();
    // Create or reuse the audio element
    if (!sampleAudioRef.current) {
      sampleAudioRef.current = new Audio();
      sampleAudioRef.current.addEventListener("ended", () => setPlayingSampleId(null));
    }
    const url = SAMPLE_URLS[optionId];
    if (!url) return;
    sampleAudioRef.current.src = url;
    sampleAudioRef.current.play().catch(() => setPlayingSampleId(null));
    setPlayingSampleId(optionId);
  }, [playingSampleId, stopSample, audioActions]);

  // Stop sample when modal closes
  useEffect(() => {
    return () => {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        sampleAudioRef.current = null;
      }
    };
  }, []);

  // Step 1 selection — smart default computed when estimates + versions load
  const [selectedOptionId, setSelectedOptionId] = useState<string>("");

  // Step 2 key state
  const [ttsKeyRaw, setTtsKeyRaw] = useState("");
  const [ttsTestState, setTtsTestState] = useState<"idle" | "testing" | "ok" | "fail" | "needs-credits">("idle");
  const [llmProvider, setLlmProvider] = useState<string>(
    () => getDefaultScriptingProvider() ?? LLM_PROVIDERS[0].id
  );
  const [llmKeyRaw, setLlmKeyRaw] = useState("");
  const [llmTestState, setLlmTestState] = useState<"idle" | "testing" | "ok" | "fail" | "needs-credits">("idle");

  // Existing versions (to show completed badges)
  const [existingVersions, setExistingVersions] = useState<PaperVersion[]>([]);
  const [isNarrating, setIsNarrating] = useState(false);

  // Whether a premium LLM script already exists (no LLM cost for subsequent narrations)
  const [hasExistingScript, setHasExistingScript] = useState(false);

  // Key management panel toggle
  const [showKeyMgmt, setShowKeyMgmt] = useState(false);

  // Step 3 / submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const selectedConfig = ALL_OPTIONS.find((o) => o.id === selectedOptionId) ?? ALL_OPTIONS[1];
  const selectedEstimate = estimates.find((e) => e.option_id === selectedOptionId);

  // Determine the highest completed tier rank (for cascading disable logic)
  // If elevenlabs (rank 4) purchased → all disabled. openai (rank 3) → openai+free disabled. etc.
  const highestCompletedRank = getHighestCompletedTierRank(existingVersions);
  const isFullyUpgraded = highestCompletedRank >= 4;

  // Load estimates + existing versions on mount
  useEffect(() => {
    setLoading(true);
    setEstimateError(false);
    getPremiumEstimate(paper.id)
      .then((resp) => {
        const opts = (resp.options ?? []).filter((o: PremiumOptionEstimate) => o.option_id !== "google");
        setEstimates(opts);
        setHasExistingScript(resp.has_existing_script);
        setScriptCharCount(resp.word_count || 0);
        setLoading(false);
      })
      .catch(() => {
        setEstimateError(true);
        setLoading(false);
      });
    getPaperVersions(paper.id)
      .then((resp) => {
        setExistingVersions(resp.versions);
        setIsNarrating(resp.is_narrating);
      })
      .catch(() => {});
  }, [paper.id]);

  // Smart default: pick the highest-rank unpurchased tier the user has a key for,
  // or fall back to the highest unpurchased tier overall.
  // Re-runs when highestCompletedRank changes (versions load async).
  useEffect(() => {
    if (estimates.length === 0) return;

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
      if (c.id === "plus1") return hasLlm; // needs an LLM key
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
    if (selectedConfig.id === "plus1") {
      return hasLlmKeyStored(llmProvider);
    }
    if (selectedConfig.unifiedKey) {
      return hasTtsKey;
    }
    return hasTtsKey && hasLlmKeyStored(llmProvider);
  })();

  const handleStep1Next = () => {
    stopSample();
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
      if (result.valid && result.info?.includes("needs credits")) {
        setState("needs-credits");
      } else {
        setState(result.valid ? "ok" : "fail");
      }
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
    if (selectedConfig.id === "plus1" && !llmKeyRaw.trim() && !hasLlmKeyStored(llmProvider)) {
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
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <button
                type="button"
                onClick={() => setShowKeyMgmt((v) => !v)}
                title="Manage API Keys"
                className={`transition-colors ${showKeyMgmt ? "text-stone-700" : "text-stone-400 hover:text-stone-600"}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-stone-400 hover:text-stone-600 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* ── Key Management Panel ── */}
          {showKeyMgmt && (
            <KeyManagementPanel onBack={() => setShowKeyMgmt(false)} />
          )}

          {/* ── Step 1: Choose option ── */}
          {!showKeyMgmt && step === 1 && (
            <>
              <p className="text-xs text-stone-500 leading-snug">
                {hasExistingScript
                  ? "An improved script already exists for this paper — only TTS cost applies."
                  : "Every voice upgrade includes an improved script with AI narrations of figures, graphs, and math equations."}
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
                      : cfg.id === "plus1"
                      ? hasLlmKeyStored(llmProvider)
                      : hasKeyForProvider(cfg.provider);
                    const isCompleted = (VOICE_TIERS[est.option_id]?.rank ?? 0) <= highestCompletedRank;
                    // A tier is in-progress if the paper is narrating and there's a partial
                    // version for this tier (has transcript but no audio yet)
                    const tierInProgress = isNarrating && existingVersions.some(
                      (v) => v.narration_tier === est.option_id && !v.audio_url
                    );
                    const isDisabled = isCompleted || tierInProgress;
                    return (
                      <OptionCard
                        key={est.option_id}
                        option={cfg}
                        estimate={est}
                        selected={!isDisabled && selectedOptionId === est.option_id}
                        supported={isSupported}
                        disabled={isDisabled}
                        inProgress={tierInProgress}
                        onClick={() => { if (!isDisabled) setSelectedOptionId(est.option_id); }}
                        isPlayingSample={playingSampleId === est.option_id}
                        onToggleSample={() => toggleSample(est.option_id)}
                        hasSample={availableSamples.has(est.option_id)}
                        scriptCharCount={scriptCharCount}
                        hasExistingScript={hasExistingScript}
                      />
                    );
                  })}
                  {/* estimate error handled silently — disclaimer shown in step 3 */}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: API Keys ── */}
          {!showKeyMgmt && step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-stone-500 leading-snug">
                You&apos;ll only need to enter these key(s) once. Keys are encrypted and saved locally in your browser.{" "}
                <a href="https://github.com/seanahrens/unarxiv" target="_blank" rel="noopener noreferrer" className="underline hover:text-stone-700">
                  See how on GitHub.
                </a>
              </p>

              {/* TTS key — shown for non-free options when not already saved */}
              {selectedConfig.id !== "plus1" && (
                hasTtsKey ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs text-stone-500">{selectedConfig.keyLabel} saved</span>
                  </div>
                ) : (
                  <KeyInputRow
                    label={selectedConfig.keyLabel}
                    value={ttsKeyRaw}
                    onChange={(v) => { setTtsKeyRaw(v); setTtsTestState("idle"); }}
                    providerLink={selectedConfig.providerLink}
                    onTest={() => handleTestKey("tts", ttsKeyRaw, selectedConfig.provider)}
                    testState={ttsTestState}
                  />
                )
              )}

              {/* LLM key — shown for free + dual-key options when not already saved */}
              {selectedConfig.needsLlmKey && (
                hasLlmKeyStored(llmProvider) ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span className="text-xs text-stone-500">{LLM_PROVIDERS.find((p) => p.id === llmProvider)?.label ?? "LLM"} API Key saved</span>
                  </div>
                ) : (
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
                )
              )}


              {submitError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}
            </div>
          )}

          {/* ── Step 3: Confirm ── */}
          {!showKeyMgmt && step === 3 && selectedEstimate && (
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
                    {totalCost === 0 ? "Free" : `~$${ceilCents(totalCost ?? 0)}`}
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
          {!showKeyMgmt && step === 3 && !selectedEstimate && (
            <p className="text-sm text-stone-500">Loading estimate…</p>
          )}
        </div>

        {/* Footer buttons — hidden when key management is open (it has its own) */}
        {!showKeyMgmt && (
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
                  (selectedConfig.id !== "plus1" && ttsTestState !== "ok" && !hasTtsKey) ||
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
        )}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Fallback estimates when the API is unavailable
// ---------------------------------------------------------------------------

