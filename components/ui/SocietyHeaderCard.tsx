/**
 * SocietyHeaderCard — logo 48x48 left, society name right, subtitle
 */

import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { Card } from "./Card";
import { SocietyLogoImage } from "./SocietyLogoImage";
import { getColors, spacing } from "@/lib/ui/theme";

type SocietyHeaderCardProps = {
  logoUrl: string | null;
  societyName: string;
  subtitle: string;
  getInitials: (name: string) => string;
};

export function SocietyHeaderCard({
  logoUrl,
  societyName,
  subtitle,
  getInitials,
}: SocietyHeaderCardProps) {
  const colors = getColors();

  return (
    <Card style={styles.card} padding={spacing.md}>
      <SocietyLogoImage
        logoUrl={logoUrl}
        size={48}
        placeholderText={getInitials(societyName)}
      />
      <View style={styles.textWrap}>
        <AppText variant="h2" style={styles.societyName} numberOfLines={1}>
          {societyName}
        </AppText>
        <AppText variant="small" color="secondary" numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  textWrap: {
    flex: 1,
    marginLeft: spacing.md,
  },
  societyName: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
  },
});
