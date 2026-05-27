import { useEffect, useState } from "react";

const LOGO_URLS = {
  light:
    "https://pub-7a2c36ac409a4be0a469be59c0e02fd6.r2.dev/images/logo/ai-socratic-logo.png",
  dark:
    "https://pub-7a2c36ac409a4be0a469be59c0e02fd6.r2.dev/images/logo/ai-socratic-logo-dark.png",
} as const;
const FALLBACK_LOGO_URL = LOGO_URLS.light;

type Props = {
  className?: string;
  variant?: keyof typeof LOGO_URLS;
};

export function BrandLogo({ className = "", variant = "light" }: Props) {
  const [src, setSrc] = useState(LOGO_URLS[variant]);

  useEffect(() => {
    setSrc(LOGO_URLS[variant]);
  }, [variant]);

  return (
    <img
      src={src}
      alt="AI Socratic logo"
      className={className}
      onError={() => {
        if (src !== FALLBACK_LOGO_URL) setSrc(FALLBACK_LOGO_URL);
      }}
    />
  );
}
