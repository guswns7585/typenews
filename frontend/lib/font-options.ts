import type { FontFamily } from "@/lib/types";

export type FontOption = {
  id: FontFamily;
  label: string;
  labelEn: string;
  family: string;
};

export const FONT_OPTIONS: FontOption[] = [
  {
    id: "pretendard-jp",
    label: "프리텐다드 JP",
    labelEn: "Pretendard JP",
    family: '"Pretendard JP Variable", "Pretendard", sans-serif',
  },
  {
    id: "gowun-batang",
    label: "고운바탕",
    labelEn: "Gowun Batang",
    family: '"Gowun Batang", serif',
  },
  {
    id: "noto-sans-kr",
    label: "Noto Sans KR",
    labelEn: "Noto Sans KR",
    family: '"Noto Sans KR Variable", sans-serif',
  },
  {
    id: "noto-serif-kr",
    label: "Noto Serif KR",
    labelEn: "Noto Serif KR",
    family: '"Noto Serif KR Variable", serif',
  },
  {
    id: "nanum-gothic",
    label: "나눔고딕",
    labelEn: "Nanum Gothic",
    family: '"Nanum Gothic", sans-serif',
  },
  {
    id: "nanum-myeongjo",
    label: "나눔명조",
    labelEn: "Nanum Myeongjo",
    family: '"Nanum Myeongjo", serif',
  },
];

export const FONT_FAMILIES = FONT_OPTIONS.map((option) => option.id);
