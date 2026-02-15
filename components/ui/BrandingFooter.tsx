/**
 * BrandingFooter — Reusable "Produced by The Golf Society Hub" footer
 *
 * Used inside all export/share images (PNG, share cards, tee sheet images).
 * Renders a small horizontal logo + tagline at the bottom.
 * Designed to be subtle and never compete with the society's own branding.
 */

import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";

const horizontalLogo = require("@/assets/images/horizontal-logo.png");

type BrandingFooterProps = {
  /** Alignment within the footer row. Default: "center" */
  align?: "center" | "right";
  /** Optional extra top margin. Default: 20 */
  marginTop?: number;
};

export function BrandingFooter({
  align = "center",
  marginTop = 20,
}: BrandingFooterProps) {
  return (
    <View
      style={[
        styles.container,
        { marginTop },
        align === "right" && styles.alignRight,
      ]}
    >
      <Image
        source={horizontalLogo}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.text}>Produced by The Golf Society Hub</Text>
    </View>
  );
}

/**
 * Generates the HTML/CSS snippet for BrandingFooter inside HTML-based exports
 * (PDF via expo-print). Drop this into a <div class="gsh-footer"> at the
 * bottom of the page body.
 */
export function brandingFooterHtml(): string {
  return `<div class="gsh-footer">Produced by The Golf Society Hub</div>`;
}

/** CSS class for the HTML footer. Append once inside <style>. */
export const brandingFooterCss = `
.gsh-footer {
  text-align: center;
  margin-top: 24px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
  font-size: 11px;
  color: #9ca3af;
  font-style: italic;
}
`;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingBottom: 4,
  },
  alignRight: {
    alignItems: "flex-end",
  },
  logo: {
    height: 20,
    aspectRatio: 1500 / 460,
    opacity: 0.7,
    marginBottom: 4,
  },
  text: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
    opacity: 0.85,
  },
});
