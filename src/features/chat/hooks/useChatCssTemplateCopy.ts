import { useState } from "react";
import { COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE } from "../styles/chatThemeTemplate";

export function useChatCssTemplateCopy(input: { showToast: (message: string) => void }) {
  const [cssTemplateCopied, setCssTemplateCopied] = useState(false);

  const copyCssExampleTemplate = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = COMPACT_CHARACTER_CSS_EXAMPLE_TEMPLATE;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCssTemplateCopied(true);
      input.showToast("CSS 模板已复制，可直接粘贴编辑");
      window.setTimeout(() => setCssTemplateCopied(false), 1500);
    } catch {
      input.showToast("复制失败，请手动选择占位符内容");
    }
  };

  return { cssTemplateCopied, copyCssExampleTemplate };
}
