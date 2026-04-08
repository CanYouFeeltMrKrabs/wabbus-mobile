const TEMPLATES: Record<string, string> = {
  usps: "https://tools.usps.com/go/TrackConfirmAction?tLabels=%s",
  ups: "https://www.ups.com/track?tracknum=%s",
  "ups heavyweight": "https://www.ups.com/track?tracknum=%s",
  fedex: "https://www.fedex.com/fedextrack/?tracknumbers=%s",
  "fedex freight": "https://www.fedex.com/fedextrack/?tracknumbers=%s",
  "dhl express": "https://www.dhl.com/en/express/tracking.html?brand=DHL&AWB=%s",
  "dhl heavyweight": "https://www.dhl.com/en/express/tracking.html?brand=DHL&AWB=%s",
  "dhl ecommerce": "https://ecommerceportal.dhl.com/track?trackingnumber=%s",
  ontrac: "https://www.ontrac.com/tracking/?number=%s",
  lasership: "https://www.ontrac.com/tracking/?number=%s",
  tforce: "https://www.tforce.com/tools/tracking?trackingNumbers=%s",
  veho: "https://tracking.veho.com/%s",
  "spee-dee delivery": "https://packages.speedeedelivery.com/packages/track?trackingNumber=%s",
  "amazon shipping + amazon mcf": "https://track.amazon.com/tracking/%s",
};

function normalizeKey(carrier: string): string {
  return carrier
    .toLowerCase()
    .replace(/[^a-z0-9 +\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PATTERN_CHECKS: [RegExp, string][] = [
  [/^1Z[A-Z0-9]{16}$/, "ups"],
  [/^[AHJKTV]\d{10}$/, "ups"],
  [/^96\d{20}$/, "fedex"],
  [/^10\d{31,32}$/, "fedex"],
  [/^420\d{27}$/, "usps"],
  [/^9[2-5]\d{20}$/, "usps"],
  [/^[7-8][1-9]\d{18}$/, "usps"],
  [/^(GM|LX|RX|UV|CN|SG|TH|IN|HK|MY)[0-9A-Z]{10,39}$/, "dhl ecommerce"],
  [/^[CD]\d{14}$/, "ontrac"],
  [/^TB[ACM]\d{12}$/, "amazon shipping + amazon mcf"],
  [/^\d{12}$/, "fedex"],
  [/^\d{15}$/, "fedex"],
];

export function buildCarrierTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!trackingNumber?.trim()) return null;
  const cleaned = trackingNumber.replace(/[\s\-]/g, "").toUpperCase();
  let template = carrier ? TEMPLATES[normalizeKey(carrier)] ?? null : null;
  if (!template) {
    for (const [regex, key] of PATTERN_CHECKS) {
      if (regex.test(cleaned)) {
        template = TEMPLATES[key] ?? null;
        break;
      }
    }
  }
  if (!template) return null;
  return template.replace("%s", encodeURIComponent(cleaned));
}
