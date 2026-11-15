import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /[),.!?;:\]}]+$/;

function safeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function LinkifiedText({ text }: { text: string }) {
  return <>{text.split(URL_PATTERN).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <Fragment key={index}>{part}</Fragment>;
    const trailing = part.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const visibleUrl = trailing ? part.slice(0, -trailing.length) : part;
    const href = safeHttpUrl(visibleUrl);
    if (!href) return <Fragment key={index}>{part}</Fragment>;
    return <Fragment key={index}><a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{visibleUrl}</a>{trailing}</Fragment>;
  })}</>;
}
