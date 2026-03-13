// Admin area layout — wraps all /admin/* pages
import { AdminLayout } from "@/components/AdminLayout";

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayout>{children}</AdminLayout>;
}
