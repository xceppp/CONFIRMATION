"use client";

import { usePathname } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="admin-shell flex min-h-screen">
      <AdminNav />
      <main className="min-w-0 flex-1 px-4 pt-16 pb-8 md:px-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}
