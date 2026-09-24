const DO_SPACES_CDN = "https://productionstorage.nyc3.digitaloceanspaces.com";

export function getImageUrl(url: string | null | undefined): string {
  if (!url) return "";

  if (url.startsWith("/objects/uploads/")) {
    const filename = url.replace("/objects/uploads/", "");
    return `${DO_SPACES_CDN}/uploads/${filename}`;
  }

  if (url.startsWith("/uploads/")) {
    const filename = url.replace("/uploads/", "");
    return `${DO_SPACES_CDN}/uploads/${filename}`;
  }

  if (url.includes("productionstorage") && url.includes("digitaloceanspaces.com")) {
    return url;
  }

  return url;
}
