const EVENT_NAME = "shippingv2-ficha-print-ready";

let ready = false;

export function markFichaPrintReady() {
  ready = true;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME));
}

export function onFichaPrintReady(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  if (ready) {
    callback();
    return () => {};
  }
  window.addEventListener(EVENT_NAME, callback);
  return () => window.removeEventListener(EVENT_NAME, callback);
}
