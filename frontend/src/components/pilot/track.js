/**
 * Forwards a product event to whichever analytics global the deployment already
 * has. It never loads or registers a provider — if none is present, this is a
 * no-op, which is the intended behaviour for the current build.
 *
 * @param {'pilot_form_started'|'pilot_form_submitted'|'pilot_form_failed'|'pilot_booking_clicked'} event
 * @param {Record<string, string|number|boolean>} [props]
 */
export function track(event, props = {}) {
  try {
    if (typeof window === 'undefined') return;
    if (typeof window.plausible === 'function') window.plausible(event, { props });
    else if (typeof window.gtag === 'function') window.gtag('event', event, props);
    else if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(event, props);
    }
  } catch {
    // Analytics must never break the form.
  }
}

export default track;
