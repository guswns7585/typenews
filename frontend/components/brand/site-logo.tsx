"use client";

import { LogoMark } from "@/components/brand/logo-mark";

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
      {/* 인라인 SVG라 커스텀 배경의 글자·버튼 색이 로고에도 그대로 반영된다. */}
      <LogoMark className="site-logo-svg" />
    </h1>
  );
}
