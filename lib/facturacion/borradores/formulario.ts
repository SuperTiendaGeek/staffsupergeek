export function resolverBorradorInicial(
  borradorIdProp: string | null | undefined,
  borradorIdUrl: string | null
): string | null {
  return borradorIdProp !== undefined ? borradorIdProp : borradorIdUrl;
}
