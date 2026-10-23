import type { Messages } from "@/i18n/messages";
import type { AppLanguage } from "@/lib/appLanguage";

// Type-checks every t("…") key against messages/en-IN.json.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLanguage;
    Messages: Messages;
  }
}
