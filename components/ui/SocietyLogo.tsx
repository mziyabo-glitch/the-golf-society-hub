/**
 * Society Logo Component
 * Displays society logo with fallback (no cropping)
 */

import { SocietyLogoImage } from "./SocietyLogoImage";

type SocietyLogoProps = {
  logoUrl?: string | null;
  size?: number;
  style?: object;
  placeholderText?: string;
};

export function SocietyLogo({ logoUrl, size = 40, style, placeholderText = "GS" }: SocietyLogoProps) {
  return (
    <SocietyLogoImage
      logoUrl={logoUrl ?? null}
      size={size}
      placeholderText={placeholderText}
      style={style}
    />
  );
}














