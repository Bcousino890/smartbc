import { AdminSidebar } from "@/components/admin-sidebar";
import { mockAdmin } from "@/lib/mock-agencies";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-cream-50">
      {/* Soft warm background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,#fbf8f3_0%,#f1e9d6_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -left-40 -top-40 z-0 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,235,190,0.45),transparent_70%)] blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -right-32 bottom-0 z-0 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(201,169,110,0.20),transparent_70%)] blur-3xl"
      />

      <div className="relative z-10">
        <AdminSidebar user={mockAdmin} />
        <main className="ml-[260px] min-h-screen">{children}</main>
      </div>
    </div>
  );
}
