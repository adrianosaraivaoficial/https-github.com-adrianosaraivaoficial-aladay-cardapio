/**
 * Aladay Cardápios Digitais - GA4 Analytics & Privacy Consent Manager
 * Strictly complies with LGPD (Lei Geral de Proteção de Dados - Brasil) and GDPR.
 * No tracking scripts are loaded or cookies set without explicit user consent.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type ConsentStatus = 'granted' | 'denied' | 'pending';

const CONSENT_STORAGE_KEY = 'aladay_cookie_consent_v1';
const GA4_MEASUREMENT_ID = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string) || 'G-ALADAY2025';

let isScriptLoaded = false;

/**
 * Retrieves the current consent state from localStorage
 */
export function getConsentStatus(): ConsentStatus {
  try {
    const val = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (val === 'granted' || val === 'denied') {
      return val;
    }
  } catch {
    // LocalStorage might be restricted
  }
  return 'pending';
}

/**
 * Sets consent status and applies it to GA4 if applicable
 */
export function setConsentStatus(status: 'granted' | 'denied'): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, status);
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('consent', 'update', {
      analytics_storage: status === 'granted' ? 'granted' : 'denied',
      ad_storage: 'denied',
      personalization_storage: 'denied',
    });
  }

  if (status === 'granted') {
    initGA4();
    trackConversionEvent('consent_granted', {
      consent_type: 'analytics',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Initializes GA4 script dynamically only after consent is granted
 */
export function initGA4(): void {
  if (typeof window === 'undefined') return;

  const status = getConsentStatus();
  if (status !== 'granted') {
    // Respect privacy: do not load tracking scripts
    return;
  }

  // Initialize dataLayer and gtag stub if not present
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function () {
      window.dataLayer?.push(arguments);
    };
  }

  // Set default privacy-first consent mode
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  // Inject Google Tag script if not yet injected
  if (!isScriptLoaded && GA4_MEASUREMENT_ID && !document.getElementById('ga4-script')) {
    const script = document.createElement('script');
    script.id = 'ga4-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    script.onload = () => {
      isScriptLoaded = true;
      if (window.gtag) {
        window.gtag('js', new Date());
        window.gtag('config', GA4_MEASUREMENT_ID, {
          send_page_view: true,
          anonymize_ip: true,
          cookie_flags: 'SameSite=None;Secure',
        });
      }
    };
    script.onerror = () => {
      console.warn('[Aladay Analytics] Failed to load GA4 script (possible adblocker).');
    };
    document.head.appendChild(script);
  } else if (window.gtag) {
    window.gtag('config', GA4_MEASUREMENT_ID, {
      send_page_view: true,
      anonymize_ip: true,
    });
  }
}

/**
 * Dispatches a standard conversion or interaction event to GA4
 * Falls back safely if GA4 is disabled, blocked, or not yet consented.
 */
export function trackConversionEvent(
  eventName: string,
  params: Record<string, unknown> = {}
): void {
  const status = getConsentStatus();
  const payload = {
    ...params,
    app_name: 'Aladay Cardápios Digitais',
    consent_status: status,
    event_timestamp: new Date().toISOString(),
  };

  // Safe developer feedback in console
  if (import.meta.env.DEV) {
    console.debug(`[Analytics Event: ${eventName}]`, payload);
  }

  if (status === 'granted' && typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, payload);
  }
}
