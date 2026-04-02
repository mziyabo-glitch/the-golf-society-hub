/**
 * Button Components — Primary, Secondary, Destructive; implemented via AppButton.
 *
 * Supports:
 *   <PrimaryButton>Save</PrimaryButton>
 *   <PrimaryButton label="Save" />
 */

import { ViewStyle } from "react-native";
import { AppButton, type AppButtonProps } from "./AppButton";

type ButtonProps = Omit<AppButtonProps, "variant"> & {
  /** Shown next to the spinner when `loading` is true (e.g. "Saving…"). */
  loadingLabel?: string;
};

export function PrimaryButton({
  label,
  children,
  loadingLabel,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  return (
    <AppButton
      variant="primary"
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      loadingLabel={loadingLabel}
      style={style as ViewStyle}
      size={size}
      icon={icon}
      iconPosition={iconPosition}
    >
      {children}
    </AppButton>
  );
}

export function SecondaryButton({
  label,
  children,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  return (
    <AppButton
      variant="secondary"
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      style={style as ViewStyle}
      size={size}
      icon={icon}
      iconPosition={iconPosition}
    >
      {children}
    </AppButton>
  );
}

export function DestructiveButton({
  label,
  children,
  onPress,
  disabled,
  loading,
  style,
  size = "md",
  icon,
  iconPosition = "left",
}: ButtonProps) {
  return (
    <AppButton
      variant="destructive"
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      style={style as ViewStyle}
      size={size}
      icon={icon}
      iconPosition={iconPosition}
    >
      {children}
    </AppButton>
  );
}
