const BRAND_LOGO_URL = "https://aisocratic.org/images/logo/ai-socratic-logo.png";

type Props = {
  className?: string;
};

export function BrandLogo({ className = "" }: Props) {
  return <img src={BRAND_LOGO_URL} alt="AI Socratic" className={className} />;
}
