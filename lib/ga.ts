export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-R9DFYNXWGN";

interface AnalyticsEventParams {
  action: string;
  category?: string;
  label?: string;
  value?: number;
}

export function logEvent(eventParams: AnalyticsEventParams): void {
  if (!isGoogleAnalyticsAvailable()) {
    return;
  }

  sendAnalyticsEvent(eventParams);
}

function isGoogleAnalyticsAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const windowWithGtag = window as any;
  return typeof windowWithGtag.gtag === "function";
}

function sendAnalyticsEvent(eventParams: AnalyticsEventParams): void {
  const windowWithGtag = window as any;

  windowWithGtag.gtag("event", eventParams.action, {
    event_category: eventParams.category,
    event_label: eventParams.label,
    value: eventParams.value,
  });
}