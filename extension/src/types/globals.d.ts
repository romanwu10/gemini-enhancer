export {};

declare global {
  interface Window {
    __GEMINI_ENHANCER_ACTIVE__?: boolean;
  }

  // Firefox-style WebExtensions global; we only need a loose type.
  const browser: any;
}

