import { getAiSettingsView } from "@/modules/preferences/queries"

import { AiSection } from "../_components/ai-section"

export default async function AiSettingsPage() {
  const ai = await getAiSettingsView()
  return <AiSection settings={ai} hasKey={ai.hasKey} keyHint={ai.keyHint} />
}
