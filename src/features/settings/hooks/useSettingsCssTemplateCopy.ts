import { useCallback, type Dispatch, type SetStateAction } from "react";

interface UseSettingsCssTemplateCopyOptions {
  template: string;
  setCopied: Dispatch<SetStateAction<boolean>>;
}

/** Copies the scoped chat CSS example with a clipboard fallback for older browsers. */
export function useSettingsCssTemplateCopy({ template, setCopied }: UseSettingsCssTemplateCopyOptions) {
  const copyGlobalChatCssTemplate = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(template);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = template;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("复制失败，请手动复制输入框中的模板。");
    }
  }, [setCopied, template]);

  return { copyGlobalChatCssTemplate };
}
