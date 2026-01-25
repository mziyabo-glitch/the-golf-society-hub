import { Redirect } from "expo-router";

export default function EventIndex() {
  // If someone goes to /event, send them to the Event tab
  return <Redirect href="/(app)/(tabs)/event" />;
}
