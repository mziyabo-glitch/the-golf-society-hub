import { supabase } from "@/lib/supabase";
import { imageUrlToBase64DataUri } from "@/lib/pdf/imageUtils";

export const SOCIETY_LOGO_BUCKET = "society-logos";

export type LogoDiagnostics = {
  societyId: string;
  logoUrl: string | null;
  status: "ok" | "missing" | "error";
  source: "cache" | "storage" | "public_url" | "missing" | "error";
  fetchedAt: string;
  dataUriBytes?: number;
  bucket?: string;
  path?: string;
  error?: string;
};

type LogoCacheEntry = {
  dataUri: string | null;
  logoUrl: string | null;
  fetchedAt: number;
};

const logoCache = new Map<string, LogoCacheEntry>();
const logoDiagnostics = new Map<string, LogoDiagnostics>();

export function getSocietyLogoUrl(society: any | null | undefined): string | null {
  if (!society) return null;
  const raw = (society as any).logo_url ?? (society as any).logoUrl ?? null;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function clearSocietyLogoCache(societyId?: string): void {
  if (!societyId) {
    logoCache.clear();
    logoDiagnostics.clear();
    return;
  }
  logoCache.delete(societyId);
  logoDiagnostics.delete(societyId);
}

export function getSocietyLogoDiagnostics(societyId: string): LogoDiagnostics | null {
  return logoDiagnostics.get(societyId) ?? null;
}

export function logSocietyLogoDiagnostics(societyId: string): void {
  const diagnostics = logoDiagnostics.get(societyId);
  if (!diagnostics) {
    console.log("[societyLogo] No diagnostics available for society:", societyId);
    return;
  }
  console.log("[societyLogo] Diagnostics:", diagnostics);
}

async function fetchSocietyLogoUrl(societyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("societies")
    .select("logo_url")
    .eq("id", societyId)
    .maybeSingle();

  if (error) {
    console.warn("[societyLogo] Failed to load logo_url:", {
      societyId,
      message: error.message,
      code: error.code,
    });
    return null;
  }

  const logoUrl = data?.logo_url ?? null;
  if (!logoUrl || typeof logoUrl !== "string") return null;
  return logoUrl.trim() || null;
}

function extractStorageLocation(logoUrl: string): { bucket: string; path: string } | null {
  try {
    const match = logoUrl.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)/);
    if (!match) return null;
    const bucket = match[1];
    const path = match[2].split("?")[0];
    return { bucket, path: decodeURIComponent(path) };
  } catch {
    return null;
  }
}

function blobToDataUri(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

export async function getSocietyLogoDataUri(
  societyId: string,
  options?: {
    logoUrl?: string | null;
    forceRefresh?: boolean;
  }
): Promise<string | null> {
  if (!societyId) return null;

  const cached = logoCache.get(societyId);
  const cacheMatchesUrl =
    cached?.logoUrl && options?.logoUrl && cached.logoUrl === options.logoUrl;

  if (cached && !options?.forceRefresh && (!options?.logoUrl || cacheMatchesUrl)) {
    logoDiagnostics.set(societyId, {
      societyId,
      logoUrl: cached.logoUrl,
      status: cached.dataUri ? "ok" : "error",
      source: "cache",
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
      dataUriBytes: cached.dataUri ? cached.dataUri.length : 0,
    });
    return cached.dataUri;
  }

  const logoUrl = options?.logoUrl ?? (await fetchSocietyLogoUrl(societyId));
  if (!logoUrl) {
    const diagnostics: LogoDiagnostics = {
      societyId,
      logoUrl: null,
      status: "missing",
      source: "missing",
      fetchedAt: new Date().toISOString(),
    };
    logoCache.set(societyId, { dataUri: null, logoUrl: null, fetchedAt: Date.now() });
    logoDiagnostics.set(societyId, diagnostics);
    console.warn("[societyLogo] Logo URL missing:", diagnostics);
    return null;
  }

  if (logoUrl.startsWith("data:")) {
    logoCache.set(societyId, { dataUri: logoUrl, logoUrl, fetchedAt: Date.now() });
    logoDiagnostics.set(societyId, {
      societyId,
      logoUrl,
      status: "ok",
      source: "public_url",
      fetchedAt: new Date().toISOString(),
      dataUriBytes: logoUrl.length,
    });
    return logoUrl;
  }

  let dataUri: string | null = null;
  let source: LogoDiagnostics["source"] = "public_url";
  let error: string | undefined;
  let bucket: string | undefined;
  let path: string | undefined;

  const storageLocation = extractStorageLocation(logoUrl);
  if (storageLocation) {
    bucket = storageLocation.bucket;
    path = storageLocation.path;
    const { data, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path);

    if (downloadError) {
      error = `storage_download: ${downloadError.message || "unknown error"}`;
    } else if (data) {
      dataUri = await blobToDataUri(data);
      if (dataUri) {
        source = "storage";
      } else {
        error = "storage_download: failed to convert blob to base64";
      }
    }
  }

  if (!dataUri) {
    const fetched = await imageUrlToBase64DataUri(logoUrl);
    if (fetched) {
      dataUri = fetched;
      source = "public_url";
    } else if (!error) {
      error = "public_url_fetch_failed";
    }
  }

  const diagnostics: LogoDiagnostics = {
    societyId,
    logoUrl,
    status: dataUri ? "ok" : "error",
    source: dataUri ? source : "error",
    fetchedAt: new Date().toISOString(),
    dataUriBytes: dataUri ? dataUri.length : 0,
    bucket,
    path,
    error,
  };

  logoCache.set(societyId, { dataUri, logoUrl, fetchedAt: Date.now() });
  logoDiagnostics.set(societyId, diagnostics);

  if (dataUri) {
    console.log("[societyLogo] Logo data URI ready:", {
      societyId,
      source,
      bytes: dataUri.length,
    });
  } else {
    console.warn("[societyLogo] Logo data URI missing:", diagnostics);
  }

  return dataUri;
}
