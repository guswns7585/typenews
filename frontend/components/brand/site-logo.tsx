"use client";

type SiteLogoProps = {
  onClick?: () => void;
  clicked?: boolean;
};

export function SiteLogo({ onClick, clicked }: SiteLogoProps) {
  return (
    <h1
      id="site-title"
      className={`logo-mark${clicked ? " clicked" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick?.();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/newtypenewslogo.svg" alt="Type News" width={280} height={90} draggable={false} />
    </h1>
  );
}
