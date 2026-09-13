export const BRAND_LOGO_URL = `${import.meta.env.BASE_URL}brand/drumup-logo.png`;

/** Original PNG, unchanged. Only its transparent canvas margins are clipped. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`}>
    <img src={BRAND_LOGO_URL} width="842" height="596" alt="DRUM UP" draggable={false} />
  </span>;
}
