import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { getSocietyLogoDataUri, getSocietyLogoUrl } from "@/lib/societyLogo";

export type PosterLogo = {
  societyId?: string;
  name: string;
  /** Remote URL or base64 data URI for React Native Image. */
  src: string;
};

async function resolveLogoSrc(societyId: string, logoUrl?: string | null): Promise<string | null> {
  const raw = logoUrl?.trim() || null;
  const dataUri = await getSocietyLogoDataUri(societyId, { logoUrl: raw });
  return dataUri ?? raw;
}

/** Load society logos for tee sheet poster header (single or joint event). */
export async function resolveTeeSheetPosterLogos(data: TeeSheetData): Promise<PosterLogo[]> {
  const joint = (data.jointSocieties ?? []).filter((s) => s.societyId?.trim());
  if (joint.length >= 2) {
    const logos = await Promise.all(
      joint.slice(0, 2).map(async (s) => {
        const src = await resolveLogoSrc(s.societyId, s.logoUrl ?? null);
        return src
          ? { societyId: s.societyId, name: s.societyName || s.societyId, src }
          : null;
      }),
    );
    return logos.filter((l): l is PosterLogo => l != null);
  }

  if (data.societyId) {
    const rawLogoUrl = getSocietyLogoUrl({ logo_url: data.logoUrl, logoUrl: data.logoUrl });
    const src = await resolveLogoSrc(data.societyId, rawLogoUrl);
    if (src) {
      return [{ societyId: data.societyId, name: data.societyName, src }];
    }
  }

  const fallbackUrl = getSocietyLogoUrl({ logo_url: data.logoUrl, logoUrl: data.logoUrl });
  if (fallbackUrl) {
    return [{ name: data.societyName, src: fallbackUrl }];
  }

  return [];
}
