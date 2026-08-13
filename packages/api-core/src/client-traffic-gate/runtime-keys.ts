export function clientTrafficGateRuntimeKeys(clientCode: string) {
  const encodedClientCode = encodeURIComponent(clientCode);
  return {
    cacheKey: `client:traffic-gate:${encodedClientCode}`,
    generationKey: `client:traffic-gate-generation:${encodedClientCode}`,
    mutationKey: `client:traffic-gate-mutation:${encodedClientCode}`,
  };
}
