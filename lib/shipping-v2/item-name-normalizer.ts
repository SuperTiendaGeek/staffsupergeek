export function normalizeItemNameFast(rawName: string) {
  return rawName
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(\d+)\s*gb\b/gi, "$1GB")
    .replace(/\b(\d+)\s*tb\b/gi, "$1TB")
    .replace(/\bssd\b/gi, "SSD")
    .replace(/\bhdd\b/gi, "HDD")
    .replace(/\bram\b/gi, "RAM")
    .replace(/\bwin\s*11\b/gi, "Windows 11")
    .replace(/\bwin\s*10\b/gi, "Windows 10")
    .replace(/\bcore\s+i([3579])\b/gi, "Core i$1")
    .replace(/\bi([3579])\b/gi, "Core i$1")
    .replace(/\bCore\s+Core\s+i([3579])\b/g, "Core i$1")
    .replace(/\btouch\b/gi, "Touchscreen");
}
