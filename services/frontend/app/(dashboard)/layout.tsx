import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { TaskBar } from "@/components/layout/TaskBar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">{children}</div>
      </div>
      <TaskBar />
    </AuthGuard>
  );
}
