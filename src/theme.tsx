import { App as AntApp, ConfigProvider, theme } from "antd";
import { type ReactNode, useEffect, useState } from "react";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

// Follows the OS light/dark setting live.
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(systemPrefersDark);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return dark;
}

// One restrained look: neutral surfaces, a single blue accent, 8px radius, system font.
export function AppProviders({ children }: { children: ReactNode }) {
  const dark = useSystemDark();
  useEffect(() => {
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#2563eb",
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontFamilyCode: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          colorBgLayout: dark ? "#0b0d10" : "#f5f6f8",
        },
        components: {
          Card: { headerFontSize: 15 },
          Layout: {
            headerBg: dark ? "#14171c" : "#ffffff",
            headerHeight: 56,
            headerPadding: "0 16px",
          },
        },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
