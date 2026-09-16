export function extractMollieCheckoutUrl(response) {
  if (!response || typeof response !== 'object') return null;
  const checkout = response._links && response._links.checkout;
  if (!checkout || typeof checkout.href !== 'string') return null;
  return checkout.href;
}
