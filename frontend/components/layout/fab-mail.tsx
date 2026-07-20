import { Mail } from "lucide-react";

export function FabMail() {
  return (
    <a
      href="https://mail.google.com/mail/?view=cm&to=typenews902@gmail.com"
      target="_blank"
      rel="noreferrer"
      className="fab icon-btn-circular"
      title={"버그 제보 / 건의사항\ntypenews902@gmail.com"}
    >
      <Mail size={18} />
    </a>
  );
}
