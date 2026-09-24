import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

const SCRIPT_ID = "signsuiteiq-app-switcher-script";
const HOST_ID = "signsuiteiq-app-switcher-host";

/**
 * Injects the SignSuiteIQ app-switcher widget (the 3x3 grid icon that lets a
 * signed-in user hop to other SignSuite products without re-logging in).
 *
 * Renders into the in-app header slot (`#signsuiteiq-app-switcher-host`,
 * which lives inside <AppHeader />). We pass several common mount-attribute
 * names so the third-party script can pick whichever it supports. As a
 * safety net we also watch <body> with a MutationObserver — if the script
 * ignores the mount hint and appends its widget container directly to body,
 * we move it into the header host so it shows up next to the theme toggle
 * instead of as a floating top-right icon.
 *
 * Token comes from the SignSuiteIQ SSO exchange, captured server-side on
 * /sso/callback and surfaced via /api/auth/me. See server/routes.ts.
 */
export function SignSuiteIqAppSwitcher() {
  const { user, signsuiteiqWidgetToken } = useAuth();

  useEffect(() => {
    if (!user || !signsuiteiqWidgetToken) {
      removeWidget();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing && existing.dataset.token === signsuiteiqWidgetToken) {
      return;
    }
    removeWidget();

    const mountSelector = `#${HOST_ID}`;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://signsuiteiq.ai/widget/app-switcher.js";
    script.defer = true;
    script.dataset.apiBase = "https://signsuiteiq.ai";
    script.dataset.token = signsuiteiqWidgetToken;
    // Pass mount hints under several common attribute names so whichever
    // one the widget supports will work.
    script.dataset.mount = mountSelector;
    script.dataset.target = mountSelector;
    script.dataset.container = mountSelector;
    script.dataset.position = "inline";
    document.body.appendChild(script);

    // Fallback: if the widget appends itself to body anyway, relocate it
    // into the header host the first time we see it.
    const observer = new MutationObserver(() => {
      const host = document.getElementById(HOST_ID);
      if (!host) return;
      const candidates = document.querySelectorAll<HTMLElement>(
        "[data-signsuiteiq-app-switcher], [data-signsuite-app-switcher], signsuiteiq-app-switcher",
      );
      candidates.forEach((el) => {
        if (!host.contains(el) && el.parentElement !== host) {
          host.appendChild(el);
          // Strip fixed-positioning that the floating mode might apply.
          el.style.position = "static";
          el.style.top = "";
          el.style.right = "";
          el.style.bottom = "";
          el.style.left = "";
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [user, signsuiteiqWidgetToken]);

  return null;
}

function removeWidget() {
  const script = document.getElementById(SCRIPT_ID);
  if (script) script.remove();
  document
    .querySelectorAll(
      "[data-signsuiteiq-app-switcher], [data-signsuite-app-switcher], signsuiteiq-app-switcher",
    )
    .forEach((el) => el.remove());
  const host = document.getElementById(HOST_ID);
  if (host) host.innerHTML = "";
}
