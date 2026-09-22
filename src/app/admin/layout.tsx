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
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8">
      <AdminNav />
      {children}
    </main>
  );
}
