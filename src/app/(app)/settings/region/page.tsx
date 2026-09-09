import { getUserPreferences } from "@/modules/preferences/queries"

import { RegionSection } from "../_components/region-section"

export default async function RegionSettingsPage() {
  const preferences = await getUserPreferences()
  return <RegionSection preferences={preferences} />
}
