import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Platform } from 'react-native';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={async (ev) => {
        // Only trigger haptics on iOS native platform
        if (Platform.OS === 'ios') {
          try {
            // Dynamic import to avoid loading on web
            const Haptics = await import('expo-haptics');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {
            // Haptics not available, ignore
          }
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
