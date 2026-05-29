import { MessageCircle, Radar, ShieldAlert, Zap } from "lucide-react";

export type Tab = "radar" | "feed" | "chat" | "admin";

const MAIN_TABS: { id: Tab; label: string; icon: typeof Radar }[] = [
  { id: "radar", label: "Radar", icon: Radar },
  { id: "feed", label: "Feed", icon: Zap },
  { id: "chat", label: "Megáfono", icon: MessageCircle },
];

const ADMIN_TAB: { id: Tab; label: string; icon: typeof Radar } = {
  id: "admin",
  label: "Control",
  icon: ShieldAlert,
};

export function BottomNav({
  active,
  onChange,
  disabled,
  showAdmin,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  disabled?: boolean;
  showAdmin?: boolean;
}) {
  const tabs = showAdmin ? [...MAIN_TABS, ADMIN_TAB] : MAIN_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-border pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-stretch justify-around">
        {tabs.map((t) => {
          const isActive = active === t.id;
          const isDisabled = disabled && t.id !== "radar" && t.id !== "admin";
          const isAdminTab = t.id === "admin";
          const Icon = t.icon;
          return (
            <li key={t.id} className="flex-1">
              <button
                disabled={isDisabled}
                onClick={() => onChange(t.id)}
                className="relative flex w-full flex-col items-center gap-0.5 px-2 py-2.5 disabled:opacity-30"
              >
                {isActive && (
                  <span
                    className="absolute top-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full shadow-glow"
                    style={{
                      background: isAdminTab ? "var(--danger)" : "var(--neon)",
                    }}
                  />
                )}
                <Icon
                  className={`h-5 w-5 ${
                    isAdminTab
                      ? isActive
                        ? "text-[var(--danger)]"
                        : "text-[var(--danger)]/60"
                      : isActive
                      ? "text-[var(--neon)]"
                      : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    isAdminTab
                      ? isActive
                        ? "text-[var(--danger)]"
                        : "text-[var(--danger)]/60"
                      : isActive
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {t.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
