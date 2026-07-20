# Type News Frontend

Next.js App Router, Tailwind CSS, Zustand, Supabase 기반 신규 프론트엔드입니다. 기존 `../public/` 앱은 전환 완료 전까지 유지합니다.

## 시작

```powershell
npm install
npm run dev
```

`.env.local`에 아래 값을 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://uptiosdwlopvrjbkyslp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 구조

- `app/`: 라우트와 Route Handler
- `components/`: 화면 단위 UI
- `features/`: 프레임워크 독립 도메인 로직
- `stores/`: Zustand 클라이언트 상태
- `lib/`: Supabase와 공통 타입

빌드 전 `npm run lint`, `npm run build`를 실행합니다.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
