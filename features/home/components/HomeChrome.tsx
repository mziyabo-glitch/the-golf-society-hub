import { View, Image } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { SocietySwitcherPill } from "@/components/SocietySwitcher";
import { HeaderSettingsPill } from "@/components/navigation/HeaderSettingsPill";

import { homeDashboardStyles as styles } from "../homeDashboardStyles";

const appIcon = require("@/assets/images/app-icon.png");

type Colors = ReturnType<typeof import("@/lib/ui/theme").getColors>;

export function HomeAppBar({
  colors,
  onOpenSettings,
}: {
  colors: Colors;
  onOpenSettings: () => void;
}) {
  return (
    <View style={[styles.appBarTier, { borderBottomColor: colors.borderLight }]}>
      <SocietySwitcherPill />
      <HeaderSettingsPill onPress={onOpenSettings} />
    </View>
  );
}

export function PoweredByFooter({ colors }: { colors: Colors }) {
  return (
    <View style={styles.poweredByWrap}>
      <Image source={appIcon} style={styles.poweredByIcon} resizeMode="contain" />
      <AppText variant="small" color="muted" style={styles.poweredByText}>
        Powered by Golf Society Hub
      </AppText>
    </View>
  );
}
