// Running inside the Android app (Capacitor shell) instead of a browser?
// Native plugins are reached through window.Capacitor.Plugins (no bundler needed).

/** @returns {any|null} */
const cap = () => /** @type {any} */ (window).Capacitor || null;

export const isNative = () => !!cap()?.isNativePlatform?.();

/** A native plugin by name, or null in the browser / if not installed. */
export function plugin(name) {
  return isNative() ? cap()?.Plugins?.[name] || null : null;
}
