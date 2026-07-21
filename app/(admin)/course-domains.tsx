import { Redirect } from "expo-router";

/** Legacy path kept so old links keep working. */
export default function LegacyCourseDomainsRedirect() {
  return <Redirect href="/(app)/admin/course-domains" />;
}
