export const GA_MEASUREMENT_ID = "G-R9DFYNXWGN";

type GAEventParams = {
  action: string;
  category?: string;
  label?: string;
  value?: number;
};

export function logEvent({ action, category, label, value }: GAEventParams) {
  if (typeof window === "undefined") return;
  const w = window as any;
  if (typeof w.gtag !== "function") return;

  w.gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}


