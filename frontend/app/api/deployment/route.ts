export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_TYPENEWS_BUILD_VERSION },
    { headers: { "Cache-Control": "no-store" } },
  );
}
