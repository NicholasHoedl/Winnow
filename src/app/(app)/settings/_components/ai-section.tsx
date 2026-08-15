"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import { listAiModels } from "@/modules/companion/actions"
import type { AiSettings } from "@/modules/companion/ai-settings"
import { setAiApiKey, setAiSettings } from "@/modules/preferences/actions"
import {
  aiSettingsSchema,
  type AiSettingsInput,
} from "@/modules/preferences/validation"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Segmented } from "./segmented"
import { SettingsSection } from "./settings-section"

/** One entry in the model dropdown. Mirrors `AiModel`, but the action returns plain data
 *  so nothing about the request shape crosses into the client. */
type AiModelOption = { id: string; label: string }

const ENABLED_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
]

const PROVIDER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "custom", label: "Custom" },
]

/**
 * The companion's configuration (T11), moved here from the environment.
 *
 * Two forms, deliberately. The settings submit together; the API key has its own, because
 * a write-only field is empty on every render — so if it shared this form, saving a model
 * change would clear the stored key every single time.
 */
export function AiSection({
  settings,
  hasKey,
  keyHint,
}: {
  settings: AiSettings
  /** Whether a key is stored. The key itself never reaches this component. */
  hasKey: boolean
  /** Enough of the key to tell which one is saved — the last four. Never the whole thing. */
  keyHint: string | null
}) {
  const router = useRouter()
  const [key, setKey] = React.useState("")
  const [savingKey, setSavingKey] = React.useState(false)

  const {
    control,
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { isSubmitting },
  } = useForm<AiSettingsInput>({
    resolver: standardSchemaResolver(aiSettingsSchema),
    defaultValues: {
      enabled: settings.enabled,
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      model: settings.model,
    },
  })

  const provider = watch("provider")
  const model = watch("model")
  const isCustom = provider === "custom"

  const [models, setModels] = React.useState<AiModelOption[] | null>(null)
  const [modelsError, setModelsError] = React.useState<string | null>(null)
  const [loadingModels, setLoadingModels] = React.useState(false)

  /**
   * Ask the provider what it serves.
   *
   * Reads the form through `getValues` rather than taking the values as arguments, so a
   * custom endpoint's URL is not a dependency of the effect below — otherwise every
   * keystroke in that box would fire a request at a half-typed address.
   */
  const loadModels = React.useCallback(async () => {
    const values = getValues()
    setLoadingModels(true)
    setModelsError(null)
    const result = await listAiModels({
      provider: values.provider,
      baseUrl: values.baseUrl,
    })
    if (result.ok) setModels(result.models)
    else {
      setModels(null)
      setModelsError(result.error)
    }
    setLoadingModels(false)
  }, [getValues])

  // On arrival, and whenever the provider changes — that is the moment the old list stops
  // being true. A custom URL refreshes on the button instead, for the reason above.
  React.useEffect(() => {
    void loadModels()
  }, [provider, loadModels])

  /**
   * What the dropdown offers.
   *
   * The saved model is included even when the provider did not list it, and that is the
   * important part: without it, opening Settings while the provider is unreachable — or
   * after it retires a model you are still configured for — would silently drop your
   * setting the moment you pressed Save.
   */
  const modelOptions: AiModelOption[] = React.useMemo(() => {
    const list = models ?? []
    if (!model || list.some((entry) => entry.id === model)) return list
    const label = models === null ? model : `${model} (not offered now)`
    return [{ id: model, label }, ...list]
  }, [models, model])

  const onSubmit = handleSubmit(async (data) => {
    const result = await setAiSettings(data)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("AI settings saved")
    router.refresh()
  })

  async function saveKey(value: string) {
    setSavingKey(true)
    try {
      const result = await setAiApiKey({ apiKey: value })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      // Cleared on purpose, whichever way this went: the field is write-only, and leaving
      // the pasted key sitting in an input is exactly what this whole section avoids.
      setKey("")
      toast.success(value ? "API key saved" : "API key removed")
      router.refresh()
    } finally {
      setSavingKey(false)
    }
  }

  return (
    <SettingsSection
      title="AI companion"
      description="Off unless you configure it. Every generation is a paid call to the provider you name here. The tools live on the pages they act on — plan a goal on Goals, build a routine on Routines, read your week on Review, read transactions on Budget."
    >
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel>Companion</FieldLabel>
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={ENABLED_OPTIONS}
                />
              )}
            />
            <p className="text-muted-foreground text-sm">
              With this off, the four AI tools are not rendered at all — no
              panel on Goals, Routines, Review or Budget — and nothing is ever
              sent anywhere. Those pages work exactly as they do now without it.
            </p>
          </Field>

          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Controller
              control={control}
              name="provider"
              render={({ field }) => (
                <Segmented
                  value={field.value}
                  onChange={field.onChange}
                  options={PROVIDER_OPTIONS}
                />
              )}
            />
            <p className="text-muted-foreground text-sm">
              Anthropic and OpenAI are two different wire protocols, not a URL
              difference — pick the one your key belongs to. <b>Custom</b> is
              anything OpenAI-compatible you host or proxy yourself.
            </p>
          </Field>

          {/* Only for Custom. The other two have exactly one correct address, and
              `resolveBaseUrl` writes it on save whatever this field happens to hold —
              so showing it there would be offering a choice that does not exist. */}
          {isCustom && (
            <Field>
              <FieldLabel htmlFor="ai-base-url">Base URL</FieldLabel>
              <Input
                id="ai-base-url"
                placeholder="http://127.0.0.1:11434/v1"
                autoComplete="off"
                spellCheck={false}
                {...register("baseUrl")}
              />
              <p className="text-muted-foreground text-sm">
                No trailing slash, and without the endpoint path — the app
                appends <code>/chat/completions</code> itself.
              </p>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            {modelOptions.length > 0 ? (
              <Controller
                control={control}
                name="model"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ai-model">
                      {/* A bare <SelectValue/> would print the raw id even when the
                          provider gave a friendlier name. base-ui needs the function. */}
                      <SelectValue>
                        {(value) =>
                          modelOptions.find((entry) => entry.id === value)
                            ?.label ??
                          (value as string) ??
                          "Choose a model"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((entry) => (
                        <SelectItem key={entry.id} value={entry.id}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                {loadingModels
                  ? "Asking the provider what it serves…"
                  : (modelsError ??
                    "The provider listed no models it can serve.")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingModels}
                onClick={() => void loadModels()}
              >
                {loadingModels ? "Loading…" : "Refresh models"}
              </Button>
              {/* Shown beside the list too, not only in place of it: a stale list plus a
                  failed refresh is exactly when you need to know the list is stale. */}
              {modelsError !== null && modelOptions.length > 0 && (
                <span className="text-muted-foreground text-sm">
                  {modelsError}
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              Fetched from the provider with your saved key, so this is what
              your account can actually use. Recorded on every proposal, so a
              bad run can be traced to the model that produced it.
            </p>
          </Field>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save AI settings"}
            </Button>
          </div>
        </FieldGroup>
      </form>

      {/* Its own form, and its own action — see the note at the top of this file. */}
      <form
        className="mt-6 border-t pt-6"
        onSubmit={(event) => {
          event.preventDefault()
          const trimmed = key.trim()
          if (!trimmed) return
          void saveKey(trimmed)
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ai-key">API key</FieldLabel>
            {/* NO `name`, and that is load-bearing — do not add one, and do not wire this
                through `register()`.

                Every settings form in this app is a plain `<form onSubmit>` whose handler
                calls preventDefault. Before React hydrates there is no handler, so a submit
                falls back to a NATIVE GET: the browser navigates to this page with every
                NAMED field appended as a query parameter. Harmless for a model name; for an
                API key it would put the secret in the address bar, in history, and in the
                server's request log. An unnamed input is not serialised, which is what
                keeps that impossible rather than merely unlikely. */}
            <Input
              id="ai-key"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={hasKey ? `Saved · ${keyHint}` : "Paste a key"}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-muted-foreground text-sm">
              {hasKey
                ? "A key is saved. It is never shown again and never leaves the server — paste a new one to replace it."
                : "Stored in this app's database in plain text, on your own machine. It is excluded from the account export, so a backup file can't spend money."}
            </p>
          </Field>

          <div className="flex gap-2">
            <Button type="submit" disabled={savingKey || !key.trim()}>
              {savingKey ? "Saving…" : hasKey ? "Replace key" : "Save key"}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={savingKey}
                onClick={() => void saveKey("")}
              >
                Remove key
              </Button>
            )}
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  )
}
