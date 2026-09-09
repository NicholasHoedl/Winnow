import { AppearanceSection } from "../_components/appearance-section"

// No data to load: the theme is read from this device's storage and written through to
// the account whenever it changes, so the section needs nothing from the server.
export default function AppearanceSettingsPage() {
  return <AppearanceSection />
}
