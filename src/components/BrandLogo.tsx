import { useState } from "react";

const BRAND_LOGO_URL = "https://aisocratic.org/images/logo/ai-socratic-logo.png";
const FALLBACK_LOGO_URL = `${import.meta.env.BASE_URL}favicon.svg`;

type Props = {
  className?: string;
};

export function BrandLogo({ className = "" }: Props) {
  const [src, setSrc] = useState(BRAND_LOGO_URL);

  return (
    <img
      src={src}
      alt="AI Socratic"
      className={className}
      onError={() => {
        if (src !== FALLBACK_LOGO_URL) setSrc(FALLBACK_LOGO_URL);
      }}
    />
  );
}
