"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { toast } from "sonner"

import type { AiSettings } from "@/modules/companion/ai-settings"
import { setAiApiKey, setAiSettings } from "@/modules/preferences/actions"
import {
  aiSettingsSchema,
  type AiSettingsInput,
} from "@/modules/preferences/validation"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Segmented } from "./segmented"
import { SettingsSection } from "./settings-section"

const ENABLED_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: true, label: "On" },
  { value: false, label: "Off" },
]

const PROVIDER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI-compatible" },
]

/** Per-provider hints. Placeholders, not defaults — nothing is filled in for you. */
const HINTS: Record<string, { baseUrl: string; model: string }> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-5",
  },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
}

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
  const hint = HINTS[provider] ?? HINTS.openai

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
      description="Off unless you configure it. Every generation is a paid call to the provider you name here."
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
              With this off, <code>/companion</code> does not exist — no nav
              tab, no page, and nothing is ever sent anywhere.
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
              These are two different wire protocols, not a URL difference —
              pick the one your key belongs to.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="ai-base-url">Base URL</FieldLabel>
            <Input
              id="ai-base-url"
              placeholder={hint.baseUrl}
              autoComplete="off"
              spellCheck={false}
              {...register("baseUrl")}
            />
            <p className="text-muted-foreground text-sm">
              No trailing slash, and without the endpoint path — the app appends{" "}
              <code>/messages</code> or <code>/chat/completions</code> itself.
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            <Input
              id="ai-model"
              placeholder={hint.model}
              autoComplete="off"
              spellCheck={false}
              {...register("model")}
            />
            <p className="text-muted-foreground text-sm">
              Recorded on every proposal, so a bad run can be traced to the
              model that produced it.
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
