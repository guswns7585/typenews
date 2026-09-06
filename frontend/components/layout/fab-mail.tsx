import { Mail } from "lucide-react";
import { useUiLanguage } from "@/lib/ui-language";

export function FabMail() {
  const { t } = useUiLanguage();
  return (
    <a
      href="https://mail.google.com/mail/?view=cm&to=typenews902@gmail.com"
      target="_blank"
      rel="noreferrer"
      className="fab icon-btn-circular"
      title={`${t("버그 제보 / 건의사항", "Bug report / feedback")}\ntypenews902@gmail.com`}
    >
      <Mail size={18} />
    </a>
  );
}
